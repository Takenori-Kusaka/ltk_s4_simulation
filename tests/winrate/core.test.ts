// F-005 Task-1: 受入基準 1・2・3・6・7・16(勝率の土台: β、事前の勝率、ステージ補正、S を計算できないときの 50.0%、F-001 の形式)
// F-005 Task-6: 受入基準 2・3・3b・7(マクロ項: マクロの点数 M、β_macro、レーン相対とマクロ相対の勝率、掛け合わせ)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  betaOf, computePriorWinrates, externalOf, macroOf, readExternalViews, MACRO_KEYS,
  type ExternalView, type MacroPart, type TierTeamS, type WinrateConfig, type WinrateOutput,
} from '../../src/winrate/core.ts';
import { simulate, validateWinTable, TEAMS, TIERS, type TeamId, type Tier } from '../../src/sim/index.ts';
import baseConfig from '../../src/winrate/config.json' with { type: 'json' };

// 仕様の計算の例(NEXT の4チームの S)。β = 0.35 ÷ 0.442 = 0.792、CC 対 DD の対数オッズ −0.341 → 41.5%
const EXAMPLE: Record<TeamId, number> = { CC: 5.285, DD: 5.716, IT: 4.972, LR: 5.188 };
// Task-6 のマクロの点数 M(自作の固定値)。6 組の差の二乗平均平方根 0.913 から β_macro = 0.25 ÷ 0.913 = 0.274
// CC 対 DD: レーン項 −0.341(41.5%)+ マクロ項 0.274 × (5.0 − 6.0) = −0.274(43.2%)→ 対数オッズ −0.615 → 35.1%
const EXAMPLE_M: Record<TeamId, number> = { CC: 5.0, DD: 6.0, IT: 4.5, LR: 5.5 };
const NO_MACRO_REASON = '3 つの軸の素点が無い';

type Given = Partial<Record<Tier, Partial<Record<TeamId, number | null>>>>;

function teams(S: Given, M: Given = {}): TierTeamS[] {
  const out: TierTeamS[] = [];
  for (const tier of TIERS) {
    for (const team of TEAMS) {
      const v = S[tier]?.[team];
      const m = M[tier]?.[team];
      const macro = m === undefined ? {} : m === null ? { M: null, macroReason: NO_MACRO_REASON } : { M: m };
      out.push(v === null ? { team, tier, S: null, reason: `評価の無い選手: ${team} の TOP`, ...macro } : { team, tier, S: v ?? 6.0, ...macro });
    }
  }
  return out;
}

const tenths = (p: number) => Math.round(p * 10);
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const parts = (synergy: number | null, shotcalling: number | null): MacroPart[] => [
  { key: 'synergy', label: '連携の厚み', raw: synergy },
  { key: 'shotcalling', label: '司令塔', raw: shotcalling },
];
// 外部の見立て(再判定 2)。NEXT: DD +強 +中 = 2.5、CC −弱 = −0.5、IT なし = 0、LR +強 ×3 = 4.5 → 3.0 に切り詰め
// 6 組の E の差の二乗平均平方根 2.483 から β_ext = 0.20 ÷ 2.483 = 0.081。CORE: DD +中 = 1.0、CC −強 ×3 → −3.0
const view = (target: string, direction: '+' | '-', strength: '強' | '中' | '弱', i = 0): ExternalView => ({
  target, direction, strength, speaker: `話者${i}`, speakerKind: 'analyst', summary: '見立て', source: `https://example.com/${i}`, date: '2026-10-10',
});
const VIEWS: ExternalView[] = [
  view('DD-NEXT', '+', '強', 1), view('DD-NEXT', '+', '中', 2), view('CC-NEXT', '-', '弱', 3),
  view('LR-NEXT', '+', '強', 4), view('LR-NEXT', '+', '強', 5), view('LR-NEXT', '+', '強', 6),
  view('DD-CORE', '+', '中', 7), view('CC-CORE', '-', '強', 8), view('CC-CORE', '-', '強', 9), view('CC-CORE', '-', '強', 10),
];
const nextMatch = (out: WinrateOutput, day: number, a: TeamId, b: TeamId) =>
  out.matches.find((x) => x.stage === 'regular' && x.day === day && x.tier === 'NEXT' && x.a === a && x.b === b);

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

// ---- F-005 Task-6: マクロ項 ----

test('用語: マクロの点数 M は連携の厚み・司令塔の 2 軸の素点の平均(小数第二位)。継続性は入れない。素点の無い軸は除き、すべて無ければ null と理由', () => {
  assert.deepEqual([...MACRO_KEYS], ['synergy', 'shotcalling']);
  assert.deepEqual(macroOf(parts(6.2, 5.0)), { M: 5.6, reason: null });
  assert.deepEqual(macroOf(parts(6.25, 5.0)), { M: 5.63, reason: null });
  assert.deepEqual(macroOf(parts(6.2, null)), { M: 6.2, reason: null });
  assert.deepEqual(macroOf(parts(null, 3)), { M: 3, reason: null });
  const none = macroOf(parts(null, null));
  assert.equal(none.M, null);
  assert.match(none.reason ?? '', /連携の厚み・司令塔/);
  assert.doesNotMatch(none.reason ?? '', /継続性/);
  assert.equal(macroOf([]).M, null);
  assert.match(macroOf([]).reason ?? '', /F-010/);
  // M を渡さず内訳(macroParts)だけを渡すと、勝率の計算が M を内訳から作り、内訳も勝率表に残す
  const given = teams({ NEXT: EXAMPLE }).map((t) => (t.team === 'CC' && t.tier === 'NEXT' ? { ...t, macroParts: parts(6.2, null) } : t));
  const out = computePriorWinrates(given);
  const cc = out.teams.find((t) => t.team === 'CC' && t.tier === 'NEXT');
  assert.equal(cc?.M, 6.2);
  assert.equal(cc?.macroReason, null);
  assert.deepEqual(cc?.macroParts, parts(6.2, null));
  const dd = out.teams.find((t) => t.team === 'DD' && t.tier === 'NEXT');
  assert.equal(dd?.M, null);
  assert.match(dd?.macroReason ?? '', /F-010/);
  assert.deepEqual(dd?.macroParts, []);
});

test('基準3: β_macro は同じ階級の 6 組の M の差の二乗平均平方根が macro.targetSd(初期値 0.25)になる値。差がすべて 0 なら 0', () => {
  assert.equal(baseConfig.macro.targetSd, 0.25);
  const out = computePriorWinrates(teams({ NEXT: EXAMPLE }, { NEXT: EXAMPLE_M }));
  assert.ok(Math.abs(out.betaMacro.NEXT - 0.274) < 0.0015, `β_macro ${out.betaMacro.NEXT}`);
  assert.match(out.betaMacroBasis.NEXT, /6 組/);
  assert.match(out.betaMacroBasis.NEXT, /0\.913/);
  assert.equal(out.betaMacro.CORE, 0);
  assert.equal(out.betaMacro.MASTERS, 0);
  assert.ok(Math.abs(out.beta.NEXT - 0.792) < 0.0015, 'β は従来のまま');
  const flat = computePriorWinrates(teams({ NEXT: EXAMPLE }, { NEXT: { CC: 5, DD: 5, IT: 5, LR: 5 } }));
  assert.equal(flat.betaMacro.NEXT, 0);
  const cfg = { ...baseConfig, macro: { targetSd: 0.5 } } as WinrateConfig;
  const twice = computePriorWinrates(teams({ NEXT: EXAMPLE }, { NEXT: EXAMPLE_M }), { config: cfg });
  assert.ok(Math.abs(twice.betaMacro.NEXT - 0.548) < 0.0025, `β_macro ${twice.betaMacro.NEXT}`);
});

test('基準2・3b: 対数オッズはレーン項 β × (S_A − S_B) とマクロ項 β_macro × (M_A − M_B) の和。p_lane・p_macro は 0.1% 単位で和が 100.0%、掛け合わせが勝率に一致する', () => {
  const out = computePriorWinrates(teams({ NEXT: EXAMPLE }, { NEXT: EXAMPLE_M }));
  const m = nextMatch(out, 1, 'CC', 'DD');
  assert.ok(m, 'CC 対 DD(NEXT・第1日)が無い');
  assert.equal(m.mA, 5.0);
  assert.equal(m.mB, 6.0);
  assert.equal(m.betaMacro, out.betaMacro.NEXT);
  assert.ok(Math.abs(m.laneLogit - -0.341) < 0.002, `レーン項 ${m.laneLogit}`);
  assert.ok(Math.abs(m.macroLogit - -0.274) < 0.002, `マクロ項 ${m.macroLogit}`);
  assert.ok(Math.abs(m.logit - -0.615) < 0.003, `対数オッズ ${m.logit}`);
  assert.equal(m.pLaneA, 41.5);
  assert.equal(m.pLaneB, 58.5);
  assert.equal(m.pMacroA, 43.2);
  assert.equal(m.pMacroB, 56.8);
  assert.equal(m.pA, 35.1);
  assert.equal(m.pB, 64.9);
  assert.equal(m.macroMissing, null);
  assert.equal(m.dataMissing, null);
  const m2 = nextMatch(out, 1, 'IT', 'LR');
  assert.ok(m2);
  assert.equal(m2.pLaneA, 45.7);
  assert.equal(m2.pMacroA, 43.2);
  assert.equal(m2.pA, 39.1);
  for (const x of out.matches) {
    assert.equal(tenths(x.pLaneA) + tenths(x.pLaneB), 1000, `${x.tier} ${x.a} vs ${x.b} の p_lane`);
    assert.equal(tenths(x.pMacroA) + tenths(x.pMacroB), 1000, `${x.tier} ${x.a} vs ${x.b} の p_macro`);
    assert.equal(tenths(x.pA) + tenths(x.pB), 1000, `${x.tier} ${x.a} vs ${x.b} の勝率`);
    const l = x.pLaneA / 100, g = x.pMacroA / 100;
    const combined = ((l * g) / (l * g + (1 - l) * (1 - g))) * 100;
    assert.ok(Math.abs(combined - x.pA) <= 0.1, `${x.tier} ${x.a} vs ${x.b}: 掛け合わせ ${combined} と勝率 ${x.pA}`);
    assert.ok(Math.abs(x.logit - r3(x.laneLogit + x.macroLogit + x.extLogit + x.stageTerm)) < 0.002, `${x.tier} ${x.a} vs ${x.b} の対数オッズの和`);
  }
  // 階級チームごとの M(小数第二位)と内訳
  const cc = out.teams.find((t) => t.team === 'CC' && t.tier === 'NEXT');
  assert.equal(cc?.M, 5.0);
  assert.equal(cc?.macroReason, null);
  // 基準7: 勝率表(winTable・stageWinTables)はこの対数オッズから作り、F-001 の検証に通る
  const get = validateWinTable(out.winTable);
  assert.ok(Math.abs(get('NEXT', 'CC', 'DD') - 0.351) < 1e-9);
  assert.ok(Math.abs(get('NEXT', 'DD', 'CC') - 0.649) < 1e-9);
  for (const stage of ['regular', 'masters', 'playoffs'] as const) validateWinTable(out.stageWinTables[stage]);
  assert.deepEqual(out.stageWinTables.regular, out.winTable);
});

test('基準3b: M を計算できない階級チームが関わる試合は p_macro を 50.0% とし理由を持つ。β_macro は M のあるチームだけから計算する', () => {
  const out = computePriorWinrates(teams({ NEXT: EXAMPLE }, { NEXT: { ...EXAMPLE_M, LR: null } }));
  assert.ok(Math.abs(out.betaMacro.NEXT - 0.231) < 0.0015, `β_macro ${out.betaMacro.NEXT}`);
  const lr = out.matches.filter((m) => m.tier === 'NEXT' && (m.a === 'LR' || m.b === 'LR'));
  assert.ok(lr.length > 0);
  for (const m of lr) {
    assert.equal(m.pMacroA, 50.0);
    assert.equal(m.pMacroB, 50.0);
    assert.equal(m.macroLogit, 0);
    assert.match(m.macroMissing ?? '', /LR-NEXT/);
    assert.match(m.macroMissing ?? '', new RegExp(NO_MACRO_REASON));
    assert.equal(m.pA, m.pLaneA);
    assert.equal(m.dataMissing, null);
  }
  const ccLr = nextMatch(out, 2, 'CC', 'LR');
  assert.ok(ccLr);
  assert.equal(ccLr.pA, 51.9);
  const ccDd = nextMatch(out, 1, 'CC', 'DD');
  assert.ok(ccDd);
  assert.equal(ccDd.macroMissing, null);
  assert.notEqual(ccDd.pMacroA, 50.0);
  const row = out.teams.find((t) => t.team === 'LR' && t.tier === 'NEXT');
  assert.equal(row?.M, null);
  assert.equal(row?.macroReason, NO_MACRO_REASON);
  // M を渡さない従来の入力では β_macro = 0、p_macro = 50.0%、勝率は従来のレーン項だけの値(後方互換)
  const none = computePriorWinrates(teams({ NEXT: EXAMPLE }));
  assert.equal(none.betaMacro.NEXT, 0);
  assert.ok(none.matches.every((m) => m.pMacroA === 50.0 && m.macroLogit === 0 && /F-010/.test(m.macroMissing ?? '')));
  assert.equal(nextMatch(none, 1, 'CC', 'DD')?.pA, 41.5);
  // S を計算できない試合は従来どおり 50.0%(p_lane・p_macro・p_external も 50.0%)
  const noS = computePriorWinrates(teams({ NEXT: { ...EXAMPLE, LR: null } }, { NEXT: EXAMPLE_M }), { externalViews: VIEWS });
  const x = nextMatch(noS, 2, 'CC', 'LR');
  assert.ok(x);
  assert.equal(x.pA, 50.0);
  assert.equal(x.pLaneA, 50.0);
  assert.equal(x.pMacroA, 50.0);
  assert.equal(x.pExtA, 50.0);
  assert.match(x.dataMissing ?? '', /データ不足/);
});

// ---- F-005 Task-6(再判定 2): 外部の見立ての項 ----

test('用語: 外部の見立て E は階級チームごとの Σ(向き × 強さの重み 強 1.5・中 1.0・弱 0.5)を ±clip(3.0)に切り詰めた値と件数。読み込みは形の違う項目を理由つきで除く', () => {
  // 2026-10-10: 外部の見立ての重みの既定値を 0.20 → 0.35(レーンの β と同等)に変更
  assert.deepEqual(baseConfig.external, { targetSd: 0.35, strength: { 強: 1.5, 中: 1.0, 弱: 0.5 }, clip: 3.0, selfTeam: 0.5 });
  const cfg = baseConfig.external;
  assert.deepEqual(externalOf(VIEWS, 'DD-NEXT', cfg), { E: 2.5, count: 2 });
  assert.deepEqual(externalOf(VIEWS, 'CC-NEXT', cfg), { E: -0.5, count: 1 });
  assert.deepEqual(externalOf(VIEWS, 'IT-NEXT', cfg), { E: 0, count: 0 });
  assert.deepEqual(externalOf(VIEWS, 'LR-NEXT', cfg), { E: 3.0, count: 3 });
  assert.deepEqual(externalOf(VIEWS, 'CC-CORE', cfg), { E: -3.0, count: 3 });
  assert.deepEqual(externalOf(VIEWS, 'DD-CORE', cfg), { E: 1.0, count: 1 });
  assert.deepEqual(externalOf(VIEWS, 'DD-NEXT', { ...cfg, clip: 2.0 }), { E: 2.0, count: 2 });
  // 話者の自チームについての項目(selfTeam: true)は × 0.5(評価設定 external.selfTeam)。1.5 + 1.5 × 0.5 − 1.0 = 1.25
  const own = [view('IT-NEXT', '+', '強', 11), { ...view('IT-NEXT', '+', '強', 12), selfTeam: true }, { ...view('IT-NEXT', '-', '中', 13), selfTeam: false }];
  // E は小数第一位(0.05 の端数は 0 から遠い側へ: 1.25 → 1.3、−0.25 → −0.3)
  assert.deepEqual(externalOf(own, 'IT-NEXT', cfg), { E: 1.3, count: 3 });
  assert.deepEqual(externalOf(own, 'IT-NEXT', { ...cfg, selfTeam: 1.0 }), { E: 2.0, count: 3 });
  assert.deepEqual(externalOf([{ ...view('LR-CORE', '-', '弱', 14), selfTeam: true }], 'LR-CORE', cfg), { E: -0.3, count: 1 });
  assert.deepEqual(externalOf([{ ...view('LR-CORE', '+', '弱', 15), selfTeam: true }], 'LR-CORE', cfg), { E: 0.3, count: 1 });
  const ownRead = readExternalViews({ kind: 'external-views', items: [{ ...VIEWS[0], selfTeam: true }, { ...VIEWS[1], selfTeam: 'yes' }] });
  assert.deepEqual(ownRead.items, [{ ...VIEWS[0], selfTeam: true }]);
  assert.equal(ownRead.errors.length, 1);
  assert.match(ownRead.errors[0], /selfTeam/);
  // ファイルの中身の検証: kind と items、target(階級チーム)・direction・strength
  const ok = readExternalViews({ kind: 'external-views', items: VIEWS });
  assert.deepEqual(ok, { items: VIEWS, errors: [] });
  const bad = readExternalViews({
    kind: 'external-views',
    items: [VIEWS[0], { ...VIEWS[1], target: 'ZZ-CORE' }, { ...VIEWS[2], direction: 'up' }, { ...VIEWS[3], strength: '最強' }, null],
  });
  assert.deepEqual(bad.items, [VIEWS[0]]);
  assert.equal(bad.errors.length, 4);
  assert.match(bad.errors[0], /items\[1\]/);
  assert.match(bad.errors[0], /ZZ-CORE/);
  assert.match(bad.errors[1], /direction/);
  assert.match(bad.errors[2], /strength/);
  assert.equal(readExternalViews({ kind: 'other', items: [] }).errors.length, 1);
  assert.equal(readExternalViews('text').errors.length, 1);
  assert.equal(readExternalViews({ kind: 'other', items: [] }).items.length, 0);
});

test('基準2・3: β_ext は 6 組の E の差の二乗平均平方根が external.targetSd になる値(数値例は 0.20 で検証)。対数オッズに β_ext × (E_A − E_B) を足し、p_macro はマクロ項と外部の見立ての項の和、p_external は外部の見立ての項だけの勝率', () => {
  const cfg020 = { ...baseConfig, external: { ...baseConfig.external, targetSd: 0.2 } } as WinrateConfig;
  const out = computePriorWinrates(teams({ NEXT: EXAMPLE }, { NEXT: EXAMPLE_M }), { config: cfg020, externalViews: VIEWS });
  assert.ok(Math.abs(out.betaExt.NEXT - 0.081) < 0.0015, `β_ext ${out.betaExt.NEXT}`);
  assert.match(out.betaExtBasis.NEXT, /6 組/);
  assert.match(out.betaExtBasis.NEXT, /2\.483/);
  assert.ok(Math.abs(out.betaExt.CORE - 0.082) < 0.0015, `β_ext ${out.betaExt.CORE}`);
  assert.equal(out.betaExt.MASTERS, 0);
  assert.ok(Math.abs(out.beta.NEXT - 0.792) < 0.0015);
  assert.ok(Math.abs(out.betaMacro.NEXT - 0.274) < 0.0015);
  const dd = out.teams.find((t) => t.key === 'DD-NEXT');
  assert.equal(dd?.E, 2.5);
  assert.equal(dd?.externalCount, 2);
  assert.equal(out.teams.find((t) => t.key === 'LR-NEXT')?.E, 3.0);
  assert.equal(out.teams.find((t) => t.key === 'IT-NEXT')?.externalCount, 0);
  const m = nextMatch(out, 1, 'CC', 'DD');
  assert.ok(m);
  assert.equal(m.eA, -0.5);
  assert.equal(m.eB, 2.5);
  assert.equal(m.betaExt, out.betaExt.NEXT);
  assert.ok(Math.abs(m.laneLogit - -0.341) < 0.002);
  assert.ok(Math.abs(m.macroLogit - -0.274) < 0.002);
  assert.ok(Math.abs(m.extLogit - -0.243) < 0.002, `外部の見立ての項 ${m.extLogit}`);
  assert.ok(Math.abs(m.logit - -0.858) < 0.003, `対数オッズ ${m.logit}`);
  assert.equal(m.pLaneA, 41.5);
  assert.equal(m.pExtA, 44.0);
  assert.equal(m.pExtB, 56.0);
  assert.equal(m.pMacroA, 37.4);
  assert.equal(m.pMacroB, 62.6);
  assert.equal(m.pA, 29.8);
  assert.equal(m.pB, 70.2);
  const m2 = nextMatch(out, 1, 'IT', 'LR');
  assert.ok(m2);
  assert.equal(m2.pExtA, 44.0);
  assert.equal(m2.pMacroA, 37.4);
  assert.equal(m2.pA, 33.4);
  // CORE は S が同じ(β = 0)で M が無いため、外部の見立ての項だけが効く
  const core = out.matches.find((x) => x.stage === 'regular' && x.day === 1 && x.tier === 'CORE' && x.a === 'CC' && x.b === 'DD');
  assert.ok(core);
  assert.equal(core.pLaneA, 50.0);
  assert.equal(core.macroLogit, 0);
  assert.ok(Math.abs(core.extLogit - -0.328) < 0.002);
  assert.equal(core.pExtA, 41.9);
  assert.equal(core.pMacroA, 41.9);
  assert.equal(core.pA, 41.9);
  // 全試合で、p_external の和は 100.0、掛け合わせ(p_lane × p_macro)が勝率に一致し、対数オッズは各項の和
  for (const x of out.matches) {
    assert.equal(tenths(x.pExtA) + tenths(x.pExtB), 1000, `${x.tier} ${x.a} vs ${x.b} の p_ext`);
    // p_macro はマクロ項と外部の見立ての項の和の勝率、p_ext は外部の見立ての項だけの勝率(対数オッズは 0.001 単位、勝率は 0.1% 単位の丸め)
    assert.ok(Math.abs(x.pMacroA - 100 / (1 + Math.exp(-(x.macroLogit + x.extLogit)))) <= 0.08, `${x.tier} ${x.a} vs ${x.b} の p_macro ${x.pMacroA}`);
    assert.ok(Math.abs(x.pExtA - 100 / (1 + Math.exp(-x.extLogit))) <= 0.08, `${x.tier} ${x.a} vs ${x.b} の p_ext ${x.pExtA}`);
    const l = x.pLaneA / 100, g = x.pMacroA / 100;
    const combined = ((l * g) / (l * g + (1 - l) * (1 - g))) * 100;
    assert.ok(Math.abs(combined - x.pA) <= 0.1, `${x.tier} ${x.a} vs ${x.b}: 掛け合わせ ${combined} と勝率 ${x.pA}`);
    assert.ok(Math.abs(x.logit - r3(x.laneLogit + x.macroLogit + x.extLogit + x.stageTerm)) < 0.002, `${x.tier} ${x.a} vs ${x.b} の対数オッズの和`);
  }
  assert.ok(Math.abs(validateWinTable(out.winTable)('NEXT', 'CC', 'DD') - 0.298) < 1e-9);
  // external.targetSd を 0.4 にすると β_ext は 0.20 のときの 2 倍
  const cfg = { ...baseConfig, external: { ...baseConfig.external, targetSd: 0.4 } } as WinrateConfig;
  const twice = computePriorWinrates(teams({ NEXT: EXAMPLE }, { NEXT: EXAMPLE_M }), { config: cfg, externalViews: VIEWS });
  assert.ok(Math.abs(twice.betaExt.NEXT - 0.161) < 0.0025, `β_ext ${twice.betaExt.NEXT}`);
});

test('基準3b: 外部の見立てのファイルが無い(項目を渡さない)ときは E = 0・件数 0・β_ext = 0 で、p_external は 50.0%、勝率は変わらない', () => {
  assert.deepEqual(readExternalViews(null), { items: [], errors: [] });
  assert.deepEqual(readExternalViews(undefined), { items: [], errors: [] });
  const out = computePriorWinrates(teams({ NEXT: EXAMPLE }, { NEXT: EXAMPLE_M }));
  assert.ok(out.teams.every((t) => t.E === 0 && t.externalCount === 0));
  for (const tier of TIERS) assert.equal(out.betaExt[tier], 0);
  assert.match(out.betaExtBasis.NEXT, /β_ext = 0/);
  assert.ok(out.matches.every((m) => m.pExtA === 50.0 && m.pExtB === 50.0 && m.extLogit === 0));
  const m = nextMatch(out, 1, 'CC', 'DD');
  assert.equal(m?.pMacroA, 43.2);
  assert.equal(m?.pA, 35.1);
  const same = computePriorWinrates(teams({ NEXT: EXAMPLE }, { NEXT: EXAMPLE_M }), { externalViews: [] });
  assert.deepEqual(same, out);
});
