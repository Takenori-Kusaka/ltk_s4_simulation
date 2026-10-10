// F-013 Task-1: 受入基準 1〜7・9(勝率とシミュレーションの結果のページの論理)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computePriorWinrates, type TierTeamS } from '../../src/winrate/core.ts';
import { TEAMS, TIERS, type TeamId, type Tier } from '../../src/sim/index.ts';
import { parseRoute, pageTitle } from '../../src/app/lib/index.ts';
import {
  SIM_SEED, SIM_TRIALS, noDataNotice, resultsNotice, runSimulation, simulationView, tierTables, type WinratesFile,
} from '../../src/app/sim/view.ts';

const S: Record<Tier, Record<TeamId, number | null>> = {
  NEXT: { DD: 5.7, CC: 5.3, IT: 5.0, LR: 5.2 },
  CORE: { DD: 6.0, CC: 6.8, IT: 6.5, LR: 6.2 },
  MASTERS: { DD: 7.1, CC: 6.8, IT: 6.6, LR: null },
};
const teams: TierTeamS[] = TIERS.flatMap((tier) =>
  TEAMS.map((team) => (S[tier][team] === null ? { team, tier, S: null, reason: '評価の無い選手: ハレっち' } : { team, tier, S: S[tier][team] as number })),
);
const file: WinratesFile = { ...computePriorWinrates(teams), computedAt: '2026-10-10T10:00:00.000Z', configVersion: 'abcdef012345', results: null };
const tenths = (s: string) => Math.round(Number(s) * 10);

test('基準1・9: 階級ごとに4チームの S(小数第二位)・β(小数第三位)・6組の事前の勝率(0.1% 単位、和が 100.0)を勝率表のファイルから作る', () => {
  const tables = tierTables(file);
  assert.deepEqual(tables.map((t) => t.tier), [...TIERS]);
  const next = tables.find((t) => t.tier === 'NEXT')!;
  assert.equal(next.teams.length, 4);
  assert.equal(next.teams.find((t) => t.team === 'DD')?.S, '5.70');
  assert.equal(next.beta, file.beta.NEXT.toFixed(3));
  assert.match(next.beta, /^\d\.\d{3}$/);
  assert.equal(next.pairs.length, 6);
  for (const p of next.pairs) {
    assert.equal(tenths(p.pA) + tenths(p.pB), 1000, `${p.a} vs ${p.b}`);
    assert.equal(p.pA, (file.winTable.NEXT[`${p.a}>${p.b}`] * 100).toFixed(1));
    assert.equal(p.dataMissing, null);
  }
  assert.ok(next.teams.every((t) => t.name.length > 0 && t.reason === null));
});

test('基準5: S を計算できない階級チームが関わる組は「データ不足」と理由を持ち、チームの行にも理由が出る', () => {
  const masters = tierTables(file).find((t) => t.tier === 'MASTERS')!;
  const lr = masters.teams.find((t) => t.team === 'LR')!;
  assert.equal(lr.S, '—');
  assert.match(lr.reason ?? '', /評価の無い選手: ハレっち/);
  const rows = masters.pairs.filter((p) => p.a === 'LR' || p.b === 'LR');
  assert.equal(rows.length, 3);
  for (const p of rows) {
    assert.equal(p.pA, '50.0');
    assert.match(p.dataMissing ?? '', /データ不足/);
    assert.match(p.dataMissing ?? '', /ハレっち/);
  }
  assert.ok(masters.pairs.filter((p) => p.a !== 'LR' && p.b !== 'LR').every((p) => p.dataMissing === null));
});

test('基準2・3・9: 固定の種 20261015 と試行 10,000 で F-001 の simulate を実行し、0.1% 単位の確率と小数第一位の期待値、種・試行・計算日時を出す', () => {
  assert.equal(SIM_SEED, 20261015);
  assert.equal(SIM_TRIALS, 10000);
  const sim = runSimulation(file);
  assert.equal(sim.trials, 10000);
  assert.deepEqual(runSimulation(file), sim);
  const v = simulationView(sim, file);
  assert.equal(v.seed, 20261015);
  assert.equal(v.trials, 10000);
  assert.equal(v.computedAt, '2026-10-10T10:00:00.000Z');
  assert.equal(v.rows.length, 4);
  let champion = 0;
  for (const r of v.rows) {
    assert.equal(r.seed.length, 4);
    for (const s of r.seed) assert.match(s, /^\d+\.\d$/);
    assert.match(r.champion, /^\d+\.\d$/);
    assert.equal(r.champion, (sim.championProbability[r.team] * 100).toFixed(1));
    assert.equal(r.seed[0], (sim.seedProbability[r.team][0] * 100).toFixed(1));
    assert.equal(r.expectedRegular, sim.expectedRegularPoints[r.team].toFixed(1));
    assert.equal(r.expectedMasters, sim.expectedMastersPoints[r.team].toFixed(1));
    champion += Number(r.champion);
  }
  assert.ok(Math.abs(champion - 100) < 0.3, `優勝確率の和 ${champion}`);
  // 優勝確率の高い順
  for (let i = 1; i < v.rows.length; i++) assert.ok(Number(v.rows[i - 1].champion) >= Number(v.rows[i].champion));
});

test('基準4: 勝率表のファイルが無い、または kind が winrates でないときは「勝率のデータがありません」と集計のコマンドの名前を出す', () => {
  for (const bad of [undefined, null, { kind: 'ratings' }, { winTable: {} }]) {
    const n = noDataNotice(bad);
    assert.match(n ?? '', /勝率のデータがありません/);
    assert.match(n ?? '', /aggregate-cli/);
  }
  assert.equal(noDataNotice(file), null);
});

test('基準6: 結果の入力が無い間は「結果の反映: なし(開幕前の予想)」', () => {
  assert.equal(resultsNotice(file), '結果の反映: なし(開幕前の予想)');
  assert.notEqual(resultsNotice({ ...file, results: { regular: [] } }), '結果の反映: なし(開幕前の予想)');
});

test('基準7: 経路 #/sim とホームの導線', () => {
  assert.deepEqual(parseRoute('#/sim'), { page: 'sim' });
  assert.deepEqual(parseRoute('#/SIM/'), { page: 'sim' });
  assert.match(pageTitle({ page: 'sim' }), /勝率とシミュレーション/);
  const home = readFileSync(new URL('../../src/app/components/Home.svelte', import.meta.url), 'utf8');
  assert.match(home, /href="#\/sim"/);
});
