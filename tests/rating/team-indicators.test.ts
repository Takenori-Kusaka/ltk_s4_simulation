// F-009 Task-8: 受入基準25 のうち、チームの指標(視界・オブジェクト・マクロ)の計算と評価のファイルへの書き出し
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROSTER } from '../../src/data/roster.ts';
import { POSITION, type PlayerRatingInput } from '../../src/rating/build.ts';
import { teamIndicators, TEAM_INDICATORS } from '../../src/rating/team-indicators.ts';
import type { GameRecord } from '../../src/rating/types.ts';
import { main } from '../../src/collect/aggregate-cli.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-09T00:00:00Z');
let seq = 0;
const game = (pos: string, me: Record<string, number>, ageDays = 3): GameRecord => ({
  matchId: `M${++seq}`,
  endTime: NOW - ageDays * DAY,
  durationMin: 30,
  queueId: 420,
  position: pos,
  me: { win: 1, visionScorePerMinute: 1, controlWardsPlaced: 2, wardsKilled: 2, dragonTakedowns: 1, baronTakedowns: 0, riftHeraldTakedowns: 0, turretTakedowns: 2, ...me },
  opp: { win: 0, visionScorePerMinute: 1, controlWardsPlaced: 2, wardsKilled: 2, dragonTakedowns: 1, baronTakedowns: 0, riftHeraldTakedowns: 0, turretTakedowns: 2 },
});
const VISION: Record<string, number> = { DD: 2, CC: 1.4, IT: 1, LR: 0.6 };
const DRAGON: Record<string, number> = { DD: 0, CC: 1, IT: 2, LR: 3 };

/** 60 選手。チームで視界とドラゴンを変える。IT の NEXT は全員試合なし */
const players = (): (PlayerRatingInput & { team: string })[] =>
  ROSTER.map((r) => ({
    playerId: r.id,
    name: r.name,
    team: r.team,
    tier: r.tier,
    position: POSITION[r.role],
    rank: null,
    games: r.team === 'IT' && r.tier === 'NEXT' ? [] : Array.from({ length: 20 }, (_, i) => game(POSITION[r.role], { visionScorePerMinute: VISION[r.team], dragonTakedowns: DRAGON[r.team] }, 2 + i)),
    league: [],
    shotcalling: [],
    tournament: { ltk: [], coach: [], pro: [], other: [] },
  }));
const find = (xs: ReturnType<typeof teamIndicators>, team: string, tier: string, key: string) =>
  xs.find((x) => x.team === team && x.tier === tier)!.indicators.find((i) => i.key === key)!;

test('AC25: チームの指標は視界・オブジェクト・マクロの3つで、視界とオブジェクトは評価設定に指標を持つ', () => {
  assert.deepEqual(TEAM_INDICATORS.map((a) => a.label), ['視界', 'オブジェクト']);
  assert.ok(TEAM_INDICATORS[0].metrics.some((m) => m.key === 'visionScorePerMinute'));
  assert.ok(TEAM_INDICATORS[1].metrics.some((m) => m.key === 'dragonTakedowns'));
  const t = teamIndicators(players(), [], NOW);
  assert.equal(t.length, 12);
  assert.deepEqual(t[0].indicators.map((i) => i.label), ['視界', 'オブジェクト', 'マクロ']);
});

test('AC25: 視界とオブジェクトは所属選手の試合の対面との差から計算し、差の大きいチームほど高い', () => {
  const t = teamIndicators(players(), [], NOW);
  const v = (team: string) => find(t, team, 'CORE', 'vision').score!;
  const o = (team: string) => find(t, team, 'CORE', 'objectives').score!;
  assert.ok(v('DD') > v('CC') && v('CC') > v('IT') && v('IT') > v('LR'));
  assert.ok(o('LR') > o('IT') && o('IT') > o('CC') && o('CC') > o('DD'));
  const dd = find(t, 'DD', 'CORE', 'vision');
  assert.equal(dd.players.length, 5);
  assert.equal(dd.confidence, '高');
  assert.match(dd.reason, /5 \/ 5 名/);
});

test('AC25: 所属選手の試合が無い階級チームの視界とオブジェクトはデータなし', () => {
  const v = find(teamIndicators(players(), [], NOW), 'IT', 'NEXT', 'vision');
  assert.equal(v.score, null);
  assert.equal(v.confidence, null);
  assert.match(v.reason, /データなし/);
});

test('AC25: マクロは出典つきの根拠だけから作り、根拠が無ければデータなし。根拠があれば一覧に出す', () => {
  const none = find(teamIndicators(players(), [], NOW), 'DD', 'CORE', 'macro');
  assert.equal(none.score, null);
  assert.match(none.reason, /データなし/);
  const t = teamIndicators(players(), [], NOW, { 'DD-CORE': [{ text: '運営の評価', source: 'https://example.com/m' }] });
  const m = find(t, 'DD', 'CORE', 'macro');
  assert.equal(m.score, null);
  assert.equal(m.evidence.length, 1);
  assert.match(m.reason, /根拠 1 件/);
});

test('AC25: 集計のコマンドは評価のファイルへ階級チームごとのチームの指標を書く', async () => {
  const root = mkdtempSync(join(tmpdir(), 'f009-team-'));
  const ddragon = async (url: string) =>
    new Response(JSON.stringify(url.endsWith('versions.json') ? ['16.20.1'] : { type: 'champion', version: '16.20.1', data: { Ahri: { id: 'Ahri', key: '103', name: 'アーリ' } } }), { status: 200, headers: { 'content-type': 'application/json' } });
  const code = await main({ rawDir: join(root, 'raw'), publicDir: join(root, 'public'), snapshotsDir: join(root, 'snap'), fetch: ddragon, now: () => new Date(NOW), out: () => {} });
  assert.equal(code, 0);
  const saved = JSON.parse(readFileSync(join(root, 'public', 'ratings.json'), 'utf8'));
  assert.equal(saved.teams.length, 12);
  assert.ok(saved.teams.every((t: { indicators: { key: string }[] }) => t.indicators.map((i) => i.key).join() === 'vision,objectives,macro'));
});
