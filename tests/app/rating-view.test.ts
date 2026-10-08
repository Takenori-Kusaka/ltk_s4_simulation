// F-009 Task-6: 受入基準 20・24(8軸のレーダーと調子、軸の説明)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER } from '../../src/data/roster.ts';
import { buildRatings, POSITION, type PlayerRatingInput } from '../../src/rating/build.ts';
import type { GameRecord } from '../../src/rating/types.ts';
import type { ShotcallingEvidence } from '../../src/rating/evidence.ts';
import {
  ratingAxesView, formView, positionText, lineOf, AXIS_ORDER, type RatingsFile,
} from '../../src/app/rating/view.ts';
import { radarEdges } from '../../src/app/lib/index.ts';

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

/** 60 選手。チームでランクを変える。LR-NEXT-SUP は試合なし(推定) */
const inputs = (): PlayerRatingInput[] =>
  ROSTER.map((r) => {
    const pos = POSITION[r.role];
    const none = r.id === 'LR-NEXT-SUP';
    return {
      playerId: r.id,
      name: r.name,
      tier: r.tier,
      position: pos,
      rank: { tier: RANK[r.team], division: 'I', lp: 50 },
      games: none ? [] : Array.from({ length: r.id === 'DD-NEXT-TOP' ? 3 : 20 }, (_, i) => game(pos, { goldPerMinute: 400 + i }, 2 + i)),
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
  };
};
const FILE = fileOf();
const rating = (id: string) => FILE.players.find((p) => p.playerId === id)!;

test('AC24: 選手のページは評価設定の全軸(8軸)を、地力から大会経験の順に並べる', () => {
  const axes = ratingAxesView(rating('DD-CORE-MID'));
  assert.deepEqual(axes.map((a) => a.label), ['地力', 'レーン戦', '集団戦', '連携', '安定感', 'ピックプール', 'コール力', '大会経験']);
  assert.equal(axes.length, AXIS_ORDER.length);
  for (const a of axes) assert.equal(a.display, a.score!.toFixed(1));
});

test('AC24: 確度「低」の軸は点線、「データなし」は欠損、高・中は実線', () => {
  assert.equal(lineOf('高'), 'solid');
  assert.equal(lineOf('中'), 'solid');
  assert.equal(lineOf('低'), 'dotted');
  assert.equal(lineOf(null), 'missing');
  const thin = ratingAxesView(rating('DD-NEXT-TOP'));
  assert.equal(thin.find((a) => a.key === 'laning')!.line, 'dotted');
  const none = ratingAxesView(undefined);
  assert.ok(none.every((a) => a.line === 'missing' && a.score === null && a.display === 'データなし'));
});

test('AC24: 試合の無い選手の軸は「推定」の印を持つ', () => {
  const axes = ratingAxesView(rating('LR-NEXT-SUP'));
  assert.ok(axes.find((a) => a.key === 'ground')!.estimated);
  assert.ok(!ratingAxesView(rating('DD-CORE-MID')).find((a) => a.key === 'ground')!.estimated);
});

test('AC24: 調子の係数をラベル・係数・各軸への効き目とともに示す', () => {
  const r = rating('DD-CORE-MID');
  const f = formView(r)!;
  assert.equal(f.label, r.form.label);
  assert.equal(f.coefficient, r.form.coefficient.toFixed(2));
  assert.match(f.effect, /^各軸 [+−]\d\.\d\d$/);
  assert.match(f.reason, /試合/);
  assert.equal(formView(undefined), null);
});

test('AC24: 確度「低」の頂点に触れる辺だけを点線にし、欠損の頂点は飛ばして結ぶ', () => {
  const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, null, { x: 0, y: 1 }];
  const edges = radarEdges(pts, ['solid', 'dotted', 'missing', 'solid']);
  assert.equal(edges.length, 3);
  assert.deepEqual(edges.map((e) => e.dotted), [true, true, false]);
  assert.deepEqual(edges[1].to, { x: 0, y: 1 });
  assert.deepEqual(radarEdges([null, { x: 1, y: 1 }], ['missing', 'solid']), []);
});

test('AC20: データの軸の説明は、ランクの基準・補正・縮小・LTK の項・使った試合(割合と日付)・基礎と係数を示す', () => {
  const a = ratingAxesView(rating('DD-MASTERS-MID')).find((x) => x.key === 'teamfight')!;
  const d = Object.fromEntries(a.details.map((x) => [x.label, x.value]));
  assert.match(d['ランクの基準'], /ソロランク/);
  assert.match(d['補正'], /[+−]\d/);
  assert.match(d['縮小の割合'], /%/);
  assert.match(d['LTK の経験の項'], /S3/);
  assert.match(d['使った試合'], /20 試合.*大会のロールの試合 100%.*\d{4}-\d{2}-\d{2} 〜 \d{4}-\d{2}-\d{2}/);
  assert.match(d['基礎の点数と調子'], /係数 \d\.\d\d/);
  assert.match(a.confidenceReason, /有効な試合数/);
});

test('AC20: 使った指標ごとに値と母集団の中での位置を示す', () => {
  const a = ratingAxesView(rating('DD-CORE-MID')).find((x) => x.key === 'ground')!;
  const gold = a.metrics.find((m) => m.label === '分あたりゴールド')!;
  assert.match(gold.value, /対面との差/);
  assert.match(gold.position, /^(上位|下位) \d+%$/);
  assert.equal(positionText(0), '上位 50%');
  assert.equal(positionText(1.645), '上位 5%');
  assert.equal(positionText(-1.645), '下位 5%');
});

test('AC20: 根拠の軸は根拠の一覧(出典と確認の有無)と確度の理由を示す', () => {
  const a = ratingAxesView(rating('DD-CORE-MID')).find((x) => x.key === 'shotcalling')!;
  assert.equal(a.evidence.length, 1);
  assert.equal(a.evidence[0].href, 'https://example.com/a');
  assert.equal(a.evidence[0].confirmed, false);
  assert.ok(a.marks.includes('AI 収集'));
  assert.match(a.confidenceReason, /AI が集めた根拠 1 件/);
  assert.match(a.details[0].value, /肯定/);
});
