// F-004 Task-3(基準11): 本番の試合の予測(用語「予測」)と、その凍結。DOM と Node 固有の API に依存しない
// 予測は、試合日の 0 時(JST)より前に計算した勝率表(data/public/winrates.json)の、その試合の両チームの勝率。
// 記録を初めて読んだ集計で results.json に書き、以後の集計は前回の results.json の値を引き継ぐ(書き換えない)
import { percentPair } from '../winrate/dynamics.ts';
import type { ResultsGame } from './official.ts';

/** pA は games[].teams の 1 つ目、pB は 2 つ目の階級チームの勝率(%、0.1 単位)。computedAt は取り出した勝率表の計算の時刻 */
export interface Forecast { pA: number; pB: number; computedAt: string }
/** games[] に書く 2 つの欄。forecast が null のときだけ理由を持つ */
export interface ForecastEntry { forecast: Forecast | null; forecastReason: string | null }

export const NO_TABLE_BEFORE_MATCH = '試合日より前の勝率表が無い';
/** 試合日より前の勝率表はあるが、その試合の組の勝率が載っていない(形の違う勝率表) */
export const NO_PAIR_IN_TABLE = '勝率表にこの試合の組が無い';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * 用語「予測」: 勝率表 table(winrates.json の中身。無ければ null)から、その試合の両チームの勝率を取る。
 * 勝率表の computedAt が試合日の 0 時(JST)より前でなければ null と理由(勝率表が無い・computedAt が読めない場合も同じ)。
 * Regular Stage の各カードと MASTERS CUP の準決勝は matches[] のその試合の行(pA・pB)、
 * matches[] に無い組(3 位決定戦・決勝・Playoffs)はステージごとの勝率表 stageWinTables から引く
 */
export function forecastOf(game: Pick<ResultsGame, 'date' | 'stage' | 'day' | 'tier' | 'teams'>, table: unknown): ForecastEntry {
  const none = (forecastReason: string): ForecastEntry => ({ forecast: null, forecastReason });
  const computedAt = isObj(table) && typeof table.computedAt === 'string' ? table.computedAt : null;
  if (!isObj(table) || computedAt === null || !(Date.parse(computedAt) < Date.parse(`${game.date}T00:00:00+09:00`))) return none(NO_TABLE_BEFORE_MATCH);
  const found = (pA: number, pB: number): ForecastEntry => ({ forecast: { pA, pB, computedAt }, forecastReason: null });
  const [a, b] = game.teams.map((t) => t.split('-')[0]);
  // matches[] の a・b はブルー・レッドの順。teams(辞書順)と逆なら勝率を入れ替える
  const row = (Array.isArray(table.matches) ? table.matches : []).find((m: unknown): m is Record<string, unknown> =>
    isObj(m) && m.stage === game.stage && m.tier === game.tier && (m.stage === 'masters' ? m.cup : m.day) === game.day && ((m.a === a && m.b === b) || (m.a === b && m.b === a)));
  if (row && num(row.pA) && num(row.pB)) return row.a === a ? found(row.pA, row.pB) : found(row.pB, row.pA);
  // stageWinTables[ステージ][階級]['X>Y'] は X の勝率(0〜1。X < Y)
  const byStage = isObj(table.stageWinTables) && game.stage ? table.stageWinTables[game.stage] : null;
  const pairs = isObj(byStage) && game.tier ? byStage[game.tier] : null;
  if (isObj(pairs)) {
    const p = num(pairs[`${a}>${b}`]) ? (pairs[`${a}>${b}`] as number) : num(pairs[`${b}>${a}`]) ? 1 - (pairs[`${b}>${a}`] as number) : null;
    if (p !== null) return found(...percentPair(p));
  }
  return none(NO_PAIR_IN_TABLE);
}

/** 前回の results.json の games[] から、試合 ID → forecast と理由。形の違うファイル・forecast の欄の無い要素は読まない */
function previousForecasts(prevResults: unknown): Map<string, ForecastEntry> {
  const prev = new Map<string, ForecastEntry>();
  if (!isObj(prevResults) || prevResults.kind !== 'results' || !Array.isArray(prevResults.games)) return prev;
  for (const g of prevResults.games as unknown[]) {
    if (!isObj(g) || typeof g.matchId !== 'string') continue;
    const f = g.forecast;
    if (f === null) prev.set(g.matchId, { forecast: null, forecastReason: typeof g.forecastReason === 'string' ? g.forecastReason : NO_TABLE_BEFORE_MATCH });
    else if (isObj(f) && num(f.pA) && num(f.pB) && typeof f.computedAt === 'string') prev.set(g.matchId, { forecast: { pA: f.pA, pB: f.pB, computedAt: f.computedAt }, forecastReason: null });
  }
  return prev;
}

/**
 * 基準11: 本番の試合に予測を付ける。前回の results.json(prevResults)に同じ試合 ID があれば、その forecast(null と理由を含む)を引き継ぐ。
 * 無ければ初めて読んだ記録として、前回の勝率表(prevWinrates。作り直す前の winrates.json)から取る。スクリムには付けない
 */
export function freezeForecasts(games: readonly ResultsGame[], prevResults: unknown, prevWinrates: unknown): ResultsGame[] {
  const prev = previousForecasts(prevResults);
  return games.map((g) => (g.kind === 'official' ? { ...g, ...(prev.get(g.matchId) ?? forecastOf(g, prevWinrates)) } : { ...g }));
}
