// F-010 Task-1: LTK3 の集計の取り込みの命令(受入基準 21b)
// 手元(リポジトリの外の tmp/)にある Data シートの CSV から、集計値だけのスナップショットを書く。
//   node src/team/ltk3-cli.ts --csv tmp/research-data/csv/Data.csv --out data/snapshots/ltk3-aggregate.json --retrieved 2026-10-09
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aggregateLtk3, LTK3_SOURCE, validateLtk3Snapshot } from './ltk3.ts';

const arg = (argv: readonly string[], name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

/** 1行に1つの集計の行(差分を読みやすくし、行数を抑える) */
function formatSnapshot(s: ReturnType<typeof aggregateLtk3>): string {
  const rows = (xs: unknown[]) => xs.map((x) => `    ${JSON.stringify(x)}`).join(',\n');
  return [
    '{',
    `  "kind": ${JSON.stringify(s.kind)},`,
    `  "source": ${JSON.stringify(s.source)},`,
    `  "description": ${JSON.stringify(s.description)},`,
    `  "teams": [\n${rows(s.teams)}\n  ],`,
    `  "roles": [\n${rows(s.roles)}\n  ]`,
    '}',
    '',
  ].join('\n');
}

/** 終了コード: 0 = 書いた、1 = 引数の欠け・読めない CSV・検査の失敗(書かない) */
export function main(argv: readonly string[], out: (line: string) => void = (l) => console.log(l)): number {
  const csv = arg(argv, '--csv');
  const dest = arg(argv, '--out') ?? 'data/snapshots/ltk3-aggregate.json';
  const retrievedAt = arg(argv, '--retrieved') ?? new Date().toISOString().slice(0, 10);
  if (!csv) {
    out('--csv に Data シートの CSV の場所を渡してください');
    return 1;
  }
  let text: string;
  try {
    text = readFileSync(csv, 'utf8');
  } catch (e) {
    out(`CSV を読めない: ${(e as Error).message}`);
    return 1;
  }
  const snapshot = aggregateLtk3(text, { ...LTK3_SOURCE, retrievedAt });
  const errors = validateLtk3Snapshot(snapshot);
  if (errors.length) {
    for (const e of errors) out(`エラー: ${e}`);
    return 1;
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, formatSnapshot(snapshot));
  out(`LTK3 の集計を書いた: ${dest}(チームの行 ${snapshot.teams.length} 件、ロールの行 ${snapshot.roles.length} 件)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
