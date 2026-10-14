// F-004 Task-1: 受入基準 1〜7(試合結果の記録の読み込みと検証)。実装を読まずに受入基準から書いた
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { collectResults, formatResultError, loadResults, summarizeResults } from '../../src/results/load.ts';
import type { ResultFile } from '../../src/results/load.ts';
import { readChampionList } from '../../src/results/champions.ts';
import { fetchDataDragon } from '../../src/collect/ddragon.ts';
import { main } from '../../src/collect/aggregate-cli.ts';
import { ROSTER } from '../../src/data/roster.ts';

type Row = Record<string, unknown>;
type Kind = 'official' | 'scrim';
const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'] as const;
const CHAMP_BY_ROLE: Record<string, string> = { TOP: 'ヨリック', JG: 'パンテオン', MID: 'アカリ', ADC: 'ユナラ', SUP: 'ルル' };
const DD_CHAMPS: Record<string, [string, number]> = { Yorick: ['ヨリック', 83], Pantheon: ['パンテオン', 80], Akali: ['アカリ', 84], Yunara: ['ユナラ', 804], Lulu: ['ルル', 117] };
const NAMES = Object.fromEntries(Object.entries(DD_CHAMPS).map(([id, [name]]) => [id, name]));
const KEYS = Object.fromEntries(Object.entries(DD_CHAMPS).map(([id, [, key]]) => [id, key]));
const CHAMPS = readChampionList({ version: 'test', champions: NAMES, keys: KEYS }).list!;

/** 階級チーム(例 'LR CORE')の名簿の 5 人。各 2 キル・2 デス・4 アシスト・10,000 ゴールド・10,000 ダメージ */
const teamOf = (label: string): Row => {
  const [team, tier] = label.split(' ');
  const players = ROLES.map((role) => {
    const p = ROSTER.find((x) => x.team === team && x.tier === tier && x.role === role)!;
    return { role, rosterName: p.name, mappingConfidence: '確信(名簿の Riot ID と一致)', champion: CHAMP_BY_ROLE[role], kills: 2, deaths: 2, assists: 4, gold: 10000, damage: 10000 };
  });
  return { kills: 10, deaths: 10, assists: 20, gold: 50000, players };
};
const record = (teamA: string, teamB: string, over: Row = {}): Row => ({
  kind: 'scrim', date: '2026-10-10', listeners: false, source: { url: 'https://www.youtube.com/watch?v=AZbkNH5Z5-I', resultScreenSec: 30135 },
  duration: '37:31', winner: teamB, sides: { [teamA]: 'レッド', [teamB]: 'ブルー' }, teams: { [teamA]: teamOf(teamA), [teamB]: teamOf(teamB) }, ...over,
});
const scrim = (over: Row = {}) => record('LR CORE', 'DD CORE', over);
const official = (over: Row = {}) => record('DD NEXT', 'CC NEXT', {
  kind: 'official', date: '2026-10-15', stage: 'regular', day: 1, tier: 'NEXT', match: null, game: 1, winner: 'CC NEXT', sides: { 'CC NEXT': 'ブルー', 'DD NEXT': 'レッド' }, ...over,
});
const masters = (over: Row = {}) => record('CC MASTERS', 'DD MASTERS', { kind: 'official', date: '2026-10-20', stage: 'masters', day: 1, tier: 'MASTERS', match: 'semi1', game: 1, ...over });
const playoff = (over: Row = {}) => record('DD CORE', 'CC CORE', { kind: 'official', date: '2026-11-21', stage: 'playoffs', day: null, tier: 'CORE', match: 'upperFinal', game: 1, ...over });
const team = (rec: Row, label: string) => (rec.teams as Record<string, { players: Row[] } & Row>)[label];

const SCRIM_FILE = '2026-10-10-lr-core-vs-dd-core.json';
const RS_FILE = '2026-10-15-regular-day1.json';
const MC_FILE = '2026-10-20-masters-cup1.json';
const PO_FILE = '2026-11-21-playoffs-day1.json';
const run = (files: ResultFile[]) => collectResults(files, { champions: CHAMPS });
const one = (raw: unknown, file = SCRIM_FILE, kind: Kind = 'scrim') => run([{ file, kind, raw }]);
const fields = (r: { errors: { field: string }[] }) => r.errors.map((e) => e.field);

// ---- 基準1: 欄の検証 ----

test('基準1: 記録の配列を読み、階級チーム ID・勝者・試合時間(秒)・サイド・名簿の ID・チャンピオンの key に正規化する', () => {
  const r = one([scrim()]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.games.length, 1);
  const g = r.games[0];
  assert.deepEqual([g.kind, g.teams, g.winner, g.durationSec, g.sides, g.source.url], ['scrim', ['DD-CORE', 'LR-CORE'], 'DD-CORE', 37 * 60 + 31, { blue: 'DD-CORE', red: 'LR-CORE' }, 'https://www.youtube.com/watch?v=AZbkNH5Z5-I']);
  const adc = g.stats['DD-CORE'].players.find((p) => p.role === 'ADC')!;
  assert.deepEqual([adc.playerId, adc.rosterName, adc.champion, adc.championId, adc.use], ['DD-CORE-ADC', 'じゃすぱー', 'ユナラ', 804, true]);
});

test('基準1: 要素の必須の欄(kind・date・duration・winner・teams・source・listeners)が無ければ、その欄をエラーに出し、記録を使わない', () => {
  for (const key of ['kind', 'date', 'duration', 'winner', 'teams', 'source', 'listeners']) {
    const rec = scrim();
    delete rec[key];
    const r = one([rec]);
    assert.ok(r.errors.some((e) => e.field === key || e.field.startsWith(`${key}.`)), `${key}: ${JSON.stringify(r.errors)}`);
    assert.equal(r.games.length, 0, key);
  }
  assert.ok(fields(one([scrim({ duration: '37分31秒' })])).includes('duration'), 'duration は mm:ss');
  assert.ok(fields(one([scrim({ listeners: 'no' })])).includes('listeners'), 'listeners は真偽値');
  const wrapped = one({ kind: 'scrim-results', matches: [scrim()] });
  assert.ok(wrapped.errors.length > 0 && wrapped.games.length === 0, '配列でないファイルはエラー');
});

test('基準1: 各チームは kills・deaths・assists・gold と 5 人の players を持ち、選手の行は role・rosterName・mappingConfidence・champion・kills・deaths・assists・gold・damage を持つ', () => {
  const four = scrim();
  team(four, 'LR CORE').players.pop();
  assert.ok(fields(one([four])).some((f) => f.startsWith('teams.LR CORE.players')), '5 人でない');
  for (const key of ['role', 'rosterName', 'mappingConfidence', 'champion', 'kills', 'deaths', 'assists', 'gold', 'damage']) {
    const rec = scrim();
    delete team(rec, 'DD CORE').players[3][key];
    const r = one([rec]);
    assert.ok(r.errors.some((e) => e.field === `teams.DD CORE.players[3].${key}`), `${key}: ${JSON.stringify(r.errors)}`);
    assert.equal(r.games.length, 0, key);
  }
  for (const key of ['kills', 'deaths', 'assists', 'gold']) {
    const rec = scrim();
    delete team(rec, 'DD CORE')[key];
    assert.ok(fields(one([rec])).includes(`teams.DD CORE.${key}`), key);
  }
});

test('基準1: 5 人の K/D/A・ゴールドの和がチームの値と一致しなければ、そのチームの欄をエラーに出す', () => {
  const k = scrim();
  team(k, 'DD CORE').kills = 11;
  const r = one([k]);
  assert.ok(r.errors.some((e) => e.field === 'teams.DD CORE.kills' && /10/.test(e.message)), JSON.stringify(r.errors));
  assert.equal(r.games.length, 0);
  const g = scrim();
  (team(g, 'LR CORE').players[0].gold as number) += 1;
  assert.ok(fields(one([g])).includes('teams.LR CORE.gold'));
  const a = scrim();
  team(a, 'LR CORE').assists = 19;
  assert.ok(fields(one([a])).includes('teams.LR CORE.assists'));
});

test('基準1: 本番の記録は stage・day・tier・match・game を持つ(スクリムには要らない)', () => {
  assert.deepEqual(one([official()], RS_FILE, 'official').errors, []);
  for (const key of ['stage', 'day', 'tier', 'match', 'game']) {
    const rec = official();
    delete rec[key];
    assert.ok(fields(one([rec], RS_FILE, 'official')).includes(key), key);
  }
  assert.ok(fields(one([official({ stage: 'group' })], RS_FILE, 'official')).includes('stage'));
  assert.ok(fields(one([official({ tier: 'GOLD' })], RS_FILE, 'official')).includes('tier'));
  assert.deepEqual(one([scrim()]).errors, []);
});

// ---- 基準2: 置き場・ファイル名・名簿・チャンピオンの一覧との一致 ----

test('基準2: kind と置き場、date とファイル名、winner と teams の一致を検証する', () => {
  assert.ok(fields(one([scrim()], '2026-10-10-x.json', 'official')).includes('kind'), 'results/ にスクリムの記録');
  assert.ok(fields(one([official()], '2026-10-15-x.json', 'scrim')).includes('kind'), 'scrims/ に本番の記録');
  assert.ok(fields(one([scrim()], '2026-10-11-lr-core-vs-dd-core.json')).includes('date'), 'ファイル名の日付と違う');
  assert.ok(fields(one([scrim({ winner: 'DD NEXT' })])).includes('winner'), 'teams に無い勝者');
  assert.deepEqual(one([scrim({ winner: 'LR CORE' })]).errors, [], 'もう一方のチームでもよい');
  assert.ok(one([scrim()], 'LR-vs-DD.json').errors.some((e) => e.index === null), 'ファイル名の形が違えばファイルのエラー');
});

test('基準2: rosterName は名簿の選手名、その選手の階級チームとロールが行と一致、champion は一覧の日本語名か null', () => {
  const unknown = scrim();
  team(unknown, 'LR CORE').players[0].rosterName = '名無し';
  assert.ok(fields(one([unknown])).includes('teams.LR CORE.players[0].rosterName'), '名簿に無い');
  const otherTeam = scrim();
  team(otherTeam, 'LR CORE').players[0].rosterName = '狐白うる'; // LR NEXT の TOP
  assert.ok(fields(one([otherTeam])).includes('teams.LR CORE.players[0].rosterName'), '名簿の階級チームが違う');
  const role = scrim();
  team(role, 'LR CORE').players[0].role = 'JG'; // 焼きパンは TOP
  assert.ok(fields(one([role])).includes('teams.LR CORE.players[0].role'), '名簿のロールと違う');
  const champ = scrim();
  team(champ, 'DD CORE').players[3].champion = 'ゆならちゃん';
  assert.ok(fields(one([champ])).includes('teams.DD CORE.players[3].champion'), '一覧に無い名前');
  const nul = scrim();
  team(nul, 'DD CORE').players[1].champion = null;
  const r = one([nul]);
  assert.deepEqual(r.errors, [], 'null は通る');
  const jg = r.games[0].stats['DD-CORE'].players.find((p) => p.role === 'JG')!;
  assert.deepEqual([jg.champion, jg.championId], [null, null]);
  // 一覧が無ければ champion の検証を省く(ほかの検証は行う)
  assert.deepEqual(collectResults([{ file: SCRIM_FILE, kind: 'scrim', raw: [champ] }], { champions: null }).errors, []);
  assert.ok(fields(collectResults([{ file: SCRIM_FILE, kind: 'scrim', raw: [unknown] }], { champions: null })).includes('teams.LR CORE.players[0].rosterName'));
});

test('基準2(チャンピオンの一覧): Data Dragon の取得で数値の key を keys に足し、一覧の読み込みで日本語名 → key を引ける', async () => {
  const d = await fetchDataDragon({ fetch: fakeFetch, now: () => new Date('2026-10-11T00:00:00Z') });
  assert.deepEqual([d.champions, d.keys], [NAMES, KEYS]);
  const { list, error } = readChampionList(d);
  assert.equal(error, null);
  assert.ok(list!.names.has('ヨリック'));
  assert.equal(list!.keyByName.get('ユナラ'), 804);
  assert.equal(readChampionList({ nope: 1 }).list, null);
  assert.ok(readChampionList({ nope: 1 }).error);
  const old = readChampionList({ champions: { Lulu: 'ルル' } });
  assert.ok(old.list!.names.has('ルル') && old.list!.keyByName.size === 0, 'keys の無い古い一覧でも名前は引ける');
});

// ---- 基準3: 本番の記録と公式の日程 ----

test('基準3: Regular Stage の記録は日程の日・日付・階級・両チーム・サイドと一致し、同じ試合 ID は 1 件だけ', () => {
  const off = (over: Row, file = RS_FILE) => one([official(over)], file, 'official');
  assert.ok(fields(off({ date: '2026-10-19' }, '2026-10-19-regular-day1.json')).includes('date'), '1 日目は 10-15');
  assert.ok(fields(off({ day: 2, date: '2026-10-19' }, '2026-10-19-regular-day2.json')).includes('teams'), '2 日目に CC 対 DD は無い');
  assert.ok(fields(off({ day: 7 })).includes('day'), '日は 1〜6');
  assert.ok(fields(off({ sides: { 'CC NEXT': 'レッド', 'DD NEXT': 'ブルー' } })).includes('sides'), '1 日目の CC 対 DD は CC がブルー');
  assert.ok(fields(off({ tier: 'CORE' })).includes('tier'), '両チームは NEXT');
  assert.ok(fields(off({ match: 'semi1' })).includes('match'), 'Regular Stage の match は null');
  assert.ok(fields(off({ game: 2 })).includes('game'), 'Regular Stage の game は 1');
  const ok = off({});
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.games[0].matchId, 'RS-1-CC-DD-NEXT');
  assert.deepEqual(ok.games[0].official, { stage: 'regular', day: 1, tier: 'NEXT', match: null, game: 1 });
  assert.deepEqual(off({ sides: null }).errors, [], 'sides は無くてもよい');
  const dup = run([{ file: RS_FILE, kind: 'official', raw: [official()] }, { file: '2026-10-15-regular-day1-b.json', kind: 'official', raw: [official()] }]);
  assert.ok(dup.errors.some((e) => e.file === '2026-10-15-regular-day1-b.json' && e.index === 0 && e.field === 'matchId'), JSON.stringify(dup.errors));
});

test('基準3: MASTERS CUP は回の日付・準決勝の組・決勝の G1〜G3、Playoffs は 11-21・11-22 の試合と BO4 に一致する', () => {
  const mc = (over: Row) => one([masters(over)], MC_FILE, 'official');
  assert.deepEqual(mc({}).errors, []);
  assert.equal(mc({}).games[0].matchId, 'MC1-semi1-G1');
  assert.ok(fields(mc({ match: 'semi2' })).includes('teams'), '第 1 回の semi2 は IT 対 LR');
  assert.ok(fields(mc({ game: 2 })).includes('game'), '準決勝は BO1');
  assert.ok(fields(mc({ day: 2 })).includes('date'), '第 2 回は 10-28');
  assert.ok(fields(mc({ match: 'quarter' })).includes('match'));
  const final = (a: string, b: string, over: Row = {}) => mc({ match: 'final', game: 3, teams: { [a]: teamOf(a), [b]: teamOf(b) }, winner: b, sides: null, ...over });
  assert.deepEqual(final('DD MASTERS', 'IT MASTERS').errors, []);
  assert.equal(final('DD MASTERS', 'IT MASTERS').games[0].matchId, 'MC1-final-G3');
  assert.ok(fields(final('DD MASTERS', 'IT MASTERS', { game: 4 })).includes('game'), '決勝は BO3');
  assert.ok(fields(final('DD MASTERS', 'CC MASTERS')).includes('teams'), '決勝は semi1 と semi2 の各 1 チーム');
  const po = (over: Row) => one([playoff(over)], PO_FILE, 'official');
  assert.deepEqual(po({}).errors, []);
  assert.equal(po({}).games[0].matchId, 'PO-upperFinal-G1');
  assert.deepEqual(po({ match: 'lowerSemi', tier: 'NEXT', teams: { 'IT NEXT': teamOf('IT NEXT'), 'LR NEXT': teamOf('LR NEXT') }, winner: 'LR NEXT', sides: null }).errors, []);
  assert.ok(fields(po({ match: 'grandFinal' })).includes('match'), 'grandFinal は 11-22');
  assert.ok(fields(po({ game: 5 })).includes('game'), 'BO4');
  assert.ok(fields(po({ day: 1 })).includes('day'), 'Playoffs の day は null');
  assert.ok(fields(one([playoff({ date: '2026-11-20' })], '2026-11-20-playoffs.json', 'official')).includes('date'));
});

// ---- 基準4: 反した記録の出力と、公開用のファイルを書かないこと ----

function tempRoot(files: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), 'f004-results-'));
  for (const [rel, raw] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), typeof raw === 'string' ? raw : JSON.stringify(raw));
  }
  return root;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fakeFetch = async (url: string) => {
  if (url.endsWith('/api/versions.json')) return json(['16.20.1']);
  if (url.endsWith('/cdn/16.20.1/data/ja_JP/champion.json')) return json({ data: Object.fromEntries(Object.entries(DD_CHAMPS).map(([id, [name, key]]) => [id, { id, key: String(key), name }])) });
  return json({}, 404);
};
function cliEnv() {
  const root = mkdtempSync(join(tmpdir(), 'f004-cli-'));
  const lines: string[] = [];
  return { rawDir: join(root, 'raw'), publicDir: join(root, 'public'), snapshotsDir: join(root, 'snapshots'), fetch: fakeFetch, now: () => new Date('2026-10-11T03:00:00.000Z'), out: (l: string) => lines.push(l), lines };
}

test('基準4: 反した記録はファイル名・要素の番号・欄を出し、集計は失敗の終了コードを返して ratings.json・winrates.json・results.json を書かない', async () => {
  const root = tempRoot({ [`scrims/${SCRIM_FILE}`]: [scrim(), scrim({ winner: 'DD NEXT', duration: '30:00' })] });
  const r = loadResults({ root, champions: CHAMPS });
  assert.equal(r.errors.length, 1);
  assert.match(formatResultError(r.errors[0]), /^2026-10-10-lr-core-vs-dd-core\.json\[1\] winner/);
  assert.equal(r.games.length, 0, '反した記録のあるファイルは 1 件も使わない');
  const env = cliEnv();
  const code = await main({ ...env, resultsRoot: root });
  assert.notEqual(code, 0);
  assert.ok(env.lines.some((l) => /2026-10-10-lr-core-vs-dd-core\.json\[1\] winner/.test(l)), env.lines.join('\n'));
  for (const f of ['ratings.json', 'winrates.json', 'results.json']) assert.ok(!existsSync(join(env.publicDir, f)), `${f} を書かない`);
});

test('基準4: 出典の URL が無い記録、JSON として読めないファイルもエラーにする', () => {
  assert.ok(fields(one([scrim({ source: { streamer: '千燈ゆうひ' } })])).includes('source.url'));
  assert.ok(fields(one([scrim({ source: { url: '' } })])).includes('source.url'));
  const r = loadResults({ root: tempRoot({ [`scrims/${SCRIM_FILE}`]: '{ broken', 'scrims/README.md': '# 説明(読まない)' }), champions: CHAMPS });
  assert.deepEqual(r.errors.map((e) => [e.file, e.index]), [[SCRIM_FILE, null]]);
});

// ---- 基準5〜7: リスナー参加・未確認・重複 ----

test('基準5: listeners が true の記録はどの計算にも使わず、ファイル名と要素の番号と「リスナー参加」を出す', () => {
  const listener = scrim({ listeners: true });
  team(listener, 'LR CORE').players[0].rosterName = 'リスナー'; // 名簿外の参加者がいても、除くだけでエラーにしない
  const r = one([listener, scrim({ duration: '30:00' })]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.games.map((g) => g.durationSec), [1800]);
  assert.deepEqual(r.excluded.map((x) => [x.file, x.index, x.reason]), [[SCRIM_FILE, 0, 'リスナー参加']]);
  assert.match(summarizeResults(r), /リスナー参加 1/);
  assert.deepEqual(r.unconfirmed, [], '除いた記録の選手は数えない');
});

test('基準6: 「未確認」の行は使わない印を付けて選手名を出し、「確信」「推定」の行は使って「推定」の数を示す', () => {
  const rec = scrim();
  team(rec, 'LR CORE').players[3].mappingConfidence = '未確認(リザルト画面の表示名が違う)';
  team(rec, 'DD CORE').players[2].mappingConfidence = '推定(先頭の「オレ」だけ読めた)';
  const r = one([rec]);
  assert.deepEqual(r.errors, []);
  const lr = r.games[0].stats['LR-CORE'].players;
  const adc = lr.find((p) => p.role === 'ADC')!;
  const mid = r.games[0].stats['DD-CORE'].players.find((p) => p.role === 'MID')!;
  assert.deepEqual([adc.use, adc.mappingConfidence, lr.find((p) => p.role === 'TOP')?.use, mid.use, mid.mappingConfidence], [false, '未確認', true, true, '推定']);
  assert.deepEqual(r.unconfirmed.map((u) => [u.rosterName, u.team, u.role, u.file, u.index]), [['大御所にゅん子', 'LR-CORE', 'ADC', SCRIM_FILE, 0]]);
  assert.equal(r.estimated, 1);
  assert.match(summarizeResults(r), /未確認 1/);
  assert.match(summarizeResults(r), /推定 1/);
  const bad = scrim();
  team(bad, 'LR CORE').players[3].mappingConfidence = 'たぶん本人';
  assert.ok(fields(one([bad])).includes('teams.LR CORE.players[3].mappingConfidence'));
});

test('基準7: 同じ日・同じ組・同じ試合時間のスクリムが 2 件以上あれば、ファイル名の辞書順で最初の 1 件だけを使い、残りを「重複」として出す', () => {
  const r = run([
    { file: '2026-10-10-lr-core-vs-dd-core-b.json', kind: 'scrim', raw: [scrim(), scrim({ duration: '30:00' })] },
    { file: '2026-10-10-lr-core-vs-dd-core-a.json', kind: 'scrim', raw: [scrim({ source: { url: 'https://www.youtube.com/watch?v=other' } })] },
  ]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.excluded.map((x) => [x.file, x.index, x.reason]), [['2026-10-10-lr-core-vs-dd-core-b.json', 0, '重複']]);
  assert.match(r.excluded[0].detail, /2026-10-10-lr-core-vs-dd-core-a\.json\[0\]/);
  assert.deepEqual(r.games.map((g) => [g.file, g.matchId]), [
    ['2026-10-10-lr-core-vs-dd-core-a.json', 'SC-20261010-DD-CORE-LR-CORE-G1'],
    ['2026-10-10-lr-core-vs-dd-core-b.json', 'SC-20261010-DD-CORE-LR-CORE-G2'],
  ]);
  assert.match(summarizeResults(r), /重複 1/);
  // 組が違えば重複ではない
  const other = run([{ file: SCRIM_FILE, kind: 'scrim', raw: [scrim(), record('LR CORE', 'DD NEXT')] }]);
  assert.deepEqual([other.errors, other.excluded, other.games.length], [[], [], 2]);
});

// ---- 集計の出力と既存の記録 ----

test('集計: resultsRoot の記録を読み、件数と除外の理由を 1 行で出し、反した記録が無ければ評価の書き出しへ進む', async () => {
  const root = tempRoot({ [`scrims/${SCRIM_FILE}`]: [scrim(), scrim({ listeners: true, duration: '30:00' })] });
  const env = cliEnv();
  const code = await main({ ...env, resultsRoot: root });
  assert.ok(code === 0 || code === 2, `終了コード ${code}(試合結果の検証では止めない)\n${env.lines.join('\n')}`);
  const summary = env.lines.find((l) => /試合結果の記録/.test(l) && /スクリム 1 試合/.test(l));
  assert.ok(summary, env.lines.join('\n'));
  assert.match(summary!, /リスナー参加 1/);
  assert.match(summary!, /本番 0 試合/);
  assert.ok(env.lines.some((l) => /2026-10-10-lr-core-vs-dd-core\.json\[1\]/.test(l) && /リスナー参加/.test(l)), '除いた記録の行');
  // resultsRoot を渡さなければ記録を読まない(既存の集計のテストの環境を変えない)
  const env2 = cliEnv();
  await main(env2);
  assert.ok(env2.lines.every((l) => !/試合結果の記録/.test(l)));
});

test('既存の記録: docs/research/grounds/scrims の 2026-10-09 のスクリム 3 試合(DD CORE の 3 勝)を読める。対応づけは全員「確信」(2026-10-11 に価値責任者が ADC と SUP を確認)', () => {
  // 試合日は LTKDB の 2026-10-09(価値責任者の確認 2026-10-12。配信の日付は 10-10)
  const REAL_FILE = '2026-10-09-lr-core-vs-dd-core.json';
  const champPath = 'data/public/champions.json';
  const champions = existsSync(champPath) ? readChampionList(JSON.parse(readFileSync(champPath, 'utf8'))).list : null;
  const r = loadResults({ root: 'docs/research/grounds', champions });
  assert.deepEqual(r.errors.map(formatResultError), []);
  const scrims = r.games.filter((g) => g.kind === 'scrim' && g.date === '2026-10-09' && g.file === REAL_FILE);
  assert.deepEqual(scrims.map((g) => g.winner), ['DD-CORE', 'DD-CORE', 'DD-CORE']);
  assert.deepEqual(scrims.map((g) => g.duration), ['32:50', '43:44', '37:31'], '配信内の順(4〜6 試合目)');
  assert.deepEqual(scrims.map((g) => g.matchId), ['SC-20261009-DD-CORE-LR-CORE-G1', 'SC-20261009-DD-CORE-LR-CORE-G2', 'SC-20261009-DD-CORE-LR-CORE-G3']);
  assert.ok(scrims.every((g) => g.source.url === 'https://www.youtube.com/watch?v=AZbkNH5Z5-I' && typeof g.source.resultScreenSec === 'number'));
  assert.deepEqual(scrims.map((g) => [g.stats['LR-CORE'].kills, g.stats['DD-CORE'].kills]), [[3, 21], [13, 21], [16, 24]]);
  // 2026-10-11: 価値責任者が ADC(大御所にゅん子)と 4 試合目の SUP(神楽めあ)を確認したため、未確認の行は無い
  assert.deepEqual(r.unconfirmed.filter((u) => u.file === REAL_FILE), []);
  assert.ok(scrims.every((g) => g.stats['LR-CORE'].players.find((p) => p.role === 'ADC')?.use === true));
  assert.equal(r.excluded.filter((x) => x.file === REAL_FILE).length, 0);
  assert.ok(r.files.includes(`scrims/${REAL_FILE}`));
});

// ---- F-004 Task-6: 受入基準 25・28・29・30(と基準 1・3・5・7 の 2026-10-14 の追記)。実装を読まずに受入基準から書いた ----

const LTKDB = 'https://demo-lab0110.github.io/ltk-schedule-status-site/';
const withSource = (rec: Row, ltkdbMatchId?: string): Row => ({ ...rec, source: ltkdbMatchId ? { url: LTKDB, ltkdbMatchId } : { url: LTKDB } });
/** 結果だけの記録(スクリム): LR CORE 対 DD CORE、勝者 DD CORE */
const resultOnly = (over: Row = {}): Row => ({
  kind: 'scrim', resultOnly: true, date: '2026-10-10', game: 1, listeners: false, source: { url: LTKDB }, winner: 'DD CORE', teams: { 'LR CORE': {}, 'DD CORE': {} }, ...over,
});
/** 結果だけの記録(本番): 1 日目の CC NEXT 対 DD NEXT */
const resultOnlyOfficial = (over: Row = {}): Row => ({
  kind: 'official', resultOnly: true, date: '2026-10-15', stage: 'regular', day: 1, tier: 'NEXT', match: null, game: 1, listeners: false,
  source: { url: 'https://www.youtube.com/watch?v=official' }, winner: 'CC NEXT', teams: { 'CC NEXT': {}, 'DD NEXT': {} }, ...over,
});

test('基準28: 結果だけの記録は duration・チームの値・選手の行が無くても受け付け、resultOnly の印と試合 ID を持つ', () => {
  const r = one([resultOnly()]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.games.length, 1);
  const g = r.games[0];
  assert.deepEqual([g.resultOnly, g.kind, g.teams, g.winner, g.matchId, g.duration, g.durationSec], [true, 'scrim', ['DD-CORE', 'LR-CORE'], 'DD-CORE', 'SC-20261010-DD-CORE-LR-CORE-G1', null, null]);
  assert.equal(one([scrim()]).games[0].resultOnly, false, '選手の行を持つ記録は false');
  // チームの値があっても、mm:ss の duration があってもよい
  assert.deepEqual(one([resultOnly({ duration: '31:02', teams: { 'LR CORE': { kills: 3 }, 'DD CORE': {} } })]).errors, []);
  // 本番の結果だけの記録: 日程と一致すれば受け付け、試合 ID は選手の行を持つ記録と同じ
  const off = one([resultOnlyOfficial()], RS_FILE, 'official');
  assert.deepEqual(off.errors, []);
  assert.deepEqual([off.games[0].matchId, off.games[0].resultOnly], ['RS-1-CC-DD-NEXT', true]);
});

test('基準28: 結果だけの記録で、選手の行を持つ・game が無い・duration が mm:ss でない・必須の欄が無い記録はエラー。本番は日程と一致しなければエラー', () => {
  assert.ok(fields(one([resultOnly({ teams: { 'LR CORE': teamOf('LR CORE'), 'DD CORE': {} } })])).some((f) => f.startsWith('teams.LR CORE')), '選手の行を持つ');
  assert.ok(fields(one([resultOnly({ teams: { 'LR CORE': { players: [{ role: 'TOP' }] }, 'DD CORE': {} } })])).some((f) => f.startsWith('teams.LR CORE')), '1 行でも選手の行を持つ');
  const noGame = resultOnly();
  delete noGame.game;
  assert.ok(fields(one([noGame])).includes('game'), 'game が無い');
  assert.ok(fields(one([resultOnly({ game: 0 })])).includes('game'), 'game は 1 以上');
  assert.ok(fields(one([resultOnly({ duration: '31分' })])).includes('duration'), 'duration の形');
  assert.ok(fields(one([resultOnly({ resultOnly: 'yes' })])).includes('resultOnly'), 'resultOnly は真偽値');
  for (const key of ['kind', 'date', 'winner', 'teams', 'source', 'listeners']) {
    const rec = resultOnly();
    delete rec[key];
    const r = one([rec]);
    assert.ok(r.errors.some((e) => e.field === key || e.field.startsWith(`${key}.`)), `${key}: ${JSON.stringify(r.errors)}`);
    assert.equal(r.games.length, 0, key);
  }
  assert.ok(fields(one([resultOnly({ winner: 'DD NEXT' })])).includes('winner'));
  assert.ok(fields(one([resultOnly()], '2026-10-11-x.json')).includes('date'));
  const off = (over: Row) => fields(one([resultOnlyOfficial(over)], RS_FILE, 'official'));
  assert.ok(off({ day: 2, date: '2026-10-19' }).length > 0, '2 日目に CC 対 DD は無い');
  assert.ok(off({ sides: { 'CC NEXT': 'レッド', 'DD NEXT': 'ブルー' } }).includes('sides'));
  assert.ok(off({ stage: undefined }).includes('stage'));
  assert.ok(off({ game: 2 }).includes('game'));
});

test('基準1・7(追記): スクリムの記録は任意で game(1 以上の整数)を持ち、試合 ID の n はその値。持たない記録は持たない記録だけで数える', () => {
  assert.ok(fields(one([scrim({ game: 0 })])).includes('game'));
  assert.ok(fields(one([scrim({ game: '2' })])).includes('game'));
  const r = one([scrim({ game: 2 }), scrim({ duration: '30:00' })]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.games.map((g) => g.matchId).sort(), ['SC-20261010-DD-CORE-LR-CORE-G1', 'SC-20261010-DD-CORE-LR-CORE-G2']);
  // 結果だけの記録は duration を持たないため、基準 7 の重複にしない
  const two = one([resultOnly(), resultOnly({ game: 2 })]);
  assert.deepEqual([two.errors, two.excluded], [[], []]);
  assert.equal(two.games.length, 2);
});

test('基準7(追記): 同じ日・同じ組で、同じ試合でない 2 件の試合 ID の n が重なればエラー(source.ltkdbMatchId が違えば同じ試合としない)', () => {
  const clash = one([withSource(scrim({ game: 1 }), 'SCRIM_A_001'), withSource(scrim({ game: 1, duration: '30:00' }), 'SCRIM_A_002')]);
  assert.ok(clash.errors.length > 0, '両方が game 1、ltkdbMatchId が違う');
  assert.equal(clash.games.length, 0);
  // game を持たない記録の通し番号 1 と、game 1 の結果だけの記録(別の試合)が重なる
  const counted = one([withSource(scrim(), 'SCRIM_A_002'), withSource(resultOnly({ game: 1 }), 'SCRIM_A_001')]);
  assert.ok(counted.errors.length > 0, JSON.stringify(counted.errors));
  // 重ならなければ両方使う
  const ok = one([scrim(), resultOnly({ game: 2 })]);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.games.length, 2);
});

test('基準5(追記): listeners が true の結果だけの記録も、どの計算にも使わず「リスナー参加」を出す', () => {
  const r = one([resultOnly({ listeners: true })]);
  assert.deepEqual([r.errors, r.games.length], [[], 0]);
  assert.deepEqual(r.excluded.map((x) => [x.file, x.index, x.reason]), [[SCRIM_FILE, 0, 'リスナー参加']]);
});

test('基準30: 同じ試合の結果だけの記録と選手の行を持つ記録があれば、選手の行を持つ記録だけを使い、結果だけの記録を「置き換え」として出す', () => {
  // (a) ltkdbMatchId が一致(結果だけの記録のファイルが辞書順で先でも)
  const a = run([
    { file: '2026-10-10-a-result-only.json', kind: 'scrim', raw: [withSource(resultOnly({ game: 3 }), 'SCRIM_X_001')] },
    { file: '2026-10-10-b-full.json', kind: 'scrim', raw: [withSource(scrim(), 'SCRIM_X_001')] },
  ]);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(a.games.map((g) => [g.file, g.resultOnly]), [['2026-10-10-b-full.json', false]]);
  assert.deepEqual(a.excluded.map((x) => [x.file, x.index, x.reason]), [['2026-10-10-a-result-only.json', 0, '置き換え']]);
  assert.match(a.excluded[0].detail, /2026-10-10-b-full\.json\[0\]/);
  assert.match(summarizeResults(a), /置き換え 1/);
  // (b) ltkdbMatchId を持たず、両方の game が同じ
  const b = one([resultOnly({ game: 2 }), scrim({ game: 2 })]);
  assert.deepEqual(b.errors, []);
  assert.deepEqual(b.games.map((g) => [g.index, g.matchId]), [[1, 'SC-20261010-DD-CORE-LR-CORE-G2']]);
  assert.deepEqual(b.excluded.map((x) => [x.index, x.reason]), [[0, '置き換え']]);
  // 本番: 同じ試合 ID の結果だけの記録 1 件と選手の行を持つ記録 1 件は「1 件だけ」に反したとしない
  const off = run([
    { file: '2026-10-15-cc-next-vs-dd-next.json', kind: 'official', raw: [resultOnlyOfficial()] },
    { file: RS_FILE, kind: 'official', raw: [official()] },
  ]);
  assert.deepEqual(off.errors, []);
  assert.deepEqual(off.games.map((g) => [g.file, g.matchId, g.resultOnly]), [[RS_FILE, 'RS-1-CC-DD-NEXT', false]]);
  assert.deepEqual(off.excluded.map((x) => [x.file, x.reason]), [['2026-10-15-cc-next-vs-dd-next.json', '置き換え']]);
});

test('基準30: 同じ試合の 2 つの記録の winner が食い違えばエラー。ltkdbMatchId が違えば game が同じでも同じ試合としない', () => {
  const w = one([resultOnly({ game: 2, winner: 'LR CORE' }), scrim({ game: 2 })]);
  assert.ok(w.errors.some((e) => e.field === 'winner'), JSON.stringify(w.errors));
  assert.equal(w.games.length, 0);
  const off = run([
    { file: '2026-10-15-cc-next-vs-dd-next.json', kind: 'official', raw: [resultOnlyOfficial({ winner: 'DD NEXT' })] },
    { file: RS_FILE, kind: 'official', raw: [official()] },
  ]);
  assert.ok(off.errors.some((e) => e.field === 'winner'), JSON.stringify(off.errors));
  const differ = one([withSource(resultOnly({ game: 2 }), 'SCRIM_X_001'), withSource(scrim({ game: 2 }), 'SCRIM_X_002')]);
  assert.ok(differ.errors.length > 0, '別の試合で n が重なる');
  assert.ok(differ.excluded.every((x) => x.reason !== '置き換え'));
});

test('基準25: cs14Sec は 780 以上 900 以下の整数、cs14 は 0 以上の整数か null、cs14 が null でない行がある記録は cs14Sec を持つ(本番の記録にも当てる)', () => {
  const withCs = (rec: Row, cs14: unknown, sec?: unknown) => {
    if (sec !== undefined) rec.cs14Sec = sec;
    team(rec, 'DD CORE').players[0].cs14 = cs14;
    return rec;
  };
  const r = one([withCs(scrim(), 103, 840)]);
  assert.deepEqual(r.errors, []);
  assert.equal(r.games[0].cs14Sec, 840);
  assert.equal(r.games[0].stats['DD-CORE'].players.find((p) => p.role === 'TOP')!.cs14, 103);
  assert.equal(r.games[0].stats['LR-CORE'].players[0].cs14, null, '持たない行は null');
  assert.equal(one([scrim()]).games[0].cs14Sec, null);
  for (const sec of [779, 901, 840.5, '840']) assert.ok(fields(one([withCs(scrim(), 103, sec)])).includes('cs14Sec'), String(sec));
  for (const sec of [780, 900]) assert.deepEqual(one([withCs(scrim(), 103, sec)]).errors, [], String(sec));
  for (const cs of [-1, 1.5, '103']) assert.ok(fields(one([withCs(scrim(), cs, 840)])).includes('teams.DD CORE.players[0].cs14'), String(cs));
  assert.deepEqual(one([withCs(scrim(), null)]).errors, [], 'null だけなら cs14Sec は要らない');
  assert.ok(fields(one([withCs(scrim(), 103)])).includes('cs14Sec'), 'cs14 があるのに cs14Sec が無い');
  assert.ok(fields(one([withCs(official(), 103, 700)], RS_FILE, 'official')).includes('cs14Sec'), '本番にも範囲を当てる');
  assert.deepEqual(one([withCs(official(), 103, 840)], RS_FILE, 'official').errors, []);
});

test('基準29: 集計の出力に結果だけの記録の件数とファイル名を示し、結果だけの記録を results.json の games[] に 1 試合として書く', async () => {
  const RO_FILE = '2026-10-10-lr-core-vs-dd-core-result-only.json';
  const r = run([{ file: SCRIM_FILE, kind: 'scrim', raw: [scrim()] }, { file: RO_FILE, kind: 'scrim', raw: [resultOnly({ game: 2 })] }]);
  assert.deepEqual(r.errors, []);
  const line = summarizeResults(r);
  assert.match(line, /結果だけ 1 件/);
  assert.ok(line.includes(`${RO_FILE}[0]`), line);
  assert.match(line, /スクリム 2 試合/, '結果だけの記録も試合に数える');
  const root = tempRoot({ [`scrims/${SCRIM_FILE}`]: [scrim()], [`scrims/${RO_FILE}`]: [resultOnly({ game: 2 })] });
  const env = cliEnv();
  const code = await main({ ...env, resultsRoot: root });
  assert.ok(code === 0 || code === 2, `終了コード ${code}\n${env.lines.join('\n')}`);
  assert.ok(env.lines.some((l) => /結果だけ 1 件/.test(l) && l.includes(RO_FILE)), env.lines.join('\n'));
  const results = JSON.parse(readFileSync(join(env.publicDir, 'results.json'), 'utf8')) as { games: { matchId: string; kind: string; winner: string }[] };
  assert.deepEqual(results.games.map((g) => [g.matchId, g.kind, g.winner]), [['SC-20261010-DD-CORE-LR-CORE-G1', 'scrim', 'DD-CORE'], ['SC-20261010-DD-CORE-LR-CORE-G2', 'scrim', 'DD-CORE']]);
});
