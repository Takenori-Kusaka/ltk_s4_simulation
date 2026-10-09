// F-006 Task-2: F-005 基準14 が読む、NEXT の試合ごとの予想ピックとプロテクト候補(受入基準 9)
import { loadPickConfig, pickCandidates, type PickConfig } from './picks.ts';
import { protectCandidates } from './protect.ts';
import { poolsFromRatings } from '../meta/match.ts';
import type { MetaGuide } from '../meta/load.ts';
import { ROSTER } from '../data/roster.ts';
import { REGULAR_DAYS } from '../sim/schedule.ts';

export const NEXT_DRAFT_KIND = 'next-draft-forecast';

export interface NextDraftTeam {
  team: string;
  /** 各選手の予想ピック(見込みの値の1位)の key。ロールの順(TOP・JG・MID・ADC・SUP)、候補の無い選手は除く */
  picks: number[];
  /** プロテクト候補の key(プロテクトの値の降順) */
  protects: number[];
}

export interface NextDraftForecast {
  kind: typeof NEXT_DRAFT_KIND;
  matches: { matchId: string; date: string; teams: NextDraftTeam[] }[];
}

const ROLE_ORDER = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];

/** Regular Stage の NEXT の全試合(日程の左がブルー)。試合の識別は RS-<日>-<ブルー>-<レッド>-NEXT */
export function nextDraftForecast(ratings: Parameters<typeof poolsFromRatings>[0], guide: MetaGuide, cfg: PickConfig = loadPickConfig()): NextDraftForecast {
  const pools = new Map(poolsFromRatings(ratings).map((p) => [p.playerId, p]));
  const teamOf = (team: string): NextDraftTeam => {
    const members = ROSTER.filter((r) => r.team === team && r.tier === 'NEXT')
      .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
      .flatMap((r) => (pools.has(r.id) ? [pools.get(r.id)!] : []));
    const picks = members.flatMap((p) => pickCandidates(p, guide, cfg).candidates.slice(0, 1).map((c) => c.championId));
    const protects = protectCandidates(members, guide, cfg).protects.map((p) => p.championId);
    return { team, picks, protects };
  };
  return {
    kind: NEXT_DRAFT_KIND,
    matches: REGULAR_DAYS.flatMap((d) =>
      d.cards.map((c) => ({ matchId: `RS-${d.day}-${c.blue}-${c.red}-NEXT`, date: d.date, teams: [teamOf(c.blue), teamOf(c.red)] })),
    ),
  };
}
