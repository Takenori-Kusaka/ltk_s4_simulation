// F-001 基準12・13: 入力の検証
import { MASTERS_CUPS, REGULAR_DAYS } from './schedule.ts';
import { TEAMS, TIERS } from './types.ts';
import type { TeamId, Tier } from './types.ts';

/** 階級ごとに 'A>B' のキーで A が B に1試合で勝つ確率。片方向だけあれば逆は 1-p */
export type WinTable = Record<Tier, Record<string, number>>;

export type MastersMatch = 'semi1' | 'semi2' | 'third' | 'final';
export type PlayoffMatch = 'upperFinal' | 'lowerSemi' | 'lowerFinal' | 'grandFinal';

export interface Results {
  regular?: { day: number; teams: [TeamId, TeamId]; tier: 'NEXT' | 'CORE'; winner: TeamId }[];
  masters?: { cup: number; match: MastersMatch; winner: TeamId }[];
  /** マッチ単位の勝者 */
  playoffs?: Partial<Record<PlayoffMatch, TeamId>>;
}

const isProb = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** 基準12: 値の範囲と、必要な全組の存在を確かめる。勝率を引く関数を返す */
export function validateWinTable(t: WinTable): (tier: Tier, a: TeamId, b: TeamId) => number {
  for (const tier of TIERS) {
    const row = t[tier] ?? {};
    for (const [k, v] of Object.entries(row)) {
      if (!isProb(v)) throw new Error(`勝率表 ${tier} の ${k.replace('>', ' vs ')} の値 ${String(v)} が 0〜1 の数値ではない`);
    }
    for (const a of TEAMS) for (const b of TEAMS) {
      if (a < b && row[`${a}>${b}`] === undefined && row[`${b}>${a}`] === undefined) {
        throw new Error(`勝率表 ${tier} に ${a} vs ${b} の勝率が無い`);
      }
    }
  }
  return (tier, a, b) => {
    const row = t[tier];
    const direct = row[`${a}>${b}`];
    return direct !== undefined ? direct : 1 - row[`${b}>${a}`];
  };
}

/** 全組を同じ勝率にした表(テストと初期値用) */
export function uniformWinTable(p: number): WinTable {
  const t = {} as WinTable;
  for (const tier of TIERS) {
    t[tier] = {};
    for (const a of TEAMS) for (const b of TEAMS) if (a < b) t[tier][`${a}>${b}`] = p;
  }
  return t;
}

/** 基準13: 結果が日程にある対戦を指すかを確かめる */
export function validateResults(r: Results): void {
  for (const x of r.regular ?? []) {
    const day = REGULAR_DAYS.find((d) => d.day === x.day);
    const key = [...x.teams].sort().join();
    const card = day?.cards.find((c) => [c.blue, c.red].sort().join() === key);
    if (!card || !x.teams.includes(x.winner) || (x.tier !== 'NEXT' && x.tier !== 'CORE')) {
      throw new Error(`RS の結果 day ${x.day} ${x.teams.join(' vs ')} ${x.tier} 勝者 ${x.winner} が日程に無い`);
    }
  }
  for (const x of r.masters ?? []) {
    const cup = MASTERS_CUPS.find((c) => c.cup === x.cup);
    const pool: readonly TeamId[] | undefined =
      x.match === 'semi1' ? cup?.semis[0] : x.match === 'semi2' ? cup?.semis[1] : cup ? TEAMS : undefined;
    if (!pool || !pool.includes(x.winner)) {
      throw new Error(`MASTERS CUP の結果 cup ${x.cup} ${x.match} 勝者 ${x.winner} が日程に無い`);
    }
  }
  for (const [m, w] of Object.entries(r.playoffs ?? {})) {
    if (!(TEAMS as readonly string[]).includes(w as string)) throw new Error(`Playoffs の結果 ${m} 勝者 ${String(w)} がチームではない`);
  }
}
