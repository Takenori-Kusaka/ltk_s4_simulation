// F-004 Task-5(基準23): 当てはまりの確認。予測(forecast)と、現在の評価で作り直した事前の勝率(F-005 の β × (S_A − S_B))を、
// 本番の実際の結果と比べる(対数損失・Brier スコア)。DOM と Node 固有の API に依存しない(読み書きは src/results/fit-cli.ts)。
// 値を変える判断は人(価値責任者)が行う。ここは比較の値だけを作り、推奨を書かない
import type { EngineConfig } from '../rating/types.ts';
import { TIERS, type Tier } from '../sim/types.ts';
import { betaOf } from '../winrate/core.ts';
import type { ResultsGame } from './official.ts';

/** 基準23: 本番の記録がこの数以上のときだけ確認する */
export const MIN_OFFICIAL_GAMES = 8;
/** 対数損失の確率の下限・上限(予測の刻み 0.1%)。0% や 100% の予測が外れたときに無限大にしない */
const P_CLIP = 0.001;

/** 指標。n が 0 なら値は null */
export interface FitMetrics { n: number; logLoss: number | null; brier: number | null }
export interface FitGroup { all: FitMetrics; byTier: Record<Tier, FitMetrics>; missing: number }

/**
 * 評価を作り直す組の 1 つ。engine は評価設定(src/rating/config.json の engine)への上書き。
 * Task-13(officialGameWeight の 3 通り)・F-009 Task-18(oppAdjust)は、この形の組を足す
 */
export interface EngineVariant { key: string; label: string; engine: Partial<EngineConfig> }
/** 作り直した評価での階級チームごとの S(計算できない階級チームは null) */
export interface ScoredVariant { key: string; label: string; S: Readonly<Record<string, number | null>> }

export interface FitRow {
  matchId: string;
  date: string;
  tier: Tier;
  teams: ResultsGame['teams'];
  winner: ResultsGame['winner'];
  /** 予測の teams の 1 つ目の勝率(%)。予測なしは null */
  forecastA: number | null;
  /** 組の key → 事前の勝率(teams の 1 つ目が勝つ確率、0〜1)。S の無い組は null */
  priorA: Record<string, number | null>;
}
export interface FitReport {
  official: number;
  forecast: FitGroup;
  priors: (FitGroup & { key: string; label: string })[];
  rows: FitRow[];
}

/** 基準23: スクリムの重み scrimGameWeight を評価設定のままにした組と、0 にした組 */
export function scrimWeightVariants(cfg: Pick<EngineConfig, 'scrimGameWeight'>): EngineVariant[] {
  return [
    { key: 'scrim-config', label: `scrimGameWeight ${cfg.scrimGameWeight ?? 1}(設定の値)`, engine: {} },
    { key: 'scrim-0', label: 'scrimGameWeight 0', engine: { scrimGameWeight: 0 } },
  ];
}

/** F-009 基準45: 相手の強さの補正 oppAdjust を評価設定のままにした組・すべての軸を 0 にした組・すべての軸を 2 倍にした組 */
export function oppAdjustVariants(cfg: Pick<EngineConfig, 'oppAdjust'>): EngineVariant[] {
  const opp = cfg.oppAdjust ?? {};
  const scaled = (k: number) => Object.fromEntries(Object.entries(opp).map(([axis, v]) => [axis, v * k]));
  const values = Object.entries(opp).map(([axis, v]) => `${axis} ${v}`).join('・');
  return [
    { key: 'opp-config', label: `oppAdjust 設定の値${values ? `(${values})` : ''}`, engine: {} },
    { key: 'opp-0', label: 'oppAdjust すべて 0', engine: { oppAdjust: scaled(0) } },
    { key: 'opp-2x', label: 'oppAdjust 2 倍', engine: { oppAdjust: scaled(2) } },
  ];
}

const officialOf =(games: readonly ResultsGame[]) => games.filter((g) => g.kind === 'official' && g.tier !== null);

export function enoughOfficialGames(games: readonly ResultsGame[]): boolean {
  return officialOf(games).length >= MIN_OFFICIAL_GAMES;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** p は実際の結果 y(1 = teams の 1 つ目の勝ち)の前の、teams の 1 つ目が勝つ確率 */
function metricsOf(pairs: readonly { p: number; y: number }[]): FitMetrics {
  if (!pairs.length) return { n: 0, logLoss: null, brier: null };
  let ll = 0;
  let br = 0;
  for (const { p, y } of pairs) {
    const q = Math.min(1 - P_CLIP, Math.max(P_CLIP, p));
    ll -= y * Math.log(q) + (1 - y) * Math.log(1 - q);
    br += (p - y) ** 2;
  }
  return { n: pairs.length, logLoss: ll / pairs.length, brier: br / pairs.length };
}

function groupOf(items: readonly { tier: Tier; p: number | null; y: number }[]): FitGroup {
  const known = items.filter((x): x is { tier: Tier; p: number; y: number } => x.p !== null);
  const byTier = Object.fromEntries(TIERS.map((t) => [t, metricsOf(known.filter((x) => x.tier === t))])) as Record<Tier, FitMetrics>;
  return { all: metricsOf(known), byTier, missing: items.length - known.length };
}

/** F-005 基準3 の β(同じ階級の S のある階級チームの差の広がりが targetSd)と、teams の 1 つ目の事前の勝率 sigmoid(β × (S_A − S_B)) */
function priorOf(S: Readonly<Record<string, number | null>>, g: ResultsGame & { tier: Tier }, targetSd: number): number | null {
  const [a, b] = g.teams.map((k) => S[k] ?? null);
  if (a === null || b === null) return null;
  const known = Object.entries(S).filter(([k, v]) => k.endsWith(`-${g.tier}`) && v !== null).map(([, v]) => v as number);
  return sigmoid(betaOf(known, targetSd) * (a - b));
}

/** 基準23: 本番の試合(スクリムは除く)の予測と、組ごとの事前の勝率の指標、試合の一覧 */
export function fitReportOf(input: { games: readonly ResultsGame[]; variants: readonly ScoredVariant[]; targetSd: number }): FitReport {
  const games = officialOf(input.games) as (ResultsGame & { tier: Tier })[];
  const rows: FitRow[] = games.map((g) => ({
    matchId: g.matchId, date: g.date, tier: g.tier, teams: g.teams, winner: g.winner,
    forecastA: g.forecast ? g.forecast.pA : null,
    priorA: Object.fromEntries(input.variants.map((v) => [v.key, priorOf(v.S, g, input.targetSd)])),
  }));
  const yOf = (r: FitRow) => (r.winner === r.teams[0] ? 1 : 0);
  return {
    official: games.length,
    forecast: groupOf(rows.map((r) => ({ tier: r.tier, p: r.forecastA === null ? null : r.forecastA / 100, y: yOf(r) }))),
    priors: input.variants.map((v) => ({ key: v.key, label: v.label, ...groupOf(rows.map((r) => ({ tier: r.tier, p: r.priorA[v.key], y: yOf(r) }))) })),
    rows,
  };
}

const f3 = (x: number | null) => (x === null ? '—' : x.toFixed(3));
const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);

function metricsTable(groups: readonly { label: string; g: FitGroup }[]): string[] {
  const head = ['| 比べるもの | 範囲 | 試合数 | 対数損失 | Brier スコア | 数えなかった試合 |', '| --- | --- | --- | --- | --- | --- |'];
  return [
    ...head,
    ...groups.flatMap(({ label, g }) => [
      `| ${label} | 全体 | ${g.all.n} | ${f3(g.all.logLoss)} | ${f3(g.all.brier)} | ${g.missing} |`,
      ...TIERS.map((t) => `| ${label} | ${t} | ${g.byTier[t].n} | ${f3(g.byTier[t].logLoss)} | ${f3(g.byTier[t].brier)} | — |`),
    ]),
  ];
}

/** 基準23: docs/research/results-fit.md の中身。比較の値と試合の一覧だけを書く */
export function formatFitMarkdown(r: FitReport, opts: { computedAt: string }): string {
  const lines = [
    '# 当てはまりの確認(F-004 基準23)',
    '',
    `計算の時刻: ${opts.computedAt}。本番 ${r.official} 試合。命令 \`node src/results/fit-cli.ts\` が書く(手で編集しない)。`,
    '',
    '対数損失(自然対数)と Brier スコアは、小さいほど実際の結果に近い。確率は各試合の 1 つ目の階級チームが勝つ確率。この文書は比較の値だけを載せ、値を変えるかは価値責任者が決める。',
    '',
    '## 指標',
    '',
    '「予測」は試合日より前に凍結した予測(results.json の forecast)。そのほかの行は、現在の評価をその組の評価設定で作り直した事前の勝率 β × (S_A − S_B)(F-005)。数えなかった試合は、予測の無い試合・S の無い階級チームの試合。',
    '',
    ...metricsTable([{ label: '予測', g: r.forecast }, ...r.priors.map((p) => ({ label: p.label, g: p as FitGroup }))]),
    '',
    '## 試合の一覧',
    '',
    `| 試合 ID | 試合日 | 階級 | 1 つ目 | 2 つ目 | 勝者 | 予測 | ${r.priors.map((p) => p.label).join(' | ')} |`,
    `| --- | --- | --- | --- | --- | --- | --- |${r.priors.map(() => ' --- |').join('')}`,
    ...r.rows.map((x) =>
      `| ${x.matchId} | ${x.date} | ${x.tier} | ${x.teams[0]} | ${x.teams[1]} | ${x.winner} | ${x.forecastA === null ? '—' : `${x.forecastA.toFixed(1)}%`} | ${r.priors.map((p) => pct(x.priorA[p.key])).join(' | ')} |`),
    '',
  ];
  return lines.join('\n');
}
