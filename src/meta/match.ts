// F-011 Task-3: 選手との突き合わせ(受入基準 7・8)。DOM と Node 固有の API に依存しない
// ピックプールは F-009 の評価のファイル(ratings.json)の pool 軸の poolDetail を使う。
// poolDetail は直近 120 日の評価の試合のうち大会のロールの試合だけ・チャンピオンごと3試合以上で、
// 勝率は (勝ち数 + 2.5) / (試合数 + 5) に縮小済み(src/rating/axes.ts)。数値の championId はメタの一覧の key と同じ Data Dragon の値
import { ROSTER } from '../data/roster.ts';
import type { MetaChampion, MetaGuide, MetaRole } from './load.ts';

/** ピックプールの条件: チャンピオンごとの最小の試合数 */
export const MIN_GAMES = 3;
/** 基準8 の点数 */
export const TIER_POINTS: Record<MetaChampion['tier'], number> = { A: 2, B: 1 };

export interface PoolEntry {
  championId: number;
  games: number;
  /** 縮小した勝率 */
  winRate: number;
}
export interface PlayerPool {
  playerId: string;
  name: string;
  team: string;
  tier: string;
  role: MetaRole;
  list: PoolEntry[];
}

const ORDER = new Map(ROSTER.map((p, i) => [p.id, i]));
const rosterOrder = (a: { playerId: string }, b: { playerId: string }) => (ORDER.get(a.playerId) ?? 0) - (ORDER.get(b.playerId) ?? 0);

interface RatingsLike {
  players: { playerId: string; axes: { key: string; data?: { poolDetail?: { list: PoolEntry[] } } }[] }[];
}

/** 評価のファイルから選手ごとのピックプールを取り出す。名簿に無い選手とピックプールの軸が無い選手は除く */
export function poolsFromRatings(file: RatingsLike | undefined): PlayerPool[] {
  return (file?.players ?? []).flatMap((p) => {
    const r = ROSTER.find((x) => x.id === p.playerId);
    const detail = p.axes.find((a) => a.key === 'pool')?.data?.poolDetail;
    if (!r || !detail) return [];
    return [{ playerId: r.id, name: r.name, team: r.team, tier: r.tier, role: r.role, list: detail.list }];
  });
}

export interface ChampionPlayer {
  playerId: string;
  name: string;
  team: string;
  tier: string;
  role: MetaRole;
  games: number;
  winRate: number;
  href: string;
}

/** 基準7: そのチャンピオンを、メタの一覧のロールで得意ピックに持つ選手。試合数の多い順、同じなら勝率の高い順、それも同じなら名簿の順 */
export function playersForChampion(champ: MetaChampion, pools: readonly PlayerPool[]): ChampionPlayer[] {
  return pools
    .filter((p) => p.role === champ.role)
    .flatMap((p) => {
      const e = p.list.find((x) => x.championId === champ.key && x.games >= MIN_GAMES);
      return e ? [{ playerId: p.playerId, name: p.name, team: p.team, tier: p.tier, role: p.role, games: e.games, winRate: e.winRate, href: `#/player/${p.playerId}` }] : [];
    })
    .sort((a, b) => b.games - a.games || b.winRate - a.winRate || rosterOrder(a, b));
}

export interface MetaPlayer {
  playerId: string;
  name: string;
  team: string;
  tier: string;
  points: number;
  /** 合計に数えたチャンピオン(メタの一覧の順) */
  champions: { name: string; tier: MetaChampion['tier']; games: number; winRate: number }[];
  href: string;
}

/** 基準8: ロールごとに、メタに合う得意ピック(段階A 2 点・段階B 1 点)の合計の上位 n 名。0 点の選手は除き、同点は名簿の順 */
export function topMetaPlayers(guide: MetaGuide, pools: readonly PlayerPool[], role: MetaRole, n = 3): MetaPlayer[] {
  const meta = guide.champions.filter((c) => c.role === role);
  return pools
    .filter((p) => p.role === role)
    .map((p): MetaPlayer => {
      const champions = meta.flatMap((c) => {
        const e = p.list.find((x) => x.championId === c.key && x.games >= MIN_GAMES);
        return e ? [{ name: c.name, tier: c.tier, games: e.games, winRate: e.winRate }] : [];
      });
      return {
        playerId: p.playerId, name: p.name, team: p.team, tier: p.tier,
        points: champions.reduce((s, c) => s + TIER_POINTS[c.tier], 0),
        champions, href: `#/player/${p.playerId}`,
      };
    })
    .filter((x) => x.points > 0)
    .sort((a, b) => b.points - a.points || rosterOrder(a, b))
    .slice(0, n);
}
