// F-009: 評価モデルの型(ADR-0004)。DOM と Node 固有の API に依存しない

/** Riot API の teamPosition */
export type Position = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY';

export type Confidence = '高' | '中' | '低';

export interface RankEntry {
  tier: string;
  division: string;
  lp: number;
  /** 出典(経歴の記録の最高ランクに付く。Riot API の現在値には無い) */
  source?: string;
}

/** LoL のプロの経歴(経歴の記録の lol.highestLevel が LJL・海外・CS・アカデミーのいずれか。出典つき。基準29) */
export interface ExProCareer {
  level: string;
  source: string;
  /** その水準での年数(経歴の記録の lol.years[水準]。下限の計算に使う。無ければ 0) */
  years?: number;
}

/** ランクの基準の出どころ(基準30) */
export type AnchorSource = 'ソロランク' | '最高ランク' | '最高ランク(今季)' | '元プロの下限' | '母集団の中央値';

/** 1試合の選手の記録。stats は participant の数値と challenges を平らにしたもの */
export interface GameRecord {
  matchId: string;
  /** 試合の終了時刻(ミリ秒) */
  endTime: number;
  durationMin: number;
  queueId: number;
  position: Position | string;
  me: Record<string, number>;
  /** 同じ試合の同じロールの相手。いなければ null */
  opp: Record<string, number> | null;
}

/** 母集団の構築に使う試合(全参加者) */
export interface MatchForPopulation {
  participants: { position: string; teamId: number; stats: Record<string, number> }[];
}

/**
 * 指標の比べ方
 * - diff: 自分 − 相手
 * - logratio: ln((自分 + 1) / (相手 + 1))
 * - negdiff: −(自分 − 相手)(デスのように少ないほど良い指標)
 */
export type MetricMode = 'diff' | 'logratio' | 'negdiff';

export interface MetricDef {
  key: string;
  weight: number;
  mode: MetricMode;
  /** このロールでだけ使う(省略時は全ロール) */
  positions?: string[];
}

export interface DataAxisDef {
  key: string;
  label: string;
  /** ランクの基準の効き方 r(0〜1) */
  rankWeight: number;
  /** 大会のロールの試合だけを使うか */
  roleDependent: boolean;
  metrics: MetricDef[];
}

export interface EngineConfig {
  windowDays: number;
  minMinutes: number;
  halfLifeDays: number;
  /** 縮小の強さ k */
  k: number;
  /** 補正 1 標準偏差あたりの点数 */
  perfScale: number;
  /** 形の係数(2026-10-10): 直近成績の補正のうち、6 軸の平均からのずれに掛ける係数。省略時は perfScale と同じ(分けない) */
  shapeScale?: number;
  /** ロール転向の割引(基準31。LTK の出場シーズンのうち今のロール以外の割合 × この値をデータの軸から引く。初期値 0.5) */
  roleSwitchPenalty?: number;
  /** 元プロの下限(基準29 の改訂): 経歴の水準(lol.highestLevel)ごとのランクの基準の下限。default は水準に無いとき */
  exProFloor?: Record<string, number | { base: number; perYear: number; max: number }>;
  zClip: number;
  confidence: { high: number; mid: number };
}

/** 母集団の分布: ロール → 指標のキーとモード → 平均と標準偏差 */
export type Population = Record<string, Record<string, { mean: number; sd: number; count: number }>>;

export interface PlayerAxisInput {
  rank: RankEntry | null;
  /** 出典つきの歴代の最高ランク(経歴の記録 peak.allTime)。ソロランク・今季の最高ランクと合わせ、基準の値が最も高い記録を採る(基準6・28) */
  peakRank?: RankEntry | null;
  /** 出典つきの今季の最高ランク(経歴の記録 peak.thisSeason) */
  seasonPeakRank?: RankEntry | null;
  /** 出典つきのプロの経歴(経歴の記録)。あれば基準の下限を Challenger 0 LP(8.0)にする(基準29) */
  exPro?: ExProCareer | null;
  /** ランクが無く最高ランクも無いときの基準(60 選手の中央値など) */
  medianAnchor?: number;
  games: GameRecord[];
  /** 大会のロール(teamPosition の値) */
  position: string;
}

export interface AxisMetricResult {
  key: string;
  mode: MetricMode;
  /** 使った試合の、対面との差(生の値)の重み付き平均 */
  value: number | null;
  /** 標準化した値の重み付き平均 */
  z: number;
  gamesWithOpponent: number;
}

export interface DataAxisResult {
  key: string;
  label: string;
  /** 基礎の点数(調子の係数を掛ける前) */
  base: number;
  confidence: Confidence;
  /** 事前値だけで決まった */
  estimated: boolean;
  anchor: number;
  anchorSource: AnchorSource;
  /** 出どころの補足(最高ランクの値と出典、元プロの区分と出典)。ソロランク・中央値のときは無い */
  anchorNote?: string;
  /** 補正 P */
  correction: number;
  /** 縮小の割合 n / (n + k) */
  shrink: number;
  /** 有効な試合数 n */
  effectiveGames: number;
  gamesUsed: number;
  /** 使った試合のうち大会のロールの試合の割合 */
  roleShare: number;
  newest: string | null;
  oldest: string | null;
  bonus: number;
  metrics: AxisMetricResult[];
}
