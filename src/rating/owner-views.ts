// F-009 Task-14(基準37・38): 価値責任者の見立て(docs/research/grounds/normalized/owner-views.json)を読み、
// データの軸の基礎の点数へ加える加点を計算する。チーム・コーチを対象とする項目は F-010 が読む
import ratingConfig from './config.json' with { type: 'json' };

export type OwnerStrength = '強' | '中' | '弱';

export interface OwnerView {
  /** player: 選手(名簿の ID)/ team: 階級チーム(例 DD-CORE)/ coach: 階級チームの担当コーチ */
  targetKind: 'player' | 'team' | 'coach';
  target: string;
  axis: string;
  direction: '+' | '-';
  strength: OwnerStrength;
  date: string;
  quote: string;
  source: string;
}

export interface OwnerViewConfig {
  strength: Record<OwnerStrength, number>;
  cap: number;
}

export interface OwnerViewAdjust {
  /** 切り詰めた後の加点 */
  value: number;
  /** 切り詰める前の合計 */
  raw: number;
  clipped: boolean;
  views: OwnerView[];
}

/** 基準37 の加点を受け取るデータの軸 */
export const DATA_AXES: readonly string[] = ['ground', 'laning', 'teamfight', 'synergy', 'stability', 'pool'];
/** データの軸ではないが選手を対象に置いてよい軸(F-005 基準17 の伸びしろ)。基準38 の警告の対象から外す */
export const OTHER_PLAYER_AXES: readonly string[] = ['growth'];

const STRENGTHS: readonly string[] = ['強', '中', '弱'];
const KINDS: readonly string[] = ['player', 'team', 'coach'];
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown): x is string => typeof x === 'string' && x.trim() !== '';

export const loadOwnerViewConfig = (): OwnerViewConfig => (ratingConfig as unknown as { ownerView: OwnerViewConfig }).ownerView;

/**
 * 見立ての記録を読む。選手を対象とする項目は名簿の ID と軸を確かめ、使えない項目は警告にして除く(基準38)。
 * チーム・コーチを対象とする項目は形だけを確かめて others に返す(F-010 基準23〜25 が使う)
 */
export function readOwnerViews(raw: unknown, playerIds: ReadonlySet<string>): {
  players: Record<string, OwnerView[]>;
  others: OwnerView[];
  warnings: string[];
} {
  const players: Record<string, OwnerView[]> = {};
  const others: OwnerView[] = [];
  const warnings: string[] = [];
  const list = isObj(raw) && Array.isArray(raw.views) ? raw.views : null;
  if (!list) return { players, others, warnings: raw === null ? [] : ['価値責任者の見立ての記録に views の配列が無い'] };
  list.forEach((v: unknown, i) => {
    const where = isObj(v) && str(v.target) ? v.target : `${i + 1} 件目`;
    if (!isObj(v)) return void warnings.push(`価値責任者の見立て ${where}: 項目の形が違う`);
    const missing = [
      KINDS.includes(v.targetKind as string) ? null : '対象の種類',
      str(v.target) ? null : '対象',
      str(v.axis) ? null : '軸',
      v.direction === '+' || v.direction === '-' ? null : '向き',
      STRENGTHS.includes(v.strength as string) ? null : '強さ',
      str(v.date) ? null : '日付',
      str(v.quote) ? null : '原文',
      str(v.source) ? null : '出典',
    ].filter(Boolean);
    if (missing.length) return void warnings.push(`価値責任者の見立て ${where}: ${missing.join('・')}が無いため使わない`);
    const view = v as unknown as OwnerView;
    if (view.targetKind !== 'player') return void others.push(view);
    if (!playerIds.has(view.target)) return void warnings.push(`価値責任者の見立て ${view.target}: 名簿に無い選手のため使わない`);
    if (!DATA_AXES.includes(view.axis) && !OTHER_PLAYER_AXES.includes(view.axis)) {
      return void warnings.push(`価値責任者の見立て ${view.target}: 軸 ${view.axis} はデータの軸でないため使わない(コール力は shotcalling.json の owner-confirmation で扱う)`);
    }
    (players[view.target] ??= []).push(view);
  });
  return { players, others, warnings };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** 基準37: 軸ごとの加点 = Σ(向き × 強さの重み)を ±cap で切り詰めた値。項目が無ければ null */
export function ownerViewAdjust(views: readonly OwnerView[], axis: string, cfg: OwnerViewConfig): OwnerViewAdjust | null {
  const used = views.filter((v) => v.axis === axis);
  if (!used.length) return null;
  const raw = used.reduce((s, v) => s + (v.direction === '+' ? 1 : -1) * cfg.strength[v.strength], 0);
  const value = Math.max(-cfg.cap, Math.min(cfg.cap, raw));
  return { value: round2(value), raw: round2(raw), clipped: value !== raw, views: used };
}

/** 軸の説明に足す一文(基準39 の表示とは別に、理由の文にも残す) */
export function ownerViewSentence(adj: OwnerViewAdjust): string {
  const sign = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(2)}`;
  const items = adj.views.map((v) => `${v.date} ${v.direction}${v.strength}`).join('・');
  return `価値責任者の見立て ${sign(adj.value)}(${items}${adj.clipped ? `。合計 ${sign(adj.raw)} を上限で切り詰め` : ''})`;
}
