// F-003 Task-4 基準11: Gemini CLI による定性の評価の下書き
// 入力は調査資料(docs/research/players-*.md)の該当する選手の部分とその出典だけ。出力は書いた主体「AI(モデル名)」で保存する
// Gemini CLI は非対話(`gemini -p`)で呼び、--yolo を付けない(ADR-0002 決定4)。テキストの生成だけに使う
import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROSTER } from '../data/roster.ts';
import type { Player } from '../data/roster.ts';
import type { Qualitative } from '../data/types.ts';
import { readQualitativeSnapshot } from './snapshots.ts';

export const GEMINI_MODEL = 'gemini-3.8-flash';

/** 定性の項目。laning・teamfight・shotcalling・metaFit は src/score/scoring.json の採点が使うキー */
export const QUALITATIVE_ITEMS: Record<string, string> = {
  shotcalling: 'コール力・IGL 力(試合中の指示と判断、大会経験)',
  laning: 'レーン戦の強さ',
  teamfight: 'チームファイト(集団戦)の強さ',
  metaFit: '現在のメタへの適合(得意チャンピオンとメタの一致)',
  personality: '性格・チームでの振る舞い',
  synergy: 'チームメンバーとの相性・連携の継続性',
  coach: 'コーチとの相性・指導の受けやすさ',
  matchup: '対面との相性',
  growth: '成長ポテンシャル(大会までの伸び)',
};

export interface ResearchDoc {
  /** リポジトリからの相対パス(出典として渡す) */
  path: string;
  text: string;
}
export interface Research {
  excerpt: string;
  sources: string[];
}
/** プロンプトを受け取り、Gemini の出力のテキストを返す */
export type GeminiRunner = (prompt: string) => Promise<string>;

const ROLE_HEADING = /^(#{2,6})\s+(TOP|JG|MID|ADC|SUP)\s+(.*)$/;
const URL_RE = /https?:\/\/[^\s)）\]、,，]+/g;
const findPlayer = (id: string): Player | undefined => ROSTER.find((p) => p.id === id);

/** 見出しの残りが選手名で始まり、名前の直後が文字・数字でない(別の選手名の前方一致を避ける) */
const startsWithName = (rest: string, name: string) => rest.startsWith(name) && !/^[\p{L}\p{N}]/u.test(rest.slice(name.length));

function extractFromDoc(player: Player, text: string): string[] {
  const lines = text.split(/\r?\n/);
  const parts: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const h = ROLE_HEADING.exec(lines[i]);
    if (h && h[2] === player.role && startsWithName(h[3], player.name)) {
      let end = i + 1;
      while (end < lines.length && !(/^(#+)\s/.exec(lines[end]) && /^(#+)/.exec(lines[end])![1].length <= h[1].length)) end++;
      parts.push(lines.slice(i, end).join('\n').trim());
      i = end - 1;
      continue;
    }
    // 要約表の行(| ロール | 選手名 | ...)。表の見出しの行を添える
    const cells = lines[i].split('|').map((c) => c.trim());
    if (lines[i].startsWith('|') && cells[1] === player.role && cells[2] === player.name) {
      let top = i;
      while (top > 0 && lines[top - 1].startsWith('|')) top--;
      parts.push([lines[top], lines[i]].join('\n'));
    }
  }
  if (parts.length === 0) return parts;
  // 抜粋が参照する共通の出典([KEY])の定義の行を添える
  const body = parts.join('\n');
  const refs = lines.filter((l) => {
    const m = /^- \[([^\]]+)\]/.exec(l);
    return m !== null && body.includes(`[${m[1]}]`);
  });
  if (refs.length > 0) parts.push(['参照している出典:', ...refs].join('\n'));
  return parts;
}

/** 選手の節・要約表の行・参照する出典の定義だけを抜き出し、出典(資料のパスと URL)を集める */
export function extractResearch(playerId: string, docs: readonly ResearchDoc[]): Research {
  const player = findPlayer(playerId);
  const chunks: string[] = [];
  const sources = new Set<string>();
  if (!player) return { excerpt: '', sources: [] };
  for (const doc of docs) {
    const parts = extractFromDoc(player, doc.text);
    if (parts.length === 0) continue;
    const text = parts.join('\n\n');
    chunks.push(`<!-- 出典: ${doc.path} -->\n${text}`);
    sources.add(doc.path);
    for (const u of text.match(URL_RE) ?? []) sources.add(u.replace(/[.。]+$/, ''));
  }
  return { excerpt: chunks.join('\n\n'), sources: [...sources] };
}

/** 調査資料のディレクトリから players-*.md を読む */
export function loadResearchDocs(dir = 'docs/research'): ResearchDoc[] {
  return readdirSync(dir)
    .filter((f) => /^players-.*\.md$/.test(f))
    .sort()
    .map((f) => ({ path: join(dir, f).replace(/\\/g, '/'), text: readFileSync(join(dir, f), 'utf8') }));
}

export function buildPrompt(playerId: string, item: string, research: Research): string {
  const p = findPlayer(playerId)!;
  return [
    'あなたは League of Legends の配信者大会 LTK の選手を評価する分析者です。',
    `次の調査資料の抜粋だけを根拠に、選手「${p.name}」(${p.team} ${p.tier} ${p.role})の項目 "${item}"(${QUALITATIVE_ITEMS[item]})を 0〜10 の点数で評価してください。`,
    '抜粋に無い事柄を推測で補わないでください。根拠が乏しい場合は、そのことを根拠の文章に書いてください。',
    '',
    '## 調査資料の抜粋',
    research.excerpt,
    '',
    '## 使ってよい出典(sources にはこの一覧の文字列だけを書く)',
    ...research.sources.map((s) => `- ${s}`),
    '',
    '## 出力の形式',
    '次の形の JSON だけを出力してください。前後に説明の文章を付けないでください。',
    '{"score": <0〜10 の数値>, "rationale": "<日本語の根拠の文章>", "sources": ["<上の一覧から選んだ出典>"]}',
  ].join('\n');
}

export interface DraftResult {
  qualitative: Qualitative | null;
  errors: string[];
}

/** AI の出力を JSON として読み、既存の定性の検証(0〜10・根拠・出典・書いた主体)と、渡した出典だけを使っているかを確かめる */
export function parseDraft(output: string, ctx: { playerId: string; item: string; allowedSources: readonly string[] }): DraftResult {
  const at = `${ctx.playerId}: ${ctx.item}`;
  const fenced = /^\s*```(?:json)?\s*\n([\s\S]*?)\n\s*```\s*$/.exec(output);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fenced ? fenced[1] : output);
  } catch {
    return { qualitative: null, errors: [`${at}: AI の出力が JSON ではない`] };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { qualitative: null, errors: [`${at}: AI の出力が JSON のオブジェクトではない`] };
  }
  const o = parsed as Record<string, unknown>;
  const q = { score: o.score, rationale: o.rationale, sources: o.sources, author: { kind: 'ai', model: GEMINI_MODEL } };
  const { snapshot, errors } = readQualitativeSnapshot({ kind: 'qualitative', players: { [ctx.playerId]: { [ctx.item]: q } } });
  if (errors.length > 0) return { qualitative: null, errors: errors.map((e) => `${at}: ${e}`) };
  const unknown = (q.sources as string[]).filter((s) => !ctx.allowedSources.includes(s));
  if (unknown.length > 0) return { qualitative: null, errors: [`${at}: 渡していない出典を含む(${unknown.join(', ')})`] };
  return { qualitative: snapshot.players[ctx.playerId][ctx.item], errors: [] };
}

/** 1人・1項目の下書きを作る。拒否は errors に入れて返す(投げない) */
export async function draftQualitative(opts: {
  playerId: string;
  item: string;
  docs: readonly ResearchDoc[];
  runner: GeminiRunner;
}): Promise<DraftResult> {
  const { playerId, item } = opts;
  const at = `${playerId}: ${item}`;
  if (!findPlayer(playerId)) return { qualitative: null, errors: [`${playerId}: 名簿に無い選手`] };
  if (!(item in QUALITATIVE_ITEMS)) return { qualitative: null, errors: [`${at}: 未知の項目`] };
  const research = extractResearch(playerId, opts.docs);
  if (research.excerpt === '') return { qualitative: null, errors: [`${at}: 調査資料に該当する部分が無い`] };
  let output: string;
  try {
    output = await opts.runner(buildPrompt(playerId, item, research));
  } catch (e) {
    return { qualitative: null, errors: [`${at}: Gemini CLI の実行に失敗した(${e instanceof Error ? e.message : String(e)})`] };
  }
  return parseDraft(output, { playerId, item, allowedSources: research.sources });
}

/** 検証済みの下書きを `<dir>/qualitative-ai-draft-<date>.json` へ追記して保存し、パスを返す */
export function saveDraft(dir: string, date: string, playerId: string, item: string, q: Qualitative): string {
  const path = join(dir, `qualitative-ai-draft-${date}.json`);
  const players = existsSync(path) ? readQualitativeSnapshot(JSON.parse(readFileSync(path, 'utf8'))).snapshot.players : {};
  players[playerId] = { ...players[playerId], [item]: q };
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify({ kind: 'qualitative', players }, null, 2) + '\n');
  return path;
}

interface ChildLike {
  stdout: { on(ev: 'data', fn: (b: Buffer) => void): unknown };
  stderr: { on(ev: 'data', fn: (b: Buffer) => void): unknown };
  stdin: { end(s: string): void } | null;
  on(ev: 'close', fn: (code: number | null) => void): unknown;
  on(ev: 'error', fn: (e: Error) => void): unknown;
}
export type SpawnFn = (cmd: string, args: string[], opts: { env: Record<string, string | undefined>; shell: boolean }) => ChildLike;

/**
 * 既定の runner。`gemini -p <固定の指示> --model <モデル>` を起動し、組み立てたプロンプトは標準入力で渡す
 * (gemini -p は標準入力の後ろに -p の文字列を付けて1つのプロンプトにする)。
 * 引数に調査資料の文字列を載せないため、Windows で shell を通しても引数の解釈が変わらない。--yolo は付けない
 */
export function createGeminiRunner(opts: {
  env: Record<string, string | undefined>;
  spawnFn?: SpawnFn;
  platform?: string;
  model?: string;
}): GeminiRunner {
  const spawnFn = opts.spawnFn ?? (nodeSpawn as unknown as SpawnFn);
  const shell = (opts.platform ?? process.platform) === 'win32';
  const args = ['-p', '上の指示に従い、JSON だけを出力してください。', '--model', opts.model ?? GEMINI_MODEL];
  const env = { ...process.env, GOOGLE_CLOUD_PROJECT_ID: opts.env.GOOGLE_CLOUD_PROJECT_ID };
  return (prompt) =>
    new Promise((resolve, reject) => {
      const child = spawnFn('gemini', shell ? args.map((a) => (a.includes(' ') || /[^\x20-\x7e]/.test(a) ? `"${a}"` : a)) : args, { env, shell });
      let out = '';
      let err = '';
      child.stdout.on('data', (b) => (out += b.toString()));
      child.stderr.on('data', (b) => (err += b.toString()));
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`gemini の終了コード ${code}: ${err.trim()}`))));
      child.stdin?.end(prompt);
    });
}
