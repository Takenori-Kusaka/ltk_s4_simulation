// F-009 Task-3: 根拠の軸(コール力・大会経験)。ADR-0004 決定5・7、docs/design/rating-model.md 節2
// 入力は出典つきの根拠と評価設定だけ。ランク・ソロキューのデータ・データの軸は受け取らない(基準13)
import { reachTime } from './engine.ts';
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
  /** 根拠の出どころ。`scrim-transcript` で始まればスクリムの配信の文字起こし(F-004 基準17: 話者の特定と時刻つきの URL を要し、確度は「低」) */
  origin?: string;
  /** スクリムの文字起こしで、話者を本人と特定した印 */
  speakerIdentified?: boolean;
  kindBy?: string;
}

/** F-004 基準17: スクリムの配信の文字起こしから作った根拠か */
export const isScrimTranscript = (e: Pick<ShotcallingEvidence, 'origin'>): boolean => typeof e.origin === 'string' && e.origin.startsWith('scrim-transcript');
export const SCRIM_TRANSCRIPT_MARK = '確度「低」(スクリムの文字起こし)';

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
/** 国際大会の記録(経歴の記録 career.json の lol.internationalEvents)。出典は lol.statusSource、無ければ ref が指す経歴の記録の行(基準12 の改訂) */
export interface InternationalEvent { event: string; year: number; source: string; url?: string; ref?: string }
export interface TournamentRecord {
  ltk: LtkAppearance[];
  coach: CoachSeason[];
  pro: ProCareer[];
  other: OtherTournament[];
  /** 国際大会の記録(出典つき)。省略時は無し */
  international?: InternationalEvent[];
}

export interface TournamentConfig {
  /** 添字 = LTK の参加シーズン数。最後の値を超えたら最後の値 */
  seasonScores: number[];
  gamesFull: number;
  gamesMax: number;
  coachPerSeason: number;
  coachMax: number;
  proPerYear: Record<string, number>;
  proMax: number;
  /** 国際大会 1 大会の加点(基準12 の改訂。初期値 0.5。省略時 0) */
  internationalPer?: number;
  /** 国際大会の加点の上限(初期値 1.0。省略時 0) */
  internationalMax?: number;
  /** 基準32 の重複の判定に使う別名の表(大会名 → 別名。省略時は大会名だけで判定する) */
  internationalAliases?: Record<string, string[]>;
  otherPer: number;
  otherMax: number;
  /** 今のロール以外での LTK の出場の重み(基準12 の改訂。初期値 0.5。省略時 1) */
  roleOtherWeight?: number;
  /** 層ごとの LTK の出場の重み(初期値 MASTERS 1・CORE 1・NEXT 0.75。省略時 1) */
  tierWeights?: Record<string, number>;
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

  // F-004 基準17: スクリムの文字起こしの根拠は点数には使うが確度は「低」(確度の数に入れない)
  const scrim = used.filter(isScrimTranscript).length;
  const human = used.filter((e) => e.collectedBy === 'human' && !isScrimTranscript(e)).length;
  const ai = used.filter((e) => e.collectedBy === 'ai' && !isScrimTranscript(e));
  const aiPoints = ai.reduce((s, e) => s + cfg.confidence.aiPoints[e.strength], 0);
  let confidence: Confidence = '低';
  if (human >= cfg.confidence.highHuman) confidence = '高';
  else if (human >= cfg.confidence.midHuman || aiPoints >= cfg.confidence.midAiPoints) confidence = '中';
  const confidenceReason = `人が確認した根拠 ${human} 件、AI が集めた根拠 ${ai.length} 件(強さの合計 ${round(aiPoints)})${scrim ? `、スクリムの文字起こしの根拠 ${scrim} 件(確度「低」。確度の数に入れない)` : ''}`;

  const evidence: EvidenceItem[] = entries.map((e) => ({
    text: `${e.direction === '+' ? '肯定' : '否定'}・${e.strength}・${KIND_LABEL[e.kind]}: ${e.summary}`,
    source: e.source,
    marks: [...(e.collectedBy === 'ai' ? [AI_MARK] : []), ...(isScrimTranscript(e) ? [SCRIM_TRANSCRIPT_MARK] : [])],
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
/** ロール転向の割引(基準31): LTK の出場シーズンのうち今のロール以外の割合 × penalty。出場歴が無い・ロールが不明なら 0 */
export function roleSwitchDiscount(record: TournamentRecord, currentRole: string | undefined, penalty: number): { value: number; reason: string | null } {
  const same = new Map<string, boolean>();
  if (currentRole) for (const x of record.ltk) same.set(x.season, (same.get(x.season) ?? false) || x.role === currentRole);
  if (!currentRole || same.size === 0 || penalty <= 0) return { value: 0, reason: null };
  const other = [...same.values()].filter((s) => !s).length;
  const value = (penalty * other) / same.size;
  return { value, reason: value > 0 ? `ロール転向の割引 −${round(value)}(LTK の出場 ${same.size} シーズンのうち ${currentRole} は ${same.size - other})` : null };
}

const YEAR_IN_NAME = /(?<!\d)\d{4}(?!\d)/g;
const sameName = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/**
 * 基準32: 他の大会の名前が指す国際大会の記録。名前が大会名(または別名の表にある別名)を含み、
 * 名前の 4 桁の年が大会の年と同じなら同じ大会(名前に 4 桁の年が無ければ大会名だけで判定する)。無ければ null
 */
function internationalDuplicate(name: string, events: readonly InternationalEvent[], aliases: Record<string, string[]>): InternationalEvent | null {
  const text = sameName(name);
  const years = (name.match(YEAR_IN_NAME) ?? []).map(Number);
  const groups = Object.entries(aliases).map(([k, v]) => [k, ...v].map(sameName));
  return events.find((e) => {
    if (years.length > 0 && !years.includes(e.year)) return false;
    const key = sameName(e.event);
    return [key, ...(groups.find((g) => g.includes(key)) ?? [])].some((k) => k.length > 0 && text.includes(k));
  }) ?? null;
}

export function tournamentAxis(record: TournamentRecord, cfg: TournamentConfig = loadEvidenceConfig().tournament, currentRole?: string): EvidenceAxisResult {
  // 基準12 の改訂(2026-10-10): 今のロール以外での出場は roleOtherWeight、層ごとに tierWeights の重みで数える(シーズンの点は補間)
  const weightOf = (x: { tier: string; role: string }) => (currentRole && x.role !== currentRole ? cfg.roleOtherWeight ?? 1 : 1) * (cfg.tierWeights?.[x.tier] ?? 1);
  const seasonWeight = new Map<string, number>();
  for (const x of record.ltk) seasonWeight.set(x.season, Math.max(seasonWeight.get(x.season) ?? 0, weightOf(x)));
  const seasons = seasonWeight.size;
  const effSeasons = Math.min([...seasonWeight.values()].reduce((s, w) => s + w, 0), cfg.seasonScores.length - 1);
  const lo = Math.floor(effSeasons), hi = Math.min(lo + 1, cfg.seasonScores.length - 1);
  const seasonScore = cfg.seasonScores[lo] + (cfg.seasonScores[hi] - cfg.seasonScores[lo]) * (effSeasons - lo);
  const games = record.ltk.reduce((s, x) => s + (x.wins ?? 0) + (x.losses ?? 0), 0);
  const effGames = record.ltk.reduce((s, x) => s + ((x.wins ?? 0) + (x.losses ?? 0)) * weightOf(x), 0);
  const gamesBonus = Math.min(cfg.gamesMax, (cfg.gamesMax * effGames) / cfg.gamesFull);
  const coachBonus = Math.min(cfg.coachMax, cfg.coachPerSeason * record.coach.length);
  const proRaw = record.pro.reduce((s, x) => s + (cfg.proPerYear[x.league] ?? 0) * x.years, 0);
  const proBonus = Math.min(cfg.proMax, proRaw);
  // 基準12 の改訂(2026-10-11): 国際大会の記録を 1 大会ごとに足す(同じ大会名と年は 1 大会。上限あり)
  const international = [...new Map((record.international ?? []).map((x) => [`${sameName(x.event)} ${x.year}`, x])).values()];
  const internationalBonus = Math.min(cfg.internationalMax ?? 0, (cfg.internationalPer ?? 0) * international.length);
  // 基準32: 国際大会の記録と同じ大会(大会名または別名、同じ年)を指す他の大会は、他の大会として数えない
  const isDuplicate = record.other.map((x) => internationalDuplicate(x.name, international, cfg.internationalAliases ?? {}) !== null);
  const duplicated = record.other.filter((_, i) => isDuplicate[i]);
  const countedOthers = record.other.length - duplicated.length;
  const otherBonus = Math.min(cfg.otherMax, cfg.otherPer * countedOthers);
  const score = clamp(seasonScore + gamesBonus + coachBonus + proBonus + internationalBonus + otherBonus, 0, 10);

  const list = (xs: string[]) => (xs.length ? xs.join('、') : 'なし');
  const reason = [
    `LTK の参加 ${seasons} シーズン(${list(record.ltk.map((x) => `${x.season} ${x.team} ${x.tier} ${x.role}`))})で ${round(seasonScore)}${Math.abs(effSeasons - seasons) > 1e-9 ? `(今のロール以外・NEXT の出場を軽く数えて ${round(effSeasons)} シーズン相当)` : ''}`,
    `LTK の出場 ${games} 試合で +${round(gamesBonus)}(勝率は使わない)`,
    `コーチ ${record.coach.length} シーズンで +${round(coachBonus)}`,
    `プロの経歴(${list(record.pro.map((x) => `${x.league} ${x.team} ${x.years} 年`))})で +${round(proBonus)}`,
    `国際大会 ${international.length} 件${international.length ? `(${international.map((x) => `${x.event} ${x.year}`).join('、')})` : ''}で +${round(internationalBonus)}`,
    `他の大会 ${countedOthers} 件で +${round(otherBonus)}${duplicated.length ? `(${duplicated.map((x) => x.name).join('、')} は国際大会の項で数えた)` : ''}`,
  ].join('。');

  const item = (text: string, x: { source: string; url?: string }, used = true): EvidenceItem => ({ text, source: x.source, url: x.url, marks: [AI_MARK], used });
  const evidence = [
    ...record.ltk.map((x) => item(`LTK ${x.season} ${x.team} ${x.tier} ${x.role}${x.wins !== null && x.losses !== null ? ` ${x.wins}-${x.losses}` : ''}`, x)),
    ...record.coach.map((x) => item(`LTK ${x.season} ${x.team} のコーチ`, x)),
    ...record.pro.map((x) => item(`${x.league} ${x.team} ${x.years} 年${x.note ? `(${x.note})` : ''}`, x)),
    ...international.map((x) => item(`国際大会 ${x.event} ${x.year}`, x)),
    ...record.other.map((x, i) => (isDuplicate[i] ? item(`${x.name}(国際大会の項で数えた)`, x, false) : item(x.name, x))),
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

/** 時刻つきの URL(例 https://www.youtube.com/watch?v=…&t=27865s) */
const TIMED_URL = /^https?:\/\/\S+[?&#]t=\d+/;

/**
 * 出典・向き・強さ・種類・集めた主体のどれかが欠けた根拠を拒否する(選手をエラーに出す)。
 * F-004 基準17: スクリムの文字起こしの根拠(origin が scrim-transcript で始まる)は、話者を本人と特定した印
 * speakerIdentified: true と時刻つきの URL が無ければ読まず、選手 ID と理由を warnings に出す
 */
export function readShotcallingSnapshot(raw: unknown): { players: Record<string, ShotcallingEvidence[]>; errors: string[]; warnings: string[] } {
  const { players, errors } = readPlayers(raw, 'evidence-shotcalling');
  const warnings: string[] = [];
  const out: Record<string, ShotcallingEvidence[]> = {};
  for (const [id, p] of players) {
    out[id] = [];
    const list = Array.isArray(p.evidence) ? p.evidence : [];
    list.forEach((e: unknown, i) => {
      const ok = isObj(e) && str(e.summary) && str(e.source) && (e.direction === '+' || e.direction === '-') &&
        STRENGTHS.includes(e.strength as string) && KINDS.includes(e.kind as string) && (e.collectedBy === 'ai' || e.collectedBy === 'human');
      if (!ok) return void errors.push(`${id}: コール力の根拠 ${i + 1} 件目に出典・向き・強さ・種類・集めた主体のどれかが無い`);
      const item = e as unknown as ShotcallingEvidence;
      if (isScrimTranscript(item)) {
        const why = [item.speakerIdentified === true ? null : '話者を本人と特定した印(speakerIdentified)が無い', TIMED_URL.test(item.source) ? null : '時刻つきの URL が無い'].filter(Boolean);
        if (why.length) return void warnings.push(`${id}: スクリムの文字起こしのコール力の根拠 ${i + 1} 件目を読まない(${why.join('、')})`);
      }
      out[id].push(item);
    });
  }
  return { players: out, errors, warnings };
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

/** 経歴の記録の lol のうち、大会経験に使う部分: 水準ごとの年数(lol.years)、出典(lol.statusSource)、国際大会の記録(lol.internationalEvents。出典つき) */
export interface CareerLol {
  years: Record<string, number>;
  statusSource: string | null;
  international?: InternationalEvent[];
}

/** 評価の入力に使う経歴: 出典つきの最高ランク(歴代・今季)、出典つきのプロの経歴、プロの年数 */
export interface CareerInput {
  peakRank: RankEntry | null;
  seasonPeakRank: RankEntry | null;
  exPro: ExProCareer | null;
  lol: CareerLol | null;
}

/** 基準29: 元プロとして扱う lol.highestLevel の区分 */
export const PRO_LEVELS: readonly string[] = ['overseas-major', 'LJL-starter', 'LJL-sub', 'overseas-minor', 'LJL CS-starter', 'LJL CS-sub', 'academy'];

/** 基準12 の追記: 経歴の記録の水準 → 出場記録(tournament.json の pro)のリーグの区分 */
export const PRO_LEAGUE_GROUP: Record<string, string> = {
  'LJL-starter': 'LJL',
  'LJL-sub': 'LJL',
  'LJL CS-starter': 'LJL CS',
  'LJL CS-sub': 'LJL CS',
  'overseas-major': 'その他のプロ',
  'overseas-minor': 'その他のプロ',
  academy: 'その他のプロ',
};
const PRO_LEAGUES: readonly string[] = ['LJL', 'LJL CS', 'その他のプロ'];
const CAREER_FILE = 'docs/research/grounds/normalized/career.json';

/**
 * 基準12 の追記(2026-10-11): プロの年数は、経歴の記録(lol.years)と出場記録(pro)のリーグの区分ごとの大きい方。
 * 経歴の記録の方が多い区分だけ、差分を「経歴の記録(career.json)」の項として足す(出典は lol.statusSource、無ければ記録のファイル)。
 * 出場記録の項は変えず、減らさない。経歴の記録が無ければ出場記録のまま
 */
export function mergeProYears(tournamentPro: readonly ProCareer[], careerLol: CareerLol | null | undefined): ProCareer[] {
  if (!careerLol) return [...tournamentPro];
  const career: Record<string, number> = {};
  for (const [level, y] of Object.entries(careerLol.years ?? {})) {
    const league = PRO_LEAGUE_GROUP[level];
    if (league && Number.isFinite(y) && y > 0) career[league] = (career[league] ?? 0) + y;
  }
  const recorded: Record<string, number> = {};
  for (const x of tournamentPro) recorded[x.league] = (recorded[x.league] ?? 0) + x.years;
  const url = careerLol.statusSource?.split(/\s*;\s*/).find((s) => /^https?:\/\//.test(s));
  const added: ProCareer[] = [];
  for (const league of PRO_LEAGUES) {
    const diff = (career[league] ?? 0) - (recorded[league] ?? 0);
    if (diff <= 0) continue;
    added.push({ league, team: '経歴の記録(career.json)', years: diff, note: '出場記録より多い年数の差', source: careerLol.statusSource || CAREER_FILE, ...(url ? { url } : {}) });
  }
  return [...tournamentPro, ...added];
}
/** 経歴の記録の division(1〜4。Master 以上は null)→ ランクの表記 */
const DIVISION_TEXT: Record<string, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

/** 到達の時点に読む西暦の年の範囲(LoL の公開の年から。LP などの 4 桁の数を年と読まないため) */
const REACH_YEAR_MIN = 2009;
const REACH_YEAR_MAX = 2099;

/**
 * 到達の時点の読み方(用語): 歴代の最高ランクの記録の自由記述(peak.allTime.when)から、西暦 4 桁の年(2019・2024-01・2026年9月・2020-02-15 の形)と
 * S<n>(n は 1〜20。2010 + n 年)を拾い、最も遅い日付を '2019'・'2024-01'・'2020-02-15' の形で返す
 * (年だけなら 7 月 1 日、年月だけならその月の 1 日として比べる)。どちらも書かれていなければ null(不明)
 */
export function readReachedAt(when: unknown): string | null {
  if (typeof when !== 'string') return null;
  const found: string[] = [];
  const two = (n: string) => n.padStart(2, '0');
  const isYear = (y: string) => Number(y) >= REACH_YEAR_MIN && Number(y) <= REACH_YEAR_MAX;
  // 年月日・年月(2020-02-15、2024-01、2026年9月)。拾った所は、年だけの読みと重ならないように除く
  const rest = when.replace(/(?<!\d)(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?(?!\d)|年(\d{1,2})月(?:(\d{1,2})日)?)/g, (all: string, y: string, m1?: string, d1?: string, m2?: string, d2?: string) => {
    const month = m1 ?? m2 ?? '';
    const day = d1 ?? d2;
    if (!isYear(y) || Number(month) < 1 || Number(month) > 12) return all;
    found.push(day && Number(day) >= 1 && Number(day) <= 31 ? `${y}-${two(month)}-${two(day)}` : `${y}-${two(month)}`);
    return ' ';
  });
  for (const m of rest.matchAll(/(?<!\d)(\d{4})(?!\d)/g)) if (isYear(m[1])) found.push(m[1]);
  for (const m of when.matchAll(/(?<![A-Za-z0-9])S(\d{1,2})(?!\d)/g)) if (Number(m[1]) >= 1 && Number(m[1]) <= 20) found.push(String(2010 + Number(m[1])));
  let latest: string | null = null;
  for (const at of found) if (latest === null || (reachTime(at) ?? -Infinity) > (reachTime(latest) ?? -Infinity)) latest = at;
  return latest;
}

/**
 * 経歴の記録を読む。最高ランクは peak.allTime(歴代)と peak.thisSeason(今季)の tier・division・lp・出典(LP 不明は 0 LP)、
 * プロの経歴は lol.highestLevel とその出典(lol.statusSource。無ければ元の行 lol.basis)。出典の無いものは使わず、選手と項目をエラーに出す。
 * 歴代の最高ランクには到達の時点(peak.allTime.when から読む)、プロの経歴には最終出場年(lol.lastCompetitiveYear)を付ける。読めなければ付けない(不明。基準35)
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
      // 基準33: 到達の時点は歴代の最高ランクだけに付ける(今季の最高ランクは減衰しない)
      const reachedAt = key === 'allTime' ? readReachedAt(peak.when) : null;
      return { tier: String(peak.tier), division, lp: typeof peak.lp === 'number' ? peak.lp : 0, source: String(peak.source), ...(reachedAt ? { reachedAt } : {}) };
    };
    const entry: CareerInput = { peakRank: readPeak('allTime', '最高ランク'), seasonPeakRank: readPeak('thisSeason', '最高ランク(今季)'), exPro: null, lol: null };
    const lol = isObj(p.lol) ? p.lol : null;
    const level = lol && str(lol.highestLevel) ? String(lol.highestLevel) : 'none';
    if (lol) {
      // 基準12 の追記: 水準ごとの年数(数でない値は捨てる)と出典。プロの経歴が無い選手は年数 0
      const years: Record<string, number> = {};
      for (const [k, v] of Object.entries(isObj(lol.years) ? lol.years : {})) if (Number.isFinite(Number(v))) years[k] = Number(v);
      const statusSource = str(lol.statusSource) ? String(lol.statusSource) : null;
      // 基準12 の改訂: 国際大会の記録。出典は lol.statusSource、無ければ ref が指す経歴の記録の行。どちらも無い項目は数えない
      const international: InternationalEvent[] = [];
      (Array.isArray(lol.internationalEvents) ? lol.internationalEvents : []).forEach((x: unknown, i) => {
        if (!isObj(x) || !str(x.event) || typeof x.year !== 'number' || !Number.isFinite(x.year)) return void errors.push(`${id}: 国際大会の記録 ${i + 1} 件目に大会名または年が無い`);
        const ref = str(x.ref) ? String(x.ref) : null;
        const source = statusSource ?? (ref ? `経歴の記録(career.json)の ${ref}` : null);
        if (!source) return void errors.push(`${id}: 国際大会の記録 ${i + 1} 件目(${String(x.event)} ${x.year})に出典が無い`);
        const url = statusSource?.split(/\s*;\s*/).find((s) => /^https?:\/\//.test(s));
        international.push({ event: String(x.event), year: x.year, source, ...(url ? { url } : {}), ...(ref ? { ref } : {}) });
      });
      entry.lol = { years, statusSource, international };
    }
    if (lol && PRO_LEVELS.includes(level)) {
      const basis = (Array.isArray(lol.basis) ? lol.basis : []).filter(str).map(String);
      const source = str(lol.statusSource) ? String(lol.statusSource) : basis.length ? `経歴の記録(career.json)の ${basis.join('・')}` : null;
      const years = lol.years && typeof lol.years === 'object' && Number.isFinite(Number((lol.years as Record<string, unknown>)[level])) ? Number((lol.years as Record<string, unknown>)[level]) : 0;
      // 基準34: 最終出場年(選手として公式戦に出た最後の年)。無ければ付けない(不明)
      const lastYear = typeof lol.lastCompetitiveYear === 'number' && Number.isInteger(lol.lastCompetitiveYear) ? lol.lastCompetitiveYear : null;
      if (source) entry.exPro = { level, source, years, ...(lastYear !== null ? { lastYear } : {}) };
      else errors.push(`${id}: プロの経歴(${level})に出典が無い`);
    }
    out[id] = entry;
  }
  return { players: out, errors };
}
