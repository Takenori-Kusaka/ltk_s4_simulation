// F-005 Task-8: 受入基準3c(スクリムが増えた階級チームの外部の見立ての重みを下げる λ)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePriorWinrates, type ExternalView, type TierTeamS } from '../../src/winrate/core.ts';
import type { ResultGame } from '../../src/winrate/update.ts';
import { TEAMS, TIERS } from '../../src/sim/index.ts';

const scrim = (winner: string, loser: string, date: string): ResultGame => ({ kind: 'scrim', date, teams: [winner, loser].sort() as [string, string], winner });
const view = (target: string, direction: '+' | '-', strength: '強' | '中' | '弱'): ExternalView => ({ target, direction, strength });
// IT-NEXT は外部の見立てが強い(+強 × 2 = 3.0)、DD-NEXT は 0
const VIEWS = [view('IT-NEXT', '+', '強'), view('IT-NEXT', '+', '強'), view('LR-NEXT', '-', '中')];

function tierTeams(): TierTeamS[] {
  return TIERS.flatMap((tier) => TEAMS.map((team) => ({ team, tier, S: 6.0, M: 6.0 })));
}
const nextMatch = (o: ReturnType<typeof computePriorWinrates>, day: number) => o.matches.find((m) => m.stage === 'regular' && m.day === day && m.tier === 'NEXT' && [m.a, m.b].includes('IT'))!;

test('AC3c: スクリムが無ければ λ は 1 で、外部の見立ての項は従来と同じ', () => {
  const o = computePriorWinrates(tierTeams(), { externalViews: VIEWS });
  const it = o.teams.find((t) => t.key === 'IT-NEXT')!;
  assert.deepEqual([it.ns, it.lambda, it.lambdaE], [0, 1, 3]);
  const m = nextMatch(o, 2);
  assert.deepEqual([m.nsA, m.nsB, m.lambdaA, m.lambdaB], [0, 0, 1, 1]);
  assert.equal(m.extLogit, Math.round(m.betaExt * (m.eA - m.eB) * 1000) / 1000);
});

test('AC3c: λ = scrimHalf(4)÷(4 + 両チームの n_s の平均)。外部の見立ての項は β_ext × λ × (E_A − E_B) で、β_ext は λ を掛ける前の E から決める', () => {
  const games = [1, 2, 3, 4].map((i) => scrim('DD-NEXT', 'IT-NEXT', `2026-10-1${i}`));
  const plain = computePriorWinrates(tierTeams(), { externalViews: VIEWS });
  const o = computePriorWinrates(tierTeams(), { externalViews: VIEWS, results: games });
  assert.equal(o.betaExt.NEXT, plain.betaExt.NEXT, 'β_ext は変わらない');
  const it = o.teams.find((t) => t.key === 'IT-NEXT')!;
  assert.deepEqual([it.ns, it.lambda, it.lambdaE], [4, 0.5, 1.5]);
  // Day 2(10/19)の DD 対 IT: 4 試合とも前日まで
  const m = nextMatch(o, 2);
  const itIsA = m.a === 'IT';
  assert.equal(itIsA ? m.lambdaA : m.lambdaB, 0.5);
  assert.equal(itIsA ? m.nsA : m.nsB, 4);
  // DD・IT とも 4 試合で、平均 4 → λ = 0.5
  assert.equal(m.extLogit, Math.round(m.betaExt * 0.5 * (m.eA - m.eB) * 1000) / 1000);
  assert.ok(Math.abs(m.extLogit) < Math.abs(nextMatch(plain, 2).extLogit), '見立ての項が小さくなる');
});

test('AC3c: スクリム数が違う 2 チームにも同じ λ を掛け、外部の見立ての項の向きは λ を掛ける前と変わらない', () => {
  // IT-NEXT だけ 4 試合(相手はリスナー扱いの別階級)。LR-NEXT は 0 試合 → 平均 2、λ = 4 ÷ 6
  const games = [1, 2, 3, 4].map((i) => scrim('IT-NEXT', 'DD-CORE', `2026-10-1${i}`));
  const plain = computePriorWinrates(tierTeams(), { externalViews: VIEWS });
  const o = computePriorWinrates(tierTeams(), { externalViews: VIEWS, results: games });
  const pick = (x: typeof o) => x.matches.find((m) => m.stage === 'regular' && m.tier === 'NEXT' && [m.a, m.b].includes('IT') && [m.a, m.b].includes('LR'))!;
  const m = pick(o), p = pick(plain);
  const l = Math.round((4 / 6) * 100) / 100;
  assert.deepEqual([m.lambdaA, m.lambdaB], [l, l]);
  assert.equal(m.extLogit, Math.round(m.betaExt * (4 / 6) * (m.eA - m.eB) * 1000) / 1000);
  assert.equal(Math.sign(m.extLogit), Math.sign(p.extLogit), '見立ての項の向きは変わらない');
  assert.ok(Math.abs(m.extLogit) < Math.abs(p.extLogit));
});

test('AC3c: n_s はその試合日より前(当日を含まない)のスクリムで、相手の階級を問わず数える。本番の結果は数えない', () => {
  const games: ResultGame[] = [
    scrim('IT-NEXT', 'DD-CORE', '2026-10-10'),
    scrim('IT-NEXT', 'LR-NEXT', '2026-10-15'),
    { kind: 'official', date: '2026-10-10', teams: ['DD-NEXT', 'IT-NEXT'], winner: 'IT-NEXT' },
  ];
  const o = computePriorWinrates(tierTeams(), { externalViews: VIEWS, results: games });
  const day1 = nextMatch(o, 1); // 10/15: 当日のスクリムは数えない
  assert.equal(day1.a === 'IT' ? day1.nsA : day1.nsB, 1);
  assert.equal(o.teams.find((t) => t.key === 'IT-NEXT')!.ns, 2);
});

test('AC3c: 根拠の節の外部の見立てに「スクリム n_s 試合により見立ての重み λ」を出す', async () => {
  const { matchStory } = await import('../../src/app/story/story.ts');
  const { ROSTER } = await import('../../src/data/roster.ts');
  const KEYS = ['ground', 'laning', 'teamfight', 'synergy', 'stability', 'pool', 'shotcalling', 'tournament'];
  const roles = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];
  const players = ['CC', 'DD'].flatMap((t) => roles.map((r) => ({ playerId: `${t}-MASTERS-${r}`, name: ROSTER.find((p) => p.id === `${t}-MASTERS-${r}`)?.name ?? r, axes: KEYS.map((key) => ({ key, label: key, display: 7 })) })));
  const teamEval = { tierTeams: ['CC', 'DD'].map((team) => ({ team, tier: 'MASTERS', S: 7, coachC: null, coachId: null })) };
  const s = matchStory(
    { tier: 'MASTERS', a: 'CC', b: 'DD', pA: 50, pB: 50, pLane: 50, pMacro: 50, pExt: 50, results: { thetaA: 0, thetaB: 0, logit: 0, nA: 0, nB: 4, pBeforeA: 50, nsA: 0, nsB: 4, lambdaA: 1, lambdaB: 0.5 } },
    { kind: 'ratings', players }, teamEval as never, null,
  );
  if (!s.ok) return assert.fail(s.reason);
  assert.equal(s.layers.macro.external.a.scrimWeight, 'スクリム 0 試合(見立ての重みは両チームの平均で 1.00)');
  assert.equal(s.layers.macro.external.b.scrimWeight, 'スクリム 4 試合(見立ての重みは両チームの平均で 0.50)');
});

test('AC3c(2026-10-13 改定): 本番 1 試合はスクリムの重みの比(2.0 ÷ 0.4 = 5)の数だけ λ の試合数に数え、n_o を持つ', () => {
  // IT-NEXT と LR-NEXT が本番を 1 試合ずつ(10/15)→ Day 2 以降は両チームとも n = 5、λ = 4 ÷ 9
  const games: ResultGame[] = [{ kind: 'official', date: '2026-10-15', teams: ['IT-NEXT', 'LR-NEXT'], winner: 'IT-NEXT' }];
  const o = computePriorWinrates(tierTeams(), { externalViews: VIEWS, results: games });
  const m = o.matches.find((x) => x.stage === 'regular' && x.day === 2 && x.tier === 'NEXT' && [x.a, x.b].includes('IT'))!;
  const itIsA = m.a === 'IT';
  assert.equal(itIsA ? m.noA : m.noB, 1);
  assert.equal(itIsA ? m.nsA : m.nsB, 0);
  // Day 2 の IT の相手は本番 0 試合 → 平均 2.5、λ = 4 ÷ 6.5
  assert.deepEqual([m.lambdaA, m.lambdaB], [Math.round((4 / 6.5) * 100) / 100, Math.round((4 / 6.5) * 100) / 100]);
  const it = o.teams.find((t) => t.key === 'IT-NEXT')!;
  assert.deepEqual([it.ns, it.no, it.lambda], [0, 1, Math.round((4 / 9) * 100) / 100]);
});

test('AC3c(2026-10-13 改定): 根拠の節に本番があれば「スクリム n_s 試合・本番 n_o 試合」と出す', async () => {
  const { matchStory } = await import('../../src/app/story/story.ts');
  const { ROSTER } = await import('../../src/data/roster.ts');
  const KEYS = ['ground', 'laning', 'teamfight', 'synergy', 'stability', 'pool', 'shotcalling', 'tournament'];
  const roles = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];
  const players = ['CC', 'DD'].flatMap((t) => roles.map((r) => ({ playerId: `${t}-MASTERS-${r}`, name: ROSTER.find((p) => p.id === `${t}-MASTERS-${r}`)?.name ?? r, axes: KEYS.map((key) => ({ key, label: key, display: 7 })) })));
  const teamEval = { tierTeams: ['CC', 'DD'].map((team) => ({ team, tier: 'MASTERS', S: 7, coachC: null, coachId: null })) };
  const s = matchStory(
    { tier: 'MASTERS', a: 'CC', b: 'DD', pA: 50, pB: 50, pLane: 50, pMacro: 50, pExt: 50, results: { thetaA: 0, thetaB: 0, logit: 0, nA: 0, nB: 5, pBeforeA: 50, nsA: 0, nsB: 4, noA: 0, noB: 1, lambdaA: 0.53, lambdaB: 0.53 } },
    { kind: 'ratings', players }, teamEval as never, null,
  );
  if (!s.ok) return assert.fail(s.reason);
  assert.equal(s.layers.macro.external.a.scrimWeight, 'スクリム 0 試合(見立ての重みは両チームの平均で 0.53)');
  assert.equal(s.layers.macro.external.b.scrimWeight, 'スクリム 4 試合・本番 1 試合(見立ての重みは両チームの平均で 0.53)');
});
