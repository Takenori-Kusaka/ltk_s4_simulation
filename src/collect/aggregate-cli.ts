// F-003: 集計のコマンド。収集(src/collect/cli.ts)の後に `node src/collect/aggregate-cli.ts` で実行する
// Riot API は呼ばない(保存済みの data/raw/ を読む)。Data Dragon だけをネットワークから取る
import { pathToFileURL } from 'node:url';
import { writePublicData } from './aggregate.ts';
import { saveDataDragon } from './ddragon.ts';
import type { FetchLike } from './riot.ts';

export interface AggregateMainOptions {
  rawDir?: string;
  publicDir?: string;
  snapshotsDir?: string;
  fetch?: FetchLike;
  now?: () => Date;
  out?: (line: string) => void;
}

/** 終了コード: 0 = 完了、1 = 一部の失敗(Data Dragon の取得、読めないファイル)。失敗しても書ける集計は書く */
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
  try {
    const path = await saveDataDragon(publicDir, { fetch: opts.fetch, now: opts.now });
    out(`Data Dragon のチャンピオンの一覧を書いた: ${path}`);
  } catch (e) {
    out(`Data Dragon の取得に失敗: ${e instanceof Error ? e.message : String(e)}`);
    code = 1;
  }
  return code;
}

// 直接の実行の入口。テストは main を呼ぶ
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
