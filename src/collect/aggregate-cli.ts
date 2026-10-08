// F-003: 集計のコマンド。収集(src/collect/cli.ts)の後に `node src/collect/aggregate-cli.ts` で実行する
// Riot API は呼ばない(保存済みの data/raw/ を読む)。Data Dragon だけをネットワークから取る
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writePublicData } from './aggregate.ts';
import { saveDataDragon } from './ddragon.ts';
import type { FetchLike } from './riot.ts';
import { buildRatings, configVersion, loadRatingInputs } from '../rating/build.ts';
import { checkKnownFacts, formatReport, type KnownFact } from '../rating/known-facts.ts';
import { teamIndicators } from '../rating/team-indicators.ts';
import { ROSTER } from '../data/roster.ts';

export interface AggregateMainOptions {
  rawDir?: string;
  publicDir?: string;
  snapshotsDir?: string;
  fetch?: FetchLike;
  now?: () => Date;
  out?: (line: string) => void;
  /** コール力・大会経験の根拠の記録(既定は docs/research/grounds/normalized) */
  groundsDir?: string;
  /** 常識の一覧(既定は src/rating/known-facts.json) */
  facts?: KnownFact[];
}

/**
 * 終了コード: 0 = 完了、1 = 一部の失敗(Data Dragon の取得、読めないファイル)。失敗しても書ける集計は書く
 * 2 = 評価が常識の一覧に反した(公開用の評価 ratings.json を書かない。基準22)
 */
export async function main(opts: AggregateMainOptions = {}): Promise<number> {
  const out = opts.out ?? ((l: string) => console.log(l));
  const publicDir = opts.publicDir ?? 'data/public';
  let code = 0;
  const { written, errors } = writePublicData({
    rawDir: opts.rawDir ?? 'data/raw', publicDir, snapshotsDir: opts.snapshotsDir ?? 'data/snapshots',
  });
  out(`集計のファイル ${written.length} 件を書いた`);
  for (const e of errors) out(`エラー: ${e}`);
  if (errors.length > 0) code = 1;
  code = Math.max(code, writeRatings(opts, publicDir, out));
  try {
    const path = await saveDataDragon(publicDir, { fetch: opts.fetch, now: opts.now });
    out(`Data Dragon のチャンピオンの一覧を書いた: ${path}`);
  } catch (e) {
    out(`Data Dragon の取得に失敗: ${e instanceof Error ? e.message : String(e)}`);
    code = 1;
  }
  return code;
}

/** F-009 基準21・22: 評価を計算し、常識の一覧を検査して、反しなければ ratings.json を書く */
function writeRatings(opts: AggregateMainOptions, publicDir: string, out: (l: string) => void): number {
  const now = (opts.now ?? (() => new Date()))();
  const { inputs, errors } = loadRatingInputs({ rawDir: opts.rawDir ?? 'data/raw', groundsDir: opts.groundsDir ?? 'docs/research/grounds/normalized' });
  for (const e of errors) out(`評価の入力のエラー: ${e}`);
  const ratings = buildRatings(inputs, now.getTime());
  const report = checkKnownFacts(ratings, inputs, now.getTime(), { recompute: () => buildRatings(inputs, now.getTime()), facts: opts.facts });
  for (const l of formatReport(report)) out(l);
  if (!report.ok) {
    out(`常識の一覧に ${report.violations.length} 件反したため、評価のファイルを書かない`);
    return 2;
  }
  const teamOf = new Map(ROSTER.map((r) => [r.id, r.team]));
  const teams = teamIndicators(inputs.players.map((p) => ({ ...p, team: teamOf.get(p.playerId) ?? '' })), inputs.matches, now.getTime());
  const path = join(publicDir, 'ratings.json');
  mkdirSync(publicDir, { recursive: true });
  const checks = report.results.map(({ id, status, note }) => ({ id, status, ...(note ? { note } : {}) }));
  const file = { kind: 'ratings', computedAt: now.toISOString(), configVersion: configVersion(), matches: inputs.matches.length, checks, players: ratings, teams };
  writeFileSync(path, JSON.stringify(file, null, 2) + '\n');
  out(`評価のファイルを書いた: ${path}(評価設定の版 ${file.configVersion})`);
  return errors.length ? 1 : 0;
}

// 直接の実行の入口。テストは main を呼ぶ
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
