// F-005 Task-1: 勝率の土台(基準 1・2・3・6・7・16)。β、事前の勝率、ステージ補正、S を計算できないときの 50.0%、F-001 の勝率表の出力
// F-005 Task-6: マクロ項(基準 2・3・3b)。マクロの点数 M(F-010 のチームの軸の素点の平均)、β_macro、レーン相対とマクロ相対の勝率、掛け合わせ(対数オッズの和)
// 再判定 2: M は連携の厚み・司令塔の 2 軸(継続性は仕上がりの項で扱う)。外部の見立ての項 E・β_ext を足し、p_macro はマクロ項と外部の見立ての項の和から作る
// F-005 Task-3: 階級チームごとの仕上がり(共同プレイ歴 c・メタの近さ m・仕上がりの速さ τ)を teams[].maturation に出す(src/winrate/dynamics.ts)。
// 試合ごとの事前の勝率は d = 0 の値のまま(試合日ごとの勝率は dynamics.ts の純粋な関数で画面が作る)
// F-005 Task-2(基準4): 本番とスクリムの結果による θ の当て直し(src/winrate/update.ts)。試合ごとに、その試合日より前の結果で当て直す
// F-005 Task-8(基準3c): 外部の見立ての項は λ × (E_A − E_B)。λ = scrimHalf ÷ (scrimHalf + 両チームのその試合日より前のスクリムの試合数の平均)
// DOM と Node 固有の API に依存しない。気持ち・ドラフトの項は後のタスク(ここでは 0)
import config from './config.json' with { type: 'json' };
import { MASTERS_CUPS, REGULAR_DAYS } from '../sim/schedule.ts';
import { TEAMS, TIERS, type TeamId, type Tier } from '../sim/types.ts';
import type { WinTable } from '../sim/validate.ts';
import type { OwnerView } from '../rating/owner-views.ts';
import { fitTheta, type ResultGame, type ThetaConfig, type ThetaSide } from './update.ts';
import { maturationOf, type DynamicsConfig, type Maturation, type MaturationMember, type MetaChampionLike } from './dynamics.ts';

export type StageKey = 'regular' | 'masters' | 'playoffs';

/** 外部の見立ての設定: 広がり、強さの重み(強・中・弱)、E の切り詰め(±clip)、話者の自チームについての項目の係数、見立てが半分になるスクリムの試合数 */
export interface ExternalConfig {
  targetSd: number;
  strength: Record<string, number>;
  clip: number;
  selfTeam: number;
  /** 基準3c: λ = scrimHalf ÷ (scrimHalf + n_s)。省略時は λ = 1(弱めない) */
  scrimHalf?: number;
}

export interface WinrateConfig extends DynamicsConfig, ThetaConfig {
  beta: { targetSd: number };
  /** 基準3: β_macro × (M_A − M_B) の 6 組の二乗平均平方根を合わせる広がり */
  macro: { targetSd: number };
  /** 外部の見立ての項: β_ext × (E_A − E_B) の 6 組の二乗平均平方根を合わせる広がり */
  external: ExternalConfig;
  /** 基準6: ステージごと・階級チーム(例 DD-NEXT)ごとの対数オッズの加算値 */
  stage: Record<StageKey, Record<string, number>>;
  stageBasis: string;
  [k: string]: unknown;
}

/** 用語「マクロの点数 M」に使う F-010 のチームの軸(素点 `axes[].raw`)。継続性は入れない(新しい編成が一律に下がるため、仕上がりの項で扱う) */
export const MACRO_KEYS = ['synergy', 'shotcalling'] as const;
export type MacroKey = (typeof MACRO_KEYS)[number];

/** 外部の見立ての 1 件(docs/research/grounds/normalized/external-views.json の items[]) */
export const EXTERNAL_STRENGTHS = ['強', '中', '弱'] as const;
export interface ExternalView {
  /** 階級チーム(例 DD-CORE) */
  target: string;
  direction: '+' | '-';
  strength: (typeof EXTERNAL_STRENGTHS)[number];
  /** 話者が自チームについて言った項目(重みを external.selfTeam 倍にする) */
  selfTeam?: boolean;
  speaker?: string;
  speakerKind?: string;
  summary?: string;
  source?: string;
  date?: string;
}

/** M の内訳。raw は F-010 の相対評価の前の素点。無ければ null */
export interface MacroPart {
  key: MacroKey;
  label: string;
  raw: number | null;
}

/** 階級チームの戦力 S(F-010)。計算できないときは S を null にし、理由を書く */
export interface TierTeamS {
  team: TeamId;
  tier: Tier;
  S: number | null;
  reason?: string;
  /** マクロの点数 M。省略すれば macroParts から作り、macroParts も無ければ計算できない扱い(後方互換) */
  M?: number | null;
  /** M を計算できない理由(M が null のとき) */
  macroReason?: string;
  /** M の内訳(連携の厚み・司令塔・継続性の素点) */
  macroParts?: MacroPart[];
  /** Task-3: 仕上がりの材料(名簿の 5 人の LTK の出場記録とピックプール)。無ければ c = 0・当たり無しで計算する */
  members?: readonly MaturationMember[];
  /** 基準18: 価値責任者の見立てのうち、この階級チームの勢い(axis = momentum)の項目 */
  ownerViews?: readonly OwnerView[];
}

export interface TeamRow {
  key: string;
  team: TeamId;
  tier: Tier;
  S: number | null;
  /** S を計算できない理由(基準16)。計算できれば null */
  reason: string | null;
  /** 基準3b: マクロの点数 M(小数第二位)。計算できなければ null */
  M: number | null;
  macroParts: MacroPart[];
  /** M を計算できない理由。計算できれば null */
  macroReason: string | null;
  /** 外部の見立て E(Σ 向き × 強さの重みを ±clip に切り詰めた値。小数第一位)と件数。無ければ 0 */
  E: number;
  externalCount: number;
  /** Task-3(基準 9・10・12): 仕上がり(c・m_pool・m・τ と内訳)。試合日ごとの勝率は画面が dynamics.ts の関数で作る */
  maturation: Maturation;
  /** 基準4: すべての結果で当て直した θ と、使った本番・スクリムの試合数(結果が無ければ θ 0) */
  result: ThetaSide;
  /** 基準3c: すべての結果でのスクリムの試合数 n_s、見立ての残り具合 λ(小数第二位)、λ × E(小数第二位) */
  ns: number;
  lambda: number;
  lambdaE: number;
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
  /** 基準3b: 両チームのマクロの点数 M。計算できなければ null */
  mA: number | null;
  mB: number | null;
  /** 両チームの外部の見立て E */
  eA: number;
  eB: number;
  /** 基準3c: その試合日より前の両チームのスクリムの試合数 n_s と、見立ての残り具合 λ(小数第二位) */
  nsA: number;
  nsB: number;
  lambdaA: number;
  lambdaB: number;
  beta: number;
  betaMacro: number;
  betaExt: number;
  /** 基準2 の事前の対数オッズ(レーン項 + マクロ項 + 外部の見立ての項 + ステージ補正) */
  logit: number;
  /** レーン項 β × (S_A − S_B) */
  laneLogit: number;
  /** マクロ項 β_macro × (M_A − M_B)。M が無い側があれば 0 */
  macroLogit: number;
  /** 外部の見立ての項 β_ext × (λ_A × E_A − λ_B × E_B)(基準3c) */
  extLogit: number;
  /** 基準6: ステージ補正(A の値 − B の値) */
  stageTerm: number;
  /** 基準4: その試合日より前の結果で当て直した θ(A・B)と、項 θ_A − θ_B */
  thetaA: number;
  thetaB: number;
  thetaLogit: number;
  /** 基準4: 当て直しに使った結果の試合数(A・B それぞれの本番 + スクリム) */
  resultsA: number;
  resultsB: number;
  /** A の勝率(%、0.1 単位)。p_lane と p_macro の掛け合わせに、結果による更新の項とステージ補正を加えた値 */
  pA: number;
  pB: number;
  /** 基準3b: レーン相対の勝率 p_lane と、チームの能力(マクロ項 + 外部の見立ての項)の勝率 p_macro(%、0.1 単位。A と B の和が 100.0) */
  pLaneA: number;
  pLaneB: number;
  pMacroA: number;
  pMacroB: number;
  /** 外部の見立ての項だけの勝率 p_ext(%、0.1 単位。A と B の和が 100.0) */
  pExtA: number;
  pExtB: number;
  /** 基準4: 結果による更新の前の勝率(レーン項 + マクロ項 + 外部の見立ての項 + ステージ補正。%、0.1 単位) */
  pBeforeResultsA: number;
  /** 基準3b: M を計算できない階級チームが関わるとき(p_macro は 50.0%)の理由。無ければ null */
  macroMissing: string | null;
  /** 基準16: データ不足の表示と理由。無ければ null */
  dataMissing: string | null;
}

export interface WinrateOutput {
  kind: 'winrates';
  beta: Record<Tier, number>;
  betaBasis: Record<Tier, string>;
  /** 基準3: 階級ごとの β_macro とその根拠 */
  betaMacro: Record<Tier, number>;
  betaMacroBasis: Record<Tier, string>;
  /** 階級ごとの β_ext とその根拠 */
  betaExt: Record<Tier, number>;
  betaExtBasis: Record<Tier, string>;
  stageBasis: string;
  teams: TeamRow[];
  matches: MatchPrior[];
  winTable: WinTable;
  stageWinTables: Record<StageKey, WinTable>;
}

const CFG = config as unknown as WinrateConfig;
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
// 末尾の + 0 は −0 を 0 にする(0 × 負の差が −0 になり、出力の比較で区別されるのを避ける)
const r3 = (x: number) => Math.round(x * 1000) / 1000 + 0;
const r2 = (x: number) => Math.round(x * 100) / 100 + 0;
/** 小数第一位。0.05 の端数は 0 から遠い側へ丸める(符号で非対称にならないように) */
const r1 = (x: number) => (Math.sign(x) * Math.round(Math.abs(x) * 10)) / 10 + 0;

/** 同じ階級のチームの組(i < j)の値の差の二乗平均平方根(組の向きに依らない広がり)。組が無ければ 0 */
function rmsDiff(v: readonly number[]): number {
  const sq: number[] = [];
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) sq.push((v[i] - v[j]) ** 2);
  return sq.length ? Math.sqrt(sq.reduce((a, b) => a + b, 0) / sq.length) : 0;
}

/** 基準3: 同じ階級の4チームの6組の S(または M)の差の二乗平均平方根が targetSd になる β(または β_macro)。差がすべて 0 なら 0 */
export function betaOf(S: readonly number[], targetSd: number): number {
  const rms = rmsDiff(S);
  return rms > 1e-12 ? targetSd / rms : 0;
}

/** 基準3 の根拠の文。name は S か M、symbol は β か β_macro */
function scaleBasis(name: string, symbol: string, known: readonly number[], targetSd: number): string {
  const n = known.length;
  if (n < 2) return `${name} を計算できたチームが ${n} 件のため ${symbol} = 0`;
  const rms = rmsDiff(known);
  if (rms <= 1e-12) return `${n} チームの ${name} の差(${(n * (n - 1)) / 2} 組)がすべて 0 のため ${symbol} = 0`;
  return `${n} チームの ${name} の差(${(n * (n - 1)) / 2} 組)の二乗平均平方根 ${r3(rms)} に対して ${symbol} × 差の広がりが ${targetSd} になる値`;
}

/** 用語「マクロの点数 M」: 連携の厚み・司令塔・継続性の素点の平均(小数第二位)。素点の無い軸は除き、すべて無ければ null と理由 */
export function macroOf(parts: readonly MacroPart[]): { M: number | null; reason: string | null } {
  const known = parts.filter((p) => p.raw !== null && Number.isFinite(p.raw)).map((p) => p.raw as number);
  if (!known.length) {
    return { M: null, reason: parts.length ? `素点の無い軸: ${parts.map((p) => p.label).join('・')}` : 'F-010 のチームの軸が無い' };
  }
  return { M: r2(known.reduce((a, b) => a + b, 0) / known.length), reason: null };
}

/** external-views.json の中身を検証して項目にする。null・undefined(ファイルが無い)なら空。形の違う項目は理由を残して除く */
export function readExternalViews(raw: unknown): { items: ExternalView[]; errors: string[] } {
  if (raw === null || raw === undefined) return { items: [], errors: [] };
  const obj = raw as { kind?: unknown; items?: unknown };
  if (typeof raw !== 'object' || obj.kind !== 'external-views' || !Array.isArray(obj.items)) {
    return { items: [], errors: ['external-views.json の形が違う(kind "external-views" と items の配列)'] };
  }
  const keys = new Set(TIERS.flatMap((tier) => TEAMS.map((team) => `${team}-${tier}`)));
  const items: ExternalView[] = [];
  const errors: string[] = [];
  obj.items.forEach((it: unknown, i: number) => {
    const v = (it ?? {}) as Record<string, unknown>;
    const bad = [
      typeof v.target === 'string' && keys.has(v.target) ? null : `target ${JSON.stringify(v.target)}(階級チームではない)`,
      v.direction === '+' || v.direction === '-' ? null : `direction ${JSON.stringify(v.direction)}(+ か −)`,
      (EXTERNAL_STRENGTHS as readonly unknown[]).includes(v.strength) ? null : `strength ${JSON.stringify(v.strength)}(強・中・弱)`,
      v.selfTeam === undefined || typeof v.selfTeam === 'boolean' ? null : `selfTeam ${JSON.stringify(v.selfTeam)}(true か false)`,
    ].filter((x): x is string => x !== null);
    if (bad.length) errors.push(`external-views.json items[${i}]: ${bad.join('、')}`);
    else items.push(v as unknown as ExternalView);
  });
  return { items, errors };
}

/** 用語「外部の見立て E」: 階級チーム(key)ごとの Σ(向き × 強さの重み。話者の自チームについての項目は × selfTeam)を ±clip に切り詰めた値と件数 */
export function externalOf(items: readonly ExternalView[], key: string, cfg: ExternalConfig): { E: number; count: number } {
  const mine = items.filter((v) => v.target === key);
  const sum = mine.reduce((s, v) => s + (v.direction === '-' ? -1 : 1) * (cfg.strength[v.strength] ?? 0) * (v.selfTeam ? cfg.selfTeam : 1), 0);
  return { E: r1(Math.max(-cfg.clip, Math.min(cfg.clip, sum))), count: mine.length };
}

/** 基準1: 両チームの勝率を 0.1% 単位で、和が 100.0% になるように丸める */
function percents(p: number): [number, number] {
  const tenths = Math.round(p * 1000);
  return [tenths / 10, (1000 - tenths) / 10];
}

export function computePriorWinrates(
  teams: readonly TierTeamS[],
  opts: { config?: WinrateConfig; externalViews?: readonly ExternalView[]; meta?: readonly MetaChampionLike[] | null; results?: readonly ResultGame[] } = {},
): WinrateOutput {
  const cfg = opts.config ?? CFG;
  const views = opts.externalViews ?? [];
  const rows: TeamRow[] = [];
  for (const tier of TIERS) {
    for (const team of TEAMS) {
      const t = teams.find((x) => x.team === team && x.tier === tier);
      const key = `${team}-${tier}`;
      // マクロの点数 M: 与えられた M を優先し、無ければ内訳から作る(基準3b)
      const macroParts = t?.macroParts ?? [];
      const macro =
        t?.M === undefined ? macroOf(macroParts)
        : t.M === null || !Number.isFinite(t.M) ? { M: null, reason: t.macroReason ?? 'マクロの点数が無い' }
        : { M: r2(t.M), reason: null };
      const ext = externalOf(views, key, cfg.external);
      // Task-3: 仕上がり。メタの一覧(opts.meta)が無ければ m_pool = 0.5(中立)で理由を note に残す
      const maturation = maturationOf(t?.members, opts.meta, cfg, t?.ownerViews ?? []);
      const base = { key, team, tier, M: macro.M, macroParts, macroReason: macro.reason, E: ext.E, externalCount: ext.count, maturation, result: { theta: 0, official: 0, scrim: 0 }, ns: 0, lambda: 1, lambdaE: ext.E };
      if (!t) rows.push({ ...base, S: null, reason: 'F-010 の計算が無い' });
      else if (t.S === null || !Number.isFinite(t.S)) rows.push({ ...base, S: null, reason: t.reason ?? 'F-010 の計算が無い' });
      else rows.push({ ...base, S: t.S, reason: null });
    }
  }
  const sOf = (team: TeamId, tier: Tier) => rows.find((r) => r.team === team && r.tier === tier)!;

  const beta = {} as Record<Tier, number>;
  const betaBasis = {} as Record<Tier, string>;
  const betaMacro = {} as Record<Tier, number>;
  const betaMacroBasis = {} as Record<Tier, string>;
  const betaExt = {} as Record<Tier, number>;
  const betaExtBasis = {} as Record<Tier, string>;
  for (const tier of TIERS) {
    const known = rows.filter((r) => r.tier === tier && r.S !== null).map((r) => r.S as number);
    beta[tier] = r3(betaOf(known, cfg.beta.targetSd));
    betaBasis[tier] = scaleBasis('S', 'β', known, cfg.beta.targetSd);
    const knownM = rows.filter((r) => r.tier === tier && r.M !== null).map((r) => r.M as number);
    betaMacro[tier] = r3(betaOf(knownM, cfg.macro.targetSd));
    betaMacroBasis[tier] = scaleBasis('M', 'β_macro', knownM, cfg.macro.targetSd);
    const knownE = rows.filter((r) => r.tier === tier).map((r) => r.E);
    betaExt[tier] = r3(betaOf(knownE, cfg.external.targetSd));
    betaExtBasis[tier] = scaleBasis('E', 'β_ext', knownE, cfg.external.targetSd);
  }

  // 基準4: 階級ごと・試合日ごとの θ。固定の項は β × (S_A − S_B)(S が無い側があれば 0)。before が無ければすべての結果
  const results = opts.results ?? [];
  const thetaCache = new Map<string, Record<string, ThetaSide>>();
  const thetaOf = (tier: Tier, before?: string) => {
    const ck = `${tier}|${before ?? ''}`;
    if (!thetaCache.has(ck)) {
      const keys = TEAMS.map((t) => `${t}-${tier}`);
      const S = (k: string) => rows.find((r) => r.key === k)!.S;
      const fixed = (x: string, y: string) => {
        const sx = S(x), sy = S(y);
        return sx === null || sy === null ? 0 : beta[tier] * (sx - sy);
      };
      thetaCache.set(ck, fitTheta(results, keys, fixed, cfg, before));
    }
    return thetaCache.get(ck)!;
  };
  // 基準3c: 試合日 before より前(無ければすべて)のスクリムで、その階級チームが出たゲームの数と λ。相手の階級は問わない
  const lambdaOf = (key: string, before?: string) => {
    const ns = results.filter((g) => g.kind === 'scrim' && (before === undefined || g.date < before) && (g.teams[0] === key || g.teams[1] === key)).length;
    const half = cfg.external.scrimHalf;
    return { ns, lambda: half === undefined || half <= 0 ? 1 : half / (half + ns) };
  };
  for (const r of rows) {
    r.result = thetaOf(r.tier)[r.key];
    const l = lambdaOf(r.key);
    Object.assign(r, { ns: l.ns, lambda: r2(l.lambda), lambdaE: r2(l.lambda * r.E) });
  }

  // 1組の勝率(A の対数オッズ = レーン項 + マクロ項 + 外部の見立ての項 + 結果による更新の項 + ステージ補正)。stage が無ければステージ補正なし。
  // before は試合日(その日より前の結果で θ を当て直す)。無ければすべての結果
  const prior = (tier: Tier, a: TeamId, b: TeamId, stage?: StageKey, before?: string) => {
    const A = sOf(a, tier), B = sOf(b, tier);
    const th = thetaOf(tier, before), tA = th[A.key], tB = th[B.key];
    const lA = lambdaOf(A.key, before), lB = lambdaOf(B.key, before);
    // 基準3c(2026-10-13 改定): 両チームに同じ λ を掛ける。チームごとに掛けると、スクリムの多いチームだけが自分の見立てを失う
    const hf = cfg.external.scrimHalf;
    const lambda = hf === undefined || hf <= 0 ? 1 : hf / (hf + (lA.ns + lB.ns) / 2);
    const thetaPart = {
      thetaA: tA.theta, thetaB: tB.theta, resultsA: tA.official + tA.scrim, resultsB: tB.official + tB.scrim,
      nsA: lA.ns, nsB: lB.ns, lambdaA: r2(lambda), lambdaB: r2(lambda),
    };
    const st = stage ? (cfg.stage[stage]?.[A.key] ?? 0) - (cfg.stage[stage]?.[B.key] ?? 0) : 0;
    const noM = [A, B].filter((x) => x.M === null);
    const macroMissing = noM.length ? `マクロの点数が無い(${noM.map((x) => `${x.key}: ${x.macroReason}`).join(' / ')})` : null;
    const common = { ...thetaPart, sA: A.S, sB: B.S, mA: A.M, mB: B.M, eA: A.E, eB: B.E, beta: beta[tier], betaMacro: betaMacro[tier], betaExt: betaExt[tier], stageTerm: st, macroMissing };
    const half = { pA: 50.0, pB: 50.0, pLaneA: 50.0, pLaneB: 50.0, pMacroA: 50.0, pMacroB: 50.0, pExtA: 50.0, pExtB: 50.0 };
    if (A.S === null || B.S === null) {
      const why = [A, B].filter((x) => x.S === null).map((x) => `${x.key}: ${x.reason}`).join(' / ');
      return { ...common, logit: 0, laneLogit: 0, macroLogit: 0, extLogit: 0, thetaLogit: 0, ...half, pBeforeResultsA: 50.0, dataMissing: `データ不足(${why})` };
    }
    const lane = beta[tier] * (A.S - B.S);
    const macro = A.M === null || B.M === null ? 0 : betaMacro[tier] * (A.M - B.M);
    // 基準3c: β_ext は λ を掛ける前の E から決めたまま、項だけ λ × E の差にする
    const ext = betaExt[tier] * lambda * (A.E - B.E);
    const thetaLogit = tA.theta - tB.theta;
    const logit = lane + macro + ext + thetaLogit + st;
    const [pA, pB] = percents(sigmoid(logit));
    const [pBeforeResultsA] = percents(sigmoid(lane + macro + ext + st));
    const [pLaneA, pLaneB] = percents(sigmoid(lane));
    const [pMacroA, pMacroB] = percents(sigmoid(macro + ext));
    const [pExtA, pExtB] = percents(sigmoid(ext));
    return {
      ...common, logit: r3(logit), laneLogit: r3(lane), macroLogit: r3(macro), extLogit: r3(ext), thetaLogit: r3(thetaLogit),
      pA, pB, pLaneA, pLaneB, pMacroA, pMacroB, pExtA, pExtB, pBeforeResultsA, dataMissing: null,
    };
  };

  const matches: MatchPrior[] = [];
  for (const d of REGULAR_DAYS) {
    for (const card of d.cards) {
      for (const tier of ['NEXT', 'CORE'] as const) {
        matches.push({ stage: 'regular', day: d.day, tier, a: card.blue, b: card.red, ...prior(tier, card.blue, card.red, 'regular', d.date) });
      }
    }
  }
  for (const c of MASTERS_CUPS) {
    for (const [a, b] of c.semis) matches.push({ stage: 'masters', cup: c.cup, tier: 'MASTERS', a, b, ...prior('MASTERS', a, b, 'masters', c.date) });
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
    betaMacro,
    betaMacroBasis,
    betaExt,
    betaExtBasis,
    stageBasis: cfg.stageBasis,
    teams: rows,
    matches,
    winTable: table(),
    stageWinTables: { regular: table('regular'), masters: table('masters'), playoffs: table('playoffs') },
  };
}
