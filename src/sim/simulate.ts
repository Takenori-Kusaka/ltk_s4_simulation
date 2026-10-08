// F-001 基準9〜11・15・16: モンテカルロによるシード確率と優勝確率
import { MASTERS_CUPS, REGULAR_DAYS } from './schedule.ts';
import { computeSeeds, mastersCupPoints, scoreRegularCard } from './standings.ts';
import type { Tiebreak } from './standings.ts';
import { runPlayoffs } from './playoffs.ts';
import type { TierPolicy, TierProb } from './playoffs.ts';
import { createRng } from './rng.ts';
import { validateResults, validateWinTable } from './validate.ts';
import type { PlayoffMatch, Results, WinTable } from './validate.ts';
import { TEAMS } from './types.ts';
import type { TeamId, Tier } from './types.ts';

export interface SimInput {
  winTable: WinTable;
  /** 基準16: ステージ別の勝率表。無いステージは winTable を使う */
  stageWinTables?: { regular?: WinTable; masters?: WinTable; playoffs?: WinTable };
  results?: Results;
  /** 既定 10,000 */
  trials?: number;
  seed: number;
  tiebreak?: Tiebreak;
  playoffPolicy?: TierPolicy;
  /** 基準15: 階級ごとのブルーサイド補正(対数オッズへ加える値)。RS だけに適用 */
  blueSideBias?: Partial<Record<Tier, number>>;
}

export interface SimOutput {
  trials: number;
  /** チームごとのシード1〜4位の確率 */
  seedProbability: Record<TeamId, number[]>;
  championProbability: Record<TeamId, number>;
  expectedRegularPoints: Record<TeamId, number>;
  expectedMastersPoints: Record<TeamId, number>;
  /** 使われた同点処理と、その試行の回数 */
  tiebreakUsed: Record<string, number>;
}

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const zero = () => Object.fromEntries(TEAMS.map((t) => [t, 0])) as Record<TeamId, number>;
const PO_ORDER: PlayoffMatch[] = ['upperFinal', 'lowerSemi', 'lowerFinal', 'grandFinal'];

export function simulate(input: SimInput): SimOutput {
  const trials = input.trials ?? 10000;
  const prob = {
    regular: validateWinTable(input.stageWinTables?.regular ?? input.winTable),
    masters: validateWinTable(input.stageWinTables?.masters ?? input.winTable),
    playoffs: validateWinTable(input.stageWinTables?.playoffs ?? input.winTable),
  };
  const results = input.results ?? {};
  validateResults(results);
  // 基準15・16: ステージごとに乱数の列を分け、あるステージの入力が他のステージの乱数を動かさないようにする
  const rngRs = createRng(input.seed);
  const rngMc = createRng(input.seed ^ 0x9e3779b9);
  const rngPo = createRng(input.seed ^ 0x85ebca6b);
  const rngTie = createRng(input.seed ^ 0xc2b2ae35);

  const seedCount = Object.fromEntries(TEAMS.map((t) => [t, [0, 0, 0, 0]])) as Record<TeamId, number[]>;
  const champ = zero();
  const rsSum = zero();
  const mcSum = zero();
  const tiebreakUsed: Record<string, number> = {};

  const rsWinner = (day: number, blue: TeamId, red: TeamId, tier: 'NEXT' | 'CORE'): TeamId => {
    const fixed = results.regular?.find((x) => x.day === day && x.tier === tier && x.teams.includes(blue) && x.teams.includes(red));
    const r = rngRs(); // 確定の有無に依らず1つ消費し、乱数の列をそろえる
    if (fixed) return fixed.winner;
    let p = prob.regular(tier, blue, red);
    const bias = input.blueSideBias?.[tier] ?? 0;
    if (bias !== 0 && p > 0 && p < 1) p = sigmoid(logit(p) + bias);
    return r < p ? blue : red;
  };
  const mcGame = (cup: number, match: string, a: TeamId, b: TeamId, bo3: boolean): TeamId => {
    const fixed = results.masters?.find((x) => x.cup === cup && x.match === match);
    const r = [rngMc(), rngMc(), rngMc()];
    if (fixed) return fixed.winner;
    const p = prob.masters('MASTERS', a, b);
    if (!bo3) return r[0] < p ? a : b;
    // 決勝は BO3(2勝先取)
    const wins = (r[0] < p ? 1 : 0) + (r[1] < p ? 1 : 0);
    if (wins !== 1) return wins === 2 ? a : b;
    return r[2] < p ? a : b;
  };

  for (let i = 0; i < trials; i++) {
    const rs = zero();
    const h2h: Record<string, number> = {};
    for (const d of REGULAR_DAYS) for (const c of d.cards) {
      const pts = scoreRegularCard(c, rsWinner(d.day, c.blue, c.red, 'NEXT'), rsWinner(d.day, c.blue, c.red, 'CORE'));
      for (const [t, v] of Object.entries(pts) as [TeamId, number][]) {
        rs[t] += v;
        const o = t === c.blue ? c.red : c.blue;
        h2h[`${t}>${o}`] = (h2h[`${t}>${o}`] ?? 0) + v;
      }
    }
    const mc = zero();
    for (const cup of MASTERS_CUPS) {
      const [s1, s2] = cup.semis;
      const w1 = mcGame(cup.cup, 'semi1', s1[0], s1[1], false);
      const w2 = mcGame(cup.cup, 'semi2', s2[0], s2[1], false);
      const l1 = w1 === s1[0] ? s1[1] : s1[0];
      const l2 = w2 === s2[0] ? s2[1] : s2[0];
      const third = mcGame(cup.cup, 'third', l1, l2, false);
      const final = mcGame(cup.cup, 'final', w1, w2, true);
      const pts = mastersCupPoints({ semis: cup.semis, semiWinners: [w1, w2], thirdPlaceWinner: third, finalWinner: final });
      for (const [t, v] of Object.entries(pts) as [TeamId, number][]) mc[t] += v;
    }
    const seeds = computeSeeds(
      TEAMS.map((t) => ({ team: t, rs: rs[t], mc: mc[t] })),
      { tiebreak: input.tiebreak, headToHead: h2h, rng: rngTie },
    );
    if (seeds.tiebreakUsed) tiebreakUsed[seeds.tiebreakUsed] = (tiebreakUsed[seeds.tiebreakUsed] ?? 0) + 1;
    seeds.order.forEach((t, s) => seedCount[t][s]++);
    for (const t of TEAMS) {
      rsSum[t] += rs[t];
      mcSum[t] += mc[t];
    }
    // Playoffs はマッチを UF・LS・LF・GF の順に呼ぶ。確定したマッチは勝者の勝率を 1 にして結果どおりにする
    let call = 0;
    const probOf = (high: TeamId, low: TeamId): TierProb => {
      const fixedWinner = results.playoffs?.[PO_ORDER[call++]];
      if (fixedWinner === high || fixedWinner === low) {
        const v = fixedWinner === high ? 1 : 0;
        return { NEXT: v, CORE: v, MASTERS: v };
      }
      return { NEXT: prob.playoffs('NEXT', high, low), CORE: prob.playoffs('CORE', high, low), MASTERS: prob.playoffs('MASTERS', high, low) };
    };
    champ[runPlayoffs(seeds.order, probOf, rngPo, input.playoffPolicy).champion]++;
  }
  const norm = (v: number) => v / trials;
  const per = (rec: Record<TeamId, number>) => Object.fromEntries(TEAMS.map((t) => [t, norm(rec[t])])) as Record<TeamId, number>;
  return {
    trials,
    seedProbability: Object.fromEntries(TEAMS.map((t) => [t, seedCount[t].map(norm)])) as Record<TeamId, number[]>,
    championProbability: per(champ),
    expectedRegularPoints: per(rsSum),
    expectedMastersPoints: per(mcSum),
    tiebreakUsed,
  };
}
