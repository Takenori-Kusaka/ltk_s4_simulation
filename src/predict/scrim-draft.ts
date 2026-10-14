// F-006 Task-6: スクリムの BAN・ピックの記録 draft の集計(受入基準 13)。相手からの BAN 数 b・スクリムの試合数 n_s・順のある試合数 n_o
// 受け付けた記録(F-004 の読み込みの games。リスナー参加と重複は除かれている)のうち、スクリムだけを数える
import type { MatchResult, TierTeamId } from '../results/types.ts';
import { championKeyOf, type ChampionList } from '../results/champions.ts';
import { ROSTER } from '../data/roster.ts';

export interface ScrimDraftCount { champion: string; championId: number | null; count: number }

export interface ScrimDraft {
  /** n_s: BAN の要素を 1 つ以上含む draft を持つ試合の数 */
  games: number;
  /** n_o: order が null でない draft を持つ試合の数 */
  ordered: number;
  /** b: 相手チームがこの階級チームの試合で BAN した回数(回数の降順、同数は名前の文字コード順) */
  bannedBy: ScrimDraftCount[];
  /** この階級チームが BAN した回数(基準15 の表示の材料) */
  bans: ScrimDraftCount[];
  /** 順のある試合の、この階級チームの最初のピック(PICK のうち order の最も小さいもの)の回数(基準15 の表示の材料) */
  firstPicks: ScrimDraftCount[];
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function counted(names: readonly string[], champions: ChampionList | null | undefined): ScrimDraftCount[] {
  const n = new Map<string, number>();
  for (const x of names) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()]
    .sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))
    .map(([champion, count]) => ({ champion, championId: championKeyOf(champions, champion), count }));
}

/** 階級チーム team の集計。draft を持つスクリムの記録が無ければ null */
export function scrimDraftOf(games: readonly MatchResult[], team: string, champions?: ChampionList | null): ScrimDraft | null {
  const drafts = games.filter((g) => g.kind === 'scrim' && g.draft && g.teams.includes(team as TierTeamId)).map((g) => g.draft!);
  if (drafts.length === 0) return null;
  const banned: string[] = [];
  const own: string[] = [];
  const first: string[] = [];
  let withBan = 0;
  let ordered = 0;
  for (const d of drafts) {
    if (d.some((x) => x.type === 'BAN')) withBan += 1;
    for (const x of d) {
      if (x.type !== 'BAN' || x.champion === null) continue;
      (x.team === team ? own : banned).push(x.champion);
    }
    if (d.every((x) => x.order !== null)) {
      ordered += 1;
      const picks = d.filter((x) => x.type === 'PICK' && x.team === team).sort((a, b) => a.order! - b.order!);
      if (picks[0]?.champion) first.push(picks[0].champion);
    }
  }
  return { games: withBan, ordered, bannedBy: counted(banned, champions), bans: counted(own, champions), firstPicks: counted(first, champions) };
}

/** 名簿の全階級チームの集計(予想の出力の scrimDraft) */
export function scrimDraftByTeam(games: readonly MatchResult[], champions?: ChampionList | null): Record<string, ScrimDraft | null> {
  const teams = [...new Set(ROSTER.map((r) => `${r.team}-${r.tier}`))];
  return Object.fromEntries(teams.map((t) => [t, scrimDraftOf(games, t, champions)]));
}
