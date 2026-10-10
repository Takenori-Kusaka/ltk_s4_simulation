// F-009 Task-3: 根拠の軸(コール力・大会経験)。ADR-0004 決定5・7、docs/design/rating-model.md 節2
// 入力は出典つきの根拠と評価設定だけ。ランク・ソロキューのデータ・データの軸は受け取らない(基準13)
import type { Confidence, ExProCareer, RankEntry } from './types.ts';
import defaults from './config.json' with { type: 'json' };

export type Strength = '強' | '中' | '弱';
/** player: 選手としてのコール / coach: コーチとしての指示 / other-game: 他ゲームの IGL / other: コールの根拠でない経歴 / owner-confirmation: 価値責任者の確認 */
export type EvidenceKind = 'player' | 'coach' | 'other-game' | 'other' | 'owner-confirmation';

export interface ShotcallingEvidence {
  summary: string;
  /** 出典(URL、または確認の記録) */
  source: string;
  date?: string;
  type?: string;
  /** + コールする / − コールを任せる・指示を聞く側 */
  direction: '+' | '-';
  strength: Strength;
  kind: EvidenceKind;
  /** ai: AI(Gemini・調査エージェント)が集めた未確認の根拠 / human: 人が確認した根拠 */
  collectedBy: 'ai' | 'human';
  origin?: string;
  kindBy?: string;
}

export interface ShotcallingConfig {
  base: number;
  max: number;
  strengthPoints: Record<Strength, number>;
  kindWeights: Record<EvidenceKind, number>;
  negativeCap: number;
  noPositive: number;
  confidence: { highHuman: number; midHuman: number; midAiPoints: number; aiPoints: Record<Strength, number> };
}

export interface LtkAppearance {
  season: string;
  team: string;
  tier: string;
  role: string;
  /** 勝敗は記録として残すが点数には使わない(2026-10-09 確定) */
  wins: number | null;
  losses: number | null;
  source: string;
  url?: string;
  note?: string;
}
export interface CoachSeason { season: string; team: string; source: string; url?: string }
export interface ProCareer { league: string; team: string; years: number; note?: string; source: string; url?: string }
export interface OtherTournament { name: string; source: string; url?: string }
export interface TournamentRecord { ltk: LtkAppearance[]; coach: CoachSeason[]; pro: ProCareer[]; other: OtherTournament[] }

export interface TournamentConfig {
  /** 添字 = LTK の参加シーズン数。最後の値を超えたら最後の値 */
  seasonScores: number[];
  gamesFull: number;
  gamesMax: number;
  coachPerSeason: number;
  coachMax: number;
  proPerYear: Record<string, number>;
  proMax: number;
  otherPer: number;
  otherMax: number;
}

export interface EvidenceConfig { shotcalling: ShotcallingConfig; tournament: TournamentConfig }

export interface EvidenceItem {
  text: string;
  source: string;
  url?: string;
  /** 「AI 収集」など */
  marks: string[];
  used: boolean;
}

export interface EvidenceAxisResult {
  key: 'shotcalling' | 'tournament';
  label: string;
  score: number;
  confidence: Confidence;
  confidenceReason: string;
  /** 軸に付ける印(「AI 収集」) */
  marks: string[];
  reason: string;
  evidence: EvidenceItem[];
}

export const AI_MARK = 'AI 収集';
const round = (x: number) => Math.round(x * 100) / 100;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** 評価設定の既定値(src/rating/config.json の evidence) */
export function loadEvidenceConfig(): EvidenceConfig {
  return structuredClone((defaults as unknown as { evidence: EvidenceConfig }).evidence);
}

/** 基準13〜16: コール力。肯定は 5.0 から強さで積み(上限 9.5)、否定があれば上限 4.0、肯定が無ければ 2.5 */
export function shotcallingAxis(entries: readonly ShotcallingEvidence[], cfg: ShotcallingConfig = loadEvidenceConfig().shotcalling): EvidenceAxisResult {
  const weight = (e: ShotcallingEvidence) => cfg.kindWeights[e.kind] ?? 0;
  const used = entries.filter((e) => weight(e) > 0);
  const pos = used.filter((e) => e.direction === '+');
  const neg = used.filter((e) => e.direction === '-');

  // 基準16(2026-10-09 改訂): 肯定と否定の強さの差で決める
  let score: number;
  const why: string[] = [];
  const points = (list: ShotcallingEvidence[]) => list.reduce((s, e) => s + cfg.strengthPoints[e.strength] * weight(e), 0);
  const posSum = points(pos);
  const negSum = points(neg);
  if (pos.length === 0) {
    score = cfg.noPositive;
    why.push(`コール役の実績が見当たらない(肯定の根拠 0 件)ため ${cfg.noPositive}`);
    if (neg.length > 0) why.push(`否定の根拠 ${neg.length} 件(コールを任せる・指示を聞く側)`);
  } else {
    const net = posSum - negSum;
    if (net > 0) {
      score = Math.min(cfg.max, cfg.base + net);
      why.push(`肯定 ${pos.length} 件(${summarizeKinds(pos)}、強さ ${round(posSum)})− 否定 ${neg.length} 件(強さ ${round(negSum)})= ${round(net)} で ${cfg.base} + ${round(net)}(上限 ${cfg.max})`);
    } else {
      score = clamp(cfg.negativeCap + net * 0.5, cfg.noPositive, cfg.negativeCap);
      why.push(`否定の根拠(強さ ${round(negSum)})が肯定(強さ ${round(posSum)})以上のため ${cfg.negativeCap} + ${round(net)} × 0.5(${cfg.noPositive}〜${cfg.negativeCap})`);
    }
  }
  if (neg.some((e) => e.kind === 'owner-confirmation') && score > cfg.negativeCap) {
    score = cfg.negativeCap;
    why.push(`価値責任者が「コールしない側」と確認したため上限 ${cfg.negativeCap}`);
  }

  const human = used.filter((e) => e.collectedBy === 'human').length;
  const ai = used.filter((e) => e.collectedBy === 'ai');
  const aiPoints = ai.reduce((s, e) => s + cfg.confidence.aiPoints[e.strength], 0);
  let confidence: Confidence = '低';
  if (human >= cfg.confidence.highHuman) confidence = '高';
  else if (human >= cfg.confidence.midHuman || aiPoints >= cfg.confidence.midAiPoints) confidence = '中';
  const confidenceReason = `人が確認した根拠 ${human} 件、AI が集めた根拠 ${ai.length} 件(強さの合計 ${round(aiPoints)})`;

  const evidence: EvidenceItem[] = entries.map((e) => ({
    text: `${e.direction === '+' ? '肯定' : '否定'}・${e.strength}・${KIND_LABEL[e.kind]}: ${e.summary}`,
    source: e.source,
    marks: e.collectedBy === 'ai' ? [AI_MARK] : [],
    used: weight(e) > 0,
  }));
  return {
    key: 'shotcalling',
    label: 'コール力',
    score: round(clamp(score, 0, 10)),
    confidence,
    confidenceReason,
    marks: ai.length > 0 ? [AI_MARK] : [],
    reason: why.join('。'),
    evidence,
  };
}

const KIND_LABEL: Record<EvidenceKind, string> = {
  player: '選手としてのコール',
  coach: 'コーチとしての指示',
  'other-game': '他ゲームの IGL',
  other: 'コールの根拠でない経歴',
  'owner-confirmation': '価値責任者の確認',
};

function summarizeKinds(list: readonly ShotcallingEvidence[]): string {
  const n = new Map<EvidenceKind, number>();
  for (const e of list) n.set(e.kind, (n.get(e.kind) ?? 0) + 1);
  return [...n].map(([k, c]) => `${KIND_LABEL[k]} ${c}`).join('・');
}

/** 基準12: 大会経験。LTK の参加シーズン数を基準に、試合数(勝率は使わない)・コーチ・プロの経歴・他の大会を加える */
export function tournamentAxis(record: TournamentRecord, cfg: TournamentConfig = loadEvidenceConfig().tournament): EvidenceAxisResult {
  const seasons = new Set(record.ltk.map((x) => x.season)).size;
  const seasonScore = cfg.seasonScores[Math.min(seasons, cfg.seasonScores.length - 1)];
  const games = record.ltk.reduce((s, x) => s + (x.wins ?? 0) + (x.losses ?? 0), 0);
  const gamesBonus = Math.min(cfg.gamesMax, (cfg.gamesMax * games) / cfg.gamesFull);
  const coachBonus = Math.min(cfg.coachMax, cfg.coachPerSeason * record.coach.length);
  const proRaw = record.pro.reduce((s, x) => s + (cfg.proPerYear[x.league] ?? 0) * x.years, 0);
  const proBonus = Math.min(cfg.proMax, proRaw);
  const otherBonus = Math.min(cfg.otherMax, cfg.otherPer * record.other.length);
  const score = clamp(seasonScore + gamesBonus + coachBonus + proBonus + otherBonus, 0, 10);

  const list = (xs: string[]) => (xs.length ? xs.join('、') : 'なし');
  const reason = [
    `LTK の参加 ${seasons} シーズン(${list(record.ltk.map((x) => `${x.season} ${x.team} ${x.tier} ${x.role}`))})で ${seasonScore}`,
    `LTK の出場 ${games} 試合で +${round(gamesBonus)}(勝率は使わない)`,
    `コーチ ${record.coach.length} シーズンで +${round(coachBonus)}`,
    `プロの経歴(${list(record.pro.map((x) => `${x.league} ${x.team} ${x.years} 年`))})で +${round(proBonus)}`,
    `他の大会 ${record.other.length} 件で +${round(otherBonus)}`,
  ].join('。');

  const item = (text: string, x: { source: string; url?: string }): EvidenceItem => ({ text, source: x.source, url: x.url, marks: [AI_MARK], used: true });
  const evidence = [
    ...record.ltk.map((x) => item(`LTK ${x.season} ${x.team} ${x.tier} ${x.role}${x.wins !== null && x.losses !== null ? ` ${x.wins}-${x.losses}` : ''}`, x)),
    ...record.coach.map((x) => item(`LTK ${x.season} ${x.team} のコーチ`, x)),
    ...record.pro.map((x) => item(`${x.league} ${x.team} ${x.years} 年${x.note ? `(${x.note})` : ''}`, x)),
    ...record.other.map((x) => item(x.name, x)),
  ];
  const sourced = evidence.length > 0;
  return {
    key: 'tournament',
    label: '大会経験',
    score: round(score),
    confidence: sourced ? '高' : '中',
    confidenceReason: sourced ? `出典つきの記録 ${evidence.length} 件` : '出場の記録が見当たらない(初参戦)',
    marks: sourced ? [AI_MARK] : [],
    reason,
    evidence,
  };
}

// --- 根拠の記録の読み込み(docs/research/grounds/normalized/*.json。調査の根拠を正規化した記録) ---

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const KINDS: readonly string[] = ['player', 'coach', 'other-game', 'other', 'owner-confirmation'];
const STRENGTHS: readonly string[] = ['強', '中', '弱'];

function readPlayers(raw: unknown, kind: string): { players: [string, Record<string, unknown>][]; errors: string[] } {
  if (!isObj(raw) || raw.kind !== kind || !isObj(raw.players)) return { players: [], errors: [`kind が ${kind} のスナップショットではない`] };
  return { players: Object.entries(raw.players).filter((e): e is [string, Record<string, unknown>] => isObj(e[1])), errors: [] };
}

/** 出典・向き・強さ・種類・集めた主体のどれかが欠けた根拠を拒否する(選手をエラーに出す) */
export function readShotcallingSnapshot(raw: unknown): { players: Record<string, ShotcallingEvidence[]>; errors: string[] } {
  const { players, errors } = readPlayers(raw, 'evidence-shotcalling');
  const out: Record<string, ShotcallingEvidence[]> = {};
  for (const [id, p] of players) {
    out[id] = [];
    const list = Array.isArray(p.evidence) ? p.evidence : [];
    list.forEach((e: unknown, i) => {
      const ok = isObj(e) && str(e.summary) && str(e.source) && (e.direction === '+' || e.direction === '-') &&
        STRENGTHS.includes(e.strength as string) && KINDS.includes(e.kind as string) && (e.collectedBy === 'ai' || e.collectedBy === 'human');
      if (ok) out[id].push(e as unknown as ShotcallingEvidence);
      else errors.push(`${id}: コール力の根拠 ${i + 1} 件目に出典・向き・強さ・種類・集めた主体のどれかが無い`);
    });
  }
  return { players: out, errors };
}

/** 出典の無い記録を拒否する(選手と項目をエラーに出す) */
export function readTournamentSnapshot(raw: unknown): { players: Record<string, TournamentRecord>; errors: string[] } {
  const { players, errors } = readPlayers(raw, 'evidence-tournament');
  const out: Record<string, TournamentRecord> = {};
  for (const [id, p] of players) {
    const take = <T>(key: keyof TournamentRecord, valid: (x: Record<string, unknown>) => boolean): T[] => {
      const xs = Array.isArray(p[key]) ? (p[key] as unknown[]) : [];
      return xs.filter((x, i) => {
        const ok = isObj(x) && str(x.source) && valid(x);
        if (!ok) errors.push(`${id}: ${key} の ${i + 1} 件目に出典または必要な値が無い`);
        return ok;
      }) as T[];
    };
    out[id] = {
      ltk: take<LtkAppearance>('ltk', (x) => str(x.season)),
      coach: take<CoachSeason>('coach', (x) => str(x.season)),
      pro: take<ProCareer>('pro', (x) => str(x.league) && typeof x.years === 'number' && x.years >= 0),
      other: take<OtherTournament>('other', (x) => str(x.name)),
    };
  }
  return { players: out, errors };
}

// --- 経歴の記録の読み込み(docs/research/grounds/normalized/career.json。基準28〜30) ---

/** 評価の入力に使う経歴: 出典つきの最高ランク(歴代・今季)と、出典つきのプロの経歴 */
export interface CareerInput {
  peakRank: RankEntry | null;
  seasonPeakRank: RankEntry | null;
  exPro: ExProCareer | null;
}

/** 基準29: 元プロとして扱う lol.highestLevel の区分 */
export const PRO_LEVELS: readonly string[] = ['overseas-major', 'LJL-starter', 'LJL-sub', 'overseas-minor', 'LJL CS-starter', 'LJL CS-sub', 'academy'];
/** 経歴の記録の division(1〜4。Master 以上は null)→ ランクの表記 */
const DIVISION_TEXT: Record<string, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

/**
 * 経歴の記録を読む。最高ランクは peak.allTime(歴代)と peak.thisSeason(今季)の tier・division・lp・出典(LP 不明は 0 LP)、
 * プロの経歴は lol.highestLevel とその出典(lol.statusSource。無ければ元の行 lol.basis)。出典の無いものは使わず、選手と項目をエラーに出す
 */
export function readCareerSnapshot(raw: unknown): { players: Record<string, CareerInput>; errors: string[] } {
  const { players, errors } = readPlayers(raw, 'evidence-career-normalized');
  const out: Record<string, CareerInput> = {};
  for (const [id, p] of players) {
    const readPeak = (key: 'allTime' | 'thisSeason', label: string): RankEntry | null => {
      const peak = isObj(p.peak) && isObj(p.peak[key]) ? p.peak[key] : null;
      if (!peak || !str(peak.tier)) return null;
      if (!str(peak.source)) {
        errors.push(`${id}: ${label}(${String(peak.tier)})に出典が無い`);
        return null;
      }
      const division = DIVISION_TEXT[String(peak.division ?? '')] ?? (str(peak.division) ? String(peak.division).toUpperCase() : '');
      return { tier: String(peak.tier), division, lp: typeof peak.lp === 'number' ? peak.lp : 0, source: String(peak.source) };
    };
    const entry: CareerInput = { peakRank: readPeak('allTime', '最高ランク'), seasonPeakRank: readPeak('thisSeason', '最高ランク(今季)'), exPro: null };
    const lol = isObj(p.lol) ? p.lol : null;
    const level = lol && str(lol.highestLevel) ? String(lol.highestLevel) : 'none';
    if (lol && PRO_LEVELS.includes(level)) {
      const basis = (Array.isArray(lol.basis) ? lol.basis : []).filter(str).map(String);
      const source = str(lol.statusSource) ? String(lol.statusSource) : basis.length ? `経歴の記録(career.json)の ${basis.join('・')}` : null;
      if (source) entry.exPro = { level, source };
      else errors.push(`${id}: プロの経歴(${level})に出典が無い`);
    }
    out[id] = entry;
  }
  return { players: out, errors };
}
