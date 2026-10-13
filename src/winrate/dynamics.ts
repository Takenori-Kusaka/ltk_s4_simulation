// F-005 Task-3: 仕上がりの項(基準 9・10・12・13)と気持ちの補正(基準 11 は関数だけ。本番の結果の入力は F-004 の範囲で未実装のため k = 0)
// 階級チームごとに共同プレイ歴 c・チャンピオンの近さ m_pool・メタの近さ m・仕上がりの速さ τ を作り、
// 試合日ごとの勝率は経過した試合日の数 d から純粋な関数で作る。DOM と Node 固有の API に依存しない
// 戦い方の近さ m_style は、F-010 の戦い方の特性とメタの一覧の mainstreamStyle がそろうまで使わず m = m_pool(基準10、確度「低」)
import config from './config.json' with { type: 'json' };
import { MASTERS_CUPS, REGULAR_DAYS } from '../sim/schedule.ts';
import type { TeamId, Tier } from '../sim/types.ts';
import { MIN_GAMES } from '../meta/match.ts';
import { loadOwnerViewConfig, type OwnerView } from '../rating/owner-views.ts';

export interface DynamicsConfig {
  /** 基準9・10: 仕上がりの項の上限 M(対数オッズ)、τ の基準 tau0(試合日)、c と m の効き a・b */
  maturation: { max: number; tau0: number; a: number; b: number };
  /** 用語「メタの近さ m」: m_pool と m_style の重み、m_pool の分母 5 × poolNorm */
  metaFit: { wPool: number; wStyle: number; poolNorm: number };
  /** 基準11: 連敗 k(2 以上)の気持ちの補正 −min(cap, perLoss × (k − 1)) */
  mood: { cap: number; perLoss: number };
  /** 基準13: 当てはまりの確認が済むまでの、各項の寄与の切り詰め(±) */
  unvalidatedCap: number;
  /** 基準17・18: 価値責任者の見立ての伸びしろの項と勢いの項(基準13 の切り詰めの対象にしない。基準19) */
  ownerView: { growthPerDay: number; growthCap: number; momentumStep: number; momentumHalf: number; momentumCap: number };
}
const CFG = config as unknown as DynamicsConfig;

/** 階級チームの 1 人(c と m_pool の材料)。集計のコマンドが名簿・出場記録・F-009 の評価から作る */
export interface MaturationMember {
  id: string;
  name: string;
  /** 大会のロール(TOP・JG・MID・ADC・SUP) */
  role: string;
  /** 過去の LTK(S1〜S3)の出場記録(tournament.json の ltk[]。season と team だけ使う) */
  ltk: readonly { season: string; team: string }[];
  /** F-009 のピックプール(大会のロールで 3 試合以上。ratings.json の pool 軸の poolDetail.list)。評価が無ければ空 */
  pool: readonly { championId: number; games: number }[];
  /** 基準17: 価値責任者の見立てのうち、この選手の伸びしろ(axis = growth)の項目 */
  ownerViews?: readonly OwnerView[];
}

/** 基準17〜20: 価値責任者の見立ての伸びしろの点 G と勢いの点 V、使った項目 */
export interface OwnerTerms {
  G: number;
  V: number;
  items: { name: string; axis: 'growth' | 'momentum'; direction: '+' | '-'; strength: string; date: string; quote: string }[];
}

/** F-011 のメタの重要チャンピオン(data/meta/<パッチ>.json の champions[]。段階A 1.0・段階B 0.5) */
export interface MetaChampionLike {
  role: string;
  key: number;
  name: string;
  tier: 'A' | 'B';
}
export const META_WEIGHT: Record<'A' | 'B', number> = { A: 1.0, B: 0.5 };

/** 用語「共同プレイ歴 c」の 1 組: 同じシーズンに同じチームだった 2 人(shared は "S3 CC" の形) */
export interface CoPlayPair {
  a: string;
  b: string;
  shared: string[];
}
/** 用語「チャンピオンの近さ m_pool」で当たった選手とチャンピオン */
export interface PoolHit {
  playerId: string;
  name: string;
  champion: string;
  tier: 'A' | 'B';
  weight: number;
  games: number;
}
/** 階級チームの仕上がり(勝率表のファイルの teams[].maturation) */
export interface Maturation {
  /** 10 組のうち同じシーズンに同じチームだった組の割合(0〜1) */
  c: number;
  cPairs: CoPlayPair[];
  /** 0〜1(小数第三位)。メタの一覧が無ければ 0.5(中立) */
  mPool: number;
  mPoolHits: PoolHit[];
  /** 戦い方の近さ。F-010 の特性か mainstreamStyle が無い間は null */
  mStyle: number | null;
  m: number;
  /** 仕上がりの速さ(試合日。小数第三位) */
  tau: number;
  /** 基準10・13: 当てはまりの確認が済むまで「低」 */
  confidence: '低';
  note: string;
  /** 基準17〜20: 価値責任者の見立て。項目が無ければ null */
  owner?: OwnerTerms | null;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000 + 0;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const logit = (p: number) => Math.log(p / (1 - p));
/** c の分母(5 人から作る 2 人の組)と m_pool の人数は名簿の 5 人で固定 */
export const PAIRS = 10;
export const MEMBERS = 5;

/** 用語「共同プレイ歴 c」: 10 組のうち、過去の LTK で同じシーズンに同じチームだった組の割合と、その組 */
export function coPlayOf(members: readonly MaturationMember[]): { c: number; pairs: CoPlayPair[] } {
  const keys = members.map((m) => [...new Set(m.ltk.map((x) => `${x.season} ${x.team}`))].sort());
  const pairs: CoPlayPair[] = [];
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const shared = keys[i].filter((k) => keys[j].includes(k));
      if (shared.length) pairs.push({ a: members[i].name, b: members[j].name, shared });
    }
  }
  return { c: pairs.length / PAIRS, pairs };
}

/** 用語「チャンピオンの近さ m_pool」: 5 人のピックプール(大会のロールで 3 試合以上)のうちメタの重要チャンピオンに当たる重みの合計 ÷ (5 × poolNorm)、1 で頭打ち。メタの一覧が無ければ 0.5 */
export function poolFitOf(
  members: readonly MaturationMember[], meta: readonly MetaChampionLike[] | null | undefined, cfg: DynamicsConfig = CFG,
): { mPool: number; hits: PoolHit[]; note: string | null } {
  if (!meta) return { mPool: 0.5, hits: [], note: 'F-011 のメタの一覧が無いため m_pool = 0.5(中立)' };
  const hits: PoolHit[] = [];
  for (const m of members) {
    for (const e of m.pool) {
      if (e.games < MIN_GAMES) continue;
      const c = meta.find((x) => x.role === m.role && x.key === e.championId);
      if (c) hits.push({ playerId: m.id, name: m.name, champion: c.name, tier: c.tier, weight: META_WEIGHT[c.tier], games: e.games });
    }
  }
  const sum = hits.reduce((s, h) => s + h.weight, 0);
  const noPool = members.filter((m) => !m.pool.length).map((m) => m.name);
  return { mPool: r3(Math.min(1, sum / (MEMBERS * cfg.metaFit.poolNorm))), hits, note: noPool.length ? `ピックプールの無い選手: ${noPool.join('・')}(0 として数える)` : null };
}

/** 基準10: τ = tau0 × (1 + a × (1 − c)) × (1 + b × (1 − m)) */
export function tauOf(c: number, m: number, cfg: DynamicsConfig = CFG): number {
  const k = cfg.maturation;
  return k.tau0 * (1 + k.a * (1 - c)) * (1 + k.b * (1 - m));
}

/** 階級チームの仕上がり。選手が無ければ c = 0・当たり無し。メタの一覧が無ければ m_pool = 0.5。m_style が無い間は m = m_pool(確度「低」) */
/** 用語「伸びしろの点 G」「勢いの点 V」: 5 人の伸びしろの項目と、階級チームの勢いの項目の Σ(向き × 強さの重み。F-009 の ownerView.strength) */
export function ownerTermsOf(members: readonly MaturationMember[], teamViews: readonly OwnerView[] = []): OwnerTerms | null {
  const w = loadOwnerViewConfig().strength;
  const items: OwnerTerms['items'] = [];
  let G = 0, V = 0;
  for (const m of members) {
    for (const v of m.ownerViews ?? []) {
      if (v.axis !== 'growth') continue;
      G += (v.direction === '+' ? 1 : -1) * w[v.strength];
      items.push({ name: m.name, axis: 'growth', direction: v.direction, strength: v.strength, date: v.date, quote: v.quote });
    }
  }
  for (const v of teamViews) {
    if (v.axis !== 'momentum') continue;
    V += (v.direction === '+' ? 1 : -1) * w[v.strength];
    items.push({ name: v.target, axis: 'momentum', direction: v.direction, strength: v.strength, date: v.date, quote: v.quote });
  }
  return items.length ? { G: r3(G), V: r3(V), items } : null;
}

/** 基準17: 伸びしろの項 = growthPerDay × G × d を ±growthCap に切り詰めた値 */
export function growthTerm(owner: OwnerTerms | null | undefined, d: number, cfg: DynamicsConfig = CFG): number {
  if (!owner || !(d > 0)) return 0;
  const k = cfg.ownerView;
  return clamp(k.growthPerDay * owner.G * d, -k.growthCap, k.growthCap);
}

/** 基準18: 勢いの項 = momentumStep × V × 0.5^(d ÷ momentumHalf) を ±momentumCap に切り詰めた値。d = 0(開幕)で最も大きい */
export function momentumTerm(owner: OwnerTerms | null | undefined, d: number, cfg: DynamicsConfig = CFG): number {
  if (!owner || !owner.V) return 0;
  const k = cfg.ownerView;
  return clamp(k.momentumStep * owner.V * Math.pow(0.5, Math.max(0, d) / k.momentumHalf), -k.momentumCap, k.momentumCap);
}

export function maturationOf(
  members: readonly MaturationMember[] | undefined, meta: readonly MetaChampionLike[] | null | undefined, cfg: DynamicsConfig = CFG,
  teamViews: readonly OwnerView[] = [],
): Maturation {
  const ms = members ?? [];
  const co = coPlayOf(ms);
  const pool = poolFitOf(ms, meta, cfg);
  const notes: string[] = [];
  if (!ms.length) notes.push('選手の記録が無い(c = 0)');
  if (pool.note) notes.push(pool.note);
  notes.push('F-010 の戦い方の特性とメタの一覧の mainstreamStyle が無いため m = m_pool(確度「低」)');
  notes.push(`S1〜S3 での当てはまりの確認(基準13)まで、寄与は ±${cfg.unvalidatedCap.toFixed(2)} に切り詰める`);
  const m = pool.mPool;
  const owner = ownerTermsOf(ms, teamViews);
  return { c: co.c, cPairs: co.pairs, mPool: pool.mPool, mPoolHits: pool.hits, mStyle: null, m, tau: r3(tauOf(co.c, m, cfg)), confidence: '低', note: notes.join('。'), owner };
}

/** 基準9: 仕上がりの項 M × (1 − exp(−d ÷ τ))。d = 0 で 0 */
export function maturationTerm(team: { tau: number }, d: number, cfg: DynamicsConfig = CFG): number {
  if (!(team.tau > 0) || !(d > 0)) return 0;
  return cfg.maturation.max * (1 - Math.exp(-d / team.tau));
}

/** 基準11: 連敗 k が 2 以上なら −min(cap, perLoss × (k − 1))、それ以外は 0。結果の入力(F-004)が無い間は k = 0 */
export function moodTerm(k: number, cfg: DynamicsConfig = CFG): number {
  return k >= 2 ? -Math.min(cfg.mood.cap, cfg.mood.perLoss * (k - 1)) : 0;
}

/** 基準17・18: 価値責任者の見立ての項(伸びしろ + 勢い)。A・B それぞれの値 */
export function ownerTerm(m: { owner?: OwnerTerms | null }, d: number, cfg: DynamicsConfig = CFG): number {
  return growthTerm(m.owner, d, cfg) + momentumTerm(m.owner, d, cfg);
}

/** 基準9・11・13・17〜19: A から見た対数オッズの加算(仕上がりの項の差と気持ちの補正の差は項ごとに ±unvalidatedCap に切り詰め、見立ての項の差はその外で加える) */
export function dayShift(
  A: { tau: number; owner?: OwnerTerms | null }, B: { tau: number; owner?: OwnerTerms | null }, dA: number, dB: number,
  opts: { kA?: number; kB?: number; config?: DynamicsConfig } = {},
): number {
  const cfg = opts.config ?? CFG;
  const cap = cfg.unvalidatedCap;
  const mat = clamp(maturationTerm(A, dA, cfg) - maturationTerm(B, dB, cfg), -cap, cap);
  const mood = clamp(moodTerm(opts.kA ?? 0, cfg) - moodTerm(opts.kB ?? 0, cfg), -cap, cap);
  return mat + mood + ownerTerm(A, dA, cfg) - ownerTerm(B, dB, cfg);
}

/** 事前の勝率 pA(0〜1)に対数オッズの加算を加えた勝率。加算 0 と 0・1 はそのまま(d = 0 の初日は、勢いの項(基準18)が無ければ事前の勝率と同じ値になる) */
export function winProbOnDay(pA: number, shift: number): number {
  if (shift === 0 || !(pA > 0 && pA < 1)) return pA;
  return sigmoid(logit(pA) + shift);
}

/** 両チームの勝率を 0.1% 単位で、和が 100.0 になるように丸める(F-005 基準1 と同じ) */
export function percentPair(p: number): [number, number] {
  const tenths = Math.round(p * 1000);
  return [tenths / 10, (1000 - tenths) / 10];
}

/** Playoffs の初日(docs/research/format-history.md 節2.2)。d はこの日までの試合日を数える(Playoffs の中の日の進みは F-001 の模擬が日を持たないため数えない) */
export const PLAYOFFS_DATE = '2026-11-21';

/** 用語「経過した試合日の数 d」: その日より前に、その階級チームが本番を戦った試合日の数。NEXT・CORE は Regular Stage、MASTERS は MASTERS CUP */
export function daysPlayedBefore(tier: Tier, team: TeamId, date: string): number {
  const dates = tier === 'MASTERS'
    ? MASTERS_CUPS.filter((c) => c.semis.some((s) => s.includes(team))).map((c) => c.date)
    : REGULAR_DAYS.filter((d) => d.cards.some((c) => c.blue === team || c.red === team)).map((d) => d.date);
  return new Set(dates.filter((x) => x < date)).size;
}

/** 勝率表のファイルの teams[] のうち、この計算に要る項目 */
export interface DayTeamLike {
  team: string;
  tier: string;
  S: number | null;
  maturation?: Maturation | null;
}
export interface DayWinrate {
  /** その試合日の A の勝率(0〜1) */
  p: number;
  prior: number;
  dA: number;
  dB: number;
  termA: number;
  termB: number;
  /** 基準17・18: 価値責任者の見立ての項(伸びしろ + 勢い) */
  ownerA: number;
  ownerB: number;
  /** 切り詰めた後の加算(A − B) */
  shift: number;
  /** 仕上がりを加えたか(両チームの戦力 S と τ がそろうときだけ。基準16 の 50.0% は動かさない) */
  applied: boolean;
  a: Maturation | null;
  b: Maturation | null;
}

/** その試合日(date)の A の勝率。事前の勝率 prior(0〜1)に、経過した試合日の数から作った仕上がりの項の差を加える */
export function dayWinrate(
  teams: readonly DayTeamLike[], tier: Tier, a: TeamId, b: TeamId, prior: number, date: string, cfg: DynamicsConfig = CFG,
): DayWinrate {
  const A = teams.find((t) => t.team === a && t.tier === tier);
  const B = teams.find((t) => t.team === b && t.tier === tier);
  const dA = daysPlayedBefore(tier, a, date), dB = daysPlayedBefore(tier, b, date);
  const ma = A?.maturation ?? null, mb = B?.maturation ?? null;
  const applied = !!(ma && mb && Number.isFinite(ma.tau) && Number.isFinite(mb.tau) && A?.S !== null && A?.S !== undefined && B?.S !== null && B?.S !== undefined);
  if (!applied) return { p: prior, prior, dA, dB, termA: 0, termB: 0, ownerA: 0, ownerB: 0, shift: 0, applied, a: ma, b: mb };
  const termA = maturationTerm(ma!, dA, cfg), termB = maturationTerm(mb!, dB, cfg);
  const ownerA = ownerTerm(ma!, dA, cfg), ownerB = ownerTerm(mb!, dB, cfg);
  const shift = dayShift(ma!, mb!, dA, dB, { config: cfg });
  return { p: winProbOnDay(prior, shift), prior, dA, dB, termA, termB, ownerA, ownerB, shift, applied, a: ma, b: mb };
}
