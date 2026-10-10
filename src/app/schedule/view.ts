// F-014 Task-1: ファン向けの見せ方の論理(基準 1〜7・12・13)。直近の試合日、公式の形の日程の箱、順位表
// 計算は足さない(勝率は F-005 の winrates.json、シミュレーションは F-001。期待勝ち数だけ勝率の和で作る)
import { MASTERS_CUPS, REGULAR_DAYS } from '../../sim/schedule.ts';
import { TEAMS, type SimOutput, type TeamId, type Tier } from '../../sim/index.ts';
import { TEAM_INFO } from '../lib/index.ts';
import type { MatchPrior } from '../../winrate/core.ts';
import type { WinratesFile } from '../sim/view.ts';

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
}

export interface MatchRowView {
  tier: Tier;
  blue: SideView;
  red: SideView;
  dataMissing: string | null;
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

const side = (team: TeamId, p: number): SideView => ({ team, name: TEAM_INFO[team].name, color: TEAM_INFO[team].color, petals: TEAM_INFO[team].petals, p: p.toFixed(1), pNum: p });

function row(tier: Tier, blue: TeamId, red: TeamId, m: MatchPrior | undefined): MatchRowView {
  if (!m) return { tier, blue: side(blue, 50), red: side(red, 50), dataMissing: '勝率表にこの試合が無い' };
  return { tier, blue: side(blue, m.pA), red: side(red, m.pB), dataMissing: m.dataMissing };
}

/** 基準1・3: 日程の箱(公式の Regular Stage の画像の形。左がブルー、右がレッド) */
export function dayBox(file: WinratesFile, ref: DayRef): DayBoxView {
  if (ref.kind === 'regular') {
    const day = REGULAR_DAYS.find((d) => d.day === ref.day);
    const boxes: CardBoxView[] = (day?.cards ?? []).map((card, i) => ({
      label: `CARD ${i + 1}`,
      rows: (['NEXT', 'CORE'] as const).map((tier) =>
        row(tier, card.blue, card.red, file.matches.find((m) => m.stage === 'regular' && m.day === ref.day && m.tier === tier && m.a === card.blue && m.b === card.red)),
      ),
    }));
    return { ref, title: `DAY ${ref.day}`, dateLabel: dateLabel(ref.date), boxes, placeholders: [] };
  }
  const cup = MASTERS_CUPS.find((c) => c.cup === ref.cup);
  const boxes: CardBoxView[] = (cup?.semis ?? []).map(([a, b], i) => ({
    label: `M${i + 1}`,
    rows: [row('MASTERS', a, b, file.matches.find((m) => m.stage === 'masters' && m.cup === ref.cup && m.a === a && m.b === b))],
  }));
  return {
    ref,
    title: `MASTERS CUP ${ref.cup}`,
    dateLabel: dateLabel(ref.date),
    boxes,
    placeholders: [
      { label: 'M3', text: 'THIRD-PLACE · 準決勝の敗者どうし' },
      { label: 'M4', text: 'FINALS · 準決勝の勝者どうし(BO3)' },
    ],
  };
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
}

/** 用語: 期待勝ち数 = その階級の Regular Stage 6 試合の勝率の和 */
export function expectedWins(file: WinratesFile, team: TeamId, tier: 'NEXT' | 'CORE'): number {
  let wins = 0;
  for (const m of file.matches) {
    if (m.stage !== 'regular' || m.tier !== tier) continue;
    if (m.a === team) wins += m.pA / 100;
    else if (m.b === team) wins += m.pB / 100;
  }
  return wins;
}

const wl = (wins: number) => `${wins.toFixed(1)} - ${(6 - wins).toFixed(1)}`;

/** 基準4・5・13: 公式のシーズン3の STANDINGS と同じ列。結果が無い間は期待値で埋める */
export function standings(file: WinratesFile, sim: SimOutput): StandingsView {
  const rows = TEAMS.map((team) => {
    const total = sim.expectedRegularPoints[team] + sim.expectedMastersPoints[team];
    return {
      team,
      name: TEAM_INFO[team].name,
      color: TEAM_INFO[team].color,
      petals: TEAM_INFO[team].petals,
      coreWL: wl(expectedWins(file, team, 'CORE')),
      nextWL: wl(expectedWins(file, team, 'NEXT')),
      masters: sim.expectedMastersPoints[team].toFixed(1),
      total: total.toFixed(1),
      totalNum: total,
      champion: (sim.championProbability[team] * 100).toFixed(1),
      championNum: sim.championProbability[team],
    };
  })
    .sort((x, y) => y.totalNum - x.totalNum || y.championNum - x.championNum)
    .map(({ totalNum: _t, championNum: _c, ...r }, i) => ({ no: i + 1, first: i === 0, ...r }));
  return { label: file.results ? '結果を反映' : '予想(開幕前)', rows };
}
