// F-011 Task-4: 受入基準9(勝率の計算がメタをどう使うかの説明)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { winRateMetaView } from '../../src/app/meta/winrate.ts';
import axes from '../../src/rating/axes.json' with { type: 'json' };

test('AC9: 勝率の計算が実装されるまでは「勝率の計算はメタを使っていない」と表示する', () => {
  const v = winRateMetaView({ winRateImplemented: false });
  assert.equal(v.status, '未使用');
  assert.match(v.headline, /勝率の計算はメタを使っていない/);
});

test('AC9: 現在の入力として、F-009 のピックプールの軸の式と入力(評価設定の値)を表示する', () => {
  const v = winRateMetaView({ winRateImplemented: false });
  const pool = (axes as { pool: { minGamesPerChampion: number; winRatePriorGames: number; countWeight: number; winRateWeight: number } }).pool;
  const text = v.current.map((x) => `${x.label} ${x.value}`).join('\n');
  assert.match(text, /ピックプール/);
  assert.ok(text.includes(`${pool.minGamesPerChampion} 試合以上`), text);
  assert.ok(text.includes(`${pool.countWeight}`) && text.includes(`${pool.winRateWeight}`), text);
  assert.ok(text.includes(`(勝ち数 + ${pool.winRatePriorGames / 2}) / (試合数 + ${pool.winRatePriorGames})`), text);
  assert.match(text, /直近 120 日/);
});

test('AC9: F-005 で予定しているメタの使い方(メタの近さ m の式)を、仕様の所在とともに「予定」として示す', () => {
  const v = winRateMetaView({ winRateImplemented: false });
  assert.ok(v.planned.length >= 2);
  const text = v.planned.map((x) => `${x.label} ${x.value}`).join('\n');
  assert.match(text, /m = 0\.5 × m_pool \+ 0\.5 × m_style/);
  assert.match(text, /段階A 1\.0、段階B 0\.5/);
  assert.match(v.plannedSource, /specs\/F-005\/spec\.md/);
  assert.match(v.plannedLabel, /予定/);
});

test('AC9: 勝率の計算が実装されたら「未使用」の表示をやめる', () => {
  const v = winRateMetaView({ winRateImplemented: true });
  assert.equal(v.status, '使用中');
  assert.doesNotMatch(v.headline, /使っていない/);
});
