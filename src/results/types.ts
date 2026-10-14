// F-004 Task-1: 試合結果の記録(本番・スクリム)の型。DOM と Node 固有の API に依存しない
import type { Role } from '../data/roster.ts';
import type { TeamId, Tier } from '../sim/types.ts';

export type ResultKind = 'official' | 'scrim';
export type Stage = 'regular' | 'masters' | 'playoffs';
export type MastersMatch = 'semi1' | 'semi2' | 'third' | 'final';
export type PlayoffMatch = 'upperFinal' | 'lowerSemi' | 'lowerFinal' | 'grandFinal';
/** 対応づけの確度(記録の mappingConfidence の先頭の語) */
export type MappingConfidence = '確信' | '推定' | '未確認';
/** 階級チーム ID(名簿の team と tier。例 DD-CORE) */
export type TierTeamId = `${TeamId}-${Tier}`;

/** 記録の出典。url は必須。配信なら結果画面の時刻 resultScreenSec(秒) */
export interface ResultSource { url: string; resultScreenSec?: number; [key: string]: unknown }

/** 選手 1 人の 1 試合分(名簿と対応づけた後の行) */
export interface PlayerResult {
  playerId: string;
  rosterName: string;
  role: Role;
  /** チャンピオンの日本語名(読めなければ null)と、チャンピオンの一覧の数値の key(名前が null か一覧に keys が無ければ null) */
  champion: string | null;
  championId: number | null;
  kills: number; deaths: number; assists: number; gold: number; damage: number;
  cs: number | null; level: number | null; goldPerMin: number | null;
  /** 基準25: 14 分時点の CS(記録に無ければ null) */
  cs14: number | null;
  mappingConfidence: MappingConfidence;
  /** 基準6: 「未確認」の行は使わない(false)。後続のタスクが試合の記録を作るときに見る */
  use: boolean;
}

export interface TeamResult { kills: number; deaths: number; assists: number; gold: number; players: PlayerResult[] }

/** F-006 基準12: BAN・ピックの 1 手。order は元の記録に順が無い試合では null。champion は BAN しなかった枠・名前の無い BAN で null。role は PICK だけ */
export interface DraftEntry { order: number | null; team: TierTeamId; type: 'BAN' | 'PICK'; champion: string | null; role: Role | null }

/** 本番の記録だけが持つ日程の欄。day は Regular Stage 1〜6、MASTERS CUP は回 1〜3、Playoffs は null */
export interface OfficialInfo { stage: Stage; day: number | null; tier: Tier; match: MastersMatch | PlayoffMatch | null; game: number }

/** 検証を通った 1 試合 */
export interface MatchResult {
  /** 用語「試合 ID」(RS-… / MC… / PO-… / SC-…) */
  matchId: string;
  kind: ResultKind;
  date: string;
  /** 記録のファイル名(置き場の中の名前)と要素の番号 */
  file: string;
  index: number;
  /** 基準28: 結果だけの記録(選手の行・チームの値を持たない)。F-005 の結果の入力にだけ使い、個人の評価・ピックプール・キーマンに使わない */
  resultOnly: boolean;
  /** 結果だけの記録は duration を持たなければ null */
  duration: string | null;
  durationSec: number | null;
  /** 基準25: 14 分の CS を計測した時刻(秒)。無ければ null */
  cs14Sec: number | null;
  /** 記録の game(試合の番号)。スクリムでは持たなければ null(用語「スクリムの試合 ID の n」) */
  game: number | null;
  /** 2 つの階級チーム ID(辞書順) */
  teams: [TierTeamId, TierTeamId];
  winner: TierTeamId;
  sides: { blue: TierTeamId; red: TierTeamId } | null;
  source: ResultSource;
  official: OfficialInfo | null;
  /** 階級チーム ID → チームの値と 5 人の行。結果だけの記録は空 */
  stats: Record<string, TeamResult>;
  /** F-006 基準12: 任意の欄 draft(BAN・ピックの順)。記録に無ければ null */
  draft: DraftEntry[] | null;
}

/** 基準4: 反した欄。index が null ならファイル全体のエラー */
export interface ResultError { file: string; index: number | null; field: string; message: string }
/** 基準5・7・30: 使わない記録と理由 */
export interface ExcludedRecord { file: string; index: number; reason: 'リスナー参加' | '重複' | '置き換え'; detail: string }
/** 基準6: 「未確認」で使わない選手の行 */
export interface UnconfirmedRow { file: string; index: number; team: TierTeamId; role: Role; rosterName: string }

export interface LoadedResults {
  /** 受け付けた記録。試合日の昇順、同じ日はファイル名・要素の順。エラーが 1 件でもあれば空 */
  games: MatchResult[];
  excluded: ExcludedRecord[];
  unconfirmed: UnconfirmedRow[];
  /** 「推定」の行の数 */
  estimated: number;
  errors: ResultError[];
  /** 読んだファイル(置き場/ファイル名) */
  files: string[];
}
