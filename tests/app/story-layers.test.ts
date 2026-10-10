// F-014 Task-7: 受入基準 31・32(根拠の 2 層: レーン(個人)とマクロ(チーム))
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computePriorWinrates, type MatchPrior, type TierTeamS } from '../../src/winrate/core.ts';
import { TEAMS, TIERS, type TeamId, type Tier } from '../../src/sim/index.ts';
import { REGULAR_DAYS } from '../../src/sim/schedule.ts';
import type { WinratesFile } from '../../src/app/sim/view.ts';
import { dayBox } from '../../src/app/schedule/view.ts';
import { MACRO_AXES, macroScore, matchStory, type PlayerLike, type StoryInput, type TeamEvalLike, type TierTeamLike } from '../../src/app/story/story.ts';

const KEYS: [string, string][] = [
  ['ground', '地力'], ['laning', 'レーン戦'], ['teamfight', '集団戦'], ['synergy', '連携'], ['stability', '安定感'], ['pool', 'ピックプール'], ['shotcalling', 'コール力'], ['tournament', '大会経験'],
];
const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'] as const;
const player = (id: string, base: number): PlayerLike => ({ playerId: id, name: id, axes: KEYS.map(([key, label]) => ({ key, label, display: base })) });
const players: PlayerLike[] = [...ROLES.map((r) => player(`CC-CORE-${r}`, 7.0)), ...ROLES.map((r) => player(`DD-CORE-${r}`, 6.0))];
const ratings = { kind: 'ratings', players };

// チームの評価のファイル(team-evaluation.json)の軸(F-010)。raw が素点、display は相対評価の後の値(2 層の表示には使わない)
const axis = (key: string, label: string, raw: number | null, reason: string) => ({ key, label, raw, display: 5, confidence: '低', reason });
const CC_AXES = [
  axis('power', '戦力', 6.8, '選手の部分 × 0.85 + コーチ × 0.15'),
  axis('synergy', '連携の厚み', 6.522, '(連携 + 集団戦) ÷ 2 の平均 6.12 + 継続性の組 4 × 0.1'),
  axis('shotcalling', '司令塔', 6.551, 'コール力の最大 8.93 × 0.7 + 役の項 1 × 0.3'),
  axis('continuity', '継続性', 4, '過去の LTK で同じシーズン・チーム・階級だった組 4 / 10'),
  axis('pool', 'ピックの幅', 3.5, 'ピックプールの平均'),
];
const DD_AXES = [axis('synergy', '連携の厚み', 5.1, 'DD の連携'), axis('shotcalling', '司令塔', 5.0, 'DD の司令塔'), axis('continuity', '継続性', 2, 'DD の継続性')];
const tierTeam = (team: string, tier: string, S: number, axes: TierTeamLike['axes']): TierTeamLike => ({ team, tier, S, coachC: 6.0, coachId: null, axes });
const teamEval: TeamEvalLike = {
  tierTeams: [
    tierTeam('CC', 'CORE', 6.8, CC_AXES),
    tierTeam('DD', 'CORE', 6.0, DD_AXES),
    tierTeam('CC', 'MASTERS', 7.0, CC_AXES),
    // 軸の無い階級チーム
    tierTeam('DD', 'MASTERS', 7.0, undefined),
  ],
};
const input: StoryInput = { tier: 'CORE', a: 'CC', b: 'DD', pA: 63.9, pB: 36.1 };
const CC_M = (6.522 + 6.551 + 4) / 3;
const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('基準31: 結論の直後の 3 行は、勝率表のファイルのレーン相対・マクロ相対の勝率(A から見た値)と試合の勝率 pA(0.1% 単位)。無い勝率表では null', () => {
  const s = matchStory({ ...input, pLane: 58.0, pMacro: 55.0 }, ratings, teamEval);
  assert.ok(s.ok);
  assert.equal(s.layers.lane.p, '58.0');
  assert.equal(s.layers.macro.p, '55.0');
  assert.equal(s.layers.combined.p, '63.9');
  const t = matchStory({ ...input, pLane: 50, pMacro: 50, pA: 50, pB: 50 }, ratings, teamEval);
  assert.ok(t.ok);
  assert.deepEqual([t.layers.lane.p, t.layers.macro.p, t.layers.combined.p], ['50.0', '50.0', '50.0']);
  // p_lane・p_macro の無い勝率表のファイル(F-005 Task-6 より前の形)
  const n = matchStory(input, ratings, teamEval);
  assert.ok(n.ok);
  assert.equal(n.layers.lane.p, null);
  assert.equal(n.layers.macro.p, null);
  assert.equal(n.layers.combined.p, '63.9');
  // 数でない値はその行だけ null
  const h = matchStory({ ...input, pLane: 58.0, pMacro: Number.NaN }, ratings, teamEval);
  assert.ok(h.ok);
  assert.equal(h.layers.lane.p, '58.0');
  assert.equal(h.layers.macro.p, null);
});

test('用語: マクロの点数 M は連携の厚み・司令塔・継続性の素点の平均。素点の無い軸は除いて平均し、すべて無ければ計算できない(null)', () => {
  assert.deepEqual(MACRO_AXES.map((a) => a.key), ['synergy', 'shotcalling', 'continuity']);
  assert.deepEqual(MACRO_AXES.map((a) => a.label), ['連携の厚み', '司令塔', '継続性']);
  const cc = teamEval.tierTeams[0];
  assert.ok(Math.abs(macroScore(cc)! - CC_M) < 1e-12);
  const partial = { ...cc, axes: CC_AXES.filter((a) => a.key !== 'continuity') };
  assert.ok(Math.abs(macroScore(partial)! - (6.522 + 6.551) / 2) < 1e-12);
  const nullRaw = { ...cc, axes: CC_AXES.map((a) => (a.key === 'continuity' ? { ...a, raw: null } : a)) };
  assert.ok(Math.abs(macroScore(nullRaw)! - (6.522 + 6.551) / 2) < 1e-12);
  assert.equal(macroScore(teamEval.tierTeams[3]), null);
  assert.equal(macroScore({ ...cc, axes: [CC_AXES[0], CC_AXES[4]] }), null);
});

test('基準32: マクロ(チーム)の層は両チームの M(小数第二位)と 3 軸の素点(小数第二位)とチームの評価のファイルの各軸の理由。無い軸は「—」で理由は空', () => {
  const s = matchStory(input, ratings, teamEval);
  assert.ok(s.ok);
  assert.equal(s.layers.macro.M.a, CC_M.toFixed(2));
  assert.equal(s.layers.macro.M.a, '5.69');
  assert.equal(s.layers.macro.M.b, '4.03');
  assert.deepEqual(s.layers.macro.parts.map((p) => p.key), ['synergy', 'shotcalling', 'continuity']);
  assert.deepEqual(s.layers.macro.parts.map((p) => p.label), ['連携の厚み', '司令塔', '継続性']);
  assert.deepEqual(s.layers.macro.parts.map((p) => p.a), ['6.52', '6.55', '4.00']);
  assert.deepEqual(s.layers.macro.parts.map((p) => p.b), ['5.10', '5.00', '2.00']);
  assert.equal(s.layers.macro.parts[0].reasonA, '(連携 + 集団戦) ÷ 2 の平均 6.12 + 継続性の組 4 × 0.1');
  assert.equal(s.layers.macro.parts[1].reasonA, 'コール力の最大 8.93 × 0.7 + 役の項 1 × 0.3');
  assert.equal(s.layers.macro.parts[2].reasonB, 'DD の継続性');
  // レーン(個人)の層は基準21 の表のまま(5 ロール+コーチ)
  assert.equal(s.rows.length, 6);
  // 軸の無い階級チーム(MASTERS の DD)は M と素点が「—」、理由は空。軸の名前は固定
  const m = matchStory({ tier: 'MASTERS', a: 'CC', b: 'DD', pA: 50, pB: 50 }, ratings, teamEval);
  assert.ok(m.ok);
  assert.equal(m.layers.macro.M.a, '5.69');
  assert.equal(m.layers.macro.M.b, '—');
  assert.deepEqual(m.layers.macro.parts.map((p) => p.b), ['—', '—', '—']);
  assert.deepEqual(m.layers.macro.parts.map((p) => p.reasonB), ['', '', '']);
  assert.deepEqual(m.layers.macro.parts.map((p) => p.label), ['連携の厚み', '司令塔', '継続性']);
  // 勝率表のファイルの階級チームの M(F-005 基準 3b)があれば、M の表示はそれを優先する。null は無いものとして扱う
  const g = matchStory({ ...input, mA: 5.5, mB: null }, ratings, teamEval);
  assert.ok(g.ok);
  assert.equal(g.layers.macro.M.a, '5.50');
  assert.equal(g.layers.macro.M.b, '4.03');
});

test('基準31・32(表示): 結論の直後に 3 行(両方そろうときだけ)、内訳は「レーン(個人)」と「マクロ(チーム)」の 2 層の見出し。β・対数オッズ・標準偏差の語は無い', () => {
  const svelte = src('../../src/app/story/MatchStory.svelte').replace(/<style[\s\S]*<\/style>/, '');
  const iHead = svelte.indexOf('{story.headline}');
  const iLane = svelte.indexOf('レーン(個人)の相対勝率');
  const iMacro = svelte.indexOf('マクロ(チーム)の相対勝率');
  const iComb = svelte.indexOf('掛け合わせた試合の勝率');
  assert.ok(iHead > 0 && iLane > iHead && iMacro > iLane && iComb > iMacro, '3 行は結論の直後にこの順');
  assert.match(svelte, /\{#if story\.layers\.lane\.p !== null && story\.layers\.macro\.p !== null\}/);
  const iLaneTitle = svelte.indexOf('>レーン(個人)<');
  const iTable = svelte.indexOf('<table class="breakdown"');
  const iMacroTitle = svelte.indexOf('>マクロ(チーム)<');
  assert.ok(iComb < iLaneTitle && iLaneTitle < iTable && iTable < iMacroTitle, '層の見出しは「レーン(個人)」→ 基準21 の表 →「マクロ(チーム)」の順');
  assert.match(svelte, /マクロの点数 M/);
  assert.match(svelte, /story\.layers\.macro\.M\.a/);
  assert.match(svelte, /story\.layers\.macro\.parts/);
  assert.match(svelte, /\.reasonA/);
  assert.match(svelte, /\.reasonB/);
  for (const w of ['β', '対数オッズ', '標準偏差']) assert.ok(!svelte.includes(w), `MatchStory に ${w}`);
  const s = matchStory({ ...input, pLane: 58.0, pMacro: 55.0 }, ratings, teamEval);
  const text = JSON.stringify(s);
  for (const w of ['β', '対数オッズ', '標準偏差']) assert.ok(!text.includes(w), w);
});

// 勝率表のファイル。F-005 基準 3b の項目(pLane・pMacro・teams[].M)を Day 1 と CC-CORE にだけ付ける
const S: Record<Tier, Record<TeamId, number>> = {
  NEXT: { DD: 5.7, CC: 5.3, IT: 5.0, LR: 5.2 },
  CORE: { DD: 6.0, CC: 6.8, IT: 6.5, LR: 6.2 },
  MASTERS: { DD: 7.1, CC: 6.8, IT: 6.6, LR: 6.7 },
};
const teams: TierTeamS[] = TIERS.flatMap((tier) => TEAMS.map((team) => ({ team, tier, S: S[tier][team] })));
const base = computePriorWinrates(teams);
type Layered = MatchPrior & { pLane?: number; pMacro?: number };
const file: WinratesFile = {
  ...base,
  matches: base.matches.map((m): Layered => (m.stage === 'regular' && m.day === 1 ? { ...m, pLane: 58.0, pMacro: 55.0 } : m)),
  teams: base.teams.map((t) => (t.team === 'CC' && t.tier === 'CORE' ? { ...t, M: 5.69 } : t)),
  computedAt: '2026-10-10T10:00:00.000Z',
  configVersion: 'abcdef012345',
  results: null,
};

test('基準31(日程の箱): 行は勝率表のファイルの試合の pLane・pMacro と階級チームの M を持ち、無ければ undefined', () => {
  const day1 = dayBox(file, { kind: 'regular', day: 1, date: REGULAR_DAYS[0].date });
  const rows1 = day1.boxes.flatMap((b) => b.rows);
  assert.equal(rows1.length, 4);
  for (const r of rows1) {
    assert.equal(r.pLane, 58.0);
    assert.equal(r.pMacro, 55.0);
  }
  const day2 = dayBox(file, { kind: 'regular', day: 2, date: REGULAR_DAYS[1].date });
  const rows2 = day2.boxes.flatMap((b) => b.rows);
  assert.equal(rows2.length, 4);
  for (const r of rows2) {
    assert.equal(r.pLane, undefined);
    assert.equal(r.pMacro, undefined);
  }
  const sides = [...rows1, ...rows2].filter((r) => r.tier === 'CORE').flatMap((r) => [r.blue, r.red]);
  assert.equal(sides.find((x) => x.team === 'CC')!.M, 5.69);
  assert.equal(sides.find((x) => x.team === 'DD')!.M, undefined);
  assert.equal([...rows1, ...rows2].filter((r) => r.tier === 'NEXT').flatMap((r) => [r.blue, r.red]).find((x) => x.team === 'CC')!.M, undefined);
});

test('基準31・32(日程の箱): 行から根拠の節へ pLane・pMacro と両チームの M を渡す', () => {
  const svelte = src('../../src/app/schedule/DayBox.svelte');
  const m = /<MatchStory input=\{\{([^}]*)\}\}/.exec(svelte);
  assert.ok(m, 'MatchStory の input');
  for (const k of ['pA: r.blue.pNum', 'pB: r.red.pNum', 'pLane: r.pLane', 'pMacro: r.pMacro', 'mA: r.blue.M', 'mB: r.red.M']) assert.ok(m![1].includes(k), k);
});
