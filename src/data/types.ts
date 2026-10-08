// F-002: 指標ファイルの型(ADR-0003: すべての値に出典・取得日・確度・書いた主体を付ける)

export type Confidence = '高' | '中' | '低';

export interface Author {
  kind: 'human' | 'riot-api' | 'ai';
  /** AI の場合のモデル名 */
  model?: string;
}

export interface Evidence<T = number | string> {
  value: T;
  source: string;
  /** YYYY-MM-DD */
  retrievedAt: string;
  confidence: Confidence;
  author: Author;
}

/** 定性の評価: 0〜10 の点数と根拠の文章の組 */
export interface Qualitative {
  score: number;
  rationale: string;
  sources: string[];
  author: Author;
}

export interface RecentMatch {
  date: string;
  queue: 'ranked' | 'scrim' | 'ltk';
  champion: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
}

export interface PlayerFile {
  playerId: string;
  /** soloRank・peakRank は 'DIAMOND II 50' の形。数値の指標は number */
  metrics: Partial<Record<string, Evidence>>;
  qualitative: Partial<Record<string, Qualitative>>;
  recentMatches: RecentMatch[];
}
