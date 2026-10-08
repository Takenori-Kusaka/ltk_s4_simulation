// F-002 基準1・3・4・8: 画面の論理部分(DOM に依存しない)
import { ROSTER } from '../../data/roster.ts';
import type { Player, Role } from '../../data/roster.ts';

const ROSTER_IDS = new Set(ROSTER.map((p) => p.id));
import type { PlayerFile } from '../../data/types.ts';
import { scorePlayer } from '../../score/index.ts';

/** 基準1: 0.0〜10.0 に切り詰め、小数第一位で表示する。null は「データなし」 */
export function formatScore(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return 'データなし';
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

/** 指標の日本語の名前(採点規則 scoring.json のキー) */
export const METRIC_LABEL: Record<string, string> = {
  soloRank: '現在ランク(ソロ)',
  peakRank: '最高ランク',
  kda: 'KDA',
  csPerMin: '分あたり CS',
  killParticipation: 'キル関与率',
  damageShare: 'ダメージ割合',
  ltkGames: 'LTK 出場試合数',
  ltkWinRate: 'LTK 勝率',
  championPoolSize: '使用チャンピオン数',
  laning: 'レーン戦の評価',
  teamfight: '集団戦の評価',
  shotcalling: 'コール力の評価',
  metaFit: 'メタ適合の評価',
};

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
        label: METRIC_LABEL[c.metric] ?? c.metric,
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

const ROLE_ICON: Record<Role, string> = { TOP: '◆', JG: '◈', MID: '✦', ADC: '➶', SUP: '✚' };

/** チームの意匠。色は公式発表の各チームの色(🟧🟥🟦🟩)を深めた値 */
export const TEAM_INFO: Record<string, { name: string; flower: string; regalia: string; color: string; petals: number }> = {
  DD: { name: 'Dahlia Diadem', flower: 'ダリア', regalia: 'ダイアデム', color: '#e0892b', petals: 14 },
  CC: { name: 'Camellia Crown', flower: '椿', regalia: '王冠', color: '#c8324a', petals: 5 },
  IT: { name: 'Iris Tiara', flower: 'アイリス', regalia: 'ティアラ', color: '#4a6fe0', petals: 3 },
  LR: { name: 'Laurel Regalia', flower: '月桂樹', regalia: 'レガリア', color: '#3f9b5c', petals: 8 },
};
const TEAM_COLOR: Record<string, string> = Object.fromEntries(Object.entries(TEAM_INFO).map(([k, v]) => [k, v.color]));

/** 基準8: 公開版の立ち絵の代替表示(画像を使わない) */
export function placeholderAvatar(p: Player): { initial: string; role: Role; roleIcon: string; color: string } {
  return { initial: [...p.name][0], role: p.role, roleIcon: ROLE_ICON[p.role], color: TEAM_COLOR[p.team] ?? '#888888' };
}

export type Route =
  | { page: 'home' }
  | { page: 'player'; id: string }
  | { page: 'team'; team: 'DD' | 'CC' | 'IT' | 'LR' }
  | { page: 'notfound'; hash: string };

/**
 * ハッシュによる画面の切り替え(GitHub Pages ではサーバー側の経路を持てないため)。
 * 大文字・小文字を区別せず、末尾の / と ?… は無視する。不正な経路は「見つからない」(QA 指摘 M4)
 */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/[?].*$/, '').replace(/\/+$/, '');
  if (path === '' || path === '/') return { page: 'home' };
  const upper = path.toUpperCase();
  const m = /^\/PLAYER\/([A-Z]{2}-(?:NEXT|CORE|MASTERS)-(?:TOP|JG|MID|ADC|SUP))$/.exec(upper);
  if (m && ROSTER_IDS.has(m[1])) return { page: 'player', id: m[1] };
  const t = /^\/TEAM\/(DD|CC|IT|LR)$/.exec(upper);
  if (t) return { page: 'team', team: t[1] as 'DD' | 'CC' | 'IT' | 'LR' };
  return { page: 'notfound', hash };
}

/** レーダーのラベルの寄せ方。左右の軸は外側へ寄せて頂点の点と重ねない(QA 指摘 M1) */
export function radarLabelAnchor(dx: number): 'start' | 'middle' | 'end' {
  if (Math.abs(dx) < 8) return 'middle';
  return dx > 0 ? 'start' : 'end';
}

/** 文書の題名(画面の遷移をスクリーンリーダーとタブに伝える。QA 指摘 L2) */
export function pageTitle(r: Route): string {
  const site = 'LTK Season Finale — 予言の書';
  if (r.page === 'player') {
    const p = ROSTER.find((x) => x.id === r.id);
    return p ? `${p.name}(${p.team} ${p.tier} ${p.role})| ${site}` : site;
  }
  if (r.page === 'team') return `${TEAM_INFO[r.team].name} | ${site}`;
  if (r.page === 'notfound') return `ページが見つかりません | ${site}`;
  return site;
}

/** 総合値: データのある軸の平均。全軸データなしなら null */
export function overallScore(scores: (number | null)[]): number | null {
  const v = scores.filter((s): s is number => s !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** 開幕(2026-10-15 JST)までの日数。開幕日以降は 0 */
export function daysUntilOpening(now: Date, opening = '2026-10-15T00:00:00+09:00'): number {
  return Math.max(0, Math.ceil((new Date(opening).getTime() - now.getTime()) / 86400000));
}

/** F-009 基準24: レーダーの辺。確度「低」の頂点に触れる辺は点線、欠損の頂点は飛ばして隣の点と結ぶ */
export function radarEdges(
  points: (Point | null)[],
  lines: readonly ('solid' | 'dotted' | 'missing')[],
): { from: Point; to: Point; dotted: boolean }[] {
  const idx = points.flatMap((p, i) => (p ? [i] : []));
  if (idx.length < 2) return [];
  return idx.map((i, k) => {
    const j = idx[(k + 1) % idx.length];
    return { from: points[i]!, to: points[j]!, dotted: lines[i] === 'dotted' || lines[j] === 'dotted' };
  }).filter((_, k) => idx.length > 2 || k === 0);
}
