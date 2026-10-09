// F-011 Task-3: 受入基準 7・8(メタの重要チャンピオンを得意ピックに持つ選手の一覧、ロールごとの上位3名)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER } from '../../src/data/roster.ts';
import type { MetaGuide, MetaChampion } from '../../src/meta/load.ts';
import { poolsFromRatings, playersForChampion, topMetaPlayers, type PlayerPool } from '../../src/meta/match.ts';

const champ = (role: MetaChampion['role'], key: number, name: string, tier: 'A' | 'B'): MetaChampion => ({
  role, key, id: name, name, tier, basis: ['P'], reason: { text: 'テスト', url: 'https://example.com' },
});
const GUIDE = {
  kind: 'meta-guide', patch: '26.20', updatedAt: '2026-10-09', ddragonVersion: '16.20.1', idSource: 'x', basisLegend: {}, chapters: [],
  champions: [champ('MID', 61, 'オリアナ', 'A'), champ('MID', 103, 'アーリ', 'A'), champ('MID', 1, 'アニー', 'B'), champ('TOP', 68, 'ランブル', 'A')],
} as MetaGuide;

const pool = (playerId: string, list: [number, number, number][]): PlayerPool => {
  const r = ROSTER.find((p) => p.id === playerId)!;
  return { playerId, name: r.name, team: r.team, tier: r.tier, role: r.role, list: list.map(([championId, games, winRate]) => ({ championId, games, winRate })) };
};
const POOLS = [
  pool('DD-NEXT-MID', [[61, 4, 0.6], [1, 3, 0.5]]), // A + B = 3
  pool('CC-CORE-MID', [[61, 10, 0.55], [103, 5, 0.6]]), // A + A = 4
  pool('IT-CORE-MID', [[103, 8, 0.7], [1, 3, 0.52]]), // 3(DD-NEXT-MID と同点。名簿の順で後)
  pool('LR-CORE-MID', [[1, 2, 0.9]]), // 3 試合未満は数えない
  pool('IT-MASTERS-TOP', [[61, 6, 0.5]]), // TOP の選手の MID のメタのチャンピオンは数えない
];

test('AC7: メタの重要チャンピオンを選ぶと、そのロールの選手のうちピックプールに持つ選手を、試合数と縮小した勝率とリンクつきで並べる', () => {
  const list = playersForChampion(GUIDE.champions[0], POOLS);
  assert.deepEqual(list.map((x) => x.playerId), ['CC-CORE-MID', 'DD-NEXT-MID']);
  assert.deepEqual(list[0], {
    playerId: 'CC-CORE-MID', name: ROSTER.find((p) => p.id === 'CC-CORE-MID')!.name, team: 'CC', tier: 'CORE', role: 'MID',
    games: 10, winRate: 0.55, href: '#/player/CC-CORE-MID',
  });
});

test('AC7: 3 試合未満のチャンピオンと、別のロールの選手は一覧に入れない', () => {
  assert.deepEqual(playersForChampion(GUIDE.champions[2], POOLS).map((x) => x.playerId), ['IT-CORE-MID', 'DD-NEXT-MID']);
  assert.deepEqual(playersForChampion(GUIDE.champions[3], POOLS), []);
});

test('AC7: 同じ試合数なら縮小した勝率の高い順、それも同じなら名簿の順に並べる', () => {
  const pools = [pool('LR-CORE-MID', [[61, 5, 0.5]]), pool('CC-NEXT-MID', [[61, 5, 0.5]]), pool('IT-NEXT-MID', [[61, 5, 0.6]])];
  assert.deepEqual(playersForChampion(GUIDE.champions[0], pools).map((x) => x.playerId), ['IT-NEXT-MID', 'CC-NEXT-MID', 'LR-CORE-MID']);
});

test('AC8: ロールごとに段階A を 2 点・段階B を 1 点として合計し、上位 3 名をチームと階級とともに返す。同点は名簿の順', () => {
  const top = topMetaPlayers(GUIDE, POOLS, 'MID');
  assert.deepEqual(top.map((x) => [x.playerId, x.points]), [['CC-CORE-MID', 4], ['DD-NEXT-MID', 3], ['IT-CORE-MID', 3]]);
  assert.equal(top[0].team, 'CC');
  assert.equal(top[0].tier, 'CORE');
  assert.deepEqual(top[0].champions.map((c) => c.name), ['オリアナ', 'アーリ']);
  assert.equal(topMetaPlayers(GUIDE, POOLS, 'MID', 2).length, 2);
});

test('AC8: メタに合う得意ピックの無い選手は上位に入れない', () => {
  assert.deepEqual(topMetaPlayers(GUIDE, POOLS, 'TOP'), []);
  assert.deepEqual(topMetaPlayers(GUIDE, POOLS, 'SUP'), []);
});

test('評価のファイルからピックプールを取り出す。ピックプールの軸が無い選手と名簿に無い選手は除く', () => {
  const file = {
    players: [
      { playerId: 'CC-CORE-MID', axes: [{ key: 'pool', data: { poolDetail: { champions: 1, winRate: 0.6, list: [{ championId: 61, games: 4, winRate: 0.6 }] } } }] },
      { playerId: 'DD-CORE-MID', axes: [{ key: 'ground' }] },
      { playerId: 'XX-CORE-MID', axes: [{ key: 'pool', data: { poolDetail: { champions: 0, winRate: null, list: [] } } }] },
    ],
  };
  const pools = poolsFromRatings(file);
  assert.deepEqual(pools.map((p) => [p.playerId, p.role, p.list.length]), [['CC-CORE-MID', 'MID', 1]]);
  assert.deepEqual(poolsFromRatings(undefined), []);
});
