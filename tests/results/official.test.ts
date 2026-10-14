// F-004 Task-3: 受入基準 8・9・10・11・20・24(本番の結果を results.json・連敗の数 k・予測の凍結へ)。実装より先に受入基準から書いた
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectResults } from '../../src/results/load.ts';
import type { ResultFile } from '../../src/results/load.ts';
import { buildResultsFile, losingStreakOf, resultGamesOf, resultsSummaryOf, teamStreaksOf } from '../../src/results/official.ts';
import { forecastOf, freezeForecasts, NO_TABLE_BEFORE_MATCH } from '../../src/results/forecast.ts';
import { ROSTER } from '../../src/data/roster.ts';
import { MASTERS_CUPS, REGULAR_DAYS } from '../../src/sim/schedule.ts';
import { TEAMS, TIERS } from '../../src/sim/types.ts';

type Row = Record<string, unknown>;
const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'] as const;
const SOURCE = { url: 'https://www.youtube.com/watch?v=f004-task3', resultScreenSec: 5400 };

/** 階級チーム(例 'LR CORE')の名簿の 5 人。各 2 キル・2 デス・4 アシスト・10,000 ゴールド・10,000 ダメージ */
const teamOf = (label: string): Row => {
  const [team, tier] = label.split(' ');
  const players = ROLES.map((role) => {
    const p = ROSTER.find((x) => x.team === team && x.tier === tier && x.role === role)!;
    return { role, rosterName: p.name, mappingConfidence: '確信(名簿の Riot ID と一致)', champion: null, kills: 2, deaths: 2, assists: 4, gold: 10000, damage: 10000 };
  });
  return { kills: 10, deaths: 10, assists: 20, gold: 50000, players };
};
/** 1 試合の記録。a・b・winner は階級チームの表記(例 'DD CORE') */
const rec = (a: string, b: string, winner: string, over: Row): Row => ({
  kind: 'scrim', listeners: false, source: SOURCE, duration: '30:00', winner, teams: { [a]: teamOf(a), [b]: teamOf(b) }, ...over,
});
/** Regular Stage の本番の記録(日程の day 日目。blue・red・winner はチーム) */
const rs = (day: number, blue: string, red: string, tier: 'NEXT' | 'CORE', winner: string): Row => {
  const [b, r] = [`${blue} ${tier}`, `${red} ${tier}`];
  return rec(b, r, `${winner} ${tier}`, {
    kind: 'official', date: REGULAR_DAYS.find((x) => x.day === day)!.date, stage: 'regular', day, tier, match: null, game: 1, sides: { [b]: 'ブルー', [r]: 'レッド' },
  });
};
/** MASTERS CUP の本番の記録(第 cup 回の match のゲーム game) */
const mc = (cup: number, match: string, a: string, b: string, winner: string, game = 1): Row =>
  rec(`${a} MASTERS`, `${b} MASTERS`, `${winner} MASTERS`, {
    kind: 'official', date: MASTERS_CUPS.find((c) => c.cup === cup)!.date, stage: 'masters', day: cup, tier: 'MASTERS', match, game,
  });
/** Playoffs の本番の記録 */
const po = (date: string, match: string, game: number, tier: string, a: string, b: string, winner: string): Row =>
  rec(`${a} ${tier}`, `${b} ${tier}`, `${winner} ${tier}`, { kind: 'official', date, stage: 'playoffs', day: null, tier, match, game });
/** スクリムの記録(a・b・winner は階級チームの表記) */
const sc = (date: string, a: string, b: string, winner: string, duration: string, over: Row = {}): Row => rec(a, b, winner, { date, duration, ...over });

/** 記録を置き場・試合日ごとのファイルにして読む(ファイルの中は渡した順)。検証に反したら失敗させる */
function load(records: Row[]) {
  const files = new Map<string, ResultFile>();
  for (const r of records) {
    const kind = r.kind as 'official' | 'scrim';
    const key = `${kind}|${r.date}`;
    if (!files.has(key)) files.set(key, { file: `${r.date}-fixture.json`, kind, raw: [] });
    (files.get(key)!.raw as Row[]).push(r);
  }
  const loaded = collectResults([...files.values()]);
  assert.deepEqual(loaded.errors, [], 'テストの記録が検証を通る');
  return loaded;
}
const ids = (games: readonly { matchId: string }[]) => games.map((g) => g.matchId);
const byId = <T extends { matchId: string }>(games: readonly T[], id: string): T => {
  const g = games.find((x) => x.matchId === id);
  assert.ok(g, `${id} が games[] にある`);
  return g;
};

/** NEXT の Regular Stage 3 日分。DD は 3 連敗、CC は 勝ち → 負け → 負け、IT は 3 連勝、LR は 負け → 勝ち → 勝ち */
const next3Days = (): Row[] => [
  rs(1, 'CC', 'DD', 'NEXT', 'CC'), rs(1, 'IT', 'LR', 'NEXT', 'IT'),
  rs(2, 'CC', 'LR', 'NEXT', 'LR'), rs(2, 'DD', 'IT', 'NEXT', 'IT'),
  rs(3, 'LR', 'DD', 'NEXT', 'LR'), rs(3, 'IT', 'CC', 'NEXT', 'IT'),
];
/** MASTERS CUP 第 1 回。準決勝は DD・IT の勝ち、3 位決定戦は CC の勝ち、決勝は IT → DD → IT */
const cup1 = (): Row[] => [
  mc(1, 'semi1', 'DD', 'CC', 'DD'), mc(1, 'semi2', 'IT', 'LR', 'IT'), mc(1, 'third', 'CC', 'LR', 'CC'),
  mc(1, 'final', 'DD', 'IT', 'IT', 1), mc(1, 'final', 'DD', 'IT', 'DD', 2), mc(1, 'final', 'DD', 'IT', 'IT', 3),
];

// ---- 基準8: F-005 の結果の入力 games[] ----

test('基準8: 本番の記録を games[] の 1 要素(matchId・date・stage・day・tier・teams・winner・kind・source)にする', () => {
  const games = resultGamesOf(load([rs(1, 'CC', 'DD', 'NEXT', 'CC'), mc(1, 'final', 'DD', 'IT', 'IT', 2), po('2026-11-21', 'upperFinal', 1, 'CORE', 'DD', 'CC', 'DD')]).games);
  const listed = games.map((g) => ({ matchId: g.matchId, date: g.date, stage: g.stage, day: g.day, tier: g.tier, teams: g.teams, winner: g.winner, kind: g.kind, source: g.source }));
  assert.deepEqual(listed, [
    { matchId: 'RS-1-CC-DD-NEXT', date: '2026-10-15', stage: 'regular', day: 1, tier: 'NEXT', teams: ['CC-NEXT', 'DD-NEXT'], winner: 'CC-NEXT', kind: 'official', source: SOURCE },
    { matchId: 'MC1-final-G2', date: '2026-10-20', stage: 'masters', day: 1, tier: 'MASTERS', teams: ['DD-MASTERS', 'IT-MASTERS'], winner: 'IT-MASTERS', kind: 'official', source: SOURCE },
    { matchId: 'PO-upperFinal-G1', date: '2026-11-21', stage: 'playoffs', day: null, tier: 'CORE', teams: ['CC-CORE', 'DD-CORE'], winner: 'DD-CORE', kind: 'official', source: SOURCE },
  ]);
});

test('基準8: games[] は試合日の昇順、同じ日は日程の順(Regular Stage はカードの順に NEXT → CORE、MASTERS CUP は semi1 → semi2 → third → final の G1 → G3、Playoffs は upperFinal → lowerSemi と lowerFinal → grandFinal で各マッチは G1 から)', () => {
  // 記録は日程と逆の順に置く
  const loaded = load([
    po('2026-11-22', 'grandFinal', 1, 'NEXT', 'DD', 'CC', 'DD'), po('2026-11-22', 'lowerFinal', 1, 'NEXT', 'CC', 'IT', 'CC'),
    po('2026-11-21', 'lowerSemi', 2, 'CORE', 'IT', 'LR', 'IT'), po('2026-11-21', 'upperFinal', 2, 'CORE', 'DD', 'CC', 'DD'),
    po('2026-11-21', 'lowerSemi', 1, 'NEXT', 'IT', 'LR', 'IT'), po('2026-11-21', 'upperFinal', 1, 'NEXT', 'DD', 'CC', 'DD'),
    mc(1, 'final', 'DD', 'IT', 'IT', 3), mc(1, 'third', 'CC', 'LR', 'CC'), mc(1, 'final', 'DD', 'IT', 'IT', 1),
    mc(1, 'semi2', 'IT', 'LR', 'IT'), mc(1, 'final', 'DD', 'IT', 'DD', 2), mc(1, 'semi1', 'DD', 'CC', 'DD'),
    rs(1, 'IT', 'LR', 'CORE', 'IT'), rs(1, 'CC', 'DD', 'CORE', 'DD'), rs(1, 'IT', 'LR', 'NEXT', 'IT'), rs(1, 'CC', 'DD', 'NEXT', 'CC'),
  ]);
  const expected = [
    'RS-1-CC-DD-NEXT', 'RS-1-CC-DD-CORE', 'RS-1-IT-LR-NEXT', 'RS-1-IT-LR-CORE',
    'MC1-semi1-G1', 'MC1-semi2-G1', 'MC1-third-G1', 'MC1-final-G1', 'MC1-final-G2', 'MC1-final-G3',
    'PO-upperFinal-G1', 'PO-upperFinal-G2', 'PO-lowerSemi-G1', 'PO-lowerSemi-G2',
    'PO-lowerFinal-G1', 'PO-grandFinal-G1',
  ];
  assert.deepEqual(ids(resultGamesOf(loaded.games)), expected);
  assert.deepEqual(ids(resultGamesOf([...loaded.games].reverse())), expected, '渡した並びに依らない');
});

// ---- 基準20: スクリムの記録も games[] に書く ----

test('基準20: スクリムの記録は kind "scrim" と試合 ID SC-… で games[] に入り、リスナー参加・重複で除いた記録は入らない。θ への重みの欄を持たない', () => {
  const loaded = collectResults([
    { file: '2026-10-10-lr-core-vs-dd-core-a.json', kind: 'scrim', raw: [
      sc('2026-10-10', 'LR CORE', 'DD CORE', 'DD CORE', '30:00'), sc('2026-10-10', 'LR CORE', 'DD CORE', 'LR CORE', '31:00'),
      sc('2026-10-10', 'LR CORE', 'DD CORE', 'DD CORE', '32:00', { listeners: true }),
    ] },
    // 別の配信から書き起こした同じ試合(基準7 の重複)
    { file: '2026-10-10-lr-core-vs-dd-core-b.json', kind: 'scrim', raw: [sc('2026-10-10', 'LR CORE', 'DD CORE', 'DD CORE', '30:00')] },
    { file: '2026-10-15-regular-day1.json', kind: 'official', raw: [rs(1, 'CC', 'DD', 'NEXT', 'CC')] },
  ]);
  assert.deepEqual(loaded.errors, []);
  assert.deepEqual(loaded.excluded.map((x) => x.reason).sort(), ['リスナー参加', '重複']);
  const games = resultGamesOf(loaded.games);
  assert.deepEqual(games.map((g) => [g.matchId, g.kind, g.date, g.teams, g.winner]), [
    ['SC-20261010-DD-CORE-LR-CORE-G1', 'scrim', '2026-10-10', ['DD-CORE', 'LR-CORE'], 'DD-CORE'],
    ['SC-20261010-DD-CORE-LR-CORE-G2', 'scrim', '2026-10-10', ['DD-CORE', 'LR-CORE'], 'LR-CORE'],
    ['RS-1-CC-DD-NEXT', 'official', '2026-10-15', ['CC-NEXT', 'DD-NEXT'], 'CC-NEXT'],
  ]);
  assert.equal(games[0].source.url, SOURCE.url);
  for (const g of games) assert.deepEqual(Object.keys(g).filter((k) => /weight/i.test(k)), [], `${g.matchId} に重みの欄が無い`);
});

// ---- 基準9: 連敗の数 k と勝敗の並び ----

test('基準9: 階級チームごとに、連敗の数 k(直前の本番から遡って続いた負けの数。勝てば 0)と本番の勝敗の並び(新しい順)を出す', () => {
  // 3 日目の後のスクリムで DD NEXT が IT NEXT に勝つ。スクリムは k にも並びにも数えない
  const games = resultGamesOf(load([...next3Days(), sc('2026-10-24', 'DD NEXT', 'IT NEXT', 'DD NEXT', '30:00')]).games);
  const teams = teamStreaksOf(games);
  const of = (key: string) => {
    const t = teams.filter((x) => x.key === key);
    assert.equal(t.length, 1, `${key} は 1 行`);
    return [t[0].k, t[0].form];
  };
  assert.deepEqual(of('CC-NEXT'), [2, 'LLW']);
  assert.deepEqual(of('DD-NEXT'), [3, 'LLL']);
  assert.deepEqual(of('IT-NEXT'), [0, 'WWW']);
  assert.deepEqual(of('LR-NEXT'), [0, 'WWL']);
  assert.deepEqual(of('DD-CORE'), [0, ''], '本番の記録が無い階級チームは k = 0');
  assert.deepEqual(teams.map((t) => t.key).sort(), TIERS.flatMap((tier) => TEAMS.map((team) => `${team}-${tier}`)).sort(), '12 の階級チームを 1 行ずつ');
});

test('基準9: MASTERS CUP の決勝の各ゲームは 1 試合ずつ数える', () => {
  const teams = teamStreaksOf(resultGamesOf(load(cup1().reverse()).games));
  const of = (key: string) => teams.filter((x) => x.key === key).map((t) => [t.k, t.form]);
  assert.deepEqual(of('DD-MASTERS'), [[1, 'LWLW']], '決勝 G3 負け・G2 勝ち・G1 負け・準決勝 勝ち');
  assert.deepEqual(of('IT-MASTERS'), [[0, 'WLWW']]);
  assert.deepEqual(of('CC-MASTERS'), [[0, 'WL']], '3 位決定戦 勝ち・準決勝 負け');
  assert.deepEqual(of('LR-MASTERS'), [[2, 'LL']]);
});

test('基準9: 試合日を渡せば、その日より前の本番だけで数えた k を返す(気持ちの補正の kA・kB に渡す値)', () => {
  const games = resultGamesOf(load([...next3Days(), sc('2026-10-16', 'CC NEXT', 'DD NEXT', 'DD NEXT', '30:00')]).games);
  assert.equal(losingStreakOf(games, 'CC-NEXT'), 2);
  assert.equal(losingStreakOf(games, 'CC-NEXT', '2026-10-23'), 1, '3 日目の試合の前は、2 日目の 1 敗');
  assert.equal(losingStreakOf(games, 'CC-NEXT', '2026-10-19'), 0, '2 日目の試合の前は、1 日目の勝ち');
  assert.equal(losingStreakOf(games, 'DD-NEXT', '2026-10-23'), 2, 'スクリムの勝ちでは 0 に戻らない');
  assert.equal(losingStreakOf(games, 'DD-NEXT', '2026-10-15'), 0, '本番の前は 0');
  assert.equal(losingStreakOf(games, 'IT-NEXT'), 0);
  assert.equal(losingStreakOf(games, 'DD-CORE'), 0);
});

// ---- 基準10: 勝率表の results の欄 ----

test('基準10: 本番の試合数・スクリムの試合数・最新の試合日を返す。本番の記録が無ければ null', () => {
  const scrims = () => [sc('2026-10-10', 'LR CORE', 'DD CORE', 'DD CORE', '30:00'), sc('2026-10-10', 'LR CORE', 'DD CORE', 'DD CORE', '31:00')];
  const games = resultGamesOf(load([...scrims(), rs(1, 'CC', 'DD', 'NEXT', 'CC'), rs(2, 'CC', 'LR', 'NEXT', 'LR'), rs(2, 'DD', 'IT', 'NEXT', 'IT')]).games);
  assert.deepEqual(resultsSummaryOf(games), { official: 3, scrim: 2, latestDate: '2026-10-19' });
  assert.equal(resultsSummaryOf(resultGamesOf(load(scrims()).games)), null, 'スクリムだけ');
  assert.equal(resultsSummaryOf([]), null, '記録なし');
});

// ---- 基準11: 予測と凍結 ----

/** 勝率表(data/public/winrates.json)のうち、予測に使う欄だけ */
const table = (computedAt: string): Row => ({
  kind: 'winrates', computedAt,
  matches: [
    { stage: 'regular', day: 1, tier: 'NEXT', a: 'CC', b: 'DD', pA: 61.3, pB: 38.7 },
    { stage: 'regular', day: 1, tier: 'CORE', a: 'CC', b: 'DD', pA: 45, pB: 55 },
    { stage: 'regular', day: 3, tier: 'NEXT', a: 'LR', b: 'DD', pA: 70, pB: 30 },
    { stage: 'masters', cup: 1, tier: 'MASTERS', a: 'DD', b: 'CC', pA: 58.2, pB: 41.8 },
    { stage: 'masters', cup: 1, tier: 'MASTERS', a: 'IT', b: 'LR', pA: 66, pB: 34 },
  ],
  stageWinTables: {
    regular: { NEXT: { 'CC>DD': 0.5 }, CORE: {}, MASTERS: {} },
    masters: { NEXT: {}, CORE: {}, MASTERS: { 'DD>IT': 0.37200000000000005, 'CC>LR': 0.558 } },
    playoffs: { NEXT: { 'CC>DD': 0.431 }, CORE: {}, MASTERS: {} },
  },
});
const NO_TABLE = '試合日より前の勝率表が無い';

test('基準11: 予測は、試合日の 0 時(JST)より前に計算した勝率表の、その試合の両チームの勝率と computedAt', () => {
  const at = '2026-10-14T03:00:00.000Z';
  const games = resultGamesOf(load([
    rs(1, 'CC', 'DD', 'NEXT', 'CC'), rs(3, 'LR', 'DD', 'NEXT', 'LR'), mc(1, 'semi1', 'DD', 'CC', 'DD'), mc(1, 'third', 'CC', 'LR', 'CC'),
    mc(1, 'final', 'DD', 'IT', 'IT', 2), po('2026-11-21', 'upperFinal', 1, 'NEXT', 'DD', 'CC', 'DD'),
  ]).games);
  const f = (id: string) => forecastOf(byId(games, id), table(at));
  assert.deepEqual(f('RS-1-CC-DD-NEXT'), { forecast: { pA: 61.3, pB: 38.7, computedAt: at }, forecastReason: null });
  // pA は games[].teams の 1 つ目、pB は 2 つ目の勝率。勝率表の a・b(ブルー・レッド)の向きが逆なら入れ替える
  assert.deepEqual(byId(games, 'RS-3-LR-DD-NEXT').teams, ['DD-NEXT', 'LR-NEXT']);
  assert.deepEqual(f('RS-3-LR-DD-NEXT').forecast, { pA: 30, pB: 70, computedAt: at });
  assert.deepEqual(f('MC1-semi1-G1').forecast, { pA: 41.8, pB: 58.2, computedAt: at });
  // 勝率表の matches[] に無い組(3 位決定戦・決勝・Playoffs)は、ステージごとの勝率表 stageWinTables から引く
  assert.deepEqual(f('MC1-third-G1').forecast, { pA: 55.8, pB: 44.2, computedAt: at });
  assert.deepEqual(f('MC1-final-G2').forecast, { pA: 37.2, pB: 62.8, computedAt: at });
  assert.deepEqual(f('PO-upperFinal-G1').forecast, { pA: 43.1, pB: 56.9, computedAt: at });
});

test('基準11: 試合日より前に計算した勝率表が無ければ forecast は null で、理由「試合日より前の勝率表が無い」', () => {
  const [g] = resultGamesOf(load([rs(1, 'CC', 'DD', 'NEXT', 'CC')]).games); // 試合日 2026-10-15
  const none = { forecast: null, forecastReason: NO_TABLE };
  assert.equal(NO_TABLE_BEFORE_MATCH, NO_TABLE);
  assert.deepEqual(forecastOf(g, null), none, '前回の勝率表が無い');
  assert.deepEqual(forecastOf(g, undefined), none, '前回の勝率表が無い');
  assert.deepEqual(forecastOf(g, table('2026-10-15T03:00:00.000Z')), none, '試合日に計算した勝率表');
  assert.deepEqual(forecastOf(g, table('2026-10-14T15:00:00.000Z')), none, '試合日の 0 時(JST)ちょうど');
  assert.deepEqual(forecastOf(g, table('2026-10-14T14:59:59.999Z')).forecast, { pA: 61.3, pB: 38.7, computedAt: '2026-10-14T14:59:59.999Z' }, '0 時(JST)の直前');
  assert.deepEqual(forecastOf(g, { kind: 'winrates', matches: [] }), none, 'computedAt の無い勝率表');
});

test('基準11: 本番の記録を初めて読んだ集計で予測を書き、以後の集計では前回の results.json の forecast を引き継いで書き換えない', () => {
  const frozen = { pA: 61.3, pB: 38.7, computedAt: '2026-10-14T03:00:00.000Z' };
  // 1 回目: 1 日目の NEXT の記録を初めて読む。前回の勝率表は開幕前(2026-10-14)の計算
  const run1 = freezeForecasts(resultGamesOf(load([rs(1, 'CC', 'DD', 'NEXT', 'CC')]).games), null, table('2026-10-14T03:00:00.000Z'));
  assert.deepEqual(run1.map((g) => [g.matchId, g.forecast]), [['RS-1-CC-DD-NEXT', frozen]]);
  // 2 回目: CORE の記録が増えた。前回の勝率表は試合日の後(2026-10-16)に計算した別の値
  const later = { ...table('2026-10-16T03:00:00.000Z'), matches: [{ stage: 'regular', day: 1, tier: 'NEXT', a: 'CC', b: 'DD', pA: 80, pB: 20 }, { stage: 'regular', day: 1, tier: 'CORE', a: 'CC', b: 'DD', pA: 45, pB: 55 }] };
  const second = () => resultGamesOf(load([rs(1, 'CC', 'DD', 'NEXT', 'CC'), rs(1, 'CC', 'DD', 'CORE', 'DD')]).games);
  const run2 = freezeForecasts(second(), { kind: 'results', games: run1 }, later);
  assert.deepEqual(byId(run2, 'RS-1-CC-DD-NEXT').forecast, frozen, '前回の forecast を引き継ぐ');
  assert.equal(byId(run2, 'RS-1-CC-DD-CORE').forecast, null, '初めて読んだ記録: 試合日より前の勝率表が無い');
  assert.equal(byId(run2, 'RS-1-CC-DD-CORE').forecastReason, NO_TABLE);
  // 3 回目: 前回のファイルはディスクから読んだ JSON。試合日より前の勝率表が渡っても、null の予測を含めて書き換えない
  const prev = JSON.parse(JSON.stringify({ kind: 'results', games: run2 }));
  const run3 = freezeForecasts(second(), prev, table('2026-10-14T03:00:00.000Z'));
  assert.deepEqual(byId(run3, 'RS-1-CC-DD-NEXT').forecast, frozen);
  assert.equal(byId(run3, 'RS-1-CC-DD-CORE').forecast, null);
  assert.equal(byId(run3, 'RS-1-CC-DD-CORE').forecastReason, NO_TABLE);
  // 前回の results.json が無い・形が違うときは、初めて読んだ記録として扱う
  for (const broken of [undefined, { kind: 'other' }, { kind: 'results', games: 'x' }]) {
    assert.deepEqual(byId(freezeForecasts(second(), broken, table('2026-10-14T03:00:00.000Z')), 'RS-1-CC-DD-CORE').forecast, { pA: 45, pB: 55, computedAt: '2026-10-14T03:00:00.000Z' });
  }
});

// ---- results.json の全体と再現性(基準 8・9・11・20・24) ----

test('基準24: 同じ記録・同じ基準日・同じ前回のファイルから同じ results.json を作る(渡した記録の並びにも依らない)', () => {
  const records = () => [
    ...next3Days(), ...cup1(),
    sc('2026-10-10', 'LR CORE', 'DD CORE', 'DD CORE', '30:00'), sc('2026-10-10', 'LR CORE', 'DD CORE', 'LR CORE', '31:00'), sc('2026-10-11', 'DD NEXT', 'IT NEXT', 'IT NEXT', '30:00'),
  ];
  const input = (games: ReturnType<typeof load>['games']) => ({ games, computedAt: '2026-10-24T03:00:00.000Z', prevResults: null, prevWinrates: table('2026-10-14T03:00:00.000Z') });
  const a = buildResultsFile(input(load(records()).games));
  const b = buildResultsFile(input([...load(records()).games].reverse()));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.kind, 'results');
  assert.equal(a.computedAt, '2026-10-24T03:00:00.000Z');
  assert.deepEqual(ids(a.games), [
    'SC-20261010-DD-CORE-LR-CORE-G1', 'SC-20261010-DD-CORE-LR-CORE-G2', 'SC-20261011-DD-NEXT-IT-NEXT-G1',
    'RS-1-CC-DD-NEXT', 'RS-1-IT-LR-NEXT', 'RS-2-CC-LR-NEXT', 'RS-2-DD-IT-NEXT',
    'MC1-semi1-G1', 'MC1-semi2-G1', 'MC1-third-G1', 'MC1-final-G1', 'MC1-final-G2', 'MC1-final-G3',
    'RS-3-LR-DD-NEXT', 'RS-3-IT-CC-NEXT',
  ]);
  const streak = Object.fromEntries(a.teams.map((t) => [t.key, [t.k, t.form]]));
  assert.deepEqual([streak['CC-NEXT'], streak['DD-NEXT'], streak['LR-MASTERS'], streak['DD-MASTERS'], streak['LR-CORE']], [[2, 'LLW'], [3, 'LLL'], [2, 'LL'], [1, 'LWLW'], [0, '']]);
  assert.deepEqual(byId(a.games, 'RS-1-CC-DD-NEXT').forecast, { pA: 61.3, pB: 38.7, computedAt: '2026-10-14T03:00:00.000Z' });
  assert.deepEqual(byId(a.games, 'MC1-final-G1').forecast, { pA: 37.2, pB: 62.8, computedAt: '2026-10-14T03:00:00.000Z' });
  assert.ok(!/weight/i.test(JSON.stringify(a)), 'θ への重みを持たない(基準20)');
  // 前回の results.json を渡して作り直しても、予測は変わらない(基準11)
  const again = buildResultsFile({ ...input(load(records()).games), computedAt: '2026-10-25T03:00:00.000Z', prevResults: JSON.parse(JSON.stringify(a)), prevWinrates: table('2026-10-24T03:00:00.000Z') });
  assert.deepEqual(again.games, a.games);
  assert.deepEqual(again.teams, a.teams);
});
