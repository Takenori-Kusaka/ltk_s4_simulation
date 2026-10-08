// F-009 Task-9: 受入基準25(チームのページの全軸の相対評価のレーダーとチームの指標)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER } from '../../src/data/roster.ts';
import { buildRatings, POSITION, type PlayerRatingInput } from '../../src/rating/build.ts';
import { teamIndicators } from '../../src/rating/team-indicators.ts';
import type { GameRecord } from '../../src/rating/types.ts';
import type { ShotcallingEvidence } from '../../src/rating/evidence.ts';
import {
  teamRatingView, type RatingsFile,
} from '../../src/app/rating/view.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-09T00:00:00Z');
let seq = 0;
const game = (pos: string, me: Record<string, number> = {}, ageDays = 3, win = true): GameRecord => ({
  matchId: `M${++seq}`,
  endTime: NOW - ageDays * DAY,
  durationMin: 30,
  queueId: 420,
  position: pos,
  me: { championId: 1, win: win ? 1 : 0, deaths: 4, totalDamageDealtToChampions: 20000, goldPerMinute: 400, visionScorePerMinute: 1, dragonTakedowns: 1, ...me },
  opp: { championId: 2, win: win ? 0 : 1, deaths: 4, totalDamageDealtToChampions: 20000, goldPerMinute: 400, visionScorePerMinute: 1, dragonTakedowns: 1 },
});
const ai: ShotcallingEvidence = { summary: '配信でコールした', source: 'https://example.com/a', direction: '+', strength: '強', kind: 'player', collectedBy: 'ai' };
const RANK: Record<string, string> = { DD: 'CHALLENGER', CC: 'DIAMOND', IT: 'PLATINUM', LR: 'GOLD' };
const VISION: Record<string, number> = { DD: 2, CC: 1.4, IT: 1, LR: 0.6 };

/** 60 選手。チームでランクと視界を変える。LR-NEXT-SUP は試合なし(推定) */
const inputs = (): (PlayerRatingInput & { team: string })[] =>
  ROSTER.map((r) => {
    const pos = POSITION[r.role];
    const none = r.id === 'LR-NEXT-SUP';
    return {
      playerId: r.id,
      name: r.name,
      team: r.team,
      tier: r.tier,
      position: pos,
      rank: { tier: RANK[r.team], division: 'I', lp: 50 },
      games: none ? [] : Array.from({ length: r.id === 'DD-NEXT-TOP' ? 3 : 20 }, (_, i) => game(pos, { visionScorePerMinute: VISION[r.team], goldPerMinute: 400 + i }, 2 + i)),
      league: [],
      shotcalling: r.team === 'DD' ? [ai] : [],
      tournament: { ltk: r.tier === 'MASTERS' ? [{ season: 'S3', team: r.team, tier: r.tier, role: r.role, wins: 3, losses: 2, source: 'docs/research/format-history.md' }] : [], coach: [], pro: [], other: [] },
    };
  });
const fileOf = (): RatingsFile => {
  const xs = inputs();
  return {
    kind: 'ratings', computedAt: new Date(NOW).toISOString(), configVersion: 'test', checks: [],
    players: buildRatings({ players: xs, matches: [] }, NOW),
    teams: teamIndicators(xs, [], NOW),
  };
};
const FILE = fileOf();

test('AC25: チームのページはチーム全体・NEXT・CORE・MASTERS の8軸レーダーを持ち、階級は4チームの相対評価', () => {
  const dd = teamRatingView('DD', FILE);
  const lr = teamRatingView('LR', FILE);
  assert.deepEqual(dd.radars.map((r) => r.label), ['チーム全体', 'NEXT', 'CORE', 'MASTERS']);
  for (const r of dd.radars) assert.equal(r.scores.length, 8);
  const core = (v: typeof dd) => v.radars.find((r) => r.label === 'CORE')!.scores[0]!;
  assert.ok(core(dd) > 5 && core(lr) < 5, `${core(dd)} ${core(lr)}`);
  const tiers = dd.radars.slice(1).map((r) => r.scores[0]!);
  assert.ok(Math.abs(dd.radars[0].scores[0]! - tiers.reduce((a, b) => a + b, 0) / 3) < 1e-9);
});

test('AC25: 階級ごとにチームの指標(視界・オブジェクト・マクロ)を、所属選手の試合と根拠から示す', () => {
  const dd = teamRatingView('DD', FILE);
  const lr = teamRatingView('LR', FILE);
  const vision = (v: typeof dd) => v.indicators.find((x) => x.tier === 'CORE')!.items.find((i) => i.key === 'vision')!;
  assert.deepEqual(dd.indicators.map((x) => x.tier), ['NEXT', 'CORE', 'MASTERS']);
  assert.deepEqual(dd.indicators[0].items.map((i) => i.label), ['視界', 'オブジェクト', 'マクロ']);
  assert.ok(vision(dd).score! > vision(lr).score!);
  assert.equal(vision(dd).players.length, 5);
  assert.match(vision(dd).reason, /visionScorePerMinute/);
  const macro = dd.indicators[0].items.find((i) => i.key === 'macro')!;
  assert.equal(macro.score, null);
  assert.equal(macro.display, 'データなし');
  assert.equal(macro.line, 'missing');
});

test('AC25: マクロは出典つきの根拠があれば一覧に出し、点数は付けない', () => {
  const t = teamIndicators(inputs(), [], NOW, { 'DD-CORE': [{ text: '運営の評価', source: 'https://example.com/m' }] });
  const macro = t.find((x) => x.team === 'DD' && x.tier === 'CORE')!.indicators.find((i) => i.key === 'macro')!;
  assert.equal(macro.score, null);
  assert.equal(macro.evidence.length, 1);
  assert.match(macro.reason, /根拠 1 件/);
});

test('AC25: 評価のファイルが無いときは、全軸と全指標をデータなしで示す', () => {
  const v = teamRatingView('CC', undefined);
  assert.ok(v.radars.every((r) => r.scores.every((s) => s === null) && r.excluded > 0));
  assert.ok(v.indicators.every((x) => x.items.length === 3 && x.items.every((i) => i.display === 'データなし')));
});
