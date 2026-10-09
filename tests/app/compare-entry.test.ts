// F-008 Task-3: 受入基準 15〜17(選手のページの「対面と比較」、次に当たる対面、チームのページからの入口)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jstDate, nextOpponent, opponentCompareHref, teamCompareEntries } from '../../src/app/compare/opponent.ts';
import { parseRoute, compareStartHref, pageTitle } from '../../src/app/lib/index.ts';
import { candidateTargets } from '../../src/app/compare/render.ts';

test('基準15: 基準日は閲覧した日の日本時間の日付', () => {
  assert.equal(jstDate(new Date('2026-10-14T14:59:59Z')), '2026-10-14');
  assert.equal(jstDate(new Date('2026-10-14T15:00:00Z')), '2026-10-15');
});

test('基準15: NEXT・CORE は Regular Stage の日程から、基準日より後で最初の試合日の相手の同じ階級・同じロールの選手', () => {
  assert.deepEqual(nextOpponent('CC-NEXT-TOP', '2026-10-10'), { opponentId: 'DD-NEXT-TOP', team: 'DD', date: '2026-10-15' });
  // 試合日の当日は「より後」に当たらないので次の試合日
  assert.deepEqual(nextOpponent('CC-NEXT-TOP', '2026-10-15'), { opponentId: 'LR-NEXT-TOP', team: 'LR', date: '2026-10-19' });
  assert.deepEqual(nextOpponent('IT-CORE-MID', '2026-10-20'), { opponentId: 'CC-CORE-MID', team: 'CC', date: '2026-10-23' });
});

test('基準15: MASTERS は MASTERS CUP の準決勝の組み合わせから相手を決める', () => {
  assert.deepEqual(nextOpponent('CC-MASTERS-MID', '2026-10-10'), { opponentId: 'DD-MASTERS-MID', team: 'DD', date: '2026-10-20' });
  assert.deepEqual(nextOpponent('CC-MASTERS-MID', '2026-10-20'), { opponentId: 'LR-MASTERS-MID', team: 'LR', date: '2026-10-28' });
});

test('基準15: 「対面と比較」は自分を1つ目、対面を2つ目にした比較の URL を開く', () => {
  assert.equal(opponentCompareHref('CC-NEXT-TOP', new Date('2026-10-10T03:00:00Z')), '#/compare/CC-NEXT-TOP/DD-NEXT-TOP');
  const r = parseRoute(opponentCompareHref('CC-NEXT-TOP', new Date('2026-10-10T03:00:00Z'))!);
  assert.deepEqual(r, { page: 'compare', targets: ['CC-NEXT-TOP', 'DD-NEXT-TOP'] });
});

test('基準16: 基準日より後にチームの試合日が無ければ「対面と比較」を出さない', () => {
  assert.equal(nextOpponent('CC-NEXT-TOP', '2026-11-06'), null);
  assert.equal(nextOpponent('CC-MASTERS-MID', '2026-11-09'), null);
  assert.equal(opponentCompareHref('CC-CORE-MID', new Date('2026-11-07T03:00:00Z')), null);
  assert.equal(nextOpponent('XX-NEXT-TOP', '2026-10-10'), null);
});

test('基準17: チームのページの「比較」は、チーム全体と各階級チームを1つ目の系列にした比較の画面を開く', () => {
  const e = teamCompareEntries('CC');
  assert.deepEqual(e.map((x) => x.id), ['CC', 'CC-NEXT', 'CC-CORE', 'CC-MASTERS']);
  assert.equal(e[2].href, compareStartHref('CC-CORE'));
  assert.deepEqual(parseRoute(e[2].href), { page: 'compare-start', target: 'CC-CORE' });
  assert.deepEqual(parseRoute('#/compare-from/cc'), { page: 'compare-start', target: 'CC' });
  assert.match(pageTitle({ page: 'compare-start', target: 'CC-CORE' }), /CC-CORE/);
});

test('基準17: 比較を始める画面は2つ目以降の対象(同じ種類・同じ階級)を選ばせる。存在しない対象は見つからない', () => {
  assert.deepEqual(candidateTargets(['CC-CORE']).map((t) => t.id), ['DD-CORE', 'IT-CORE', 'LR-CORE']);
  assert.equal(parseRoute('#/compare-from/XX').page, 'notfound');
  assert.equal(parseRoute('#/compare-from/').page, 'notfound');
  // 基準20 は変わらない: 比較の URL の対象が1つだけなら見つからない
  assert.equal(parseRoute('#/compare/CC-CORE').page, 'notfound');
});
