// F-010 Task-3: コーチの枠とコーチの評価軸(受入基準 5・5b・5c・5d・5e)
// 入力はコーチの根拠の記録(data/snapshots/evidence-coach.json)、プロの経歴(大会経験の根拠)、F-009 の大会経験の軸。
// 選手としての評価(地力・コール力など)は使わない。DOM と Node 固有の API に依存しない
import { ROSTER } from '../data/roster.ts';
import { TEAMS, TIERS } from '../sim/types.ts';
import type { PlayerRating } from '../rating/build.ts';
import type { TournamentRecord } from '../rating/evidence.ts';
import type { Confidence } from '../rating/types.ts';
import { relativeScores } from './strength.ts';
import conf from './config.json' with { type: 'json' };

const CFG = conf as unknown as {
  coaches: Record<string, string>;
  coachPrior: { record: number; verbal: number; tactics: number; fit: number };
  coachEval: {
    perSeason: number; seasonCap: number; perRank: number; rankCap: number;
    strengthPoints: Record<'強' | '中' | '弱', number>;
    proBase: number; proPerYear: Record<string, number>;
    highEvidence: number;
  };
};

export type CoachAxisKey = 'record' | 'verbal' | 'tactics' | 'knowledge' | 'fit';
export const COACH_AXES: readonly { key: CoachAxisKey; label: string }[] = [
  { key: 'record', label: '指導の実績' },
  { key: 'verbal', label: '言語化力' },
  { key: 'tactics', label: '戦術とドラフトの設計' },
  { key: 'knowledge', label: '選手時代の知見' },
  { key: 'fit', label: 'チームとの相性' },
];

export interface CoachEvidence {
  summary: string;
  source: string;
  direction: '+' | '-';
  strength: '強' | '中' | '弱';
  collectedBy: 'ai' | 'human';
}
export interface CoachSeason { season: string; team: string; tier?: string; source: string }
export interface RankGain { season: string; gain: number; source: string }
export interface CoachEntry {
  name: string;
  /** 担当する階級チーム(例: DD-CORE) */
  tierTeam: string;
  /** LTK でコーチを務めたシーズン(今回の Finale を除く) */
  seasons: CoachSeason[];
  /** 担当した階級チームの前シーズンからの順位の伸び(出典つき。記録が無ければ空) */
  rankGains: RankGain[];
  verbal: CoachEvidence[];
  tactics: CoachEvidence[];
  fit: CoachEvidence[];
}
export interface CoachSnapshot {
  kind: 'evidence-coach';
  retrievedAt: string;
  description: string;
  coaches: Record<string, CoachEntry>;
}

export interface CoachAxis {
  key: CoachAxisKey;
  label: string;
  score: number;
  confidence: Confidence;
  /** 根拠が無く事前値で計算した */
  estimated: boolean;
  reason: string;
  evidence: { text: string; source: string }[];
}
export interface CoachRating {
  coachId: string;
  name: string;
  tierTeam: string;
  axes: CoachAxis[];
  /** コーチの総合 C = 5軸の平均 */
  C: number;
}

const clamp = (x: number) => Math.max(0, Math.min(10, x));
const r2 = (x: number) => x.toFixed(2);
const confOf = (n: number): Confidence => (n === 0 ? '低' : n >= CFG.coachEval.highEvidence ? '高' : '中');

function evidenceAxis(key: 'verbal' | 'tactics' | 'fit', list: CoachEvidence[]): CoachAxis {
  const label = COACH_AXES.find((a) => a.key === key)!.label;
  const prior = CFG.coachPrior[key];
  if (!list.length) {
    return { key, label, score: prior, confidence: '低', estimated: true, reason: `出典つきの根拠が無いため事前値 ${prior}`, evidence: [] };
  }
  const pts = (d: '+' | '-') => list.filter((e) => e.direction === d).reduce((s, e) => s + CFG.coachEval.strengthPoints[e.strength], 0);
  const pos = pts('+');
  const neg = pts('-');
  return {
    key, label, score: clamp(prior + pos - neg), confidence: confOf(list.length), estimated: false,
    reason: `${prior} + 肯定の強さ ${pos} − 否定の強さ ${neg}(根拠 ${list.length} 件)`,
    evidence: list.map((e) => ({ text: `${e.direction === '+' ? '肯定' : '否定'}・${e.strength}: ${e.summary}`, source: e.source })),
  };
}

/** 基準5b・5c: 1人のコーチの5軸と総合 C */
export function rateCoach(coachId: string, e: CoachEntry, record: TournamentRecord, tournamentAxis: number): CoachRating {
  const c = CFG.coachEval;
  // 指導の実績
  const seasonPts = Math.min(c.seasonCap, e.seasons.length * c.perSeason);
  const gain = e.rankGains.reduce((s, g) => s + g.gain, 0);
  const rankPts = Math.max(-c.rankCap, Math.min(c.rankCap, gain * c.perRank));
  const recEvidence = [...e.seasons.map((s) => ({ text: `LTK ${s.season} ${s.team}${s.tier ? ` ${s.tier}` : ''} のコーチ`, source: s.source })),
    ...e.rankGains.map((g) => ({ text: `${g.season} の順位の伸び ${g.gain}`, source: g.source }))];
  const recAxis: CoachAxis = recEvidence.length
    ? { key: 'record', label: '指導の実績', score: clamp(CFG.coachPrior.record + seasonPts + rankPts), confidence: confOf(recEvidence.length), estimated: false,
        reason: `${CFG.coachPrior.record} + コーチ ${e.seasons.length} シーズン × ${c.perSeason}(上限 ${c.seasonCap})+ 順位の伸び ${gain} × ${c.perRank}(±${c.rankCap})${e.rankGains.length ? '' : '。順位の伸びの記録は無い'}`,
        evidence: recEvidence }
    : { key: 'record', label: '指導の実績', score: CFG.coachPrior.record, confidence: '低', estimated: true, reason: `LTK でコーチを務めた記録が無いため事前値 ${CFG.coachPrior.record}`, evidence: [] };
  // 選手時代の知見
  const pro = proPoints(record);
  const knowledge: CoachAxis = pro.entries.length
    ? { key: 'knowledge', label: '選手時代の知見', score: clamp(c.proBase + pro.points), confidence: confOf(pro.entries.length), estimated: false,
        reason: `プロの経歴あり: ${c.proBase} + ${pro.detail}`, evidence: pro.entries }
    : { key: 'knowledge', label: '選手時代の知見', score: clamp(tournamentAxis), confidence: '低', estimated: true,
        reason: `プロの経歴の記録が無いため、選手としての大会経験の軸 ${r2(tournamentAxis)}`, evidence: [] };
  const axes = [recAxis, evidenceAxis('verbal', e.verbal), evidenceAxis('tactics', e.tactics), knowledge, evidenceAxis('fit', e.fit)];
  const ordered = COACH_AXES.map((a) => axes.find((x) => x.key === a.key)!);
  return { coachId, name: e.name, tierTeam: e.tierTeam, axes: ordered, C: ordered.reduce((s, a) => s + a.score, 0) / ordered.length };
}

function proPoints(record: TournamentRecord) {
  const per = CFG.coachEval.proPerYear;
  const counted = record.pro.filter((p) => per[p.league] !== undefined);
  const points = counted.reduce((s, p) => s + per[p.league] * p.years, 0);
  return {
    points,
    detail: counted.map((p) => `${p.league} ${p.years} 年 × ${per[p.league]}`).join(' + ') || '0',
    entries: counted.map((p) => ({ text: `${p.league} ${p.team} ${p.years} 年`, source: p.url ?? p.source })),
  };
}

export interface TeamCoaching {
  team: string;
  tier: string;
  /** コーチの枠(MASTERS は null) */
  coach: CoachRating | null;
  /** 指導の軸(素点 = C、表示 = 同じ階級の4チームの相対評価。MASTERS は対象外) */
  coaching: { raw: number | null; display: number | null; label: string; confidence: Confidence | null };
}

/** 基準5・5d: 12 の階級チームのコーチの枠と指導の軸、戦力 S に渡すコーチの総合 */
export function computeCoaches(
  snapshot: CoachSnapshot,
  records: Record<string, TournamentRecord>,
  ratings: readonly PlayerRating[],
): { coaches: Record<string, CoachRating>; teams: Record<string, TeamCoaching>; coachC: Record<string, number> } {
  const ratingOf = new Map(ratings.map((r) => [r.playerId, r]));
  const coaches: Record<string, CoachRating> = {};
  const teams: Record<string, TeamCoaching> = {};
  const coachC: Record<string, number> = {};
  const empty: TournamentRecord = { ltk: [], coach: [], pro: [], other: [] };
  for (const tier of TIERS) {
    const keys = TEAMS.map((t) => `${t}-${tier}`);
    if (tier === 'MASTERS') {
      for (const [i, key] of keys.entries()) teams[key] = { team: TEAMS[i], tier, coach: null, coaching: { raw: null, display: null, label: '対象外', confidence: null } };
      continue;
    }
    const rated = keys.map((key) => {
      const id = CFG.coaches[key];
      const e = snapshot.coaches[id] ?? { name: ROSTER.find((p) => p.id === id)?.name ?? id, tierTeam: key, seasons: [], rankGains: [], verbal: [], tactics: [], fit: [] };
      const t = ratingOf.get(id)?.axes.find((a) => a.key === 'tournament')?.display ?? 5;
      const r = rateCoach(id, e, records[id] ?? empty, t);
      coaches[id] = r;
      coachC[key] = r.C;
      return r;
    });
    const rel = relativeScores(rated.map((r) => r.C));
    const rank: Record<Confidence, number> = { 低: 0, 中: 1, 高: 2 };
    rated.forEach((r, i) => {
      const lowest = r.axes.reduce<Confidence>((m, a) => (rank[a.confidence] < rank[m] ? a.confidence : m), '高');
      teams[keys[i]] = { team: TEAMS[i], tier, coach: r, coaching: { raw: r.C, display: rel[i], label: '指導', confidence: lowest } };
    });
  }
  return { coaches, teams, coachC };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const ROSTER_IDS = new Set(ROSTER.map((p) => p.id));

/** 出典・向き・強さの欠けた根拠と、名簿に無いコーチを拒否する */
export function readCoachSnapshot(raw: unknown): { snapshot: CoachSnapshot | null; errors: string[] } {
  if (!isObj(raw) || raw.kind !== 'evidence-coach' || !isObj(raw.coaches)) return { snapshot: null, errors: ['kind が evidence-coach の記録ではない'] };
  const errors: string[] = [];
  const coaches: Record<string, CoachEntry> = {};
  for (const [id, v] of Object.entries(raw.coaches)) {
    if (!ROSTER_IDS.has(id)) {
      errors.push(`${id}: 名簿に無い`);
      continue;
    }
    if (!isObj(v)) continue;
    const list = <T>(key: string, ok: (x: Record<string, unknown>) => boolean): T[] =>
      (Array.isArray(v[key]) ? (v[key] as unknown[]) : []).filter((x, i) => {
        const good = isObj(x) && ok(x);
        if (!good) errors.push(`${id}: ${key} の ${i + 1} 件目に出典・向き・強さのどれかが無い`);
        return good;
      }) as T[];
    const evOk = (x: Record<string, unknown>) =>
      str(x.summary) && str(x.source) && (x.direction === '+' || x.direction === '-') && ['強', '中', '弱'].includes(x.strength as string);
    coaches[id] = {
      name: String(v.name ?? id),
      tierTeam: String(v.tierTeam ?? ''),
      seasons: list<CoachSeason>('seasons', (x) => str(x.season) && str(x.source)),
      rankGains: list<RankGain>('rankGains', (x) => str(x.season) && typeof x.gain === 'number' && str(x.source)),
      verbal: list<CoachEvidence>('verbal', evOk),
      tactics: list<CoachEvidence>('tactics', evOk),
      fit: list<CoachEvidence>('fit', evOk),
    };
  }
  return { snapshot: { kind: 'evidence-coach', retrievedAt: String(raw.retrievedAt ?? ''), description: String(raw.description ?? ''), coaches }, errors };
}
