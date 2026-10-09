// F-010 Task-2: 階級チームの強さの軸と相対評価(受入基準 1・2・2b・3・4・6・6b)
// 入力は F-009 の評価(8軸の表示の点数と確度)と評価の入力(試合・根拠・LTK の出場記録)。DOM と Node 固有の API に依存しない
import { ROSTER } from '../data/roster.ts';
import { TEAMS, TIERS } from '../sim/types.ts';
import { loadEngineConfig, selectGames } from '../rating/engine.ts';
import { loadEvidenceConfig } from '../rating/evidence.ts';
import type { PlayerRating, PlayerRatingInput } from '../rating/build.ts';
import type { Confidence } from '../rating/types.ts';
import conf from './config.json' with { type: 'json' };

const CFG = conf as unknown as {
  roleWeights: Record<string, number>;
  coachWeight: number;
  coaches: Record<string, string>;
  coachPrior: { record: number; verbal: number; tactics: number; fit: number };
  synergyPairBonus: number;
  shotcalling: { maxWeight: number; roleWeight: number; callerThreshold: number; roleTerm: number[] };
  poolOverlapPenalty: number;
  favoriteChampions: number;
  fearless: { minGames: number; minWinRate: number; lowestPlayers: number };
  relative: { center: number; scale: number };
};

export type StrengthKey = 'power' | 'synergy' | 'shotcalling' | 'continuity' | 'pool' | 'fearless';
const LABELS: Record<StrengthKey, string> = {
  power: '戦力', synergy: '連携の厚み', shotcalling: '司令塔', continuity: '継続性', pool: 'ピックの幅', fearless: 'フィアレス耐性',
};

export interface StrengthAxis {
  key: StrengthKey;
  label: string;
  /** 素点(相対評価の前)。材料が無ければ null */
  raw: number | null;
  /** 表示の点数(同じ階級の4チームの相対評価)。材料が無ければ null(データなし) */
  display: number | null;
  confidence: Confidence | null;
  reason: string;
}

export interface TierTeamStrength {
  team: string;
  tier: string;
  /** 戦力 S(相対評価の前の値。勝率と総合の軸に使う) */
  S: number;
  /** コーチの総合 C。MASTERS は null */
  coachC: number | null;
  /** コーチの総合を事前値で推定した(Task-3 のコーチの評価が入るまで) */
  coachEstimated: boolean;
  coachId: string | null;
  axes: StrengthAxis[];
}

const RANK: Record<Confidence, number> = { 低: 0, 中: 1, 高: 2 };
const minConf = (cs: (Confidence | null | undefined)[]): Confidence =>
  cs.reduce<Confidence>((m, c) => (c && RANK[c] < RANK[m] ? c : m), '高');
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r2 = (x: number) => x.toFixed(2);

/** 用語「選手の総合」: O = 5.0 + Σ (1/8) × (x_k − 5.0) */
export function playerOverall(r: PlayerRating): number {
  return 5 + r.axes.reduce((s, a) => s + (a.display - 5), 0) / r.axes.length;
}

/** 仕様 5c の事前値によるコーチの総合(指導の実績 4.0、言語化力・戦術・相性 5.0、選手時代の知見は大会経験の軸)。Task-3 で置き換える */
export function coachPrior(coach: PlayerRating | undefined): number {
  const p = CFG.coachPrior;
  const knowledge = coach?.axes.find((a) => a.key === 'tournament')?.display ?? 5;
  return (p.record + p.verbal + p.tactics + p.fit + knowledge) / 5;
}

/** F-002 基準6 の相対評価: 5.0 + 2.0 × (値 − 平均) ÷ 標準偏差 を 0.0〜10.0 に切り詰める。null は母集団から除く */
export function relativeScores(values: (number | null)[]): (number | null)[] {
  const xs = values.filter((v): v is number => v !== null);
  if (!xs.length) return values.map(() => null);
  const m = mean(xs);
  const sd = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
  return values.map((v) => {
    if (v === null) return null;
    const z = sd > 0 ? (v - m) / sd : 0;
    return Math.max(0, Math.min(10, CFG.relative.center + CFG.relative.scale * z));
  });
}

interface Member {
  id: string;
  role: string;
  rating: PlayerRating;
  input: PlayerRatingInput | undefined;
}
const axisOf = (r: PlayerRating, key: string) => r.axes.find((a) => a.key === key);

/** 大会のロールの試合のチャンピオンごとの試合数と勝ち数(評価の試合の期間と長さの条件は F-009 と同じ) */
function championStats(m: Member, now: number) {
  const by = new Map<number, { n: number; w: number }>();
  if (!m.input) return by;
  const cfg = loadEngineConfig();
  for (const g of selectGames(m.input.games, now, cfg, { roleOnly: true, position: m.input.position })) {
    const id = g.me.championId;
    if (typeof id !== 'number') continue;
    const e = by.get(id) ?? { n: 0, w: 0 };
    e.n += 1;
    e.w += g.me.win === 1 ? 1 : 0;
    by.set(id, e);
  }
  return by;
}

/** 用語「得意チャンピオン」: 大会のロールの試合数の多い順の上位5体(同数はチャンピオンの番号順) */
function favorites(m: Member, now: number): number[] {
  return [...championStats(m, now)]
    .sort((a, b) => b[1].n - a[1].n || a[0] - b[0])
    .slice(0, CFG.favoriteChampions)
    .map(([id]) => id);
}

/** 用語「勝てるチャンピオン」の数: 大会のロールで 3 試合以上・勝率 50% 以上 */
function winnable(m: Member, now: number): number {
  const f = CFG.fearless;
  return [...championStats(m, now).values()].filter((e) => e.n >= f.minGames && e.w / e.n >= f.minWinRate).length;
}

/** 基準4: 同じシーズンに同じチームの同じ階級で出場した2人の組の数 */
function continuityPairs(ms: Member[]): number {
  const keys = ms.map((m) => new Set((m.input?.tournament.ltk ?? []).map((x) => `${x.season}|${x.team}|${x.tier}`)));
  let pairs = 0;
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) if ([...keys[i]].some((k) => keys[j].has(k))) pairs++;
  }
  return pairs;
}

/** F-009 基準14 の「実績なし」: 点数に使う肯定の根拠が1件も無い */
function noPositiveEvidence(m: Member): boolean {
  const w = loadEvidenceConfig().shotcalling.kindWeights;
  return !(m.input?.shotcalling ?? []).some((e) => e.direction === '+' && (w[e.kind] ?? 0) > 0);
}

export interface StrengthInput {
  ratings: readonly PlayerRating[];
  inputs: readonly PlayerRatingInput[];
  now: number;
  /** 階級チーム(例: DD-CORE)ごとのコーチの総合 C(Task-3)。無ければ仕様 5c の事前値で推定する */
  coachC?: Record<string, number>;
}

/** 基準1〜6b: 12 の階級チームの戦力 S と強さの軸 */
export function computeStrength(input: StrengthInput): TierTeamStrength[] {
  const ratingOf = new Map(input.ratings.map((r) => [r.playerId, r]));
  const inputOf = new Map(input.inputs.map((p) => [p.playerId, p]));
  const membersOf = (team: string, tier: string): Member[] =>
    ROSTER.filter((p) => p.team === team && p.tier === tier && ratingOf.has(p.id)).map((p) => ({
      id: p.id, role: p.role, rating: ratingOf.get(p.id)!, input: inputOf.get(p.id),
    }));
  const favSet = (ms: Member[]) => new Set(ms.flatMap((m) => favorites(m, input.now)));

  const teams = TEAMS.flatMap((team) =>
    TIERS.map((tier) => {
      const ms = membersOf(team, tier);
      const playerPart = ms.reduce((s, m) => s + (CFG.roleWeights[m.role] ?? 0) * playerOverall(m.rating), 0);
      const key = `${team}-${tier}`;
      const coachId = tier === 'MASTERS' ? null : (CFG.coaches[key] ?? null);
      const given = input.coachC?.[key];
      const coachC = coachId === null ? null : (given ?? coachPrior(ratingOf.get(coachId)));
      const S = coachC === null ? playerPart : (1 - CFG.coachWeight) * playerPart + CFG.coachWeight * coachC;

      // 連携の厚み
      const pairs = continuityPairs(ms);
      const syn = mean(ms.map((m) => ((axisOf(m.rating, 'synergy')?.display ?? 5) + (axisOf(m.rating, 'teamfight')?.display ?? 5)) / 2));
      // 司令塔
      const calls = ms.map((m) => axisOf(m.rating, 'shotcalling')?.display ?? 0);
      const maxCall = Math.max(...calls);
      const callers = calls.filter((c) => c >= CFG.shotcalling.callerThreshold).length;
      const roleTerm = CFG.shotcalling.roleTerm[Math.min(callers, CFG.shotcalling.roleTerm.length - 1)];
      const caller = ms[calls.indexOf(maxCall)];
      const allNoEvidence = ms.length > 0 && ms.every(noPositiveEvidence);
      // ピックの幅(NEXT と CORE の得意チャンピオンの重なり。MASTERS は 0)
      let overlap = 0;
      if (tier !== 'MASTERS') {
        const a = favSet(membersOf(team, 'NEXT'));
        overlap = [...favSet(membersOf(team, 'CORE'))].filter((c) => a.has(c)).length;
      }
      const poolMean = mean(ms.map((m) => axisOf(m.rating, 'pool')?.display ?? 5));
      // フィアレス耐性
      const wins = ms.map((m) => winnable(m, input.now)).sort((x, y) => x - y).slice(0, CFG.fearless.lowestPlayers);

      const axes: StrengthAxis[] = [
        { key: 'power', label: LABELS.power, raw: S, display: null, confidence: minConf(ms.map((m) => axisOf(m.rating, 'ground')?.confidence)),
          reason: `選手の部分 ${r2(playerPart)}${coachC === null ? '(MASTERS はコーチの枠なし)' : ` × ${1 - CFG.coachWeight} + コーチの総合 ${r2(coachC)} × ${CFG.coachWeight}${given === undefined ? '(コーチの評価が入るまで事前値で推定)' : ''}`} = ${r2(S)}` },
        { key: 'synergy', label: LABELS.synergy, raw: syn + pairs * CFG.synergyPairBonus,
          confidence: minConf(ms.flatMap((m) => [axisOf(m.rating, 'synergy')?.confidence, axisOf(m.rating, 'teamfight')?.confidence])),
          display: null, reason: `(連携 + 集団戦) ÷ 2 の平均 ${r2(syn)} + 継続性の組 ${pairs} × ${CFG.synergyPairBonus}` },
        { key: 'shotcalling', label: LABELS.shotcalling, raw: maxCall * CFG.shotcalling.maxWeight + roleTerm * CFG.shotcalling.roleWeight,
          confidence: allNoEvidence ? '低' : (axisOf(caller.rating, 'shotcalling')?.confidence ?? '低'), display: null,
          reason: `コール力の最大 ${r2(maxCall)}(${caller?.rating.name ?? '—'})× ${CFG.shotcalling.maxWeight} + 役の項 ${roleTerm}(6.0 以上 ${callers} 人)× ${CFG.shotcalling.roleWeight}${allNoEvidence ? '。5人ともコールの肯定の根拠が無い' : ''}` },
        { key: 'continuity', label: LABELS.continuity, raw: pairs, display: null, confidence: '高',
          reason: `過去の LTK で同じシーズン・チーム・階級だった組 ${pairs} / 10` },
        { key: 'pool', label: LABELS.pool, raw: poolMean - overlap * CFG.poolOverlapPenalty, display: null,
          confidence: minConf(ms.map((m) => axisOf(m.rating, 'pool')?.confidence)),
          reason: `ピックプールの平均 ${r2(poolMean)} − NEXT と CORE の得意チャンピオンの重なり ${overlap} × ${CFG.poolOverlapPenalty}` },
        { key: 'fearless', label: LABELS.fearless, raw: wins.length ? mean(wins) : null, display: null,
          confidence: minConf(ms.map((m) => axisOf(m.rating, 'pool')?.confidence)),
          reason: `勝てるチャンピオン(3 試合以上・勝率 50% 以上)の数の少ない方から ${wins.length} 人: ${wins.join('・')}` },
      ];
      return { team, tier, S, coachC, coachEstimated: coachC !== null && given === undefined, coachId, axes };
    }),
  );

  // 基準2: 各軸の素点を同じ階級の4チームで相対評価する
  for (const tier of TIERS) {
    const group = teams.filter((t) => t.tier === tier);
    for (const key of Object.keys(LABELS) as StrengthKey[]) {
      const rel = relativeScores(group.map((t) => t.axes.find((a) => a.key === key)!.raw));
      group.forEach((t, i) => {
        const a = t.axes.find((x) => x.key === key)!;
        a.display = rel[i];
        if (a.raw === null) a.confidence = null;
      });
    }
  }
  return teams;
}
