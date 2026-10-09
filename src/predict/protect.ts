// F-006 Task-2: NEXT のプロテクト候補と軸にする選手・理由(受入基準 4・4b)
// プロテクトの値 u = 見込みの値 v × ロールの重み w_r × (1 + protect.metaBonus × メタの重要度 g)
import { loadPickConfig, pickCandidates, type PickCandidate, type PickConfig } from './picks.ts';
import type { PlayerPool } from '../meta/match.ts';
import type { MetaGuide } from '../meta/load.ts';
import teamConfig from '../team/config.json' with { type: 'json' };

/** F-010 のロールの重み(src/team/config.json の roleWeights) */
export const ROLE_WEIGHTS: Record<string, number> = { ...(teamConfig as { roleWeights: Record<string, number> }).roleWeights };

export function protectValue(c: PickCandidate, role: string, cfg: PickConfig = loadPickConfig()): number {
  return c.value * (ROLE_WEIGHTS[role] ?? 0) * (1 + cfg.protect.metaBonus * c.meta);
}

export interface ProtectCandidate extends PickCandidate {
  /** 軸にする選手 */
  playerId: string;
  role: string;
  protectValue: number;
  reason: string;
}

export interface ProtectResult {
  /** プロテクト候補(最大2体。プロテクトの値の降順) */
  protects: ProtectCandidate[];
  /** 2体に満たない枠の数 */
  missing: number;
  /** 相手が BAN しそうな1体(2体のうちプロテクトの値の大きい方)。候補が無ければ null */
  likelyBan: number | null;
  /** ピックプールが狭い選手の2体を守った場合の、その選手 */
  narrowPlayerId: string | null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const tierText = (g: number, cfg: PickConfig) => (g >= cfg.meta.A ? '段階A' : g >= cfg.meta.B ? '段階B' : 'メタの一覧に無い');

/** 基準4・4b */
export function protectCandidates(team: readonly PlayerPool[], guide: MetaGuide, cfg: PickConfig = loadPickConfig()): ProtectResult {
  const all = { ...cfg, pick: { ...cfg.pick, topN: Number.MAX_SAFE_INTEGER } };
  const entries = team.flatMap((p) =>
    pickCandidates(p, guide, all).candidates.map((c) => ({ ...c, playerId: p.playerId, role: p.role, protectValue: protectValue(c, p.role, cfg) })),
  );
  const order = (a: (typeof entries)[number], b: (typeof entries)[number]) =>
    b.protectValue - a.protectValue || b.games - a.games || a.championId - b.championId;
  entries.sort(order);

  const reasonOf = (e: (typeof entries)[number], narrow?: number) =>
    narrow !== undefined
      ? `ピックプールが ${narrow} 体と狭いため、この選手の${narrow === 1 ? '1体' : '2体'}を守る(${e.games} 試合・勝率 ${pct(e.winRate)}・${tierText(e.meta, cfg)}・プロテクトの値 ${e.protectValue.toFixed(3)})`
      : `大会のロールで ${e.games} 試合・勝率 ${pct(e.winRate)}・${tierText(e.meta, cfg)}・プロテクトの値 ${e.protectValue.toFixed(3)}`;

  // ピックプールが狭い選手(1〜narrowPool 体)。複数なら最大のプロテクトの値を持つ選手
  const narrowIds = new Set(team.filter((p) => p.list.length > 0 && p.list.length <= cfg.protect.narrowPool).map((p) => p.playerId));
  const narrowTop = entries.find((e) => narrowIds.has(e.playerId));
  const chosen: ProtectCandidate[] = [];
  const has = (id: number) => chosen.some((c) => c.championId === id);
  if (narrowTop) {
    const own = entries.filter((e) => e.playerId === narrowTop.playerId).slice(0, 2);
    const size = team.find((p) => p.playerId === narrowTop.playerId)!.list.length;
    for (const e of own) chosen.push({ ...e, reason: reasonOf(e, size) });
    if (chosen.length < 2) {
      const other = entries.find((e) => e.playerId !== narrowTop.playerId && !has(e.championId));
      if (other) chosen.push({ ...other, reason: reasonOf(other) });
    }
  } else {
    for (const e of entries) {
      if (chosen.length >= 2) break;
      if (has(e.championId) || chosen.some((c) => c.playerId === e.playerId)) continue;
      chosen.push({ ...e, reason: reasonOf(e) });
    }
  }
  chosen.sort((a, b) => b.protectValue - a.protectValue || a.championId - b.championId);
  return {
    protects: chosen,
    missing: 2 - chosen.length,
    likelyBan: chosen[0]?.championId ?? null,
    narrowPlayerId: narrowTop ? narrowTop.playerId : null,
  };
}
