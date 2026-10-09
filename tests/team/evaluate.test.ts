// F-010 Task-5: 集計のコマンドがチームの評価(強さの軸・コーチの枠・戦い方の特性・総合の軸)を書く
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../../src/collect/aggregate-cli.ts';

const ddragon = async (url: string) =>
  new Response(JSON.stringify(url.endsWith('versions.json') ? ['16.20.1'] : { type: 'champion', version: '16.20.1', data: { Ahri: { id: 'Ahri', key: '103', name: 'アーリ' } } }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });

test('集計のコマンドは team-evaluation.json に 12 の階級チームと 4 チームの総合の軸(7本)を書く', async () => {
  const root = mkdtempSync(join(tmpdir(), 'f010-eval-'));
  const lines: string[] = [];
  await main({ rawDir: join(root, 'raw'), publicDir: join(root, 'public'), snapshotsDir: 'data/snapshots', fetch: ddragon, now: () => new Date('2026-10-10T00:00:00Z'), out: (l) => lines.push(l) });
  const saved = JSON.parse(readFileSync(join(root, 'public', 'team-evaluation.json'), 'utf8'));
  assert.equal(saved.kind, 'team-evaluation');
  assert.equal(saved.tierTeams.length, 12);
  assert.deepEqual(saved.overall.map((t: { team: string }) => t.team), ['DD', 'CC', 'IT', 'LR']);
  for (const t of saved.overall) assert.equal(t.axes.length, 7);
  const rs = saved.overall[0].axes.find((a: { key: string }) => a.key === 'rsPoints');
  assert.equal(rs.value, null);
  assert.ok(lines.some((l) => /チームの評価を書いた/.test(l)));
});
