// F-003: 収集のコマンド。手動の実行は `node --env-file=scripts/.env src/collect/cli.ts`
// キーは環境変数 RIOT_API_KEY からだけ読む。キーのファイルはこのコマンドが直接読まない
import { pathToFileURL } from 'node:url';
import { ROSTER } from '../data/roster.ts';
import { CollectionLockedError, runCollection } from './collect.ts';
import type { CollectPlayer } from './collect.ts';
import { createRiotClient, loadApiKey } from './riot.ts';
import type { FetchLike } from './riot.ts';

export interface MainOptions {
  env: Record<string, string | undefined>;
  dataDir?: string;
  players?: readonly CollectPlayer[];
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** 時計(試験で注入する。既定は現在時刻) */
  now?: () => Date;
  out?: (line: string) => void;
}

/** 終了コード: 0 = 完了、1 = 失敗(キーが無い・API の致命的なエラー)、2 = ほかの収集が実行中 */
export async function main(opts: MainOptions): Promise<number> {
  const out = opts.out ?? ((l: string) => console.log(l));
  let apiKey: string;
  try {
    apiKey = loadApiKey(opts.env);
  } catch (e) {
    out((e as Error).message);
    return 1;
  }
  const client = createRiotClient({ apiKey, fetch: opts.fetch, sleep: opts.sleep, now: opts.now });
  try {
    const summary = await runCollection({
      players: opts.players ?? ROSTER, client, dataDir: opts.dataDir ?? 'data/raw', now: opts.now, out,
    });
    const missing = summary.players.filter((p) => p.status === '未取得').map((p) => p.playerId);
    out(`未取得: ${missing.length ? missing.join(', ') : 'なし'}`);
    return 0;
  } catch (e) {
    out(client.redact(e instanceof Error ? e.message : String(e)));
    return e instanceof CollectionLockedError ? 2 : 1;
  }
}

// 直接の実行の入口。テストは main を呼ぶ
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main({ env: process.env });
}
