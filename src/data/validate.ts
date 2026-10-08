// F-002 基準11: 指標ファイルの検証。エラーは選手と項目名を含む
import { ROSTER } from './roster.ts';

const AUTHOR_KINDS = ['human', 'riot-api', 'ai'];
const CONFIDENCE = ['高', '中', '低'];
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
      (typeof m.value === 'number' ? Number.isFinite(m.value) : nonEmpty(m.value)) &&
      nonEmpty(m.source) &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(m.retrievedAt)) &&
      CONFIDENCE.includes(m.confidence as string) &&
      checkAuthor(m.author);
    if (!ok) errs.push(`${id}: 指標 ${k} の値・出典・取得日・確度・書いた主体のどれかが欠けている`);
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
      checkAuthor(q.author);
    if (!ok) errs.push(`${id}: 定性の評価 ${k} は 0〜10 の点数・根拠の文章・出典・書いた主体が要る`);
  }
  if (!Array.isArray(f.recentMatches)) errs.push(`${id}: recentMatches が配列ではない`);
  return errs;
}
