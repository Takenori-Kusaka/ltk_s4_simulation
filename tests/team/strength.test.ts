// F-010 Task-2: 受入基準 1・2・2b・3・4・6・6b(階級チームの強さの軸と相対評価)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER } from '../../src/data/roster.ts';
import { POSITION, type PlayerRating, type PlayerRatingInput } from '../../src/rating/build.ts';
import type { GameRecord } from '../../src/rating/types.ts';
import type { ShotcallingEvidence, TournamentRecord } from '../../src/rating/evidence.ts';
import { computeStrength, playerOverall, relativeScores, coachPrior, type TierTeamStrength } from '../../src/team/strength.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-09T00:00:00Z');
const KEYS = ['ground', 'laning', 'teamfight', 'synergy', 'stability', 'pool', 'shotcalling', 'tournament'];
const near = (a: number | null, b: number, eps = 1e-9) => assert.ok(a !== null && Math.abs(a - b) < eps, `${a} != ${b}`);

/** 8軸の表示の点数を指定した評価(既定はすべて 5.0・確度 高) */
function rating(id: string, axes: Partial<Record<string, number>> = {}, conf: Partial<Record<string, '高' | '中' | '低'>> = {}): PlayerRating {
  const p = ROSTER.find((r) => r.id === id)!;
  return {
    playerId: id, name: p.name, tier: p.tier, position: POSITION[p.role],
    form: { coefficient: 1, label: '普通', insufficient: false, games: 10, wins: 5, score: 0, components: { winRate: 0.5, winRateTerm: 0, lpDelta: null, lpTerm: 0, practiceTerm: 0 }, reason: '' },
    axes: KEYS.map((key) => ({ key, label: key, base: axes[key] ?? 5, display: axes[key] ?? 5, confidence: conf[key] ?? '高', estimated: false, marks: [], reason: '' })),
  };
}
let seq = 0;
/** 大会のロールの試合。champ ごとに n 試合、そのうち w 勝 */
function games(id: string, champs: [number, number, number][]): GameRecord[] {
  const pos = POSITION[ROSTER.find((r) => r.id === id)!.role];
  return champs.flatMap(([championId, n, w]) =>
    Array.from({ length: n }, (_, i) => ({
      matchId: `M${++seq}`, endTime: NOW - (1 + (seq % 30)) * DAY, durationMin: 30, queueId: 420, position: pos,
      me: { championId, win: i < w ? 1 : 0 }, opp: { championId: 9999, win: i < w ? 0 : 1 },
    })),
  );
}
const NO_RECORD: TournamentRecord = { ltk: [], coach: [], pro: [], other: [] };
const ev = (direction: '+' | '-'): ShotcallingEvidence => ({ summary: 's', source: 'https://example.com', direction, strength: '強', kind: 'player', collectedBy: 'ai' });
function input(id: string, extra: Partial<PlayerRatingInput> = {}): PlayerRatingInput {
  const p = ROSTER.find((r) => r.id === id)!;
  return { playerId: id, name: p.name, tier: p.tier, position: POSITION[p.role], rank: null, games: [], league: [], shotcalling: [ev('+')], tournament: NO_RECORD, ...extra };
}
/** 60 選手の既定の評価と入力。over で選手ごとに差し替える */
function world(over: Record<string, { axes?: Partial<Record<string, number>>; conf?: Partial<Record<string, '高' | '中' | '低'>>; input?: Partial<PlayerRatingInput> }> = {}) {
  return {
    ratings: ROSTER.map((r) => rating(r.id, over[r.id]?.axes, over[r.id]?.conf)),
    inputs: ROSTER.map((r) => input(r.id, over[r.id]?.input)),
  };
}
const find = (xs: TierTeamStrength[], team: string, tier: string) => xs.find((x) => x.team === team && x.tier === tier)!;
const axis = (t: TierTeamStrength, key: string) => t.axes.find((a) => a.key === key)!;
const members = (team: string, tier: string) => ROSTER.filter((r) => r.team === team && r.tier === tier);

test('用語: 選手の総合 O は8軸の表示の点数の 5.0 からの差の平均', () => {
  near(playerOverall(rating('DD-CORE-MID', { ground: 9 })), 5.5);
  near(playerOverall(rating('DD-CORE-MID', { ground: 9, pool: 1 })), 5.0);
});

test('AC1: NEXT・CORE の戦力 S = 0.85 × Σ ロールの重み × O + 0.15 × コーチの総合 C', () => {
  const over = Object.fromEntries(members('DD', 'CORE').map((r) => [r.id, { axes: Object.fromEntries(KEYS.map((k) => [k, 6])) }]));
  const w = world(over);
  const t = find(computeStrength({ ...w, now: NOW, coachC: { 'DD-CORE': 8 } }), 'DD', 'CORE');
  near(t.S, 0.85 * 6 + 0.15 * 8);
  near(t.coachC!, 8);
  assert.equal(t.coachEstimated, false);
});

test('AC1: ロールの重みは MID 0.24 / JG 0.21 / SUP 0.21 / TOP 0.17 / ADC 0.17', () => {
  const allTen = Object.fromEntries(KEYS.map((k) => [k, 10]));
  const w = world({ 'CC-CORE-MID': { axes: allTen } });
  near(find(computeStrength({ ...w, now: NOW, coachC: { 'CC-CORE': 5 } }), 'CC', 'CORE').S, 0.85 * (5 + 0.24 * 5) + 0.15 * 5);
  const w2 = world({ 'CC-CORE-TOP': { axes: allTen } });
  near(find(computeStrength({ ...w2, now: NOW, coachC: { 'CC-CORE': 5 } }), 'CC', 'CORE').S, 0.85 * (5 + 0.17 * 5) + 0.15 * 5);
});

test('AC1: MASTERS はコーチの枠を持たず、S = Σ ロールの重み × O', () => {
  const over = Object.fromEntries(members('IT', 'MASTERS').map((r) => [r.id, { axes: Object.fromEntries(KEYS.map((k) => [k, 7])) }]));
  const t = find(computeStrength({ ...world(over), now: NOW }), 'IT', 'MASTERS');
  near(t.S, 7);
  assert.equal(t.coachC, null);
});

test('AC1(Task-3 まで): コーチの総合が渡されない間は、仕様 5c の事前値(4.0・5.0・5.0・5.0・大会経験)の平均を推定として使う', () => {
  const w = world({ 'DD-MASTERS-TOP': { axes: { tournament: 8 } } });
  near(coachPrior(w.ratings.find((r) => r.playerId === 'DD-MASTERS-TOP')), (4 + 5 + 5 + 5 + 8) / 5);
  const t = find(computeStrength({ ...w, now: NOW }), 'DD', 'CORE');
  near(t.coachC!, (4 + 5 + 5 + 5 + 8) / 5);
  assert.equal(t.coachEstimated, true);
  near(t.S, 0.85 * 5 + 0.15 * ((4 + 5 + 5 + 5 + 8) / 5));
});

test('AC2: 表示の点数は同じ階級の4チームの相対評価(5.0 + 2.0 × 標準化、0.0〜10.0)。すべて同じなら 5.0', () => {
  assert.deepEqual(relativeScores([3, 3, 3, 3]), [5, 5, 5, 5]);
  const r = relativeScores([4, 5, 6, 7]);
  const sd = Math.sqrt(((1.5 ** 2) * 2 + (0.5 ** 2) * 2) / 4);
  near(r[0], 5 + 2 * (-1.5 / sd));
  near(r[3], 5 + 2 * (1.5 / sd));
  assert.deepEqual(relativeScores([0, 0, 0, 100]).map((x) => x >= 0 && x <= 10), [true, true, true, true]);
  assert.deepEqual(relativeScores([null, 4, 6, null]), [null, 3, 7, null]);
});

test('AC2: 勝率と総合の軸に使う戦力 S は相対評価の前の値のまま持ち、表示は相対評価', () => {
  const over: Record<string, { axes: Partial<Record<string, number>> }> = {};
  const levels: Record<string, number> = { DD: 4, CC: 5, IT: 6, LR: 7 };
  for (const r of ROSTER.filter((x) => x.tier === 'MASTERS')) over[r.id] = { axes: Object.fromEntries(KEYS.map((k) => [k, levels[r.team]])) };
  const xs = computeStrength({ ...world(over), now: NOW });
  near(find(xs, 'LR', 'MASTERS').S, 7);
  const disp = (team: string) => axis(find(xs, team, 'MASTERS'), 'power').display!;
  near(disp('LR'), relativeScores([4, 5, 6, 7])[3]);
  assert.ok(disp('DD') < 5 && disp('LR') > 5);
});

test('AC2b: 連携の厚み = 5人の (連携 + 集団戦) ÷ 2 の平均 + 継続性の組の数 × 0.1', () => {
  const ltk = (season: string) => ({ ltk: [{ season, team: 'CC', tier: 'CORE', role: 'MID', wins: null, losses: null, source: 's' }], coach: [], pro: [], other: [] });
  const over = {
    'CC-CORE-TOP': { axes: { synergy: 8, teamfight: 6 }, input: { tournament: ltk('S3') } },
    'CC-CORE-JG': { input: { tournament: ltk('S3') } },
    'CC-CORE-MID': { input: { tournament: ltk('S3') } },
  };
  const t = find(computeStrength({ ...world(over), now: NOW }), 'CC', 'CORE');
  near(axis(t, 'synergy').raw, (7 + 5 * 4) / 5 + 3 * 0.1);
});

test('AC3: 司令塔 = コール力の最大値 × 0.7 + 役の項 × 0.3(6.0 以上の選手が 1人 3.0、2人 2.0、3人以上 1.0、0人 0)', () => {
  const one = find(computeStrength({ ...world({ 'IT-CORE-MID': { axes: { shotcalling: 9 } } }), now: NOW }), 'IT', 'CORE');
  near(axis(one, 'shotcalling').raw, 9 * 0.7 + 3 * 0.3);
  const two = find(computeStrength({ ...world({ 'IT-CORE-MID': { axes: { shotcalling: 9 } }, 'IT-CORE-JG': { axes: { shotcalling: 6 } } }), now: NOW }), 'IT', 'CORE');
  near(axis(two, 'shotcalling').raw, 9 * 0.7 + 2 * 0.3);
  const three = find(computeStrength({ ...world({ 'IT-CORE-MID': { axes: { shotcalling: 9 } }, 'IT-CORE-JG': { axes: { shotcalling: 6 } }, 'IT-CORE-SUP': { axes: { shotcalling: 7 } } }), now: NOW }), 'IT', 'CORE');
  near(axis(three, 'shotcalling').raw, 9 * 0.7 + 1 * 0.3);
  const none = find(computeStrength({ ...world(), now: NOW }), 'IT', 'CORE');
  near(axis(none, 'shotcalling').raw, 5 * 0.7);
});

test('AC3: 5人全員のコール力が「実績なし」(肯定の根拠が無い)なら確度「低」', () => {
  const over = Object.fromEntries(members('LR', 'NEXT').map((r) => [r.id, { axes: { shotcalling: 2.5 }, input: { shotcalling: [] } }]));
  const t = find(computeStrength({ ...world(over), now: NOW }), 'LR', 'NEXT');
  assert.equal(axis(t, 'shotcalling').confidence, '低');
  const t2 = find(computeStrength({ ...world(), now: NOW }), 'LR', 'NEXT');
  assert.notEqual(axis(t2, 'shotcalling').confidence, '低');
});

test('AC4: 継続性 = 過去の LTK で同じシーズンに同じチームの同じ階級で出場した2人の組の数(確度 高)', () => {
  const rec = (season: string, team: string, tier: string) => ({ ltk: [{ season, team, tier, role: 'TOP', wins: null, losses: null, source: 's' }], coach: [], pro: [], other: [] });
  const over = {
    'DD-NEXT-TOP': { input: { tournament: rec('S2', 'RR', 'NEXT') } },
    'DD-NEXT-JG': { input: { tournament: rec('S2', 'RR', 'NEXT') } },
    'DD-NEXT-MID': { input: { tournament: rec('S2', 'RR', 'NEXT') } },
    'DD-NEXT-ADC': { input: { tournament: rec('S2', 'RR', 'CORE') } },
    'DD-NEXT-SUP': { input: { tournament: rec('S1', 'RR', 'NEXT') } },
  };
  const t = find(computeStrength({ ...world(over), now: NOW }), 'DD', 'NEXT');
  near(axis(t, 'continuity').raw, 3);
  assert.equal(axis(t, 'continuity').confidence, '高');
});

test('AC6: ピックの幅 = 5人のピックプールの平均 − NEXT と CORE の得意チャンピオンの重なりの数 × 0.3', () => {
  const over: Record<string, { axes?: Partial<Record<string, number>>; input?: Partial<PlayerRatingInput> }> = {
    'CC-CORE-TOP': { axes: { pool: 7 }, input: { games: games('CC-CORE-TOP', [[1, 4, 2], [2, 3, 1]]) } },
    'CC-NEXT-TOP': { input: { games: games('CC-NEXT-TOP', [[1, 2, 1], [3, 5, 3]]) } },
    'CC-NEXT-MID': { input: { games: games('CC-NEXT-MID', [[2, 1, 1]]) } },
  };
  const xs = computeStrength({ ...world(over), now: NOW });
  near(axis(find(xs, 'CC', 'CORE'), 'pool').raw, (7 + 5 * 4) / 5 - 2 * 0.3);
  near(axis(find(xs, 'CC', 'NEXT'), 'pool').raw, 5 - 2 * 0.3);
  near(axis(find(xs, 'CC', 'MASTERS'), 'pool').raw, 5);
});

test('AC6: 得意チャンピオンは大会のロールの試合数の多い上位5体(ロール外の試合は数えない)', () => {
  const offRole = games('DD-NEXT-TOP', [[7, 6, 3]]).map((g) => ({ ...g, position: 'MIDDLE' }));
  const over = {
    'DD-CORE-TOP': { input: { games: games('DD-CORE-TOP', [[7, 3, 1]]) } },
    'DD-NEXT-TOP': { input: { games: offRole } },
  };
  near(axis(find(computeStrength({ ...world(over), now: NOW }), 'DD', 'CORE'), 'pool').raw, 5);
});

test('AC6b: フィアレス耐性 = 勝てるチャンピオン(3試合以上・勝率 50% 以上)の数のうち、少ない方から3人の平均', () => {
  const over = {
    'LR-CORE-TOP': { input: { games: games('LR-CORE-TOP', [[1, 3, 2], [2, 4, 2], [3, 5, 1]]) } },
    'LR-CORE-JG': { input: { games: games('LR-CORE-JG', [[1, 3, 3], [2, 3, 2], [3, 3, 2], [4, 3, 2]]) } },
    'LR-CORE-MID': { input: { games: games('LR-CORE-MID', [[1, 2, 2]]) } },
    'LR-CORE-ADC': { input: { games: games('LR-CORE-ADC', [[1, 3, 2]]) } },
    'LR-CORE-SUP': { input: { games: games('LR-CORE-SUP', [[1, 3, 2], [2, 3, 2], [3, 3, 2]]) } },
  };
  // 勝てるチャンピオンの数: TOP 2, JG 4, MID 0, ADC 1, SUP 3 → 少ない方から 0, 1, 2
  near(axis(find(computeStrength({ ...world(over), now: NOW }), 'LR', 'CORE'), 'fearless').raw, 1);
});

test('AC2: 強さの軸は 戦力・連携の厚み・司令塔・継続性・ピックの幅・フィアレス耐性 を持ち、表示はすべて 0.0〜10.0 か データなし', () => {
  const xs = computeStrength({ ...world(), now: NOW });
  assert.equal(xs.length, 12);
  for (const t of xs) {
    assert.deepEqual(t.axes.map((a) => a.key), ['power', 'synergy', 'shotcalling', 'continuity', 'pool', 'fearless']);
    for (const a of t.axes) assert.ok(a.display === null || (a.display >= 0 && a.display <= 10));
  }
});
