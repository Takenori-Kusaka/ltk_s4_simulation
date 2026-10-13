// F-005 Task-2: 受入基準4(本番とスクリムの結果による θ の当て直し)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitTheta, type ResultGame, type ThetaConfig } from '../../src/winrate/update.ts';
import { computePriorWinrates, type TierTeamS } from '../../src/winrate/core.ts';
import { TEAMS, TIERS } from '../../src/sim/index.ts';

const CFG: ThetaConfig = { theta: { priorSd: 0.58 }, weights: { official: 1.0, scrim: 0.25 } };
const CORE = TEAMS.map((t) => `${t}-CORE`);
const zero = () => 0;
const game = (winner: string, loser: string, date = '2026-10-10', kind: ResultGame['kind'] = 'scrim'): ResultGame => ({
  kind, date, teams: [winner, loser].sort() as [string, string], winner,
});

test('AC4: 結果が無ければ θ はすべて 0 で、使った試合の数も 0', () => {
  const r = fitTheta([], CORE, zero, CFG);
  for (const k of CORE) assert.deepEqual(r[k], { theta: 0, official: 0, scrim: 0 });
});

test('AC4: 勝ち越した側の θ が上がり、負け越した側が下がる。スクリムの数を数える', () => {
  const r = fitTheta([game('DD-CORE', 'LR-CORE'), game('DD-CORE', 'LR-CORE'), game('DD-CORE', 'LR-CORE')], CORE, zero, CFG);
  assert.ok(r['DD-CORE'].theta > 0);
  assert.ok(r['LR-CORE'].theta < 0);
  assert.equal(r['DD-CORE'].scrim, 3);
  assert.equal(r['CC-CORE'].theta, 0, '試合の無いチームは 0');
});

test('AC4: 同じ結果でも、本番(重み 1.0)はスクリム(重み 0.25)より θ を大きく動かす', () => {
  const scrim = fitTheta([game('DD-CORE', 'IT-CORE')], CORE, zero, CFG)['DD-CORE'].theta;
  const official = fitTheta([game('DD-CORE', 'IT-CORE', '2026-10-15', 'official')], CORE, zero, CFG)['DD-CORE'].theta;
  assert.ok(official > scrim && scrim > 0);
});

test('AC4: スクリム 1 試合の θ は、重み 0.25 と事前分布(標準偏差 0.58)の最頻値に一致する', () => {
  // 対称の 2 チーム: θ_A = −θ_B = t。0.25 × (1 − σ(2t)) = t ÷ 0.58² をニュートン法と別に二分法で解く
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const t = (lo + hi) / 2;
    if (0.25 * (1 - 1 / (1 + Math.exp(-2 * t))) - t / 0.58 ** 2 > 0) lo = t; else hi = t;
  }
  const r = fitTheta([game('DD-CORE', 'IT-CORE')], ['DD-CORE', 'IT-CORE'], zero, CFG);
  assert.equal(r['DD-CORE'].theta, Math.round(lo * 1000) / 1000);
  assert.equal(r['IT-CORE'].theta, -Math.round(lo * 1000) / 1000);
});

test('AC4: 固定の項 β × (S_A − S_B) で勝ちが見込まれていた側は、勝っても θ の動きが小さい', () => {
  const g = [game('DD-CORE', 'IT-CORE'), game('DD-CORE', 'IT-CORE')];
  const plain = fitTheta(g, CORE, zero, CFG)['DD-CORE'].theta;
  const expected = fitTheta(g, CORE, (a, b) => (a === 'DD-CORE' ? 1.5 : b === 'DD-CORE' ? -1.5 : 0), CFG)['DD-CORE'].theta;
  assert.ok(expected < plain && expected > 0);
});

test('AC4: 試合日より前(当日を含まない)の結果だけを使い、別の階級の組・名簿に無いチームの試合は使わない', () => {
  const g = [game('DD-CORE', 'IT-CORE', '2026-10-14'), game('DD-CORE', 'IT-CORE', '2026-10-15'), game('DD-CORE', 'IT-NEXT', '2026-10-10'), game('DD-CORE', 'XX-CORE', '2026-10-10')];
  const r = fitTheta(g, CORE, zero, CFG, '2026-10-15');
  assert.equal(r['DD-CORE'].scrim, 1);
  assert.equal(r['IT-CORE'].scrim, 1);
});

function tierTeams(): TierTeamS[] {
  const S: Record<string, number> = { CC: 6.2, DD: 6.0, IT: 5.8, LR: 5.6 };
  return TIERS.flatMap((tier) => TEAMS.map((team) => ({ team, tier, S: S[team], M: 6.0 })));
}

test('AC4: 勝率表の試合の対数オッズに θ_A − θ_B が加わり、更新前の勝率と使った試合数を持つ。結果が無ければ変わらない', () => {
  const results = [game('DD-CORE', 'LR-CORE', '2026-10-09'), game('DD-CORE', 'LR-CORE', '2026-10-09'), game('DD-CORE', 'IT-CORE', '2026-10-11')];
  const plain = computePriorWinrates(tierTeams());
  const upd = computePriorWinrates(tierTeams(), { results });
  const pick = (o: typeof plain) => o.matches.find((m) => m.stage === 'regular' && m.day === 1 && m.tier === 'CORE' && m.a === 'CC')!;
  const p0 = pick(plain), p1 = pick(upd);
  assert.equal(p0.thetaLogit, 0);
  assert.equal(p0.pA, p0.pBeforeResultsA);
  assert.ok(p1.thetaB > 0, 'DD-CORE(B 側)の θ が上がる');
  assert.equal(p1.thetaLogit, Math.round((p1.thetaA - p1.thetaB) * 1000) / 1000);
  assert.ok(p1.pA < p0.pA, 'CC の勝率が下がる');
  assert.equal(p1.pBeforeResultsA, p0.pA);
  assert.equal(p1.resultsB, 3);
  assert.equal(upd.teams.find((t) => t.key === 'DD-CORE')!.result.scrim, 3);
  assert.equal(upd.teams.find((t) => t.key === 'DD-NEXT')!.result.theta, 0, '別の階級は動かない');
  // F-001 の勝率表もすべての結果で更新した値
  assert.ok(upd.winTable.CORE['CC>DD'] < plain.winTable.CORE['CC>DD']);
});

test('AC4: 根拠の節の「結果による更新」は、結果が無ければ「データなし」、あれば勝率の差(%)と両チームの試合数を出す(θ の値は出さない)', async () => {
  const { resultsLayerOf } = await import('../../src/app/story/story.ts');
  assert.equal(resultsLayerOf(undefined, 50), null, '勝率表のファイルに項目が無ければ行を出さない');
  assert.deepEqual(resultsLayerOf({ thetaA: 0, thetaB: 0, logit: 0, nA: 0, nB: 0, pBeforeA: 56 }, 56), { none: true });
  assert.deepEqual(resultsLayerOf({ thetaA: 0, thetaB: 0.11, logit: -0.11, nA: 0, nB: 6, pBeforeA: 56 }, 53.3), { none: false, pBefore: '56.0', diff: '-2.7', nA: 0, nB: 6 });
});
