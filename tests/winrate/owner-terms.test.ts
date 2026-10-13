// F-005 Task-7: 受入基準 17・18・19(切り詰めの対象外)・20(表示)。価値責任者の見立ての伸びしろの項と勢いの項
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayShift, growthTerm, maturationOf, momentumTerm, ownerTermsOf, type DynamicsConfig, type MaturationMember,
} from '../../src/winrate/dynamics.ts';
import { computePriorWinrates, type TierTeamS } from '../../src/winrate/core.ts';
import type { OwnerView } from '../../src/rating/owner-views.ts';
import baseConfig from '../../src/winrate/config.json' with { type: 'json' };

const CFG = baseConfig as unknown as DynamicsConfig;
const near = (x: number, y: number, eps = 1e-9) => assert.ok(Math.abs(x - y) < eps, `${x} ≠ ${y}`);
const view = (over: Partial<OwnerView> = {}): OwnerView => ({
  targetKind: 'player', target: 'LR-NEXT-JG', axis: 'growth', direction: '+', strength: '強',
  date: '2026-10-12', quote: '練習すれば伸びる部分で後半解消されそう', source: 'https://example.test/thread', ...over,
});
const member = (id: string, name: string, views: OwnerView[] = []): MaturationMember => ({ id, name, role: 'JG', ltk: [], pool: [], ownerViews: views });
// LR NEXT の起案の対応づけ: アステル +強、春茶 +弱、なぎさっち −中、No.1005 −中 → G = 1.0 + 0.3 − 0.6 − 0.6 = 0.1
const LR = [
  member('LR-NEXT-JG', 'アステル・レダ', [view()]),
  member('LR-NEXT-MID', '春茶', [view({ target: 'LR-NEXT-MID', strength: '弱' })]),
  member('LR-NEXT-ADC', 'なぎさっち', [view({ target: 'LR-NEXT-ADC', direction: '-', strength: '中' })]),
  member('LR-NEXT-SUP', 'No.1005', [view({ target: 'LR-NEXT-SUP', direction: '-', strength: '中' })]),
  member('LR-NEXT-TOP', '狐白うる'),
];
const MOMENTUM = view({ targetKind: 'team', target: 'DD-NEXT', axis: 'momentum', strength: '中', quote: '大会が短いのでその勢いのまま行く可能性がありそう' });

test('用語 G・V: 伸びしろの点は 5 人の伸びしろの項目、勢いの点は階級チームの勢いの項目の Σ(向き × 強 1.0・中 0.6・弱 0.3)。項目が無ければ null', () => {
  const lr = ownerTermsOf(LR)!;
  near(lr.G, 0.1);
  assert.equal(lr.V, 0);
  assert.equal(lr.items.length, 4);
  const dd = ownerTermsOf([member('DD-NEXT-TOP', 'SHAKA')], [MOMENTUM])!;
  assert.deepEqual([dd.G, dd.V], [0, 0.6]);
  assert.equal(ownerTermsOf([member('X', 'x')]), null);
  assert.equal(ownerTermsOf([member('X', 'x', [view({ axis: 'ground' })])]), null, '伸びしろ以外の軸は数えない');
});

test('AC17: 伸びしろの項 = 0.02 × G × d を ±0.15 に切り詰める。d = 0 で 0、試合日とともに大きくなる', () => {
  const owner = { G: 1.0, V: 0, items: [] };
  assert.equal(growthTerm(owner, 0, CFG), 0);
  near(growthTerm(owner, 3, CFG), 0.06);
  near(growthTerm({ ...owner, G: -1.2 }, 3, CFG), -0.072);
  near(growthTerm({ ...owner, G: 3 }, 6, CFG), 0.15);
  near(growthTerm(ownerTermsOf(LR), 3, CFG), 0.006);
});

test('AC18: 勢いの項 = 0.10 × V × 0.5^(d ÷ 3) を ±0.15 に切り詰める。開幕(d = 0)で最も大きく、3 試合日で半分', () => {
  const owner = { G: 0, V: 0.6, items: [] };
  near(momentumTerm(owner, 0, CFG), 0.06);
  near(momentumTerm(owner, 3, CFG), 0.03);
  near(momentumTerm(owner, 6, CFG), 0.015);
  near(momentumTerm({ ...owner, V: 2 }, 0, CFG), 0.15);
  assert.equal(momentumTerm(null, 0, CFG), 0);
});

test('AC19: 見立ての項は基準13 の ±unvalidatedCap(0.10)の切り詰めの外で、差として対数オッズに加える', () => {
  const big = { tau: 1, owner: { G: 0, V: 2, items: [] } };
  const none = { tau: 1, owner: null };
  // 仕上がりの項の差は 0(同じ τ・同じ d)。勢いの差 0.15 は 0.10 に切り詰めない
  near(dayShift(big, none, 0, 0, { config: CFG }), 0.15);
  near(dayShift(none, big, 0, 0, { config: CFG }), -0.15);
  near(dayShift(none, none, 2, 2, { config: CFG }), 0);
});

test('AC17・18: 勝率表のファイルの仕上がりに見立ての G・V・項目を持ち、項目が無いチームは null', () => {
  const teams: TierTeamS[] = [
    { team: 'LR', tier: 'NEXT', S: 5, members: LR },
    { team: 'DD', tier: 'NEXT', S: 5, members: [member('DD-NEXT-TOP', 'SHAKA')], ownerViews: [MOMENTUM] },
    { team: 'CC', tier: 'NEXT', S: 5 },
  ];
  const out = computePriorWinrates(teams);
  const row = (team: string) => out.teams.find((t) => t.team === team && t.tier === 'NEXT')!;
  near(row('LR').maturation.owner!.G, 0.1);
  assert.equal(row('DD').maturation.owner!.V, 0.6);
  assert.equal(row('CC').maturation.owner, null);
  assert.equal(maturationOf(undefined, null, CFG).owner, null);
});

test('AC20: 試合の分析ページの仕上がりの小節は、両チームの見立ての項・G・V・原文を「価値責任者の見立て」として持ち、項目が無い側は null', async () => {
  const { matchStory } = await import('../../src/app/story/story.ts');
  const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];
  const KEYS = ['ground', 'laning', 'teamfight', 'synergy', 'stability', 'pool', 'shotcalling', 'tournament'];
  const player = (id: string) => ({ playerId: id, name: id, axes: KEYS.map((key) => ({ key, label: key, display: 5 })) });
  const ratings = { kind: 'ratings', players: [...ROLES.map((r) => player(`DD-NEXT-${r}`)), ...ROLES.map((r) => player(`LR-NEXT-${r}`))] };
  const teamEval = { tierTeams: [{ team: 'DD', tier: 'NEXT', S: 5, coachC: 5, coachId: null }, { team: 'LR', tier: 'NEXT', S: 5, coachC: 5, coachId: null }] };
  const a = maturationOf([member('DD-NEXT-TOP', 'SHAKA')], null, CFG, [MOMENTUM]);
  const b = maturationOf([member('LR-NEXT-TOP', '狐白うる')], null, CFG);
  const shift = dayShift(a, b, 0, 0, { config: CFG });
  const s = matchStory({ tier: 'NEXT', a: 'DD', b: 'LR', pA: 51.5, pB: 48.5, maturation: { dA: 0, dB: 0, termA: 0, termB: 0, ownerA: 0.06, ownerB: 0, shift, pPriorA: 50, a, b } }, ratings, teamEval);
  assert.ok(s.ok);
  const mt = s.layers.maturation!;
  assert.equal(mt.a.owner!.term, '+0.060');
  assert.equal(mt.a.owner!.V, '0.60');
  assert.match(mt.a.owner!.items[0], /^勢い 肯定・中.DD-NEXT、2026-10-12.:「大会が短いのでその勢いのまま行く/);
  assert.equal(mt.b.owner, null);
  assert.match(mt.summary, /価値責任者の見立ての勢いで \+0\.060/);
});
