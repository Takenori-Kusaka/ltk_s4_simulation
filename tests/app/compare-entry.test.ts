// F-008 Task-3: 受入基準 15〜17c・23・24(選手のページの「対面と比較」と「4人と比較」、次に当たる対面、チームのページからの入口、系列の入れ替えと基準の付け替え)
// 2026-10-09 の価値責任者の決定(当日を含む対面、4人・4チームの比較、入れ替え)による仕様の変更に合わせて、この PR で足したテストを書き直した
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  jstDate, nextOpponent, opponentCompareHref, teamCompareEntries, sameRoleAllHref, tierAllHref,
} from '../../src/app/compare/opponent.ts';
import { replaceTarget, replaceCandidates, makeBaseTargets } from '../../src/app/compare/view.ts';
import { parseRoute, compareStartHref, compareHref, pageTitle } from '../../src/app/lib/index.ts';
import { candidateTargets } from '../../src/app/compare/render.ts';

test('基準15: 基準日は閲覧した日の日本時間の日付', () => {
  assert.equal(jstDate(new Date('2026-10-14T14:59:59Z')), '2026-10-14');
  assert.equal(jstDate(new Date('2026-10-14T15:00:00Z')), '2026-10-15');
});

test('基準15: NEXT・CORE は Regular Stage の日程から、基準日以降で最初の試合日(当日を含む)の相手の同じ階級・同じロールの選手', () => {
  assert.deepEqual(nextOpponent('CC-NEXT-TOP', '2026-10-10'), { opponentId: 'DD-NEXT-TOP', team: 'DD', date: '2026-10-15' });
  // 試合日の当日はその日の相手
  assert.deepEqual(nextOpponent('CC-NEXT-TOP', '2026-10-15'), { opponentId: 'DD-NEXT-TOP', team: 'DD', date: '2026-10-15' });
  // 翌日から次の試合日までは次の試合の相手
  assert.deepEqual(nextOpponent('CC-NEXT-TOP', '2026-10-16'), { opponentId: 'LR-NEXT-TOP', team: 'LR', date: '2026-10-19' });
  assert.deepEqual(nextOpponent('CC-NEXT-TOP', '2026-10-19'), { opponentId: 'LR-NEXT-TOP', team: 'LR', date: '2026-10-19' });
  assert.deepEqual(nextOpponent('IT-CORE-MID', '2026-10-20'), { opponentId: 'CC-CORE-MID', team: 'CC', date: '2026-10-23' });
});

test('基準15: MASTERS は MASTERS CUP の準決勝の組み合わせから相手を決める(当日を含む)', () => {
  assert.deepEqual(nextOpponent('CC-MASTERS-MID', '2026-10-10'), { opponentId: 'DD-MASTERS-MID', team: 'DD', date: '2026-10-20' });
  assert.deepEqual(nextOpponent('CC-MASTERS-MID', '2026-10-20'), { opponentId: 'DD-MASTERS-MID', team: 'DD', date: '2026-10-20' });
  assert.deepEqual(nextOpponent('CC-MASTERS-MID', '2026-10-21'), { opponentId: 'LR-MASTERS-MID', team: 'LR', date: '2026-10-28' });
});

test('基準15: 「対面と比較」は自分を1つ目、対面を2つ目にした比較の URL を開く', () => {
  assert.equal(opponentCompareHref('CC-NEXT-TOP', new Date('2026-10-10T03:00:00Z')), '#/compare/CC-NEXT-TOP/DD-NEXT-TOP');
  // 試合日の当日(日本時間 2026-10-15 の昼)はその日の相手
  assert.equal(opponentCompareHref('CC-NEXT-TOP', new Date('2026-10-15T03:00:00Z')), '#/compare/CC-NEXT-TOP/DD-NEXT-TOP');
  const r = parseRoute(opponentCompareHref('CC-NEXT-TOP', new Date('2026-10-10T03:00:00Z'))!);
  assert.deepEqual(r, { page: 'compare', targets: ['CC-NEXT-TOP', 'DD-NEXT-TOP'] });
});

test('基準16: 基準日以降にチームの試合日が無ければ「対面と比較」を出さない', () => {
  // 最後の試合日の当日は出し、翌日からは出さない
  assert.deepEqual(nextOpponent('CC-NEXT-TOP', '2026-11-06'), { opponentId: 'IT-NEXT-TOP', team: 'IT', date: '2026-11-06' });
  assert.equal(nextOpponent('CC-NEXT-TOP', '2026-11-07'), null);
  assert.equal(nextOpponent('CC-MASTERS-MID', '2026-11-10'), null);
  assert.equal(opponentCompareHref('CC-CORE-MID', new Date('2026-11-07T03:00:00Z')), null);
  assert.equal(nextOpponent('XX-NEXT-TOP', '2026-10-10'), null);
});

test('基準17: チームのページの「比較」は #/compare-from/<対象> の画面を開き、2つ目以降を選ばせる', () => {
  const e = teamCompareEntries('CC');
  assert.deepEqual(e.map((x) => x.id), ['CC', 'CC-NEXT', 'CC-CORE', 'CC-MASTERS']);
  assert.equal(e[2].href, compareStartHref('CC-CORE'));
  assert.equal(compareStartHref('CC-CORE'), '#/compare-from/CC-CORE');
  assert.deepEqual(parseRoute(e[2].href), { page: 'compare-start', target: 'CC-CORE' });
  assert.deepEqual(parseRoute('#/compare-from/cc'), { page: 'compare-start', target: 'CC' });
  assert.match(pageTitle({ page: 'compare-start', target: 'CC-CORE' }), /CC-CORE/);
  assert.deepEqual(candidateTargets(['CC-CORE']).map((t) => t.id), ['DD-CORE', 'IT-CORE', 'LR-CORE']);
  assert.equal(parseRoute('#/compare-from/XX').page, 'notfound');
  assert.equal(parseRoute('#/compare/CC-CORE').page, 'notfound');
});

test('基準17b: 選手のページの「同じ階級・ロールの4人と比較」は DD・CC・IT・LR の順に4人を並べる', () => {
  assert.equal(sameRoleAllHref('CC-CORE-TOP'), '#/compare/DD-CORE-TOP/CC-CORE-TOP/IT-CORE-TOP/LR-CORE-TOP');
  assert.equal(sameRoleAllHref('LR-NEXT-SUP'), '#/compare/DD-NEXT-SUP/CC-NEXT-SUP/IT-NEXT-SUP/LR-NEXT-SUP');
  assert.deepEqual(parseRoute(sameRoleAllHref('IT-MASTERS-ADC')), {
    page: 'compare', targets: ['DD-MASTERS-ADC', 'CC-MASTERS-ADC', 'IT-MASTERS-ADC', 'LR-MASTERS-ADC'],
  });
  assert.equal(sameRoleAllHref('XX-CORE-TOP'), null);
});

test('基準17c: チームのページの「4チームと比較」は同じ階級の4つの階級チームを DD・CC・IT・LR の順に並べる', () => {
  assert.equal(tierAllHref('CORE'), '#/compare/DD-CORE/CC-CORE/IT-CORE/LR-CORE');
  assert.deepEqual(parseRoute(tierAllHref('NEXT')), { page: 'compare', targets: ['DD-NEXT', 'CC-NEXT', 'IT-NEXT', 'LR-NEXT'] });
});

test('基準23: 系列の入れ替えは、その系列だけを替え、ほかの並びを変えない', () => {
  assert.deepEqual(replaceTarget(['CC-CORE-TOP', 'DD-CORE-TOP', 'IT-CORE-TOP'], 1, 'LR-CORE-TOP'), { targets: ['CC-CORE-TOP', 'LR-CORE-TOP', 'IT-CORE-TOP'] });
  // 階級をまたぐ選手は入れ替えられる(基準10)
  assert.deepEqual(replaceTarget(['CC-CORE-TOP', 'DD-CORE-TOP'], 1, 'DD-MASTERS-TOP').targets, ['CC-CORE-TOP', 'DD-MASTERS-TOP']);
});

test('基準23: 既に重ねている対象・種類の異なる対象・階級の異なる階級チームには入れ替えない', () => {
  const same = replaceTarget(['CC-CORE-TOP', 'DD-CORE-TOP'], 1, 'CC-CORE-TOP');
  assert.deepEqual(same.targets, ['CC-CORE-TOP', 'DD-CORE-TOP']);
  assert.ok(same.message);
  const kind = replaceTarget(['CC-CORE-TOP', 'DD-CORE-TOP'], 1, 'DD-CORE');
  assert.deepEqual(kind.targets, ['CC-CORE-TOP', 'DD-CORE-TOP']);
  assert.match(kind.message!, /同じ種類/);
  const tier = replaceTarget(['CC-CORE', 'DD-CORE'], 1, 'DD-NEXT');
  assert.deepEqual(tier.targets, ['CC-CORE', 'DD-CORE']);
  assert.match(tier.message!, /同じ階級/);
  // 候補は同じ種類(階級チームは同じ階級)で、まだ重ねていない対象
  assert.deepEqual(replaceCandidates(['CC-CORE', 'DD-CORE'], 1).map((t) => t.id), ['IT-CORE', 'LR-CORE']);
  assert.ok(!replaceCandidates(['CC-CORE-TOP', 'DD-CORE-TOP'], 1).some((t) => t.id === 'CC-CORE-TOP' || t.id === 'DD-CORE-TOP'));
});

test('基準24: 「基準にする」はその系列を1つ目に移し、残りの相対の並びを保つ', () => {
  assert.deepEqual(makeBaseTargets(['DD-CORE-TOP', 'CC-CORE-TOP', 'IT-CORE-TOP', 'LR-CORE-TOP'], 2), ['IT-CORE-TOP', 'DD-CORE-TOP', 'CC-CORE-TOP', 'LR-CORE-TOP']);
  assert.deepEqual(makeBaseTargets(['A', 'B'], 0), ['A', 'B']);
  assert.equal(compareHref(makeBaseTargets(['DD-CORE-TOP', 'CC-CORE-TOP'], 1)), '#/compare/CC-CORE-TOP/DD-CORE-TOP');
});
