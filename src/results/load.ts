// F-004 Task-1: 試合結果の記録(本番・スクリム)の読み込みと検証(基準1〜7)
// 検証は純粋な関数(collectResults)。Node の I/O は loadResults だけ。記録の形は specs/F-004/spec.md「入力の形」
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROSTER, type Role } from '../data/roster.ts';
import { MASTERS_CUPS, REGULAR_DAYS } from '../sim/schedule.ts';
import { TEAMS, TIERS, type TeamId, type Tier } from '../sim/types.ts';
import { championKeyOf, type ChampionList } from './champions.ts';
import type { ExcludedRecord, LoadedResults, MappingConfidence, MatchResult, OfficialInfo, PlayerResult, PlayoffMatch, ResultError, ResultKind, ResultSource, TeamResult, TierTeamId } from './types.ts';

/** 記録の置き場の親(results/ と scrims/ を持つ) */
export const DEFAULT_RESULTS_ROOT = 'docs/research/grounds';
const DIRS: Record<ResultKind, string> = { official: 'results', scrim: 'scrims' };
const FILE_NAME = /^(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.json$/;
const ROLES: readonly Role[] = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];
const CONFIDENCES: readonly MappingConfidence[] = ['確信', '推定', '未確認'];
const STAGES = ['regular', 'masters', 'playoffs'] as const;
const MASTERS_MATCHES = ['semi1', 'semi2', 'third', 'final'] as const;
/** Playoffs の日付と、その日の試合(用語「日程の順」) */
const PLAYOFF_DATES: Record<string, PlayoffMatch[]> = { '2026-11-21': ['upperFinal', 'lowerSemi'], '2026-11-22': ['lowerFinal', 'grandFinal'] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/** 辞書順(文字コード順。localeCompare は記号の順が環境で変わるため使わない) */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byName = new Map(ROSTER.map((p) => [p.name, p]));

/** 読み込みの入力: 置き場の中のファイル名、置き場の種類、JSON の中身 */
export interface ResultFile { file: string; kind: ResultKind; raw: unknown }
/** champions が無ければ champion の検証を省く(ほかの検証は行う) */
type ResultsContext = { champions?: ChampionList | null };
type Bad = (field: string, message: string) => void;

/** 階級チームの表記(用語: `DD CORE`。ID の `DD-CORE` も許す)→ ID。階級チームでなければ null */
export function tierTeamIdOf(label: unknown): TierTeamId | null {
  const m = typeof label === 'string' ? /^([A-Z]{2})[ -]([A-Z]+)$/.exec(label.trim()) : null;
  if (!m || !(TEAMS as readonly string[]).includes(m[1]) || !(TIERS as readonly string[]).includes(m[2])) return null;
  return `${m[1] as TeamId}-${m[2] as Tier}`;
}

/** `mm:ss` → 秒。形が違えば null */
export function parseDuration(s: unknown): number | null {
  const m = typeof s === 'string' ? /^(\d{1,3}):([0-5]\d)$/.exec(s) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 基準4 の出力の形: ファイル名[要素の番号] 欄: 理由 */
export function formatResultError(e: ResultError): string {
  return `${e.file}${e.index === null ? '' : `[${e.index}]`} ${e.field}: ${e.message}`;
}

/** 基準1・2: 選手の行。名簿と対応づけ、反した欄を bad に出す。反した行は null */
function parsePlayer(p: unknown, teamId: TierTeamId, label: string, j: number, bad: Bad, champions: ChampionList | null | undefined): PlayerResult | null {
  const prefix = `teams.${label}.players[${j}]`;
  if (!isObj(p)) return bad(prefix, '選手の行(オブジェクト)でない'), null;
  let ok = true;
  const fail = (k: string, m: string) => void (bad(`${prefix}.${k}`, m), (ok = false));
  const role = (ROLES as readonly unknown[]).includes(p.role) ? (p.role as Role) : null;
  if (!role) fail('role', 'TOP・JG・MID・ADC・SUP のどれか');
  const entry = typeof p.rosterName === 'string' ? byName.get(p.rosterName) : undefined;
  if (!entry) fail('rosterName', '名簿(src/data/roster.ts)の選手名でない');
  else if (`${entry.team}-${entry.tier}` !== teamId) fail('rosterName', `${entry.name} の名簿の階級チームは ${entry.team} ${entry.tier}`);
  else if (role && entry.role !== role) fail('role', `${entry.name} の名簿のロールは ${entry.role}`);
  const conf = typeof p.mappingConfidence === 'string' ? CONFIDENCES.find((c) => (p.mappingConfidence as string).startsWith(c)) : undefined;
  if (!conf) fail('mappingConfidence', '「確信」「推定」「未確認」のどれかで始まる文字列');
  if (!('champion' in p) || (p.champion !== null && typeof p.champion !== 'string')) fail('champion', 'チャンピオンの日本語名か null');
  else if (typeof p.champion === 'string' && champions && !champions.names.has(p.champion)) fail('champion', `チャンピオンの一覧(Data Dragon ${champions.version ?? '?'})に無い名前`);
  for (const k of ['kills', 'deaths', 'assists', 'gold', 'damage'] as const) if (!count(p[k])) fail(k, '0 以上の整数');
  for (const k of ['cs', 'level', 'goldPerMin'] as const) if (p[k] != null && numOrNull(p[k]) === null) fail(k, '数か null');
  if (p.cs14 != null && !count(p.cs14)) fail('cs14', '0 以上の整数か null');
  if (!ok) return null;
  const champion = p.champion as string | null;
  return {
    playerId: entry!.id, rosterName: entry!.name, role: role!, champion, championId: championKeyOf(champions, champion),
    kills: p.kills as number, deaths: p.deaths as number, assists: p.assists as number, gold: p.gold as number, damage: p.damage as number,
    cs: numOrNull(p.cs), level: numOrNull(p.level), goldPerMin: numOrNull(p.goldPerMin), cs14: numOrNull(p.cs14), mappingConfidence: conf!, use: conf !== '未確認',
  };
}

/** 基準1・3: 本番の欄と公式の日程(src/sim/schedule.ts)との一致。通れば日程の欄と試合 ID */
function parseOfficial(raw: Record<string, unknown>, teamIds: TierTeamId[], date: string, sides: MatchResult['sides'], bad: Bad): { info: OfficialInfo; matchId: string } | null {
  let ok = true;
  const fail = (k: string, m: string) => void (bad(k, m), (ok = false));
  const stage = STAGES.find((s) => s === raw.stage) ?? null;
  if (!stage) fail('stage', 'regular・masters・playoffs のどれか');
  const tier = (TIERS as readonly string[]).includes(raw.tier as string) ? (raw.tier as Tier) : null;
  if (!tier) fail('tier', 'NEXT・CORE・MASTERS のどれか');
  if (!('day' in raw) || (raw.day !== null && !count(raw.day))) fail('day', 'Regular Stage は日 1〜6、MASTERS CUP は回 1〜3、Playoffs は null');
  if (!('match' in raw) || (raw.match !== null && typeof raw.match !== 'string')) fail('match', 'Regular Stage は null、MASTERS CUP は semi1・semi2・third・final、Playoffs は upperFinal・lowerSemi・lowerFinal・grandFinal');
  if (!count(raw.game) || (raw.game as number) < 1) fail('game', '1 以上のゲーム番号');
  if (!ok || !stage || !tier || teamIds.length !== 2) return null;
  const day = raw.day as number | null, match = raw.match as string | null, game = raw.game as number;
  const teams = teamIds.map((id) => id.split('-')[0] as TeamId);
  if (!teamIds.every((id) => id.endsWith(`-${tier}`))) fail('tier', `両チームの階級が ${tier} でない`);
  let matchId: string | null = null;
  if (stage === 'regular') {
    const d = REGULAR_DAYS.find((x) => x.day === day);
    if (!d) fail('day', 'Regular Stage は 1〜6');
    else {
      if (d.date !== date) fail('date', `日程の ${day} 日目は ${d.date}`);
      if (tier === 'MASTERS') fail('tier', 'Regular Stage は NEXT・CORE');
      if (match !== null) fail('match', 'Regular Stage は null');
      if (game !== 1) fail('game', 'Regular Stage は 1');
      const card = d.cards.find((c) => (c.blue === teams[0] && c.red === teams[1]) || (c.blue === teams[1] && c.red === teams[0]));
      if (!card) fail('teams', `日程の ${day} 日目に ${teams[0]} 対 ${teams[1]} の試合が無い`);
      else if (sides && sides.blue !== `${card.blue}-${tier}`) fail('sides', `日程では ${card.blue} がブルー、${card.red} がレッド`);
      else matchId = `RS-${day}-${card.blue}-${card.red}-${tier}`;
    }
  } else if (stage === 'masters') {
    const cup = MASTERS_CUPS.find((x) => x.cup === day);
    const m = MASTERS_MATCHES.find((x) => x === match) ?? null;
    if (!cup) fail('day', 'MASTERS CUP は回 1〜3');
    if (!m) fail('match', 'MASTERS CUP は semi1・semi2・third・final');
    if (tier !== 'MASTERS') fail('tier', 'MASTERS CUP は MASTERS');
    if (cup && m) {
      if (cup.date !== date) fail('date', `日程の第 ${day} 回は ${cup.date}`);
      if (game > (m === 'final' ? 3 : 1)) fail('game', m === 'final' ? '決勝は BO3(G1〜G3)' : `${m} は BO1(G1)`);
      const [s1, s2] = cup.semis;
      const inPair = (pair: readonly TeamId[]) => teams.every((t) => pair.includes(t));
      const fits = m === 'semi1' ? inPair(s1) : m === 'semi2' ? inPair(s2) : teams.some((t) => s1.includes(t)) && teams.some((t) => s2.includes(t));
      if (!fits) fail('teams', m.startsWith('semi') ? `第 ${day} 回の ${m} は ${(m === 'semi1' ? s1 : s2).join(' 対 ')}` : `${m} は semi1(${s1.join('・')})と semi2(${s2.join('・')})の各 1 チーム`);
      else matchId = `MC${day}-${m}-G${game}`;
    }
  } else {
    const matches = PLAYOFF_DATES[date];
    if (day !== null) fail('day', 'Playoffs は null');
    if (!matches) fail('date', `Playoffs は ${Object.keys(PLAYOFF_DATES).join('・')}`);
    else if (!matches.includes(match as PlayoffMatch)) fail('match', `${date} の試合は ${matches.join('・')}`);
    else if (game > 4) fail('game', 'Playoffs は BO4(G1〜G4)');
    else matchId = `PO-${match}-G${game}`;
  }
  return ok && matchId ? { info: { stage, day, tier, match: match as OfficialInfo['match'], game }, matchId } : null;
}

/** 1 要素の検証。通れば試合、リスナー参加なら除外、反すれば errors に欄を出す */
function parseElement(file: string, index: number, kind: ResultKind, fileDate: string, raw: unknown, champions: ChampionList | null | undefined): { game: MatchResult | null; excluded: ExcludedRecord | null; errors: ResultError[] } {
  const errors: ResultError[] = [];
  const bad: Bad = (field, message) => void errors.push({ file, index, field, message });
  const result = (game: MatchResult | null = null, excluded: ExcludedRecord | null = null) => ({ game: errors.length ? null : game, excluded, errors });
  if (!isObj(raw)) return bad('(要素)', '試合結果の記録(オブジェクト)でない'), result();
  // 基準1・2・4: kind と置き場、date とファイル名、listeners、source.url
  if (raw.kind !== 'official' && raw.kind !== 'scrim') bad('kind', 'official か scrim');
  else if (raw.kind !== kind) bad('kind', `置き場 ${DIRS[kind]}/ の記録は ${kind}`);
  if (typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) bad('date', 'YYYY-MM-DD');
  else if (raw.date !== fileDate) bad('date', `ファイル名の日付 ${fileDate} と一致しない`);
  if (typeof raw.listeners !== 'boolean') bad('listeners', 'true か false');
  if (!isObj(raw.source) || typeof raw.source.url !== 'string' || !raw.source.url.trim()) bad('source.url', '出典の URL が無い');
  if (raw.resultOnly !== undefined && typeof raw.resultOnly !== 'boolean') bad('resultOnly', 'true か false');
  if (errors.length) return result();
  const date = raw.date as string;
  // 基準5: リスナー参加の記録は、中身を検証せず(名簿外の参加者がいる)、どの計算にも使わない
  if (raw.listeners === true) return result(null, { file, index, reason: 'リスナー参加', detail: `${date} の記録。計算に使わない` });

  // 基準28: 結果だけの記録は duration・チームの値・選手の行を持たなくてよい。duration を持てば mm:ss の形
  const resultOnly = raw.resultOnly === true;
  const durationSec = resultOnly && raw.duration == null ? null : parseDuration(raw.duration);
  if (durationSec === null && !(resultOnly && raw.duration == null)) bad('duration', 'mm:ss の形');
  // 基準1・28: スクリムの game は任意(結果だけの記録は必須)。本番の game は parseOfficial が見る
  const hasGame = raw.game !== undefined && raw.game !== null;
  if (kind === 'scrim' && (hasGame || resultOnly) && !(count(raw.game) && (raw.game as number) >= 1)) bad('game', resultOnly ? '結果だけの記録は 1 以上の試合の番号を持つ' : '1 以上の整数');
  const teamsRaw = isObj(raw.teams) ? raw.teams : null;
  const labels = teamsRaw ? Object.keys(teamsRaw) : [];
  const idOf = new Map<string, TierTeamId>();
  if (!teamsRaw || labels.length !== 2) bad('teams', '2 つの階級チーム');
  for (const l of labels) {
    const id = tierTeamIdOf(l);
    if (id) idOf.set(l, id);
    else bad('teams', `${l} は階級チーム(<チーム> <階級>。例 DD CORE)でない`);
  }
  if (labels.length === 2 && idOf.size === 1) bad('teams', '同じ階級チーム');
  const winner = typeof raw.winner === 'string' ? idOf.get(raw.winner) ?? null : null;
  if (!winner) bad('winner', `teams の 2 つの階級チーム(${labels.join('・') || 'なし'})のどちらか`);
  let sides: MatchResult['sides'] = null;
  if (raw.sides != null) {
    const s = isObj(raw.sides) ? raw.sides : {};
    const blue = labels.find((l) => s[l] === 'ブルー'), red = labels.find((l) => s[l] === 'レッド');
    if (!blue || !red || !idOf.has(blue) || !idOf.has(red)) bad('sides', '両チームに「ブルー」「レッド」を 1 つずつ');
    else sides = { blue: idOf.get(blue)!, red: idOf.get(red)! };
  }
  // 基準1・2: チームの値と 5 人の行、和の一致
  const stats: Record<string, TeamResult> = {};
  for (const [label, id] of idOf) {
    const t = teamsRaw![label];
    if (!isObj(t)) {
      bad(`teams.${label}`, 'チームの記録(オブジェクト)でない');
      continue;
    }
    if (resultOnly) {
      if (Array.isArray(t.players) && t.players.length > 0) bad(`teams.${label}.players`, '結果だけの記録は選手の行を持たない');
      continue;
    }
    const players = Array.isArray(t.players) ? t.players : null;
    if (!players || players.length !== 5) bad(`teams.${label}.players`, '5 人の選手の行');
    const rows = (players ?? []).map((p, j) => parsePlayer(p, id, label, j, bad, champions)).filter((r): r is PlayerResult => r !== null);
    const complete = players?.length === 5 && rows.length === 5;
    if (complete && new Set(rows.map((r) => r.role)).size !== 5) bad(`teams.${label}.players`, 'ロールが重複している');
    for (const k of ['kills', 'deaths', 'assists', 'gold'] as const) {
      const sum = rows.reduce((s, r) => s + r[k], 0);
      if (!count(t[k])) bad(`teams.${label}.${k}`, '0 以上の整数');
      else if (complete && sum !== t[k]) bad(`teams.${label}.${k}`, `5 人の和 ${sum} と一致しない(${t[k]})`);
    }
    stats[id] = { kills: t.kills as number, deaths: t.deaths as number, assists: t.assists as number, gold: t.gold as number, players: rows };
  }
  // 基準25: 14 分の CS の計測時刻(本番の記録にも同じ範囲を当てる)
  const cs14Sec = raw.cs14Sec ?? null;
  if (cs14Sec !== null && !(Number.isInteger(cs14Sec) && (cs14Sec as number) >= 780 && (cs14Sec as number) <= 900)) bad('cs14Sec', '780 以上 900 以下の整数(秒)');
  else if (cs14Sec === null && Object.values(stats).some((t) => t.players.some((p) => p.cs14 !== null))) bad('cs14Sec', 'cs14 を持つ選手の行があるのに cs14Sec が無い');
  const teamIds = [...idOf.values()].sort() as [TierTeamId, TierTeamId];
  // 基準1・3: 本番の欄と日程
  const official = kind === 'official' ? parseOfficial(raw, teamIds, date, sides, bad) : null;
  if (errors.length) return result();
  return result({
    matchId: official?.matchId ?? '', kind, date, file, index, resultOnly, duration: durationSec === null ? null : (raw.duration as string), durationSec,
    cs14Sec: cs14Sec as number | null, game: hasGame ? (raw.game as number) : null,
    teams: teamIds, winner: winner!, sides, source: raw.source as ResultSource, official: official?.info ?? null, stats,
  });
}

/**
 * 用語「同じ試合」: (a) どちらも source.ltkdbMatchId を持ち一致する。(b) kind・date・2 つの階級チームが同じで、
 * 本番は試合 ID、スクリムは両方の game が同じ。どちらも ltkdbMatchId を持ち値が違えば同じ試合としない
 */
function sameMatch(a: MatchResult, b: MatchResult): boolean {
  const la = a.source.ltkdbMatchId, lb = b.source.ltkdbMatchId;
  if (typeof la === 'string' && typeof lb === 'string') return la === lb;
  if (a.kind !== b.kind || a.date !== b.date || a.teams.join('|') !== b.teams.join('|')) return false;
  return a.kind === 'official' ? a.matchId === b.matchId : a.game !== null && a.game === b.game;
}

/**
 * 読み込んだファイルの記録を検証し、受け付けた試合・除いた記録・反した欄を返す(純粋。I/O は loadResults)。
 * 基準3: 同じ試合 ID の本番の記録が 2 件以上あれば、そのすべてにエラーを出す(どれを残すかは人が決める)。
 * 基準7: 同じ日・同じ組・同じ試合時間のスクリムは、ファイル名の辞書順で最初の 1 件だけ使う。
 * 基準4: エラーが 1 件でもあれば games を空にする(反した記録のある読み込みを計算に使わせない)
 */
export function collectResults(files: readonly ResultFile[], ctx: ResultsContext = {}): LoadedResults {
  const out: LoadedResults = { games: [], excluded: [], unconfirmed: [], estimated: 0, errors: [], files: [] };
  const fileError = (file: string, field: string, message: string) => void out.errors.push({ file, index: null, field, message });
  const parsed: MatchResult[] = [];
  for (const f of [...files].sort((a, b) => (a.kind === b.kind ? cmp(a.file, b.file) : a.kind === 'official' ? -1 : 1))) {
    out.files.push(`${DIRS[f.kind]}/${f.file}`);
    const m = FILE_NAME.exec(f.file);
    if (!m) fileError(f.file, 'ファイル名', '<YYYY-MM-DD>-<識別子>.json(識別子は小文字の英数字とハイフン)');
    else if (!Array.isArray(f.raw)) fileError(f.file, '(ファイル)', '記録の配列(1 試合 1 要素)でない');
    else {
      f.raw.forEach((el, i) => {
        const r = parseElement(f.file, i, f.kind, m[1], el, ctx.champions);
        out.errors.push(...r.errors);
        if (r.excluded) out.excluded.push(r.excluded);
        if (r.game) parsed.push(r.game);
      });
    }
  }
  // 基準7: 選手の行を持つスクリムの重複(結果だけの記録は duration を持たないため対象にしない)
  const firstOf = new Map<string, MatchResult>();
  const candidates: MatchResult[] = [];
  for (const g of parsed) {
    if (g.kind === 'scrim' && !g.resultOnly) {
      const key = `${g.date}|${g.teams.join('|')}|${g.durationSec}`;
      const first = firstOf.get(key);
      if (first) {
        out.excluded.push({ file: g.file, index: g.index, reason: '重複', detail: `${first.file}[${first.index}] と同じ試合(${g.date}・${g.teams.join(' 対 ')}・${g.duration})` });
        continue;
      }
      firstOf.set(key, g);
    }
    candidates.push(g);
  }
  // 基準30: 同じ試合の結果だけの記録 1 件と選手の行を持つ記録 1 件は、選手の行を持つ記録だけを使う。3 件以上の同じ試合は基準3・7 の検査に任せる
  const replaced = new Set<MatchResult>();
  for (const r of candidates.filter((x) => x.resultOnly)) {
    const same = candidates.filter((x) => x !== r && sameMatch(x, r));
    const full = same.length === 1 && !same[0].resultOnly ? same[0] : null;
    if (!full || candidates.some((x) => x !== full && x !== r && sameMatch(x, full))) continue;
    replaced.add(r);
    if (full.winner !== r.winner) out.errors.push({ file: r.file, index: r.index, field: 'winner', message: `同じ試合の ${full.file}[${full.index}] の winner ${full.winner} と食い違う` });
    else out.excluded.push({ file: r.file, index: r.index, reason: '置き換え', detail: `${full.file}[${full.index}](選手の行を持つ記録)と同じ試合。結果だけの記録を使わない` });
  }
  const used = candidates.filter((x) => !replaced.has(x));
  const kept = new Map<string, MatchResult>();
  const officials = used.filter((x) => x.kind === 'official');
  for (const g of officials) {
    const others = officials.filter((x) => x !== g && x.matchId === g.matchId);
    if (others.length) out.errors.push({ file: g.file, index: g.index, field: 'matchId', message: `同じ試合 ID ${g.matchId} の記録が ${others.map((x) => `${x.file}[${x.index}]`).join('・')} にもある` });
    else kept.set(g.matchId, g);
  }
  // 用語「スクリムの試合 ID の n」: game を持てばその値、持たなければ同じ日・同じ組の game を持たない記録の通し番号
  const counter = new Map<string, number>();
  const byId = new Map<string, MatchResult[]>();
  for (const g of used.filter((x) => x.kind === 'scrim')) {
    const pair = `${g.date}|${g.teams.join('|')}`;
    const n = g.game ?? (counter.get(pair) ?? 0) + 1;
    if (g.game === null) counter.set(pair, n);
    g.matchId = `SC-${g.date.replace(/-/g, '')}-${g.teams[0]}-${g.teams[1]}-G${n}`;
    byId.set(g.matchId, [...(byId.get(g.matchId) ?? []), g]);
  }
  // 基準7(追記): 同じ試合でない 2 件の n が重なれば基準4 のとおり扱う
  for (const [id, list] of byId) {
    if (list.length === 1) kept.set(id, list[0]);
    else for (const g of list) out.errors.push({ file: g.file, index: g.index, field: 'game', message: `試合 ID ${id} の n が ${list.filter((x) => x !== g).map((x) => `${x.file}[${x.index}]`).join('・')} と重なる` });
  }
  if (out.errors.length) return out;
  out.games = [...kept.values()].sort((a, b) => cmp(a.date, b.date) || cmp(a.file, b.file) || a.index - b.index);
  // 基準6: 使わない「未確認」の行と、「推定」の行の数(受け付けた記録だけを数える)
  for (const g of out.games) {
    for (const [team, t] of Object.entries(g.stats)) {
      for (const p of t.players) {
        if (p.mappingConfidence === '未確認') out.unconfirmed.push({ file: g.file, index: g.index, team: team as TierTeamId, role: p.role, rosterName: p.rosterName });
        else if (p.mappingConfidence === '推定') out.estimated += 1;
      }
    }
  }
  return out;
}

/** 基準1: 置き場(<root>/results と <root>/scrims)の *.json を読む。無い置き場は 0 件。JSON として読めないファイルはエラー */
export function loadResults(opts: { root: string; champions?: ChampionList | null }): LoadedResults {
  const files: ResultFile[] = [];
  const errors: ResultError[] = [];
  for (const kind of ['official', 'scrim'] as const) {
    const dir = join(opts.root, DIRS[kind]);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.json')).sort(cmp)) {
      try {
        files.push({ file: name, kind, raw: JSON.parse(readFileSync(join(dir, name), 'utf8')) });
      } catch (e) {
        errors.push({ file: name, index: null, field: '(ファイル)', message: `JSON として読めない: ${(e as Error).message}` });
      }
    }
  }
  const r = collectResults(files, { champions: opts.champions });
  if (errors.length) Object.assign(r, { errors: [...errors, ...r.errors], games: [], unconfirmed: [], estimated: 0 });
  return r;
}

/** 集計の出力の 1 行: 読んだ件数と除外の理由(非機能の要求「監査ログ」) */
export function summarizeResults(r: LoadedResults): string {
  const n = (kind: ResultKind) => r.games.filter((g) => g.kind === kind).length;
  const ex = (reason: ExcludedRecord['reason']) => r.excluded.filter((x) => x.reason === reason).length;
  const tail = r.errors.length ? `。エラー ${r.errors.length} 件(評価と勝率表を書かない)` : '';
  // 基準29: 結果だけの記録(F-005 の結果の入力にだけ使う)の件数とファイル名
  const ro = r.games.filter((g) => g.resultOnly);
  const roNote = `結果だけ ${ro.length} 件${ro.length ? `(${ro.map((g) => `${g.file}[${g.index}]`).join('・')}。チームの強さにだけ使う)` : ''}`;
  return `試合結果の記録: ファイル ${r.files.length} 件から本番 ${n('official')} 試合・スクリム ${n('scrim')} 試合を読んだ(うち${roNote})。除外: リスナー参加 ${ex('リスナー参加')} 件・重複 ${ex('重複')} 件・置き換え ${ex('置き換え')} 件。選手の行: 未確認 ${r.unconfirmed.length}(使わない)・推定 ${r.estimated}${tail}`;
}
