#!/usr/bin/env node
// /input-ltkdb の変換: LTKDB(非公式のファンサイト LTK Schedule & Status)の site-data.json から、
// 名簿の階級チーム同士のスクリムを docs/research/grounds/scrims/、日程と一致した本番を docs/research/grounds/results/ へ
// F-004 の記録(配列形)として書き出す。生成 AI を使わない機械の変換。受入基準は specs/F-004/spec.md の 31〜38
//
//   node .claude/skills/input-ltkdb/reference/ltkdb-to-scrims.mjs [--in <site-data.json>] [--root <置き場の親>] [--champions <champions.json>] [--dry-run]
//
// --in を省けば LTKDB のリポジトリの site-data.json を取りに行く。--root の既定は docs/research/grounds(scrims/ と results/ を持つ)。
// --champions を省けば data/public/champions.json、無ければ Data Dragon ja_JP から取る(基準 35)。
// 終了コード: 0 = 変更なし、10 = 書いたファイルか置き換えがある、1 = 取得か読み取りの失敗。出力の最後の行は JSON の要約(基準 38)。
// テストは convert を読み込んで呼ぶ(tests/results/ltkdb-convert.test.ts)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchDataDragon } from '../../../../src/collect/ddragon.ts';
import { ROSTER } from '../../../../src/data/roster.ts';
import { readChampionList } from '../../../../src/results/champions.ts';
import { collectResults, formatResultError, parseDuration } from '../../../../src/results/load.ts';
import { MASTERS_CUPS, REGULAR_DAYS } from '../../../../src/sim/schedule.ts';

const SITE = 'https://demo-lab0110.github.io/ltk-schedule-status-site/';
const DATA = 'https://raw.githubusercontent.com/demo-lab0110/ltk-schedule-status-site/main/site-data.json';
const CHAMPIONS = 'data/public/champions.json';
const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];
const TIERS = ['NEXT', 'CORE', 'MASTERS'];
/** LTKDB の予定の Playoffs の match_no → マッチと日付(基準 3 の日付) */
const PLAYOFFS = { 1: ['upperFinal', '2026-11-21'], 2: ['lowerSemi', '2026-11-21'], 3: ['lowerFinal', '2026-11-22'], 4: ['grandFinal', '2026-11-22'] };
/** 14 分の CS の計測秒の範囲(基準 25) */
const CS14_SEC = [780, 900];

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const intOf = (v) => (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v.trim())) ? (Number.isInteger(Number(v)) ? Number(v) : null) : null);
/** 名前の照合: 大文字と小文字、NFKC で消える違いは同じとみなす(基準 36) */
const norm = (s) => String(s ?? '').normalize('NFKC').toLowerCase().trim();
const seatKey = (team, tier, role) => `${team}|${tier}|${role}`;
const roster = new Map(ROSTER.map((p) => [seatKey(p.team, p.tier, p.role), p]));

/** 席(チーム・階級・ロール)の選手の名前: 名簿の名前、Riot ID のゲーム名、LTKDB の選手プロフィールの名前 */
function seatNamesOf(sheets) {
  const keyOf = new Map((sheets['サイト_チームマスタ'] ?? []).map((t) => [t.team_name, t.team_key]));
  const names = new Map();
  const add = (k, n) => n && names.set(k, (names.get(k) ?? new Set()).add(norm(n)));
  for (const p of ROSTER) {
    add(seatKey(p.team, p.tier, p.role), p.name);
    add(seatKey(p.team, p.tier, p.role), p.riotId?.split('#')[0]);
  }
  for (const p of sheets['サイト_選手プロフィール'] ?? []) add(seatKey(keyOf.get(p['チーム名']) ?? p['チーム名'], String(p['階級']).toUpperCase(), p['ロール']), p['名前']);
  return names;
}

/** LTKDB の選手の行の「プレイヤー名」か「サモナーネーム」(# の前)が、その席の名前のどれかと一致するか(基準 36) */
const nameFits = (seatNames, team, tier, r) => {
  const names = seatNames.get(seatKey(team, tier, r['ロール']));
  return Boolean(names) && [r['プレイヤー名'], String(r['サモナーネーム'] ?? '').split('#')[0]].some((n) => n && names.has(norm(n)));
};

/** チャンピオン名(基準 35): 一覧に無く、NFKC がただ 1 つの一覧の名前の NFKC と一致すれば一覧の表記に置き換える(例: ジャーヴァンIV → ジャーヴァンⅣ) */
export function normalizeChampion(name, list) {
  if (!name || list.names.has(name)) return name || null;
  const hits = [...list.names].filter((n) => n.normalize('NFKC') === name.normalize('NFKC'));
  return hits.length === 1 ? hits[0] : name;
}

/** 既存の記録(scrims/ と results/)。同じ試合の判定に使う */
function existingRecords(root) {
  const out = [];
  for (const dir of ['scrims', 'results']) {
    const path = join(root, dir);
    if (!existsSync(path)) continue;
    for (const f of readdirSync(path).filter((x) => x.endsWith('.json')).sort()) {
      const recs = JSON.parse(readFileSync(join(path, f), 'utf8'));
      if (!Array.isArray(recs)) continue;
      recs.forEach((r, i) => {
        const teams = Object.keys(r.teams ?? {}).sort().join('|');
        out.push({ file: `${dir}/${f}`, index: i, where: `${dir}/${f}[${i}]`, r, teams, sec: parseDuration(r.duration), ltkdbMatchId: r.source?.ltkdbMatchId ?? null });
      });
    }
  }
  return out;
}

/** 本番の行を公式の日程と突き合わせる(基準 31 の (a)〜(c))。決まれば { tier, stage, day, match }、決まらなければ { reason }。3 位決定戦と決勝は pending */
function placeOfficial(m, rows, schedule, seatNames) {
  const sched = schedule.find((x) => x.schedule_id === m['スケジュールID']);
  if (!sched) return { reason: `スケジュールID ${m['スケジュールID'] || '(空)'} が LTKDB の予定に無い` };
  const teams = [m['チーム1名'], m['チーム2名']];
  let tier = String(sched.tier ?? '').toUpperCase();
  if (tier && !TIERS.includes(tier)) return { reason: `予定の tier ${sched.tier} が読めない` };
  if (!tier) {
    const fits = rows.length === 10 ? TIERS.filter((t) => rows.every((r) => nameFits(seatNames, r['チーム名'], t, r))) : [];
    if (fits.length !== 1) return { reason: `階級が決まらない(予定の tier が空で、選手の行 ${rows.length} 行の名前が名簿のちょうど 1 つの階級の席と一致しない)` };
    tier = fits[0];
  }
  const date = m['試合日'];
  const same = (pair) => pair.length === 2 && teams.every((t) => pair.includes(t));
  let place = null;
  const day = REGULAR_DAYS.find((d) => d.date === date);
  const cup = MASTERS_CUPS.find((c) => c.date === date);
  if (day && tier !== 'MASTERS') {
    const card = day.cards.find((c) => same([c.blue, c.red]));
    if (card) place = { stage: 'regular', day: day.day, match: null, blue: card.blue, red: card.red };
  } else if (cup && tier === 'MASTERS') {
    const i = cup.semis.findIndex((p) => same(p));
    if (i >= 0) place = { stage: 'masters', day: cup.cup, match: `semi${i + 1}` };
    else if (teams.some((t) => cup.semis[0].includes(t)) && teams.some((t) => cup.semis[1].includes(t))) {
      const match = { 3: 'third', 4: 'final' }[intOf(sched.match_no)];
      if (!match) return { reason: `予定の match_no ${sched.match_no} が 3 位決定戦(3)・決勝(4)のどちらでもない` };
      place = { stage: 'masters', day: cup.cup, match, pending: true };
    }
  } else if (Object.values(PLAYOFFS).some(([, d]) => d === date)) {
    const po = PLAYOFFS[intOf(sched.match_no)];
    if (!po || po[1] !== date) return { reason: `予定の match_no ${sched.match_no} の Playoffs のマッチの日付が試合日 ${date} と合わない` };
    place = { stage: 'playoffs', day: null, match: po[0] };
  }
  if (!place) return { reason: `試合日 ${date}・階級 ${tier}・${teams.join(' 対 ')} が公式の日程の試合に一致しない` };
  if (sched.stage && String(sched.stage).toLowerCase() !== place.stage) return { reason: `予定の stage ${sched.stage} が日程の試合(${place.stage})と食い違う` };
  return { tier, ...place };
}

/** 3 位決定戦と決勝: 同じ回の準決勝 2 試合の勝敗(置き場の記録と、この実行で書く記録)と match_no が合う場合だけ決める */
function settleFinals(item, semis) {
  const s = [1, 2].map((i) => semis.get(`${item.place.day}|semi${i}`));
  if (!s[0] || !s[1]) return `第 ${item.place.day} 回の準決勝 2 試合の記録が無く、${item.place.match} を決められない`;
  const want = item.place.match === 'final' ? s.map((x) => x.winner) : s.map((x) => x.loser);
  const teams = [item.m['チーム1名'], item.m['チーム2名']];
  return teams.every((t) => want.includes(t)) ? null : `予定の match_no(${item.place.match})と準決勝の勝敗(${item.place.match === 'final' ? '勝者' : '敗者'}は ${want.join('・')})が合わない`;
}

/** champions は champions.json の中身(必須。読めなければ例外。基準 35) */
export function convert(site, { root = 'docs/research/grounds', dryRun = false, today = new Date().toISOString().slice(0, 10), collectedWith = process.env.COLLECTED_WITH ?? 'ltkdb-to-scrims.mjs', champions: championsRaw } = {}) {
  const { list: champions, error } = readChampionList(championsRaw);
  if (!champions) throw new Error(`チャンピオンの一覧を読めない: ${error}`);
  const s = site.sheets;
  const schedule = s['サイト_予定'] ?? [];
  const seatNames = seatNamesOf(s);
  const existing = existingRecords(root);
  const summary = { written: [], replaced: [], resultOnly: [], skipped: { official: [], scrim: [] }, corrections: [], unconfirmed: [], listeners: 0, updatedAt: site.updatedAt };
  const skipOfficial = (item, reason) => summary.skipped.official.push({ n: item.n, id: item.id, date: item.m['試合日'], teams: [item.m['チーム1名'], item.m['チーム2名']], winner: item.m['勝利チーム'], reason });
  const items = [];
  s['対戦結果まとめ'].forEach((m, n) => {
    const id = m['試合ID'];
    const kind = m['スクリム/本番'] === '本番' ? 'official' : 'scrim';
    const item = { n, id, m, kind, rows: s['リザルト詳細'].filter((r) => r['試合ID'] === id) };
    const skip = (reason) => (kind === 'official' ? skipOfficial(item, reason) : summary.skipped.scrim.push({ id, reason }));
    if (/LISTENERS/.test(id) || m['チーム1名'] === 'リスナー' || m['チーム2名'] === 'リスナー') return void (summary.listeners += 1); // F-004 決定 D2
    if (m['スクリム/本番'] !== '本番' && m['スクリム/本番'] !== 'スクリム') return skip(`スクリム/本番 が「${m['スクリム/本番']}」`);
    if (m['確認状態'] !== '承認済') return skip(`確認状態が「${m['確認状態']}」`);
    item.game = intOf(m['試合番号']);
    if (!item.game || item.game < 1) return skip(`試合番号 ${m['試合番号']} が 1 以上の整数でない`);
    if (item.rows.length > 10) return skip(`選手の行が ${item.rows.length} 行(10 を超える)`);
    item.resultOnly = item.rows.length < 10 || m['試合時間'] === ''; // 基準 33
    if (kind === 'scrim') {
      const tier = id.split('_')[2];
      if (!TIERS.includes(tier)) return skip(`階級が読めない(${tier})`);
      if (![m['チーム1名'], m['チーム2名']].every((t) => roster.has(seatKey(t, tier, 'TOP')))) return skip(`名簿の階級チーム同士でない(${m['チーム1名']}・${m['チーム2名']})`);
      item.place = { tier };
    } else {
      const p = placeOfficial(m, item.rows, schedule, seatNames);
      if (p.reason) return skip(p.reason);
      item.place = p;
    }
    items.push(item);
  });

  // 3 位決定戦と決勝(基準 31): 置き場とこの実行の準決勝の勝敗から決める
  const semis = new Map();
  for (const e of existing) if (e.r.kind === 'official' && e.r.stage === 'masters' && /^semi/.test(e.r.match ?? '')) {
    const ts = Object.keys(e.r.teams ?? {}).map((t) => t.split(' ')[0]);
    const w = String(e.r.winner).split(' ')[0];
    semis.set(`${e.r.day}|${e.r.match}`, { winner: w, loser: ts.find((t) => t !== w) });
  }
  for (const x of items) if (x.kind === 'official' && /^semi/.test(x.place.match ?? '')) {
    const w = x.m['勝利チーム'];
    semis.set(`${x.place.day}|${x.place.match}`, { winner: w, loser: [x.m['チーム1名'], x.m['チーム2名']].find((t) => t !== w) });
  }
  const placed = items.filter((x) => {
    if (!x.place.pending) return true;
    const reason = settleFinals(x, semis);
    if (reason) skipOfficial(x, reason);
    return !reason;
  });

  // 同じ試合 ID になる本番の行が 2 件以上あれば、どれも書かない(基準 32)
  const matchIdOf = (x) => x.place.stage === 'regular' ? `RS-${x.place.day}-${x.place.blue}-${x.place.red}-${x.place.tier}`
    : x.place.stage === 'masters' ? `MC${x.place.day}-${x.place.match}-G${x.game}` : `PO-${x.place.match}-G${x.game}`;
  const byMatch = new Map();
  for (const x of placed) if (x.kind === 'official') byMatch.set(matchIdOf(x), [...(byMatch.get(matchIdOf(x)) ?? []), x]);
  const skipOf = (x, reason) => (x.kind === 'official' ? skipOfficial(x, reason) : summary.skipped.scrim.push({ id: x.id, reason }));
  const replaces = [];
  const groups = new Map();
  for (const x of placed) {
    const { m, id, kind, place: { tier } } = x;
    if (kind === 'official' && byMatch.get(matchIdOf(x)).length > 1) {
      skipOf(x, `同じ試合 ID ${matchIdOf(x)} になる本番の行が ${byMatch.get(matchIdOf(x)).length} 件(${byMatch.get(matchIdOf(x)).map((y) => y.id).join('・')})`);
      continue;
    }
    const sec = x.resultOnly ? null : Math.round(Number(m['試合時間']) * 60);
    const teamsKey = [m['チーム1名'], m['チーム2名']].map((t) => `${t} ${tier}`).sort().join('|');
    let rec = null;
    let error = null;
    try {
      rec = x.resultOnly ? resultOnlyRecord(x, collectedWith, today, site.updatedAt) : toRecord(x, sec, collectedWith, today, site.updatedAt, seatNames, champions);
    } catch (e) {
      error = e.message;
    }
    // 基準 34: 置き場に同じ試合があれば足さない。結果だけの記録 1 件で勝者が一致すれば、選手の行を持つ記録で置き換える
    const same = existing.filter((e) => sameAs(e, x, sec, teamsKey));
    if (same.length) {
      const [one] = same;
      if (same.length === 1 && one.r.resultOnly && rec && !rec.resultOnly && one.r.winner === rec.winner) {
        replaces.push({ file: one.file, index: one.index, rec, x });
        continue;
      }
      let cand = rec;
      if (!cand) try { cand = { winner: winnerOf(x) }; } catch { cand = null; }
      if (cand) for (const e of same) for (const c of correctionsOf(e.r, cand)) summary.corrections.push({ id, where: e.where, ...c });
      skipOf(x, `既存の記録 ${same.map((e) => e.where).join('・')} と同じ試合`);
      continue;
    }
    if (!rec) {
      skipOf(x, error);
      continue;
    }
    const [a, b] = [m['チーム1名'], m['チーム2名']].map((t) => t.toLowerCase()).sort();
    const file = `${kind === 'official' ? 'results' : 'scrims'}/${m['試合日']}-${a}-${tier.toLowerCase()}-vs-${b}-${tier.toLowerCase()}.json`;
    if (!groups.has(file)) groups.set(file, []);
    groups.get(file).push({ file, index: null, rec, x });
  }
  // 基準 35: 書く前に置き場と合わせて検証し、反した試合を隔離して残りを書く。同じ日・同じ組のファイルが既にあれば後ろに足す(要素の順 = 試合の番号の順)
  const changes = [...replaces, ...[...groups.values()].flatMap((list) => list.sort((p, q) => p.x.game - q.x.game))];
  const { accepted, rejected, files } = validateWrites(root, changes, champions);
  for (const { change, problems } of rejected) skipOf(change.x, `書く前の検証に反した: ${problems.join('、')}`);
  for (const c of accepted) {
    if (c.index === null) {
      const w = summary.written.find((y) => y.file === c.file);
      if (w) w.added.push(c.x.id);
      else summary.written.push({ file: c.file, added: [c.x.id] });
    } else summary.replaced.push({ file: c.file, index: c.index, id: c.x.id });
    if (c.rec.resultOnly) summary.resultOnly.push(c.x.id);
    summary.unconfirmed.push(...(c.x.unconfirmed ?? []));
  }
  if (!dryRun) {
    for (const file of new Set(accepted.map((c) => c.file))) {
      const path = join(root, file);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, JSON.stringify(files.get(file).raw, null, 2) + '\n');
    }
  }
  summary.skipped.official = summary.skipped.official.sort((p, q) => p.n - q.n).map(({ n, ...rest }) => rest);
  return summary;
}

/**
 * 同じ試合(用語)か。(a) どちらも ltkdbMatchId を持てば値の一致だけで決める。(b) kind・date・2 つの階級チームが同じで、本番は試合 ID、スクリムは game が同じ。
 * 基準 34: 加えて、置き場の選手の行を持つスクリムで 2 つの階級チームが同じで試合時間の差が 1 秒以内の記録(配信からの書き起こし)
 */
function sameAs(e, x, sec, teamsKey) {
  if (e.ltkdbMatchId) return e.ltkdbMatchId === x.id;
  const { r } = e;
  if (r.kind === x.kind && r.date === x.m['試合日'] && e.teams === teamsKey && (x.kind === 'official'
    ? r.stage === x.place.stage && r.day === x.place.day && r.match === x.place.match && r.game === x.game
    : r.game != null && r.game === x.game)) return true;
  return x.kind === 'scrim' && r.kind === 'scrim' && !r.resultOnly && e.teams === teamsKey && e.sec !== null && sec !== null && Math.abs(e.sec - sec) <= 1;
}

const COMPARED = ['kills', 'deaths', 'assists', 'gold', 'damage', 'champion', 'cs14'];
const hasPlayers = (r) => !r.resultOnly && Object.values(r.teams ?? {}).some((t) => t.players?.length);

/**
 * 訂正の候補(基準 34): 置き場の記録 stored と、LTKDB の現在の値から作った記録 cand の食い違い。置き場の記録が持つ欄(null でない欄)だけを比べる。
 * 勝者はどの記録でも、ltkdbMatchId と選手の行を持つ記録は試合時間(秒。1 秒以内の差は同じ)と選手の行の COMPARED も。戻り値は { field, stored, ltkdb } の配列
 */
export function correctionsOf(stored, cand) {
  const out = [];
  if (stored.winner !== cand.winner) out.push({ field: 'winner', stored: stored.winner, ltkdb: cand.winner });
  if (!stored.source?.ltkdbMatchId || !hasPlayers(stored) || !hasPlayers(cand)) return out;
  const [a, b] = [stored.durationSec ?? parseDuration(stored.duration), cand.durationSec ?? parseDuration(cand.duration)];
  if (a !== null && a !== undefined && b !== null && b !== undefined && Math.abs(a - b) > 1) out.push({ field: 'duration', stored: a, ltkdb: b });
  for (const [label, t] of Object.entries(stored.teams)) {
    for (const p of t.players ?? []) {
      const q = cand.teams[label]?.players?.find((y) => y.role === p.role);
      if (q) for (const k of COMPARED) if (p[k] !== null && p[k] !== undefined && k in q && q[k] !== p[k]) out.push({ field: `teams.${label}.players[${p.role}].${k}`, stored: p[k], ltkdb: q[k] });
    }
  }
  return out;
}

/**
 * 書く前の検証(基準 35): 置き場(root の results/・scrims/)の記録に changes({ file: 'scrims/<名前>.json', index: null(足す)か要素の番号(置き換え), rec })を
 * 1 件ずつ当て、読み込みと同じ検証(collectResults)で新しく出たエラーと「重複」(基準 7)があれば、その変更を退ける。
 * 戻り値: accepted(通った変更)、rejected({ change, problems })、files(通った変更を当てた後のファイル。'scrims/<名前>.json' → { raw })
 */
export function validateWrites(root, changes, champions) {
  const files = new Map();
  for (const [dir, kind] of [['results', 'official'], ['scrims', 'scrim']]) {
    const path = join(root, dir);
    if (!existsSync(path)) continue;
    for (const f of readdirSync(path).filter((n) => n.endsWith('.json'))) files.set(`${dir}/${f}`, { file: f, kind, raw: JSON.parse(readFileSync(join(path, f), 'utf8')) });
  }
  const problemsNow = () => {
    const r = collectResults([...files.values()], { champions });
    return new Set([...r.errors.map(formatResultError), ...r.excluded.filter((e) => e.reason === '重複').map((e) => `${e.file}[${e.index}] 重複: ${e.detail}`)]);
  };
  let seen = problemsNow();
  const accepted = [];
  const rejected = [];
  for (const change of changes) {
    const prev = files.get(change.file);
    const raw = Array.isArray(prev?.raw) ? [...prev.raw] : [];
    if (change.index === null) raw.push(change.rec);
    else raw[change.index] = change.rec;
    const [dir, f] = change.file.split('/');
    files.set(change.file, { file: f, kind: dir === 'results' ? 'official' : 'scrim', raw });
    const now = problemsNow();
    const fresh = [...now].filter((p) => !seen.has(p));
    if (fresh.length) {
      if (prev) files.set(change.file, prev);
      else files.delete(change.file);
      rejected.push({ change, problems: fresh });
    } else {
      seen = now;
      accepted.push(change);
    }
  }
  return { accepted, rejected, files };
}

/** 記録の頭の欄: kind・date、本番は stage・day・tier・match、game、listeners、source */
function headOf(x, collectedWith, today, updatedAt) {
  const { m, kind, place } = x;
  return {
    kind, ...(x.resultOnly ? { resultOnly: true } : {}), date: m['試合日'],
    ...(kind === 'official' ? { stage: place.stage, day: place.day, tier: place.tier, match: place.match } : {}),
    game: x.game, listeners: false,
    source: {
      url: SITE, dataUrl: DATA, ltkdbMatchId: x.id, ltkdbStatus: m['確認状態'], ltkdbUpdatedAt: updatedAt,
      videoUrl: m['動画URL'] || null, retrievedAt: today,
      note: '非公式のファンサイト LTKDB(LTK Schedule & Status)の試合結果のまとめ。サイトの説明では一部の値はスクリーンショットの OCR で、後で直されることがある。結果画面の時刻は無い',
    },
    collectedBy: 'ai', collectedWith,
  };
}

const winnerOf = (x) => {
  const w = x.m['勝利チーム'];
  if (![x.m['チーム1名'], x.m['チーム2名']].includes(w)) throw new Error(`勝利チーム ${w} が両チームに無い`);
  return `${w} ${x.place.tier}`;
};

/** 結果だけの記録(基準 33): duration・sides・チームの値・選手の行を書かない */
function resultOnlyRecord(x, collectedWith, today, updatedAt) {
  const why = x.rows.length < 10 ? `選手の行 ${x.rows.length} 行` : '試合時間が空';
  return {
    ...headOf(x, collectedWith, today, updatedAt), winner: winnerOf(x), winnerBasis: `LTKDB の勝利チーム ${x.m['勝利チーム']}(${why}。勝者だけが分かる)`,
    teams: Object.fromEntries([x.m['チーム1名'], x.m['チーム2名']].map((t) => [`${t} ${x.place.tier}`, {}])),
  };
}

function toRecord(x, sec, collectedWith, today, updatedAt, seatNames, champions) {
  const { m, rows, place: { tier } } = x;
  x.unconfirmed = [];
  const teams = {};
  const sides = {};
  const cs14Sec = intOf(m['計測秒']);
  const withCs14 = cs14Sec !== null && cs14Sec >= CS14_SEC[0] && cs14Sec <= CS14_SEC[1]; // 基準 37
  for (const tk of [m['チーム1名'], m['チーム2名']]) {
    const key = `${tk} ${tier}`;
    const players = ROLES.map((role) => {
      const r = rows.find((y) => y['チーム名'] === tk && y['ロール'] === role);
      if (!r) throw new Error(`${tk} の ${role} の行が無い`);
      const ro = roster.get(seatKey(tk, tier, role));
      if (!ro) throw new Error(`名簿に ${tk} ${tier} ${role} が無い`);
      const summ = r['サモナーネーム'];
      const game = ro.riotId?.split('#')[0];
      const name = r['プレイヤー名'] || summ;
      // 基準 36: 名前がその席の選手と一致しない行(代打・ロールの入れ替え)は「未確認」
      const fits = nameFits(seatNames, tk, tier, r);
      if (!fits) x.unconfirmed.push({ id: x.id, team: key, role, name });
      const conf = !fits
        ? `未確認(LTKDB の選手名 ${name} がその席の選手と一致しない)`
        : summ && summ === game
        ? `確信(LTKDB のサモナーネーム ${summ} が名簿の Riot ID と一致)`
        : summ
          ? `推定(LTKDB の選手名 ${r['プレイヤー名']}・サモナーネーム ${summ}。名簿の Riot ID と表示が違う。同じ階級チーム・同じロール)`
          : `推定(LTKDB の選手名 ${r['プレイヤー名']}。サモナーネームの記載なし。同じ階級チーム・同じロール)`;
      const gold = Number(r['ゴールド']);
      sides[key] = r['サイド'] === 'BLUE' ? 'ブルー' : 'レッド';
      return {
        role, displayName: summ || r['プレイヤー名'], rosterId: ro.id, rosterName: ro.name, mappingConfidence: conf,
        level: num(r['レベル']), champion: normalizeChampion(r['チャンピオン名'] || null, champions), championNote: null,
        kills: Number(r['K']), deaths: Number(r['D']), assists: Number(r['A']), gold, damage: Number(r['ダメージ']),
        cs: num(r['CS']), ...(withCs14 ? { cs14: num(r['14分CS']) } : {}), goldPerMin: Math.round(gold / (sec / 60)), damageNote: null,
      };
    });
    const sum = (k) => players.reduce((a, p) => a + p[k], 0);
    const kda = tk === m['チーム1名'] ? m['チーム1KDA'] : m['チーム2KDA'];
    if (kda && kda !== `${sum('kills')}/${sum('deaths')}/${sum('assists')}`) throw new Error(`${tk} の KDA ${kda} が 5 人の和と合わない`);
    teams[key] = { kills: sum('kills'), deaths: sum('deaths'), assists: sum('assists'), gold: sum('gold'), players };
  }
  return {
    ...headOf(x, collectedWith, today, updatedAt),
    duration: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, durationSec: sec, ...(withCs14 ? { cs14Sec } : {}), winner: winnerOf(x),
    winnerBasis: `LTKDB の勝利チーム ${m['勝利チーム']}。キル ${Object.values(teams).map((t) => t.kills).join('-')}`,
    sides, sidesBasis: 'LTKDB の各選手の行のサイド(BLUE/RED)', teams, pickBanOrder: null, notes: null,
  };
}

async function cli(args) {
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  try {
    const input = opt('--in');
    const raw = input ? readFileSync(input, 'utf8') : await (await fetch(DATA)).text();
    const site = JSON.parse(raw);
    if (!site?.sheets?.['対戦結果まとめ'] || !site.sheets['リザルト詳細']) throw new Error('site-data.json の形が想定と違う(対戦結果まとめ・リザルト詳細が無い)');
    const championsPath = opt('--champions') ?? (existsSync(CHAMPIONS) ? CHAMPIONS : null);
    const champions = championsPath ? JSON.parse(readFileSync(championsPath, 'utf8')) : await fetchDataDragon();
    const summary = convert(site, { root: opt('--root') ?? 'docs/research/grounds', dryRun: args.includes('--dry-run'), champions });
    for (const w of summary.written) console.log(`書いた: ${w.file}(${w.added.join(', ')})`);
    for (const r of summary.replaced) console.log(`置き換えた: ${r.file}[${r.index}](${r.id})`);
    for (const c of summary.corrections) console.log(`訂正の候補: ${c.id}(${c.where})${c.field}: 置き場 ${c.stored} / LTKDB ${c.ltkdb}`);
    for (const u of summary.unconfirmed) console.log(`未確認: ${u.id} ${u.team} ${u.role}: LTKDB の選手名 ${u.name}`);
    if (summary.resultOnly.length) console.log(`結果だけの記録: ${summary.resultOnly.join(', ')}`);
    for (const x of summary.skipped.official) console.log(`書かなかった本番: ${x.id}(${x.date} ${x.teams.join(' 対 ')}、勝利 ${x.winner}): ${x.reason}`);
    for (const x of summary.skipped.scrim) console.log(`書かなかったスクリム: ${x.id}: ${x.reason}`);
    console.log(`リスナー参加 ${summary.listeners} 件(扱わない)`);
    console.log(JSON.stringify(summary));
    return summary.written.length || summary.replaced.length ? 10 : 0;
  } catch (e) {
    console.error(`失敗: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) process.exitCode = await cli(process.argv.slice(2));
