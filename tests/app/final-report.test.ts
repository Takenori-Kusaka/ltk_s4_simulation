import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseRoute, pageTitle } from '../../src/app/lib/index.ts';

test('最終レポートへのルーティング: #/report および #/final-report で report ページへ遷移する', () => {
  assert.deepEqual(parseRoute('#/report'), { page: 'report' });
  assert.deepEqual(parseRoute('#/final-report'), { page: 'report' });
  assert.deepEqual(parseRoute('#/REPORT'), { page: 'report' });
  assert.deepEqual(parseRoute('#/FINAL-REPORT'), { page: 'report' });

  const title = pageTitle({ page: 'report' });
  assert.match(title, /最終検証レポート/);
});

test('FinalReportPage.svelte が存在し、必要な検証セクションを含む', () => {
  const path = new URL('../../src/app/report/FinalReportPage.svelte', import.meta.url);
  assert.ok(existsSync(path));
  const src = readFileSync(path, 'utf8');
  assert.match(src, /Camellia Crown/);
  assert.match(src, /Iris Tiara/);
  assert.match(src, /Laurel Regalia/);
  assert.match(src, /Dahlia Diadem/);
  assert.match(src, /Brier/);
  assert.match(src, /アーカイブ/);
});

test('Home.svelte と SimPage.svelte に最終レポートへの導線が存在する', () => {
  const home = readFileSync(new URL('../../src/app/components/Home.svelte', import.meta.url), 'utf8');
  assert.match(home, /href="#\/report"/);

  const sim = readFileSync(new URL('../../src/app/sim/SimPage.svelte', import.meta.url), 'utf8');
  assert.match(sim, /href="#\/report"/);
});

test('docs/final-report.md が存在し、最終結果と事後検証が記録されている', () => {
  const path = new URL('../../docs/final-report.md', import.meta.url);
  assert.ok(existsSync(path));
  const md = readFileSync(path, 'utf8');
  assert.match(md, /Camellia Crown/);
  assert.match(md, /6勝0敗/);
  assert.match(md, /とおこ/);
});
