// F-009 Task-1: 実データ(match-v5 の info)から評価の入力を作る
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractGame, populationMatch, loadEngineConfig } from '../../src/rating/engine.ts';

const part = (puuid: string, teamId: number, pos: string, extra: Record<string, unknown> = {}) => ({
  puuid, teamId, teamPosition: pos, kills: 3, deaths: 2, assists: 7, totalDamageDealtToChampions: 20000, goldEarned: 12000,
  challenges: { killParticipation: 0.5, soloKills: 1 }, ...extra,
});
const info = {
  gameEndTimestamp: Date.parse('2026-10-01T12:00:00Z'), gameDuration: 1800, queueId: 420,
  participants: [
    part('me', 100, 'MIDDLE', { totalDamageDealtToChampions: 25000 }),
    part('opp', 200, 'MIDDLE'),
    part('x', 100, 'TOP'),
    part('y', 200, ''),
  ],
};

test('extractGame: 自分と同じロールの相手の数値を平らにして取り出す(challenges を含む)', () => {
  const g = extractGame('JP1_1', info, 'me')!;
  assert.equal(g.position, 'MIDDLE');
  assert.equal(g.durationMin, 30);
  assert.equal(g.me.totalDamageDealtToChampions, 25000);
  assert.equal(g.me.killParticipation, 0.5);
  assert.equal(g.opp!.totalDamageDealtToChampions, 20000);
});

test('extractGame: 同じロールの相手がいなければ opp は null、自分がいなければ null', () => {
  assert.equal(extractGame('JP1_1', info, 'x')!.opp, null);
  assert.equal(extractGame('JP1_1', info, 'nobody'), null);
});

test('populationMatch: ロールの無い参加者を除いて母集団の形にする', () => {
  const m = populationMatch(info);
  assert.equal(m.participants.length, 3);
  assert.equal(m.participants[0].stats.soloKills, 1);
});

test('評価設定の既定値を読む', () => {
  const c = loadEngineConfig();
  assert.equal(c.windowDays, 120);
  assert.equal(c.halfLifeDays, 45);
  assert.equal(c.k, 8);
});
