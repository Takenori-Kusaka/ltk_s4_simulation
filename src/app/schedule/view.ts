// F-014 Task-1: ファン向けの見せ方の論理(基準 1〜7・12・13)。直近の試合日、公式の形の日程の箱、順位表
// 計算は足さない(勝率は F-005 の winrates.json、シミュレーションは F-001。期待勝ち数は勝率の和、予想の結果は勝率の高い側が勝ったとした集計だけ)
import { MASTERS_CUPS, REGULAR_DAYS } from '../../sim/schedule.ts';
import { TEAMS, type SimOutput, type TeamId, type Tier } from '../../sim/index.ts';
import { TEAM_INFO } from '../lib/index.ts';
import type { MatchPrior } from '../../winrate/core.ts';
import type { WinratesFile } from '../sim/view.ts';
import type { MacroPartRaw, TeamLayer } from '../story/story.ts';

export type DayRef = { kind: 'regular'; day: number; date: string } | { kind: 'masters'; cup: number; date: string };

/** 日程の全日(日付の順) */
export function allDays(): DayRef[] {
  const days: DayRef[] = [
    ...REGULAR_DAYS.map((d) => ({ kind: 'regular' as const, day: d.day, date: d.date })),
    ...MASTERS_CUPS.map((c) => ({ kind: 'masters' as const, cup: c.cup, date: c.date })),
  ];
  return days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** JST の日付(YYYY-MM-DD) */
export function jstDate(now: Date): string {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 基準2: 閲覧日(JST)以降で最も近い日程の日。最後の日より後なら最後の日 */
export function nearestDay(now: Date): DayRef {
  const today = jstDate(now);
  const days = allDays();
  return days.find((d) => d.date >= today) ?? days[days.length - 1];
}

const WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
/** "10/15 THU" の形 */
export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${m}/${d} ${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
}

export interface SideView {
  team: TeamId;
  name: string;
  color: string;
  petals: number;
  /** 勝率(0.1% 単位の文字列) */
  p: string;
  pNum: number;
  /** F-014 基準32・33: 勝率表のファイルの階級チームの M・E・件数(F-005 基準 3b)。どれも無ければ undefined */
  layer?: TeamLayer;
}

export interface MatchRowView {
  tier: Tier;
  blue: SideView;
  red: SideView;
  dataMissing: string | null;
  /** F-014 基準31・33: 勝率表のファイルの試合ごとのレーン相対・マクロ相対・外部の見立てだけの勝率(%。ブルー側から見た値。F-005 基準 3b)。無ければ undefined */
  pLane?: number;
  pMacro?: number;
  pExt?: number;
}

export interface CardBoxView {
  label: string;
  rows: MatchRowView[];
}

export interface DayBoxView {
  ref: DayRef;
  title: string;
  dateLabel: string;
  boxes: CardBoxView[];
  /** MASTERS CUP の M3・M4(組み合わせが準決勝の結果で決まる箱) */
  placeholders: { label: string; text: string }[];
}

const finite = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
/** F-005 基準 3b の項目(試合ごとの pLaneA・pMacroA・pExtA、階級チームごとの M・E・externalCount)。勝率表のファイルに無ければ undefined(F-005 側の型の定義を待たず、任意の項目として読む) */
type LayerFields = { pLaneA?: unknown; pMacroA?: unknown; pExtA?: unknown };
type TeamFields = { M?: unknown; macroParts?: unknown; E?: unknown; externalCount?: unknown };
/** teams[].macroParts のうち、key が文字列で raw が数の項目だけ(壊れた項目は入れない) */
const macroParts = (x: unknown): MacroPartRaw[] => {
  if (!Array.isArray(x)) return [];
  const out: MacroPartRaw[] = [];
  for (const p of x) {
    const o = (p ?? {}) as { key?: unknown; label?: unknown; raw?: unknown };
    const raw = finite(o.raw);
    if (typeof o.key === 'string' && raw !== undefined) out.push({ key: o.key, label: typeof o.label === 'string' ? o.label : '', raw });
  }
  return out;
};
const teamLayer = (file: WinratesFile, team: TeamId, tier: Tier): TeamLayer | undefined => {
  const t = file.teams.find((x) => x.team === team && x.tier === tier) as TeamFields | undefined;
  const layer: TeamLayer = {};
  const M = finite(t?.M), E = finite(t?.E), externalCount = finite(t?.externalCount);
  const parts = macroParts(t?.macroParts);
  if (M !== undefined) layer.M = M;
  if (parts.length) layer.parts = parts;
  if (E !== undefined) layer.E = E;
  if (externalCount !== undefined) layer.externalCount = externalCount;
  return Object.keys(layer).length ? layer : undefined;
};

const side = (team: TeamId, p: number, layer?: TeamLayer): SideView => ({ team, name: TEAM_INFO[team].name, color: TEAM_INFO[team].color, petals: TEAM_INFO[team].petals, p: p.toFixed(1), pNum: p, layer });

function row(file: WinratesFile, tier: Tier, blue: TeamId, red: TeamId, m: MatchPrior | undefined): MatchRowView {
  const lb = teamLayer(file, blue, tier), lr = teamLayer(file, red, tier);
  if (!m) return { tier, blue: side(blue, 50, lb), red: side(red, 50, lr), dataMissing: '勝率表にこの試合が無い' };
  const x = m as MatchPrior & LayerFields;
  return { tier, blue: side(blue, m.pA, lb), red: side(red, m.pB, lr), dataMissing: m.dataMissing, pLane: finite(x.pLaneA), pMacro: finite(x.pMacroA), pExt: finite(x.pExtA) };
}

/** 基準1・3: 日程の箱(公式の Regular Stage の画像の形。左がブルー、右がレッド) */
export function dayBox(file: WinratesFile, ref: DayRef): DayBoxView {
  if (ref.kind === 'regular') {
    const day = REGULAR_DAYS.find((d) => d.day === ref.day);
    const boxes: CardBoxView[] = (day?.cards ?? []).map((card, i) => ({
      label: `CARD ${i + 1}`,
      rows: (['NEXT', 'CORE'] as const).map((tier) =>
        row(file, tier, card.blue, card.red, file.matches.find((m) => m.stage === 'regular' && m.day === ref.day && m.tier === tier && m.a === card.blue && m.b === card.red)),
      ),
    }));
    return { ref, title: `DAY ${ref.day}`, dateLabel: dateLabel(ref.date), boxes, placeholders: [] };
  }
  const cup = MASTERS_CUPS.find((c) => c.cup === ref.cup);
  const boxes: CardBoxView[] = (cup?.semis ?? []).map(([a, b], i) => ({
    label: `M${i + 1}`,
    rows: [row(file, 'MASTERS', a, b, file.matches.find((m) => m.stage === 'masters' && m.cup === ref.cup && m.a === a && m.b === b))],
  }));
  // 基準1(再判定 2): M3・M4 は予想の結果(準決勝で勝率の高い側が勝つ)で決まる組み合わせを、勝率つきで示す
  const predicted = predictedResult(file).cups.find((c) => c.cup === ref.cup);
  if (predicted && predicted.semiLosers.length === 2 && predicted.semiWinners.length === 2) {
    const pair = (label: string, x: TeamId, y: TeamId): CardBoxView => {
      const [a, b] = x < y ? [x, y] : [y, x];
      const p = mastersPercent(file, a, b);
      return { label, rows: [{ tier: 'MASTERS', blue: side(a, p, teamLayer(file, a, 'MASTERS')), red: side(b, 100 - p, teamLayer(file, b, 'MASTERS')), dataMissing: null }] };
    };
    boxes.push(pair('M3 THIRD-PLACE · 予想の組み合わせ', predicted.semiLosers[0], predicted.semiLosers[1]));
    boxes.push(pair('M4 FINALS · 予想の組み合わせ', predicted.semiWinners[0], predicted.semiWinners[1]));
  }
  return { ref, title: `MASTERS CUP ${ref.cup}`, dateLabel: dateLabel(ref.date), boxes, placeholders: [] };
}

/** MASTERS の勝率表(ステージ補正つき)から a の勝率(%)を引く。a < b の向きで持つ */
function mastersPercent(file: WinratesFile, a: TeamId, b: TeamId): number {
  const table = file.stageWinTables?.masters ?? file.winTable;
  const direct = table.MASTERS[`${a}>${b}`];
  const p = direct !== undefined ? direct : 1 - (table.MASTERS[`${b}>${a}`] ?? 0.5);
  return Math.round(p * 1000) / 10;
}

export interface StandingRowView {
  no: number;
  team: TeamId;
  name: string;
  color: string;
  petals: number;
  coreWL: string;
  nextWL: string;
  masters: string;
  total: string;
  champion: string;
  first: boolean;
}

export interface StandingsView {
  label: string;
  rows: StandingRowView[];
  /** 基準26: 順位表の直下の注記 */
  note: string;
}

export const STANDINGS_NOTE = '勝ち数とポイントは、各試合で勝率の高い側が勝ったとした予想の結果。優勝確率は Playoffs を含む 10,000 回のシミュレーションの値で、順位と前後することがある';

/** 基準30: ホームの見出し。最後の日程の日より後は「最後の試合日の予想」と Playoffs の案内 */
export function forecastHeading(now: Date): { title: string; note: string | null; past: boolean } {
  const days = allDays();
  const past = jstDate(now) > days[days.length - 1].date;
  return past
    ? { title: '最後の試合日の予想', note: 'Regular Stage と MASTERS CUP は終了。Playoffs は 11/21(土)・11/22(日)', past }
    : { title: '次の試合日の予想', note: null, past };
}

/** 用語: 期待勝ち数 = その階級の Regular Stage 6 試合の勝率の和(階級チームの試合の一覧で使う) */
export function expectedWins(file: WinratesFile, team: TeamId, tier: 'NEXT' | 'CORE'): number {
  let wins = 0;
  for (const m of file.matches) {
    if (m.stage !== 'regular' || m.tier !== tier) continue;
    if (m.a === team) wins += m.pA / 100;
    else if (m.b === team) wins += m.pB / 100;
  }
  return wins;
}

/** 用語「予想の結果」: 勝率の高い側が勝つ。同率なら戦力 S の高い側、それも同じならブルーサイド(a) */
export function predictedWinner(file: WinratesFile, tier: Tier, a: TeamId, b: TeamId, pA: number, pB: number): TeamId {
  if (pA !== pB) return pA > pB ? a : b;
  const S = (t: TeamId) => file.teams.find((x) => x.team === t && x.tier === tier)?.S ?? null;
  const sa = S(a), sb = S(b);
  if (sa !== null && sb !== null && sa !== sb) return sa > sb ? a : b;
  return a;
}

export interface PredictedCup {
  cup: number;
  semiWinners: TeamId[];
  semiLosers: TeamId[];
  final: TeamId | null;
  third: TeamId | null;
  /** 1 位から 4 位 */
  placing: TeamId[];
}

export interface PredictedResult {
  wins: Record<TeamId, { NEXT: number; CORE: number }>;
  rsPoints: Record<TeamId, number>;
  mcPoints: Record<TeamId, number>;
  total: Record<TeamId, number>;
  cups: PredictedCup[];
}

const zero = () => Object.fromEntries(TEAMS.map((t) => [t, 0])) as Record<TeamId, number>;
const MC_POINTS = [3, 2, 1, 0];

/** 用語「予想の結果」の集計。Regular Stage は 1 勝 1pt と同日の両勝ち +1pt、MASTERS CUP は 3/2/1/0pt */
export function predictedResult(file: WinratesFile): PredictedResult {
  const wins = Object.fromEntries(TEAMS.map((t) => [t, { NEXT: 0, CORE: 0 }])) as PredictedResult['wins'];
  const rsPoints = zero(), mcPoints = zero(), total = zero();
  for (const d of REGULAR_DAYS) {
    const dayWins = zero();
    for (const card of d.cards) {
      for (const tier of ['NEXT', 'CORE'] as const) {
        const m = file.matches.find((x) => x.stage === 'regular' && x.day === d.day && x.tier === tier && x.a === card.blue && x.b === card.red);
        if (!m) continue;
        const w = predictedWinner(file, tier, card.blue, card.red, m.pA, m.pB);
        wins[w][tier] += 1;
        rsPoints[w] += 1;
        dayWins[w] += 1;
      }
    }
    for (const t of TEAMS) if (dayWins[t] === 2) rsPoints[t] += 1;
  }
  const pOf = (x: TeamId, y: TeamId) => mastersPercent(file, x, y);
  const cups: PredictedCup[] = [];
  for (const c of MASTERS_CUPS) {
    const semiWinners: TeamId[] = [], semiLosers: TeamId[] = [];
    for (const [a, b] of c.semis) {
      const m = file.matches.find((x) => x.stage === 'masters' && x.cup === c.cup && x.a === a && x.b === b);
      const w = m ? predictedWinner(file, 'MASTERS', a, b, m.pA, m.pB) : predictedWinner(file, 'MASTERS', a, b, pOf(a, b), pOf(b, a));
      semiWinners.push(w);
      semiLosers.push(w === a ? b : a);
    }
    const pick = (x: TeamId, y: TeamId) => predictedWinner(file, 'MASTERS', x, y, pOf(x, y), pOf(y, x));
    const final = semiWinners.length === 2 ? pick(semiWinners[0], semiWinners[1]) : null;
    const third = semiLosers.length === 2 ? pick(semiLosers[0], semiLosers[1]) : null;
    const placing: TeamId[] = [];
    if (final && third) {
      placing.push(final, semiWinners.find((t) => t !== final)!, third, semiLosers.find((t) => t !== third)!);
      placing.forEach((t, i) => (mcPoints[t] += MC_POINTS[i]));
    }
    cups.push({ cup: c.cup, semiWinners, semiLosers, final, third, placing });
  }
  for (const t of TEAMS) total[t] = rsPoints[t] + mcPoints[t];
  return { wins, rsPoints, mcPoints, total, cups };
}

/** 基準4・5・13: 公式のシーズン3の STANDINGS と同じ列。結果が無い間は予想の結果(整数)で埋める */
export function standings(file: WinratesFile, sim: SimOutput): StandingsView {
  const pr = predictedResult(file);
  const rows = TEAMS.map((team) => ({
    team,
    name: TEAM_INFO[team].name,
    color: TEAM_INFO[team].color,
    petals: TEAM_INFO[team].petals,
    coreWL: `${pr.wins[team].CORE} - ${6 - pr.wins[team].CORE}`,
    nextWL: `${pr.wins[team].NEXT} - ${6 - pr.wins[team].NEXT}`,
    masters: String(pr.mcPoints[team]),
    total: String(pr.total[team]),
    totalNum: pr.total[team],
    rsNum: pr.rsPoints[team],
    champion: (sim.championProbability[team] * 100).toFixed(1),
    championNum: sim.championProbability[team],
  }))
    .sort((x, y) => y.totalNum - x.totalNum || y.rsNum - x.rsNum || y.championNum - x.championNum)
    .map(({ totalNum: _t, rsNum: _r, championNum: _c, ...r }, i) => ({ no: i + 1, first: i === 0, ...r }));
  return { label: file.results ? '結果を反映' : '予想(開幕前)', rows, note: STANDINGS_NOTE };
}
