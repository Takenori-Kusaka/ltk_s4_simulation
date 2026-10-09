// F-006 Task-1: ピック候補の上位3体と、CORE・フィアレスの除外、データなしの扱い(受入基準 1・2・3・10)
// 入力は F-009 の評価のファイルの poolDetail と F-011 のメタの一覧。DOM と Node 固有の API に依存しない
import defaults from './config.json' with { type: 'json' };
import { poolsFromRatings, type PlayerPool } from '../meta/match.ts';
import type { MetaGuide, MetaRole } from '../meta/load.ts';
import { ROSTER } from '../data/roster.ts';

export interface PickConfig {
  pick: { wGames: number; wWin: number; wMeta: number; topN: number };
  meta: { A: number; B: number };
  protect: { metaBonus: number; narrowPool: number };
}

export function loadPickConfig(): PickConfig {
  return structuredClone(defaults as unknown as PickConfig);
}

/** メタの重要度 g: そのロールの段階A なら meta.A、段階B なら meta.B、どちらでもなければ 0 */
export function metaImportance(guide: MetaGuide, role: MetaRole, championId: number, cfg: PickConfig = loadPickConfig()): number {
  const c = guide.champions.find((x) => x.role === role && x.key === championId);
  return c ? cfg.meta[c.tier] : 0;
}

export interface PickCandidate {
  championId: number;
  /** メタの一覧にあるチャンピオンだけ名前を持つ(ほかは画面で Data Dragon から引く) */
  name?: string;
  /** 見込みの値 v */
  value: number;
  games: number;
  /** 縮小した勝率 */
  winRate: number;
  /** メタの重要度 g */
  meta: number;
}

export interface PlayerPicks {
  playerId: string;
  candidates: PickCandidate[];
  /** 上位 topN に満たない枠の数(画面では「データなし」) */
  missing: number;
}

/** 基準1: 見込みの値の降順(同点は試合数の多い順、次に championId の小さい順)の上位 topN 体。exclude のチャンピオンは除く(基準2・3) */
export function pickCandidates(
  pool: PlayerPool,
  guide: MetaGuide,
  cfg: PickConfig = loadPickConfig(),
  exclude: ReadonlySet<number> = new Set(),
): PlayerPicks {
  const maxGames = Math.max(0, ...pool.list.map((e) => e.games));
  const { wGames, wWin, wMeta, topN } = cfg.pick;
  const candidates = pool.list
    .filter((e) => !exclude.has(e.championId))
    .map((e): PickCandidate => {
      const meta = metaImportance(guide, pool.role, e.championId, cfg);
      const name = guide.champions.find((c) => c.key === e.championId)?.name;
      return {
        championId: e.championId,
        ...(name ? { name } : {}),
        value: wGames * (maxGames > 0 ? e.games / maxGames : 0) + wWin * e.winRate + wMeta * meta,
        games: e.games,
        winRate: e.winRate,
        meta,
      };
    })
    .sort((a, b) => b.value - a.value || b.games - a.games || a.championId - b.championId)
    .slice(0, topN);
  return { playerId: pool.playerId, candidates, missing: topN - candidates.length };
}

/** 直前の NEXT 戦の1チーム分。actual は確定した使用(あれば優先)、predicted は予想ピック、protects はプロテクト候補 */
export interface NextTeamUse {
  actual?: number[];
  predicted: number[];
  protects?: number[];
}

/** 基準2: CORE の試合で使えないチャンピオン(同じカードの直前の NEXT 戦で両チームが使ったもの) */
export function coreExclusions(nextTeams: readonly NextTeamUse[]): Set<number> {
  const out = new Set<number>();
  for (const t of nextTeams) {
    const used = t.actual ?? [...t.predicted, ...(t.protects ?? [])];
    for (const id of used) out.add(id);
  }
  return out;
}

/** 基準3: MASTERS CUP の決勝の2戦目以降で使えないチャンピオン(同じシリーズの前の試合。確定していれば実際の使用、無ければ予想ピック) */
export function seriesExclusions(previousGames: readonly { actual?: number[]; predicted: number[] }[]): Set<number> {
  const out = new Set<number>();
  for (const g of previousGames) for (const id of g.actual ?? g.predicted) out.add(id);
  return out;
}

export const NO_DATA = 'データなし' as const;

export interface MatchPicksInput {
  ratings: Parameters<typeof poolsFromRatings>[0];
  guide: MetaGuide | undefined;
  /** 試合に出る選手(名簿の ID) */
  playerIds: readonly string[];
  exclude?: ReadonlySet<number>;
  cfg?: PickConfig;
}

/** 基準10: 評価のファイルかメタの一覧が無ければ「データなし」。ある場合は選手ごとのピック候補(評価に無い選手は全枠データなし) */
export function matchPicks(input: MatchPicksInput): { status: 'ok' | typeof NO_DATA; players: PlayerPicks[] } {
  const { ratings, guide } = input;
  if (!ratings || !guide) return { status: NO_DATA, players: [] };
  const cfg = input.cfg ?? loadPickConfig();
  const pools = new Map(poolsFromRatings(ratings).map((p) => [p.playerId, p]));
  const players = input.playerIds.map((id) => {
    const r = ROSTER.find((x) => x.id === id);
    const pool = pools.get(id) ?? (r ? { playerId: id, name: r.name, team: r.team, tier: r.tier, role: r.role, list: [] } : undefined);
    if (!pool) return { playerId: id, candidates: [], missing: cfg.pick.topN };
    return pickCandidates(pool, guide, cfg, input.exclude);
  });
  return { status: 'ok', players };
}
