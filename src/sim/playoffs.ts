// F-001 基準6〜8: Playoffs の特殊 BO4 とダブルエリミネーション
import { TIERS } from './types.ts';
import type { TeamId, Tier } from './types.ts';

/** 上位シードがその階級の1試合に勝つ確率 */
export type TierProb = Record<Tier, number>;
export type TierOrder = [Tier, Tier, Tier];
export type TierPolicy = 'strongest-g3' | 'max-match' | 'random';

export interface GameResult {
  tier: Tier;
  winner: TeamId;
}

export interface MatchResult {
  high: TeamId;
  low: TeamId;
  winner: TeamId;
  loser: TeamId;
  /** [上位シードの pt, 下位シードの pt] */
  score: [number, number];
  order: TierOrder;
  games: GameResult[];
}

const PERMUTATIONS: TierOrder[] = TIERS.flatMap((a) =>
  TIERS.filter((b) => b !== a).map((b) => [a, b, TIERS.find((t) => t !== a && t !== b)!] as TierOrder),
);

/** GAME 4 の階級: GAME 3 以外の2階級のうち、上位シードの勝率が高い方(上位シードが選ぶ) */
function game4Tier(p: TierProb, order: TierOrder): Tier {
  const [a, b] = [order[0], order[1]];
  return p[b] > p[a] ? b : a;
}

/** 基準6: 上位シードがマッチに勝つ確率(GAME 1・2 が各1pt、GAME 3 が2pt、2-2 なら GAME 4) */
export function matchWinProbability(p: TierProb, order: TierOrder): number {
  const [g1, g2, g3] = order.map((t) => p[t]);
  const p4 = p[game4Tier(p, order)];
  const winOutright = g3 * (1 - (1 - g1) * (1 - g2));
  const tied = g3 * (1 - g1) * (1 - g2) + (1 - g3) * g1 * g2;
  return winOutright + tied * p4;
}

/** 基準7: 上位シードが GAME 1〜3 の階級を決める */
export function assignTiers(p: TierProb, policy: TierPolicy = 'strongest-g3', rng: () => number = Math.random): TierOrder {
  if (policy === 'random') return [...PERMUTATIONS[Math.min(5, Math.floor(rng() * 6))]] as TierOrder;
  if (policy === 'max-match') {
    let best = PERMUTATIONS[0];
    for (const o of PERMUTATIONS) if (matchWinProbability(p, o) > matchWinProbability(p, best)) best = o;
    return [...best] as TierOrder;
  }
  const sorted = [...TIERS].sort((a, b) => p[a] - p[b]);
  return [sorted[0], sorted[1], sorted[2]];
}

/** 基準6: 1マッチを模擬する。rng() < 上位シードの勝率 のとき上位シードがその GAME に勝つ */
export function playBo4(high: TeamId, low: TeamId, p: TierProb, order: TierOrder, rng: () => number): MatchResult {
  const points = [1, 1, 2];
  const score: [number, number] = [0, 0];
  const games: GameResult[] = [];
  const play = (tier: Tier, pt: number) => {
    const highWins = rng() < p[tier];
    score[highWins ? 0 : 1] += pt;
    games.push({ tier, winner: highWins ? high : low });
  };
  order.forEach((tier, i) => play(tier, points[i]));
  if (score[0] === score[1]) play(game4Tier(p, order), 1);
  const highWon = score[0] > score[1];
  return { high, low, winner: highWon ? high : low, loser: highWon ? low : high, score, order, games };
}

export interface PlayoffResult {
  upperFinal: MatchResult;
  lowerSemi: MatchResult;
  lowerFinal: MatchResult;
  grandFinal: MatchResult;
  champion: TeamId;
  /** 1位〜4位 */
  placement: [TeamId, TeamId, TeamId, TeamId];
}

/** 基準8: UF(1v2)・LS(3v4)・LF(UF 敗者 v LS 勝者)・GF(UF 勝者 v LF 勝者、アドバンテージなし) */
export function runPlayoffs(
  seeds: readonly TeamId[],
  probOf: (high: TeamId, low: TeamId) => TierProb,
  rng: () => number,
  policy: TierPolicy = 'strongest-g3',
): PlayoffResult {
  const rank = (t: TeamId) => seeds.indexOf(t);
  const match = (a: TeamId, b: TeamId) => {
    const [high, low] = rank(a) < rank(b) ? [a, b] : [b, a];
    const p = probOf(high, low);
    return playBo4(high, low, p, assignTiers(p, policy, rng), rng);
  };
  const upperFinal = match(seeds[0], seeds[1]);
  const lowerSemi = match(seeds[2], seeds[3]);
  const lowerFinal = match(upperFinal.loser, lowerSemi.winner);
  const grandFinal = match(upperFinal.winner, lowerFinal.winner);
  return {
    upperFinal,
    lowerSemi,
    lowerFinal,
    grandFinal,
    champion: grandFinal.winner,
    placement: [grandFinal.winner, grandFinal.loser, lowerFinal.loser, lowerSemi.loser],
  };
}
