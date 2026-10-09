// F-011 Task-5: 受入基準 7・8 の画面の論理(選手との突き合わせの表示)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MetaGuide, MetaChampion } from '../../src/meta/load.ts';
import { metaMatchView } from '../../src/app/meta/match-view.ts';

const champ = (role: MetaChampion['role'], key: number, name: string, tier: 'A' | 'B'): MetaChampion => ({
  role, key, id: name, name, tier, basis: ['P'], reason: { text: 'テスト', url: 'https://example.com' },
});
const GUIDE = {
  kind: 'meta-guide', patch: '26.20', updatedAt: '2026-10-09', ddragonVersion: '16.20.1', idSource: 'x', basisLegend: {}, chapters: [],
  champions: [champ('MID', 61, 'オリアナ', 'A'), champ('MID', 103, 'アーリ', 'A'), champ('MID', 1, 'アニー', 'B'), champ('TOP', 68, 'ランブル', 'A')],
} as MetaGuide;

/** 評価のファイルの形(pool 軸の poolDetail だけ) */
const rating = (playerId: string, list: [number, number, number][]) => ({
  playerId,
  axes: [{ key: 'pool', data: { poolDetail: { list: list.map(([championId, games, winRate]) => ({ championId, games, winRate })) } } }],
});
const RATINGS = {
  players: [
    rating('DD-NEXT-MID', [[61, 4, 0.6], [1, 3, 0.5]]),
    rating('CC-CORE-MID', [[61, 10, 0.55], [103, 5, 0.6]]),
    rating('IT-CORE-MID', [[103, 8, 0.7], [1, 3, 0.52]]),
    rating('LR-CORE-MID', [[1, 2, 0.9]]),
  ],
};

test('AC8: ロールごとの上位3名を、チームと階級・点数・数えたチャンピオンとともに出す', () => {
  const v = metaMatchView(GUIDE, RATINGS);
  const mid = v.roles.find((r) => r.role === 'MID')!;
  assert.deepEqual(mid.top.map((x) => [x.playerId, x.teamTier, x.points]), [
    ['CC-CORE-MID', 'CC CORE', 4],
    ['DD-NEXT-MID', 'DD NEXT', 3],
    ['IT-CORE-MID', 'IT CORE', 3],
  ]);
  assert.equal(mid.top[0].href, '#/player/CC-CORE-MID');
  assert.match(mid.top[0].championsText, /オリアナ\(A・10 試合\)/);
  const top = v.roles.find((r) => r.role === 'TOP')!;
  assert.deepEqual(top.top, []);
  assert.match(top.emptyText, /いない/);
});

test('AC7: メタの重要チャンピオンを選ぶと、選手の一覧を試合数・縮小した勝率(%)・リンクつきで出す', () => {
  const v = metaMatchView(GUIDE, RATINGS, 61);
  assert.equal(v.selected?.name, 'オリアナ');
  assert.equal(v.selected?.roleLabel, 'MID');
  assert.deepEqual(v.selected?.players.map((p) => [p.playerId, p.games, p.winRateText, p.href]), [
    ['CC-CORE-MID', 10, '55%', '#/player/CC-CORE-MID'],
    ['DD-NEXT-MID', 4, '60%', '#/player/DD-NEXT-MID'],
  ]);
});

test('AC7: 選べるチャンピオンは、ロールごとにメタの一覧の全件で、得意ピックに持つ選手の数を添える', () => {
  const v = metaMatchView(GUIDE, RATINGS);
  const mid = v.roles.find((r) => r.role === 'MID')!;
  assert.deepEqual(mid.champions.map((c) => [c.key, c.name, c.tier, c.playerCount]), [
    [61, 'オリアナ', 'A', 2],
    [103, 'アーリ', 'A', 2],
    [1, 'アニー', 'B', 2],
  ]);
  assert.equal(v.selected, null);
});

test('AC7: 得意ピックに持つ選手がいないチャンピオンを選ぶと、空の一覧と案内を出す', () => {
  const v = metaMatchView(GUIDE, RATINGS, 68);
  assert.deepEqual(v.selected?.players, []);
  assert.match(v.selected?.emptyText ?? '', /3 試合以上/);
});

test('AC7・8: 評価のファイルが無いときは「データなし」を出し、一覧を空にする', () => {
  const v = metaMatchView(GUIDE, undefined, 61);
  assert.equal(v.available, false);
  assert.match(v.notice ?? '', /データなし/);
  assert.ok(v.roles.every((r) => r.top.length === 0));
  assert.deepEqual(v.selected?.players, []);
});
