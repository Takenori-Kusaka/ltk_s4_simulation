// F-014 Task-3: 推しチーム・推し選手の視点の論理(基準 14〜18)。DOM に依存しない。
// 計算は足さない(勝率は F-005 の winrates.json の matches、見通しは F-001 のシミュレーション。期待勝ち数だけ勝率の和で作る)
import { MASTERS_CUPS, REGULAR_DAYS } from '../../sim/schedule.ts';
import { TEAMS, type SimOutput, type TeamId, type Tier } from '../../sim/index.ts';
import { ROSTER, type Player } from '../../data/roster.ts';
import { TEAM_INFO } from '../lib/index.ts';
import { nextOpponent, opponentCompareHref } from '../compare/opponent.ts';
import type { MatchPrior } from '../../winrate/core.ts';
import type { WinratesFile } from '../sim/view.ts';
import { dateLabel, dayBox, jstDate, standings, type DayBoxView, type DayRef } from './view.ts';

/** 用語「階級チームの試合の一覧」の 1 行 */
export interface TeamMatchRow {
  tier: Tier;
  /** "DAY 1" / "MASTERS CUP 1" */
  label: string;
  date: string;
  /** "10/15 THU" */
  dateLabel: string;
  opponent: TeamId;
  opponentName: string;
  opponentColor: string;
  /** MASTERS CUP の準決勝はサイドを持たない */
  side: 'BLUE' | 'RED' | null;
  /** そのチームの勝率(0.1% 単位の文字列) */
  p: string;
  pNum: number;
  dataMissing: string | null;
}

export interface TierMatchesView {
  tier: Tier;
  rows: TeamMatchRow[];
  /** 期待勝ち数(勝率の和 ÷ 100。小数第一位) */
  expected: string;
  expectedNum: number;
}

const MISSING = '勝率表にこの試合が無い';

function matchRow(tier: Tier, label: string, date: string, team: TeamId, opponent: TeamId, side: TeamMatchRow['side'], m: MatchPrior | undefined): TeamMatchRow {
  const p = m ? (m.a === team ? m.pA : m.pB) : 50;
  return {
    tier,
    label,
    date,
    dateLabel: dateLabel(date),
    opponent,
    opponentName: TEAM_INFO[opponent].name,
    opponentColor: TEAM_INFO[opponent].color,
    side,
    p: p.toFixed(1),
    pNum: p,
    dataMissing: m ? m.dataMissing : MISSING,
  };
}

/**
 * 基準14(b)・15(c)・13: NEXT・CORE は Regular Stage の 6 試合(Day・相手・サイド・勝率)、MASTERS は MASTERS CUP の準決勝 3 試合(日・相手・勝率)。
 * 勝率は matches の pA・pB そのもの。期待勝ち数は勝率表にある試合の勝率の和(順位表の expectedWins と同じ数え方)
 */
export function tierTeamMatches(file: WinratesFile, team: TeamId, tier: Tier): TierMatchesView {
  const rows: TeamMatchRow[] = [];
  let sum = 0;
  const push = (row: TeamMatchRow, m: MatchPrior | undefined) => {
    rows.push(row);
    if (m) sum += row.pNum;
  };
  if (tier === 'MASTERS') {
    for (const cup of MASTERS_CUPS) {
      const semi = cup.semis.find((s) => s.includes(team));
      if (!semi) continue;
      const [a, b] = semi;
      const m = file.matches.find((x) => x.stage === 'masters' && x.cup === cup.cup && x.a === a && x.b === b);
      push(matchRow(tier, `MASTERS CUP ${cup.cup}`, cup.date, team, a === team ? b : a, null, m), m);
    }
  } else {
    for (const day of REGULAR_DAYS) {
      const card = day.cards.find((c) => c.blue === team || c.red === team);
      if (!card) continue;
      const m = file.matches.find((x) => x.stage === 'regular' && x.day === day.day && x.tier === tier && x.a === card.blue && x.b === card.red);
      const blue = card.blue === team;
      push(matchRow(tier, `DAY ${day.day}`, day.date, team, blue ? card.red : card.blue, blue ? 'BLUE' : 'RED', m), m);
    }
  }
  rows.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
  return { tier, rows, expected: (sum / 100).toFixed(1), expectedNum: sum / 100 };
}

/** 基準14(a): その日の箱(dayBox)から、そのチームのカードだけを残す。ブルー・レッドの配置は公式のまま。M3・M4 の箱は残す */
export function teamDayBox(file: WinratesFile, team: TeamId, ref: DayRef): DayBoxView {
  const box = dayBox(file, ref);
  return { ...box, boxes: box.boxes.filter((b) => b.rows.some((r) => r.blue.team === team || r.red.team === team)) };
}

export interface TeamOutlookView {
  /** 優勝確率(0.1% 単位) */
  champion: string;
  championNum: number;
  /** シード 1〜4 位の確率(0.1% 単位) */
  seeds: string[];
  seedNums: number[];
  /** 順位表(基準4)での予想の順位 */
  rank: number;
  /** 期待 pt の和(順位表の TOTAL) */
  total: string;
}

/** 基準14(c)・13: 優勝確率・シード 1〜4 位の確率(F-001 の出力を丸める)と、順位表での予想の順位 */
export function teamOutlook(file: WinratesFile, sim: SimOutput, team: TeamId): TeamOutlookView {
  const row = standings(file, sim).rows.find((r) => r.team === team)!;
  const seedNums = sim.seedProbability[team].map((p) => p * 100);
  return {
    champion: (sim.championProbability[team] * 100).toFixed(1),
    championNum: sim.championProbability[team] * 100,
    seeds: seedNums.map((p) => p.toFixed(1)),
    seedNums,
    rank: row.no,
    total: row.total,
  };
}

/**
 * 基準15(a): 選手の階級チームの直近の試合。閲覧日(JST)以降で最初の試合(試合日の当日はその日。F-008 の nextOpponent と同じ日の決め方なので、
 * 対面の選手(基準15(b))と同じ試合を指す)。NEXT・CORE は Regular Stage、MASTERS は準決勝。残っていなければ null
 */
export function playerNext(file: WinratesFile, player: Player, now: Date = new Date()): TeamMatchRow | null {
  const today = jstDate(now);
  return tierTeamMatches(file, player.team, player.tier).rows.find((r) => r.date >= today) ?? null;
}

export interface FacingView {
  id: string;
  name: string;
  team: TeamId;
  date: string;
  /** 比較ページ(F-008)の URL */
  href: string;
}

/** 基準15(b): 直近の試合の対面の選手(F-008 の nextOpponent)と、その選手との比較ページへのリンク。試合が残っていなければ null */
export function facing(player: Player, now: Date = new Date()): FacingView | null {
  const o = nextOpponent(player.id, jstDate(now));
  const href = opponentCompareHref(player.id, now);
  if (!o || !href) return null;
  return { id: o.opponentId, name: ROSTER.find((p) => p.id === o.opponentId)?.name ?? o.opponentId, team: o.team as TeamId, date: o.date, href };
}

/** 基準16: 推しチームの保存先のキー(そのブラウザの localStorage) */
export const FAVORITE_KEY = 'ltk-favorite-team';

/** 保存先(localStorage と同じ 3 つの操作。テストでは差し替える) */
export interface FavoriteStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const isTeam = (v: unknown): v is TeamId => typeof v === 'string' && (TEAMS as readonly string[]).includes(v);

/** 基準16: 保存した推しチーム。無い・不正な値・storage が使えないときは null */
export function readFavorite(storage: FavoriteStorage | null | undefined): TeamId | null {
  try {
    const v = storage?.getItem(FAVORITE_KEY);
    return isTeam(v) ? v : null;
  } catch {
    return null;
  }
}

/** 基準16・17: 推しチームを保存する(null で解除)。保存先は渡した storage だけで、外部へは送らない。storage が使えなければ何もしない */
export function writeFavorite(storage: FavoriteStorage | null | undefined, team: TeamId | null): void {
  try {
    if (isTeam(team)) storage?.setItem(FAVORITE_KEY, team);
    else storage?.removeItem(FAVORITE_KEY);
  } catch {
    // localStorage が無効(プライベートモード・容量超過)のときは、画面の中の選択だけが残る
  }
}
