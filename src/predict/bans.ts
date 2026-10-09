// F-006 Task-2: BAN 候補の上位5体(受入基準 5)
// 相手の5人のピック候補(基準1 の上位3体)の見込みの値をチャンピオンごとに合計した降順。NEXT では相手のプロテクトのうち BAN できない1体を除く
import type { PlayerPicks } from './picks.ts';
import type { ProtectResult } from './protect.ts';

export interface BanCandidate {
  championId: number;
  name?: string;
  /** 相手の見込みの値の合計 */
  value: number;
}

export const BAN_TOP = 5;

export function banCandidates(opponentPicks: readonly PlayerPicks[], opponentProtect?: Pick<ProtectResult, 'protects' | 'likelyBan'>): BanCandidate[] {
  const unbannable = new Set((opponentProtect?.protects ?? []).map((p) => p.championId).filter((id) => id !== opponentProtect?.likelyBan));
  const sums = new Map<number, BanCandidate>();
  for (const pl of opponentPicks) {
    for (const c of pl.candidates) {
      if (unbannable.has(c.championId)) continue;
      const cur = sums.get(c.championId) ?? { championId: c.championId, ...(c.name ? { name: c.name } : {}), value: 0 };
      cur.value += c.value;
      sums.set(c.championId, cur);
    }
  }
  return [...sums.values()].sort((a, b) => b.value - a.value || a.championId - b.championId).slice(0, BAN_TOP);
}
