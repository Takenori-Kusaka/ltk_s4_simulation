// F-008 Task-3: 比較の入口と、次に当たる対面の解決(受入基準 15〜17)。DOM に依存しない
import { ROSTER } from '../../data/roster.ts';
import { MASTERS_CUPS, REGULAR_DAYS } from '../../sim/schedule.ts';
import { TEAMS, TIERS } from '../../sim/types.ts';
import { compareHref, compareStartHref } from '../lib/index.ts';

/** 基準15: 基準日 = 閲覧した日の日本時間の日付(YYYY-MM-DD) */
export function jstDate(now: Date): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * 基準15・16: 基準日以降で最初の試合日(基準日が試合日ならその日。価値責任者の決定 2026-10-09)の相手チームの、
 * 同じ階級・同じロールの選手。NEXT・CORE は Regular Stage の日程、MASTERS は MASTERS CUP の準決勝の組み合わせから決める。
 * 試合日が無ければ null
 */
export function nextOpponent(playerId: string, today: string): { opponentId: string; team: string; date: string } | null {
  const p = ROSTER.find((x) => x.id === playerId);
  if (!p) return null;
  const pairs: { date: string; teams: readonly string[] }[] =
    p.tier === 'MASTERS'
      ? MASTERS_CUPS.flatMap((c) => c.semis.map((s) => ({ date: c.date, teams: s })))
      : REGULAR_DAYS.flatMap((d) => d.cards.map((c) => ({ date: d.date, teams: [c.blue, c.red] })));
  const next = pairs
    .filter((x) => x.date >= today && x.teams.includes(p.team))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!next) return null;
  const team = next.teams.find((t) => t !== p.team)!;
  return { opponentId: `${team}-${p.tier}-${p.role}`, team, date: next.date };
}

/** 基準15・16: 「対面と比較」の URL。出さない場合は null */
export function opponentCompareHref(playerId: string, now: Date): string | null {
  const o = nextOpponent(playerId, jstDate(now));
  return o ? compareHref([playerId, o.opponentId]) : null;
}

/** 基準17b: 同じ階級・同じロールの4チームの4人を、チームの順(DD・CC・IT・LR)で並べた比較の URL。名簿に無い選手は null */
export function sameRoleAllHref(playerId: string): string | null {
  const p = ROSTER.find((x) => x.id === playerId);
  return p ? compareHref(TEAMS.map((t) => `${t}-${p.tier}-${p.role}`)) : null;
}

/** 基準17c: 同じ階級の4つの階級チームを、チームの順(DD・CC・IT・LR)で並べた比較の URL */
export function tierAllHref(tier: string): string {
  return compareHref(TEAMS.map((t) => `${t}-${tier}`));
}

/** 基準17: チームのページの「比較」の入口(チーム全体と各階級チーム) */
export function teamCompareEntries(team: string): { id: string; label: string; href: string }[] {
  return [team, ...TIERS.map((t) => `${team}-${t}`)].map((id) => ({
    id,
    label: id === team ? 'チーム全体' : id.split('-')[1],
    href: compareStartHref(id),
  }));
}
