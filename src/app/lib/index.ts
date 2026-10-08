// F-002 基準1・3・4・8: 画面の論理部分(DOM に依存しない)
import type { Player, Role } from '../../data/roster.ts';
import type { PlayerFile } from '../../data/types.ts';
import { scorePlayer } from '../../score/index.ts';

/** 基準1: 0.0〜10.0 に切り詰め、小数第一位で表示する。null は「データなし」 */
export function formatScore(v: number | null): string {
  if (v === null) return 'データなし';
  return Math.max(0, Math.min(10, v)).toFixed(1);
}

export interface Point {
  x: number;
  y: number;
}
export interface RadarGeometry {
  /** 軸ごとの点。欠損は null */
  points: (Point | null)[];
  /** 欠損した軸の番号 */
  missing: number[];
  /** 欠損を飛ばした点で作る多角形(SVG の points 属性) */
  polygon: string;
  /** 10 点の外周(軸の端) */
  outline: Point[];
}

/** 基準4: 五角形の座標。中心 (size, size)、10 点の半径 size × 0.8、1軸目は真上 */
export function radarGeometry(scores: (number | null)[], size: number): RadarGeometry {
  const n = scores.length;
  const r = size * 0.8;
  const at = (i: number, v: number): Point => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const d = (Math.max(0, Math.min(10, v)) / 10) * r;
    const round = (x: number) => Math.round(x * 1e9) / 1e9;
    return { x: round(size + d * Math.cos(a)), y: round(size + d * Math.sin(a)) };
  };
  const points = scores.map((v, i) => (v === null ? null : at(i, v)));
  return {
    points,
    missing: scores.flatMap((v, i) => (v === null ? [i] : [])),
    polygon: points.filter((p): p is Point => p !== null).map((p) => `${p.x},${p.y}`).join(' '),
    outline: scores.map((_, i) => at(i, 10)),
  };
}

export interface ComponentView {
  metric: string;
  raw: number | string;
  weight: number;
  display: string;
  source: string;
  retrievedAt: string;
  rationale?: string;
}
export interface AxisView {
  label: string;
  score: number | null;
  display: string;
  components: ComponentView[];
  missing: string[];
}
export interface PlayerView {
  id: string;
  name: string;
  team: string;
  tier: string;
  role: Role;
  axes: AxisView[];
}

/** 基準1・3: 選手のページの表示内容 */
export function playerView(p: Player, f: PlayerFile): PlayerView {
  const s = scorePlayer(p, f);
  return {
    id: p.id,
    name: p.name,
    team: p.team,
    tier: p.tier,
    role: p.role,
    axes: s.axes.map((a) => ({
      label: a.label,
      score: a.score,
      display: formatScore(a.score),
      missing: a.missing,
      components: a.components.map((c) => ({
        metric: c.metric,
        raw: c.raw,
        weight: c.weight,
        display: formatScore(c.score),
        source: c.source,
        retrievedAt: c.retrievedAt,
        rationale: c.rationale,
      })),
    })),
  };
}

/** 指標ファイルがまだ無い選手の空のファイル */
export function emptyPlayerFile(playerId: string): PlayerFile {
  return { playerId, metrics: {}, qualitative: {}, recentMatches: [] };
}

const ROLE_ICON: Record<Role, string> = { TOP: '⛰', JG: '🌲', MID: '✦', ADC: '🏹', SUP: '🛡' };
const TEAM_COLOR: Record<string, string> = { DD: '#e8a33d', CC: '#d9475b', IT: '#4a7fd6', LR: '#3fa66b' };

/** 基準8: 公開版の立ち絵の代替表示(画像を使わない) */
export function placeholderAvatar(p: Player): { initial: string; role: Role; roleIcon: string; color: string } {
  return { initial: [...p.name][0], role: p.role, roleIcon: ROLE_ICON[p.role], color: TEAM_COLOR[p.team] ?? '#888888' };
}

export type Route = { page: 'home' } | { page: 'player'; id: string };

/** ハッシュによる画面の切り替え(GitHub Pages ではサーバー側の経路を持てないため) */
export function parseRoute(hash: string): Route {
  const m = /^#\/player\/([A-Z]{2}-(?:NEXT|CORE|MASTERS)-(?:TOP|JG|MID|ADC|SUP))$/.exec(hash);
  return m ? { page: 'player', id: m[1] } : { page: 'home' };
}
