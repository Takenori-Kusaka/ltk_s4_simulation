// F-004 Task-5(基準23): 当てはまりの確認の命令。node src/results/fit-cli.ts
// 受け付けた記録から本番の試合と予測(前回の results.json から引き継ぐ。集計と同じ規則)を作り、
// 評価設定の組ごとに個人の評価・階級チームの S を作り直して、docs/research/results-fit.md を書く
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROSTER } from '../data/roster.ts';
import { buildRatings, loadRatingInputs } from '../rating/build.ts';
import ratingConfig from '../rating/config.json' with { type: 'json' };
import { teamIndicators } from '../rating/team-indicators.ts';
import type { EngineConfig } from '../rating/types.ts';
import { evaluateTeams } from '../team/evaluate.ts';
import winrateConfig from '../winrate/config.json' with { type: 'json' };
import { readChampionList } from './champions.ts';
import { enoughOfficialGames, fitReportOf, formatFitMarkdown, MIN_OFFICIAL_GAMES, oppAdjustVariants, scrimWeightVariants, type EngineVariant } from './fit.ts';
import { DEFAULT_RESULTS_ROOT, formatResultError, loadResults } from './load.ts';
import { buildResultsFile, type ResultsGame } from './official.ts';

type Scores = Readonly<Record<string, number | null>>;

export interface FitMainOptions {
  rawDir?: string;
  publicDir?: string;
  snapshotsDir?: string;
  groundsDir?: string;
  resultsRoot?: string;
  /** 書き出し先(既定 docs/research/results-fit.md) */
  outPath?: string;
  now?: () => Date;
  out?: (line: string) => void;
  /** F-005 の β の目標の広がり(既定は src/winrate/config.json の beta.targetSd) */
  targetSd?: number;
  /** 評価設定の engine(既定は src/rating/config.json)。組の見出しに使う */
  engineConfig?: Partial<EngineConfig>;
  /** 本番とスクリムの試合(予測つき)。既定は記録と前回の results.json・winrates.json から作る */
  loadGames?: () => { games: ResultsGame[]; errors: string[] };
  /** 評価設定を engine で上書きして作り直した、階級チームごとの S。既定は個人の評価から F-010 の S まで作り直す */
  scoresOf?: (engine: Partial<EngineConfig>) => Scores;
}

const readJsonOrNull = (path: string): unknown => {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  } catch {
    return null;
  }
};

/** 組の設定の比較の対象。Task-13・F-009 Task-18 はここへ組を足す */
function variantsOf(cfg: Partial<EngineConfig>): EngineVariant[] {
  return [...scrimWeightVariants(cfg), ...oppAdjustVariants(cfg)];
}

/** 評価設定(src/rating/config.json の engine)を一時的に上書きして fn を実行する。評価の計算は設定をこの JSON から読む */
function withEngine<T>(engine: Partial<EngineConfig>, fn: () => T): T {
  const target = (ratingConfig as unknown as { engine: Record<string, unknown> }).engine;
  const saved = { ...target };
  Object.assign(target, engine);
  try {
    return fn();
  } finally {
    for (const k of Object.keys(target)) if (!(k in saved)) delete target[k];
    Object.assign(target, saved);
  }
}

export async function main(opts: FitMainOptions = {}): Promise<number> {
  const out = opts.out ?? ((l: string) => console.log(l));
  const publicDir = opts.publicDir ?? 'data/public';
  const now = (opts.now ?? (() => new Date()))();
  const outPath = opts.outPath ?? 'docs/research/results-fit.md';
  const loaded = (opts.loadGames ?? (() => gamesFromRecords(opts, publicDir, now)))();
  if (loaded.errors.length) {
    for (const e of loaded.errors) out(`試合結果の記録のエラー: ${e}`);
    out('試合結果の記録が検証に反したため、当てはまりの確認を書かない');
    return 3;
  }
  const official = loaded.games.filter((g) => g.kind === 'official').length;
  if (!enoughOfficialGames(loaded.games)) {
    out(`本番の記録が ${official} 試合で ${MIN_OFFICIAL_GAMES} 試合に満たないため、当てはまりの確認を書かない`);
    return 0;
  }
  const engineConfig = opts.engineConfig ?? (ratingConfig as unknown as { engine: Partial<EngineConfig> }).engine;
  const scoresOf = opts.scoresOf ?? ((engine: Partial<EngineConfig>) => scoresFromRatings(opts, publicDir, engine, now));
  const variants = variantsOf(engineConfig).map((v) => ({ key: v.key, label: v.label, S: scoresOf(v.engine) }));
  const report = fitReportOf({ games: loaded.games, variants, targetSd: opts.targetSd ?? winrateConfig.beta.targetSd });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, formatFitMarkdown(report, { computedAt: now.toISOString() }));
  out(`当てはまりの確認を書いた: ${outPath}(本番 ${report.official} 試合。予測あり ${report.forecast.all.n}・比べた組 ${variants.length})`);
  return 0;
}

/** 集計(aggregate-cli)と同じ規則で、記録から results.json の games[] を作る。予測は前回の results.json・winrates.json から */
function gamesFromRecords(opts: FitMainOptions, publicDir: string, now: Date): { games: ResultsGame[]; errors: string[] } {
  const loaded = recordsOf(opts, publicDir);
  if (loaded.errors.length) return { games: [], errors: loaded.errors.map(formatResultError) };
  const file = buildResultsFile({
    games: loaded.games, computedAt: now.toISOString(),
    prevResults: readJsonOrNull(join(publicDir, 'results.json')), prevWinrates: readJsonOrNull(join(publicDir, 'winrates.json')),
  });
  return { games: file.games, errors: [] };
}

/** 受け付けた試合結果の記録(検証はチャンピオンの一覧があれば使う。集計と同じ) */
function recordsOf(opts: FitMainOptions, publicDir: string) {
  const champions = readChampionList(readJsonOrNull(join(publicDir, 'champions.json'))).list;
  return loadResults({ root: opts.resultsRoot ?? DEFAULT_RESULTS_ROOT, champions });
}

/** 評価設定を engine で上書きして個人の評価と F-010 の階級チームの S を作り直す。評価の無い選手のいる階級チームは null(集計と同じ) */
function scoresFromRatings(opts: FitMainOptions, publicDir: string, engine: Partial<EngineConfig>, now: Date): Scores {
  // 本番・スクリムの記録は評価の試合の記録にも入る(F-004 基準12・41)。集計と同じく受け付けた記録を渡す
  const records = recordsOf(opts, publicDir).games;
  return withEngine(engine, () => {
    const { inputs } = loadRatingInputs({ rawDir: opts.rawDir ?? 'data/raw', groundsDir: opts.groundsDir ?? 'docs/research/grounds/normalized', scrims: records });
    const ratings = buildRatings(inputs, now.getTime());
    const teamOf = new Map(ROSTER.map((r) => [r.id, r.team]));
    const teams = teamIndicators(inputs.players.map((p) => ({ ...p, team: teamOf.get(p.playerId) ?? '' })), inputs.matches, now.getTime());
    const ev = evaluateTeams({ ratings, inputs: inputs.players, matches: inputs.matches, teamIndicators: teams, now: now.getTime(), snapshotsDir: opts.snapshotsDir ?? 'data/snapshots', ownerViews: inputs.teamViews });
    const rated = new Set(ratings.map((r) => r.playerId));
    return Object.fromEntries(ev.tierTeams.map((t) => {
      const unrated = ROSTER.some((p) => p.team === t.team && p.tier === t.tier && !rated.has(p.id));
      return [`${t.team}-${t.tier}`, unrated ? null : t.S];
    }));
  });
}

// 直接の実行の入口。テストは main を呼ぶ
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
