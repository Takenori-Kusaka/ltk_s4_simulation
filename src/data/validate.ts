// F-002 基準11: 指標ファイルの検証。エラーは選手と項目名を含む
import { ROSTER } from './roster.ts';

const AUTHOR_KINDS = ['human', 'riot-api', 'ai'];
const CONFIDENCE = ['高', '中', '低'];
/** 数値でなければならない指標(採点規則と集計が数値として使う) */
const NUMERIC_METRICS = new Set([
  'kda', 'csPerMin', 'killParticipation', 'damageShare', 'ltkGames', 'ltkWinRate', 'championPoolSize',
  'rankedGames', 'rankedWinRate', 'visionPerMin',
]);
/** ランクの形式: 'DIAMOND II 30'、'MASTER I 320'、'GRANDMASTER 900'、'UNRANKED' */
const RANK_METRICS = new Set(['soloRank', 'peakRank', 'flexRank']);
export const RANK_PATTERN =
  /^(?:(?:IRON|BRONZE|SILVER|GOLD|PLATINUM|EMERALD|DIAMOND)\s+(?:IV|III|II|I)\s+\d+|(?:MASTER|GRANDMASTER|CHALLENGER)(?:\s+I)?\s+\d+|UNRANKED)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function valueOk(key: string, v: unknown): boolean {
  if (NUMERIC_METRICS.has(key)) return typeof v === 'number' && Number.isFinite(v);
  if (RANK_METRICS.has(key)) return typeof v === 'string' && RANK_PATTERN.test(v.trim().toUpperCase());
  return typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' && v.trim() !== '';
}

const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim() !== '';
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function checkAuthor(a: unknown): boolean {
  return isObj(a) && AUTHOR_KINDS.includes(a.kind as string) && (a.kind !== 'ai' || nonEmpty(a.model));
}

/** 型に合わない箇所の一覧を返す。空なら正しい */
export function validatePlayerFile(f: unknown): string[] {
  if (!isObj(f) || !nonEmpty(f.playerId)) return ['指標ファイルに playerId が無い'];
  const id = f.playerId as string;
  const errs: string[] = [];
  if (!ROSTER.some((p) => p.id === id)) errs.push(`${id}: 名簿に無い選手`);
  if (!isObj(f.metrics)) errs.push(`${id}: metrics が無い`);
  for (const [k, m] of Object.entries(isObj(f.metrics) ? f.metrics : {})) {
    const ok =
      isObj(m) &&
      valueOk(k, m.value) &&
      nonEmpty(m.source) &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(m.retrievedAt)) &&
      CONFIDENCE.includes(m.confidence as string) &&
      checkAuthor(m.author);
    if (!ok) errs.push(`${id}: 指標 ${k} の値の形式・出典・取得日・確度・書いた主体のどれかが正しくない`);
  }
  if (!isObj(f.qualitative)) errs.push(`${id}: qualitative が無い`);
  for (const [k, q] of Object.entries(isObj(f.qualitative) ? f.qualitative : {})) {
    const ok =
      isObj(q) &&
      typeof q.score === 'number' &&
      q.score >= 0 &&
      q.score <= 10 &&
      nonEmpty(q.rationale) &&
      Array.isArray(q.sources) &&
      q.sources.length > 0 &&
      (q.retrievedAt === undefined || DATE.test(String(q.retrievedAt))) &&
      checkAuthor(q.author);
    if (!ok) errs.push(`${id}: 定性の評価 ${k} は 0〜10 の点数・根拠の文章・出典・書いた主体が要る`);
  }
  if (!Array.isArray(f.recentMatches)) errs.push(`${id}: recentMatches が配列ではない`);
  return errs;
}
