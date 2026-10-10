// F-013 Task-1: 勝率とシミュレーションの結果のページの論理(基準 1〜6・9)。計算は足さず、F-005 の勝率表と F-001 の simulate の出力を丸めて表にする
// F-005 Task-3(基準9): 模擬には試合日ごとの勝率表(Regular Stage の日・MASTERS CUP のカップ)と、Playoffs の初日までの仕上がりを加えた表を渡す
import type { WinrateOutput } from '../../winrate/core.ts';
import { dayWinrate, percentPair, PLAYOFFS_DATE } from '../../winrate/dynamics.ts';
import { MASTERS_CUPS, REGULAR_DAYS } from '../../sim/schedule.ts';
import { simulate, TEAMS, TIERS, type SimOutput, type TeamId, type Tier, type WinTable } from '../../sim/index.ts';
import { TEAM_INFO } from '../lib/index.ts';

/** 固定の種と試行の数(仕様の用語) */
export const SIM_SEED = 20261015;
export const SIM_TRIALS = 10000;

/** data/public/winrates.json(F-005 Task-1 の出力に計算日時と版が付いたもの) */
export interface WinratesFile extends WinrateOutput {
  computedAt: string;
  configVersion: string;
  /** 結果の入力(F-004)。無い間は null */
  results: unknown;
}

export interface TeamRowView {
  team: TeamId;
  name: string;
  color: string;
  /** 小数第二位まで。計算できなければ「—」 */
  S: string;
  reason: string | null;
}

export interface PairRowView {
  a: TeamId;
  b: TeamId;
  /** 0.1% 単位の文字列(例 "43.5") */
  pA: string;
  pB: string;
  dataMissing: string | null;
}

export interface TierTableView {
  tier: Tier;
  beta: string;
  betaBasis: string;
  teams: TeamRowView[];
  pairs: PairRowView[];
}

export interface SimRowView {
  team: TeamId;
  name: string;
  color: string;
  /** シード1〜4位の確率(0.1% 単位) */
  seed: string[];
  champion: string;
  expectedRegular: string;
  expectedMasters: string;
}

export interface SimView {
  rows: SimRowView[];
  seed: number;
  trials: number;
  computedAt: string;
  tiebreak: [string, number][];
}

const pct = (p: number) => (p * 100).toFixed(1);

/** 基準4: ファイルが無い、または kind が winrates でないときの表示。問題なければ null */
export function noDataNotice(file: unknown): string | null {
  const ok = !!file && typeof file === 'object' && (file as { kind?: unknown }).kind === 'winrates';
  return ok ? null : '勝率のデータがありません。集計のコマンド(node src/collect/aggregate-cli.ts)を実行して data/public/winrates.json を作ってください';
}

/** 基準1・5・9: 階級ごとの S・β と、6組の事前の勝率(ステージ補正なしの winTable から) */
export function tierTables(file: WinratesFile): TierTableView[] {
  return TIERS.map((tier) => {
    const teams: TeamRowView[] = TEAMS.map((team) => {
      const row = file.teams.find((t) => t.team === team && t.tier === tier);
      const S = row?.S ?? null;
      return { team, name: TEAM_INFO[team].name, color: TEAM_INFO[team].color, S: S === null ? '—' : S.toFixed(2), reason: row?.reason ?? 'F-010 の計算が無い' };
    }).map((r) => ({ ...r, reason: r.S === '—' ? r.reason : null }));
    const pairs: PairRowView[] = [];
    for (const a of TEAMS) {
      for (const b of TEAMS) {
        if (!(a < b)) continue;
        const p = file.winTable[tier][`${a}>${b}`];
        const missing = teams.filter((t) => (t.team === a || t.team === b) && t.reason !== null);
        pairs.push({
          a, b, pA: pct(p), pB: pct(1 - p),
          dataMissing: missing.length ? `データ不足(${missing.map((t) => `${t.team}-${tier}: ${t.reason}`).join(' / ')})` : null,
        });
      }
    }
    return { tier, beta: file.beta[tier].toFixed(3), betaBasis: file.betaBasis[tier], teams, pairs };
  });
}

const stageTables = (file: WinratesFile) => file.stageWinTables ?? { regular: file.winTable, masters: file.winTable, playoffs: file.winTable };
/** 表の a>b の事前の勝率(片方向だけあれば 1 − 逆) */
const priorOf = (t: WinTable, tier: Tier, a: TeamId, b: TeamId): number => {
  const direct = t[tier]?.[`${a}>${b}`];
  return direct !== undefined ? direct : 1 - (t[tier]?.[`${b}>${a}`] ?? 0.5);
};
/** その日(date)の勝率表: tiers の階級はステージの表の各組にその日の仕上がりの項の差を加え(0.1% 単位)、ほかの階級はステージの表のまま */
function dayTable(file: WinratesFile, base: WinTable, date: string, tiers: readonly Tier[]): WinTable {
  const t = {} as WinTable;
  for (const tier of TIERS) {
    t[tier] = {};
    for (const a of TEAMS) {
      for (const b of TEAMS) {
        if (!(a < b)) continue;
        const prior = priorOf(base, tier, a, b);
        const w = tiers.includes(tier) ? dayWinrate(file.teams, tier, a, b, prior, date) : null;
        t[tier][`${a}>${b}`] = w && w.p !== prior ? percentPair(w.p)[0] / 100 : prior;
      }
    }
  }
  return t;
}

/** F-005 基準9: 試合日ごとの勝率表。Regular Stage は日ごと(NEXT・CORE)、MASTERS CUP はカップごと(MASTERS)。仕上がりの無い勝率表ではステージの表と同じ */
export function dayWinTables(file: WinratesFile): { regular: Record<number, WinTable>; masters: Record<number, WinTable> } {
  const stage = stageTables(file);
  return {
    regular: Object.fromEntries(REGULAR_DAYS.map((d) => [d.day, dayTable(file, stage.regular, d.date, ['NEXT', 'CORE'])])),
    masters: Object.fromEntries(MASTERS_CUPS.map((c) => [c.cup, dayTable(file, stage.masters, c.date, ['MASTERS'])])),
  };
}

/** F-005 基準9: Playoffs の勝率表。初日(11/21)までに戦った試合日の数で仕上がりを加える */
export function playoffWinTable(file: WinratesFile): WinTable {
  return dayTable(file, stageTables(file).playoffs, PLAYOFFS_DATE, TIERS);
}

/** 基準2: F-001 の simulate を固定の種・試行の数で実行する(結果の入力が無い間は results を渡さない)。試合日ごとの勝率表(F-005 Task-3)を渡す */
export function runSimulation(file: WinratesFile): SimOutput {
  return simulate({
    winTable: file.winTable, stageWinTables: { ...stageTables(file), playoffs: playoffWinTable(file) }, dayWinTables: dayWinTables(file), seed: SIM_SEED, trials: SIM_TRIALS,
  });
}

/** 基準2・3・9: シミュレーションの出力を表の行にする(優勝確率の高い順) */
export function simulationView(sim: SimOutput, file: WinratesFile): SimView {
  const rows = TEAMS.map((team) => ({
    team,
    name: TEAM_INFO[team].name,
    color: TEAM_INFO[team].color,
    seed: sim.seedProbability[team].map(pct),
    champion: pct(sim.championProbability[team]),
    expectedRegular: sim.expectedRegularPoints[team].toFixed(1),
    expectedMasters: sim.expectedMastersPoints[team].toFixed(1),
  })).sort((x, y) => sim.championProbability[y.team] - sim.championProbability[x.team]);
  return { rows, seed: SIM_SEED, trials: sim.trials, computedAt: file.computedAt, tiebreak: Object.entries(sim.tiebreakUsed) };
}

/** 基準6: 結果の入力(F-004)が無い間の表示 */
export function resultsNotice(file: WinratesFile): string {
  return file.results ? '結果の反映: あり(入力された結果まで)' : '結果の反映: なし(開幕前の予想)';
}

export interface ChampionRowView {
  team: TeamId;
  name: string;
  color: string;
  petals: number;
  /** 優勝確率(0.1% 単位) */
  champion: string;
  championNum: number;
}

/** F-014 基準8: 優勝候補の要約(優勝確率の高い順)。値は F-001 の出力を丸めるだけ */
export function championSummary(sim: SimOutput): ChampionRowView[] {
  return TEAMS.map((team) => ({
    team,
    name: TEAM_INFO[team].name,
    color: TEAM_INFO[team].color,
    petals: TEAM_INFO[team].petals,
    champion: pct(sim.championProbability[team]),
    championNum: sim.championProbability[team] * 100,
  })).sort((x, y) => y.championNum - x.championNum);
}

/** F-014 基準10: 開幕前の予想の印(結果の入力が無い間) */
export function stageNotice(file: WinratesFile): string {
  return file.results ? '結果を反映した予想' : '開幕前の予想';
}
