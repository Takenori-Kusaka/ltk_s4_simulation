// F-004 Task-3(基準 8・9・10・20・24): 受け付けた記録から、F-005 の結果の入力 games[](本番とスクリム)、
// 階級チームごとの連敗の数 k と本番の勝敗の並び、勝率表の results の欄、results.json の中身を作る。
// DOM と Node 固有の API に依存しない(読み書きは src/collect/aggregate-cli.ts)
import { REGULAR_DAYS } from '../sim/schedule.ts';
import { TEAMS, TIERS, type Tier } from '../sim/types.ts';
import { freezeForecasts, type Forecast } from './forecast.ts';
import type { MatchResult, ResultKind, ResultSource, Stage, TierTeamId } from './types.ts';

/** results.json の games[] の 1 要素(F-005 の結果の入力)。θ への重みは F-005 の評価設定 weights が決め、ここでは持たない(基準20) */
export interface ResultsGame {
  /** 用語「試合 ID」 */
  matchId: string;
  date: string;
  /** スクリムは stage・day が null。tier は両チームの階級(階級の違うスクリムは null) */
  stage: Stage | null;
  day: number | null;
  tier: Tier | null;
  /** 2 つの階級チーム ID(辞書順) */
  teams: [TierTeamId, TierTeamId];
  winner: TierTeamId;
  kind: ResultKind;
  source: ResultSource;
  /** 基準11: 本番の試合だけが持つ。null なら forecastReason に理由 */
  forecast?: Forecast | null;
  forecastReason?: string | null;
}
/** results.json の teams[] の 1 要素。form は本番の勝敗の並び(新しい順。W = 勝ち、L = 負け。例 LLW)、k は先頭から続く L の数 */
export interface TeamStreak { key: TierTeamId; k: number; form: string }
/** 勝率表(winrates.json)の results の欄 */
export interface ResultsSummary { official: number; scrim: number; latestDate: string }
export interface ResultsFile { kind: 'results'; computedAt: string; games: ResultsGame[]; teams: TeamStreak[] }

const STAGES: readonly Stage[] = ['regular', 'masters', 'playoffs'];
/** 用語「日程の順」のマッチの並び(MASTERS CUP、Playoffs) */
const MATCHES: readonly string[] = ['semi1', 'semi2', 'third', 'final', 'upperFinal', 'lowerSemi', 'lowerFinal', 'grandFinal'];
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 同じ試合日の中の並びの鍵(小さいほど先)。本番は用語「日程の順」: Regular Stage は日程のカードの順に NEXT → CORE、
 * MASTERS CUP と Playoffs はマッチの順にゲーム番号の順。スクリムは日程を持たないため、同じ日の本番の後ろに、組(階級チーム ID)・通し番号の順
 */
function orderKey(g: MatchResult): [number, number, number, number] {
  const o = g.official;
  if (!o) return [1, 0, 0, Number(/-G(\d+)$/.exec(g.matchId)?.[1] ?? 0)];
  if (o.stage !== 'regular') return [0, STAGES.indexOf(o.stage), MATCHES.indexOf(o.match ?? ''), o.game];
  const cards = REGULAR_DAYS.find((d) => d.day === o.day)?.cards ?? [];
  return [0, 0, cards.findIndex((c) => g.teams.includes(`${c.blue}-${o.tier}`) && g.teams.includes(`${c.red}-${o.tier}`)), TIERS.indexOf(o.tier)];
}

/**
 * 基準8・20: 受け付けた記録(loadResults の games。リスナー参加・重複は除かれている)を、試合日の昇順、同じ日は日程の順に並べた games[] にする。
 * 渡した並びに依らない(基準24)。予測の欄は付けない(freezeForecasts が付ける)
 */
export function resultGamesOf(results: readonly MatchResult[]): ResultsGame[] {
  const keyed = results.map((g) => ({ g, key: orderKey(g), pair: g.teams.join('|') }));
  keyed.sort((x, y) =>
    cmp(x.g.date, y.g.date) || x.key[0] - y.key[0] || x.key[1] - y.key[1] || (x.g.official ? 0 : cmp(x.pair, y.pair)) || x.key[2] - y.key[2] || x.key[3] - y.key[3] || cmp(x.g.matchId, y.g.matchId));
  return keyed.map(({ g }) => {
    const [ta, tb] = g.teams.map((t) => t.split('-')[1] as Tier);
    return {
      matchId: g.matchId, date: g.date, stage: g.official?.stage ?? null, day: g.official?.day ?? null, tier: g.official?.tier ?? (ta === tb ? ta : null),
      teams: [g.teams[0], g.teams[1]], winner: g.winner, kind: g.kind, source: { ...g.source },
    };
  });
}

/**
 * 階級チーム key の本番の勝敗の並び(新しい順)。games は games[] の並び(resultGamesOf の出力)。スクリムは数えない。
 * MASTERS CUP の決勝と Playoffs は 1 ゲームを 1 試合として数える。before を渡せば、その試合日より前(当日を含まない)の本番だけ
 */
export function formOf(games: readonly ResultsGame[], key: string, before?: string): string {
  let form = '';
  for (const g of games) {
    if (g.kind !== 'official' || (g.teams[0] !== key && g.teams[1] !== key) || (before !== undefined && g.date >= before)) continue;
    form = (g.winner === key ? 'W' : 'L') + form;
  }
  return form;
}

/**
 * 基準9: 連敗の数 k(その階級チームの直前の本番から遡って続いた負けの数。勝てば 0)。
 * before(試合日)を渡せば、その日の試合に使う k(F-005 基準11 の気持ちの補正 dayShift の kA・kB に渡す値)
 */
export function losingStreakOf(games: readonly ResultsGame[], key: string, before?: string): number {
  const form = formOf(games, key, before);
  const win = form.indexOf('W');
  return win < 0 ? form.length : win;
}

/** 基準9: 12 の階級チーム(階級の順にチームの順)の k と勝敗の並び。本番の記録が無い階級チームは k = 0・並びは空 */
export function teamStreaksOf(games: readonly ResultsGame[]): TeamStreak[] {
  return TIERS.flatMap((tier) => TEAMS.map((team) => {
    const key: TierTeamId = `${team}-${tier}`;
    return { key, k: losingStreakOf(games, key), form: formOf(games, key) };
  }));
}

/**
 * 基準10: 勝率表の results の欄(本番の試合数・スクリムの試合数・勝率表に入れた記録の最新の試合日)。
 * 本番の記録が無い間は null(画面は results の有無で「予想(開幕前)」と「結果を反映」を分ける。基準22)
 */
export function resultsSummaryOf(games: readonly ResultsGame[]): ResultsSummary | null {
  const official = games.filter((g) => g.kind === 'official').length;
  if (official === 0) return null;
  return { official, scrim: games.length - official, latestDate: games.reduce((d, g) => (g.date > d ? g.date : d), '') };
}

/**
 * results.json の中身。prevResults は前回の results.json、prevWinrates は作り直す前の winrates.json(どちらも無ければ null)。
 * 同じ記録・同じ基準日(computedAt)・同じ前回のファイルから同じ値を返す(基準24)
 */
export function buildResultsFile(input: { games: readonly MatchResult[]; computedAt: string; prevResults?: unknown; prevWinrates?: unknown }): ResultsFile {
  const games = freezeForecasts(resultGamesOf(input.games), input.prevResults, input.prevWinrates);
  return { kind: 'results', computedAt: input.computedAt, games, teams: teamStreaksOf(games) };
}
