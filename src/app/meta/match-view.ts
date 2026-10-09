// F-011 Task-5: 選手との突き合わせの表示の論理(受入基準 7・8)。DOM に依存しない
// 計算は src/meta/match.ts(Task-3)。ここでは画面に出す形にする
import { ROLES, type MetaGuide, type MetaRole, type MetaTier } from '../../meta/load.ts';
import { MIN_GAMES, playersForChampion, poolsFromRatings, topMetaPlayers } from '../../meta/match.ts';

type RatingsLike = Parameters<typeof poolsFromRatings>[0];

export interface TopRow {
  playerId: string;
  name: string;
  /** 例: CC CORE */
  teamTier: string;
  points: number;
  championsText: string;
  href: string;
}
export interface ChampionChip {
  key: number;
  name: string;
  tier: MetaTier;
  /** そのチャンピオンを得意ピックに持つ選手の数 */
  playerCount: number;
}
export interface SelectedChampion {
  key: number;
  name: string;
  tier: MetaTier;
  roleLabel: MetaRole;
  players: { playerId: string; name: string; teamTier: string; games: number; winRateText: string; href: string }[];
  emptyText: string;
}
export interface MetaMatchView {
  /** 評価のファイルがあるか */
  available: boolean;
  notice: string | null;
  roles: { role: MetaRole; top: TopRow[]; emptyText: string; champions: ChampionChip[] }[];
  selected: SelectedChampion | null;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** 基準7・8。selectedKey はメタの一覧の数値の key(選んだチャンピオン) */
export function metaMatchView(guide: MetaGuide, ratings: RatingsLike, selectedKey?: number): MetaMatchView {
  const pools = poolsFromRatings(ratings);
  const available = !!ratings && pools.length > 0;
  const roles = ROLES.map((role) => ({
    role,
    top: topMetaPlayers(guide, pools, role).map((p) => ({
      playerId: p.playerId,
      name: p.name,
      teamTier: `${p.team} ${p.tier}`,
      points: p.points,
      championsText: p.champions.map((c) => `${c.name}(${c.tier}・${c.games} 試合)`).join('、'),
      href: p.href,
    })),
    emptyText: available ? 'メタに合う得意ピックを持つ選手はいない' : 'データなし',
    champions: guide.champions
      .filter((c) => c.role === role)
      .map((c) => ({ key: c.key, name: c.name, tier: c.tier, playerCount: playersForChampion(c, pools).length })),
  }));
  const champ = selectedKey === undefined ? undefined : guide.champions.find((c) => c.key === selectedKey);
  const selected: SelectedChampion | null = champ
    ? {
        key: champ.key,
        name: champ.name,
        tier: champ.tier,
        roleLabel: champ.role,
        players: playersForChampion(champ, pools).map((p) => ({
          playerId: p.playerId,
          name: p.name,
          teamTier: `${p.team} ${p.tier}`,
          games: p.games,
          winRateText: pct(p.winRate),
          href: p.href,
        })),
        emptyText: available
          ? `このチャンピオンを大会のロールで ${MIN_GAMES} 試合以上使った選手はいない`
          : '評価のファイルが無いため、データなし',
      }
    : null;
  return {
    available,
    notice: available ? null : '評価のファイルが無いため、選手との突き合わせはデータなし',
    roles,
    selected,
  };
}
