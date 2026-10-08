// F-001 基準2〜5: Regular Stage の得点、MASTERS CUP の順位点、シードと同点処理(QC-04)
import type { Card, Pair, Points, TeamId } from './types.ts';

/** 基準2: 1勝 1pt。同じチームが NEXT と CORE の両方に勝てばさらに 1pt */
export function scoreRegularCard(c: Card, nextWinner: TeamId, coreWinner: TeamId): Points {
  for (const w of [nextWinner, coreWinner]) {
    if (w !== c.blue && w !== c.red) throw new Error(`カード ${c.blue} vs ${c.red} に無いチーム ${w} が勝者に指定された`);
  }
  const pts: Points = { [c.blue]: 0, [c.red]: 0 };
  pts[nextWinner]! += 1;
  pts[coreWinner]! += 1;
  if (nextWinner === coreWinner) pts[nextWinner]! += 1;
  return pts;
}

export interface MastersCupResult {
  semis: readonly [Pair, Pair] | readonly Pair[];
  semiWinners: [TeamId, TeamId];
  thirdPlaceWinner: TeamId;
  finalWinner: TeamId;
}

/** 基準3: 1位 3pt・2位 2pt・3位 1pt・4位 0pt */
export function mastersCupPoints(r: MastersCupResult): Points {
  const losers = r.semis.map((pair, i) => {
    const w = r.semiWinners[i];
    if (!pair.includes(w)) throw new Error(`準決勝 ${pair.join(' vs ')} の勝者 ${w} がその組に属さない`);
    return pair[0] === w ? pair[1] : pair[0];
  });
  if (!r.semiWinners.includes(r.finalWinner)) throw new Error(`決勝の勝者 ${r.finalWinner} が決勝の出場チームではない`);
  if (!losers.includes(r.thirdPlaceWinner)) throw new Error(`3位決定戦の勝者 ${r.thirdPlaceWinner} が出場チームではない`);
  const second = r.semiWinners.find((t) => t !== r.finalWinner)!;
  const fourth = losers.find((t) => t !== r.thirdPlaceWinner)!;
  return { [r.finalWinner]: 3, [second]: 2, [r.thirdPlaceWinner]: 1, [fourth]: 0 };
}

export type Tiebreak = 'rs-points' | 'rs-head-to-head';

export interface SeedRow {
  team: TeamId;
  rs: number;
  mc: number;
}

export interface SeedOptions {
  tiebreak?: Tiebreak;
  /** 'A>B' の形のキーで、RS の直接対決で A が B から得た pt */
  headToHead?: Record<string, number>;
  rng?: () => number;
}

export interface SeedResult {
  order: TeamId[];
  tiebreakUsed: string | null;
}

/** 基準4・5: 合計 pt の降順。同点は設定した同点処理、それも同点なら乱数(Fisher–Yates) */
export function computeSeeds(rows: readonly SeedRow[], opts: SeedOptions = {}): SeedResult {
  const tiebreak = opts.tiebreak ?? 'rs-points';
  const rng = opts.rng ?? Math.random;
  const h2h = opts.headToHead ?? {};
  let usedTiebreak = false;
  let usedRandom = false;
  const secondary = (a: SeedRow, b: SeedRow): number => {
    if (tiebreak === 'rs-points') return b.rs - a.rs;
    const d = (h2h[`${b.team}>${a.team}`] ?? 0) - (h2h[`${a.team}>${b.team}`] ?? 0);
    return d !== 0 ? d : b.rs - a.rs;
  };
  const cmp = (a: SeedRow, b: SeedRow): number => {
    const total = b.rs + b.mc - (a.rs + a.mc);
    if (total !== 0) return total;
    usedTiebreak = true;
    return secondary(a, b);
  };
  const sorted = [...rows].sort(cmp);
  // 完全に同点の連続区間を乱数で並べ替える
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1;
    while (j < sorted.length && cmp(sorted[i], sorted[j]) === 0) j++;
    if (j - i > 1) {
      usedRandom = true;
      for (let k = j - 1; k > i; k--) {
        const r = i + Math.floor(rng() * (k - i + 1));
        [sorted[k], sorted[r]] = [sorted[r], sorted[k]];
      }
    }
    i = j;
  }
  return {
    order: sorted.map((r) => r.team),
    tiebreakUsed: usedTiebreak ? (usedRandom ? `${tiebreak}+random` : tiebreak) : null,
  };
}
