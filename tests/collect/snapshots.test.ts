// F-003 Task-3: 受入基準 7・8・9(静的・定性・メタのスナップショットの読み込みと検証)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePlayerFile } from '../../src/data/validate.ts';
import {
  readStaticSnapshot,
  readQualitativeSnapshot,
  readMetaSnapshot,
  loadSnapshotFile,
  saveMetaSnapshot,
  toPlayerFile,
} from '../../src/collect/snapshots.ts';

const ev = (value: number | string, retrievedAt = '2026-10-08') => ({
  value,
  source: 'docs/research/players-dd-cc.md',
  retrievedAt,
  confidence: '中' as const,
  author: { kind: 'ai' as const, model: 'gemini-2.5-pro' },
});
const qual = (score: number, rationale = 'LTK S3 で全試合のコールを担当した') => ({
  score,
  rationale,
  sources: ['docs/research/players-dd-cc.md'],
  author: { kind: 'human' as const },
});

// ---- 基準7: 静的なデータ ----

test('基準7: 5つの項目が揃った静的な値を受け付ける', () => {
  const r = readStaticSnapshot({
    kind: 'static',
    players: { 'DD-CORE-TOP': { peakRank: ev('MASTER I 200'), ltkWinRate: ev(0.6) } },
  });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(Object.keys(r.snapshot.players['DD-CORE-TOP']).sort(), ['ltkWinRate', 'peakRank']);
});

for (const field of ['source', 'retrievedAt', 'confidence', 'author'] as const) {
  test(`基準7: ${field} が欠けた値を拒否し、選手と項目名を出す`, () => {
    const bad: Record<string, unknown> = { ...ev('Aatrox, Renekton') };
    delete bad[field];
    const r = readStaticSnapshot({
      kind: 'static',
      players: { 'DD-CORE-TOP': { signaturePicks: bad, peakRank: ev('MASTER I 200') } },
    });
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /DD-CORE-TOP/);
    assert.match(r.errors[0], /signaturePicks/);
    assert.match(r.errors[0], new RegExp(field));
    assert.equal(r.snapshot.players['DD-CORE-TOP'].signaturePicks, undefined);
    assert.ok(r.snapshot.players['DD-CORE-TOP'].peakRank);
  });
}

test('基準7: AI が書いた値にモデル名が無ければ拒否する', () => {
  const r = readStaticSnapshot({
    kind: 'static',
    players: { 'CC-CORE-MID': { peakRank: { ...ev('GRANDMASTER'), author: { kind: 'ai' } } } },
  });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /CC-CORE-MID/);
  assert.match(r.errors[0], /peakRank/);
});

test('基準7: 名簿に無い選手と、形の誤ったファイルを拒否する', () => {
  const r = readStaticSnapshot({ kind: 'static', players: { 'XX-NONE': { peakRank: ev('IRON') } } });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /XX-NONE/);
  assert.deepEqual(r.snapshot.players, {});
  assert.ok(readStaticSnapshot({ kind: 'meta', players: {} }).errors.length > 0);
  assert.ok(readStaticSnapshot(null).errors.length > 0);
});

// ---- 基準8: 定性の評価 ----

test('基準8: 0〜10 の点数と根拠の文章を持つ評価を受け付ける', () => {
  const r = readQualitativeSnapshot({
    kind: 'qualitative',
    players: { 'DD-CORE-JG': { igl: qual(0), growth: qual(10), synergy: qual(6.5) } },
  });
  assert.deepEqual(r.errors, []);
  assert.equal(r.snapshot.players['DD-CORE-JG'].growth?.score, 10);
});

test('基準8: 根拠の文章が無い・空の評価を拒否し、選手と項目名を出す', () => {
  const noRationale: Record<string, unknown> = { ...qual(7) };
  delete noRationale.rationale;
  const r = readQualitativeSnapshot({
    kind: 'qualitative',
    players: { 'DD-CORE-JG': { shotcalling: noRationale, personality: qual(5, '  '), igl: qual(8) } },
  });
  assert.equal(r.errors.length, 2);
  assert.ok(r.errors.some((e) => /DD-CORE-JG/.test(e) && /shotcalling/.test(e)));
  assert.ok(r.errors.some((e) => /DD-CORE-JG/.test(e) && /personality/.test(e)));
  assert.deepEqual(Object.keys(r.snapshot.players['DD-CORE-JG']), ['igl']);
});

test('基準8: 0〜10 の外、または数値でない点数を拒否する', () => {
  const r = readQualitativeSnapshot({
    kind: 'qualitative',
    players: { 'DD-CORE-JG': { igl: qual(11), coach: qual(-1), matchup: { ...qual(5), score: '5' } } },
  });
  assert.equal(r.errors.length, 3);
  assert.deepEqual(r.snapshot.players['DD-CORE-JG'] ?? {}, {});
});

test('基準8: 形の誤った定性のファイルを拒否する', () => {
  assert.ok(readQualitativeSnapshot({ kind: 'static', players: {} }).errors.length > 0);
  assert.ok(readQualitativeSnapshot({ kind: 'qualitative', players: { 'DD-CORE-JG': 'x' } }).errors.length > 0);
});

// ---- 基準9: メタ ----

const meta = (): Record<string, unknown> => ({
  kind: 'meta',
  patch: '25.19',
  retrievedAt: '2026-10-08',
  source: 'https://www.leagueoflegends.com/ja-jp/news/game-updates/patch-25-19-notes/',
  confidence: '高',
  author: { kind: 'human' },
  patchChanges: [{ champion: 'Ahri', change: 'buff', summary: 'Q のダメージ増加' }],
  worldsPickBan: [{ champion: 'Azir', pickRate: 0.4, banRate: 0.3 }],
  roleTiers: [{ role: 'MID', champion: 'Azir', tier: 'S' }],
  trends: [{ kind: 'macro', summary: '早期のドラゴン争い' }],
});

test('基準9: パッチ番号と取得日を各データに付けて返す', () => {
  const r = readMetaSnapshot(meta());
  assert.deepEqual(r.errors, []);
  assert.equal(r.snapshot?.patch, '25.19');
  assert.equal(r.snapshot?.retrievedAt, '2026-10-08');
  for (const list of ['patchChanges', 'worldsPickBan', 'roleTiers', 'trends'] as const) {
    assert.ok(r.snapshot![list].length > 0);
    for (const item of r.snapshot![list]) {
      assert.equal(item.patch, '25.19');
      assert.equal(item.retrievedAt, '2026-10-08');
    }
  }
});

test('基準9: パッチ番号の無い・形の誤ったメタを拒否する', () => {
  const noPatch = meta();
  delete noPatch.patch;
  const r = readMetaSnapshot(noPatch);
  assert.equal(r.snapshot, null);
  assert.ok(r.errors.some((e) => /patch|パッチ/.test(e)));
  assert.equal(readMetaSnapshot({ ...meta(), patch: 'latest' }).snapshot, null);
  assert.equal(readMetaSnapshot({ ...meta(), retrievedAt: undefined }).snapshot, null);
  assert.equal(readMetaSnapshot({ ...meta(), worldsPickBan: 'x' }).snapshot, null);
  assert.equal(readMetaSnapshot({ ...meta(), kind: 'static' }).snapshot, null);
});

test('基準9: 保存したメタのファイルにパッチ番号と取得日が入る。パッチ番号が無ければ保存しない', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snap-'));
  try {
    const path = saveMetaSnapshot(dir, meta());
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(saved.patch, '25.19');
    assert.equal(saved.retrievedAt, '2026-10-08');
    assert.equal(saved.worldsPickBan[0].patch, '25.19');
    assert.equal(saved.worldsPickBan[0].retrievedAt, '2026-10-08');
    const noPatch = meta();
    delete noPatch.patch;
    assert.throws(() => saveMetaSnapshot(dir, noPatch), /patch|パッチ/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- ファイルの読み込みと PlayerFile への統合 ----

test('ファイルを kind で振り分けて読み込む', () => {
  const dir = mkdtempSync(join(tmpdir(), 'snap-'));
  try {
    const p = join(dir, 's.json');
    writeFileSync(p, JSON.stringify({ kind: 'static', players: { 'DD-CORE-TOP': { peakRank: { ...ev('X'), source: '' } } } }));
    const r = loadSnapshotFile(p);
    assert.equal(r.kind, 'static');
    assert.match(r.errors[0], /DD-CORE-TOP.*peakRank/);
    const m = join(dir, 'm.json');
    writeFileSync(m, JSON.stringify(meta()));
    assert.equal(loadSnapshotFile(m).kind, 'meta');
    const q = join(dir, 'q.json');
    writeFileSync(q, JSON.stringify({ kind: 'qualitative', players: {} }));
    assert.equal(loadSnapshotFile(q).kind, 'qualitative');
    const u = join(dir, 'u.json');
    writeFileSync(u, JSON.stringify({ kind: 'other' }));
    assert.ok(loadSnapshotFile(u).errors.length > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('静的と定性を F-002 の指標ファイルの形へ統合する。同じ項目は取得日の新しい値を採る', () => {
  const s1 = readStaticSnapshot({ kind: 'static', players: { 'DD-CORE-TOP': { peakRank: ev('DIAMOND I', '2026-09-01') } } }).snapshot;
  const s2 = readStaticSnapshot({ kind: 'static', players: { 'DD-CORE-TOP': { peakRank: ev('MASTER I 200', '2026-10-08'), kda: ev(3.1) } } }).snapshot;
  const q = readQualitativeSnapshot({ kind: 'qualitative', players: { 'DD-CORE-TOP': { igl: qual(7) } } }).snapshot;
  const f = toPlayerFile('DD-CORE-TOP', [s2, s1], [q]);
  assert.deepEqual(validatePlayerFile(f), []);
  assert.equal(f.metrics.peakRank?.value, 'MASTER I 200');
  assert.equal(f.metrics.kda?.value, 3.1);
  assert.equal(f.qualitative.igl?.score, 7);
  assert.deepEqual(f.recentMatches, []);
  const empty = toPlayerFile('DD-CORE-JG', [s1], [q]);
  assert.deepEqual(empty.metrics, {});
  assert.deepEqual(empty.qualitative, {});
});
