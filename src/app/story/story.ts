// F-014 Task-4: 試合の根拠のストーリー(基準 20〜25)。文章は固定の形で組み立て、生成 AI は使わない
// 寄与は F-010 の戦力 S の式(S = 0.85 × Σ w_r × O_r + 0.15 × C。MASTERS は S = Σ w_r × O_r)の項ごとの両チームの差。新しい計算ではなく S の差の内訳
// F-014 Task-7: 根拠の 2 層(基準 31・32)。レーン(個人)の層は上の表、マクロ(チーム)の層はマクロの点数 M(F-005: 連携の厚み・司令塔・継続性の素点の平均)と各軸の理由
// 3 行の勝率(レーン相対・マクロ相対・掛け合わせ)は勝率表のファイルの値をそのまま出す。ここでは計算しない
import { ROSTER, type Role } from '../../data/roster.ts';
import teamConfig from '../../team/config.json' with { type: 'json' };
import type { TeamId, Tier } from '../../sim/types.ts';
import { TEAM_INFO, compareHref } from '../lib/index.ts';

export interface EvidenceSource {
  text: string;
  source?: string;
  url?: string;
  marks?: string[];
}
export interface AxisLike {
  key: string;
  label: string;
  display: number;
  /** F-009 基準20 の根拠の一覧(コール力・大会経験の軸) */
  evidence?: { evidence?: EvidenceSource[] } | null;
}
export interface PlayerLike {
  playerId: string;
  name: string;
  axes: AxisLike[];
}
export interface RatingsLike {
  players: PlayerLike[];
}
/** F-010 のチームの軸(team-evaluation.json の tierTeams[].axes[]) */
export interface TeamAxisLike {
  key: string;
  label: string;
  /** 素点(相対評価の前の値)。無ければ null */
  raw?: number | null;
  reason?: string;
}
export interface TierTeamLike {
  team: string;
  tier: string;
  S: number;
  coachC: number | null;
  coachId: string | null;
  coaching?: { coach?: { name?: string } | null } | null;
  /** 基準32: 連携の厚み・司令塔・継続性の素点と理由をここから読む */
  axes?: TeamAxisLike[];
}
export interface TeamEvalLike {
  tierTeams: TierTeamLike[];
}

export interface StoryInput {
  tier: Tier;
  a: TeamId;
  b: TeamId;
  /** 両チームの勝率(%) */
  pA: number;
  pB: number;
  /** 基準31: 勝率表のファイルの試合ごとのレーン相対・マクロ相対の勝率(%。A から見た値。F-005 基準 3b)。無い勝率表のファイルでは undefined */
  pLane?: number;
  pMacro?: number;
  /** 基準32: 勝率表のファイルの階級チームごとのマクロの点数 M(F-005 基準 3b)。あれば 3 軸の素点の平均より優先する */
  mA?: number | null;
  mB?: number | null;
}

export interface SideScore {
  id: string | null;
  name: string;
  /** 小数第一位。評価が無ければ「—」 */
  score: string;
  scoreNum: number | null;
  href: string | null;
}
export interface StoryRow {
  key: string;
  label: string;
  left: SideScore;
  right: SideScore;
  /** A − B(小数第一位) */
  diff: string;
  contribution: number;
  size: '大' | '中' | '小';
  /** 差の絶対値が最大の 2 軸(ロールの行だけ) */
  axes: { label: string; left: string; right: string }[];
  compareHref: string | null;
}
export interface EvidenceItem {
  kind: string;
  strength: string;
  text: string;
  source: string;
  /** 基準28: 評価のファイルの印(例「AI 収集」)。表示は「未確認(AI 収集)」 */
  marks: string[];
}
export interface EvidenceView {
  id: string;
  name: string;
  items: EvidenceItem[];
}
/** 基準32: マクロ(チーム)の層の 1 軸(両チームの素点と、チームの評価のファイルの理由) */
export interface MacroPart {
  key: string;
  label: string;
  /** 素点(小数第二位)。無ければ「—」 */
  a: string;
  b: string;
  /** チームの評価のファイルの各軸の理由。無ければ空 */
  reasonA: string;
  reasonB: string;
}
/** 基準31・32: 根拠の 2 層。勝率は 0.1% 単位の文字列(勝率表のファイルに無ければ null)。M は小数第二位(計算できなければ「—」) */
export interface StoryLayers {
  lane: { p: string | null };
  macro: { p: string | null; M: { a: string; b: string }; parts: MacroPart[] };
  combined: { p: string };
}
export type StoryView =
  | {
      ok: true;
      favored: TeamId;
      favoredName: string;
      favoredP: string;
      even: boolean;
      headline: string;
      layers: StoryLayers;
      rows: StoryRow[];
      evidence: EvidenceView[];
      included: string[];
      excluded: { text: string; feature: string }[];
    }
  | { ok: false; reason: string };

const ROLES: Role[] = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];
const ROLE_LABEL: Record<Role, string> = { TOP: 'TOP', JG: 'JG', MID: 'MID', ADC: 'ADC', SUP: 'SUP' };
const W = (teamConfig as { roleWeights: Record<string, number> }).roleWeights;
/** F-010 の戦力 S の式の分け前 */
export const PLAYER_SHARE = 0.85;
export const COACH_SHARE = 0.15;
/** 用語「寄与の大きさ」の境界と、「ほぼ互角」の境界(戦力 S の差) */
export const SIZE_BIG = 0.1;
export const SIZE_MID = 0.04;
export const EVEN = 0.1;

/** 基準23: 固定の文 */
export const INCLUDED = [
  '選手の 8 軸(ソロランクの基準・対面との差・LTK の経験・コール力と大会経験の出典つき根拠)',
  'コーチの評価(戦力の 15%。MASTERS には無い)',
];
export const EXCLUDED = [
  { text: 'チームの仕上がり(共同プレイ歴・メタの近さ)', feature: '今後の更新で入る予定(F-005 Task-3)' },
  { text: 'スクリムと本番の結果', feature: '今後の更新で入る予定(F-004・F-005 Task-2)' },
  { text: 'ドラフト(NEXT のプロテクトで CORE が使えなくなるピック)', feature: '今後の更新で入る予定(F-006・F-005 Task-3)' },
  { text: '連敗の気持ちの補正', feature: '今後の更新で入る予定(F-005 Task-3)' },
];

/** F-010 の選手の総合 O(playerOverall と同じ式: 5 + 8 軸の表示の点数の 5 からの差の平均) */
export function overallOf(p: PlayerLike): number {
  return 5 + p.axes.reduce((s, a) => s + (a.display - 5), 0) / p.axes.length;
}

export function sizeOf(contribution: number): '大' | '中' | '小' {
  const x = Math.abs(contribution);
  return x >= SIZE_BIG ? '大' : x >= SIZE_MID ? '中' : '小';
}

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const STRENGTH_ORDER: Record<string, number> = { 強: 0, 中: 1, 弱: 2 };
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** 用語「マクロの点数 M」の 3 軸(F-005): チームの評価のファイルの軸の key と名前(ファイルに名前があればそれを使う) */
export const MACRO_AXES: { key: string; label: string }[] = [
  { key: 'synergy', label: '連携の厚み' },
  { key: 'shotcalling', label: '司令塔' },
  { key: 'continuity', label: '継続性' },
];
const rawOf = (t: TierTeamLike, key: string): number | null => {
  const r = t.axes?.find((x) => x.key === key)?.raw;
  return finite(r) ? r : null;
};
/** 用語「マクロの点数 M」: 3 軸の素点の平均。素点の無い軸は除いて平均し、すべて無ければ null(F-005 の定義と同じ) */
export function macroScore(t: TierTeamLike): number | null {
  const xs = MACRO_AXES.map((ax) => rawOf(t, ax.key)).filter((x): x is number => x !== null);
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

/** 基準31・32: 根拠の 2 層。3 行の勝率は勝率表のファイルの値そのまま(無ければ null)。M は勝率表のファイルの値を優先し、無ければ 3 軸の素点の平均 */
function layersOf(input: StoryInput, A: TierTeamLike, B: TierTeamLike): StoryLayers {
  const pct = (p: number | undefined) => (finite(p) ? f1(p) : null);
  const M = (t: TierTeamLike, given: number | null | undefined) => {
    const m = finite(given) ? given : macroScore(t);
    return m === null ? '—' : f2(m);
  };
  const parts: MacroPart[] = MACRO_AXES.map((ax) => {
    const xa = A.axes?.find((x) => x.key === ax.key), xb = B.axes?.find((x) => x.key === ax.key);
    const ra = rawOf(A, ax.key), rb = rawOf(B, ax.key);
    return { key: ax.key, label: xa?.label ?? xb?.label ?? ax.label, a: ra === null ? '—' : f2(ra), b: rb === null ? '—' : f2(rb), reasonA: xa?.reason ?? '', reasonB: xb?.reason ?? '' };
  });
  return {
    lane: { p: pct(input.pLane) },
    macro: { p: pct(input.pMacro), M: { a: M(A, input.mA), b: M(B, input.mB) }, parts },
    combined: { p: f1(input.pA) },
  };
}

const isHttps = (u: string | undefined): u is string => typeof u === 'string' && u.startsWith('https://');

/** 基準22・28: 出典つきの根拠。コール力は肯定の根拠を強さの順に最大 2 件、大会経験は本文のまま(url が出典)最大 2 件。各根拠に評価のファイルの印 */
export function positiveEvidence(p: PlayerLike | undefined, max = 2): EvidenceItem[] {
  if (!p) return [];
  const calls: EvidenceItem[] = [];
  const tournament: EvidenceItem[] = [];
  for (const ax of p.axes) {
    for (const e of ax.evidence?.evidence ?? []) {
      const marks = e.marks ?? [];
      if (ax.key === 'shotcalling') {
        const m = /^肯定・(強|中|弱)・([^:：]+)[:：]\s*(.+)$/.exec(e.text ?? '');
        if (!m || !isHttps(e.source)) continue;
        calls.push({ kind: m[2], strength: m[1], text: m[3], source: e.source, marks });
      } else if (ax.key === 'tournament') {
        const src = isHttps(e.url) ? e.url : isHttps(e.source) ? e.source : null;
        if (!src || !e.text) continue;
        tournament.push({ kind: '大会経験', strength: '', text: e.text, source: src, marks });
      }
    }
  }
  calls.sort((x, y) => STRENGTH_ORDER[x.strength] - STRENGTH_ORDER[y.strength]);
  return [...calls.slice(0, max), ...tournament.slice(0, max)];
}

const sideOf = (id: string | null, name: string, score: number | null): SideScore => ({
  id,
  name,
  score: score === null ? '—' : f1(score),
  scoreNum: score,
  href: id ? `#/player/${id}` : null,
});

const describe = (r: StoryRow) => `${r.label}: ${r.left.name} ${r.left.score} vs ${r.right.name} ${r.right.score}`;

export function matchStory(input: StoryInput, ratings: unknown, teamEval: unknown): StoryView {
  const rs = ratings as RatingsLike | undefined;
  if (!rs || !Array.isArray(rs.players)) return { ok: false, reason: '評価のファイル(ratings.json)がありません' };
  const te = teamEval as TeamEvalLike | undefined;
  if (!te || !Array.isArray(te.tierTeams)) return { ok: false, reason: 'チームの評価のファイル(team-evaluation.json)がありません' };
  const A = te.tierTeams.find((t) => t.team === input.a && t.tier === input.tier);
  const B = te.tierTeams.find((t) => t.team === input.b && t.tier === input.tier);
  const bad = [A, B].map((t, i) => (!t || !Number.isFinite(t.S) ? `${[input.a, input.b][i]}-${input.tier}` : null)).filter(Boolean);
  if (bad.length || !A || !B) return { ok: false, reason: `戦力 S を計算できない階級チームがあります: ${bad.join('、')}` };

  const player = (team: TeamId, role: Role) => {
    const member = ROSTER.find((p) => p.team === team && p.tier === input.tier && p.role === role);
    const rating = member ? rs.players.find((p) => p.playerId === member.id) : undefined;
    return { member, rating };
  };
  const share = input.tier === 'MASTERS' ? 1 : PLAYER_SHARE;
  const rows: StoryRow[] = [];
  for (const role of ROLES) {
    const pa = player(input.a, role), pb = player(input.b, role);
    const oa = pa.rating ? overallOf(pa.rating) : null;
    const ob = pb.rating ? overallOf(pb.rating) : null;
    const contribution = oa !== null && ob !== null ? share * (W[role] ?? 0) * (oa - ob) : 0;
    const axes: StoryRow['axes'] = [];
    if (pa.rating && pb.rating) {
      for (const ax of pa.rating.axes) {
        const bx = pb.rating.axes.find((x) => x.key === ax.key);
        if (bx) axes.push({ label: ax.label, left: f1(ax.display), right: f1(bx.display), gap: Math.abs(ax.display - bx.display) } as StoryRow['axes'][number] & { gap: number });
      }
      axes.sort((x, y) => (y as { gap: number }).gap - (x as { gap: number }).gap);
    }
    rows.push({
      key: role,
      label: ROLE_LABEL[role],
      left: sideOf(pa.member?.id ?? null, pa.member?.name ?? '—', oa),
      right: sideOf(pb.member?.id ?? null, pb.member?.name ?? '—', ob),
      diff: oa !== null && ob !== null ? f1(oa - ob) : '—',
      contribution,
      size: sizeOf(contribution),
      axes: axes.slice(0, 2).map(({ label, left, right }) => ({ label, left, right })),
      compareHref: pa.member && pb.member ? compareHref([pa.member.id, pb.member.id]) : null,
    });
  }
  if (input.tier !== 'MASTERS') {
    const coachName = (t: TierTeamLike) => t.coaching?.coach?.name ?? ROSTER.find((p) => p.id === t.coachId)?.name ?? 'コーチ未定';
    const ca = A.coachC, cb = B.coachC;
    const contribution = ca !== null && cb !== null ? COACH_SHARE * (ca - cb) : 0;
    rows.push({
      key: 'COACH',
      label: 'コーチ',
      left: sideOf(A.coachId, coachName(A), ca),
      right: sideOf(B.coachId, coachName(B), cb),
      diff: ca !== null && cb !== null ? f1(ca - cb) : '—',
      contribution,
      size: sizeOf(contribution),
      axes: [],
      compareHref: A.coachId && B.coachId ? compareHref([A.coachId, B.coachId]) : null,
    });
  }
  rows.sort((x, y) => Math.abs(y.contribution) - Math.abs(x.contribution));

  const even = Math.abs(A.S - B.S) < EVEN;
  const favored = input.pA >= input.pB ? input.a : input.b;
  const favoredName = TEAM_INFO[favored].name;
  const favoredP = f1(favored === input.a ? input.pA : input.pB);
  const top = rows.slice(0, 2);
  // 基準27(再判定 3): 「いちばん効いているのは」。両チームの勝率は「vs」でつなぐ
  const headline = even
    ? `ほぼ互角(${TEAM_INFO[input.a].name} ${f1(input.pA)}% vs ${TEAM_INFO[input.b].name} ${f1(input.pB)}%)。差が出るとすれば ${top.map(describe).join('、次に ')}`
    : `${favoredName} が有利(${favoredP}%)。いちばん効いているのは ${describe(top[0])}${top[1] ? `、次に ${describe(top[1])}` : ''}`;

  // 基準22: 上位 2 つの項の両側の人の根拠
  const evidence: EvidenceView[] = [];
  for (const r of top) {
    for (const s of [r.left, r.right]) {
      if (!s.id || evidence.some((e) => e.id === s.id)) continue;
      evidence.push({ id: s.id, name: s.name, items: positiveEvidence(rs.players.find((p) => p.playerId === s.id)) });
    }
  }
  return { ok: true, favored, favoredName, favoredP, even, headline, layers: layersOf(input, A, B), rows, evidence, included: INCLUDED, excluded: EXCLUDED };
}
