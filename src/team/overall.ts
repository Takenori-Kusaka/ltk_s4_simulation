// F-010 Task-5: 全階級チームの総合の軸(受入基準 14・14b・15・16・17・18・18b)
// 入力は Task-2 の強さの軸(戦力 S)、Task-3 のコーチの枠、Task-4 のウィークサイド、過去の LTK の出場記録。
// 勝率(F-005)に依る軸は、F-005 の勝率表が無い間はデータなしにする
import type { Confidence } from '../rating/types.ts';
import type { PlayerRatingInput } from '../rating/build.ts';
import { ROSTER } from '../data/roster.ts';
import type { TierTeamStrength } from './strength.ts';
import type { TeamCoaching } from './coach.ts';
import type { TierTeamStyle } from './style.ts';
import def from './config.json' with { type: 'json' };

const TEAMS = ['DD', 'CC', 'IT', 'LR'] as const;
const TIERS = ['NEXT', 'CORE', 'MASTERS'] as const;

interface OverallConfig {
  /** 基準15: 6 組の差の標準偏差 × β がこの値になる β */
  aceTargetSd: number;
  coPlayPerPair: number;
  coPlayCap: number;
  leaderPer: number;
  leaderCap: number;
  overlapBase: number;
  overlapDivisor: number;
  designCertaintyScale: number;
  designCertaintyWeight: number;
  designCoachPer: number;
  designCoachCap: number;
}
const CFG = (def as unknown as { overall: OverallConfig }).overall;

export type OverallKey = 'rsPoints' | 'mastersCup' | 'ace' | 'balance' | 'coachingUse' | 'cohesion' | 'design';
export const OVERALL_AXES: readonly { key: OverallKey; label: string }[] = [
  { key: 'rsPoints', label: 'Regular Stage の得点力' },
  { key: 'mastersCup', label: 'MASTERS CUP の力' },
  { key: 'ace', label: 'エースの階級' },
  { key: 'balance', label: '階級の均衡' },
  { key: 'coachingUse', label: 'コーチングの活用' },
  { key: 'cohesion', label: '一体感' },
  { key: 'design', label: 'チーム設計' },
];

export interface OverallAxis {
  key: OverallKey;
  label: string;
  /** 0.0〜10.0。エースの階級は (S − 階級の平均) × β の値。データなしは null */
  value: number | null;
  /** エースの階級の階級名 */
  tier?: string;
  confidence: Confidence | null;
  reason: string;
}

export interface TeamOverall {
  team: string;
  axes: OverallAxis[];
}

export interface OverallInput {
  strength: readonly TierTeamStrength[];
  /** 階級チーム(例: DD-CORE)→ コーチの枠と指導の軸(Task-3) */
  coaching: Record<string, TeamCoaching>;
  style: readonly TierTeamStyle[];
  /** 選手の入力(過去の LTK の出場記録を使う) */
  inputs: readonly PlayerRatingInput[];
  /** チーム → チーム全体のリーダーを示す出典つきの根拠(基準18) */
  leaderEvidence?: Record<string, { text: string; source: string }[]>;
  /** チーム → 担当コーチがウィークサイドの作り方に通じていることを示す出典つきの根拠の数(基準18b) */
  coachWeakSideEvidence?: Record<string, number>;
}

const clamp = (x: number, lo = 0, hi = 10) => Math.max(lo, Math.min(hi, x));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sdOf = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const r2 = (x: number) => x.toFixed(2);
const RANK: Record<Confidence, number> = { 低: 0, 中: 1, 高: 2 };
const minConf = (cs: (Confidence | null | undefined)[]): Confidence | null => {
  const xs = cs.filter((c): c is Confidence => !!c);
  return xs.length ? xs.reduce((m, c) => (RANK[c] < RANK[m] ? c : m)) : null;
};

/** 基準15: 階級ごとの β(6 組の S の差の標準偏差 × β = 目標)。差が全く無い階級は null */
function betas(strength: readonly TierTeamStrength[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const tier of TIERS) {
    const S = TEAMS.map((t) => strength.find((x) => x.team === t && x.tier === tier)?.S ?? 0);
    const diffs: number[] = [];
    for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) diffs.push(S[i] - S[j]);
    const sd = sdOf(diffs);
    out[tier] = sd > 1e-12 ? CFG.aceTargetSd / sd : null;
  }
  return out;
}

/** 基準18 の共闘の項: 異なる階級の2選手の組のうち、過去の LTK で同じシーズンに同じチームで出場した組の数 */
function coPlayPairs(team: string, inputs: readonly PlayerRatingInput[]): number {
  const byId = new Map(inputs.map((p) => [p.playerId, p]));
  const members = ROSTER.filter((p) => p.team === team).map((p) => ({
    tier: p.tier,
    keys: new Set((byId.get(p.id)?.tournament.ltk ?? []).map((x) => `${x.season}|${x.team}`)),
  }));
  let n = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (members[i].tier === members[j].tier) continue;
      if ([...members[i].keys].some((k) => members[j].keys.has(k))) n++;
    }
  }
  return n;
}

/** 基準14〜18b: 4チームの総合の軸 */
export function computeOverall(input: OverallInput): { teams: TeamOverall[]; beta: Record<string, number | null> } {
  const beta = betas(input.strength);
  const row = (team: string, tier: string) => input.strength.find((x) => x.team === team && x.tier === tier);
  const tierMean = (tier: string) => mean(TEAMS.map((t) => row(t, tier)?.S ?? 0));

  const teams = TEAMS.map((team): TeamOverall => {
    const rows = TIERS.map((tier) => row(team, tier)).filter((x): x is TierTeamStrength => !!x);
    const power = (r: TierTeamStrength) => r.axes.find((a) => a.key === 'power');

    // 基準14・14b: F-005 の勝率表が無い間はデータなし
    const noWinRates = (key: OverallKey): OverallAxis => ({
      key, label: OVERALL_AXES.find((a) => a.key === key)!.label, value: null, confidence: null,
      reason: 'F-005(勝率の推定)の勝率表が無いため、F-001 の模擬を回せずデータなし',
    });

    // 基準15: エースの階級
    const aces = TIERS.map((tier) => {
      const r = row(team, tier);
      const b = beta[tier];
      return { tier, value: r && b !== null ? (r.S - tierMean(tier)) * b : null };
    }).filter((x): x is { tier: (typeof TIERS)[number]; value: number } => x.value !== null);
    const best = aces.reduce<{ tier: string; value: number } | null>((m, x) => (m === null || x.value > m.value ? x : m), null);
    const ace: OverallAxis = best
      ? { key: 'ace', label: 'エースの階級', value: best.value, tier: best.tier, confidence: minConf(rows.map((r) => power(r)?.confidence)),
          reason: `(S − 同じ階級の4チームの S の平均) × β が最大の階級: ${aces.map((x) => `${x.tier} ${r2(x.value)}`).join(' / ')}(特殊 BO4 の GAME 3 に置く候補)` }
      : { key: 'ace', label: 'エースの階級', value: null, confidence: null, reason: '4チームの S に差が無く、β を決められない' };

    // 基準16: 階級の均衡
    const disp = rows.map((r) => power(r)?.display).filter((x): x is number => typeof x === 'number');
    const balance: OverallAxis = disp.length
      ? { key: 'balance', label: '階級の均衡', value: clamp(10 - sdOf(disp) * 2), confidence: minConf(rows.map((r) => power(r)?.confidence)),
          reason: `10 − 3階級の戦力の表示の点数(${disp.map(r2).join('・')})の標準偏差 ${r2(sdOf(disp))} × 2` }
      : { key: 'balance', label: '階級の均衡', value: null, confidence: null, reason: '戦力の表示の点数が無い' };

    // 基準17: コーチングの活用
    const parts = (['CORE', 'NEXT'] as const).flatMap((tier) => {
      const c = input.coaching[`${team}-${tier}`]?.coach?.C;
      const r = row(team, tier);
      const lows = (r?.axes ?? []).map((a) => a.display).filter((x): x is number => typeof x === 'number');
      if (typeof c !== 'number' || !lows.length) return [];
      const low = Math.min(...lows);
      return [{ tier, c, low, v: (c / 10) * (10 - low) }];
    });
    const coachingUse: OverallAxis = parts.length
      ? { key: 'coachingUse', label: 'コーチングの活用', value: clamp(mean(parts.map((x) => x.v))),
          confidence: minConf((['CORE', 'NEXT'] as const).map((t) => input.coaching[`${team}-${t}`]?.coaching.confidence)),
          reason: parts.map((x) => `${x.tier}: (C ${r2(x.c)} ÷ 10) × (10 − 強さの軸の最も低い表示 ${r2(x.low)}) = ${r2(x.v)}`).join('、') + ' の平均' }
      : { key: 'coachingUse', label: 'コーチングの活用', value: null, confidence: null, reason: 'コーチの総合か強さの軸が無い' };

    // 基準18: 一体感
    const pairs = coPlayPairs(team, input.inputs);
    const coTerm = Math.min(CFG.coPlayCap, pairs * CFG.coPlayPerPair);
    const leaders = input.leaderEvidence?.[team] ?? [];
    const leaderTerm = Math.min(CFG.leaderCap, leaders.length * CFG.leaderPer);
    const overlap = row(team, 'CORE')?.overlap ?? 0;
    const overlapTerm = clamp(CFG.overlapBase - overlap / CFG.overlapDivisor, 0, CFG.overlapBase);
    const cohesion: OverallAxis = {
      key: 'cohesion', label: '一体感', value: clamp(coTerm + leaderTerm + overlapTerm), confidence: leaders.length ? '中' : '低',
      reason: `共闘の項 ${r2(coTerm)}(異なる階級で過去の LTK に同じシーズン・同じチームで出た組 ${pairs})+ リーダーの項 ${r2(leaderTerm)}(根拠 ${leaders.length} 件${leaders.length ? '' : '。チーム全体のリーダーの根拠はまだ集めていない'})+ 重なりの項 ${r2(overlapTerm)}(NEXT と CORE の得意チャンピオンの重なり ${overlap})`,
    };

    // 基準18b: チーム設計
    const certainties = TIERS.flatMap((tier) => {
      const s = input.style.find((x) => x.team === team && x.tier === tier);
      const c = s?.weakSide.candidates ?? [];
      return c.length >= 2 ? [{ tier, v: clamp((c[0].score - c[1].score) / CFG.designCertaintyScale, 0, 1) }] : [];
    });
    const coachEv = input.coachWeakSideEvidence?.[team] ?? 0;
    const coachTerm = Math.min(CFG.designCoachCap, coachEv * CFG.designCoachPer);
    const design: OverallAxis = certainties.length
      ? { key: 'design', label: 'チーム設計', value: clamp(mean(certainties.map((x) => x.v)) * CFG.designCertaintyWeight + coachTerm),
          confidence: minConf(TIERS.map((tier) => input.style.find((x) => x.team === team && x.tier === tier)?.weakSide.confidence)),
          reason: `ウィークサイドの確かさ(${certainties.map((x) => `${x.tier} ${r2(x.v)}`).join('・')})の平均 × ${CFG.designCertaintyWeight} + コーチの根拠 ${coachEv} 件 × ${CFG.designCoachPer}(上限 ${CFG.designCoachCap})` }
      : { key: 'design', label: 'チーム設計', value: null, confidence: null, reason: 'ウィークサイドの候補が2人以上いる階級が無い(確かさを計算できない)' };

    return { team, axes: [noWinRates('rsPoints'), noWinRates('mastersCup'), ace, balance, coachingUse, cohesion, design] };
  });
  return { teams, beta };
}
