// F-001 Task-3: 受入基準 9〜16(QC-02・QC-03)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { simulate, validateWinTable, uniformWinTable } from '../../src/sim/index.ts';
import type { WinTable, SimInput } from '../../src/sim/index.ts';
import { TEAMS } from '../../src/sim/types.ts';

const even = uniformWinTable(0.5);
/** DD がすべての階級で全チームに勝率 p、ほかは互角 */
const ddStrong = (p: number): WinTable => {
  const t = uniformWinTable(0.5);
  for (const tier of ['NEXT', 'CORE', 'MASTERS'] as const) for (const o of ['CC', 'IT', 'LR']) t[tier][`DD>${o}`] = p;
  return t;
};
const base = (over: Partial<SimInput> = {}): SimInput => ({ winTable: even, trials: 2000, seed: 42, ...over });
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test('AC9: 確率の表を返す(各チームのシード1〜4位の確率と優勝確率)', () => {
  const r = simulate(base());
  for (const t of TEAMS) {
    assert.equal(r.seedProbability[t].length, 4);
    assert.ok(r.championProbability[t] > 0.15 && r.championProbability[t] < 0.35);
  }
});

test('AC9: 確定済みの試合は結果どおりに扱う(DD が RS 全勝・MC 全優勝なら 1位シード確率 100%)', () => {
  const regular = [] as NonNullable<SimInput['results']>['regular'];
  const days: [number, string, string][] = [[1, 'CC', 'DD'], [2, 'DD', 'IT'], [3, 'LR', 'DD'], [4, 'DD', 'CC'], [5, 'IT', 'DD'], [6, 'DD', 'LR']];
  for (const [day, a, b] of days) for (const tier of ['NEXT', 'CORE'] as const) regular!.push({ day, teams: [a, b] as any, tier, winner: 'DD' });
  const masters = [1, 2, 3].flatMap((cup) => [
    { cup, match: 'semi1' as const, winner: 'DD' as const },
    { cup, match: 'final' as const, winner: 'DD' as const },
  ]);
  const r = simulate(base({ results: { regular, masters } }));
  assert.equal(r.seedProbability.DD[0], 1);
});

test('AC9: 勝率表に従う(DD が全階級 90% なら優勝確率が最大で 50% を超える)', () => {
  const r = simulate(base({ winTable: ddStrong(0.9) }));
  assert.ok(r.championProbability.DD > 0.5);
  for (const t of ['CC', 'IT', 'LR'] as const) assert.ok(r.championProbability.DD > r.championProbability[t]);
});

test('AC10: 同じ入力と乱数の種なら同じ確率を返す (QC-02)', () => {
  assert.deepEqual(simulate(base({ winTable: ddStrong(0.7) })), simulate(base({ winTable: ddStrong(0.7) })));
});

test('AC10: 乱数の種が違えば結果の分布の標本が変わる', () => {
  assert.notDeepEqual(simulate(base({ seed: 1 })).championProbability, simulate(base({ seed: 2 })).championProbability);
});

test('AC11: 優勝確率の合計と、各チームのシード確率の合計は 1 から 1e-9 未満のずれ (QC-03)', () => {
  const r = simulate(base({ winTable: ddStrong(0.65) }));
  assert.ok(Math.abs(sum(TEAMS.map((t) => r.championProbability[t])) - 1) < 1e-9);
  for (const t of TEAMS) assert.ok(Math.abs(sum(r.seedProbability[t]) - 1) < 1e-9);
  for (let s = 0; s < 4; s++) assert.ok(Math.abs(sum(TEAMS.map((t) => r.seedProbability[t][s])) - 1) < 1e-9);
});

test('AC12: 勝率表に 0 未満・1 超・数値でない値があるとエラー(階級と組を含む)', () => {
  for (const bad of [-0.1, 1.1, Number.NaN, '0.5' as unknown as number]) {
    const t = uniformWinTable(0.5);
    t.CORE['CC>LR'] = bad;
    assert.throws(() => simulate(base({ winTable: t })), /CORE.*CC.*LR/);
  }
});

test('AC12: 対戦に必要な組の勝率が無いとエラー(階級と組を含む)', () => {
  const t = uniformWinTable(0.5);
  delete t.NEXT['IT>LR'];
  delete t.NEXT['LR>IT'];
  assert.throws(() => validateWinTable(t), /NEXT.*(IT.*LR|LR.*IT)/);
});

test('AC13: 日程に無い対戦の結果はエラー(結果を特定できる内容を含む)', () => {
  assert.throws(
    () => simulate(base({ results: { regular: [{ day: 1, teams: ['DD', 'IT'], tier: 'NEXT', winner: 'DD' }] } })),
    /day 1.*DD.*IT/,
  );
  assert.throws(() => simulate(base({ results: { masters: [{ cup: 1, match: 'semi1', winner: 'IT' }] } })), /cup 1.*semi1.*IT/);
});

test('AC14: src/sim は Node 固有の API と DOM を参照しない', () => {
  for (const f of readdirSync('src/sim')) {
    const src = readFileSync(`src/sim/${f}`, 'utf8');
    assert.doesNotMatch(src, /from ['"]node:|require\(|\bwindow\.|\bdocument\./, f);
  }
});

test('AC15: ブルーサイド補正は RS の結果を変え、MC・Playoffs の勝率には使わない', () => {
  const plain = simulate(base({ trials: 3000 }));
  const biased = simulate(base({ trials: 3000, blueSideBias: { NEXT: 3, CORE: 3, MASTERS: 3 } }));
  assert.notDeepEqual(plain.expectedRegularPoints, biased.expectedRegularPoints);
  // CC は RS 6日のうちブルーが4回で最多。補正で RS の期待 pt が上がる
  assert.ok(biased.expectedRegularPoints.CC > plain.expectedRegularPoints.CC);
  // MASTERS CUP にはサイドの補正が無いので期待 pt は変わらない(同じ乱数の列を使う)
  assert.deepEqual(plain.expectedMastersPoints, biased.expectedMastersPoints);
});

test('AC16: Playoffs だけ別の勝率表を与えると Playoffs の結果だけが変わる', () => {
  const plain = simulate(base());
  const po = simulate(base({ stageWinTables: { playoffs: ddStrong(0.99) } }));
  assert.deepEqual(plain.seedProbability, po.seedProbability);
  assert.ok(po.championProbability.DD > plain.championProbability.DD + 0.2);
});

test('AC9: 既定の試行回数は 10,000 回', () => {
  const r = simulate({ winTable: even, seed: 1 });
  assert.equal(r.trials, 10000);
});

// F-005 Task-3(仕上がりの項): 試合日ごとの勝率表
test('F-005 基準9: dayWinTables で日(Regular Stage)とカップ(MASTERS CUP)ごとの勝率表を与えると、その日の試合だけがその表に従い、無い日はステージの表を使う', () => {
  const plain = simulate(base());
  // DD>x の片方向だけを持つ表(ddStrong は x>DD = 0.5 も持ち、CC がブルーの第1日は CC>DD が直接引かれて DD が有利にならない。基準12 の「片方向だけあれば逆は 1−p」を使う)
  const ddOnly = (p: number): WinTable => {
    const t = ddStrong(p);
    for (const tier of ['NEXT', 'CORE', 'MASTERS'] as const) for (const o of ['CC', 'IT', 'LR']) delete t[tier][`${o}>DD`];
    return t;
  };
  // 第1日だけ DD が全階級で必ず勝つ(ほかの日は互角)
  const day1 = simulate(base({ dayWinTables: { regular: { 1: ddOnly(1) } } }));
  assert.ok(day1.expectedRegularPoints.DD > plain.expectedRegularPoints.DD + 1.5, `${day1.expectedRegularPoints.DD}`);
  assert.deepEqual(day1.expectedMastersPoints, plain.expectedMastersPoints, 'MASTERS CUP は変わらない');
  // 第1日の表を全日に与えたときと、ステージの表に与えたときは同じ結果
  const all = simulate(base({ dayWinTables: { regular: { 1: ddOnly(1), 2: ddOnly(1), 3: ddOnly(1), 4: ddOnly(1), 5: ddOnly(1), 6: ddOnly(1) } } }));
  assert.deepEqual(all, simulate(base({ stageWinTables: { regular: ddOnly(1) } })));
  // CUP 1 だけ DD が必ず勝つ: CUP 1 の 3pt は確定、ほかは互角
  const cup1 = simulate(base({ dayWinTables: { masters: { 1: ddOnly(1) } } }));
  assert.ok(cup1.expectedMastersPoints.DD > plain.expectedMastersPoints.DD + 1, `${cup1.expectedMastersPoints.DD}`);
  assert.deepEqual(cup1.expectedRegularPoints, plain.expectedRegularPoints, 'Regular Stage は変わらない');
  // 日の表も検証する(AC12 と同じ)
  const bad = uniformWinTable(0.5);
  bad.NEXT['DD>CC'] = 1.5;
  assert.throws(() => simulate(base({ dayWinTables: { regular: { 2: bad } } })), /NEXT.*DD vs CC/);
  // 同じ入力と種なら同じ結果
  assert.deepEqual(simulate(base({ dayWinTables: { regular: { 3: ddOnly(0.9) } } })), simulate(base({ dayWinTables: { regular: { 3: ddOnly(0.9) } } })));
});
