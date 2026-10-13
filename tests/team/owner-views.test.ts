// F-010 Task-8: 受入基準 23・24・25(価値責任者の見立てを連携の厚み・司令塔の素点とコーチの評価軸に入れる)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER } from '../../src/data/roster.ts';
import { POSITION, type PlayerRating, type PlayerRatingInput } from '../../src/rating/build.ts';
import type { OwnerView } from '../../src/rating/owner-views.ts';
import { computeStrength } from '../../src/team/strength.ts';
import { computeCoaches, type CoachSnapshot } from '../../src/team/coach.ts';
import { splitTeamViews, withCoachViews } from '../../src/team/owner-views.ts';

const NOW = Date.parse('2026-10-12T00:00:00Z');
const KEYS = ['ground', 'laning', 'teamfight', 'synergy', 'stability', 'pool', 'shotcalling', 'tournament'];
const view = (over: Partial<OwnerView> = {}): OwnerView => ({
  targetKind: 'team', target: 'DD-CORE', axis: 'synergy', direction: '+', strength: '中',
  date: '2026-10-12', quote: 'midjgからもbotsupからもチームをキャリーできる', source: 'https://example.test/thread', ...over,
});
function rating(id: string): PlayerRating {
  const p = ROSTER.find((r) => r.id === id)!;
  return {
    playerId: id, name: p.name, tier: p.tier, position: POSITION[p.role],
    form: { coefficient: 1, label: '普通', insufficient: false, games: 10, wins: 5, score: 0, components: { winRate: 0.5, winRateTerm: 0, lpDelta: null, lpTerm: 0, practiceTerm: 0 }, reason: '' },
    axes: KEYS.map((key) => ({ key, label: key, base: 5, display: 5, confidence: '高', estimated: false, marks: [], reason: '' })),
  };
}
const input = (id: string): PlayerRatingInput => {
  const p = ROSTER.find((r) => r.id === id)!;
  return { playerId: id, name: p.name, tier: p.tier, position: POSITION[p.role], rank: null, games: [], league: [], shotcalling: [], tournament: { ltk: [], coach: [], pro: [], other: [] } };
};
const WORLD = { ratings: ROSTER.map((r) => rating(r.id)), inputs: ROSTER.map((r) => input(r.id)), now: NOW };
const axisOf = (xs: ReturnType<typeof computeStrength>, team: string, tier: string, key: string) =>
  xs.find((x) => x.team === team && x.tier === tier)!.axes.find((a) => a.key === key)!;

test('AC23: 階級チームの見立ては連携の厚み・司令塔の素点に Σ(向き × 強さの重み)を加え、他の軸・他のチームは変えない', () => {
  const plain = computeStrength(WORLD);
  const views = splitTeamViews([view(), view({ target: 'LR-NEXT', axis: 'shotcalling', direction: '-' }), view({ target: 'LR-NEXT', axis: 'shotcalling', direction: '-', strength: '弱' })]);
  const withOv = computeStrength({ ...WORLD, ownerViews: views.team });
  const diff = (team: string, tier: string, key: string) =>
    Math.round((axisOf(withOv, team, tier, key).raw! - axisOf(plain, team, tier, key).raw!) * 100) / 100;
  assert.equal(diff('DD', 'CORE', 'synergy'), 0.6);
  assert.equal(diff('LR', 'NEXT', 'shotcalling'), -0.9);
  assert.equal(diff('DD', 'CORE', 'shotcalling'), 0);
  assert.equal(diff('DD', 'NEXT', 'synergy'), 0);
  assert.equal(axisOf(withOv, 'DD', 'CORE', 'synergy').ownerView?.value, 0.6);
  assert.match(axisOf(withOv, 'DD', 'CORE', 'synergy').reason, /価値責任者の見立て \+0\.60/);
  assert.equal(axisOf(plain, 'DD', 'CORE', 'synergy').ownerView, undefined);
});

test('AC23: 加点は ±1.5 で切り詰める', () => {
  const views = splitTeamViews([view({ strength: '強' }), view({ strength: '強' })]);
  const t = axisOf(computeStrength({ ...WORLD, ownerViews: views.team }), 'DD', 'CORE', 'synergy');
  assert.deepEqual([t.ownerView!.value, t.ownerView!.clipped], [1.5, true]);
});

test('AC24: コーチの見立ては出典「価値責任者の見立て」の根拠として、同じ強さの重み(強 1.5・中 1.0・弱 0.5)で数え、根拠の件数にも入る', () => {
  const empty: CoachSnapshot = { kind: 'evidence-coach', retrievedAt: '', description: '', coaches: {} };
  const views = splitTeamViews([view({ targetKind: 'coach', target: 'IT-CORE', axis: 'tactics', quote: 'mid有利をチーム還元できていないからそこの強化' })]);
  const before = computeCoaches(empty, {}, WORLD.ratings);
  const after = computeCoaches(withCoachViews(empty, views.coach), {}, WORLD.ratings);
  const coachId = 'IT-MASTERS-MID';
  const t0 = before.coaches[coachId].axes.find((a) => a.key === 'tactics')!;
  const t1 = after.coaches[coachId].axes.find((a) => a.key === 'tactics')!;
  assert.equal(t0.estimated, true);
  assert.equal(t1.score, 6);
  assert.equal(t1.confidence, '中');
  assert.equal(t1.estimated, false);
  assert.match(t1.evidence[0].text, /価値責任者の見立て\(2026-10-12\): 「mid有利/);
  assert.ok(after.coachC['IT-CORE'] > before.coachC['IT-CORE']);
  assert.equal(empty.coaches[coachId], undefined, '元の記録は変えない');
});

test('AC25: 名簿に無い階級チーム・担当コーチのいない階級チーム・対象外の軸は使わずに対象と理由を警告する。勢いは F-005 のため警告しない', () => {
  const r = splitTeamViews([
    view({ target: 'XX-CORE' }),
    view({ target: 'DD-CORE', axis: 'power' }),
    view({ targetKind: 'coach', target: 'DD-MASTERS', axis: 'tactics' }),
    view({ targetKind: 'coach', target: 'DD-CORE', axis: 'record' }),
    view({ target: 'DD-NEXT', axis: 'momentum' }),
  ]);
  assert.equal(r.warnings.length, 4);
  assert.match(r.warnings[0], /XX-CORE.*名簿に無い/);
  assert.match(r.warnings[1], /DD-CORE.*power/);
  assert.match(r.warnings[2], /DD-MASTERS.*担当コーチ/);
  assert.match(r.warnings[3], /DD-CORE.*record/);
  assert.equal(r.team['DD-NEXT'][0].axis, 'momentum');
});
