// F-003 Task-4: 受入基準 11(Gemini CLI による定性の評価の下書き。入力は調査資料の該当部分と出典、出力は書いた主体「AI(モデル名)」)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  QUALITATIVE_ITEMS,
  GEMINI_MODEL,
  extractResearch,
  loadResearchDocs,
  buildPrompt,
  parseDraft,
  draftQualitative,
  saveDraft,
  createGeminiRunner,
} from '../../src/collect/ai-draft.ts';
import type { ResearchDoc } from '../../src/collect/ai-draft.ts';
import { main } from '../../src/collect/ai-draft-cli.ts';
import { readQualitativeSnapshot } from '../../src/collect/snapshots.ts';

// 名簿の実在の選手(DD-MASTERS-TOP = わしだい、DD-MASTERS-JG = しゃるる)で合成した調査資料
const DOC_A: ResearchDoc = {
  path: 'docs/research/players-dd-cc.md',
  text: [
    '# 調査',
    '## 共通の出典',
    '- [S3-games] S3 の試合ごとの使用チャンピオン: https://example.invalid/s3-games',
    '- [UNUSED] 使わない出典: https://example.invalid/unused',
    '## 1. サマリー表',
    '| Role | 選手 | ランク | 確度 |',
    '|---|---|---|---|',
    '| TOP | わしだい | Challenger 1518LP | 高 |',
    '| JG | しゃるる | Master 221LP | 中 |',
    '## MASTERS',
    '### TOP わしだい（Washidai）— 確度: 高',
    '- **ランク**: Challenger 1518LP — https://example.invalid/opgg-washidai',
    '- **過去の LTK**: S3 DD MASTERS TOP、MVP3回 [S3-games]',
    '- **ショットコール**: 未確認。',
    '### JG しゃるる（@syaruruuu）— 確度: 中〜高',
    '- **ランク**: Master 221LP Qiyana 51戦45% — https://example.invalid/opgg-syaruru',
    '## CORE',
    '### TOP 酒寄颯馬 — 確度: 高',
    '- **ランク**: Emerald 2 — https://example.invalid/opgg-sakayori',
  ].join('\n'),
};
const DOC_B: ResearchDoc = {
  path: 'docs/research/players-it-lr.md',
  text: ['# 別の資料', '#### TOP らいじん(@Eclair08)', '- Diamond 2 — https://example.invalid/raijin'].join('\n'),
};
const DOCS = [DOC_A, DOC_B];

const good = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    score: 8,
    rationale: 'S3 の MASTERS で MVP を3回取り、TOP の主導権を握った試合が多い',
    sources: ['https://example.invalid/opgg-washidai'],
    ...over,
  });

const tmp = () => mkdtempSync(join(tmpdir(), 'ai-draft-'));

// ---- 入力: 調査資料の該当部分と出典だけを渡す ----

test('基準11: 抜粋は対象の選手の節と要約表の行だけを含み、ほかの選手の内容を含まない', () => {
  const r = extractResearch('DD-MASTERS-TOP', DOCS);
  assert.match(r.excerpt, /Challenger 1518LP — https:\/\/example\.invalid\/opgg-washidai/);
  assert.match(r.excerpt, /\| TOP \| わしだい \| Challenger 1518LP/);
  assert.match(r.excerpt, /ショットコール/);
  assert.doesNotMatch(r.excerpt, /Qiyana|Master 221LP|しゃるる|酒寄颯馬|らいじん/);
});

test('基準11: 出典は資料のパスと抜粋中の URL と、抜粋が参照する共通の出典の URL', () => {
  const r = extractResearch('DD-MASTERS-TOP', DOCS);
  assert.deepEqual(r.sources.sort(), [
    'docs/research/players-dd-cc.md',
    'https://example.invalid/opgg-washidai',
    'https://example.invalid/s3-games',
  ]);
  assert.match(r.excerpt, /\[S3-games\] S3 の試合ごとの使用チャンピオン/);
  assert.doesNotMatch(r.excerpt, /UNUSED/);
});

test('基準11: 「####」の見出しの資料からも節を切り出す', () => {
  const r = extractResearch('IT-MASTERS-TOP', DOCS);
  assert.match(r.excerpt, /Diamond 2/);
  assert.deepEqual(r.sources.sort(), ['docs/research/players-it-lr.md', 'https://example.invalid/raijin']);
});

test('基準11: 資料に記載の無い選手は、抜粋と出典が空になる', () => {
  const r = extractResearch('LR-NEXT-SUP', DOCS);
  assert.equal(r.excerpt, '');
  assert.deepEqual(r.sources, []);
});

test('基準11: プロンプトは抜粋・出典・項目・JSON の形式を含み、ほかの選手の内容を含まない', () => {
  const research = extractResearch('DD-MASTERS-TOP', DOCS);
  const p = buildPrompt('DD-MASTERS-TOP', 'shotcalling', research);
  assert.match(p, /わしだい/);
  assert.match(p, /shotcalling/);
  assert.ok(p.includes(research.excerpt));
  for (const s of research.sources) assert.ok(p.includes(s));
  assert.match(p, /"score"/);
  assert.match(p, /"rationale"/);
  assert.match(p, /"sources"/);
  assert.doesNotMatch(p, /Qiyana|酒寄颯馬|らいじん/);
});

test('基準11: 採点が使う定性の項目のキーを含む', () => {
  for (const k of ['laning', 'teamfight', 'shotcalling', 'metaFit', 'personality', 'synergy', 'coach', 'matchup', 'growth']) {
    assert.ok(k in QUALITATIVE_ITEMS, k);
  }
});

test('基準11: 調査資料のディレクトリから players-*.md だけを読む', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'players-x.md'), '# x');
  writeFileSync(join(dir, 'meta-draft.md'), '# meta');
  const docs = loadResearchDocs(dir);
  assert.equal(docs.length, 1);
  assert.match(docs[0].path, /players-x\.md$/);
  assert.equal(docs[0].text, '# x');
});

// ---- 出力の検証: 書いた主体は AI(モデル名) ----

test('基準11: 正しい JSON を、書いた主体 AI(モデル名)の定性の評価にする', () => {
  const allowed = ['https://example.invalid/opgg-washidai'];
  const r = parseDraft(good(), { playerId: 'DD-MASTERS-TOP', item: 'laning', allowedSources: allowed });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.qualitative?.author, { kind: 'ai', model: GEMINI_MODEL });
  assert.equal(GEMINI_MODEL, 'gemini-3.8-flash');
  assert.equal(r.qualitative?.score, 8);
});

test('基準11: コードブロックで囲んだ JSON も受け付ける', () => {
  const r = parseDraft('```json\n' + good() + '\n```\n', {
    playerId: 'DD-MASTERS-TOP', item: 'laning', allowedSources: ['https://example.invalid/opgg-washidai'],
  });
  assert.deepEqual(r.errors, []);
});

for (const [name, output] of [
  ['JSON ではない', 'わしだいは強いので 8 点です'],
  ['範囲外の点数', good({ score: 11 })],
  ['負の点数', good({ score: -1 })],
  ['数値でない点数', good({ score: '8' })],
  ['空の根拠', good({ rationale: '  ' })],
  ['出典が空', good({ sources: [] })],
  ['渡していない出典', good({ sources: ['https://example.invalid/made-up'] })],
  ['オブジェクトでない', '[1, 2]'],
] as const) {
  test(`基準11: AI の出力を拒否する(${name})`, () => {
    const r = parseDraft(output, {
      playerId: 'DD-MASTERS-TOP', item: 'laning', allowedSources: ['https://example.invalid/opgg-washidai'],
    });
    assert.equal(r.qualitative, null);
    assert.ok(r.errors.length > 0);
    assert.ok(r.errors.some((e) => e.includes('DD-MASTERS-TOP') && e.includes('laning')), r.errors.join('\n'));
  });
}

test('基準11: 下書きは抜粋を入れたプロンプトで runner を呼び、検証済みの評価を返す', async () => {
  const prompts: string[] = [];
  const r = await draftQualitative({
    playerId: 'DD-MASTERS-TOP', item: 'teamfight', docs: DOCS,
    runner: async (p) => { prompts.push(p); return good(); },
  });
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /Challenger 1518LP/);
  assert.deepEqual(r.errors, []);
  assert.equal(r.qualitative?.author.model, GEMINI_MODEL);
});

test('基準11: 資料に記載の無い選手は runner を呼ばずに拒否する', async () => {
  let called = false;
  const r = await draftQualitative({
    playerId: 'LR-NEXT-SUP', item: 'teamfight', docs: DOCS, runner: async () => { called = true; return good(); },
  });
  assert.equal(called, false);
  assert.equal(r.qualitative, null);
  assert.ok(r.errors[0].includes('LR-NEXT-SUP'));
});

test('基準11: 名簿に無い選手・未知の項目・runner の失敗を拒否として返す', async () => {
  const runner = async () => good();
  assert.equal((await draftQualitative({ playerId: 'XX-NONE', item: 'laning', docs: DOCS, runner })).qualitative, null);
  assert.equal((await draftQualitative({ playerId: 'DD-MASTERS-TOP', item: 'igl', docs: DOCS, runner })).qualitative, null);
  const failed = await draftQualitative({
    playerId: 'DD-MASTERS-TOP', item: 'laning', docs: DOCS, runner: async () => { throw new Error('gemini が見つからない'); },
  });
  assert.equal(failed.qualitative, null);
  assert.match(failed.errors[0], /gemini が見つからない/);
});

// ---- 保存: 定性のスナップショットとして data/snapshots/ へ ----

test('基準11: 下書きを qualitative-ai-draft-<日付>.json へ保存し、同じファイルへ追記する', () => {
  const dir = tmp();
  const q = (score: number) => ({
    score, rationale: '根拠の文章', sources: ['docs/research/players-dd-cc.md'], author: { kind: 'ai' as const, model: GEMINI_MODEL },
  });
  const p1 = saveDraft(dir, '2026-10-08', 'DD-MASTERS-TOP', 'laning', q(7));
  const p2 = saveDraft(dir, '2026-10-08', 'DD-MASTERS-TOP', 'teamfight', q(6));
  saveDraft(dir, '2026-10-08', 'DD-MASTERS-JG', 'laning', q(5));
  assert.equal(p1, join(dir, 'qualitative-ai-draft-2026-10-08.json'));
  assert.equal(p1, p2);
  const raw = JSON.parse(readFileSync(p1, 'utf8'));
  const { snapshot, errors } = readQualitativeSnapshot(raw);
  assert.deepEqual(errors, []);
  assert.deepEqual(Object.keys(snapshot.players['DD-MASTERS-TOP']).sort(), ['laning', 'teamfight']);
  assert.equal(snapshot.players['DD-MASTERS-JG'].laning.score, 5);
  assert.deepEqual(snapshot.players['DD-MASTERS-TOP'].laning.author, { kind: 'ai', model: GEMINI_MODEL });
});

// ---- 既定の runner: gemini -p を非対話で、--yolo なしで呼ぶ ----

function fakeSpawn(code: number, stdout: string, stderr = '') {
  const calls: { cmd: string; args: string[]; opts: { env?: Record<string, string | undefined>; shell?: boolean }; stdin: string }[] = [];
  const spawnFn = (cmd: string, args: string[], opts: { env?: Record<string, string | undefined>; shell?: boolean }) => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; stdin: { end: (s: string) => void } };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    const call = { cmd, args, opts, stdin: '' };
    calls.push(call);
    child.stdin = { end: (s: string) => { call.stdin = s; } };
    setImmediate(() => {
      if (stdout) child.stdout.emit('data', Buffer.from(stdout));
      if (stderr) child.stderr.emit('data', Buffer.from(stderr));
      child.emit('close', code);
    });
    return child;
  };
  return { calls, spawnFn };
}

test('基準11: 既定の runner は gemini -p をモデル指定で呼び、--yolo を付けず、プロジェクト ID を環境変数で渡す', async () => {
  const { calls, spawnFn } = fakeSpawn(0, good());
  const runner = createGeminiRunner({ env: { GOOGLE_CLOUD_PROJECT_ID: 'proj-1' }, spawnFn, platform: 'linux' });
  const out = await runner('プロンプト本文');
  assert.equal(out, good());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, 'gemini');
  assert.ok(calls[0].args.includes('-p'));
  assert.deepEqual(calls[0].args.slice(calls[0].args.indexOf('--model'), calls[0].args.indexOf('--model') + 2), ['--model', 'gemini-3.8-flash']);
  assert.ok(!calls[0].args.some((a) => /yolo/i.test(a)));
  assert.equal(calls[0].opts.env?.GOOGLE_CLOUD_PROJECT_ID, 'proj-1');
  // プロンプトは引数か標準入力のどちらかで渡る
  assert.ok(calls[0].stdin.includes('プロンプト本文') || calls[0].args.some((a) => a.includes('プロンプト本文')));
});

test('基準11: 既定の runner は終了コードが 0 でなければ失敗する', async () => {
  const { spawnFn } = fakeSpawn(1, '', 'auth error');
  const runner = createGeminiRunner({ env: {}, spawnFn, platform: 'linux' });
  await assert.rejects(runner('p'), /auth error/);
});

test('基準11: 既定の runner は起動の失敗を失敗として返す', async () => {
  const spawnFn = () => {
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; stdin: { end: () => void } };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { end: () => {} };
    setImmediate(() => child.emit('error', new Error('spawn gemini ENOENT')));
    return child;
  };
  const runner = createGeminiRunner({ env: {}, spawnFn, platform: 'win32' });
  await assert.rejects(runner('p'), /ENOENT/);
});

// ---- コマンド ----

function cliEnv() {
  const docsDir = tmp();
  writeFileSync(join(docsDir, 'players-a.md'), DOC_A.text);
  const dataDir = join(tmp(), 'snapshots');
  const lines: string[] = [];
  return { docsDir, dataDir, lines, out: (l: string) => lines.push(l) };
}

test('基準11: --player と --item で1件を下書きして保存する', async () => {
  const e = cliEnv();
  const code = await main({
    argv: ['--player', 'DD-MASTERS-TOP', '--item', 'laning'], env: {}, runner: async () => good(),
    docsDir: e.docsDir, dataDir: e.dataDir, date: '2026-10-08', out: e.out,
  });
  assert.equal(code, 0);
  const raw = JSON.parse(readFileSync(join(e.dataDir, 'qualitative-ai-draft-2026-10-08.json'), 'utf8'));
  assert.deepEqual(raw.players['DD-MASTERS-TOP'].laning.author, { kind: 'ai', model: 'gemini-3.8-flash' });
});

test('基準11: 不正な出力は保存せず、選手と項目と理由を報告して終了コード 1 を返す', async () => {
  const e = cliEnv();
  const code = await main({
    argv: ['--player', 'DD-MASTERS-TOP', '--item', 'laning'], env: {}, runner: async () => good({ score: 42 }),
    docsDir: e.docsDir, dataDir: e.dataDir, date: '2026-10-08', out: e.out,
  });
  assert.equal(code, 1);
  assert.equal(existsSync(join(e.dataDir, 'qualitative-ai-draft-2026-10-08.json')), false);
  assert.ok(e.lines.some((l) => l.includes('DD-MASTERS-TOP') && l.includes('laning')), e.lines.join('\n'));
});

test('基準11: --all は全選手 × 全項目を下書きし、拒否した分を報告して残りを保存する', async () => {
  const e = cliEnv();
  const prompts: string[] = [];
  const code = await main({
    argv: ['--all'], env: {},
    runner: async (p) => { prompts.push(p); return p.includes('"teamfight"') ? 'not json' : good(); },
    docsDir: e.docsDir, dataDir: e.dataDir, date: '2026-10-08', out: e.out,
  });
  assert.equal(code, 1);
  // 資料に記載のある3選手 × 9項目だけ runner を呼ぶ
  assert.equal(prompts.length, 3 * Object.keys(QUALITATIVE_ITEMS).length);
  const raw = JSON.parse(readFileSync(join(e.dataDir, 'qualitative-ai-draft-2026-10-08.json'), 'utf8'));
  const { errors } = readQualitativeSnapshot(raw);
  assert.deepEqual(errors, []);
  assert.ok(!('teamfight' in raw.players['DD-MASTERS-TOP']));
  assert.ok('laning' in raw.players['DD-MASTERS-TOP']);
  assert.ok(e.lines.some((l) => l.includes('LR-NEXT-SUP')));
});

test('基準11: --all と --item で全選手の1項目に絞る', async () => {
  const e = cliEnv();
  let n = 0;
  const code = await main({
    argv: ['--all', '--item', 'metaFit'], env: {},
    runner: async () => { n++; return good(); },
    docsDir: e.docsDir, dataDir: e.dataDir, date: '2026-10-08', out: e.out,
  });
  assert.equal(n, 3);
  assert.equal(code, 1); // 資料に記載の無い選手を拒否として報告する
});

test('基準11: 引数が足りない・未知の項目・名簿に無い選手は、Gemini を呼ばずに終了コード 2 を返す', async () => {
  const e = cliEnv();
  let called = false;
  const runner = async () => { called = true; return good(); };
  const base = { env: {}, runner, docsDir: e.docsDir, dataDir: e.dataDir, date: '2026-10-08', out: e.out };
  assert.equal(await main({ ...base, argv: [] }), 2);
  assert.equal(await main({ ...base, argv: ['--player', 'DD-MASTERS-TOP', '--item', 'igl'] }), 2);
  assert.equal(await main({ ...base, argv: ['--player', 'XX-NONE', '--item', 'laning'] }), 2);
  assert.equal(called, false);
});
