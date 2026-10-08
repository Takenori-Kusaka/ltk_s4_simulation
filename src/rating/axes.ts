// F-009 Task-2: 個人のデータの6軸(地力・レーン戦・集団戦・連携・安定感・ピックプール)
// 基礎の点数の式は engine.ts(ADR-0004)。この部品は軸の定義・LTK の経験の項・安定感のばらつき・ピックプールを担う
import def from './axes.json' with { type: 'json' };
import {
  buildPopulation,
  confidenceOf,
  metricDiff,
  rankAnchor,
  recencyWeight,
  scoreDataAxis,
  selectGames,
} from './engine.ts';
import type {
  Confidence,
  DataAxisDef,
  DataAxisResult,
  EngineConfig,
  GameRecord,
  MatchForPopulation,
  Population,
  RankEntry,
} from './types.ts';

interface AxesConfig {
  ltkBonusPerSeason: number;
  ltkBonusCap: number;
  ltkBonusAxes: string[];
  stability: { deathsWeight: number; consistencyWeight: number; consistencyMinGames: number };
  pool: { minGamesPerChampion: number; winRatePriorGames: number; countWeight: number; winRateWeight: number; masteryPriorWeight: number };
  axes: DataAxisDef[];
}
const CONF = def as unknown as AxesConfig;
const DAY = 86_400_000;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export const DATA_AXES: readonly DataAxisDef[] = CONF.axes;

/** 基準10: LTK の経験の項 = 参加シーズン数 × 0.4(上限 1.2) */
export function ltkBonus(seasons: number): number {
  return Math.min(CONF.ltkBonusCap, Math.max(0, seasons) * CONF.ltkBonusPerSeason);
}

export interface RatingPlayerInput {
  playerId: string;
  /** 階級(NEXT・CORE・MASTERS)。ランクの無い選手の出発点を同じ階級の中央値にする */
  tier?: string;
  /** 大会のロール(teamPosition の値) */
  position: string;
  rank: RankEntry | null;
  peakRank?: RankEntry | null;
  games: GameRecord[];
  ltkSeasons: number;
  ltkSeasonNames?: string[];
  masteryScore?: number;
}

export interface RatingContext {
  population: Population;
  cfg: EngineConfig;
  now: number;
  medianAnchor: number;
  /** 階級 → ランクの基準の中央値 */
  tierMedianAnchor: Record<string, number>;
  /** ロール → ピックプールの素点(チャンピオン数・勝率)の分布 */
  poolStats: Record<string, { count: Stat; winRate: Stat }>;
  /** 安定感のばらつき(試合ごとの地力の補正の標準偏差)の分布 */
  consistencyStat: Stat;
  masteryStat: Stat;
}
interface Stat {
  mean: number;
  sd: number;
}

export interface RatedAxis extends DataAxisResult {
  bonusReason?: string;
  poolDetail?: { champions: number; winRate: number | null; list: { championId: number; games: number; winRate: number }[] };
  consistencySd?: number | null;
}

const stat = (xs: number[]): Stat => {
  if (!xs.length) return { mean: 0, sd: 0 };
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  return { mean, sd: Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length) };
};
const zOf = (x: number, s: Stat, clip: number) => (s.sd > 0 ? clamp((x - s.mean) / s.sd, -clip, clip) : 0);

/** ピックプールの素点: 大会のロールで規定の試合数以上遊んだチャンピオンの数と、それらの勝率(試合数で縮小) */
function poolRaw(p: RatingPlayerInput, cfg: EngineConfig, now: number) {
  const games = selectGames(p.games, now, cfg, { roleOnly: true, position: p.position });
  const by = new Map<number, { n: number; w: number }>();
  for (const g of games) {
    const id = g.me.championId;
    if (typeof id !== 'number') continue;
    const e = by.get(id) ?? { n: 0, w: 0 };
    e.n += 1;
    e.w += g.me.win === 1 ? 1 : 0;
    by.set(id, e);
  }
  const k = CONF.pool.winRatePriorGames;
  const list = [...by.entries()]
    .filter(([, e]) => e.n >= CONF.pool.minGamesPerChampion)
    .map(([championId, e]) => ({ championId, games: e.n, winRate: (e.w + k / 2) / (e.n + k) }))
    .sort((a, b) => b.games - a.games || a.championId - b.championId);
  const winRate = list.length ? list.reduce((s, c) => s + c.winRate, 0) / list.length : null;
  return { games, list, champions: list.length, winRate };
}

/** 安定感のばらつき: 試合ごとの地力の補正(標準化した値の加重平均)の標準偏差 */
function consistencySd(p: RatingPlayerInput, population: Population, cfg: EngineConfig, now: number): number | null {
  const ground = CONF.axes.find((a) => a.key === 'ground')!;
  const games = selectGames(p.games, now, cfg, { roleOnly: false, position: p.position });
  const per: { z: number; w: number }[] = [];
  for (const g of games) {
    let s = 0;
    let wsum = 0;
    for (const m of ground.metrics) {
      const v = metricDiff(m, g.me, g.opp);
      const dist = population[g.position]?.[`${m.key}:${m.mode}`];
      if (v === null || !dist || dist.sd === 0) continue;
      s += m.weight * clamp((v - dist.mean) / dist.sd, -cfg.zClip, cfg.zClip);
      wsum += m.weight;
    }
    if (wsum > 0) per.push({ z: s / wsum, w: recencyWeight((now - g.endTime) / DAY, cfg.halfLifeDays) });
  }
  if (per.length < CONF.stability.consistencyMinGames) return null;
  const W = per.reduce((s, x) => s + x.w, 0);
  const mean = per.reduce((s, x) => s + x.w * x.z, 0) / W;
  return Math.sqrt(per.reduce((s, x) => s + x.w * (x.z - mean) ** 2, 0) / W);
}

/** 60 選手の入力から、母集団・ピックプールとばらつきの分布をまとめる */
export function buildRatingContext(
  players: readonly RatingPlayerInput[],
  matches: readonly MatchForPopulation[],
  cfg: EngineConfig,
  now: number,
): RatingContext {
  // 母集団: 収集した全試合の全参加者。テストや試合ファイルが無いときは選手の試合の自分と対面で補う
  const fromPlayers: MatchForPopulation[] = players.flatMap((p) =>
    p.games
      .filter((g) => g.opp)
      .map((g) => ({ participants: [{ position: g.position, teamId: 1, stats: g.me }, { position: g.position, teamId: 2, stats: g.opp! }] })),
  );
  const population = buildPopulation(matches.length ? matches : fromPlayers, CONF.axes);
  const poolStats: RatingContext['poolStats'] = {};
  const byPos = new Map<string, { c: number[]; w: number[] }>();
  for (const p of players) {
    const r = poolRaw(p, cfg, now);
    if (!r.games.length) continue;
    const e = byPos.get(p.position) ?? { c: [], w: [] };
    e.c.push(r.champions);
    e.w.push(r.winRate ?? 0.5);
    byPos.set(p.position, e);
  }
  for (const [pos, e] of byPos) poolStats[pos] = { count: stat(e.c), winRate: stat(e.w) };
  const median = (xs: number[]) => (xs.length ? xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 5);
  const anchors = players.map((p) => rankAnchor(p.rank)).filter((x): x is number => x !== null);
  const tierMedianAnchor: Record<string, number> = {};
  for (const t of new Set(players.map((p) => p.tier).filter((x): x is string => !!x))) {
    tierMedianAnchor[t] = median(players.filter((p) => p.tier === t).map((p) => rankAnchor(p.rank)).filter((x): x is number => x !== null));
  }
  return {
    population,
    cfg,
    now,
    medianAnchor: median(anchors),
    tierMedianAnchor,
    poolStats,
    consistencyStat: stat(players.map((p) => consistencySd(p, population, cfg, now)).filter((x): x is number => x !== null)),
    masteryStat: stat(players.map((p) => p.masteryScore).filter((x): x is number => typeof x === 'number')),
  };
}

const downgrade = (c: Confidence): Confidence => (c === '高' ? '中' : '低');

/** 個人のデータの6軸の基礎の点数(調子の係数を掛ける前) */
export function rateDataAxes(p: RatingPlayerInput, ctx: RatingContext): RatedAxis[] {
  const { cfg, now, population } = ctx;
  const medianAnchor = (p.tier && ctx.tierMedianAnchor[p.tier]) ?? ctx.medianAnchor;
  const input = { rank: p.rank, peakRank: p.peakRank, medianAnchor, games: p.games, position: p.position };
  const bonusFor = (key: string) => (CONF.ltkBonusAxes.includes(key) ? ltkBonus(p.ltkSeasons) : 0);
  const reason = (key: string) =>
    CONF.ltkBonusAxes.includes(key)
      ? p.ltkSeasons > 0
        ? `LTK に ${p.ltkSeasons} シーズン参加(${(p.ltkSeasonNames ?? []).join('・') || '出典は大会経験の根拠'}): +${ltkBonus(p.ltkSeasons).toFixed(1)}`
        : 'LTK の参加なし: +0.0'
      : undefined;

  return CONF.axes.map((axis): RatedAxis => {
    if (axis.key === 'pool') return ratePool(p, ctx, axis);
    const r = scoreDataAxis(axis, input, population, cfg, now, bonusFor(axis.key));
    if (axis.key !== 'stability') return { ...r, bonusReason: reason(axis.key) };
    // 安定感 = デスの対面との差 0.6 + 試合ごとの出来のばらつきの小ささ 0.4
    const sd = consistencySd(p, population, cfg, now);
    const zc = sd === null ? null : -zOf(sd, ctx.consistencyStat, cfg.zClip);
    const P = zc === null ? r.correction : CONF.stability.deathsWeight * r.correction + CONF.stability.consistencyWeight * zc;
    const base = clamp(r.anchor * axis.rankWeight + 5 * (1 - axis.rankWeight) + P * r.shrink * cfg.perfScale + r.bonus, 0, 10);
    return { ...r, base, correction: P, consistencySd: sd, bonusReason: reason(axis.key) };
  });
}

/** 基準11: ピックプール。チャンピオンの総数ではなく、規定の試合数以上のチャンピオンの数とその勝率で決める */
function ratePool(p: RatingPlayerInput, ctx: RatingContext, axis: DataAxisDef): RatedAxis {
  const { cfg, now } = ctx;
  const raw = poolRaw(p, cfg, now);
  const n = raw.games.reduce((s, g) => s + recencyWeight((now - g.endTime) / DAY, cfg.halfLifeDays), 0);
  let anchor = rankAnchor(p.rank);
  let anchorSource: DataAxisResult['anchorSource'] = 'ソロランク';
  if (anchor === null) {
    anchor = rankAnchor(p.peakRank);
    anchorSource = '最高ランク';
    if (anchor === null) {
      anchor = (p.tier && ctx.tierMedianAnchor[p.tier]) ?? ctx.medianAnchor;
      anchorSource = '母集団の中央値';
    }
  }
  const r = axis.rankWeight;
  const ps = ctx.poolStats[p.position];
  let correction: number;
  let estimated = false;
  let shrink: number;
  if (!raw.games.length || !ps) {
    // 事前値: 熟練度の合計(遊んだ量)の 60 選手の中の位置
    estimated = true;
    correction = typeof p.masteryScore === 'number' ? CONF.pool.masteryPriorWeight * zOf(p.masteryScore, ctx.masteryStat, cfg.zClip) : 0;
    shrink = 1;
  } else {
    correction =
      CONF.pool.countWeight * zOf(raw.champions, ps.count, cfg.zClip) +
      CONF.pool.winRateWeight * zOf(raw.winRate ?? 0.5, ps.winRate, cfg.zClip);
    shrink = n / (n + cfg.k);
  }
  const base = clamp(anchor * r + 5 * (1 - r) + correction * shrink * cfg.perfScale, 0, 10);
  let confidence: Confidence = estimated ? '低' : confidenceOf(n, cfg);
  if (!estimated && anchorSource !== 'ソロランク') confidence = downgrade(confidence);
  const dates = raw.games.map((g) => g.endTime).sort((a, b) => b - a);
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
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
    gamesUsed: raw.games.length,
    roleShare: raw.games.length ? 1 : 0,
    newest: dates.length ? iso(dates[0]) : null,
    oldest: dates.length ? iso(dates[dates.length - 1]) : null,
    bonus: 0,
    metrics: [],
    poolDetail: { champions: raw.champions, winRate: raw.winRate, list: raw.list },
  };
}
