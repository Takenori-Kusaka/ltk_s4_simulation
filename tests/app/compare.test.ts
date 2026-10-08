// F-008 Task-1: 受入基準 10〜14・18〜21(比較の論理と #/compare/... の経路)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER } from '../../src/data/roster.ts';
import { buildRatings, POSITION, type PlayerRatingInput } from '../../src/rating/build.ts';
import type { GameRecord } from '../../src/rating/types.ts';
import { teamRatingView, ratingAxesView, type RatingsFile } from '../../src/app/rating/view.ts';
import { parseRoute, compareHref } from '../../src/app/lib/index.ts';
import { compareView, addTarget, resolveTarget, MAX_SERIES } from '../../src/app/compare/view.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-09T00:00:00Z');
let seq = 0;
const game = (pos: string, gpm: number, ageDays: number): GameRecord => ({
  matchId: `M${++seq}`,
  endTime: NOW - ageDays * DAY,
  durationMin: 30,
  queueId: 420,
  position: pos,
  me: { championId: 1, win: 1, deaths: 4, totalDamageDealtToChampions: 20000, goldPerMinute: gpm },
  opp: { championId: 2, win: 0, deaths: 4, totalDamageDealtToChampions: 20000, goldPerMinute: 400 },
});
const RANK: Record<string, string> = { DD: 'CHALLENGER', CC: 'DIAMOND', IT: 'PLATINUM', LR: 'GOLD' };
/** 60 選手。チームでランクを変える。LR-NEXT-SUP は評価なし(ファイルから除く) */
const FILE: RatingsFile = (() => {
  const xs: PlayerRatingInput[] = ROSTER.map((r) => ({
    playerId: r.id,
    name: r.name,
    tier: r.tier,
    position: POSITION[r.role],
    rank: { tier: RANK[r.team], division: 'I', lp: 50 },
    games: Array.from({ length: 12 }, (_, i) => game(POSITION[r.role], 400 + i * 3, 2 + i)),
    league: [],
    shotcalling: [],
    tournament: { ltk: [], coach: [], pro: [], other: [] },
  }));
  const players = buildRatings({ players: xs, matches: [] }, NOW).filter((p) => p.playerId !== 'LR-NEXT-SUP');
  return { kind: 'ratings', computedAt: new Date(NOW).toISOString(), configVersion: 'test', checks: [], players };
})();
const okView = (targets: string[]) => {
  const v = compareView(targets, FILE);
  assert.ok(v.ok, v.ok ? '' : v.message);
  return v;
};

// ---- 経路(基準18〜21) ----

test('AC18: #/compare/<対象>/<対象> を開くと、選手・階級チーム・チーム全体の対象を並びのとおりに持つ', () => {
  assert.deepEqual(parseRoute('#/compare/CC-CORE-MID/DD-CORE-MID'), { page: 'compare', targets: ['CC-CORE-MID', 'DD-CORE-MID'] });
  assert.deepEqual(parseRoute('#/compare/cc-core/dd-core/it-core/lr-core'), { page: 'compare', targets: ['CC-CORE', 'DD-CORE', 'IT-CORE', 'LR-CORE'] });
  assert.deepEqual(parseRoute('#/compare/LR/CC/'), { page: 'compare', targets: ['LR', 'CC'] });
});

test('AC19: 組み立てた URL を解析すると元の対象の並びに戻る', () => {
  for (const targets of [['IT-MASTERS-ADC', 'CC-NEXT-ADC', 'DD-CORE-ADC'], ['DD-NEXT', 'LR-NEXT'], ['CC', 'IT', 'LR', 'DD']]) {
    const href = compareHref(targets);
    assert.equal(href, `#/compare/${targets.join('/')}`);
    assert.deepEqual(parseRoute(href), { page: 'compare', targets });
  }
});

test('AC20: 存在しない対象・1つだけ・5つ以上・選手とチームの混在は「見つからない」', () => {
  for (const h of [
    '#/compare/CC-CORE-MID/XX-CORE-MID',
    '#/compare/CC-CORE-MID/CC-CORE-XYZ',
    '#/compare/CC-CORE-MID',
    '#/compare',
    '#/compare/CC/DD/IT/LR/CC-CORE',
    '#/compare/CC-CORE-MID/DD-CORE-MID/IT-CORE-MID/LR-CORE-MID/CC-NEXT-MID',
    '#/compare/CC-CORE-MID/DD-CORE',
    '#/compare/CC-CORE-MID/DD',
  ]) {
    assert.deepEqual(parseRoute(h), { page: 'notfound', hash: h }, h);
  }
});

test('AC21: 同じ対象が2回以上あれば2回目以降を除き、最初に現れた順で比較する。1つになれば「見つからない」', () => {
  assert.deepEqual(parseRoute('#/compare/CC-CORE-MID/DD-CORE-MID/cc-core-mid'), { page: 'compare', targets: ['CC-CORE-MID', 'DD-CORE-MID'] });
  assert.deepEqual(parseRoute('#/compare/DD/CC/DD/IT/LR'), { page: 'compare', targets: ['DD', 'CC', 'IT', 'LR'] });
  assert.deepEqual(parseRoute('#/compare/CC-CORE/cc-core'), { page: 'notfound', hash: '#/compare/CC-CORE/cc-core' });
});

test('既存の経路は変わらない', () => {
  assert.deepEqual(parseRoute('#/player/CC-CORE-ADC'), { page: 'player', id: 'CC-CORE-ADC' });
  assert.deepEqual(parseRoute('#/team/dd'), { page: 'team', team: 'DD' });
  assert.deepEqual(parseRoute('#/compares/CC/DD'), { page: 'notfound', hash: '#/compares/CC/DD' });
});

// ---- 選べる対象(基準10〜14) ----

test('対象の種類: 選手 ID・階級チーム・チーム全体を見分け、名前を付ける', () => {
  assert.deepEqual(resolveTarget('CC-CORE-MID'), { id: 'CC-CORE-MID', kind: 'player', tier: 'CORE', team: 'CC', label: ROSTER.find((p) => p.id === 'CC-CORE-MID')!.name });
  assert.deepEqual(resolveTarget('DD-NEXT'), { id: 'DD-NEXT', kind: 'tier-team', tier: 'NEXT', team: 'DD', label: 'DD NEXT' });
  assert.deepEqual(resolveTarget('LR'), { id: 'LR', kind: 'team', tier: null, team: 'LR', label: 'LR チーム全体' });
  assert.equal(resolveTarget('XX'), null);
  assert.equal(resolveTarget('CC-PRO'), null);
});

test('AC10: 階級の異なる選手を同じ図に重ねられ、各系列は選手のページと同じ8軸の点数と確度を持つ', () => {
  const v = okView(['CC-NEXT-MID', 'DD-MASTERS-MID']);
  assert.equal(v.kind, 'player');
  assert.deepEqual(v.series.map((s) => s.id), ['CC-NEXT-MID', 'DD-MASTERS-MID']);
  const own = ratingAxesView(FILE.players.find((p) => p.playerId === 'DD-MASTERS-MID'));
  assert.deepEqual(v.series[1].scores, own.map((a) => a.score));
  assert.deepEqual(v.series[1].confidences, own.map((a) => a.confidence));
  assert.equal(v.axisLabels.length, 8);
});

test('AC10: 評価の無い選手の系列は全軸データなし', () => {
  const v = okView(['LR-NEXT-SUP', 'CC-NEXT-SUP']);
  assert.ok(v.series[0].scores.every((s) => s === null));
  assert.ok(v.series[0].confidences.every((c) => c === null));
});

test('AC11: 階級チームとチーム全体の系列は teamRatingView の相対評価の点数を使い、除いた選手の数を持つ', () => {
  const tiers = okView(['DD-NEXT', 'LR-NEXT']);
  assert.deepEqual(tiers.series[0].scores, teamRatingView('DD', FILE).radars.find((r) => r.label === 'NEXT')!.scores);
  assert.equal(tiers.series[1].excluded, 1);
  assert.equal(tiers.series[0].excluded, 0);
  const teams = okView(['CC', 'IT']);
  assert.deepEqual(teams.series[1].scores, teamRatingView('IT', FILE).radars.find((r) => r.label === 'チーム全体')!.scores);
});

test('AC12: 階級の異なる階級チームは比較を出さず、同じ階級を選ぶよう求める', () => {
  const v = compareView(['CC-CORE', 'DD-NEXT'], FILE);
  assert.equal(v.ok, false);
  assert.match(v.ok ? '' : v.message, /同じ階級/);
});

test('AC13: 種類の異なる対象(階級チームとチーム全体など)は比較を出さず、同じ種類を選ぶよう求める', () => {
  for (const t of [['CC-CORE', 'DD'], ['CC-CORE-MID', 'DD-CORE'], ['CC', 'DD-CORE-TOP']]) {
    const v = compareView(t, FILE);
    assert.equal(v.ok, false, t.join());
    assert.match(v.ok ? '' : v.message, /同じ種類/);
  }
});

test('AC14: 5つ目の対象は加えず、重ねられるのは4つまでと示す', () => {
  assert.equal(MAX_SERIES, 4);
  const four = ['CC-CORE', 'DD-CORE', 'IT-CORE', 'LR-CORE'];
  const r = addTarget(four, 'CC-NEXT');
  assert.deepEqual(r.targets, four);
  assert.match(r.message ?? '', /4つまで/);
  const ok = addTarget(['CC-CORE'], 'DD-CORE');
  assert.deepEqual(ok, { targets: ['CC-CORE', 'DD-CORE'] });
  assert.deepEqual(addTarget(['CC-CORE'], 'cc-core').targets, ['CC-CORE']);
});

// ---- 差の計算(基準7・8 の論理。表示は Task-2) ----

test('差は 系列 − 1つ目の系列(丸める前の値で引き、小数第一位に丸めて符号を付ける)。どちらかがデータなしなら —', () => {
  const v = okView(['LR-CORE-TOP', 'DD-CORE-TOP', 'LR-NEXT-SUP']);
  const ground = v.rows[0];
  const a = v.series[0].scores[0]!;
  const b = v.series[1].scores[0]!;
  const d = Math.round((b - a) * 10) / 10;
  assert.equal(ground.diffs[1], `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`);
  assert.equal(ground.diffs[0], null);
  assert.equal(ground.diffs[2], '—');
  assert.equal(ground.values[0].display, a.toFixed(1));
  assert.equal(ground.values[2].display, 'データなし');
});

test('系列の色と点の形は並びの順で固定(金・青・緑・紅、丸・四角・三角・菱形)', () => {
  const v = okView(['CC-CORE', 'DD-CORE', 'IT-CORE', 'LR-CORE']);
  assert.deepEqual(v.series.map((s) => s.shape), ['circle', 'square', 'triangle', 'diamond']);
  assert.equal(new Set(v.series.map((s) => s.color)).size, 4);
  assert.equal(v.series[0].color, '#c9a24a');
});
