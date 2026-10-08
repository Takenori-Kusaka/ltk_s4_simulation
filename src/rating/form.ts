// F-009 Task-4: 調子の係数と表示の点数(docs/design/rating-model.md 2c、受入基準 17〜19)
// 係数 = clamp( 1 + 0.10 × S, 0.90, 1.10 )
//   S = 0.5 × ((勝率 − 0.5) / 0.15) × m/(m+5) + 0.3 × (LP の増減 / 150) + 0.2 × min(m, 30)/30   (S は −1〜+1)
// 表示の点数 = clamp( 5.0 + (基礎の点数 − 5.0) × 係数, 0, 10 )
import defaults from './config.json' with { type: 'json' };

const DAY = 86_400_000;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * 調子に使う1試合。engine の GameRecord は数値だけを平らにするため勝敗(真偽値)を持たない。
 * 呼び出し側が participant の win から渡す
 */
export interface FormGame {
  /** 試合の終了時刻(ミリ秒) */
  endTime: number;
  durationMin: number;
  queueId: number;
  win: boolean;
}

/** ソロランクの記録の1時点。収集のたびに残す(2026-10-09 時点では蓄積を始めたばかり) */
export interface LeagueSnapshot {
  /** 記録した時刻(ISO 8601 またはミリ秒) */
  date: string | number;
  tier: string;
  division: string;
  lp: number;
}

export interface FormConfig {
  windowDays: number;
  minGames: number;
  queues: number[];
  minMinutes: number;
  /** 勝率の縮小 m / (m + shrinkGames) */
  shrinkGames: number;
  winRateScale: number;
  lpScale: number;
  practiceCap: number;
  weights: { winRate: number; lp: number; practice: number };
  /** S = ±1 のときの係数の振れ幅 */
  swing: number;
  min: number;
  max: number;
  /** ラベルの境目(S の値)。best 以上=絶好調、good 以上=好調、bad 以下=不調、worst 以下=絶不調 */
  labels: { best: number; good: number; bad: number; worst: number };
}

export type FormLabel = '絶好調' | '好調' | '普通' | '不調' | '絶不調' | '調子: 判断材料なし';

export interface FormResult {
  coefficient: number;
  label: FormLabel;
  /** 直近の評価の試合が minGames 未満で、係数を 1.00 にした */
  insufficient: boolean;
  /** 使った試合数 m */
  games: number;
  wins: number;
  /** 切り詰め後の S */
  score: number;
  components: {
    winRate: number | null;
    winRateTerm: number;
    /** 期間内の最古と最新の記録の差(LP 換算)。記録が 2 件未満なら null */
    lpDelta: number | null;
    lpTerm: number;
    practiceTerm: number;
  };
  reason: string;
}

export function loadFormConfig(): FormConfig {
  const f = (defaults as unknown as { form: FormConfig }).form;
  return { ...f, queues: [...f.queues], weights: { ...f.weights }, labels: { ...f.labels } };
}

const TIER_INDEX: Record<string, number> = {
  IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4, EMERALD: 5, DIAMOND: 6, MASTER: 7, GRANDMASTER: 7, CHALLENGER: 7,
};
const DIVISION: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 };
/** Master 0LP の通しの LP(Iron IV 0LP = 0) */
const MASTER_FLOOR = 7 * 400;

/** 通しの LP。ディビジョンは 100LP、Master 以上は Master 0LP からの LP をそのまま足す。換算できない階級は null */
export function ladderLp(r: { tier: string; division: string; lp: number }): number | null {
  const t = TIER_INDEX[r.tier.toUpperCase()];
  if (t === undefined) return null;
  if (t >= 7) return MASTER_FLOOR + r.lp;
  return t * 400 + (DIVISION[r.division.toUpperCase()] ?? 0) * 100 + r.lp;
}

const toTime = (d: string | number) => (typeof d === 'number' ? d : Date.parse(d));

/** 期間内の LP の増減(最古 → 最新)。記録が 2 件未満なら null */
function lpDeltaOf(history: readonly LeagueSnapshot[], now: number, windowDays: number): number | null {
  const points = history
    .map((s) => ({ t: toTime(s.date), lp: ladderLp(s) }))
    .filter((p): p is { t: number; lp: number } => p.lp !== null && Number.isFinite(p.t) && p.t <= now && now - p.t <= windowDays * DAY)
    .sort((a, b) => a.t - b.t);
  if (points.length < 2) return null;
  return points[points.length - 1].lp - points[0].lp;
}

function labelOf(s: number, cfg: FormConfig): FormLabel {
  if (s >= cfg.labels.best) return '絶好調';
  if (s >= cfg.labels.good) return '好調';
  if (s <= cfg.labels.worst) return '絶不調';
  if (s <= cfg.labels.bad) return '不調';
  return '普通';
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x)}`;

/** 基準17・18: 調子の係数 */
export function formFactor(
  games: readonly FormGame[],
  leagueHistory: readonly LeagueSnapshot[],
  now: number,
  cfg: FormConfig = loadFormConfig(),
): FormResult {
  const used = games.filter(
    (g) =>
      g.endTime <= now &&
      now - g.endTime <= cfg.windowDays * DAY &&
      g.durationMin >= cfg.minMinutes &&
      cfg.queues.includes(g.queueId),
  );
  const m = used.length;
  const wins = used.filter((g) => g.win).length;
  const winRate = m > 0 ? wins / m : null;
  const lpDelta = lpDeltaOf(leagueHistory, now, cfg.windowDays);
  const lpText =
    lpDelta === null ? 'LP の推移は記録の蓄積待ち' : `LP ${signed(lpDelta)}(${cfg.windowDays} 日間の記録)`;

  if (m < cfg.minGames) {
    return {
      coefficient: 1,
      label: '調子: 判断材料なし',
      insufficient: true,
      games: m,
      wins,
      score: 0,
      components: { winRate, winRateTerm: 0, lpDelta, lpTerm: 0, practiceTerm: 0 },
      reason: `直近 ${cfg.windowDays} 日の評価の試合が ${m} 試合(${cfg.minGames} 試合未満)のため係数 1.00。${lpText}`,
    };
  }

  const w = cfg.weights;
  const winRateTerm = w.winRate * (((winRate as number) - 0.5) / cfg.winRateScale) * (m / (m + cfg.shrinkGames));
  const lpTerm = lpDelta === null ? 0 : w.lp * (lpDelta / cfg.lpScale);
  const practiceTerm = w.practice * (Math.min(m, cfg.practiceCap) / cfg.practiceCap);
  const score = clamp(winRateTerm + lpTerm + practiceTerm, -1, 1);
  const coefficient = clamp(1 + cfg.swing * score, cfg.min, cfg.max);
  return {
    coefficient,
    label: labelOf(score, cfg),
    insufficient: false,
    games: m,
    wins,
    score,
    components: { winRate, winRateTerm, lpDelta, lpTerm, practiceTerm },
    reason:
      `直近 ${cfg.windowDays} 日の評価の試合 ${m} 試合(${wins} 勝 ${m - wins} 敗、勝率 ${pct(winRate as number)})。` +
      `${lpText}。係数 ${coefficient.toFixed(2)}`,
  };
}

/** 基準19: 表示の点数 = clamp( 5.0 + (基礎 − 5.0) × 係数, 0, 10 ) */
export function applyForm(base: number, coefficient: number): number {
  // 加算で ±0.5 点まで(係数 0.90〜1.10)。好調なら実力帯に依らず上がる(2026-10-09 価値責任者が確定)
  return clamp(base + (coefficient - 1) * 5, 0, 10);
}

/** 基準19: 軸の説明に使う、基礎の点数・係数・表示の点数の組 */
export function displayScore(
  base: number,
  form: Pick<FormResult, 'coefficient' | 'label'>,
): { base: number; coefficient: number; label: FormLabel; display: number } {
  return { base, coefficient: form.coefficient, label: form.label, display: applyForm(base, form.coefficient) };
}
