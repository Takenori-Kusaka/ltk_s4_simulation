// F-003 Task-4: 定性の評価の下書きのコマンド
//   node src/collect/ai-draft-cli.ts --player <選手ID> --item <項目>   1件(--item を省くと全項目)
//   node src/collect/ai-draft-cli.ts --all [--item <項目>]           全選手
// 下書きは data/snapshots/qualitative-ai-draft-<日付>.json へ保存する。確定は人がレビューして行う(F-003 確定した事項)
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { ROSTER } from '../data/roster.ts';
import { QUALITATIVE_ITEMS, createGeminiRunner, draftQualitative, loadResearchDocs, saveDraft } from './ai-draft.ts';
import type { GeminiRunner } from './ai-draft.ts';

export interface MainOptions {
  argv: string[];
  env: Record<string, string | undefined>;
  runner?: GeminiRunner;
  docsDir?: string;
  dataDir?: string;
  /** YYYY-MM-DD。既定は実行日 */
  date?: string;
  out?: (line: string) => void;
}

const USAGE = '使い方: ai-draft-cli.ts --player <選手ID> [--item <項目>] | --all [--item <項目>]';

/** 終了コード: 0 = すべて保存、1 = 拒否した下書きがある、2 = 引数の誤り(Gemini を呼ばない) */
export async function main(opts: MainOptions): Promise<number> {
  const out = opts.out ?? ((l: string) => console.log(l));
  let values: { player?: string; item?: string; all?: boolean };
  try {
    ({ values } = parseArgs({
      args: opts.argv,
      options: { player: { type: 'string' }, item: { type: 'string' }, all: { type: 'boolean' } },
    }));
  } catch (e) {
    out(`${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  if (!values.all && !values.player) {
    out(USAGE);
    return 2;
  }
  if (values.item !== undefined && !(values.item in QUALITATIVE_ITEMS)) {
    out(`未知の項目: ${values.item}(${Object.keys(QUALITATIVE_ITEMS).join(', ')})`);
    return 2;
  }
  if (!values.all && !ROSTER.some((p) => p.id === values.player)) {
    out(`名簿に無い選手: ${values.player}`);
    return 2;
  }
  const players = values.all ? ROSTER.map((p) => p.id) : [values.player as string];
  const items = values.item ? [values.item] : Object.keys(QUALITATIVE_ITEMS);
  const docs = loadResearchDocs(opts.docsDir ?? 'docs/research');
  const runner = opts.runner ?? createGeminiRunner({ env: opts.env });
  const dataDir = opts.dataDir ?? 'data/snapshots';
  const date = opts.date ?? new Date().toLocaleDateString('sv-SE');
  let rejected = 0;
  for (const playerId of players) {
    for (const item of items) {
      const r = await draftQualitative({ playerId, item, docs, runner });
      if (r.qualitative) {
        const path = saveDraft(dataDir, date, playerId, item, r.qualitative);
        out(`保存: ${playerId}: ${item} = ${r.qualitative.score} → ${path}`);
      } else {
        rejected++;
        for (const e of r.errors) out(`拒否: ${e}`);
      }
    }
  }
  out(`下書き: 保存 ${players.length * items.length - rejected} 件、拒否 ${rejected} 件`);
  return rejected === 0 ? 0 : 1;
}

// 直接の実行の入口。テストは main を呼ぶ
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main({ argv: process.argv.slice(2), env: process.env });
}
