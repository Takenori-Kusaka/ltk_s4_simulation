// F-004 Task-7: 受入基準 31・32・33・37・38(LTKDB の変換: 本番・結果だけ・写し・要約)。実装より先に受入基準から書いた
// 固定データ: fixtures/ltkdb-schedule.json は LTKDB の「サイト_予定」の本番 40 行(2026-10-14 の公開データのまま)、
// fixtures/ltkdb-rows.json は同じ公開データのスクリム SCRIM_20261013_MASTERS_IT_CC_001(勝者だけ)・002(選手の行 10 行)の行。
// 本番の行は、スクリムの行を本番の形に直した合成の行(選手は名簿の名前、各 K2・D2・A4・ゴールド 10,000・ダメージ 10,000・14分CS 100)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROSTER } from '../../src/data/roster.ts';
import { readChampionList } from '../../src/results/champions.ts';
import { loadResults } from '../../src/results/load.ts';
import { convert } from '../../.claude/skills/input-ltkdb/reference/ltkdb-to-scrims.mjs';

type Row = Record<string, unknown>;
const SCRIPT = '.claude/skills/input-ltkdb/reference/ltkdb-to-scrims.mjs';
const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];
const SCHEDULE: Row[] = JSON.parse(readFileSync('tests/results/fixtures/ltkdb-schedule.json', 'utf8'));
const FIX = JSON.parse(readFileSync('tests/results/fixtures/ltkdb-rows.json', 'utf8'));
const SCRIM1: Row = FIX['対戦結果まとめ'][0]; // 勝者 IT、試合時間が空、選手の行 0 行
const SCRIM2: Row = FIX['対戦結果まとめ'][1]; // 勝者 CC、試合時間 31.9666… 分(= 1918 秒 = 31:58)、計測秒 840
const DETAIL2: Row[] = FIX['リザルト詳細'];

// F-004 Task-8(基準 34・35・36)で、変換はチャンピオンの一覧を必須の入力にした。fixtures/ltkdb-champions.json は固定データの 10 体とジャーヴァンⅣ
const CHAMPS_FILE = 'tests/results/fixtures/ltkdb-champions.json';
const CHAMPS = JSON.parse(readFileSync(CHAMPS_FILE, 'utf8'));
const root = () => mkdtempSync(join(tmpdir(), 'ltkdb-convert-'));
// 基準 36 の照合の材料: 2026-10-14 の公開データの「サイト_チームマスタ」と「サイト_選手プロフィール」の抜粋。
// 固定データの IT の JG は LTKDB の選手名 Yunika で、名簿の名前・Riot ID はゆにか。プロフィールの名前 Yunika で一致する
const PROFILE = {
  'サイト_チームマスタ': [{ team_key: 'IT', team_name: 'Iris Tiara' }],
  'サイト_選手プロフィール': [{ 'チーム名': 'Iris Tiara', '階級': 'masters', 'ロール': 'JG', '名前': 'Yunika' }],
};
const siteOf = (matches: Row[], details: Row[], schedule: Row[] = SCHEDULE): Row => ({
  updatedAt: '2026-10-14T12:00:00.000Z',
  sheets: { '対戦結果まとめ': matches, 'リザルト詳細': details, 'サイト_予定': schedule, ...PROFILE },
});
const run = (matches: Row[], details: Row[], dir = root(), schedule?: Row[]) => ({ dir, summary: convert(siteOf(matches, details, schedule), { root: dir, today: '2026-10-14', collectedWith: 'test', champions: CHAMPS }) });
const read = (dir: string, file: string): Row[] => JSON.parse(readFileSync(join(dir, file), 'utf8'));

/** 本番の「対戦結果まとめ」の合成の行。KDA は 5 人 × (2/2/4) = 10/10/20 */
const off = (id: string, scheduleId: string, date: string, t1: string, t2: string, winner: string, over: Row = {}): Row => ({
  '試合ID': id, 'スケジュールID': scheduleId, '試合日': date, '試合番号': 1, 'チーム1名': t1, 'チーム2名': t2, '勝利チーム': winner,
  '試合時間': 30, 'チーム1KDA': '10/10/20', 'チーム2KDA': '10/10/20', 'スクリム/本番': '本番', '動画URL': '', '確認状態': '承認済', '計測秒': 840, ...over,
});
/** 1 チームの選手の行 5 行(名前は名簿の tier の席の選手) */
const players = (id: string, team: string, tier: string, side: string, name = (n: string) => n): Row[] => ROLES.map((role) => ({
  '試合ID': id, 'チーム名': team, 'サイド': side, 'ロール': role, 'プレイヤー名': name(ROSTER.find((p) => p.team === team && p.tier === tier && p.role === role)!.name),
  'サモナーネーム': '', 'チャンピオン名': 'アーリ', 'レベル': 15, 'K': 2, 'D': 2, 'A': 4, 'ダメージ': 10000, 'CS': '', 'ゴールド': 10000, '14分CS': 100,
}));
const both = (id: string, t1: string, t2: string, tier: string) => [...players(id, t1, tier, 'BLUE'), ...players(id, t2, tier, 'RED')];
const skippedIds = (s: Row) => ((s.skipped as Row).official as Row[]).map((x) => x.id);

// --- 基準 31: 本番の行を日程と突き合わせて results/ へ ---

test('基準31: Regular Stage の行は stage・day・match を日程から、game を試合番号から取って results/ に書く', () => {
  const { dir, summary } = run([off('OFF_RS1', 'LTK4_REGULAR_D1_M1', '2026-10-15', 'CC', 'DD', 'CC')], both('OFF_RS1', 'CC', 'DD', 'NEXT'));
  const [r] = read(dir, 'results/2026-10-15-cc-next-vs-dd-next.json');
  assert.deepEqual([r.kind, r.date, r.stage, r.day, r.tier, r.match, r.game, r.winner, r.duration], ['official', '2026-10-15', 'regular', 1, 'NEXT', null, 1, 'CC NEXT', '30:00']);
  assert.equal((r.source as Row).ltkdbMatchId, 'OFF_RS1');
  assert.deepEqual(Object.keys(r.teams as Row).sort(), ['CC NEXT', 'DD NEXT']);
  assert.deepEqual(summary.written, [{ file: 'results/2026-10-15-cc-next-vs-dd-next.json', added: ['OFF_RS1'] }]);
});

test('基準31: 予定の行の tier と stage は大文字と小文字を区別しない', () => {
  const sched = SCHEDULE.map((x) => (x.schedule_id === 'LTK4_REGULAR_D1_M1' ? { ...x, tier: 'NEXT', stage: 'Regular' } : x));
  const { dir } = run([off('OFF_RS1', 'LTK4_REGULAR_D1_M1', '2026-10-15', 'CC', 'DD', 'DD')], both('OFF_RS1', 'CC', 'DD', 'NEXT'), root(), sched);
  assert.equal(read(dir, 'results/2026-10-15-cc-next-vs-dd-next.json')[0].tier, 'NEXT');
});

test('基準31: MASTERS CUP の準決勝は 2 チームの組で semi1・semi2、3 位決定戦と決勝は match_no と準決勝の勝敗で決める', () => {
  // 第 1 回(2026-10-20)の準決勝は DD 対 CC(semi1)・IT 対 LR(semi2)。勝者 DD・IT → 決勝 DD 対 IT、敗者 CC・LR → 3 位決定戦
  const rows = [
    off('MC_S1', 'LTK4_MASTERS_D1_M1', '2026-10-20', 'DD', 'CC', 'DD'), off('MC_S2', 'LTK4_MASTERS_D1_M2', '2026-10-20', 'IT', 'LR', 'IT'),
    off('MC_T', 'LTK4_MASTERS_D1_M3', '2026-10-20', 'CC', 'LR', 'LR'), off('MC_F1', 'LTK4_MASTERS_D1_M4', '2026-10-20', 'DD', 'IT', 'DD'),
  ];
  const details = [...both('MC_S1', 'DD', 'CC', 'MASTERS'), ...both('MC_S2', 'IT', 'LR', 'MASTERS'), ...both('MC_T', 'CC', 'LR', 'MASTERS'), ...both('MC_F1', 'DD', 'IT', 'MASTERS')];
  const { dir } = run(rows, details);
  const pick = (f: string) => read(dir, `results/${f}`).map((r) => [r.stage, r.day, r.tier, r.match, r.game]);
  assert.deepEqual(pick('2026-10-20-cc-masters-vs-dd-masters.json'), [['masters', 1, 'MASTERS', 'semi1', 1]]);
  assert.deepEqual(pick('2026-10-20-it-masters-vs-lr-masters.json'), [['masters', 1, 'MASTERS', 'semi2', 1]]);
  assert.deepEqual(pick('2026-10-20-cc-masters-vs-lr-masters.json'), [['masters', 1, 'MASTERS', 'third', 1]]);
  assert.deepEqual(pick('2026-10-20-dd-masters-vs-it-masters.json'), [['masters', 1, 'MASTERS', 'final', 1]]);
});

test('基準31・32: 決勝は置き場にある準決勝の記録からも決まり、match_no と勝敗が食い違えば書かない', () => {
  const dir = root();
  run([off('MC_S1', 'LTK4_MASTERS_D1_M1', '2026-10-20', 'DD', 'CC', 'DD'), off('MC_S2', 'LTK4_MASTERS_D1_M2', '2026-10-20', 'IT', 'LR', 'IT')],
    [...both('MC_S1', 'DD', 'CC', 'MASTERS'), ...both('MC_S2', 'IT', 'LR', 'MASTERS')], dir);
  // 2 回目の実行: 決勝の G2 は置き場の準決勝から決まる。match_no 4(決勝)で敗者どうしの CC 対 LR は書かない
  const { summary } = run([off('MC_F2', 'LTK4_MASTERS_D1_M4', '2026-10-20', 'IT', 'DD', 'IT', { '試合番号': 2 }), off('MC_BAD', 'LTK4_MASTERS_D1_M4', '2026-10-20', 'CC', 'LR', 'CC')],
    [...both('MC_F2', 'IT', 'DD', 'MASTERS'), ...both('MC_BAD', 'CC', 'LR', 'MASTERS')], dir);
  assert.deepEqual(read(dir, 'results/2026-10-20-dd-masters-vs-it-masters.json').map((r) => [r.match, r.game]), [['final', 2]]);
  assert.equal(existsSync(join(dir, 'results/2026-10-20-cc-masters-vs-lr-masters.json')), false);
  assert.deepEqual(skippedIds(summary), ['MC_BAD']);
});

test('基準31: 3 位決定戦は準決勝の記録が無ければ match を決められず書かない(基準32)', () => {
  const { dir, summary } = run([off('MC_T', 'LTK4_MASTERS_D1_M3', '2026-10-20', 'CC', 'LR', 'LR')], both('MC_T', 'CC', 'LR', 'MASTERS'));
  assert.equal(existsSync(join(dir, 'results')) && existsSync(join(dir, 'results/2026-10-20-cc-masters-vs-lr-masters.json')), false);
  assert.deepEqual(skippedIds(summary), ['MC_T']);
});

test('基準31: Playoffs は予定の tier が空なら選手の名前が名簿の席と一致する階級をとり、match_no の指すマッチの日付で match を決める', () => {
  // LTK4_PLAYOFFS_M1 は match_no 1 = upperFinal(2026-11-21)。選手 10 人は名簿の CORE の席の名前
  const { dir } = run([off('PO_1', 'LTK4_PLAYOFFS_M1', '2026-11-21', 'DD', 'LR', 'LR')], both('PO_1', 'DD', 'LR', 'CORE'));
  const [r] = read(dir, 'results/2026-11-21-dd-core-vs-lr-core.json');
  assert.deepEqual([r.stage, r.day, r.tier, r.match, r.game, r.winner], ['playoffs', null, 'CORE', 'upperFinal', 1, 'LR CORE']);
});

test('基準32: Playoffs で名前から階級が決まらない行、match_no のマッチの日付が試合日と違う行は書かない', () => {
  const sub = [...players('PO_X', 'DD', 'CORE', 'BLUE', () => '代打の選手'), ...players('PO_X', 'LR', 'CORE', 'RED')];
  // LTK4_PLAYOFFS_M3 は match_no 3 = lowerFinal(2026-11-22)。試合日 2026-11-21 とは合わない
  const { dir, summary } = run([off('PO_X', 'LTK4_PLAYOFFS_M1', '2026-11-21', 'DD', 'LR', 'LR'), off('PO_D', 'LTK4_PLAYOFFS_M3', '2026-11-21', 'DD', 'LR', 'DD')],
    [...sub, ...both('PO_D', 'DD', 'LR', 'CORE')]);
  assert.deepEqual(skippedIds(summary).sort(), ['PO_D', 'PO_X']);
  assert.equal(existsSync(join(dir, 'results/2026-11-21-dd-core-vs-lr-core.json')), false);
});

// --- 基準 32: 一致しない行は書かずに出力し、残りを続ける ---

test('基準32: スケジュールID が予定に無い行・試合日が違う行・stage が食い違う行は書かず、試合 ID・試合日・2 チーム・勝利チームと理由を出し、残りを書く', () => {
  const sched = SCHEDULE.map((x) => (x.schedule_id === 'LTK4_REGULAR_D1_M3' ? { ...x, stage: 'MASTERS' } : x));
  const rows = [
    off('OFF_NOSCHED', 'LTK4_REGULAR_D9_M1', '2026-10-15', 'CC', 'DD', 'CC'),
    off('OFF_DATE', 'LTK4_REGULAR_D1_M1', '2026-10-16', 'CC', 'DD', 'CC'),
    off('OFF_STAGE', 'LTK4_REGULAR_D1_M3', '2026-10-15', 'IT', 'LR', 'IT'),
    off('OFF_OK', 'LTK4_REGULAR_D1_M2', '2026-10-15', 'CC', 'DD', 'DD'),
  ];
  const details = [...both('OFF_NOSCHED', 'CC', 'DD', 'NEXT'), ...both('OFF_DATE', 'CC', 'DD', 'NEXT'), ...both('OFF_STAGE', 'IT', 'LR', 'NEXT'), ...both('OFF_OK', 'CC', 'DD', 'CORE')];
  const { dir, summary } = run(rows, details, root(), sched);
  const sk = (summary.skipped as Row).official as Row[];
  assert.deepEqual(sk.map((x) => x.id), ['OFF_NOSCHED', 'OFF_DATE', 'OFF_STAGE']);
  assert.deepEqual([sk[1].date, sk[1].teams, sk[1].winner], ['2026-10-16', ['CC', 'DD'], 'CC']);
  assert.ok(sk.every((x) => typeof x.reason === 'string' && (x.reason as string).length > 0));
  assert.equal(read(dir, 'results/2026-10-15-cc-core-vs-dd-core.json')[0].winner, 'DD CORE');
});

test('基準32: 同じ試合 ID になる本番の行が 2 件あれば、どちらも書かない', () => {
  const rows = [off('OFF_A', 'LTK4_REGULAR_D1_M1', '2026-10-15', 'CC', 'DD', 'CC'), off('OFF_B', 'LTK4_REGULAR_D1_M1', '2026-10-15', 'DD', 'CC', 'DD'),
    off('OFF_C', 'LTK4_REGULAR_D1_M3', '2026-10-15', 'IT', 'LR', 'LR')];
  const { dir, summary } = run(rows, [...both('OFF_A', 'CC', 'DD', 'NEXT'), ...both('OFF_B', 'DD', 'CC', 'NEXT'), ...both('OFF_C', 'IT', 'LR', 'NEXT')]);
  assert.deepEqual(skippedIds(summary).sort(), ['OFF_A', 'OFF_B']);
  assert.equal(existsSync(join(dir, 'results/2026-10-15-cc-next-vs-dd-next.json')), false);
  assert.equal(read(dir, 'results/2026-10-15-it-next-vs-lr-next.json')[0].winner, 'LR NEXT');
});

// --- 基準 33: 結果だけの記録 ---

test('基準33: 選手の行も試合時間も無いスクリムは結果だけの記録(game は試合番号。duration・sides・選手の行なし)', () => {
  const { dir, summary } = run([SCRIM1], []);
  const [r] = read(dir, 'scrims/2026-10-13-cc-masters-vs-it-masters.json');
  assert.deepEqual([r.kind, r.resultOnly, r.date, r.game, r.listeners, r.winner], ['scrim', true, '2026-10-13', 1, false, 'IT MASTERS']);
  assert.deepEqual(r.teams, { 'IT MASTERS': {}, 'CC MASTERS': {} });
  assert.equal((r.source as Row).ltkdbMatchId, 'SCRIM_20261013_MASTERS_IT_CC_001');
  assert.equal('duration' in r || 'sides' in r || 'durationSec' in r, false);
  assert.deepEqual(summary.resultOnly, ['SCRIM_20261013_MASTERS_IT_CC_001']);
});

test('基準33: 選手の行が 10 行に満たない試合、試合時間が空の試合も結果だけの記録', () => {
  const a = run([SCRIM2], DETAIL2.slice(0, 7));
  assert.deepEqual(read(a.dir, 'scrims/2026-10-13-cc-masters-vs-it-masters.json').map((r) => [r.resultOnly, r.game, r.winner]), [[true, 2, 'CC MASTERS']]);
  const b = run([{ ...SCRIM2, '試合時間': '' }], DETAIL2);
  const [r] = read(b.dir, 'scrims/2026-10-13-cc-masters-vs-it-masters.json');
  assert.equal(r.resultOnly, true);
  assert.deepEqual(r.teams, { 'IT MASTERS': {}, 'CC MASTERS': {} });
});

test('基準33: 本番の結果だけの記録は日程と一致した行だけ(stage・day・tier・match を持つ)。階級が決まらなければ書かない', () => {
  const { dir, summary } = run([off('OFF_RO', 'LTK4_REGULAR_D1_M1', '2026-10-15', 'CC', 'DD', 'DD', { '試合時間': '' }), off('PO_RO', 'LTK4_PLAYOFFS_M1', '2026-11-21', 'DD', 'LR', 'LR', { '試合時間': '' })], []);
  const [r] = read(dir, 'results/2026-10-15-cc-next-vs-dd-next.json');
  assert.deepEqual([r.kind, r.resultOnly, r.stage, r.day, r.tier, r.match, r.game, r.winner], ['official', true, 'regular', 1, 'NEXT', null, 1, 'DD NEXT']);
  assert.equal('duration' in r, false);
  assert.deepEqual(skippedIds(summary), ['PO_RO']);
  assert.deepEqual(summary.resultOnly, ['OFF_RO']);
});

test('基準33: 試合 ID の 3 つ目が階級でないスクリム(LTK4_SCRIM_<日付>_<組>_<階級>_CANDIDATE_…)は、スケジュールID の指す予定の行の tier を階級にする。どちらからも読めなければ書かない', () => {
  const id = 'LTK4_SCRIM_20261013_ITCC_MASTERS_CANDIDATE_P01_RESULT';
  const sched = { schedule_id: 'LTK4_SCRIM_20261013_ITCC_MASTERS_CANDIDATE_P01', event_date: '2026-10-13', match_type: 'スクリム', stage: 'SCRIM', tier: 'masters' };
  const a = run([{ ...SCRIM1, '試合ID': id, 'スケジュールID': sched.schedule_id }], [], root(), [...SCHEDULE, sched]);
  const [r] = read(a.dir, 'scrims/2026-10-13-cc-masters-vs-it-masters.json');
  assert.deepEqual([r.kind, r.resultOnly, r.game, r.winner, (r.source as Row).ltkdbMatchId], ['scrim', true, 1, 'IT MASTERS', id]);
  const b = run([{ ...SCRIM1, '試合ID': id, 'スケジュールID': 'NO_SUCH_SCHEDULE' }], []);
  assert.equal(existsSync(join(b.dir, 'scrims')) && readdirSync(join(b.dir, 'scrims')).length > 0, false);
  const sk = (b.summary.skipped as Row).scrim as Row[];
  assert.deepEqual(sk.map((x) => x.id), [id]);
  assert.match(sk[0].reason as string, /階級が読めない/);
});

// --- 基準 37: 14 分の CS と試合の番号の写し ---

test('基準37: 計測秒 840 のスクリムは cs14Sec と各選手の cs14 を写し、game に試合番号を書く', () => {
  const { dir } = run([SCRIM1, SCRIM2], DETAIL2);
  const recs = read(dir, 'scrims/2026-10-13-cc-masters-vs-it-masters.json');
  assert.deepEqual(recs.map((r) => r.game), [1, 2]);
  const r = recs[1];
  assert.deepEqual([r.cs14Sec, r.duration, r.winner], [840, '31:58', 'CC MASTERS']); // 31.9666… 分 × 60 = 1918 秒
  const ps = (label: string) => ((r.teams as Row)[label] as Row).players as Row[];
  // 固定データ: CC の ADC Yuhi の 14分CS 121、IT の TOP らいじん 103、CC の SUP NEMOH 20
  assert.equal(ps('CC MASTERS').find((p) => p.role === 'ADC')!.cs14, 121);
  assert.equal(ps('IT MASTERS').find((p) => p.role === 'TOP')!.cs14, 103);
  assert.equal(ps('CC MASTERS').find((p) => p.role === 'SUP')!.cs14, 20);
});

test('基準37: 計測秒の境界 779・780・900・901・空。範囲外と空では cs14・cs14Sec を書かない。14分CS が空の行は null', () => {
  const details = DETAIL2.map((d) => (d['ロール'] === 'MID' && d['チーム名'] === 'IT' ? { ...d, '14分CS': '' } : d));
  for (const [sec, want] of [[779, undefined], [780, 780], [900, 900], [901, undefined], ['', undefined]] as const) {
    const { dir } = run([{ ...SCRIM2, '計測秒': sec }], details);
    const [r] = read(dir, 'scrims/2026-10-13-cc-masters-vs-it-masters.json');
    assert.equal(r.cs14Sec, want, `計測秒 ${sec}`);
    const all = Object.values(r.teams as Record<string, Row>).flatMap((t) => t.players as Row[]);
    if (want === undefined) assert.ok(all.every((p) => !('cs14' in p)), `計測秒 ${sec}`);
    else assert.equal(all.find((p) => p.displayName === 'Eugeo')!.cs14, null);
  }
});

test('基準37: 試合番号が文字列でも整数に直して game に書き、本番の記録にも cs14 を写す', () => {
  const a = run([{ ...SCRIM2, '試合番号': '3' }], DETAIL2);
  assert.equal(read(a.dir, 'scrims/2026-10-13-cc-masters-vs-it-masters.json')[0].game, 3);
  const b = run([off('OFF_RS1', 'LTK4_REGULAR_D1_M1', '2026-10-15', 'CC', 'DD', 'CC')], both('OFF_RS1', 'CC', 'DD', 'NEXT'));
  const [r] = read(b.dir, 'results/2026-10-15-cc-next-vs-dd-next.json');
  assert.equal(r.cs14Sec, 840);
  assert.equal((((r.teams as Row)['CC NEXT'] as Row).players as Row[])[0].cs14, 100);
});

// --- 基準 38: 要約と終了コード ---

const cli = (args: string[], champions = CHAMPS_FILE) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [SCRIPT, ...args, '--champions', champions], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    const err = e as { status: number; stdout: string };
    return { code: err.status, out: err.stdout };
  }
};
const lastJson = (out: string): Row => JSON.parse(out.trim().split('\n').at(-1)!);

test('基準38: 最後の行は JSON の要約。書いたファイルがあれば 10、新しい試合が無ければ 0、読み取りに失敗すれば 1', () => {
  const tmp = root();
  const listener = { ...SCRIM2, '試合ID': 'SCRIM_20261013_MASTERS_IT_LISTENERS_001', 'チーム2名': 'リスナー' };
  const site = siteOf([SCRIM1, SCRIM2, listener, off('OFF_BAD', 'LTK4_REGULAR_D9_M1', '2026-10-15', 'CC', 'DD', 'CC')], DETAIL2);
  writeFileSync(join(tmp, 'site.json'), JSON.stringify(site));
  const dir = join(tmp, 'grounds');
  const first = cli(['--in', join(tmp, 'site.json'), '--root', dir]);
  assert.equal(first.code, 10);
  const s = lastJson(first.out);
  assert.deepEqual(Object.keys(s).sort(), ['corrections', 'draftSkipped', 'draftWritten', 'listeners', 'replaced', 'resultOnly', 'skipped', 'unconfirmed', 'updatedAt', 'withoutDraft', 'written']);
  assert.deepEqual(s.written, [{ file: 'scrims/2026-10-13-cc-masters-vs-it-masters.json', added: ['SCRIM_20261013_MASTERS_IT_CC_001', 'SCRIM_20261013_MASTERS_IT_CC_002'] }]);
  assert.deepEqual(s.resultOnly, ['SCRIM_20261013_MASTERS_IT_CC_001']);
  assert.deepEqual([s.listeners, s.updatedAt, s.replaced, s.corrections, s.unconfirmed], [1, '2026-10-14T12:00:00.000Z', [], [], []]);
  assert.deepEqual(((s.skipped as Row).official as Row[]).map((x) => x.id), ['OFF_BAD']);
  assert.ok(Array.isArray((s.skipped as Row).scrim));
  // 2 回目: 同じ入力。既存の記録と同じ試合だけで、書くものが無い
  const second = cli(['--in', join(tmp, 'site.json'), '--root', dir]);
  assert.equal(second.code, 0);
  assert.deepEqual(lastJson(second.out).written, []);
  writeFileSync(join(tmp, 'broken.json'), '{ not json');
  assert.equal(cli(['--in', join(tmp, 'broken.json'), '--root', dir]).code, 1);
});

// --- F-004 Task-8: 受入基準 34・35・36(置き換え・訂正の候補・書く前の検証・名前の照合)。実装より先に受入基準から書いた ---
// 固定データの SCRIM2(SCRIM_20261013_MASTERS_IT_CC_002)は勝者 CC、1918 秒(31:58)。CC はチーム2(KDA 22/13/49 = 1+2+2+14+3 / 1+4+4+3+1 / 14+5+10+6+14)。
// CC の ADC Yuhi はルシアン・K14・ゴールド 20451・ダメージ 53013・14分CS 121
const ID2 = 'SCRIM_20261013_MASTERS_IT_CC_002';
const SCRIM_FILE = 'scrims/2026-10-13-cc-masters-vs-it-masters.json';
const raw = (dir: string, file: string) => readFileSync(join(dir, file), 'utf8');
const fix = (s: Row) => (s.corrections as Row[]).map((c) => [c.field, c.stored, c.ltkdb]);
const yuhi = (over: Row) => DETAIL2.map((d) => (d['プレイヤー名'] === 'Yuhi' ? { ...d, ...over } : d));

// --- 基準 34: 置き換え・同じ試合を足さない・訂正の候補 ---

test('基準34: 置き場の結果だけの記録は、LTKDB に選手の行 10 行と試合時間が入り勝者が一致すれば、その要素を選手の行を持つ記録で置き換える', () => {
  const { dir } = run([{ ...SCRIM2, '試合時間': '' }], DETAIL2); // 1 回目: 試合時間が空 → 結果だけ(勝者 CC)
  assert.equal(read(dir, SCRIM_FILE)[0].resultOnly, true);
  const { summary } = run([SCRIM2], DETAIL2, dir);
  const recs = read(dir, SCRIM_FILE);
  assert.equal(recs.length, 1);
  assert.deepEqual([recs[0].resultOnly, recs[0].duration, recs[0].winner, recs[0].game], [undefined, '31:58', 'CC MASTERS', 2]);
  assert.deepEqual(summary.replaced, [{ file: SCRIM_FILE, index: 0, id: ID2 }]);
  assert.deepEqual([summary.written, summary.corrections], [[], []]);
});

test('基準34: 置き場の結果だけの記録と LTKDB の勝者が食い違えば置き換えず、置き場を変えずに勝者を訂正の候補に出す', () => {
  const { dir } = run([{ ...SCRIM2, '試合時間': '', '勝利チーム': 'IT' }], DETAIL2); // 置き場: 結果だけ、勝者 IT
  const before = raw(dir, SCRIM_FILE);
  const { summary } = run([SCRIM2], DETAIL2, dir); // LTKDB の現在: 勝者 CC
  assert.equal(raw(dir, SCRIM_FILE), before);
  assert.deepEqual([summary.replaced, summary.written], [[], []]);
  assert.deepEqual(fix(summary), [['winner', 'IT MASTERS', 'CC MASTERS']]);
  assert.deepEqual((summary.corrections as Row[]).map((c) => [c.id, c.where]), [[ID2, `${SCRIM_FILE}[0]`]]);
});

test('基準34: 置き場に同じ試合があれば足さない(同じ入力の 2 回目、LTKDB の側が結果だけになった場合)', () => {
  const { dir } = run([SCRIM2], DETAIL2);
  const before = raw(dir, SCRIM_FILE);
  for (const m of [SCRIM2, { ...SCRIM2, '試合時間': '' }]) {
    const { summary } = run([m], DETAIL2, dir);
    assert.deepEqual([summary.written, summary.replaced, summary.corrections], [[], [], []]);
    assert.equal(raw(dir, SCRIM_FILE), before);
  }
});

test('基準34: 値を変えた写しでは、置き場を書き換えず、試合 ID・欄・両方の値を訂正の候補に出す', () => {
  const { dir } = run([SCRIM2], DETAIL2);
  const before = raw(dir, SCRIM_FILE);
  // 試合時間 1928 / 60 分(= 1928 秒。1918 秒との差 10 秒)。Yuhi の K 14 → 15(CC の KDA も 23/13/49 に直す)、ゴールド 20451 → 20000、ルシアン → アーリ、14分CS 121 → 130。ダメージは変えない
  const m = { ...SCRIM2, '試合時間': 1928 / 60, 'チーム2KDA': '23/13/49' };
  const { summary } = run([m], yuhi({ 'K': 15, 'ゴールド': 20000, 'チャンピオン名': 'アーリ', '14分CS': 130 }), dir);
  assert.equal(raw(dir, SCRIM_FILE), before);
  assert.deepEqual([summary.written, summary.replaced], [[], []]);
  const p = 'teams.CC MASTERS.players[ADC]';
  assert.deepEqual(fix(summary), [['duration', 1918, 1928], [`${p}.kills`, 14, 15], [`${p}.gold`, 20451, 20000], [`${p}.champion`, 'ルシアン', 'アーリ'], [`${p}.cs14`, 121, 130]]);
  assert.ok((summary.corrections as Row[]).every((c) => c.id === ID2 && c.where === `${SCRIM_FILE}[0]`));
});

test('基準34: 置き場の記録が持たない欄(14 分の CS・null のチャンピオン)は比べない。試合時間の差 1 秒は同じとみなす', () => {
  // 置き場: 計測秒が空(cs14 を持たない)、Yuhi のチャンピオンが空(null)
  const { dir } = run([{ ...SCRIM2, '計測秒': '' }], yuhi({ 'チャンピオン名': '' }));
  assert.equal(read(dir, SCRIM_FILE)[0].cs14Sec, undefined);
  // LTKDB の現在: 計測秒 840 で 14分CS を持ち、チャンピオンはルシアン、試合時間 1919 秒(差 1 秒)
  const { summary } = run([{ ...SCRIM2, '試合時間': 1919 / 60 }], yuhi({ '14分CS': 130 }), dir);
  assert.deepEqual([summary.written, summary.corrections], [[], []]);
});

test('基準34: ltkdbMatchId の無い選手の行を持つスクリム(配信の書き起こし)は、2 チームが同じで試合時間の差が 1 秒以内なら同じ試合。比べるのは勝者だけ', () => {
  const made = run([SCRIM2], DETAIL2);
  const stream = (duration: string, sec: number, winner: string) => {
    const r = { ...read(made.dir, SCRIM_FILE)[0], duration, durationSec: sec, winner, source: { url: 'https://www.youtube.com/watch?v=stream' } };
    delete (r as Row).game;
    const dir = root();
    mkdirSync(join(dir, 'scrims'));
    writeFileSync(join(dir, 'scrims/2026-10-13-stream-cc-vs-it.json'), JSON.stringify([r]));
    return dir;
  };
  // 31:59 = 1919 秒(LTKDB の 1918 秒と差 1) → 同じ試合。足さない。勝者が同じなら訂正の候補なし
  const a = stream('31:59', 1919, 'CC MASTERS');
  assert.deepEqual([run([SCRIM2], DETAIL2, a).summary.written, readdirSync(join(a, 'scrims'))], [[], ['2026-10-13-stream-cc-vs-it.json']]);
  // 勝者が違えば勝者だけを訂正の候補に出す(Yuhi のゴールドを変えても、ltkdbMatchId の無い記録の選手の行は比べない)
  const b = stream('31:59', 1919, 'IT MASTERS');
  assert.deepEqual(fix(run([SCRIM2], yuhi({ 'ゴールド': 1 }), b).summary), [['winner', 'IT MASTERS', 'CC MASTERS']]);
  // 32:00 = 1920 秒(差 2) → 別の試合。書く
  const c = stream('32:00', 1920, 'CC MASTERS');
  assert.deepEqual(run([SCRIM2], DETAIL2, c).summary.written, [{ file: SCRIM_FILE, added: [ID2] }]);
});

// --- 基準 35: 書く前の検証・反した試合の隔離・チャンピオン名の正規化 ---

test('基準35: 検証に反した 1 試合(一覧に無いチャンピオン)だけを書かず、試合 ID と反した欄を出し、残りの試合を書く', () => {
  // 003 は 002 の写しで試合時間 25 分(1500 秒)・試合番号 3。試合時間を変えるのは、002 と同じ試合時間だと基準 7 の重複に当たるため
  const ID3 = 'SCRIM_20261013_MASTERS_IT_CC_003';
  const d3 = DETAIL2.map((d) => ({ ...d, '試合ID': ID3 }));
  const { dir, summary } = run([SCRIM2, { ...SCRIM2, '試合ID': ID3, '試合番号': 3, '試合時間': 25 }], [...yuhi({ 'チャンピオン名': 'ナゾノチャンピオン' }), ...d3]);
  assert.deepEqual(read(dir, SCRIM_FILE).map((r) => [(r.source as Row).ltkdbMatchId, r.game]), [[ID3, 3]]);
  assert.deepEqual(summary.written, [{ file: SCRIM_FILE, added: [ID3] }]);
  const sk = (summary.skipped as Row).scrim as Row[];
  assert.deepEqual(sk.map((x) => x.id), [ID2]);
  assert.match(sk[0].reason as string, /champion/);
});

test('基準35: 本番の Regular Stage・準決勝の試合番号 2、日程と違うサイドは読み込みの基準 3 に反し、書かずに隔離する', () => {
  const swapped = [...players('R_SIDE', 'IT', 'NEXT', 'RED'), ...players('R_SIDE', 'LR', 'NEXT', 'BLUE')]; // 日程は IT がブルー
  const rows = [
    off('R_G2', 'LTK4_REGULAR_D1_M1', '2026-10-15', 'CC', 'DD', 'CC', { '試合番号': 2 }),
    off('R_SIDE', 'LTK4_REGULAR_D1_M3', '2026-10-15', 'IT', 'LR', 'IT'),
    off('R_OK', 'LTK4_REGULAR_D1_M2', '2026-10-15', 'CC', 'DD', 'DD'),
    off('MC_G2', 'LTK4_MASTERS_D1_M1', '2026-10-20', 'DD', 'CC', 'DD', { '試合番号': 2 }),
  ];
  const { dir, summary } = run(rows, [...both('R_G2', 'CC', 'DD', 'NEXT'), ...swapped, ...both('R_OK', 'CC', 'DD', 'CORE'), ...both('MC_G2', 'DD', 'CC', 'MASTERS')]);
  assert.deepEqual(readdirSync(join(dir, 'results')), ['2026-10-15-cc-core-vs-dd-core.json']);
  assert.deepEqual(summary.written, [{ file: 'results/2026-10-15-cc-core-vs-dd-core.json', added: ['R_OK'] }]);
  const sk = (summary.skipped as Row).official as Row[];
  assert.deepEqual(sk.map((x) => x.id), ['R_G2', 'R_SIDE', 'MC_G2']);
  assert.deepEqual(sk.map((x) => /sides/.test(x.reason as string) ? 'sides' : /game/.test(x.reason as string) ? 'game' : x.reason), ['game', 'sides', 'game']);
});

test('基準35: 一覧に無い「ジャーヴァンIV」は、NFKC で一致する一覧の「ジャーヴァンⅣ」に置き換えて書く', () => {
  const { dir, summary } = run([SCRIM2], yuhi({ 'チャンピオン名': 'ジャーヴァンIV' }));
  const ps = ((read(dir, SCRIM_FILE)[0].teams as Row)['CC MASTERS'] as Row).players as Row[];
  assert.equal(ps.find((p) => p.role === 'ADC')!.champion, 'ジャーヴァンⅣ');
  assert.deepEqual((summary.skipped as Row).scrim, []);
});

test('基準35: チャンピオンの一覧を読めなければ、記録を書かず失敗する(convert は例外、CLI は終了コード 1)', () => {
  const dir = root();
  assert.throws(() => convert(siteOf([SCRIM2], DETAIL2), { root: dir, today: '2026-10-14', collectedWith: 'test', champions: null }));
  assert.throws(() => convert(siteOf([SCRIM2], DETAIL2), { root: dir, today: '2026-10-14', collectedWith: 'test', champions: { version: 'x' } }));
  assert.equal(existsSync(join(dir, 'scrims')), false);
  const tmp = root();
  writeFileSync(join(tmp, 'site.json'), JSON.stringify(siteOf([SCRIM2], DETAIL2)));
  writeFileSync(join(tmp, 'champions.json'), '{ not json');
  assert.equal(cli(['--in', join(tmp, 'site.json'), '--root', join(tmp, 'grounds')], join(tmp, 'champions.json')).code, 1);
  assert.equal(existsSync(join(tmp, 'grounds')), false);
});

// --- 基準 36: 名前の一致しない行を「未確認」に ---

const nameOf = (team: string, tier: string, role: string) => ROSTER.find((p) => p.team === team && p.tier === tier && p.role === role)!.name;
const confs = (dir: string, file: string, team: string) => (((read(dir, file)[0].teams as Row)[team] as Row).players as Row[]).map((p) => [p.role, p.mappingConfidence]);
const NEXT_FILE = 'results/2026-10-15-cc-next-vs-dd-next.json';

test('基準36: 名前を替えた行は mappingConfidence を「未確認」にし、試合 ID・席・LTKDB の名前を出す', () => {
  const rows = both('U1', 'CC', 'DD', 'NEXT').map((r) => (r['チーム名'] === 'CC' && r['ロール'] === 'TOP' ? { ...r, 'プレイヤー名': '代打の選手' } : r));
  const { dir, summary } = run([off('U1', 'LTK4_REGULAR_D1_M1', '2026-10-15', 'CC', 'DD', 'CC')], rows);
  assert.deepEqual(confs(dir, NEXT_FILE, 'CC NEXT')[0], ['TOP', '未確認(LTKDB の選手名 代打の選手 がその席の選手と一致しない)']);
  assert.ok(confs(dir, NEXT_FILE, 'CC NEXT').slice(1).every(([, c]) => /^推定/.test(c as string)));
  assert.deepEqual(summary.unconfirmed, [{ id: 'U1', team: 'CC NEXT', role: 'TOP', name: '代打の選手' }]);
});

test('基準36: ロールを入れ替えた行(TOP と JG の名前が逆)はどちらも「未確認」', () => {
  const [top, jg] = [nameOf('CC', 'NEXT', 'TOP'), nameOf('CC', 'NEXT', 'JG')];
  const rows = both('U2', 'CC', 'DD', 'NEXT').map((r) => (r['チーム名'] !== 'CC' ? r : r['ロール'] === 'TOP' ? { ...r, 'プレイヤー名': jg } : r['ロール'] === 'JG' ? { ...r, 'プレイヤー名': top } : r));
  const { dir, summary } = run([off('U2', 'LTK4_REGULAR_D1_M1', '2026-10-15', 'CC', 'DD', 'CC')], rows);
  assert.deepEqual(confs(dir, NEXT_FILE, 'CC NEXT').slice(0, 2).map(([, c]) => /^未確認/.test(c as string)), [true, true]);
  assert.deepEqual(summary.unconfirmed, [{ id: 'U2', team: 'CC NEXT', role: 'TOP', name: jg }, { id: 'U2', team: 'CC NEXT', role: 'JG', name: top }]);
});

test('基準36: 大文字と小文字・全角と半角の違う名前(固定データの IT・CC MASTERS の 10 人のうち英字の 9 人。Yunika はプロフィールの名前と一致)は「未確認」にしない', () => {
  // 英字を大文字にしてから全角(U+FF01〜U+FF5E)へ。NFKC と小文字化で名簿の名前に戻る。らいじんは変わらない
  const variant = (n: string) => [...n.toUpperCase()].map((ch) => (ch >= '!' && ch <= '~' ? String.fromCharCode(ch.charCodeAt(0) + 0xfee0) : ch)).join('');
  const rows = DETAIL2.map((d) => ({ ...d, 'プレイヤー名': variant(d['プレイヤー名'] as string) }));
  assert.equal(rows.filter((r) => ROSTER.some((p) => p.name === r['プレイヤー名'])).length, 1, '9 人の表記が名簿と違う');
  const { dir, summary } = run([SCRIM2], rows);
  assert.deepEqual(summary.unconfirmed, []);
  assert.ok([...confs(dir, SCRIM_FILE, 'CC MASTERS'), ...confs(dir, SCRIM_FILE, 'IT MASTERS')].every(([, c]) => /^推定/.test(c as string)));
});

// --- F-004 Task-14: 受入基準 44・45・46・47(LTKDB の BP詳細を記録の draft へ)。実装より先に受入基準から書いた ---
// 固定データ: fixtures/ltkdb-bp.json は 2026-10-14 の LTKDB の公開データの、BP詳細を持つ名簿の階級チーム同士の 15 試合の
// 「対戦結果まとめ」15 行と「BP詳細」260 行(1 行 1 レコード)。選手の行は含めないので、SCRIM2 以外は結果だけの記録になる。
// fixtures/ltkdb-bp-champions.json は Data Dragon 16.20.1 の一覧から、その 260 行に出る 90 体を抜いたもの
const BP = JSON.parse(readFileSync('tests/results/fixtures/ltkdb-bp.json', 'utf8'));
const BP_CHAMPS = { version: 'test', champions: { ...CHAMPS.champions, ...JSON.parse(readFileSync('tests/results/fixtures/ltkdb-bp-champions.json', 'utf8')).champions } };
const LRDD2 = 'SCRIM_20261009_CORE_LR_DD_002'; // チーム1 DD・チーム2 LR。BP順 1〜20 がそろう。順 4 の DD の BAN は「NOBAN」
const DDIT1 = 'SCRIM_20261011_CORE_DD_IT_001'; // チーム1 IT・チーム2 DD。BP順が全行空。DD の BAN 2 行のチャンピオン名が空
const CCLR1 = 'SCRIM_20261011_MASTERS_CC_LR_001'; // PICK だけ 10 行。LR の 5 行のロールが空
const matchOf = (id: string): Row => BP['対戦結果まとめ'].find((m: Row) => m['試合ID'] === id);
const bpOf = (id: string): Row[] => BP['BP詳細'].filter((r: Row) => r['試合ID'] === id);
const setBp = (rows: Row[], order: number, over: Row) => rows.map((r) => (r['BP順'] === order ? { ...r, ...over } : r));
const runBp = (matches: Row[], details: Row[], bp: Row[], dir = root()) => {
  const site = siteOf(matches, details);
  return { dir, summary: convert({ ...site, sheets: { ...(site.sheets as Row), 'BP詳細': bp } }, { root: dir, today: '2026-10-14', collectedWith: 'test', champions: BP_CHAMPS }) };
};
const tuples = (d: unknown) => (d as Row[]).map((e) => [e.order, e.team, e.type, e.role, e.champion]);
const LRDD_FILE = 'scrims/2026-10-09-dd-core-vs-lr-core.json';
const DDIT_FILE = 'scrims/2026-10-11-dd-core-vs-it-core.json';
const CCLR_FILE = 'scrims/2026-10-11-cc-masters-vs-lr-masters.json';
// 固定データの行を手で並べた期待値。LR_DD_002 は BP順の昇順(順 4 の NOBAN は null、BAN の role は null)
const LRDD2_DRAFT = [
  [1, 'LR CORE', 'BAN', null, 'アニビア'], [2, 'DD CORE', 'BAN', null, 'リー・シン'], [3, 'LR CORE', 'BAN', null, 'ポッピー'], [4, 'DD CORE', 'BAN', null, null],
  [5, 'LR CORE', 'BAN', null, 'アーリ'], [6, 'DD CORE', 'BAN', null, 'パイク'], [7, 'LR CORE', 'PICK', 'JG', 'ウーコン'], [8, 'DD CORE', 'PICK', 'JG', 'リリア'],
  [9, 'DD CORE', 'PICK', 'ADC', 'ジン'], [10, 'LR CORE', 'PICK', 'ADC', 'エズリアル'], [11, 'LR CORE', 'PICK', 'SUP', 'ニーコ'], [12, 'DD CORE', 'PICK', 'SUP', 'ノーチラス'],
  [13, 'DD CORE', 'BAN', null, 'ガリオ'], [14, 'LR CORE', 'BAN', null, 'サイオン'], [15, 'DD CORE', 'BAN', null, 'ビクター'], [16, 'LR CORE', 'BAN', null, 'ツイステッド・フェイト'],
  [17, 'DD CORE', 'PICK', 'MID', 'ナフィーリ'], [18, 'LR CORE', 'PICK', 'MID', 'リサンドラ'], [19, 'LR CORE', 'PICK', 'TOP', 'カ・サンテ'], [20, 'DD CORE', 'PICK', 'TOP', 'ナー'],
];
// DD_IT_001 は順が無い: BAN(チーム1 IT → チーム2 DD、各チームは行の順)の後に PICK(IT → DD、TOP → JG → MID → ADC → SUP)
const DDIT1_BAN_IT = ['アイバーン', 'アーゴット', 'ノクターン', 'アニビア', 'ルシアン'];
const DDIT1_BAN_DD = ['ケイトリン', null, null, 'ヴェイン', 'ガリオ'];
const DDIT1_PICK = [
  [null, 'IT CORE', 'PICK', 'TOP', 'アンベッサ'], [null, 'IT CORE', 'PICK', 'JG', 'スカーナー'], [null, 'IT CORE', 'PICK', 'MID', 'リサンドラ'], [null, 'IT CORE', 'PICK', 'ADC', 'ユナラ'], [null, 'IT CORE', 'PICK', 'SUP', 'ノーチラス'],
  [null, 'DD CORE', 'PICK', 'TOP', 'レネクトン'], [null, 'DD CORE', 'PICK', 'JG', 'ドクター・ムンド'], [null, 'DD CORE', 'PICK', 'MID', 'ロック'], [null, 'DD CORE', 'PICK', 'ADC', 'ゼリ'], [null, 'DD CORE', 'PICK', 'SUP', 'ルル'],
];
const bans = (team: string, names: (string | null)[]) => names.map((c) => [null, team, 'BAN', null, c]);
// IT_CC_002 は PICK だけ(IT → CC)。固定データの選手の行(DETAIL2)のチャンピオンと同じ
const ITCC2_DRAFT = [
  [null, 'IT MASTERS', 'PICK', 'TOP', 'アンベッサ'], [null, 'IT MASTERS', 'PICK', 'JG', 'チョ＝ガス'], [null, 'IT MASTERS', 'PICK', 'MID', 'アーリ'], [null, 'IT MASTERS', 'PICK', 'ADC', 'ユナラ'], [null, 'IT MASTERS', 'PICK', 'SUP', 'ルル'],
  [null, 'CC MASTERS', 'PICK', 'TOP', 'ジリアン'], [null, 'CC MASTERS', 'PICK', 'JG', 'トランドル'], [null, 'CC MASTERS', 'PICK', 'MID', 'ビクター'], [null, 'CC MASTERS', 'PICK', 'ADC', 'ルシアン'], [null, 'CC MASTERS', 'PICK', 'SUP', 'ミリオ'],
];
const reasonsOf = (s: Row) => (s.draftSkipped as Row[]).map((x) => [x.id, (x.reason as string).slice(0, 3)]);

// --- 基準 44: BP詳細の行から draft を作る ---

test('基準44: BP順のそろう試合は BP順の昇順で、team・type・role・champion・order だけを写す(NOBAN の BAN は null、BAN の role は null)', () => {
  const { dir, summary } = runBp([matchOf(LRDD2)], [], bpOf(LRDD2));
  const [r] = read(dir, LRDD_FILE);
  assert.deepEqual(tuples(r.draft), LRDD2_DRAFT);
  assert.ok((r.draft as Row[]).every((e) => Object.keys(e).sort().join() === 'champion,order,role,team,type'));
  assert.deepEqual([summary.draftWritten, summary.draftSkipped, summary.withoutDraft], [[LRDD2], [], []]);
  // 行の並びを逆にしても order の昇順
  assert.deepEqual(tuples(read(runBp([matchOf(LRDD2)], [], [...bpOf(LRDD2)].reverse()).dir, LRDD_FILE)[0].draft), LRDD2_DRAFT);
});

test('基準44: BP順の無い試合は order が全要素 null。BAN の後に PICK、チーム1 → チーム2、PICK はロールの順、BAN は行の順。空の BAN は null', () => {
  const { dir } = runBp([matchOf(DDIT1)], [], bpOf(DDIT1));
  assert.deepEqual(tuples(read(dir, DDIT_FILE)[0].draft), [...bans('IT CORE', DDIT1_BAN_IT), ...bans('DD CORE', DDIT1_BAN_DD), ...DDIT1_PICK]);
  // 行の並びを逆にすると BAN だけが逆の順になる(PICK はロールの順のまま)
  const rev = runBp([matchOf(DDIT1)], [], [...bpOf(DDIT1)].reverse());
  assert.deepEqual(tuples(read(rev.dir, DDIT_FILE)[0].draft), [...bans('IT CORE', [...DDIT1_BAN_IT].reverse()), ...bans('DD CORE', [...DDIT1_BAN_DD].reverse()), ...DDIT1_PICK]);
});

test('基準44: PICK だけの試合で選手の行を持つ記録にも draft を書く(選手の行のチャンピオンと一致)', () => {
  const { dir, summary } = runBp([SCRIM2], DETAIL2, bpOf(ID2));
  const [r] = read(dir, SCRIM_FILE);
  assert.equal(r.resultOnly, undefined);
  assert.deepEqual(tuples(r.draft), ITCC2_DRAFT);
  assert.deepEqual(summary.draftWritten, [ID2]);
});

test('基準44: 「NO BAN」「noban」・空の BAN は null、BAN のチャンピオン名にも基準 35 の正規化をする', () => {
  const rows = setBp(setBp(setBp(setBp(bpOf(LRDD2), 1, { 'チャンピオン名': 'ジャーヴァンIV' }), 4, { 'チャンピオン名': 'NO BAN' }), 6, { 'チャンピオン名': ' noban ' }), 13, { 'チャンピオン名': '' });
  const d = tuples(read(runBp([matchOf(LRDD2)], [], rows).dir, LRDD_FILE)[0].draft);
  assert.deepEqual([d[0][4], d[3][4], d[5][4], d[12][4]], ['ジャーヴァンⅣ', null, null, null]);
});

test('基準44: BP順が一部の行にだけある・重複する・0 の試合は order を全要素 null にし、BAN → PICK の並びにする', () => {
  for (const rows of [setBp(bpOf(LRDD2), 5, { 'BP順': '' }), setBp(bpOf(LRDD2), 6, { 'BP順': 5 }), setBp(bpOf(LRDD2), 1, { 'BP順': 0 })]) {
    const d = tuples(read(runBp([matchOf(LRDD2)], [], rows).dir, LRDD_FILE)[0].draft);
    assert.ok(d.every((e) => e[0] === null));
    // チーム1 DD の BAN(行の順: リー・シン・NOBAN・パイク・ガリオ・ビクター)が先頭、DD の PICK は TOP ナー・JG リリア・MID ナフィーリ・ADC ジン・SUP ノーチラス
    assert.deepEqual(d.slice(0, 5).map((e) => e[4]), ['リー・シン', null, 'パイク', 'ガリオ', 'ビクター']);
    assert.deepEqual(d.slice(10, 15), [['TOP', 'ナー'], ['JG', 'リリア'], ['MID', 'ナフィーリ'], ['ADC', 'ジン'], ['SUP', 'ノーチラス']].map(([role, c]) => [null, 'DD CORE', 'PICK', role, c]));
  }
});

test('基準44: BP詳細の行が無い試合の記録には draft の欄を書かない(BP詳細の表が無い入力も)', () => {
  const a = run([SCRIM1, SCRIM2], DETAIL2); // 表そのものが無い
  assert.ok(read(a.dir, SCRIM_FILE).every((r) => !('draft' in r)));
  const b = runBp([SCRIM1, SCRIM2], DETAIL2, bpOf(ID2)); // SCRIM1(001)には行が無い
  assert.deepEqual(read(b.dir, SCRIM_FILE).map((r) => [r.game, 'draft' in r]), [[1, false], [2, true]]);
});

// --- 基準 45: draft を書かない試合 ---

test('基準45 (a): ロールの空の PICK(MASTERS CC 対 LR の 1 試合目)、PICK 4 行、ロールの重複は draft を書かずに記録を書き、試合 ID と条件を出す', () => {
  const { dir, summary } = runBp([matchOf(CCLR1)], [], bpOf(CCLR1));
  const [r] = read(dir, CCLR_FILE);
  assert.deepEqual([r.resultOnly, 'draft' in r], [true, false]);
  assert.deepEqual(summary.written, [{ file: CCLR_FILE, added: [CCLR1] }]);
  assert.deepEqual([reasonsOf(summary), summary.draftWritten], [[[CCLR1, '(a)']], []]);
  const four = bpOf(LRDD2).filter((x) => x['BP順'] !== 20); // DD の TOP の PICK を除く
  const dup = setBp(bpOf(LRDD2), 8, { 'ロール': 'TOP' }); // DD の PICK が TOP 2 つ・JG なし
  for (const rows of [four, dup]) {
    const s = runBp([matchOf(LRDD2)], [], rows);
    assert.equal('draft' in read(s.dir, LRDD_FILE)[0], false);
    assert.deepEqual(reasonsOf(s.summary), [[LRDD2, '(a)']]);
  }
});

test('基準45 (b): PICK のチャンピオン名が空か NOBAN の試合は draft を書かない', () => {
  for (const name of ['', 'No Ban']) {
    const s = runBp([matchOf(LRDD2)], [], setBp(bpOf(LRDD2), 7, { 'チャンピオン名': name }));
    assert.equal('draft' in read(s.dir, LRDD_FILE)[0], false);
    assert.deepEqual(reasonsOf(s.summary), [[LRDD2, '(b)']]);
  }
});

test('基準45 (c): 選手の行と食い違う PICK・一覧に無いチャンピオンの試合は draft を書かず、記録(選手の行)は書く', () => {
  const a = runBp([SCRIM2], yuhi({ 'チャンピオン名': 'アーリ' }), bpOf(ID2)); // 選手の行は CC の ADC がアーリ、BP詳細はルシアン
  const [r] = read(a.dir, SCRIM_FILE);
  assert.deepEqual([r.resultOnly, 'draft' in r, a.summary.written], [undefined, false, [{ file: SCRIM_FILE, added: [ID2] }]]);
  assert.deepEqual(reasonsOf(a.summary), [[ID2, '(c)']]);
  const b = runBp([matchOf(LRDD2)], [], setBp(bpOf(LRDD2), 7, { 'チャンピオン名': 'ナゾノチャンピオン' }));
  assert.equal('draft' in read(b.dir, LRDD_FILE)[0], false);
  assert.deepEqual(reasonsOf(b.summary), [[LRDD2, '(c)']]);
});

// --- 基準 46: 既存の記録に draft を足さない・食い違いは訂正の候補・置き換えには draft ---

test('基準46: draft の無い既存の記録には足さず、ファイル名・要素の番号・試合 ID を「draft の無い既存の記録」に出す(ltkdbMatchId の無い記録も)', () => {
  const { dir } = runBp([SCRIM2], DETAIL2, []);
  const before = raw(dir, SCRIM_FILE);
  const { summary } = runBp([SCRIM2], DETAIL2, bpOf(ID2), dir);
  assert.equal(raw(dir, SCRIM_FILE), before);
  assert.deepEqual([summary.withoutDraft, summary.draftWritten, summary.written, summary.corrections], [[{ file: SCRIM_FILE, index: 0, id: ID2 }], [], [], []]);
  // 配信の書き起こし(ltkdbMatchId なし、試合時間 31:58)も同じ試合として扱う
  const r = { ...read(dir, SCRIM_FILE)[0], source: { url: 'https://www.youtube.com/watch?v=stream' } };
  const other = root();
  mkdirSync(join(other, 'scrims'));
  writeFileSync(join(other, 'scrims/2026-10-13-stream-cc-vs-it.json'), JSON.stringify([r]));
  assert.deepEqual(runBp([SCRIM2], DETAIL2, bpOf(ID2), other).summary.withoutDraft, [{ file: 'scrims/2026-10-13-stream-cc-vs-it.json', index: 0, id: ID2 }]);
});

test('基準46: draft を持つ既存の記録は、一致すれば何も出さず、食い違えば書き換えずに欄 draft を両方の値とともに訂正の候補に出す', () => {
  const { dir } = runBp([matchOf(LRDD2)], [], bpOf(LRDD2));
  const before = raw(dir, LRDD_FILE);
  const same = runBp([matchOf(LRDD2)], [], bpOf(LRDD2), dir).summary;
  assert.deepEqual([same.corrections, same.withoutDraft, same.draftWritten], [[], [], []]);
  const { summary } = runBp([matchOf(LRDD2)], [], setBp(bpOf(LRDD2), 1, { 'チャンピオン名': 'アーリ' }), dir); // 順 1 の LR の BAN アニビア → アーリ
  assert.equal(raw(dir, LRDD_FILE), before);
  const [c] = summary.corrections as Row[];
  assert.deepEqual([(summary.corrections as Row[]).length, c.id, c.where, c.field], [1, LRDD2, `${LRDD_FILE}[0]`, 'draft']);
  assert.deepEqual([tuples(c.stored), tuples(c.ltkdb)[0], tuples(c.ltkdb).slice(1)], [LRDD2_DRAFT, [1, 'LR CORE', 'BAN', null, 'アーリ'], LRDD2_DRAFT.slice(1)]);
});

test('基準46・45 (c): 既存の記録の選手の行と食い違う BP詳細は訂正の候補にせず、基準 45 として出す', () => {
  const { dir } = runBp([SCRIM2], DETAIL2, bpOf(ID2));
  const before = raw(dir, SCRIM_FILE);
  const rows = bpOf(ID2).map((x) => (x['チーム名'] === 'CC' && x['ロール'] === 'ADC' ? { ...x, 'チャンピオン名': 'アーリ' } : x)); // 置き場の選手の行はルシアン
  const { summary } = runBp([SCRIM2], DETAIL2, rows, dir);
  assert.equal(raw(dir, SCRIM_FILE), before);
  assert.deepEqual([summary.corrections, reasonsOf(summary)], [[], [[ID2, '(c)']]]);
});

test('基準46: 結果だけの記録を選手の行を持つ記録で置き換えるとき、draft を含める', () => {
  const { dir } = runBp([{ ...SCRIM2, '試合時間': '' }], DETAIL2, []);
  assert.equal('draft' in read(dir, SCRIM_FILE)[0], false);
  const { summary } = runBp([SCRIM2], DETAIL2, bpOf(ID2), dir);
  const [r] = read(dir, SCRIM_FILE);
  assert.deepEqual([r.resultOnly, tuples(r.draft)], [undefined, ITCC2_DRAFT]);
  assert.deepEqual([summary.replaced, summary.draftWritten, summary.withoutDraft], [[{ file: SCRIM_FILE, index: 0, id: ID2 }], [ID2], []]);
});

// --- 基準 47: 要約、書いた draft が読み込み(F-006 基準 12)を通ること ---

test('基準47: 固定データの 15 試合を流すと、draft を書いた 14 試合・書かなかった 1 試合と条件を要約に出し、書いた draft は読み込みを通る', () => {
  const ids = BP['対戦結果まとめ'].map((m: Row) => m['試合ID'] as string);
  const { dir, summary } = runBp(BP['対戦結果まとめ'].map((m: Row) => (m['試合ID'] === ID2 ? SCRIM2 : m)), DETAIL2, BP['BP詳細']);
  assert.deepEqual([...(summary.draftWritten as string[])].sort(), ids.filter((id: string) => id !== CCLR1).sort());
  assert.deepEqual([reasonsOf(summary), summary.withoutDraft], [[[CCLR1, '(a)']], []]);
  const loaded = loadResults({ root: dir, champions: readChampionList(BP_CHAMPS).list });
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.games.filter((g) => g.draft !== null).length, 14);
  assert.equal(loaded.games.length, 15);
});
