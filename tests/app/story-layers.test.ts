// F-014 Task-7: 受入基準 31〜33(根拠の 2 層: レーン(個人)とマクロ(チーム)、外部の見立て)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computePriorWinrates, type MatchPrior, type TierTeamS } from '../../src/winrate/core.ts';
import { TEAMS, TIERS, type TeamId, type Tier } from '../../src/sim/index.ts';
import { REGULAR_DAYS } from '../../src/sim/schedule.ts';
import type { WinratesFile } from '../../src/app/sim/view.ts';
import { dayBox } from '../../src/app/schedule/view.ts';
import {
  EXTERNAL_MAX, MACRO_AXES, NO_EXTERNAL, externalItems, macroScore, matchStory, type PlayerLike, type StoryInput, type TeamEvalLike, type TierTeamLike,
} from '../../src/app/story/story.ts';

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
  axis('shotcalling', '司令塔', 6.558, 'コール力の最大 8.93 × 0.7 + 役の項 1 × 0.3'),
  // 再判定 5 で M から外した軸。素点があっても M と内訳に入れない
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
const CC_M = (6.522 + 6.558) / 2;
const DD_M = (5.1 + 5.0) / 2;
const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// 外部の見立ての記録(normalized/external-views.json)。CC-CORE に 4 件(新しい順で 3 件に絞られる)、DD-CORE に出典が URL でない 1 件、CC-NEXT に 1 件(対象外)
const view = (target: unknown, direction: string, strength: string, speaker: string, speakerKind: string, summary: string, source: string, date: string) => ({ target, direction, strength, speaker, speakerKind, summary, source, date });
const externalViews = {
  kind: 'external-views',
  items: [
    view('CC-CORE', '+', '強', '話者A', '元プロ', 'CC CORE は構成の完成度が高い', 'https://example.com/v1', '2026-10-01'),
    view('CC-CORE', '-', '弱', '話者B', '解説', '序盤の動きに迷いがある', 'https://example.com/v2', '2026-10-03'),
    view('CC-CORE', '+', '中', '話者C', '選手', '集団戦の連携が良い', 'https://example.com/v3', '2026-10-05'),
    view('CC-CORE', '+', '中', '話者D', '元プロ', '古い見立て', 'https://example.com/v4', '2026-09-20'),
    view('DD-CORE', '肯定', '中', '話者E', '解説', 'DD の見立て', 'docs/research/x.md', '2026-10-02'),
    view('CC-NEXT', '+', '強', '話者F', '解説', 'NEXT の見立て(対象外)', 'https://example.com/v5', '2026-10-02'),
  ],
};

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

test('基準33: 「マクロ(チーム)の相対勝率」の下の「うち外部の見立てだけなら <p_ext>%」は勝率表のファイルの p_ext(A から見た値)。無ければ null', () => {
  const s = matchStory({ ...input, pLane: 58.0, pMacro: 55.0, pExt: 52.0 }, ratings, teamEval);
  assert.ok(s.ok);
  assert.equal(s.layers.macro.pExt, '52.0');
  const n = matchStory({ ...input, pLane: 58.0, pMacro: 55.0 }, ratings, teamEval);
  assert.ok(n.ok);
  assert.equal(n.layers.macro.pExt, null);
});

test('用語: マクロの点数 M は連携の厚み・司令塔の 2 軸の素点の平均(継続性は入れない)。素点の無い軸は除いて平均し、すべて無ければ計算できない(null)', () => {
  assert.deepEqual(MACRO_AXES.map((a) => a.key), ['synergy', 'shotcalling']);
  assert.deepEqual(MACRO_AXES.map((a) => a.label), ['連携の厚み', '司令塔']);
  const cc = teamEval.tierTeams[0];
  assert.ok(Math.abs(macroScore(cc)! - CC_M) < 1e-12);
  const partial = { ...cc, axes: CC_AXES.filter((a) => a.key !== 'shotcalling') };
  assert.ok(Math.abs(macroScore(partial)! - 6.522) < 1e-12);
  const nullRaw = { ...cc, axes: CC_AXES.map((a) => (a.key === 'shotcalling' ? { ...a, raw: null } : a)) };
  assert.ok(Math.abs(macroScore(nullRaw)! - 6.522) < 1e-12);
  assert.equal(macroScore(teamEval.tierTeams[3]), null);
  // 継続性とピックの幅だけでは M を計算できない
  assert.equal(macroScore({ ...cc, axes: CC_AXES.filter((a) => a.key === 'continuity' || a.key === 'pool') }), null);
});

test('基準32: マクロ(チーム)の層は両チームの M(小数第二位)と 2 軸の素点(小数第二位)とチームの評価のファイルの各軸の理由。無い軸は「—」で理由は空', () => {
  const s = matchStory(input, ratings, teamEval);
  assert.ok(s.ok);
  assert.equal(s.layers.macro.M.a, CC_M.toFixed(2));
  assert.match(s.layers.macro.M.a, /^\d\.\d{2}$/);
  assert.equal(s.layers.macro.M.b, DD_M.toFixed(2));
  assert.deepEqual(s.layers.macro.parts.map((p) => p.key), ['synergy', 'shotcalling']);
  assert.deepEqual(s.layers.macro.parts.map((p) => p.label), ['連携の厚み', '司令塔']);
  assert.deepEqual(s.layers.macro.parts.map((p) => p.a), ['6.52', '6.56']);
  assert.deepEqual(s.layers.macro.parts.map((p) => p.b), ['5.10', '5.00']);
  assert.equal(s.layers.macro.parts[0].reasonA, '(連携 + 集団戦) ÷ 2 の平均 6.12 + 継続性の組 4 × 0.1');
  assert.equal(s.layers.macro.parts[1].reasonA, 'コール力の最大 8.93 × 0.7 + 役の項 1 × 0.3');
  assert.equal(s.layers.macro.parts[1].reasonB, 'DD の司令塔');
  // レーン(個人)の層は基準21 の表のまま(5 ロール+コーチ)
  assert.equal(s.rows.length, 6);
  // 軸の無い階級チーム(MASTERS の DD)は M と素点が「—」、理由は空。軸の名前は固定
  const m = matchStory({ tier: 'MASTERS', a: 'CC', b: 'DD', pA: 50, pB: 50 }, ratings, teamEval);
  assert.ok(m.ok);
  assert.equal(m.layers.macro.M.a, CC_M.toFixed(2));
  assert.equal(m.layers.macro.M.b, '—');
  assert.deepEqual(m.layers.macro.parts.map((p) => p.b), ['—', '—']);
  assert.deepEqual(m.layers.macro.parts.map((p) => p.reasonB), ['', '']);
  assert.deepEqual(m.layers.macro.parts.map((p) => p.label), ['連携の厚み', '司令塔']);
  // 勝率表のファイルの階級チームの M(F-005 基準 3b)があれば、M の表示はそれを優先する
  const g = matchStory({ ...input, teamA: { M: 5.5 }, teamB: {} }, ratings, teamEval);
  assert.ok(g.ok);
  assert.equal(g.layers.macro.M.a, '5.50');
  assert.equal(g.layers.macro.M.b, DD_M.toFixed(2));
});

test('基準33: 外部の見立ての項目は、記録の target がその階級チームに当たるものを新しい順に最大 3 件。向き・強さ・話者(種類)・要約・出典(https のときだけリンク)', () => {
  assert.equal(EXTERNAL_MAX, 3);
  const cc = externalItems(externalViews, 'CC', 'CORE');
  assert.equal(cc.length, 3);
  assert.deepEqual(cc.map((i) => i.date), ['2026-10-05', '2026-10-03', '2026-10-01']);
  assert.deepEqual(cc.map((i) => i.direction), ['肯定', '否定', '肯定']);
  assert.deepEqual(cc.map((i) => i.strength), ['中', '弱', '強']);
  assert.deepEqual(cc.map((i) => i.speaker), ['話者C', '話者B', '話者A']);
  assert.deepEqual(cc.map((i) => i.speakerKind), ['選手', '解説', '元プロ']);
  assert.equal(cc[0].summary, '集団戦の連携が良い');
  assert.equal(cc[0].url, 'https://example.com/v3');
  assert.equal(cc[0].source, 'https://example.com/v3');
  // 出典が URL でない記録はリンクを持たない。向きは「肯定」「否定」の表記も受ける
  const dd = externalItems(externalViews, 'DD', 'CORE');
  assert.equal(dd.length, 1);
  assert.equal(dd[0].url, null);
  assert.equal(dd[0].source, 'docs/research/x.md');
  assert.equal(dd[0].direction, '肯定');
  // 階級が違う記録は当たらない。target はオブジェクトの形({ team, tier })も受ける
  assert.equal(externalItems(externalViews, 'DD', 'NEXT').length, 0);
  assert.equal(externalItems({ items: [view({ team: 'IT', tier: 'MASTERS' }, '-', '強', 'x', '解説', 'y', 'https://example.com/z', '2026-10-01')] }, 'IT', 'MASTERS').length, 1);
  // 記録が無い・壊れているときは空
  assert.equal(externalItems(undefined, 'CC', 'CORE').length, 0);
  assert.equal(externalItems({ items: 'x' }, 'CC', 'CORE').length, 0);
  assert.equal(externalItems({ items: [{ target: 'CC-CORE' }] }, 'CC', 'CORE').length, 0);
});

test('基準33: マクロ(チーム)の層の外部の見立ては、両チームの E(符号つき小数第二位)と件数、記録の項目。記録が無いチームは「外部の見立ては記録なし」', () => {
  const s = matchStory({ ...input, teamA: { M: 6.54, E: 1.25, externalCount: 4 }, teamB: { E: -0.5, externalCount: 1 } }, ratings, teamEval, externalViews);
  assert.ok(s.ok);
  assert.equal(s.layers.macro.external.a.E, '+1.25');
  assert.equal(s.layers.macro.external.a.count, '4');
  assert.equal(s.layers.macro.external.a.items.length, 3);
  assert.equal(s.layers.macro.external.b.E, '-0.50');
  assert.equal(s.layers.macro.external.b.count, '1');
  assert.equal(s.layers.macro.external.b.items.length, 1);
  assert.equal(NO_EXTERNAL, '外部の見立ては記録なし');
  // E・件数の無い勝率表のファイルは「—」。記録のファイルが無ければ項目は空(表示は「外部の見立ては記録なし」)
  const n = matchStory(input, ratings, teamEval);
  assert.ok(n.ok);
  assert.equal(n.layers.macro.external.a.E, '—');
  assert.equal(n.layers.macro.external.a.count, '—');
  assert.deepEqual(n.layers.macro.external.a.items, []);
  assert.deepEqual(n.layers.macro.external.b.items, []);
  const z = matchStory({ ...input, teamA: { E: 0, externalCount: 0 } }, ratings, teamEval, externalViews);
  assert.ok(z.ok);
  assert.equal(z.layers.macro.external.a.E, '+0.00');
  assert.equal(z.layers.macro.external.a.count, '0');
});

test('基準31〜33(表示): 結論の直後に 3 行(両方そろうときだけ)と p_ext の添え書き、内訳は「レーン(個人)」と「マクロ(チーム)」の 2 層の見出し、外部の見立ての小節。β・対数オッズ・標準偏差の語は無い', () => {
  const svelte = src('../../src/app/story/MatchStory.svelte').replace(/<style[\s\S]*<\/style>/, '');
  const iHead = svelte.indexOf('{story.headline}');
  const iLane = svelte.indexOf('レーン(個人)の相対勝率');
  const iMacro = svelte.indexOf('マクロ(チーム)の相対勝率');
  const iExt = svelte.indexOf('うち外部の見立てだけなら');
  const iComb = svelte.indexOf('掛け合わせた試合の勝率');
  assert.ok(iHead > 0 && iLane > iHead && iMacro > iLane && iExt > iMacro && iComb > iExt, '3 行は結論の直後にこの順。p_ext の添え書きはマクロの行の下');
  assert.match(svelte, /\{#if story\.layers\.lane\.p !== null && story\.layers\.macro\.p !== null\}/);
  assert.match(svelte, /\{#if story\.layers\.macro\.pExt !== null\}/);
  assert.match(svelte, /story\.layers\.macro\.pExt\}%/);
  const iLaneTitle = svelte.indexOf('>レーン(個人)<');
  const iTable = svelte.indexOf('<table class="breakdown"');
  const iMacroTitle = svelte.indexOf('>マクロ(チーム)<');
  const iExtTitle = svelte.indexOf('外部の見立て(元プロ・解説)');
  assert.ok(iComb < iLaneTitle && iLaneTitle < iTable && iTable < iMacroTitle && iMacroTitle < iExtTitle, '層の見出しは「レーン(個人)」→ 基準21 の表 →「マクロ(チーム)」→ 外部の見立ての順');
  assert.match(svelte, /マクロの点数 M/);
  assert.match(svelte, /story\.layers\.macro\.M\.a/);
  assert.match(svelte, /story\.layers\.macro\.parts/);
  assert.match(svelte, /\.reasonA/);
  assert.match(svelte, /\.reasonB/);
  assert.match(svelte, /story\.layers\.macro\.external/);
  assert.match(svelte, /外部の見立ては記録なし/);
  assert.match(svelte, /loadExternalViews\(\)/);
  for (const w of ['β', '対数オッズ', '標準偏差']) assert.ok(!svelte.includes(w), `MatchStory に ${w}`);
  const data = src('../../src/app/story/data.ts');
  assert.match(data, /export function loadExternalViews/);
  assert.match(data, /docs\/research\/grounds\/normalized\/external-views\.json/);
  const s = matchStory({ ...input, pLane: 58.0, pMacro: 55.0, pExt: 52.0, teamA: { M: 6.54, E: 1.25, externalCount: 4 } }, ratings, teamEval, externalViews);
  const text = JSON.stringify(s);
  for (const w of ['β', '対数オッズ', '標準偏差']) assert.ok(!text.includes(w), w);
});

// 勝率表のファイル。F-005 基準 3b の項目(pLaneA・pMacroA・pExtA、teams[].M・E・externalCount)を Day 1 と CC-CORE・IT-CORE にだけ付ける
const S: Record<Tier, Record<TeamId, number>> = {
  NEXT: { DD: 5.7, CC: 5.3, IT: 5.0, LR: 5.2 },
  CORE: { DD: 6.0, CC: 6.8, IT: 6.5, LR: 6.2 },
  MASTERS: { DD: 7.1, CC: 6.8, IT: 6.6, LR: 6.7 },
};
const teams: TierTeamS[] = TIERS.flatMap((tier) => TEAMS.map((team) => ({ team, tier, S: S[tier][team] })));
const base = computePriorWinrates(teams);
type Layered = MatchPrior & { pLaneA?: number; pLaneB?: number; pMacroA?: number; pMacroB?: number; pExtA?: number; pExtB?: number };
const file: WinratesFile = {
  ...base,
  matches: base.matches.map((m): Layered => (m.stage === 'regular' && m.day === 1 ? { ...m, pLaneA: 58.0, pLaneB: 42.0, pMacroA: 55.0, pMacroB: 45.0, pExtA: 52.0, pExtB: 48.0 } : m)),
  teams: base.teams.map((t) => (t.team === 'CC' && t.tier === 'CORE' ? { ...t, M: 6.54, E: 1.25, externalCount: 4 } : t.team === 'IT' && t.tier === 'CORE' ? { ...t, E: -0.5 } : t)),
  computedAt: '2026-10-10T10:00:00.000Z',
  configVersion: 'abcdef012345',
  results: null,
};

test('基準31・33(日程の箱): 行は勝率表のファイルの試合の pLaneA・pMacroA・pExtA(ブルー側の値)と、階級チームの M・E・件数を持ち、無ければ undefined', () => {
  const day1 = dayBox(file, { kind: 'regular', day: 1, date: REGULAR_DAYS[0].date });
  const rows1 = day1.boxes.flatMap((b) => b.rows);
  assert.equal(rows1.length, 4);
  for (const r of rows1) {
    assert.equal(r.pLane, 58.0);
    assert.equal(r.pMacro, 55.0);
    assert.equal(r.pExt, 52.0);
  }
  const day2 = dayBox(file, { kind: 'regular', day: 2, date: REGULAR_DAYS[1].date });
  const rows2 = day2.boxes.flatMap((b) => b.rows);
  assert.equal(rows2.length, 4);
  for (const r of rows2) {
    assert.equal(r.pLane, undefined);
    assert.equal(r.pMacro, undefined);
    assert.equal(r.pExt, undefined);
  }
  const core = [...rows1, ...rows2].filter((r) => r.tier === 'CORE').flatMap((r) => [r.blue, r.red]);
  assert.deepEqual(core.find((x) => x.team === 'CC')!.layer, { M: 6.54, E: 1.25, externalCount: 4 });
  assert.deepEqual(core.find((x) => x.team === 'IT')!.layer, { E: -0.5 });
  assert.equal(core.find((x) => x.team === 'DD')!.layer, undefined);
  assert.equal([...rows1, ...rows2].filter((r) => r.tier === 'NEXT').flatMap((r) => [r.blue, r.red]).find((x) => x.team === 'CC')!.layer, undefined);
});

test('基準31〜33(日程の箱): 行から根拠の節へ pLane・pMacro・pExt と両チームの層の値を渡す', () => {
  const svelte = src('../../src/app/schedule/DayBox.svelte');
  const m = /<MatchStory input=\{\{([^}]*)\}\}/.exec(svelte);
  assert.ok(m, 'MatchStory の input');
  for (const k of ['pA: r.blue.pNum', 'pB: r.red.pNum', 'pLane: r.pLane', 'pMacro: r.pMacro', 'pExt: r.pExt', 'teamA: r.blue.layer', 'teamB: r.red.layer']) assert.ok(m![1].includes(k), k);
});
