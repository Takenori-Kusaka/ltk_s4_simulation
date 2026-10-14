// F-009 Task-1: 受入基準 1〜9・23(評価の土台)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnchor,
  rankAnchor,
  recencyWeight,
  selectGames,
  buildPopulation,
  scoreDataAxis,
  confidenceOf,
  roleGamesFloor,
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
// 2026-10-10 基準29 の改訂: LJL のスタメン・海外の主要リーグの元プロは下限 10.0 になった。8.0 の下限の検査は LJL-sub で行う
const EX_PRO = { level: 'LJL-sub', source: 'https://example.test/wiki/A' };

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
  assert.match(r.anchorNote ?? '', /LJL-sub/);
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

// F-009 Task-11 の追補: ランクの基準は、ソロランク・歴代の最高ランク・今季の最高ランクのうち基準の値が最も高い記録
test('AC6/28 追補: 今季の最高ランクの基準が歴代より高ければ今季の記録を採り、出どころは「最高ランク(今季)」', () => {
  const peakRank = { tier: 'Challenger', division: '', lp: 0, source: 'https://example.test/opgg/all' }; // LP 不明 → 0 LP = 8.0
  const seasonPeakRank = { tier: 'Grandmaster', division: '', lp: 1060, source: 'https://example.test/opgg/season' }; // 9.41
  const r = scoreDataAxis(axis, { rank: { tier: 'DIAMOND', division: 'I', lp: 50 }, peakRank, seasonPeakRank, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.ok(Math.abs(r.anchor - (8 + (2 * 1060) / 1500)) < 1e-9, `${r.anchor}`);
  assert.equal(r.anchorSource, '最高ランク(今季)');
  assert.equal(r.confidence, '高');
  assert.match(r.anchorNote ?? '', /Grandmaster 1060LP/);
  assert.match(r.anchorNote ?? '', /https:\/\/example\.test\/opgg\/season/);
});

test('AC6/28 追補: 同じ tier でも LP のある記録が LP 不明(0 LP)の記録を上回る。歴代が高ければ歴代(「最高ランク」)', () => {
  const noLp = { tier: 'Challenger', division: '', lp: 0, source: 'https://example.test/a' };
  const withLp = { tier: 'Challenger', division: '', lp: 500, source: 'https://example.test/b' };
  const season = scoreDataAxis(axis, { rank: null, peakRank: noLp, seasonPeakRank: withLp, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.ok(Math.abs(season.anchor - (8 + 1000 / 1500)) < 1e-9, `${season.anchor}`);
  assert.equal(season.anchorSource, '最高ランク(今季)');
  const allTime = scoreDataAxis(axis, { rank: null, peakRank: withLp, seasonPeakRank: noLp, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.ok(Math.abs(allTime.anchor - (8 + 1000 / 1500)) < 1e-9);
  assert.equal(allTime.anchorSource, '最高ランク');
  assert.equal(allTime.confidence, '中', 'ソロランクが無いので 1 段下げる(基準 9)');
});

test('AC6/28 追補: ソロランクが 3 つの中で最も高ければソロランク。同じ値なら ソロランク → 歴代 → 今季 の順', () => {
  const master = { tier: 'MASTER', division: 'I', lp: 0, source: 'https://example.test/m' };
  const solo = scoreDataAxis(axis, { rank: { tier: 'CHALLENGER', division: 'I', lp: 900 }, peakRank: master, seasonPeakRank: master, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(solo.anchorSource, 'ソロランク');
  assert.equal(solo.anchorNote, undefined);
  const tie = scoreDataAxis(axis, { rank: { tier: 'MASTER', division: 'I', lp: 0 }, peakRank: master, seasonPeakRank: master, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(tie.anchorSource, 'ソロランク');
  const tie2 = scoreDataAxis(axis, { rank: null, peakRank: master, seasonPeakRank: master, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(tie2.anchorSource, '最高ランク');
});

test('AC29 追補: 元プロの下限は、3 つの記録の最大が 8.0 未満のときだけ効く', () => {
  const peakRank = { tier: 'PLATINUM', division: 'I', lp: 0, source: 'https://example.test/a' };
  const seasonPeakRank = { tier: 'EMERALD', division: 'IV', lp: 0, source: 'https://example.test/b' };
  const r = scoreDataAxis(axis, { rank: { tier: 'GOLD', division: 'IV', lp: 0 }, peakRank, seasonPeakRank, exPro: EX_PRO, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(r.anchor, 8);
  assert.equal(r.anchorSource, '元プロの下限');
  const high = scoreDataAxis(axis, { rank: { tier: 'GOLD', division: 'IV', lp: 0 }, peakRank, seasonPeakRank: { tier: 'MASTER', division: '', lp: 300, source: 'https://example.test/c' }, exPro: EX_PRO, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(high.anchorSource, '最高ランク(今季)');
});


test('AC29(改訂 2026-10-10): 元プロの下限は経歴の水準で決める。LJL のスタメン・海外の主要リーグは 10.0、それ以外は 8.0', () => {
  const gold = { tier: 'GOLD', division: 'IV', lp: 0 };
  const at = (level: string, years?: number) => resolveAnchor({ rank: gold, peakRank: null, seasonPeakRank: null, exPro: { level, source: 'https://example.test/wiki/A', years }, medianAnchor: 5 });
  // LJL のスタメンは 8.0 + 0.5 × 年数(上限 10.0)。年数が無ければ 8.0
  assert.equal(at('LJL-starter', 4).anchor, 10);
  assert.equal(at('LJL-starter', 9).anchor, 10);
  assert.equal(at('LJL-starter', 1).anchor, 8.5);
  assert.equal(at('LJL-starter').anchor, 8);
  assert.equal(at('overseas-major').anchor, 10);
  assert.equal(at('LJL-sub', 5).anchor, 8);
  assert.equal(at('LJL CS-starter').anchor, 8);
  assert.equal(at('LJL-starter', 4).anchorSource, '元プロの下限');
});

// F-004 Task-2: 受入基準 13(スクリムの試合の重み)・15(確度の理由の文)
test('F-004 AC13: スクリムの試合(kind scrim)は新しさの重み × scrimGameWeight で数え、有効な試合数 n・縮小・補正の重み付き平均・確度に効く', () => {
  const gold = { tier: 'GOLD', division: 'IV', lp: 0 };
  const cfgS: EngineConfig = { ...cfg, scrimGameWeight: 2 };
  const solo = game({ ageDays: 0, me: { dmg: 21000 } }); // z = +1
  const scrim: GameRecord = { ...game({ ageDays: 0, me: { dmg: 19000 } }), kind: 'scrim', queueId: 0 }; // z = −1
  const r = scoreDataAxis(axis, { rank: gold, games: [solo, scrim], position: 'MIDDLE' }, population, cfgS, NOW);
  assert.ok(Math.abs(r.effectiveGames - 3) < 1e-9, `n = 1 + 2 = 3(${r.effectiveGames})`);
  assert.ok(Math.abs(r.correction - -1 / 3) < 1e-9, `補正 = (1 − 2) ÷ 3(${r.correction})`);
  assert.ok(Math.abs(r.shrink - 3 / 11) < 1e-9);
  assert.equal(r.scrimGames, 1);
  assert.match(r.confidenceReason, /スクリム 1 試合\(重み 2\.0\)を含む/);
  // 設定に scrimGameWeight が無ければ従来どおり 1 倍
  const r1 = scoreDataAxis(axis, { rank: gold, games: [solo, scrim], position: 'MIDDLE' }, population, cfg, NOW);
  assert.ok(Math.abs(r1.effectiveGames - 2) < 1e-9);
  assert.ok(Math.abs(r1.correction) < 1e-9);
  // 確度の有効な試合数も重みで数える: スクリム 3 試合 × 2.0 = 6.0 → 中(重みが無ければ 3.0 → 低)
  const three: GameRecord[] = [1, 2, 3].map((i) => ({ ...game({ ageDays: 0, matchId: `S${i}` }), kind: 'scrim', queueId: 0 }));
  assert.equal(scoreDataAxis(axis, { rank: gold, games: three, position: 'MIDDLE' }, population, cfgS, NOW).confidence, '中');
  assert.equal(scoreDataAxis(axis, { rank: gold, games: three, position: 'MIDDLE' }, population, cfg, NOW).confidence, '低');
  // ソロランクだけなら文を出さない
  const only = scoreDataAxis(axis, { rank: gold, games: [solo], position: 'MIDDLE' }, population, cfgS, NOW);
  assert.equal(only.scrimGames, 0);
  assert.doesNotMatch(only.confidenceReason, /スクリム/);
  assert.match(only.confidenceReason, /有効な試合数/);
});

// F-009 Task-13: 受入基準 6(2026-10-11 の追記)・33〜36(到達点からのブランク)。計算の基準日は仕様の計算の例と同じ 2026-10-11
import { blankInfo, loadEngineConfig, reachTime, REACH_UNKNOWN_MARK } from '../../src/rating/engine.ts';

const NOW13 = Date.parse('2026-10-11T00:00:00Z');
const BLANK = { blankDecayPerYear: 0.3, blankGraceYears: 1 };
const SRC = 'https://example.test/src';
/** 記録に、計算の基準日までのブランクを載せる(評価の組み立て build.ts がすること)。at が null なら到達の時点が不明 */
const stamp = <T extends object>(r: T, at: string | null) => ({ ...r, blank: blankInfo(at, NOW13, BLANK) });
const exProOf = (level: string, years: number, lastYear: string | null) => stamp({ level, source: SRC, years }, lastYear);
const anchorOf = (o: Partial<Parameters<typeof resolveAnchor>[0]>) => resolveAnchor({ rank: null, peakRank: null, seasonPeakRank: null, exPro: null, medianAnchor: 5, ...o });
const GOLD = { tier: 'GOLD', division: 'IV', lp: 0 };

test('基準33〜36: 評価設定の初期値はブランクの減衰 1 年あたり 0.3、猶予 1 年', () => {
  const c = loadEngineConfig();
  assert.equal(c.blankDecayPerYear, 0.3);
  assert.equal(c.blankGraceYears, 1);
});

test('用語: 到達の時点は年月日ならその日、年だけなら 7 月 1 日(年月だけならその月の 1 日)。読めなければ不明', () => {
  assert.equal(reachTime('2021'), Date.UTC(2021, 6, 1));
  assert.equal(reachTime('2024-01'), Date.UTC(2024, 0, 1));
  assert.equal(reachTime('2025-07-28'), Date.UTC(2025, 6, 28));
  assert.equal(reachTime(null), null);
  assert.equal(reachTime(undefined), null);
  assert.equal(reachTime('未確認'), null);
});

test('基準33: ブランク b は到達の時点から計算の基準日までの日数 ÷ 365.25(負なら 0)、減衰は 0.3 × max(0, b − 1)。不明なら減衰なし', () => {
  // 2021-07-01 → 2026-10-11 は 1928 日。b = 5.28 年、減衰 1.28(仕様の計算の例の Ceros の下限)
  const ceros = blankInfo('2021', NOW13, BLANK);
  assert.equal(ceros.at, '2021');
  assert.ok(Math.abs(ceros.years! - 1928 / 365.25) < 1e-9, `${ceros.years}`);
  assert.equal(ceros.years!.toFixed(1), '5.3');
  assert.ok(Math.abs(ceros.decay - 0.3 * (1928 / 365.25 - 1)) < 1e-9, `${ceros.decay}`);
  assert.equal(ceros.decay.toFixed(2), '1.28');
  // 判定記録の横展開の値: 到達の時点 → ブランクの年数(小数第 1 位)・減衰(小数第 2 位)
  const table: [string, string, string][] = [
    ['2025', '1.3', '0.08'], // Enty・わしだい・Yuhi の最終出場年
    ['2024', '2.3', '0.38'], // Eugeo の最終出場年、乾伸一郎の到達
    ['2023', '3.3', '0.68'], // apaMEN
    ['2022', '4.3', '0.98'], // Nemoh
    ['2020', '6.3', '1.58'], // Day1
    ['2019', '7.3', '1.88'], // Zerost・てぃんとん
    ['2018', '8.3', '2.18'], // らいじん・ハレっち
    ['2016', '10.3', '2.78'], // Enty の歴代の最高ランク(S6)
    ['2015', '11.3', '3.08'], // Rainbrain
    ['2024-01', '2.8', '0.53'], // k4sen
    ['2020-02', '6.7', '1.71'], // ハレっちの歴代の最高ランク
    ['2025-07-28', '1.2', '0.06'], // 千燈ゆうひ
  ];
  for (const [at, years, decay] of table) {
    const b = blankInfo(at, NOW13, BLANK);
    assert.equal(b.years!.toFixed(1), years, at);
    assert.equal(b.decay.toFixed(2), decay, at);
  }
  // 猶予 1 年の内側は減衰 0
  assert.equal(blankInfo('2026', NOW13, BLANK).decay, 0);
  assert.equal(blankInfo('2025-10-11', NOW13, BLANK).decay, 0);
  // 基準日より後の日付はブランク 0
  assert.equal(blankInfo('2027', NOW13, BLANK).years, 0);
  assert.equal(blankInfo('2027', NOW13, BLANK).decay, 0);
  // 不明なら減衰なし
  assert.deepEqual(blankInfo(null, NOW13, BLANK), { at: null, years: null, decay: 0 });
  assert.deepEqual(blankInfo('未確認', NOW13, BLANK), { at: null, years: null, decay: 0 });
  // 値は評価設定から読む(設定に無ければ減衰しない)
  assert.ok(Math.abs(blankInfo('2021', NOW13, { blankDecayPerYear: 0.2, blankGraceYears: 2 }).decay - 0.2 * (1928 / 365.25 - 2)) < 1e-9);
  assert.equal(blankInfo('2021', NOW13, {}).decay, 0);
});

test('基準6・33: 歴代の最高ランクはブランクの減衰を引いた値で比べる。ソロランクと今季の最高ランクは減衰しない(現役の記録より下げない)', () => {
  // 乾伸一郎の形: 歴代 Emerald I 0LP(6.57)、到達 2024 → −0.38 → 6.19。ソロランクと今季はそれより下 → 最高ランク 6.19
  const inui = anchorOf({
    rank: { tier: 'PLATINUM', division: 'III', lp: 97 },
    peakRank: stamp({ tier: 'Emerald', division: 'I', lp: 0, source: SRC }, '2024'),
    seasonPeakRank: { tier: 'Platinum', division: 'III', lp: 97, source: SRC },
  });
  assert.equal(inui.anchor.toFixed(2), '6.19');
  assert.equal(inui.anchorSource, '最高ランク');
  // k4sen の形: 歴代 Diamond IV 24LP(6.93)、到達 2024-01 → −0.53 → 6.39。今季の最高 Emerald II 47LP(6.42)が上 → 今季の記録
  const k4sen = anchorOf({
    rank: { tier: 'EMERALD', division: 'III', lp: 0 },
    peakRank: stamp({ tier: 'Diamond', division: 'IV', lp: 24, source: SRC }, '2024-01'),
    seasonPeakRank: { tier: 'Emerald', division: 'II', lp: 47, source: SRC },
  });
  assert.equal(k4sen.anchor.toFixed(2), '6.42');
  assert.equal(k4sen.anchorSource, '最高ランク(今季)');
  // Enty の歴代の形: Challenger(LP 不明 = 8.0)、到達 2016 → −2.78 → 5.22。ソロランク Diamond II 65LP(7.61)が上 → ソロランク
  const solo = anchorOf({ rank: { tier: 'DIAMOND', division: 'II', lp: 65 }, peakRank: stamp({ tier: 'Challenger', division: '', lp: 0, source: SRC }, '2016') });
  assert.equal(solo.anchor.toFixed(2), '7.61');
  assert.equal(solo.anchorSource, 'ソロランク');
  // ほかの記録が無ければ、減衰後の値(8.0 − 2.78 = 5.22)が基準
  assert.equal(anchorOf({ peakRank: stamp({ tier: 'Challenger', division: '', lp: 0, source: SRC }, '2016') }).anchor.toFixed(2), '5.22');
  // 猶予の内側(到達 2026)は減衰しない
  const fresh = anchorOf({ rank: GOLD, peakRank: stamp({ tier: 'Master', division: '', lp: 584, source: SRC }, '2026') });
  assert.equal(fresh.anchor.toFixed(2), '8.78');
  assert.equal(fresh.anchorSource, '最高ランク');
  // ソロランクと今季の最高ランクは、ブランクが載っていても減衰しない
  const season = anchorOf({ rank: stamp({ tier: 'MASTER', division: 'I', lp: 0 }, '2016'), seasonPeakRank: stamp({ tier: 'Master', division: '', lp: 300, source: SRC }, '2016') });
  assert.equal(season.anchor.toFixed(2), '8.40');
  assert.equal(season.anchorSource, '最高ランク(今季)');
  const onlySolo = anchorOf({ rank: stamp({ tier: 'MASTER', division: 'I', lp: 0 }, '2016') });
  assert.equal(onlySolo.anchor, 8);
  assert.equal(onlySolo.anchorSource, 'ソロランク');
});

test('基準34: 元プロの下限は最終出場年(7 月 1 日)からのブランクの減衰を引き、8.0 を下回らない', () => {
  // Enty の形: LJL のスタメン 10 年(下限 10.0)、最終出場 2025 → −0.08 → 9.92。歴代(減衰後 5.22)とソロランク(7.61)より上 → 元プロの下限
  const enty = anchorOf({
    rank: { tier: 'DIAMOND', division: 'II', lp: 65 },
    peakRank: stamp({ tier: 'Challenger', division: '', lp: 0, source: SRC }, '2016'),
    exPro: exProOf('LJL-starter', 10, '2025'),
  });
  assert.equal(enty.anchor.toFixed(2), '9.92');
  assert.equal(enty.anchorSource, '元プロの下限');
  // Ceros の形: 下限 10.0、最終出場 2021 → −1.28 → 8.72。歴代の Master 584LP(到達 2026、減衰 0)8.78 が上 → 最高ランク
  const ceros = anchorOf({
    rank: { tier: 'MASTER', division: 'I', lp: 232 },
    peakRank: stamp({ tier: 'Master', division: '', lp: 584, source: SRC }, '2026'),
    seasonPeakRank: { tier: 'Master', division: '', lp: 584, source: SRC },
    exPro: exProOf('LJL-starter', 9, '2021'),
  });
  assert.equal(ceros.anchor.toFixed(2), '8.78');
  assert.equal(ceros.anchorSource, '最高ランク');
  // 上回る記録が無ければ、減衰後の下限 8.72
  const floor = anchorOf({ rank: GOLD, exPro: exProOf('LJL-starter', 9, '2021') });
  assert.equal(floor.anchor.toFixed(2), '8.72');
  assert.equal(floor.anchorSource, '元プロの下限');
  // Day1 の形: 下限 10.0、最終出場 2020 → −1.58 → 8.42
  assert.equal(anchorOf({ rank: GOLD, exPro: exProOf('LJL-starter', 5, '2020') }).anchor.toFixed(2), '8.42');
  // 8.0(Challenger 0 LP)を下回らない: ハレっちの形(下限 10.0、最終出場 2018 → −2.18 → 7.82)は 8.00
  assert.equal(anchorOf({ rank: GOLD, exPro: exProOf('LJL-starter', 5, '2018') }).anchor, 8);
  // 下限が 8.0 の水準(LJL-sub)は、減衰しても 8.0
  assert.equal(anchorOf({ rank: GOLD, exPro: exProOf('LJL-sub', 3, '2015') }).anchor, 8);
  // 猶予の内側(最終出場 2026)は下がらない
  assert.equal(anchorOf({ rank: GOLD, exPro: exProOf('LJL-starter', 6, '2026') }).anchor, 10);
});

test('基準35: 到達の時点・最終出場年が不明な記録は減衰せず、説明に「到達の時点が不明(減衰なし)」の印。同じ値の候補があれば不明でない候補を採る', () => {
  assert.equal(REACH_UNKNOWN_MARK, '到達の時点が不明(減衰なし)');
  const unknownPeak = stamp({ tier: 'Challenger', division: '', lp: 1185, source: SRC }, null);
  // 不明な歴代の最高ランクは減衰せずに比べ、採ったら印
  const a = anchorOf({ rank: GOLD, peakRank: unknownPeak });
  assert.equal(a.anchor.toFixed(2), '9.58');
  assert.equal(a.anchorSource, '最高ランク');
  assert.equal(a.whenUnknown, true);
  assert.ok((a.anchorNote ?? '').includes(REACH_UNKNOWN_MARK), a.anchorNote);
  // Eugeo の形: 歴代(不明)と今季が同じ値 → 不明でない今季の記録を採る
  const e = anchorOf({ rank: GOLD, peakRank: unknownPeak, seasonPeakRank: { tier: 'Challenger', division: '', lp: 1185, source: SRC } });
  assert.equal(e.anchorSource, '最高ランク(今季)');
  assert.equal(e.whenUnknown, false);
  assert.ok(!(e.anchorNote ?? '').includes(REACH_UNKNOWN_MARK), e.anchorNote);
  // らいじんの形: 歴代 Challenger(LP 不明 = 8.00、到達の時点が不明)と、下限 9.0(最終出場 2018 → −2.18 → 8.00)が同じ値 → 不明でない下限を採る
  const raijin = anchorOf({
    rank: { tier: 'DIAMOND', division: 'II', lp: 84 },
    peakRank: stamp({ tier: 'Challenger', division: '', lp: 0, source: SRC }, null),
    exPro: exProOf('LJL-starter', 2, '2018'),
  });
  assert.equal(raijin.anchor, 8);
  assert.equal(raijin.anchorSource, '元プロの下限');
  assert.equal(raijin.whenUnknown, false);
  // 不明な記録と同じ値のソロランクがあればソロランク
  const sameSolo = anchorOf({ rank: { tier: 'MASTER', division: 'I', lp: 0 }, peakRank: stamp({ tier: 'Challenger', division: '', lp: 0, source: SRC }, null) });
  assert.equal(sameSolo.anchorSource, 'ソロランク');
  assert.equal(sameSolo.whenUnknown, false);
  // 最終出場年が不明な元プロの下限は減衰せず、採ったら印
  const t = anchorOf({ rank: GOLD, exPro: exProOf('LJL-starter', 4, null) });
  assert.equal(t.anchor, 10);
  assert.equal(t.anchorSource, '元プロの下限');
  assert.equal(t.whenUnknown, true);
  assert.ok((t.anchorNote ?? '').includes(REACH_UNKNOWN_MARK), t.anchorNote);
  // たぬき忍者の形: 不明な下限(LJL CS、8.0)は採られない(歴代の Challenger 1580LP、到達 2026 の 10.00 が上)→ 印なし
  const tanuki = anchorOf({ rank: GOLD, peakRank: stamp({ tier: 'Challenger', division: '', lp: 1580, source: SRC }, '2026'), exPro: exProOf('LJL CS-starter', 1, null) });
  assert.equal(tanuki.anchor, 10);
  assert.equal(tanuki.anchorSource, '最高ランク');
  assert.equal(tanuki.whenUnknown, false);
  assert.ok(!(tanuki.anchorNote ?? '').includes(REACH_UNKNOWN_MARK), tanuki.anchorNote);
});

test('基準35: 到達の時点が不明な記録をランクの基準に採ったデータの軸は確度を 1 段下げる。採らなければ下げない', () => {
  const unknownPeak = stamp({ tier: 'MASTER', division: 'I', lp: 0, source: SRC }, null);
  const r = scoreDataAxis(axis, { rank: GOLD, peakRank: unknownPeak, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(r.anchor, 8);
  assert.equal(r.anchorSource, '最高ランク');
  assert.equal(r.confidence, '中', '有効な試合数は「高」の水準。不明な記録を採ったので 1 段下げる');
  assert.match(r.confidenceReason, /到達の時点が不明/);
  assert.ok((r.anchorNote ?? '').includes(REACH_UNKNOWN_MARK), r.anchorNote);
  // 到達の時点が分かる記録は下げない
  const known = scoreDataAxis(axis, { rank: GOLD, peakRank: stamp({ tier: 'MASTER', division: 'I', lp: 0, source: SRC }, '2026'), games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(known.anchor, 8);
  assert.equal(known.confidence, '高');
  assert.doesNotMatch(known.confidenceReason, /到達の時点が不明/);
  // 不明な記録があっても、採らなければ下げない
  const notAdopted = scoreDataAxis(axis, { rank: { tier: 'CHALLENGER', division: 'I', lp: 900 }, peakRank: unknownPeak, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(notAdopted.anchorSource, 'ソロランク');
  assert.equal(notAdopted.confidence, '高');
  // 最終出場年が不明な元プロの下限を採った場合も 1 段下げる
  const floor = scoreDataAxis(axis, { rank: GOLD, exPro: exProOf('LJL-sub', 1, null), games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(floor.anchorSource, '元プロの下限');
  assert.equal(floor.confidence, '中');
  // ソロランクが無く(基準 9)、不明な記録を採った(基準 35)ら、それぞれ 1 段ずつ下げる
  const both = scoreDataAxis(axis, { rank: null, peakRank: unknownPeak, games: twenty(), position: 'MIDDLE' }, population, cfg, NOW);
  assert.equal(both.confidence, '低');
});

test('基準36: 歴代の最高ランクまたは元プロの下限を採ったら、説明に「到達 2021、ブランク 5.3 年、−1.28」の形で示す(減衰が 0 でも示す)', () => {
  // 元プロの下限: 最終出場年・ブランク・減衰
  const floor = anchorOf({ rank: GOLD, exPro: exProOf('LJL-starter', 9, '2021') });
  assert.match(floor.anchorNote ?? '', /LJL-starter。出典: https:\/\/example\.test\/src。到達 2021、ブランク 5\.3 年、−1\.28/);
  // 歴代の最高ランク: 到達の時点(年だけ・年月日)
  const peak = anchorOf({ rank: GOLD, peakRank: stamp({ tier: 'Emerald', division: 'I', lp: 0, source: SRC }, '2024') });
  assert.match(peak.anchorNote ?? '', /Emerald I 0LP。出典: https:\/\/example\.test\/src。到達 2024、ブランク 2\.3 年、−0\.38/);
  const dated = anchorOf({ rank: GOLD, peakRank: stamp({ tier: 'Master', division: '', lp: 0, source: SRC }, '2025-07-28') });
  assert.equal(dated.anchor.toFixed(2), '7.94');
  assert.match(dated.anchorNote ?? '', /到達 2025-07-28、ブランク 1\.2 年、−0\.06/);
  // 減衰が 0 の場合も示す
  const fresh = anchorOf({ rank: GOLD, peakRank: stamp({ tier: 'Challenger', division: '', lp: 1580, source: SRC }, '2026') });
  assert.match(fresh.anchorNote ?? '', /到達 2026、ブランク 0\.3 年、−0\.00/);
  // ソロランク・今季の最高ランクを採ったら示さない
  const season = anchorOf({ rank: GOLD, peakRank: stamp({ tier: 'Diamond', division: 'IV', lp: 24, source: SRC }, '2024-01'), seasonPeakRank: { tier: 'Emerald', division: 'II', lp: 47, source: SRC } });
  assert.equal(season.anchorSource, '最高ランク(今季)');
  assert.doesNotMatch(season.anchorNote ?? '', /ブランク/);
  assert.equal(anchorOf({ rank: { tier: 'MASTER', division: 'I', lp: 0 }, exPro: exProOf('LJL-sub', 1, '2020') }).anchorNote, undefined);
  // ブランクの載っていない記録(経歴の記録を経ない入力)は従来どおり(減衰・印・説明の追加なし)
  const legacy = anchorOf({ rank: GOLD, peakRank: { tier: 'MASTER', division: 'I', lp: 0, source: SRC }, exPro: { level: 'LJL-sub', source: SRC } });
  assert.equal(legacy.anchor, 8);
  assert.equal(legacy.whenUnknown, false);
  assert.doesNotMatch(legacy.anchorNote ?? '', /ブランク|到達/);
});

// F-009 Task-16: 受入基準 42(大会のロールの試合の下限は呼び出し側が常識の一覧から渡す。境界は「下限未満なら低」)
test('基準42: 大会のロールの試合が下限未満なら確度は「低」、理由に「大会のロールの試合 n 件(下限 未満)」を足す。下限以上なら変えない', () => {
  const r = { confidence: '高' as const, confidenceReason: '有効な試合数 19.1(15 以上で高、6 以上で中)' };
  assert.deepEqual(roleGamesFloor(r, 4, 5), { confidence: '低', confidenceReason: '有効な試合数 19.1(15 以上で高、6 以上で中)。大会のロールの試合 4 件(5 未満)' });
  assert.deepEqual(roleGamesFloor(r, 5, 5), r);
  assert.deepEqual(roleGamesFloor(r, 6, 5), r);
  // 下限は渡された値を使う(3 なら 2 件で低、3 件で変えない)
  assert.equal(roleGamesFloor({ confidence: '中', confidenceReason: 'x' }, 2, 3).confidenceReason, 'x。大会のロールの試合 2 件(3 未満)');
  assert.equal(roleGamesFloor({ confidence: '中', confidenceReason: 'x' }, 3, 3).confidence, '中');
  // 0 件(推定)でも理由を示す
  assert.deepEqual(roleGamesFloor({ confidence: '低', confidenceReason: 'y' }, 0, 5), { confidence: '低', confidenceReason: 'y。大会のロールの試合 0 件(5 未満)' });
});

// ---- F-004 Task-11: 受入基準 39(csAt14 の差を階級チーム同士の試合の分布で標準化)・40(組の数の下限)。受入基準から書いた ----
import { buildResultsPopulation } from '../../src/rating/engine.ts';

const csAxis: DataAxisDef = {
  key: 'laningTest',
  label: 'レーン戦(テスト)',
  rankWeight: 0.5,
  roleDependent: false,
  metrics: [{ key: 'csAt14', weight: 1, mode: 'diff', positions: ['TOP', 'JUNGLE'], population: 'results' }],
};
/** 実戦の記録 1 試合の両チームの記録(自分と対面を入れ替えた 2 件。同じ試合 ID) */
const bothSides = (matchId: string, position: string, a: number, b: number): GameRecord[] => [
  { ...game({ matchId, position, me: { csAt14: a }, opp: { csAt14: b } }), queueId: 0, kind: 'scrim' },
  { ...game({ matchId, position, me: { csAt14: b }, opp: { csAt14: a } }), queueId: 0, kind: 'scrim' },
];
// TOP 8 試合の差 10, −20, 30, −40, 5, 15, −25, 35(平均 1.25)。二乗の和 100+400+900+1600+25+225+625+1225 = 5100、
// 二乗平均平方根 √(5100 ÷ 8) = √637.5 = 25.2488(平均のまわりの標準偏差 √(637.5 − 1.5625) = 25.2179 とは違う)
const TOP_DIFFS = [10, -20, 30, -40, 5, 15, -25, 35];
const RMS8 = Math.sqrt(637.5);
const topGames = TOP_DIFFS.flatMap((d, i) => bothSides(`SC-T${i}`, 'TOP', 100 + d, 100));
// JG 7 試合(下限 8 に 1 組足りない)
const jgGames = Array.from({ length: 7 }, (_, i) => bothSides(`SC-J${i}`, 'JUNGLE', 90 + i, 90)).flat();
// ソロランクの試合(kind なし)に csAt14 があっても入れない
const soloCs = [1, 2, 3].map((i) => game({ matchId: `JP1_${i}`, position: 'TOP', me: { csAt14: 500 }, opp: { csAt14: 0 } }));

test('基準39: csAt14 の差の分布は実戦の記録の 1 試合 1 ロール 1 組から、平均 0・標準偏差は二乗平均平方根。ソロランクの試合は入れない', () => {
  const out = buildResultsPopulation([...topGames, ...soloCs], [csAxis], 8);
  assert.equal(out.pairs.TOP.csAt14, 8);
  const d = out.population.TOP['csAt14:diff'];
  assert.equal(d.mean, 0);
  assert.equal(d.count, 8);
  assert.ok(Math.abs(d.sd - RMS8) < 1e-9, `${d.sd}`);
  assert.ok(Math.abs(d.sd - 25.2488) < 1e-4);
});

test('基準39: ソロランクの母集団(buildPopulation)は csAt14 の分布を作らない', () => {
  const pop = buildPopulation([
    { participants: [{ position: 'TOP', teamId: 100, stats: { csAt14: 120 } }, { position: 'TOP', teamId: 200, stats: { csAt14: 100 } }] },
    { participants: [{ position: 'TOP', teamId: 100, stats: { csAt14: 80 } }, { position: 'TOP', teamId: 200, stats: { csAt14: 100 } }] },
  ] as MatchForPopulation[], [csAxis]);
  assert.equal(pop.TOP?.['csAt14:diff'], undefined);
});

test('基準40: 組の数が下限(8)に満たないロール(JG 7 組)は分布を作らず、ロールと組の数を出力する。8 組の TOP は作る', () => {
  const out = buildResultsPopulation([...topGames, ...jgGames], [csAxis], 8);
  assert.equal(out.pairs.JUNGLE.csAt14, 7);
  assert.equal(out.population.JUNGLE?.['csAt14:diff'], undefined);
  assert.notEqual(out.population.TOP['csAt14:diff'], undefined);
  assert.equal(out.warnings.length, 1);
  assert.match(out.warnings[0], /JUNGLE/);
  assert.match(out.warnings[0], /7 組/);
  // 下限 7 なら JG も作る(7 と 8 の境界)
  const seven = buildResultsPopulation([...topGames, ...jgGames], [csAxis], 7);
  assert.notEqual(seven.population.JUNGLE?.['csAt14:diff'], undefined);
  assert.deepEqual(seven.warnings, []);
});

test('基準39・40: 標準化は分布の二乗平均平方根で割る。分布の無いロールの試合はその指標を除き、使える指標が無ければ試合を除く', () => {
  const out = buildResultsPopulation([...topGames, ...jgGames], [csAxis], 8);
  // TOP: 自分 110・対面 100 の差 10 → z = 10 ÷ 25.2488 = 0.39606
  const top = scoreDataAxis(csAxis, { rank: null, medianAnchor: 5, games: [{ ...game({ matchId: 'X1', position: 'TOP', me: { csAt14: 110 }, opp: { csAt14: 100 } }), kind: 'scrim', queueId: 0 }], position: 'TOP' }, out.population, cfg, NOW);
  assert.ok(Math.abs(top.correction - 10 / RMS8) < 1e-9, `${top.correction}`);
  assert.ok(Math.abs(top.correction - 0.39606) < 1e-4);
  assert.equal(top.scrimGames, 1);
  // JG: 分布が無い(7 組)ので除く。試合は使われず、事前値だけ
  const jg = scoreDataAxis(csAxis, { rank: null, medianAnchor: 5, games: [{ ...game({ matchId: 'X2', position: 'JUNGLE', me: { csAt14: 110 }, opp: { csAt14: 100 } }), kind: 'scrim', queueId: 0 }], position: 'JUNGLE' }, out.population, cfg, NOW);
  assert.equal(jg.estimated, true);
  assert.equal(jg.effectiveGames, 0);
  assert.equal(jg.scrimGames, 0);
  assert.equal(jg.metrics[0].gamesWithOpponent, 0);
});

// F-004 Task-12: 受入基準 42(本番の試合の重み officialGameWeight と「本番 n 試合(重み w)を含む」)・27(n は指標を持つ試合だけ)。受入基準から書いた
test('F-004 AC42: 本番の試合(kind official)は新しさの重み × officialGameWeight で数え、有効な試合数 n・縮小・補正の重み付き平均・確度に効く', () => {
  const gold = { tier: 'GOLD', division: 'IV', lp: 0 };
  const cfgO: EngineConfig = { ...cfg, scrimGameWeight: 2, officialGameWeight: 4 };
  const solo = game({ ageDays: 0, me: { dmg: 21000 } }); // z = +1
  const off: GameRecord = { ...game({ ageDays: 0, me: { dmg: 19000 } }), kind: 'official', queueId: 0 }; // z = −1
  // n = 1 + 4 = 5、補正 = (1 × 1 + 4 × −1) ÷ 5 = −0.6、縮小 5 ÷ (5 + 8) = 5/13
  const r = scoreDataAxis(axis, { rank: gold, games: [solo, off], position: 'MIDDLE' }, population, cfgO, NOW);
  assert.ok(Math.abs(r.effectiveGames - 5) < 1e-9, `n = 1 + 4 = 5(${r.effectiveGames})`);
  assert.ok(Math.abs(r.correction - -0.6) < 1e-9, `${r.correction}`);
  assert.ok(Math.abs(r.shrink - 5 / 13) < 1e-9);
  assert.equal(r.officialGames, 1);
  assert.equal(r.scrimGames, 0);
  assert.match(r.confidenceReason, /本番 1 試合\(重み 4\.0\)を含む/);
  assert.doesNotMatch(r.confidenceReason, /スクリム/);
  // 設定に officialGameWeight が無ければ 1 倍: n = 2、補正 0
  const r1 = scoreDataAxis(axis, { rank: gold, games: [solo, off], position: 'MIDDLE' }, population, cfg, NOW);
  assert.ok(Math.abs(r1.effectiveGames - 2) < 1e-9);
  assert.ok(Math.abs(r1.correction) < 1e-9);
  // 確度の有効な試合数も重みで数える: 本番 2 試合 × 4.0 = 8.0 → 中(重みが無ければ 2.0 → 低)
  const two: GameRecord[] = [1, 2].map((i) => ({ ...game({ ageDays: 0, matchId: `O${i}` }), kind: 'official', queueId: 0 }));
  assert.equal(scoreDataAxis(axis, { rank: gold, games: two, position: 'MIDDLE' }, population, cfgO, NOW).confidence, '中');
  assert.equal(scoreDataAxis(axis, { rank: gold, games: two, position: 'MIDDLE' }, population, cfg, NOW).confidence, '低');
  // スクリムと本番が両方あれば両方の文: n = 1 + 2 + 4 = 7、補正 = (1 − 2 − 4) ÷ 7 = −5/7
  const scrim: GameRecord = { ...game({ ageDays: 0, me: { dmg: 19000 } }), kind: 'scrim', queueId: 0 };
  const both = scoreDataAxis(axis, { rank: gold, games: [solo, scrim, off], position: 'MIDDLE' }, population, cfgO, NOW);
  assert.ok(Math.abs(both.effectiveGames - 7) < 1e-9);
  assert.ok(Math.abs(both.correction - -5 / 7) < 1e-9);
  assert.deepEqual([both.scrimGames, both.officialGames], [1, 1]);
  assert.match(both.confidenceReason, /スクリム 1 試合\(重み 2\.0\)を含む/);
  assert.match(both.confidenceReason, /本番 1 試合\(重み 4\.0\)を含む/);
  // ソロランクだけなら本番の文を出さない
  const only = scoreDataAxis(axis, { rank: gold, games: [solo], position: 'MIDDLE' }, population, cfgO, NOW);
  assert.equal(only.officialGames, 0);
  assert.doesNotMatch(only.confidenceReason, /本番/);
});

test('F-004 AC27・AC42: 本番の試合も csAt14 の分布で標準化し、分布の無いロールの試合は数えない(本番の n に入れない)', () => {
  const out = buildResultsPopulation([...topGames, ...jgGames], [csAxis], 8);
  const cfgO: EngineConfig = { ...cfg, officialGameWeight: 4 };
  // TOP: 自分 110・対面 100 の差 10 → z = 10 ÷ √637.5 = 0.39606。重み 4 の 1 試合だけなので補正は z のまま、n = 4
  const top = scoreDataAxis(csAxis, { rank: null, medianAnchor: 5, games: [{ ...game({ ageDays: 0, matchId: 'O1', position: 'TOP', me: { csAt14: 110 }, opp: { csAt14: 100 } }), kind: 'official', queueId: 0 }], position: 'TOP' }, out.population, cfgO, NOW);
  assert.ok(Math.abs(top.correction - 10 / RMS8) < 1e-9, `${top.correction}`);
  assert.ok(Math.abs(top.effectiveGames - 4) < 1e-9);
  assert.equal(top.officialGames, 1);
  assert.match(top.confidenceReason, /本番 1 試合\(重み 4\.0\)を含む/);
  // JG: 分布が無い(7 組)。csAt14 の無い試合(cs14 の無い試合)も数えない
  const jg = scoreDataAxis(csAxis, { rank: null, medianAnchor: 5, games: [{ ...game({ matchId: 'O2', position: 'JUNGLE', me: { csAt14: 110 }, opp: { csAt14: 100 } }), kind: 'official', queueId: 0 }], position: 'JUNGLE' }, out.population, cfgO, NOW);
  assert.equal(jg.officialGames, 0);
  assert.doesNotMatch(jg.confidenceReason, /本番/);
  const noCs = scoreDataAxis(csAxis, { rank: null, medianAnchor: 5, games: [{ ...game({ matchId: 'O3', position: 'TOP', me: { dmg: 1 }, opp: { dmg: 1 } }), kind: 'official', queueId: 0 }], position: 'TOP' }, out.population, cfgO, NOW);
  assert.equal(noCs.officialGames, 0);
});
