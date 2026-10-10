// F-009 Task-1: 受入基準 1〜9・23(評価の土台)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rankAnchor,
  recencyWeight,
  selectGames,
  buildPopulation,
  scoreDataAxis,
  confidenceOf,
} from '../../src/rating/engine.ts';
import type { EngineConfig, GameRecord, MatchForPopulation, DataAxisDef } from '../../src/rating/types.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-09T00:00:00Z');
const cfg: EngineConfig = {
  windowDays: 120,
  minMinutes: 10,
  halfLifeDays: 45,
  k: 8,
  perfScale: 1.5,
  zClip: 3,
  confidence: { high: 15, mid: 6 },
};

/** 対面との差を作りやすい試合。me/opp の値を指定する */
const game = (o: Partial<GameRecord> & { ageDays?: number; me?: Record<string, number>; opp?: Record<string, number> | null }): GameRecord => ({
  matchId: o.matchId ?? `M${Math.random()}`,
  endTime: NOW - (o.ageDays ?? 1) * DAY,
  durationMin: o.durationMin ?? 30,
  queueId: o.queueId ?? 420,
  position: o.position ?? 'MIDDLE',
  me: o.me ?? { dmg: 20000 },
  opp: o.opp === undefined ? { dmg: 20000 } : o.opp,
});

const axis: DataAxisDef = {
  key: 'test',
  label: 'テスト',
  rankWeight: 0.8,
  roleDependent: false,
  metrics: [{ key: 'dmg', weight: 1, mode: 'diff' }],
};

/** 母集団: MIDDLE の dmg の差が平均 0・標準偏差 1000 になる組 */
const population = buildPopulation([
  { participants: [{ position: 'MIDDLE', teamId: 100, stats: { dmg: 21000 } }, { position: 'MIDDLE', teamId: 200, stats: { dmg: 20000 } }] },
  { participants: [{ position: 'MIDDLE', teamId: 100, stats: { dmg: 19000 } }, { position: 'MIDDLE', teamId: 200, stats: { dmg: 20000 } }] },
] as MatchForPopulation[], [axis]);

test('ランクの基準: Iron IV 0LP=0.0 / Gold IV=3.4 / Diamond IV=6.9 / Master 0LP=8.0 / 1500LP 以上=10.0', () => {
  assert.equal(rankAnchor({ tier: 'IRON', division: 'IV', lp: 0 }), 0);
  assert.ok(Math.abs(rankAnchor({ tier: 'GOLD', division: 'IV', lp: 0 })! - 3.43) < 0.01);
  assert.ok(Math.abs(rankAnchor({ tier: 'DIAMOND', division: 'IV', lp: 0 })! - 6.86) < 0.01);
  assert.equal(rankAnchor({ tier: 'MASTER', division: 'I', lp: 0 }), 8);
  assert.equal(rankAnchor({ tier: 'CHALLENGER', division: 'I', lp: 2000 }), 10);
  assert.equal(rankAnchor(null), null);
});

test('AC1: 120 日より古い試合と 10 分未満の試合を除く', () => {
  const gs = [game({ ageDays: 10 }), game({ ageDays: 121 }), game({ ageDays: 5, durationMin: 9 }), game({ ageDays: 119 })];
  assert.equal(selectGames(gs, NOW, cfg, { roleOnly: false, position: 'MIDDLE' }).length, 2);
});

test('AC2: ロールに依存する軸は大会のロールの試合だけを使う', () => {
  const gs = [game({ position: 'MIDDLE' }), game({ position: 'TOP' }), game({ position: 'MIDDLE' })];
  assert.equal(selectGames(gs, NOW, cfg, { roleOnly: true, position: 'MIDDLE' }).length, 2);
  assert.equal(selectGames(gs, NOW, cfg, { roleOnly: false, position: 'MIDDLE' }).length, 3);
});

test('AC3: 新しさの重みは半減期 45 日', () => {
  assert.equal(recencyWeight(0, 45), 1);
  assert.ok(Math.abs(recencyWeight(45, 45) - 0.5) < 1e-12);
  assert.ok(Math.abs(recencyWeight(90, 45) - 0.25) < 1e-12);
});

test('AC3: 補正は新しい試合ほど強く効く', () => {
  const recentGood = [game({ ageDays: 1, me: { dmg: 22000 } }), game({ ageDays: 100, me: { dmg: 18000 } })];
  const recentBad = [game({ ageDays: 1, me: { dmg: 18000 } }), game({ ageDays: 100, me: { dmg: 22000 } })];
  const r = { tier: 'DIAMOND', division: 'IV', lp: 0 };
  const a = scoreDataAxis(axis, { rank: r, games: recentGood, position: 'MIDDLE' }, population, cfg, NOW);
  const b = scoreDataAxis(axis, { rank: r, games: recentBad, position: 'MIDDLE' }, population, cfg, NOW);
  assert.ok(a.correction > 0 && b.correction < 0);
});

test('AC4: 確度は有効な試合数 15 以上で高、6 以上で中、未満で低', () => {
  assert.equal(confidenceOf(15, cfg), '高');
  assert.equal(confidenceOf(14.9, cfg), '中');
  assert.equal(confidenceOf(6, cfg), '中');
  assert.equal(confidenceOf(5.9, cfg), '低');
});

test('AC5: 使える試合が 0 件なら事前値で計算し、確度は低、推定の印', () => {
  const r = scoreDataAxis(axis, { rank: { tier: 'MASTER', division: 'I', lp: 0 }, games: [], position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(r.estimated, true);
  assert.equal(r.confidence, '低');
  assert.ok(Math.abs(r.base - (8 * 0.8 + 5 * 0.2)) < 1e-9);
});

test('AC6: 点数 = A×r + 5×(1−r) + 補正 × n/(n+k) × 1.5 (+ 加点)、0〜10 に切り詰める', () => {
  // 1日前の試合 1 件: 重み 0.5^(1/45)。z = (22000-20000 - 0)/1000 = 2
  const g = [game({ ageDays: 1, me: { dmg: 22000 } })];
  const rank = { tier: 'DIAMOND', division: 'IV', lp: 0 };
  const r = scoreDataAxis(axis, { rank, games: g, position: 'MIDDLE' }, population, cfg, NOW, 0.5);
  const n = 0.5 ** (1 / 45);
  const A = (24 / 28) * 8;
  const expected = A * 0.8 + 5 * 0.2 + 2 * (n / (n + 8)) * 1.5 + 0.5;
  assert.ok(Math.abs(r.base - expected) < 1e-9, `${r.base} vs ${expected}`);
  const huge = scoreDataAxis(axis, { rank: { tier: 'CHALLENGER', division: 'I', lp: 3000 }, games: g, position: 'MIDDLE' }, population, cfg, NOW, 5);
  assert.equal(huge.base, 10);
});

test('AC7: 対面との差は母集団の同じロールの分布で標準化し、±3 で切る', () => {
  const g = [game({ me: { dmg: 40000 } })]; // 差 20000 → z = 20 → 3 に切る
  const r = scoreDataAxis(axis, { rank: { tier: 'GOLD', division: 'IV', lp: 0 }, games: g, position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(r.metrics[0].z, 3);
});

test('AC7: 比のモード(対数の比)と符号を反転するモード', () => {
  const ax: DataAxisDef = { ...axis, metrics: [{ key: 'deaths', weight: 1, mode: 'negdiff' }] };
  const pop = buildPopulation([
    { participants: [{ position: 'TOP', teamId: 100, stats: { deaths: 3 } }, { position: 'TOP', teamId: 200, stats: { deaths: 5 } }] },
  ] as MatchForPopulation[], [ax]);
  const g = [game({ position: 'TOP', me: { deaths: 2 }, opp: { deaths: 6 } })];
  const r = scoreDataAxis(ax, { rank: { tier: 'GOLD', division: 'IV', lp: 0 }, games: g, position: 'TOP' }, pop, cfg, NOW);
  assert.ok(r.correction > 0, 'デスが少ないほど上がる');
});

test('AC8: 同じロールの相手がいない試合は指標の計算から除く', () => {
  const g = [game({ opp: null, me: { dmg: 40000 } }), game({ me: { dmg: 21000 } })];
  const r = scoreDataAxis(axis, { rank: { tier: 'GOLD', division: 'IV', lp: 0 }, games: g, position: 'MIDDLE' }, population, cfg, NOW);
  assert.ok(Math.abs(r.metrics[0].z - 1) < 1e-9);
});

test('AC9: ソロランクが無ければ事前値(最高ランク → 中央値)で置き換え、確度を1段下げる', () => {
  const g = Array.from({ length: 20 }, () => game({ ageDays: 1 }));
  const withPeak = scoreDataAxis(axis, { rank: null, peakRank: { tier: 'MASTER', division: 'I', lp: 0 }, games: g, position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(withPeak.anchor, 8);
  assert.equal(withPeak.confidence, '中');
  assert.equal(withPeak.anchorSource, '最高ランク');
  const noRank = scoreDataAxis(axis, { rank: null, games: g, position: 'MIDDLE', medianAnchor: 6 }, population, cfg, NOW);
  assert.equal(noRank.anchor, 6);
  assert.equal(noRank.anchorSource, '母集団の中央値');
});

test('AC23: 同じ入力と基準日なら同じ結果', () => {
  const g = [game({ matchId: 'A', ageDays: 3, me: { dmg: 21000 } }), game({ matchId: 'B', ageDays: 9, me: { dmg: 19500 } })];
  const input = { rank: { tier: 'EMERALD', division: 'II', lp: 40 }, games: g, position: 'MIDDLE' as const };
  assert.deepEqual(scoreDataAxis(axis, input, population, cfg, NOW), scoreDataAxis(axis, input, population, cfg, NOW));
});

test('AC20 の材料: 使った試合数・ロールの割合・日付の範囲を返す', () => {
  const g = [game({ ageDays: 2, position: 'MIDDLE' }), game({ ageDays: 30, position: 'TOP' })];
  const r = scoreDataAxis(axis, { rank: { tier: 'GOLD', division: 'IV', lp: 0 }, games: g, position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(r.gamesUsed, 2);
  assert.equal(r.roleShare, 0.5);
  assert.equal(r.newest, '2026-10-07');
  assert.equal(r.oldest, '2026-09-09');
});

// F-009 Task-11: 受入基準 6(改訂)・28〜30(経歴の反映: 最高ランクとソロランクの高い方、元プロの下限、出どころ)
const twenty = () => Array.from({ length: 20 }, () => game({ ageDays: 1 }));
const EX_PRO = { level: 'LJL-starter', source: 'https://example.test/wiki/A' };

test('AC28: 最高ランクがソロランクより高ければ基準は最高ランク由来。ソロランクはあるので確度は下げない', () => {
  const peakRank = { tier: 'MASTER', division: 'I', lp: 0, source: 'https://example.test/opgg/a' };
  const r = scoreDataAxis(axis, { rank: { tier: 'GOLD', division: 'IV', lp: 0 }, peakRank, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(r.anchor, 8);
  assert.equal(r.anchorSource, '最高ランク');
  assert.equal(r.confidence, '高');
  assert.match(r.anchorNote ?? '', /MASTER/);
  assert.match(r.anchorNote ?? '', /https:\/\/example\.test\/opgg\/a/);
});

test('AC28: 最高ランクがソロランク以下ならソロランクの基準(出どころはソロランク)', () => {
  const lower = scoreDataAxis(axis, { rank: { tier: 'MASTER', division: 'I', lp: 0 }, peakRank: { tier: 'GOLD', division: 'IV', lp: 0 }, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(lower.anchor, 8);
  assert.equal(lower.anchorSource, 'ソロランク');
  const same = scoreDataAxis(axis, { rank: { tier: 'MASTER', division: 'I', lp: 0 }, peakRank: { tier: 'MASTER', division: 'I', lp: 0 }, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(same.anchorSource, 'ソロランク');
  assert.equal(same.confidence, '高');
  assert.equal(same.anchorNote, undefined);
});

test('AC29: 元プロはランクの基準の下限が 8.0(Challenger 0 LP)。出どころは「元プロの下限」、説明に区分と出典', () => {
  const r = scoreDataAxis(axis, { rank: { tier: 'GOLD', division: 'IV', lp: 0 }, exPro: EX_PRO, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(r.anchor, 8);
  assert.equal(r.anchorSource, '元プロの下限');
  assert.equal(r.confidence, '高');
  assert.match(r.anchorNote ?? '', /LJL-starter/);
  assert.match(r.anchorNote ?? '', /https:\/\/example\.test\/wiki\/A/);
  assert.ok(Math.abs(r.base - (8 * 0.8 + 5 * 0.2)) < 1e-9, `${r.base}`);
});

test('AC29: 基準が 8.0 以上の元プロには下限が効かない(ソロランク・最高ランクのまま)', () => {
  const solo = scoreDataAxis(axis, { rank: { tier: 'CHALLENGER', division: 'I', lp: 1500 }, exPro: EX_PRO, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(solo.anchor, 10);
  assert.equal(solo.anchorSource, 'ソロランク');
  const peakRank = { tier: 'MASTER', division: 'I', lp: 750, source: 'https://example.test/opgg/b' };
  const peak = scoreDataAxis(axis, { rank: { tier: 'GOLD', division: 'IV', lp: 0 }, peakRank, exPro: EX_PRO, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(peak.anchor, 9);
  assert.equal(peak.anchorSource, '最高ランク');
});

test('AC29/AC9: ソロランクも最高ランクも無い元プロは 8.0(元プロの下限)。確度は基準 9 のとおり 1 段下げる', () => {
  const r = scoreDataAxis(axis, { rank: null, exPro: { level: 'LJL-sub', source: 'https://example.test/wiki/B' }, games: twenty(), position: 'MIDDLE', medianAnchor: 6 }, population, cfg, NOW);
  assert.equal(r.anchor, 8);
  assert.equal(r.anchorSource, '元プロの下限');
  assert.equal(r.confidence, '中');
});

test('AC28: 経歴の記録が無い選手は従来どおり(ソロランク、無ければ母集団の中央値)', () => {
  const solo = scoreDataAxis(axis, { rank: { tier: 'GOLD', division: 'IV', lp: 0 }, peakRank: null, exPro: null, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.ok(Math.abs(solo.anchor - 3.43) < 0.01);
  assert.equal(solo.anchorSource, 'ソロランク');
  assert.equal(solo.anchorNote, undefined);
  const none = scoreDataAxis(axis, { rank: null, peakRank: null, exPro: null, games: twenty(), position: 'MIDDLE', medianAnchor: 6 }, population, cfg, NOW);
  assert.equal(none.anchor, 6);
  assert.equal(none.anchorSource, '母集団の中央値');
  assert.equal(none.confidence, '中');
});
