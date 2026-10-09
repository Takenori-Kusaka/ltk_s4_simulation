// F-009 Task-10: 文字起こしの前処理の命令
//   node src/transcript/cli.ts [--in data/transcript] [--out data/transcript/structured] [--champions data/public/champions.json]
// data/transcript/ の *.md を読み、data/transcript/structured/<名前>.json を書く(どちらもリポジトリの外。.gitignore)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROSTER } from '../data/roster.ts';
import { structureTranscript, type Structured } from './structure.ts';

/**
 * 書き出しの形(読む側のトークンを減らすため、空の項目を省き短い鍵にする)。
 * segments の各要素: t=開始(m:ss)、s=関連の点数、p=選手の ID、c=確信の低い候補、k=手がかりの分類と数、cp=コールの言い回しの数、x=本文
 */
export function compact(s: Structured) {
  const { segments, ...rest } = s;
  return {
    ...rest,
    legend: 't=開始 s=関連の点数 p=選手 c=確信の低い候補 k=手がかりの分類と数 cp=コールの言い回し x=本文',
    segments: segments.map((g) => ({
      t: g.t,
      s: g.score,
      ...(g.players.length ? { p: g.players } : {}),
      ...(g.candidates.length ? { c: g.candidates } : {}),
      ...(Object.keys(g.categories).length ? { k: g.categories } : {}),
      ...(g.callPhrases ? { cp: g.callPhrases } : {}),
      x: g.text,
    })),
  };
}

const arg = (argv: readonly string[], name: string, fallback: string) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

/** チャンピオンの日本語名: メタの一覧(data/meta/*.json)と Data Dragon の一覧(あれば) */
export function championNames(metaDir: string, ddragonPath: string): string[] {
  const names = new Set<string>();
  if (existsSync(metaDir)) {
    for (const f of readdirSync(metaDir).filter((n) => n.endsWith('.json'))) {
      const j = JSON.parse(readFileSync(join(metaDir, f), 'utf8')) as { champions?: { name?: string }[] };
      for (const c of j.champions ?? []) if (c.name) names.add(c.name);
    }
  }
  if (existsSync(ddragonPath)) {
    const j = JSON.parse(readFileSync(ddragonPath, 'utf8')) as { champions?: Record<string, string> };
    for (const n of Object.values(j.champions ?? {})) names.add(n);
  }
  return [...names];
}

/** 終了コード: 0 = 書いた、1 = 入力の置き場が無い */
export function main(argv: readonly string[], out: (l: string) => void = (l) => console.log(l)): number {
  const inDir = arg(argv, '--in', 'data/transcript');
  const outDir = arg(argv, '--out', join(inDir, 'structured'));
  const champions = championNames(arg(argv, '--meta', 'data/meta'), arg(argv, '--champions', 'data/public/champions.json'));
  if (!existsSync(inDir)) {
    out(`文字起こしの置き場が無い: ${inDir}`);
    return 1;
  }
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(inDir).filter((n) => n.endsWith('.md') || n.endsWith('.txt'))) {
    const raw = readFileSync(join(inDir, f), 'utf8');
    const s = structureTranscript(raw, f, { roster: ROSTER, champions });
    const dest = join(outDir, `${basename(f).replace(/\.(md|txt)$/, '')}.json`);
    const text = JSON.stringify(compact(s));
    writeFileSync(dest, text + '\n');
    out(`${f}: 行 ${s.lines}、区間 ${s.segmentsKept}/${s.segmentsTotal} を残した、${raw.length} → ${text.length} 文字(${Math.round((100 * text.length) / Math.max(1, raw.length))}%)`);
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
