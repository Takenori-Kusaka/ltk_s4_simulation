// F-008 Task-2: 比較の画面の描き方の論理(受入基準 1〜9)。DOM に依存しない
import { ROSTER } from '../../data/roster.ts';
import type { Confidence } from '../../rating/types.ts';
import { TEAMS } from '../../sim/types.ts';
import { radarEdges, radarGeometry, type Point } from '../lib/index.ts';
import { AXIS_ORDER, lineOf, type AxisLine, type RatingsFile } from '../rating/view.ts';
import { MAX_SERIES, resolveTarget, type CompareSeries, type CompareTarget, type CompareView, type SeriesShape } from './view.ts';

/** 基準4: 系列の塗りの不透明度(半透明。光彩は付けない) */
export const SERIES_FILL_OPACITY = 0.14;
export const RADAR_SIZE = 150;

export interface OverlaySeries {
  id: string;
  color: string;
  shape: SeriesShape;
  points: (Point | null)[];
  /** 欠損を飛ばした多角形(SVG の points 属性) */
  polygon: string;
  lines: AxisLine[];
  edges: { from: Point; to: Point; dotted: boolean }[];
}

/** 基準1〜3: 系列ごとの頂点・辺と、いずれかの系列で欠損の軸。チームの系列の線は所属選手の最も低い確度で描く */
export function overlayGeometry(series: readonly CompareSeries[], file?: RatingsFile, size = RADAR_SIZE) {
  const outline = radarGeometry(AXIS_ORDER.map(() => 10), size).outline;
  const out: OverlaySeries[] = series.map((s) => {
    const g = radarGeometry(s.scores, size);
    const conf = (i: number) => (s.kind === 'player' ? s.confidences[i] : teamConfidence(s, AXIS_ORDER[i].key, file));
    const lines = s.scores.map((v, i): AxisLine => (v === null ? 'missing' : lineOf(conf(i) ?? '高')));
    return { id: s.id, color: s.color, shape: s.shape, points: g.points, polygon: g.polygon, lines, edges: radarEdges(g.points, lines) };
  });
  const axisMissing = AXIS_ORDER.map((_, i) => series.some((s) => s.scores[i] === null));
  return { series: out, outline, axisMissing };
}

/** 基準3 */
export const axisLabel = (label: string, missing: boolean) => (missing ? `${label} ?` : label);

/** 基準5: 頂点の点の形(SVG の path)。丸・四角・三角・菱形 */
export function markerPath(shape: SeriesShape, x: number, y: number, r = 4): string {
  const f = (n: number) => Math.round(n * 100) / 100;
  if (shape === 'square') return `M${f(x - r)},${f(y - r)}H${f(x + r)}V${f(y + r)}H${f(x - r)}Z`;
  if (shape === 'triangle') return `M${f(x)},${f(y - r * 1.2)}L${f(x + r * 1.1)},${f(y + r * 0.8)}L${f(x - r * 1.1)},${f(y + r * 0.8)}Z`;
  if (shape === 'diamond') return `M${f(x)},${f(y - r * 1.3)}L${f(x + r)},${f(y)}L${f(x)},${f(y + r * 1.3)}L${f(x - r)},${f(y)}Z`;
  return `M${f(x - r)},${f(y)}A${r},${r} 0 1,0 ${f(x + r)},${f(y)}A${r},${r} 0 1,0 ${f(x - r)},${f(y)}Z`;
}

/** 基準5・9: 凡例(色・点の形・名前と、チームの系列の除外の注記) */
export function legendItems(series: readonly CompareSeries[]) {
  return series.map((s) => ({
    id: s.id,
    label: s.label,
    color: s.color,
    shape: s.shape,
    note: s.kind !== 'player' && s.excluded > 0 ? `データの無い ${s.excluded} 名を除いて計算` : undefined,
  }));
}

const RANK: Record<Confidence, number> = { 低: 0, 中: 1, 高: 2 };

/** チームの系列の確度: 所属選手のその軸の確度の最も低いもの(相対評価の点数そのものは確度を持たないため) */
function teamConfidence(s: CompareSeries, axisKey: string, file: RatingsFile | undefined): Confidence | null {
  const members = ROSTER.filter((p) => p.team === s.team && (s.kind === 'team' || p.tier === s.tier));
  const cs = members
    .map((p) => file?.players.find((r) => r.playerId === p.id)?.axes.find((a) => a.key === axisKey)?.confidence)
    .filter((c): c is Confidence => !!c);
  return cs.length ? cs.reduce((a, b) => (RANK[b] < RANK[a] ? b : a)) : null;
}

export type ConfidenceText = Confidence | 'データなし';

/** 基準6〜8: 軸ごとの表 */
export function tableRows(view: Extract<CompareView, { ok: true }>, file: RatingsFile | undefined) {
  return view.rows.map((r, k) => ({
    axis: r.axis,
    cells: view.series.map((s, i) => {
      const score = s.scores[k];
      const c = s.kind === 'player' ? s.confidences[k] : teamConfidence(s, AXIS_ORDER[k].key, file);
      return { display: r.values[i].display, confidence: (score === null || !c ? 'データなし' : c) as ConfidenceText };
    }),
    diffs: r.diffs,
  }));
}

/** 基準1・14: 加えられる対象の候補(同じ種類、階級チームは同じ階級、まだ選んでいないもの)。上限なら空 */
export function candidateTargets(selected: readonly string[]): CompareTarget[] {
  if (selected.length >= MAX_SERIES || !selected.length) return [];
  const first = resolveTarget(selected[0]);
  if (!first) return [];
  const ids =
    first.kind === 'player'
      ? ROSTER.map((p) => p.id)
      : first.kind === 'tier-team'
        ? TEAMS.map((t) => `${t}-${first.tier}`)
        : [...TEAMS];
  return ids.filter((id) => !selected.includes(id)).map((id) => resolveTarget(id)!);
}
