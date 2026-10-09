// #54: 他の機能が data/snapshots/ に置くスナップショット(F-010 の LTK3 の集計)を、F-003 の集計はエラーにせず読み飛ばす
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSnapshotFile } from '../../src/collect/snapshots.ts';
import { writePublicData } from '../../src/collect/aggregate.ts';

const dir = () => mkdtempSync(join(tmpdir(), 'snap-kinds-'));

test('#54: kind が ltk3-aggregate のスナップショットはエラーにせず、選手の指標の材料にもしない', () => {
  const d = dir();
  const path = join(d, 'ltk3-aggregate.json');
  writeFileSync(path, JSON.stringify({ kind: 'ltk3-aggregate', source: { name: 'x', url: 'https://example.com', retrievedAt: '2026-10-09' }, teams: [], roles: [] }));
  const s = loadSnapshotFile(path);
  assert.equal(s.kind, null);
  assert.equal(s.snapshot, null);
  assert.deepEqual(s.errors, []);
});

test('#54: 集計のコマンドは LTK3 の集計を置いた snapshots でもエラーを出さない', () => {
  const d = dir();
  const snapshotsDir = join(d, 'snap');
  mkdirSync(snapshotsDir, { recursive: true });
  writeFileSync(join(snapshotsDir, 'ltk3-aggregate.json'), JSON.stringify({ kind: 'ltk3-aggregate', teams: [], roles: [] }));
  const r = writePublicData({ rawDir: join(d, 'raw'), publicDir: join(d, 'public'), snapshotsDir });
  assert.deepEqual(r.errors, []);
});

test('#54: 知らない kind は従来どおりエラーにする', () => {
  const d = dir();
  const path = join(d, 'odd.json');
  writeFileSync(path, JSON.stringify({ kind: 'something-else' }));
  const s = loadSnapshotFile(path);
  assert.equal(s.kind, null);
  assert.equal(s.errors.length, 1);
  assert.match(s.errors[0], /kind が/);
});
