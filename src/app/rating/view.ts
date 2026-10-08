// F-009 Task-6: 評価(ratings.json)の選手のページの論理。受入基準 20・24(DOM に依存しない)
import type { PlayerRating, AxisRating } from '../../rating/build.ts';
import type { Confidence } from '../../rating/types.ts';
import { loadEngineConfig } from '../../rating/engine.ts';
import { formatScore } from '../lib/index.ts';

/** aggregate-cli が書く評価のファイル(data/public/ratings.json) */
export interface RatingsFile {
  kind: 'ratings';
  computedAt: string;
  configVersion: string;
  checks: { id: string; status: string; note?: string }[];
  players: PlayerRating[];
}

/** 8軸の順(レーダーの1軸目は真上から時計回り) */
export const AXIS_ORDER: readonly { key: string; label: string }[] = [
  { key: 'ground', label: '地力' },
  { key: 'laning', label: 'レーン戦' },
  { key: 'teamfight', label: '集団戦' },
  { key: 'synergy', label: '連携' },
  { key: 'stability', label: '安定感' },
  { key: 'pool', label: 'ピックプール' },
  { key: 'shotcalling', label: 'コール力' },
  { key: 'tournament', label: '大会経験' },
];

/** 指標(match-v5 のキー)の日本語の名前 */
export const METRIC_JA: Record<string, string> = {
  totalDamageDealtToChampions: 'チャンピオンへのダメージ(対面比)',
  goldPerMinute: '分あたりゴールド',
  soloKills: 'ソロキル',
  maxCsAdvantageOnLaneOpponent: '最大 CS 差',
  laningPhaseGoldExpAdvantage: 'レーン戦の優位',
  maxLevelLeadLaneOpponent: '最大レベル差',
  enemyJungleMonsterKills: '敵のジャングルのモンスター',
  scuttleCrabKills: 'スカトル',
  takedownsFirstXMinutes: '序盤の関与',
  visionScorePerMinute: '分あたり視界スコア',
  teamDamagePercentage: 'チーム内のダメージの割合',
  damageTakenOnTeamPercentage: 'チーム内の被ダメージの割合',
  enemyChampionImmobilizations: '行動妨害',
  outnumberedKills: '数的不利でのキル',
  killParticipation: 'キル関与率',
  pickKillWithAlly: '味方と取ったピック',
  knockEnemyIntoTeamAndKill: '味方へ押し込んだキル',
  saveAllyFromDeath: '味方を救った回数',
  effectiveHealAndShielding: '回復とシールド(対面比)',
  deaths: 'デス(少ないほど良い)',
  controlWardsPlaced: 'コントロールワード',
  wardsKilled: 'ワードの破壊',
  dragonTakedowns: 'ドラゴン',
  baronTakedowns: 'バロン',
  riftHeraldTakedowns: 'ヘラルド',
  turretTakedowns: 'タワー',
};

/** レーダーの線の描き方。高・中=実線、低=点線、データなし=欠損 */
export type AxisLine = 'solid' | 'dotted' | 'missing';
export const lineOf = (c: Confidence | null | undefined): AxisLine => (!c ? 'missing' : c === '低' ? 'dotted' : 'solid');

export interface DetailRow {
  label: string;
  value: string;
}
export interface MetricRow {
  label: string;
  value: string;
  position: string;
}
export interface EvidenceRow {
  text: string;
  source: string;
  href?: string;
  /** 人が確認した根拠か(AI 収集は未確認) */
  confirmed: boolean;
  used: boolean;
}
export interface RatingAxisView {
  key: string;
  label: string;
  /** 表示の点数。データなしは null */
  score: number | null;
  display: string;
  base: string;
  confidence: Confidence | null;
  line: AxisLine;
  /** 事前値だけで推定した */
  estimated: boolean;
  marks: string[];
  details: DetailRow[];
  metrics: MetricRow[];
  evidence: EvidenceRow[];
  confidenceReason: string;
}

/** 標準正規分布の累積分布(Abramowitz–Stegun 7.1.26) */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** 母集団の中での位置(標準化した値 z から)。上位 50% より上は「上位」、下は「下位」で示す */
export function positionText(z: number): string {
  const top = Math.round((1 - normalCdf(z)) * 100);
  if (top <= 50) return `上位 ${Math.max(1, top)}%`;
  return `下位 ${Math.max(1, 100 - top)}%`;
}

const date = (s: string | null) => (s ? s.slice(0, 10) : '—');
const pct = (x: number) => `${Math.round(x * 100)}%`;
const signed = (x: number, d = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`;

function dataAxis(a: AxisRating, coefficient: number): Pick<RatingAxisView, 'details' | 'metrics' | 'evidence' | 'confidenceReason'> {
  const d = a.data!;
  const cfg = loadEngineConfig();
  const details: DetailRow[] = [
    { label: 'ランクの基準', value: `${d.anchor.toFixed(2)}(${d.anchorSource})` },
    { label: '補正', value: `${signed(d.correction)}(母集団の標準偏差の単位)` },
    { label: '縮小の割合', value: `${pct(d.shrink)}(有効な試合数 n ÷ (n + ${cfg.k}))` },
    { label: 'LTK の経験の項', value: a.data?.bonusReason ?? (d.bonus ? `+${d.bonus.toFixed(1)}` : 'この軸には加えない') },
    { label: '使った試合', value: `${d.gamesUsed} 試合(有効な試合数 ${d.effectiveGames.toFixed(1)})、大会のロールの試合 ${pct(d.roleShare)}、${date(d.oldest)} 〜 ${date(d.newest)}` },
    { label: '基礎の点数と調子', value: `基礎 ${a.base.toFixed(2)} + (係数 ${coefficient.toFixed(2)} − 1) × 5 = 表示 ${a.display.toFixed(2)}` },
  ];
  if (d.poolDetail) {
    details.push({ label: 'ピックプール', value: `3 試合以上のチャンピオン ${d.poolDetail.champions} 体、勝率 ${d.poolDetail.winRate === null ? '—' : pct(d.poolDetail.winRate)}` });
  }
  if (d.consistencySd !== undefined) {
    details.push({ label: '出来のばらつき', value: d.consistencySd === null ? '試合が少なく計算できない' : `標準偏差 ${d.consistencySd.toFixed(2)}(小さいほど安定)` });
  }
  const metrics = d.metrics.map((m) => ({
    label: METRIC_JA[m.key] ?? m.key,
    value: m.value === null ? '—' : `対面との差 ${signed(m.value)}`,
    position: m.gamesWithOpponent ? positionText(m.z) : '対面のある試合なし',
  }));
  const confidenceReason =
    `有効な試合数 ${d.effectiveGames.toFixed(1)}(${cfg.confidence.high} 以上で高、${cfg.confidence.mid} 以上で中)` +
    (d.estimated ? '。試合が無く、ランクの基準(事前値)だけで推定した' : '');
  return { details, metrics, evidence: [], confidenceReason };
}

function evidenceAxis(a: AxisRating, coefficient: number): Pick<RatingAxisView, 'details' | 'metrics' | 'evidence' | 'confidenceReason'> {
  const e = a.evidence!;
  return {
    details: [
      { label: '計算', value: e.reason },
      { label: '基礎の点数と調子', value: `基礎 ${a.base.toFixed(2)} + (係数 ${coefficient.toFixed(2)} − 1) × 5 = 表示 ${a.display.toFixed(2)}` },
    ],
    metrics: [],
    evidence: e.evidence.map((x) => ({
      text: x.text,
      source: x.source,
      href: /^https?:\/\//.test(x.url ?? x.source) ? (x.url ?? x.source) : undefined,
      confirmed: !x.marks.includes('AI 収集'),
      used: x.used,
    })),
    confidenceReason: e.confidenceReason,
  };
}

/** 基準20・24: 選手の8軸。評価が無い選手は全軸データなし */
export function ratingAxesView(rating: PlayerRating | undefined): RatingAxisView[] {
  return AXIS_ORDER.map(({ key, label }) => {
    const a = rating?.axes.find((x) => x.key === key);
    if (!a || !rating) {
      return {
        key, label, score: null, display: formatScore(null), base: '—', confidence: null, line: 'missing', estimated: false, marks: [],
        details: [], metrics: [], evidence: [], confidenceReason: '評価のファイルにこの選手の評価が無い',
      };
    }
    const rest = a.data ? dataAxis(a, rating.form.coefficient) : evidenceAxis(a, rating.form.coefficient);
    return {
      key, label, score: a.display, display: formatScore(a.display), base: a.base.toFixed(2), confidence: a.confidence,
      line: lineOf(a.confidence), estimated: a.estimated, marks: a.marks, ...rest,
    };
  });
}

/** 基準24: 調子の係数の表示 */
export function formView(rating: PlayerRating | undefined): { label: string; coefficient: string; effect: string; reason: string } | null {
  if (!rating) return null;
  const f = rating.form;
  return {
    label: f.label,
    coefficient: f.coefficient.toFixed(2),
    effect: `各軸 ${signed((f.coefficient - 1) * 5, 2)}`,
    reason: f.reason,
  };
}
