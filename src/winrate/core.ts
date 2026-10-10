// F-005 Task-1: 勝率の土台(基準 1・2・3・6・7・16)。β、事前の勝率、ステージ補正、S を計算できないときの 50.0%、F-001 の勝率表の出力
// DOM と Node 固有の API に依存しない。結果による更新(θ)・仕上がり・気持ち・ドラフトの項は後のタスク(ここでは 0)
import config from './config.json' with { type: 'json' };
import { MASTERS_CUPS, REGULAR_DAYS } from '../sim/schedule.ts';
import { TEAMS, TIERS, type TeamId, type Tier } from '../sim/types.ts';
import type { WinTable } from '../sim/validate.ts';

export type StageKey = 'regular' | 'masters' | 'playoffs';

export interface WinrateConfig {
  beta: { targetSd: number };
  /** 基準6: ステージごと・階級チーム(例 DD-NEXT)ごとの対数オッズの加算値 */
  stage: Record<StageKey, Record<string, number>>;
  stageBasis: string;
  [k: string]: unknown;
}

/** 階級チームの戦力 S(F-010)。計算できないときは S を null にし、理由を書く */
export interface TierTeamS {
  team: TeamId;
  tier: Tier;
  S: number | null;
  reason?: string;
}

export interface TeamRow {
  key: string;
  team: TeamId;
  tier: Tier;
  S: number | null;
  /** S を計算できない理由(基準16)。計算できれば null */
  reason: string | null;
}

export interface MatchPrior {
  stage: 'regular' | 'masters';
  day?: number;
  cup?: number;
  tier: Tier;
  a: TeamId;
  b: TeamId;
  sA: number | null;
  sB: number | null;
  beta: number;
  /** 基準2 の事前の対数オッズ(β × (S_A − S_B) + ステージ補正) */
  logit: number;
  /** 基準6: ステージ補正(A の値 − B の値) */
  stageTerm: number;
  /** A の勝率(%、0.1 単位) */
  pA: number;
  pB: number;
  /** 基準16: データ不足の表示と理由。無ければ null */
  dataMissing: string | null;
}

export interface WinrateOutput {
  kind: 'winrates';
  beta: Record<Tier, number>;
  betaBasis: Record<Tier, string>;
  stageBasis: string;
  teams: TeamRow[];
  matches: MatchPrior[];
  winTable: WinTable;
  stageWinTables: Record<StageKey, WinTable>;
}

const CFG = config as unknown as WinrateConfig;
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** 基準3: 同じ階級の4チームの6組の S の差の二乗平均平方根が targetSd になる β。差がすべて 0 なら 0 */
export function betaOf(S: readonly number[], targetSd: number): number {
  const sq: number[] = [];
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) sq.push((S[i] - S[j]) ** 2);
  if (!sq.length) return 0;
  const rms = Math.sqrt(sq.reduce((a, b) => a + b, 0) / sq.length);
  return rms > 1e-12 ? targetSd / rms : 0;
}

/** 基準1: 両チームの勝率を 0.1% 単位で、和が 100.0% になるように丸める */
function percents(p: number): [number, number] {
  const tenths = Math.round(p * 1000);
  return [tenths / 10, (1000 - tenths) / 10];
}

export function computePriorWinrates(teams: readonly TierTeamS[], opts: { config?: WinrateConfig } = {}): WinrateOutput {
  const cfg = opts.config ?? CFG;
  const rows: TeamRow[] = [];
  for (const tier of TIERS) {
    for (const team of TEAMS) {
      const t = teams.find((x) => x.team === team && x.tier === tier);
      const key = `${team}-${tier}`;
      if (!t) rows.push({ key, team, tier, S: null, reason: 'F-010 の計算が無い' });
      else if (t.S === null || !Number.isFinite(t.S)) rows.push({ key, team, tier, S: null, reason: t.reason ?? 'F-010 の計算が無い' });
      else rows.push({ key, team, tier, S: t.S, reason: null });
    }
  }
  const sOf = (team: TeamId, tier: Tier) => rows.find((r) => r.team === team && r.tier === tier)!;

  const beta = {} as Record<Tier, number>;
  const betaBasis = {} as Record<Tier, string>;
  for (const tier of TIERS) {
    const known = rows.filter((r) => r.tier === tier && r.S !== null).map((r) => r.S as number);
    beta[tier] = r3(betaOf(known, cfg.beta.targetSd));
    const rms = beta[tier] > 0 ? cfg.beta.targetSd / beta[tier] : 0;
    betaBasis[tier] =
      known.length < 2
        ? `S を計算できたチームが ${known.length} 件のため β = 0`
        : `${known.length} チームの S の差(${known.length === 4 ? 6 : (known.length * (known.length - 1)) / 2} 組)の二乗平均平方根 ${r3(rms)} に対して β × 差の広がりが ${cfg.beta.targetSd} になる値`;
  }

  // 1組の事前の勝率(A の対数オッズ)。stage が無ければステージ補正なし
  const prior = (tier: Tier, a: TeamId, b: TeamId, stage?: StageKey) => {
    const A = sOf(a, tier), B = sOf(b, tier);
    const st = stage ? (cfg.stage[stage]?.[A.key] ?? 0) - (cfg.stage[stage]?.[B.key] ?? 0) : 0;
    if (A.S === null || B.S === null) {
      const why = [A, B].filter((x) => x.S === null).map((x) => `${x.key}: ${x.reason}`).join(' / ');
      return { sA: A.S, sB: B.S, logit: 0, stageTerm: st, pA: 50.0, pB: 50.0, dataMissing: `データ不足(${why})` };
    }
    const logit = beta[tier] * (A.S - B.S) + st;
    const [pA, pB] = percents(sigmoid(logit));
    return { sA: A.S, sB: B.S, logit: r3(logit), stageTerm: st, pA, pB, dataMissing: null };
  };

  const matches: MatchPrior[] = [];
  for (const d of REGULAR_DAYS) {
    for (const card of d.cards) {
      for (const tier of ['NEXT', 'CORE'] as const) {
        matches.push({ stage: 'regular', day: d.day, tier, a: card.blue, b: card.red, beta: beta[tier], ...prior(tier, card.blue, card.red, 'regular') });
      }
    }
  }
  for (const c of MASTERS_CUPS) {
    for (const [a, b] of c.semis) matches.push({ stage: 'masters', cup: c.cup, tier: 'MASTERS', a, b, beta: beta.MASTERS, ...prior('MASTERS', a, b, 'masters') });
  }

  // 基準7: F-001 の入力の形式。winTable はステージ補正なし、stageWinTables はステージごとの補正つき(第3戦・決勝・Playoffs の組もここで引く)
  const table = (stage?: StageKey): WinTable => {
    const t = {} as WinTable;
    for (const tier of TIERS) {
      t[tier] = {};
      for (const a of TEAMS) for (const b of TEAMS) if (a < b) t[tier][`${a}>${b}`] = prior(tier, a, b, stage).pA / 100;
    }
    return t;
  };

  return {
    kind: 'winrates',
    beta,
    betaBasis,
    stageBasis: cfg.stageBasis,
    teams: rows,
    matches,
    winTable: table(),
    stageWinTables: { regular: table('regular'), masters: table('masters'), playoffs: table('playoffs') },
  };
}
