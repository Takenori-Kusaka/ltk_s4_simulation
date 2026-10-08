// F-008 Task-1: 比較の論理(対象の解決、種類と階級の検査、差の計算、重複の除去)。DOM に依存しない
import { ROSTER } from '../../data/roster.ts';
import type { Confidence } from '../../rating/types.ts';
import type { TeamId } from '../../sim/types.ts';
import { formatScore, targetKind } from '../lib/index.ts';
import { AXIS_ORDER, ratingAxesView, teamRatingView, type RatingsFile } from '../rating/view.ts';

/** 重ねられる系列の上限(価値責任者の決定 2026-10-09) */
export const MAX_SERIES = 4;
/** 系列の色(並びの順で固定。チームの色は使わない)。金・青・緑・紅 */
export const SERIES_COLORS = ['#c9a24a', '#5b8def', '#4fb37a', '#d0505f'] as const;
export const SERIES_SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;
export type SeriesShape = (typeof SERIES_SHAPES)[number];

export interface CompareTarget {
  id: string;
  kind: 'player' | 'tier-team' | 'team';
  tier: string | null;
  team: string;
  label: string;
}

/** 対象の ID から種類・階級・チーム・名前を引く。存在しなければ null */
export function resolveTarget(id: string): CompareTarget | null {
  const kind = targetKind(id);
  if (kind === 'player') {
    const p = ROSTER.find((x) => x.id === id)!;
    return { id, kind, tier: p.tier, team: p.team, label: p.name };
  }
  if (kind === 'tier-team') {
    const [team, tier] = id.split('-');
    return { id, kind, tier, team, label: `${team} ${tier}` };
  }
  if (kind === 'team') return { id, kind, tier: null, team: id, label: `${id} チーム全体` };
  return null;
}

export interface CompareSeries extends CompareTarget {
  color: string;
  shape: SeriesShape;
  /** 軸ごとの点数。データなしは null */
  scores: (number | null)[];
  /** 軸ごとの確度。選手の系列だけが持つ(チームの系列は相対評価のため null) */
  confidences: (Confidence | null)[];
  /** 評価の無い選手の数(チームの系列だけ) */
  excluded: number;
}

export interface CompareRow {
  axis: string;
  values: { display: string; confidence: Confidence | null }[];
  /** 1つ目の系列との差。1つ目は null、どちらかがデータなしなら「—」 */
  diffs: (string | null)[];
}

export type CompareView =
  | { ok: true; kind: CompareTarget['kind']; axisLabels: string[]; series: CompareSeries[]; rows: CompareRow[] }
  | { ok: false; message: string };

/** 差: 丸める前の値で引き、小数第一位に丸めて符号を付ける */
function diffText(a: number | null, b: number | null): string {
  if (a === null || b === null) return '—';
  const d = Math.round((b - a) * 10) / 10;
  return `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`;
}

function seriesOf(t: CompareTarget, i: number, file: RatingsFile | undefined): CompareSeries {
  const style = { color: SERIES_COLORS[i], shape: SERIES_SHAPES[i] };
  if (t.kind === 'player') {
    const axes = ratingAxesView(file?.players.find((p) => p.playerId === t.id));
    return { ...t, ...style, scores: axes.map((a) => a.score), confidences: axes.map((a) => a.confidence), excluded: 0 };
  }
  // 基準11: F-009 のチームのページと同じ相対評価
  const radar = teamRatingView(t.team as TeamId, file).radars.find((r) => r.label === (t.kind === 'team' ? 'チーム全体' : t.tier));
  const scores = radar?.scores ?? AXIS_ORDER.map(() => null);
  return { ...t, ...style, scores, confidences: scores.map(() => null), excluded: radar?.excluded ?? 0 };
}

/** 基準10〜13: 比較の内容。種類や階級が揃わなければ案内の文を返す */
export function compareView(ids: readonly string[], file: RatingsFile | undefined): CompareView {
  const targets = ids.map(resolveTarget);
  if (targets.some((t) => t === null)) return { ok: false, message: '比較の対象に存在しないものが含まれています' };
  const ts = targets as CompareTarget[];
  if (ts.length < 2 || ts.length > MAX_SERIES) return { ok: false, message: `比較は2〜${MAX_SERIES}つの対象で行います` };
  if (new Set(ts.map((t) => t.kind)).size > 1) {
    return { ok: false, message: '同じ種類の対象(選手どうし・階級チームどうし・チーム全体どうし)を選んでください' };
  }
  if (ts[0].kind === 'tier-team' && new Set(ts.map((t) => t.tier)).size > 1) {
    return { ok: false, message: '階級チームは同じ階級どうしを選んでください(階級チームの点数は階級の中での相対評価のため)' };
  }
  const series = ts.map((t, i) => seriesOf(t, i, file));
  const rows = AXIS_ORDER.map((axis, k): CompareRow => ({
    axis: axis.label,
    values: series.map((s) => ({ display: formatScore(s.scores[k]), confidence: s.confidences[k] })),
    diffs: series.map((s, i) => (i === 0 ? null : diffText(series[0].scores[k], s.scores[k]))),
  }));
  return { ok: true, kind: ts[0].kind, axisLabels: AXIS_ORDER.map((a) => a.label), series, rows };
}

/** 基準14: 対象を加える。上限に達していれば加えずに案内の文を返す。同じ対象は加えない */
export function addTarget(targets: readonly string[], id: string): { targets: string[]; message?: string } {
  const norm = id.toUpperCase();
  if (targets.includes(norm)) return { targets: [...targets] };
  if (targets.length >= MAX_SERIES) return { targets: [...targets], message: `重ねられるのは${MAX_SERIES}つまでです` };
  return { targets: [...targets, norm] };
}
