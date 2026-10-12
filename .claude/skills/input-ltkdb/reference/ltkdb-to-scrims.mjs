#!/usr/bin/env node
// /input-ltkdb の変換: LTKDB(非公式のファンサイト LTK Schedule & Status)の site-data.json から、
// 名簿の階級チーム同士のスクリムを F-004 の記録(docs/research/grounds/scrims/ の配列形)へ書き出す。生成 AI を使わない機械の変換。
//
//   node .claude/skills/input-ltkdb/reference/ltkdb-to-scrims.mjs [--in <site-data.json>] [--out <scrims の置き場>] [--dry-run]
//
// --in を省けば LTKDB のリポジトリの site-data.json を取りに行く。終了コード: 0 = 変更なし、10 = 書いたファイルがある、1 = 失敗。
// 出力の最後の行は JSON の要約(written / skipped / official / listeners)。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE = 'https://demo-lab0110.github.io/ltk-schedule-status-site/';
const DATA = 'https://raw.githubusercontent.com/demo-lab0110/ltk-schedule-status-site/main/site-data.json';
const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];
const TIERS = new Set(['NEXT', 'CORE', 'MASTERS']);

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const outDir = opt('--out') ?? 'docs/research/grounds/scrims';
const dryRun = args.includes('--dry-run');
const today = new Date().toISOString().slice(0, 10);

/** 名簿(src/data/roster.ts)を正規表現で読む(TypeScript を読み込まない) */
function readRoster() {
  const txt = readFileSync('src/data/roster.ts', 'utf8');
  const out = new Map();
  const re = /id: '([^']+)', name: "([^"]+)", team: '(\w+)', tier: '(\w+)', role: '(\w+)', riotId: "([^"]+)"/g;
  for (const m of txt.matchAll(re)) {
    const [, id, name, team, tier, role, riot] = m;
    out.set(`${team}|${tier}|${role}`, { id, name, riot });
  }
  return out;
}

/** 既存の記録: 同じ 2 チーム・同じ試合時間(±1 秒)の試合があれば同じ試合とみなす(日付は配信日とずれることがある) */
function existingGames() {
  const games = [];
  if (!existsSync(outDir)) return games;
  for (const f of readdirSync(outDir).filter((x) => x.endsWith('.json')).sort()) {
    const recs = JSON.parse(readFileSync(join(outDir, f), 'utf8'));
    if (!Array.isArray(recs)) continue;
    recs.forEach((r, i) => {
      const [m, s] = String(r.duration ?? '').split(':').map(Number);
      games.push({ file: f, index: i, teams: Object.keys(r.teams ?? {}).sort().join('|'), sec: m * 60 + s, ltkdbMatchId: r.source?.ltkdbMatchId ?? null });
    });
  }
  return games;
}

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

function main(site) {
  const s = site.sheets;
  const roster = readRoster();
  const existing = existingGames();
  const summary = { written: [], skipped: [], official: [], listeners: 0, updatedAt: site.updatedAt };
  const groups = new Map();
  for (const m of s['対戦結果まとめ']) {
    const id = m['試合ID'];
    if (m['スクリム/本番'] !== 'スクリム') {
      summary.official.push(id);
      continue;
    }
    if (/LISTENERS/.test(id) || m['チーム1名'] === 'リスナー' || m['チーム2名'] === 'リスナー') {
      summary.listeners += 1; // F-004 決定 D2: リスナー参加は扱わない
      continue;
    }
    const tier = id.split('_')[2];
    if (!TIERS.has(tier)) {
      summary.skipped.push({ id, reason: `階級が読めない(${tier})` });
      continue;
    }
    if (m['確認状態'] !== '承認済') {
      summary.skipped.push({ id, reason: `確認状態が「${m['確認状態']}」` });
      continue;
    }
    const rows = s['リザルト詳細'].filter((r) => r['試合ID'] === id);
    if (rows.length !== 10 || m['試合時間'] === '') {
      summary.skipped.push({ id, reason: `スコアが無い(選手の行 ${rows.length} 件)。勝者 ${m['勝利チーム']} だけ分かる` });
      continue;
    }
    const sec = Math.round(Number(m['試合時間']) * 60);
    const teamKeys = [m['チーム1名'], m['チーム2名']];
    const dup = existing.find((g) => g.ltkdbMatchId === id || (g.teams === teamKeys.map((t) => `${t} ${tier}`).sort().join('|') && Math.abs(g.sec - sec) <= 1));
    if (dup) {
      summary.skipped.push({ id, reason: `既存の記録 ${dup.file}[${dup.index}] と同じ試合` });
      continue;
    }
    let rec;
    try {
      rec = toRecord(m, rows, tier, sec, roster, site.updatedAt);
    } catch (e) {
      summary.skipped.push({ id, reason: e.message });
      continue;
    }
    const [a, b] = teamKeys.slice().sort();
    const file = `${m['試合日']}-${a.toLowerCase()}-${tier.toLowerCase()}-vs-${b.toLowerCase()}-${tier.toLowerCase()}.json`;
    if (!groups.has(file)) groups.set(file, []);
    groups.get(file).push({ no: Number(m['試合番号']), rec, id });
  }
  for (const [file, list] of groups) {
    list.sort((x, y) => x.no - y.no);
    const path = join(outDir, file);
    // 同じ日・同じ組のファイルが既にあれば、後ろに足す(要素の順 = 試合 ID の通し番号)
    const prev = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
    const recs = [...prev, ...list.map((x) => x.rec)];
    if (!dryRun) writeFileSync(path, JSON.stringify(recs, null, 2) + '\n');
    summary.written.push({ file, added: list.map((x) => x.id) });
  }
  return summary;
}

function toRecord(m, rows, tier, sec, roster, updatedAt) {
  const id = m['試合ID'];
  const teams = {};
  const sides = {};
  for (const tk of [m['チーム1名'], m['チーム2名']]) {
    const key = `${tk} ${tier}`;
    const players = ROLES.map((role) => {
      const r = rows.find((x) => x['チーム名'] === tk && x['ロール'] === role);
      if (!r) throw new Error(`${tk} の ${role} の行が無い`);
      const ro = roster.get(`${tk}|${tier}|${role}`);
      if (!ro) throw new Error(`名簿に ${tk} ${tier} ${role} が無い`);
      const summ = r['サモナーネーム'];
      const game = ro.riot.split('#')[0];
      const conf = summ && summ === game
        ? `確信(LTKDB のサモナーネーム ${summ} が名簿の Riot ID と一致)`
        : summ
          ? `推定(LTKDB の選手名 ${r['プレイヤー名']}・サモナーネーム ${summ}。名簿の Riot ID と表示が違う。同じ階級チーム・同じロール)`
          : `推定(LTKDB の選手名 ${r['プレイヤー名']}。サモナーネームの記載なし。同じ階級チーム・同じロール)`;
      const gold = Number(r['ゴールド']);
      sides[key] = r['サイド'] === 'BLUE' ? 'ブルー' : 'レッド';
      return {
        role, displayName: summ || r['プレイヤー名'], rosterId: ro.id, rosterName: ro.name, mappingConfidence: conf,
        level: num(r['レベル']), champion: r['チャンピオン名'] || null, championNote: null,
        kills: Number(r['K']), deaths: Number(r['D']), assists: Number(r['A']), gold, damage: Number(r['ダメージ']),
        cs: num(r['CS']), goldPerMin: Math.round(gold / (sec / 60)), damageNote: null,
      };
    });
    const sum = (k) => players.reduce((a, p) => a + p[k], 0);
    const kda = tk === m['チーム1名'] ? m['チーム1KDA'] : m['チーム2KDA'];
    if (kda && kda !== `${sum('kills')}/${sum('deaths')}/${sum('assists')}`) throw new Error(`${tk} の KDA ${kda} が 5 人の和と合わない`);
    teams[key] = { kills: sum('kills'), deaths: sum('deaths'), assists: sum('assists'), gold: sum('gold'), players };
  }
  const winner = `${m['勝利チーム']} ${tier}`;
  if (!teams[winner]) throw new Error(`勝利チーム ${m['勝利チーム']} が両チームに無い`);
  return {
    kind: 'scrim', date: m['試合日'], listeners: false,
    source: {
      url: SITE, dataUrl: DATA, ltkdbMatchId: id, ltkdbStatus: m['確認状態'], ltkdbUpdatedAt: updatedAt,
      videoUrl: m['動画URL'] || null, retrievedAt: today,
      note: '非公式のファンサイト LTKDB(LTK Schedule & Status)の試合結果のまとめ。サイトの説明では一部の値はスクリーンショットの OCR で、後で直されることがある。結果画面の時刻は無い',
    },
    collectedBy: 'ai', collectedWith: process.env.COLLECTED_WITH ?? 'ltkdb-to-scrims.mjs',
    duration: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, durationSec: sec, winner,
    winnerBasis: `LTKDB の勝利チーム ${m['勝利チーム']}。キル ${Object.values(teams).map((t) => t.kills).join('-')}`,
    sides, sidesBasis: 'LTKDB の各選手の行のサイド(BLUE/RED)', teams, pickBanOrder: null, notes: null,
  };
}

try {
  const input = opt('--in');
  const raw = input ? readFileSync(input, 'utf8') : await (await fetch(DATA)).text();
  const site = JSON.parse(raw);
  if (!site?.sheets?.['対戦結果まとめ'] || !site.sheets['リザルト詳細']) throw new Error('site-data.json の形が想定と違う(対戦結果まとめ・リザルト詳細が無い)');
  const summary = main(site);
  for (const w of summary.written) console.log(`書いた: ${w.file}(${w.added.join(', ')})`);
  for (const x of summary.skipped) console.log(`使わない: ${x.id}: ${x.reason}`);
  console.log(`本番の試合 ${summary.official.length} 件(この変換の対象外)・リスナー参加 ${summary.listeners} 件(扱わない)`);
  console.log(JSON.stringify({ written: summary.written.length, skipped: summary.skipped.length, official: summary.official, listeners: summary.listeners, updatedAt: summary.updatedAt }));
  process.exitCode = summary.written.length ? 10 : 0;
} catch (e) {
  console.error(`失敗: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
