// F-005 Task-2(基準4): 本番とスクリムの結果による θ の当て直し。
// β × (S_A − S_B) を固定の項として入れた Bradley-Terry を、θ の事前分布(平均 0・標準偏差 theta.priorSd)と
// 結果の重み(本番 weights.official・スクリム weights.scrim)で当てはめる(事後の最頻値。ニュートン法)。
// DOM と Node 固有の API に依存しない
import type { Tier } from '../sim/types.ts';

/** 当て直しに使う 1 試合(F-004 の MatchResult から必要な欄だけ) */
export interface ResultGame {
  kind: 'official' | 'scrim';
  /** 試合日(YYYY-MM-DD) */
  date: string;
  /** 2 つの階級チーム ID(例 DD-CORE) */
  teams: readonly [string, string];
  winner: string;
}

export interface ThetaConfig {
  theta: { priorSd: number };
  weights: { official: number; scrim: number };
}

/** 階級チームごとの θ と、当て直しに使った結果の数 */
export interface ThetaSide {
  theta: number;
  official: number;
  scrim: number;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const r3 = (x: number) => Math.round(x * 1000) / 1000 + 0;

/** 2 つの階級チーム ID の階級(同じ階級でなければ null)。例 DD-CORE と IT-CORE → CORE */
function tierOf(a: string, b: string): Tier | null {
  const ta = a.split('-')[1], tb = b.split('-')[1];
  return ta && ta === tb ? (ta as Tier) : null;
}

/** 解く連立一次方程式 H x = g(H は対称の正定値。ガウスの消去法) */
function solve(H: number[][], g: number[]): number[] {
  const n = g.length;
  const A = H.map((row, i) => [...row, g[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = A[r][n];
    for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k];
    x[r] = s / A[r][r];
  }
  return x;
}

/**
 * 基準4: 試合日 before より前(当日を含まない)の結果から、階級チーム keys の θ を当て直す。
 * fixed(a, b) は a 側の固定の項 β × (S_a − S_b)(S が無ければ 0)。同じ階級でない組と keys に無いチームの試合は使わない。
 * 結果が無ければ θ はすべて 0(事前分布の平均)
 */
export function fitTheta(
  games: readonly ResultGame[],
  keys: readonly string[],
  fixed: (a: string, b: string) => number,
  cfg: ThetaConfig,
  before?: string,
): Record<string, ThetaSide> {
  const idx = new Map(keys.map((k, i) => [k, i]));
  const used = games.filter(
    (g) => (before === undefined || g.date < before) && idx.has(g.teams[0]) && idx.has(g.teams[1]) && tierOf(g.teams[0], g.teams[1]) !== null && (g.winner === g.teams[0] || g.winner === g.teams[1]),
  );
  const out: Record<string, ThetaSide> = Object.fromEntries(keys.map((k) => [k, { theta: 0, official: 0, scrim: 0 }]));
  for (const g of used) for (const t of g.teams) out[t][g.kind] += 1;
  if (!used.length) return out;

  const n = keys.length;
  const prec = 1 / cfg.theta.priorSd ** 2;
  const rows = used.map((g) => ({
    i: idx.get(g.teams[0])!,
    j: idx.get(g.teams[1])!,
    y: g.winner === g.teams[0] ? 1 : 0,
    w: g.kind === 'official' ? cfg.weights.official : cfg.weights.scrim,
    f: fixed(g.teams[0], g.teams[1]),
  }));
  // 対数事後分布は θ について凹なので、ニュートン法は 1 つの最大へ収束する
  const theta = new Array<number>(n).fill(0);
  for (let it = 0; it < 100; it++) {
    const grad = theta.map((t) => -prec * t);
    const H = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? prec : 0)));
    for (const r of rows) {
      const p = sigmoid(r.f + theta[r.i] - theta[r.j]);
      const e = r.w * (r.y - p), v = r.w * p * (1 - p);
      grad[r.i] += e;
      grad[r.j] -= e;
      H[r.i][r.i] += v;
      H[r.j][r.j] += v;
      H[r.i][r.j] -= v;
      H[r.j][r.i] -= v;
    }
    const step = solve(H, grad);
    for (let k = 0; k < n; k++) theta[k] += step[k];
    if (Math.max(...step.map(Math.abs)) < 1e-10) break;
  }
  keys.forEach((k, i) => (out[k].theta = r3(theta[i])));
  return out;
}
