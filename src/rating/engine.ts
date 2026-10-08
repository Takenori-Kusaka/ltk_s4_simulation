// F-009 Task-1: 評価の土台(ADR-0004、docs/design/rating-model.md)
// データの軸の基礎の点数 = clamp( A×r + 5×(1−r) + P × n/(n+k) × perfScale + 加点, 0, 10 )
import type {
  Confidence,
  DataAxisDef,
  DataAxisResult,
  EngineConfig,
  GameRecord,
  MatchForPopulation,
  MetricDef,
  Population,
  PlayerAxisInput,
  RankEntry,
} from './types.ts';
import engineDefaults from './config.json' with { type: 'json' };

const DAY = 86_400_000;
const TIER_BASE: Record<string, number> = {
  IRON: 0, BRONZE: 4, SILVER: 8, GOLD: 12, PLATINUM: 16, EMERALD: 20, DIAMOND: 24, MASTER: 28, GRANDMASTER: 28, CHALLENGER: 28,
};
const DIVISION: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 };
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** ランクの基準(0〜10)。Master 0LP = 8.0、Master 以上は LP 1500 で 10.0 */
export function rankAnchor(r: RankEntry | null | undefined): number | null {
  if (!r) return null;
  const base = TIER_BASE[r.tier.toUpperCase()];
  if (base === undefined) return null;
  if (base >= 28) return Math.min(10, 8 + (2 * Math.max(0, r.lp)) / 1500);
  const steps = base + (DIVISION[r.division.toUpperCase()] ?? 0) + clamp(r.lp, 0, 100) / 100;
  return Math.min(8, (steps / 28) * 8);
}

/** 新しさの重み 0.5^(日数 / 半減期) */
export function recencyWeight(ageDays: number, halfLifeDays: number): number {
  return 0.5 ** (Math.max(0, ageDays) / halfLifeDays);
}

/** 基準1・2: 評価の試合(期間・長さ)と、ロールに依存する軸では大会のロールの試合 */
export function selectGames(
  games: readonly GameRecord[],
  now: number,
  cfg: EngineConfig,
  opt: { roleOnly: boolean; position: string },
): GameRecord[] {
  return games.filter(
    (g) =>
      now - g.endTime <= cfg.windowDays * DAY &&
      g.durationMin >= cfg.minMinutes &&
      (!opt.roleOnly || g.position === opt.position),
  );
}

/** 基準4 */
export function confidenceOf(n: number, cfg: EngineConfig): Confidence {
  if (n >= cfg.confidence.high) return '高';
  if (n >= cfg.confidence.mid) return '中';
  return '低';
}

const downgrade = (c: Confidence): Confidence => (c === '高' ? '中' : '低');

/** 1試合の指標の値(対面との差)。相手がいない・値が無いときは null(基準8) */
export function metricDiff(def: MetricDef, me: Record<string, number>, opp: Record<string, number> | null): number | null {
  if (!opp) return null;
  const a = me[def.key];
  const b = opp[def.key];
  if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (def.mode === 'logratio') return Math.log((Math.max(0, a) + 1) / (Math.max(0, b) + 1));
  if (def.mode === 'negdiff') return -(a - b);
  return a - b;
}

const popKey = (def: MetricDef) => `${def.key}:${def.mode}`;

/** 基準7: 母集団(全試合の全参加者)の、ロールごと・指標ごとの「対面との差」の分布 */
export function buildPopulation(matches: readonly MatchForPopulation[], axes: readonly DataAxisDef[]): Population {
  const defs = new Map<string, MetricDef>();
  for (const a of axes) for (const m of a.metrics) defs.set(popKey(m), m);
  const acc: Record<string, Record<string, number[]>> = {};
  for (const match of matches) {
    for (const p of match.participants) {
      const opp = match.participants.find((q) => q.teamId !== p.teamId && q.position === p.position);
      if (!opp || !p.position) continue;
      for (const [k, def] of defs) {
        const v = metricDiff(def, p.stats, opp.stats);
        if (v === null) continue;
        ((acc[p.position] ??= {})[k] ??= []).push(v);
      }
    }
  }
  const out: Population = {};
  for (const [pos, byKey] of Object.entries(acc)) {
    out[pos] = {};
    for (const [k, xs] of Object.entries(byKey)) {
      const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
      out[pos][k] = { mean, sd, count: xs.length };
    }
  }
  return out;
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * 基準3〜9: データの軸の基礎の点数。bonus は軸の外から加える項(LTK の経験の項。基準6・10)
 */
export function scoreDataAxis(
  axis: DataAxisDef,
  input: PlayerAxisInput,
  population: Population,
  cfg: EngineConfig,
  now: number,
  bonus = 0,
): DataAxisResult {
  // ランクの基準と事前値(基準9)
  let anchor = rankAnchor(input.rank);
  let anchorSource: DataAxisResult['anchorSource'] = 'ソロランク';
  if (anchor === null) {
    anchor = rankAnchor(input.peakRank);
    anchorSource = '最高ランク';
    if (anchor === null) {
      anchor = input.medianAnchor ?? 5;
      anchorSource = '母集団の中央値';
    }
  }
  const games = selectGames(input.games, now, cfg, { roleOnly: axis.roleDependent, position: input.position })
    .slice()
    .sort((a, b) => b.endTime - a.endTime || a.matchId.localeCompare(b.matchId));

  let n = 0;
  let pSum = 0;
  const metricAcc = axis.metrics.map(() => ({ zSum: 0, vSum: 0, w: 0, count: 0 }));
  for (const g of games) {
    const w = recencyWeight((now - g.endTime) / DAY, cfg.halfLifeDays);
    let gz = 0;
    let gw = 0;
    axis.metrics.forEach((def, i) => {
      if (def.positions && !def.positions.includes(g.position)) return;
      const v = metricDiff(def, g.me, g.opp);
      if (v === null) return;
      const dist = population[g.position]?.[popKey(def)];
      const z = dist && dist.sd > 0 ? clamp((v - dist.mean) / dist.sd, -cfg.zClip, cfg.zClip) : 0;
      gz += def.weight * z;
      gw += def.weight;
      const m = metricAcc[i];
      m.zSum += w * z;
      m.vSum += w * v;
      m.w += w;
      m.count += 1;
    });
    if (gw === 0) continue; // この試合に使える指標が無い
    pSum += w * (gz / gw);
    n += w;
  }
  const correction = n > 0 ? pSum / n : 0;
  const shrink = n / (n + cfg.k);
  const r = axis.rankWeight;
  const base = clamp(anchor * r + 5 * (1 - r) + correction * shrink * cfg.perfScale + bonus, 0, 10);
  const estimated = n === 0;
  let confidence: Confidence = estimated ? '低' : confidenceOf(n, cfg);
  if (anchorSource !== 'ソロランク' && !estimated) confidence = downgrade(confidence);
  const onRole = games.filter((g) => g.position === input.position).length;
  return {
    key: axis.key,
    label: axis.label,
    base,
    confidence,
    estimated,
    anchor,
    anchorSource,
    correction,
    shrink,
    effectiveGames: n,
    gamesUsed: games.length,
    roleShare: games.length ? onRole / games.length : 0,
    newest: games.length ? isoDay(games[0].endTime) : null,
    oldest: games.length ? isoDay(games[games.length - 1].endTime) : null,
    bonus,
    metrics: axis.metrics.map((def, i) => {
      const m = metricAcc[i];
      return {
        key: def.key,
        mode: def.mode,
        value: m.w > 0 ? m.vSum / m.w : null,
        z: m.w > 0 ? m.zSum / m.w : 0,
        gamesWithOpponent: m.count,
      };
    }),
  };
}

// ---- 実データ(match-v5 の info)からの変換 ----

/** 評価設定の既定値 */
export function loadEngineConfig(): EngineConfig {
  return { ...(engineDefaults as { engine: EngineConfig }).engine };
}

interface RawParticipant {
  puuid?: string;
  teamId: number;
  teamPosition?: string;
  challenges?: Record<string, unknown>;
  [k: string]: unknown;
}
interface RawInfo {
  gameEndTimestamp: number;
  gameDuration: number;
  queueId: number;
  participants: RawParticipant[];
}

/** participant の数値と challenges の数値を1つの表に平らにする */
function flatten(p: RawParticipant): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(p)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  for (const [k, v] of Object.entries(p.challenges ?? {})) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
}

/** 選手(puuid)の1試合の記録。選手がいなければ null */
export function extractGame(matchId: string, info: RawInfo, puuid: string): GameRecord | null {
  const me = info.participants.find((p) => p.puuid === puuid);
  if (!me) return null;
  const opp = me.teamPosition
    ? info.participants.find((p) => p.teamId !== me.teamId && p.teamPosition === me.teamPosition) ?? null
    : null;
  return {
    matchId,
    endTime: info.gameEndTimestamp,
    durationMin: info.gameDuration / 60,
    queueId: info.queueId,
    position: me.teamPosition ?? '',
    me: flatten(me),
    opp: opp ? flatten(opp) : null,
  };
}

/** 母集団に使う形(ロールの無い参加者を除く) */
export function populationMatch(info: RawInfo): MatchForPopulation {
  return {
    participants: info.participants
      .filter((p) => !!p.teamPosition)
      .map((p) => ({ position: p.teamPosition as string, teamId: p.teamId, stats: flatten(p) })),
  };
}
