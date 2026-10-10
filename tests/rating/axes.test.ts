// F-009 Task-2: 受入基準 10・11(データの6軸、LTK の経験の項、ピックプール)と軸の定義
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitLevelAndShape, DATA_AXES, ltkBonus, rateDataAxes, buildRatingContext } from '../../src/rating/axes.ts';
import { loadEngineConfig } from '../../src/rating/engine.ts';
import type { GameRecord } from '../../src/rating/types.ts';
import axesConf from '../../src/rating/axes.json' with { type: 'json' };
// 評価設定の初期値(2026-10-10 に 0.4/1.2 → 0.2/0.6 へ変更。出場歴が 4 軸に効く二重カウントの緩和)
const PER = (axesConf as { ltkBonusPerSeason: number }).ltkBonusPerSeason;
const CAP = (axesConf as { ltkBonusCap: number }).ltkBonusCap;

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-09T00:00:00Z');
const cfg = loadEngineConfig();
let seq = 0;
const g = (pos: string, champ: string, win: boolean, me: Record<string, number> = {}, opp: Record<string, number> = {}, ageDays = 3): GameRecord => ({
  matchId: `M${++seq}`,
  endTime: NOW - ageDays * DAY,
  durationMin: 30,
  queueId: 420,
  position: pos,
  me: { championId: [...champ].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 100000, 7), win: win ? 1 : 0, deaths: 4, totalDamageDealtToChampions: 20000, goldPerMinute: 400, ...me },
  opp: { deaths: 4, totalDamageDealtToChampions: 20000, goldPerMinute: 400, ...opp },
});

test('個人のデータの6軸は 地力・レーン戦・集団戦・連携・安定感・ピックプール', () => {
  assert.deepEqual(DATA_AXES.map((a) => a.label), ['地力', 'レーン戦', '集団戦', '連携', '安定感', 'ピックプール']);
});

test('レーン戦・集団戦・連携は大会のロールの試合だけ、地力・安定感はロールを問わない(基準2)', () => {
  const dep = Object.fromEntries(DATA_AXES.map((a) => [a.key, a.roleDependent]));
  assert.deepEqual(dep, { ground: false, laning: true, teamfight: true, synergy: true, stability: false, pool: true });
});

test('レーン戦の指標はロールで変わる(JG は序盤のジャングル、SUP は視界と序盤の関与)', () => {
  const laning = DATA_AXES.find((a) => a.key === 'laning')!;
  const forPos = (p: string) => laning.metrics.filter((m) => !m.positions || m.positions.includes(p)).map((m) => m.key);
  assert.ok(forPos('JUNGLE').includes('scuttleCrabKills'));
  assert.ok(!forPos('JUNGLE').includes('maxCsAdvantageOnLaneOpponent'));
  assert.ok(forPos('UTILITY').includes('visionScorePerMinute'));
  assert.ok(forPos('MIDDLE').includes('maxCsAdvantageOnLaneOpponent'));
});

test('AC10: LTK の経験の項は参加シーズン数 × 評価設定の 1 シーズンあたりの加点、上限あり(初期値 0.2 / 0.6)', () => {
  assert.equal(PER, 0.2);
  assert.equal(CAP, 0.6);
  assert.equal(ltkBonus(0), 0);
  assert.ok(Math.abs(ltkBonus(1) - PER) < 1e-12);
  assert.ok(Math.abs(ltkBonus(2) - 2 * PER) < 1e-12);
  assert.ok(Math.abs(ltkBonus(3) - CAP) < 1e-12);
  assert.ok(Math.abs(ltkBonus(5) - CAP) < 1e-12);
});

const player = (id: string, pos: string, games: GameRecord[], extra: Partial<Parameters<typeof rateDataAxes>[0]> = {}) => ({
  playerId: id,
  position: pos,
  rank: { tier: 'DIAMOND', division: 'IV', lp: 0 },
  games,
  ltkSeasons: 0,
  ...extra,
});

test('AC10: LTK の経験の項は集団戦・連携・安定感だけに加わり、説明に根拠を示す', () => {
  const games = Array.from({ length: 10 }, () => g('MIDDLE', 'Ahri', true));
  const a = player('A', 'MIDDLE', games, { ltkSeasons: 0 });
  const b = player('B', 'MIDDLE', games, { ltkSeasons: 2, ltkSeasonNames: ['S2', 'S3'] });
  const ctx = buildRatingContext([a, b], [], cfg, NOW);
  const ra = Object.fromEntries(rateDataAxes(a, ctx).map((x) => [x.key, x]));
  const rb = Object.fromEntries(rateDataAxes(b, ctx).map((x) => [x.key, x]));
  for (const k of ['teamfight', 'synergy', 'stability']) assert.ok(Math.abs(rb[k].base - ra[k].base - 2 * PER) < 1e-9, k);
  for (const k of ['ground', 'laning', 'pool']) assert.equal(rb[k].base, ra[k].base, k);
  assert.match(rb.teamfight.bonusReason!, /S2.*S3/);
});

test('AC11: ピックプールは「3試合以上遊んだチャンピオンの数」とその勝率で決まり、遊んだ総数では決まらない', () => {
  // 狭く深い: 3体 × 5試合(全勝寄り) / 広く浅い: 15体 × 1試合
  const deep = ['Ahri', 'Orianna', 'Syndra'].flatMap((c) => Array.from({ length: 5 }, (_, i) => g('MIDDLE', c, i < 4)));
  const shallow = Array.from({ length: 15 }, (_, i) => g('MIDDLE', `C${String.fromCharCode(65 + i)}x`, i % 2 === 0));
  const mid = ['Ahri', 'Orianna'].flatMap((c) => Array.from({ length: 4 }, (_, i) => g('MIDDLE', c, i < 2)));
  const ps = [player('DEEP', 'MIDDLE', deep), player('SHALLOW', 'MIDDLE', shallow), player('MID', 'MIDDLE', mid)];
  const ctx = buildRatingContext(ps, [], cfg, NOW);
  const pool = (id: string) => rateDataAxes(ps.find((p) => p.playerId === id)!, ctx).find((x) => x.key === 'pool')!;
  assert.ok(pool('DEEP').base > pool('SHALLOW').base, `${pool('DEEP').base} > ${pool('SHALLOW').base}`);
  assert.equal(pool('SHALLOW').poolDetail!.champions, 0);
  assert.equal(pool('DEEP').poolDetail!.champions, 3);
});

test('ピックプール: 大会のロールの試合が無ければ熟練度の合計(60選手の中の位置)から推定する', () => {
  const ps = [
    player('NOROLE', 'TOP', [g('MIDDLE', 'Ahri', true)], { masteryScore: 900 }),
    player('X', 'TOP', [g('TOP', 'Garen', true)], { masteryScore: 300 }),
    player('Y', 'TOP', [g('TOP', 'Darius', false)], { masteryScore: 600 }),
  ];
  const ctx = buildRatingContext(ps, [], cfg, NOW);
  const r = rateDataAxes(ps[0], ctx).find((x) => x.key === 'pool')!;
  assert.equal(r.estimated, true);
  assert.equal(r.confidence, '低');
  assert.ok(r.base > 5);
});

test('安定感: デスが対面より少ないほど高い', () => {
  const few = Array.from({ length: 10 }, () => g('TOP', 'Garen', true, { deaths: 2 }, { deaths: 6 }));
  const many = Array.from({ length: 10 }, () => g('TOP', 'Garen', true, { deaths: 7 }, { deaths: 3 }));
  const ps = [player('FEW', 'TOP', few), player('MANY', 'TOP', many)];
  const ctx = buildRatingContext(ps, [], cfg, NOW);
  const st = (i: number) => rateDataAxes(ps[i], ctx).find((x) => x.key === 'stability')!.base;
  assert.ok(st(0) > st(1));
});

test('常識 K-01 の性質: 同じ出来ならランクの基準が高い選手の地力が高い', () => {
  const games = Array.from({ length: 12 }, () => g('MIDDLE', 'Ahri', true));
  const hi = player('HI', 'MIDDLE', games, { rank: { tier: 'CHALLENGER', division: 'I', lp: 1500 } });
  const lo = player('LO', 'MIDDLE', games, { rank: { tier: 'GOLD', division: 'IV', lp: 0 } });
  const ctx = buildRatingContext([hi, lo], [], cfg, NOW);
  const gr = (p: typeof hi) => rateDataAxes(p, ctx).find((x) => x.key === 'ground')!.base;
  assert.ok(gr(hi) - gr(lo) > 3);
});

test('6軸すべてが 0〜10 で確度を持つ', () => {
  const ps = [player('A', 'BOTTOM', Array.from({ length: 8 }, () => g('BOTTOM', 'Jinx', true)))];
  const ctx = buildRatingContext(ps, [], cfg, NOW);
  for (const r of rateDataAxes(ps[0], ctx)) {
    assert.ok(r.base >= 0 && r.base <= 10, r.key);
    assert.ok(['高', '中', '低'].includes(r.confidence), r.key);
  }
});

test('常識: ソロランクの無い選手の出発点は、同じ階級の選手のランクの中央値(全体の中央値にしない)', () => {
  const games = Array.from({ length: 10 }, () => g('UTILITY', 'Lulu', true));
  const ps = [
    player('N1', 'UTILITY', games, { tier: 'NEXT', rank: { tier: 'GOLD', division: 'II', lp: 0 } }),
    player('N2', 'UTILITY', games, { tier: 'NEXT', rank: { tier: 'PLATINUM', division: 'IV', lp: 0 } }),
    player('N3', 'UTILITY', games, { tier: 'NEXT', rank: null }),
    player('M1', 'UTILITY', games, { tier: 'MASTERS', rank: { tier: 'MASTER', division: 'I', lp: 500 } }),
    player('M2', 'UTILITY', games, { tier: 'MASTERS', rank: { tier: 'CHALLENGER', division: 'I', lp: 1500 } }),
    player('M3', 'UTILITY', games, { tier: 'MASTERS', rank: { tier: 'GRANDMASTER', division: 'I', lp: 900 } }),
  ];
  const ctx = buildRatingContext(ps, [], cfg, NOW);
  const ground = rateDataAxes(ps[2], ctx).find((x) => x.key === 'ground')!;
  assert.equal(ground.anchorSource, '母集団の中央値');
  assert.ok(ground.anchor < 5, `NEXT の中央値に近いはず: ${ground.anchor}`);
});

// F-009 Task-11: 受入基準 29(元プロの下限)がピックプールを含む6軸で同じに効く
test('AC29: 元プロの下限と「ソロランクと最高ランクの高い方」は、ピックプールを含む6軸で同じ基準と出どころになる', () => {
  const games = Array.from({ length: 12 }, () => g('MIDDLE', 'Ahri', true));
  const ex = player('EX', 'MIDDLE', games, { rank: { tier: 'GOLD', division: 'IV', lp: 0 }, exPro: { level: 'LJL-sub', source: 'https://example.test/wiki/A' } });
  const ctx = buildRatingContext([ex], [], cfg, NOW);
  for (const r of rateDataAxes(ex, ctx)) {
    assert.equal(r.anchor, 8, r.key);
    assert.equal(r.anchorSource, '元プロの下限', r.key);
    // 指標の無い軸(この試合の記録ではレーン戦・集団戦・連携)は推定なので「低」が正しい。確度の降格だけを見る
    if (!r.estimated) assert.notEqual(r.confidence, '低', `${r.key}: ソロランクがあるので確度は下げない`);
  }
  const pk = player('PK', 'MIDDLE', games, { rank: { tier: 'GOLD', division: 'IV', lp: 0 }, peakRank: { tier: 'MASTER', division: 'I', lp: 750, source: 'https://example.test/opgg/pk' } });
  const ctx2 = buildRatingContext([pk], [], cfg, NOW);
  for (const r of rateDataAxes(pk, ctx2)) {
    assert.equal(r.anchor, 9, r.key);
    assert.equal(r.anchorSource, '最高ランク', r.key);
    if (!r.estimated) assert.notEqual(r.confidence, '低', r.key);
  }
});

// 2026-10-10: 直近成績の補正の水準と形の分離
test('水準と形: shapeScale があれば、ピックプール以外の軸に (補正 − 平均) × 縮小 × (shapeScale − perfScale) を足す。平均は変わらず、無ければ何もしない', () => {
  const mk = (key: string, correction: number, base: number) => ({ key, label: key, base, correction, shrink: 0.8, estimated: false } as unknown as Parameters<typeof splitLevelAndShape>[0][number]);
  const rs = [mk('ground', 0.4, 6), mk('laning', -0.4, 6), mk('pool', 0.9, 6)];
  const out = splitLevelAndShape(rs, { perfScale: 0.5, shapeScale: 1.5 });
  assert.ok(Math.abs(out[0].base - (6 + 0.4 * 0.8 * 1.0)) < 1e-12);
  assert.ok(Math.abs(out[1].base - (6 - 0.4 * 0.8 * 1.0)) < 1e-12);
  assert.equal(out[2].base, 6);
  assert.ok(Math.abs((out[0].shapeAdj ?? 0) + (out[1].shapeAdj ?? 0)) < 1e-12);
  assert.deepEqual(splitLevelAndShape(rs, { perfScale: 0.5 }).map((r) => r.base), [6, 6, 6]);
});
