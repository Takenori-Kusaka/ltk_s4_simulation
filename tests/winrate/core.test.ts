// F-005 Task-1: 受入基準 1・2・3・6・7・16(勝率の土台: β、事前の勝率、ステージ補正、S を計算できないときの 50.0%、F-001 の形式)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { betaOf, computePriorWinrates, type TierTeamS, type WinrateConfig } from '../../src/winrate/core.ts';
import { simulate, validateWinTable, TEAMS, TIERS, type TeamId, type Tier } from '../../src/sim/index.ts';
import baseConfig from '../../src/winrate/config.json' with { type: 'json' };

// 仕様の計算の例(NEXT の4チームの S)。β = 0.35 ÷ 0.442 = 0.792、CC 対 DD の対数オッズ −0.341 → 41.5%
const EXAMPLE: Record<TeamId, number> = { CC: 5.285, DD: 5.716, IT: 4.972, LR: 5.188 };

function teams(S: Partial<Record<Tier, Partial<Record<TeamId, number | null>>>>): TierTeamS[] {
  const out: TierTeamS[] = [];
  for (const tier of TIERS) {
    for (const team of TEAMS) {
      const v = S[tier]?.[team];
      out.push(v === null ? { team, tier, S: null, reason: `評価の無い選手: ${team} の TOP` } : { team, tier, S: v ?? 6.0 });
    }
  }
  return out;
}

const tenths = (p: number) => Math.round(p * 10);

test('基準3: β は同じ階級の6組の S の差の二乗平均平方根が targetSd になる値。差がすべて 0 なら 0', () => {
  const b = betaOf([5.285, 5.716, 4.972, 5.188], 0.35);
  assert.ok(Math.abs(b - 0.792) < 0.0015, `β ${b}`);
  assert.equal(betaOf([6, 6, 6, 6], 0.35), 0);
  assert.equal(betaOf([], 0.35), 0);
});

test('基準1: Regular Stage の 24 試合と MASTERS CUP の準決勝 6 試合を持ち、各試合の両チームの勝率は 0.1% 単位で和が 100.0%', () => {
  const out = computePriorWinrates(teams({ NEXT: EXAMPLE }));
  const rs = out.matches.filter((m) => m.stage === 'regular');
  const mc = out.matches.filter((m) => m.stage === 'masters');
  assert.equal(rs.length, 24);
  assert.equal(rs.filter((m) => m.tier === 'NEXT').length, 12);
  assert.equal(rs.filter((m) => m.tier === 'CORE').length, 12);
  assert.equal(mc.length, 6);
  assert.ok(mc.every((m) => m.tier === 'MASTERS'));
  for (const m of out.matches) {
    assert.equal(tenths(m.pA) + tenths(m.pB), 1000, `${m.tier} ${m.a} vs ${m.b}`);
    assert.equal(m.pA, tenths(m.pA) / 10);
  }
});

test('基準2・3: 事前の対数オッズは β × (S_A − S_B)。仕様の例の CC 対 DD(NEXT)は 41.5%', () => {
  const out = computePriorWinrates(teams({ NEXT: EXAMPLE }));
  assert.ok(Math.abs(out.beta.NEXT - 0.792) < 0.0015);
  const m = out.matches.find((x) => x.stage === 'regular' && x.day === 1 && x.tier === 'NEXT' && x.a === 'CC' && x.b === 'DD');
  assert.ok(m, 'CC 対 DD(NEXT・第1日)が無い');
  assert.ok(Math.abs(m.logit - -0.341) < 0.002, `対数オッズ ${m.logit}`);
  assert.equal(m.pA, 41.5);
  assert.equal(m.pB, 58.5);
  assert.equal(m.beta, out.beta.NEXT);
});

test('基準6: ステージ補正は評価設定の階級チームごとの値を対数オッズに加え、根拠の文を持つ。初期値はすべて 0', () => {
  const base = computePriorWinrates(teams({ NEXT: EXAMPLE }));
  assert.deepEqual(base.stageWinTables.regular, base.winTable);
  assert.deepEqual(base.stageWinTables.playoffs, base.winTable);
  assert.match(base.stageBasis, /S1〜S3 でステージ別の差を示すデータが無い/);
  const cfg: WinrateConfig = { ...baseConfig, stage: { regular: { 'CC-NEXT': 0.5 }, masters: {}, playoffs: {} } } as WinrateConfig;
  const out = computePriorWinrates(teams({ NEXT: EXAMPLE }), { config: cfg });
  const m = out.matches.find((x) => x.stage === 'regular' && x.day === 1 && x.tier === 'NEXT' && x.a === 'CC' && x.b === 'DD');
  assert.ok(m);
  assert.equal(m.stageTerm, 0.5);
  assert.ok(Math.abs(m.logit - (-0.341 + 0.5)) < 0.002);
  assert.ok(out.stageWinTables.regular.NEXT['CC>DD'] > out.winTable.NEXT['CC>DD']);
  assert.deepEqual(out.stageWinTables.masters, out.winTable);
});

test('基準7: 勝率表は F-001 の入力の形式(winTable と stageWinTables)で、F-001 の検証とシミュレーションに通る', () => {
  const out = computePriorWinrates(teams({ NEXT: EXAMPLE }));
  const get = validateWinTable(out.winTable);
  assert.ok(Math.abs(get('NEXT', 'CC', 'DD') - 0.415) < 1e-9);
  assert.ok(Math.abs(get('NEXT', 'DD', 'CC') - 0.585) < 1e-9);
  for (const stage of ['regular', 'masters', 'playoffs'] as const) validateWinTable(out.stageWinTables[stage]);
  const sim = simulate({ winTable: out.winTable, stageWinTables: out.stageWinTables, seed: 7, trials: 300 });
  const total = TEAMS.reduce((a, t) => a + sim.championProbability[t], 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('基準16: 戦力 S を計算できない階級チームが関わる試合は 50.0% で、データ不足の理由を持つ。ほかの試合は影響を受けない', () => {
  const out = computePriorWinrates(teams({ NEXT: { ...EXAMPLE, LR: null } }));
  const lr = out.matches.filter((m) => m.tier === 'NEXT' && (m.a === 'LR' || m.b === 'LR'));
  assert.ok(lr.length > 0);
  for (const m of lr) {
    assert.equal(m.pA, 50.0);
    assert.equal(m.pB, 50.0);
    assert.match(m.dataMissing ?? '', /データ不足/);
    assert.match(m.dataMissing ?? '', /評価の無い選手: LR の TOP/);
  }
  const cc = out.matches.find((x) => x.stage === 'regular' && x.day === 1 && x.tier === 'NEXT' && x.a === 'CC' && x.b === 'DD');
  assert.ok(cc);
  assert.equal(cc.dataMissing, null);
  assert.notEqual(cc.pA, 50.0);
  assert.equal(out.winTable.NEXT['DD>LR'], 0.5);
  const missing = out.teams.find((t) => t.team === 'LR' && t.tier === 'NEXT');
  assert.equal(missing?.S, null);
  assert.match(missing?.reason ?? '', /評価の無い選手/);
  const none = computePriorWinrates(teams({}).filter((t) => !(t.team === 'IT' && t.tier === 'CORE')));
  const it = none.teams.find((t) => t.team === 'IT' && t.tier === 'CORE');
  assert.equal(it?.S, null);
  assert.match(it?.reason ?? '', /F-010 の計算が無い/);
});

test('同じ入力からは同じ出力を返す', () => {
  const a = computePriorWinrates(teams({ NEXT: EXAMPLE, CORE: { DD: 6.0, CC: 6.8, IT: 6.5, LR: 6.2 } }));
  const b = computePriorWinrates(teams({ NEXT: EXAMPLE, CORE: { DD: 6.0, CC: 6.8, IT: 6.5, LR: 6.2 } }));
  assert.deepEqual(a, b);
});
