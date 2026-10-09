// F-006 Task-1: 受入基準 1・2・3・10(ピック候補の上位3体、CORE とフィアレスの除外、データなし)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadPickConfig, metaImportance, pickCandidates, coreExclusions, seriesExclusions, matchPicks, NO_DATA,
} from '../../src/predict/picks.ts';
import type { PlayerPool } from '../../src/meta/match.ts';
import type { MetaGuide } from '../../src/meta/load.ts';

const guide = {
  kind: 'meta-guide', patch: '26.20', updatedAt: '2026-10-09', ddragonVersion: '16.20.1', idSource: 'x', basisLegend: {},
  chapters: [],
  champions: [
    { role: 'MID', key: 103, id: 'Ahri', name: 'アーリ', tier: 'A', basis: ['P'], reason: { text: 't', url: 'https://example.com' } },
    { role: 'MID', key: 61, id: 'Orianna', name: 'オリアナ', tier: 'B', basis: ['P'], reason: { text: 't', url: 'https://example.com' } },
    { role: 'TOP', key: 103, id: 'Ahri', name: 'アーリ', tier: 'A', basis: ['P'], reason: { text: 't', url: 'https://example.com' } },
  ],
} as unknown as MetaGuide;

const pool = (playerId: string, role: PlayerPool['role'], list: PlayerPool['list']): PlayerPool => ({ playerId, name: playerId, team: 'CC', tier: 'CORE', role, list });
const MID = pool('CC-CORE-MID', 'MID', [
  { championId: 7, games: 10, winRate: 0.6 },
  { championId: 103, games: 5, winRate: 0.5 },
  { championId: 61, games: 5, winRate: 0.5 },
  { championId: 1, games: 4, winRate: 0.55 },
]);

test('メタの重要度は、そのロールの段階A なら 1.0、段階B なら 0.5、どちらでもなければ 0', () => {
  assert.equal(metaImportance(guide, 'MID', 103), 1);
  assert.equal(metaImportance(guide, 'MID', 61), 0.5);
  assert.equal(metaImportance(guide, 'MID', 7), 0);
  assert.equal(metaImportance(guide, 'ADC', 103), 0);
});

test('評価設定の初期値: 試合数 0.5・勝率 0.3・メタ 0.2、上位3体', () => {
  const c = loadPickConfig();
  assert.deepEqual([c.pick.wGames, c.pick.wWin, c.pick.wMeta, c.pick.topN], [0.5, 0.3, 0.2, 3]);
});

test('AC1: 見込みの値 = 0.5 × 試合数 ÷ 最大の試合数 + 0.3 × 縮小した勝率 + 0.2 × メタの重要度 の降順で上位3体と内訳を返す', () => {
  const r = pickCandidates(MID, guide);
  assert.deepEqual(r.candidates.map((x) => x.championId), [7, 103, 61]);
  const top = r.candidates[0];
  assert.ok(Math.abs(top.value - (0.5 * 1 + 0.3 * 0.6 + 0)) < 1e-9);
  const ahri = r.candidates[1];
  assert.ok(Math.abs(ahri.value - (0.5 * 0.5 + 0.3 * 0.5 + 0.2 * 1)) < 1e-9);
  assert.deepEqual({ games: ahri.games, winRate: ahri.winRate, meta: ahri.meta }, { games: 5, winRate: 0.5, meta: 1 });
  assert.equal(ahri.name, 'アーリ');
  assert.equal(r.missing, 0);
});

test('AC1: 見込みの値が同点なら試合数の多い順、次に championId の小さい順', () => {
  const tie = pool('X', 'ADC', [
    { championId: 50, games: 4, winRate: 0.5 },
    { championId: 20, games: 4, winRate: 0.5 },
    { championId: 30, games: 8, winRate: 0.25 },
  ]);
  // 30: 0.5×1 + 0.3×0.25 = 0.575 / 20・50: 0.5×0.5 + 0.3×0.5 = 0.4
  assert.deepEqual(pickCandidates(tie, guide).candidates.map((x) => x.championId), [30, 20, 50]);
  const eq = pool('Y', 'ADC', [
    { championId: 9, games: 2, winRate: 0.5 },
    { championId: 8, games: 4, winRate: 0.25 },
  ]);
  // 9: 0.5×0.5 + 0.15 = 0.4 / 8: 0.5×1 + 0.075 = 0.575(同点でない)。同点の組を作る
  const same = pool('Z', 'ADC', [
    { championId: 9, games: 3, winRate: 0.5 },
    { championId: 8, games: 3, winRate: 0.5 },
  ]);
  assert.deepEqual(pickCandidates(eq, guide).candidates.map((x) => x.championId), [8, 9]);
  assert.deepEqual(pickCandidates(same, guide).candidates.map((x) => x.championId), [8, 9]);
});

test('AC1: ピックプールが3体に満たない選手は、ある分だけを返し、残りの数を missing に示す', () => {
  const r = pickCandidates(pool('N', 'TOP', [{ championId: 103, games: 3, winRate: 0.5 }]), guide);
  assert.equal(r.candidates.length, 1);
  assert.equal(r.missing, 2);
  const none = pickCandidates(pool('E', 'TOP', []), guide);
  assert.equal(none.candidates.length, 0);
  assert.equal(none.missing, 3);
});

test('AC2: CORE の除外は、直前の NEXT 戦の確定した使用があればそれを、無ければ予想ピックとプロテクト候補を使う(両チーム)', () => {
  const ex = coreExclusions([
    { actual: [1, 2, 3], predicted: [9], protects: [10] },
    { predicted: [7, 8], protects: [103, 7] },
  ]);
  assert.deepEqual([...ex].sort((a, b) => a - b), [1, 2, 3, 7, 8, 103]);
  const r = pickCandidates(MID, guide, undefined, ex);
  assert.deepEqual(r.candidates.map((x) => x.championId), [61]);
  assert.equal(r.missing, 2);
});

test('AC3: MASTERS CUP の決勝の2戦目以降は、同じシリーズの前の試合の使用(確定していれば実際、無ければ予想)を除く', () => {
  assert.equal(seriesExclusions([]).size, 0);
  const ex = seriesExclusions([{ actual: [7] , predicted: [61] }, { predicted: [103, 4] }]);
  assert.deepEqual([...ex].sort((a, b) => a - b), [4, 7, 103]);
  const r = pickCandidates(MID, guide, undefined, ex);
  assert.deepEqual(r.candidates.map((x) => x.championId), [61, 1]);
});

test('AC10: 評価のファイルかメタの一覧が無ければ、ピック候補を「データなし」にする', () => {
  const ratings = {
    players: [{ playerId: 'CC-CORE-MID', axes: [{ key: 'pool', data: { poolDetail: { list: MID.list } } }] }],
  };
  const ok = matchPicks({ ratings, guide, playerIds: ['CC-CORE-MID'] });
  assert.equal(ok.status, 'ok');
  assert.deepEqual(ok.players[0].candidates.map((x) => x.championId), [7, 103, 61]);
  for (const r of [matchPicks({ ratings: undefined, guide, playerIds: ['CC-CORE-MID'] }), matchPicks({ ratings, guide: undefined, playerIds: ['CC-CORE-MID'] })]) {
    assert.equal(r.status, NO_DATA);
    assert.deepEqual(r.players, []);
  }
});

test('AC10: 評価のファイルにいない選手は、その選手だけピック候補が無い(3枠ともデータなし)', () => {
  const r = matchPicks({ ratings: { players: [] }, guide, playerIds: ['DD-CORE-MID'] });
  assert.equal(r.status, 'ok');
  assert.equal(r.players[0].playerId, 'DD-CORE-MID');
  assert.equal(r.players[0].candidates.length, 0);
  assert.equal(r.players[0].missing, 3);
});
