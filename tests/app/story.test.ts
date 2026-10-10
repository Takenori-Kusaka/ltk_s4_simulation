// F-014 Task-4: 受入基準 19〜25(試合の根拠のストーリー)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROSTER } from '../../src/data/roster.ts';
import teamConfig from '../../src/team/config.json' with { type: 'json' };
import { playerOverall } from '../../src/team/strength.ts';
import type { PlayerRating } from '../../src/rating/build.ts';
import {
  COACH_SHARE, EVEN, EXCLUDED, INCLUDED, PLAYER_SHARE, SIZE_BIG, SIZE_MID, matchStory, overallOf, positiveEvidence, sizeOf, type PlayerLike, type StoryInput, type TeamEvalLike,
} from '../../src/app/story/story.ts';

const KEYS: [string, string][] = [
  ['ground', '地力'], ['laning', 'レーン戦'], ['teamfight', '集団戦'], ['synergy', '連携'], ['stability', '安定感'], ['pool', 'ピックプール'], ['shotcalling', 'コール力'], ['tournament', '大会経験'],
];
const W = (teamConfig as { roleWeights: Record<string, number> }).roleWeights;

function player(id: string, base: number, overrides: Record<string, number> = {}, evidence: { text: string; source?: string }[] = []): PlayerLike {
  const name = ROSTER.find((p) => p.id === id)?.name ?? id;
  return {
    playerId: id,
    name,
    axes: KEYS.map(([key, label]) => ({ key, label, display: overrides[key] ?? base, ...(key === 'shotcalling' ? { evidence: { evidence } } : {}) })),
  };
}

// CC-CORE と DD-CORE の合成の評価。JG と MID に差を付ける
const CC = { TOP: 6.0, JG: 7.4, MID: 7.0, ADC: 5.5, SUP: 6.2 };
const DD = { TOP: 6.3, JG: 5.2, MID: 6.0, ADC: 5.8, SUP: 6.0 };
const JG_EVIDENCE = [
  { text: '肯定・弱・選手としてのコール: 配信で味方へ集合の指示を出していた', source: 'https://example.com/a' },
  { text: '否定・中・選手としてのコール: 任せる側だと言った', source: 'https://example.com/b' },
  { text: '肯定・強・他ゲームの IGL: 別のゲームで IGL を務めていた', source: 'https://example.com/c' },
  { text: '肯定・中・選手としてのコール: チームメイトがコールを褒めた', source: 'https://example.com/d' },
  { text: '肯定・強・選手としてのコール: 出典が https でない', source: 'http://example.com/e' },
];
const players: PlayerLike[] = [
  ...(['TOP', 'JG', 'MID', 'ADC', 'SUP'] as const).map((r) => player(`CC-CORE-${r}`, CC[r], r === 'JG' ? { shotcalling: 9.5, stability: 7.0 } : {}, r === 'JG' ? JG_EVIDENCE : [])),
  ...(['TOP', 'JG', 'MID', 'ADC', 'SUP'] as const).map((r) => player(`DD-CORE-${r}`, DD[r])),
  ...(['TOP', 'JG', 'MID', 'ADC', 'SUP'] as const).map((r) => player(`CC-MASTERS-${r}`, 7.0)),
  ...(['TOP', 'JG', 'MID', 'ADC', 'SUP'] as const).map((r) => player(`DD-MASTERS-${r}`, 7.0)),
];
const O = (id: string) => overallOf(players.find((p) => p.playerId === id)!);
const S = (team: 'CC' | 'DD', tier: 'CORE' | 'MASTERS', C: number | null) => {
  const sum = (['TOP', 'JG', 'MID', 'ADC', 'SUP'] as const).reduce((s, r) => s + W[r] * O(`${team}-${tier}-${r}`), 0);
  return tier === 'MASTERS' ? sum : PLAYER_SHARE * sum + COACH_SHARE * (C ?? 0);
};
const teamEval: TeamEvalLike = {
  tierTeams: [
    { team: 'CC', tier: 'CORE', S: S('CC', 'CORE', 7.2), coachC: 7.2, coachId: 'CC-MASTERS-MID', coaching: { coach: { name: 'Ceros' } } },
    { team: 'DD', tier: 'CORE', S: S('DD', 'CORE', 5.0), coachC: 5.0, coachId: 'DD-MASTERS-SUP', coaching: { coach: { name: 'hetel' } } },
    { team: 'CC', tier: 'MASTERS', S: S('CC', 'MASTERS', null), coachC: null, coachId: null },
    { team: 'DD', tier: 'MASTERS', S: S('DD', 'MASTERS', null), coachC: null, coachId: null },
  ],
};
const ratings = { kind: 'ratings', players };
const input: StoryInput = { tier: 'CORE', a: 'CC', b: 'DD', pA: 63.9, pB: 36.1 };

test('用語: 選手の総合 O は F-010 の playerOverall と同じ式', () => {
  const p = players[1];
  assert.ok(Math.abs(overallOf(p) - playerOverall(p as unknown as PlayerRating)) < 1e-12);
});

test('基準21: 内訳の行は 5 ロール+コーチ(MASTERS はロールだけ)。寄与は戦力 S の式の項の差で、合計が S の差に一致し、絶対値の大きい順', () => {
  const s = matchStory(input, ratings, teamEval);
  assert.ok(s.ok);
  assert.equal(s.rows.length, 6);
  const sum = s.rows.reduce((a, r) => a + r.contribution, 0);
  const sa = teamEval.tierTeams[0].S, sb = teamEval.tierTeams[1].S;
  assert.ok(Math.abs(sum - (sa - sb)) < 1e-9, `寄与の和 ${sum} と S の差 ${sa - sb}`);
  for (let i = 1; i < s.rows.length; i++) assert.ok(Math.abs(s.rows[i - 1].contribution) >= Math.abs(s.rows[i].contribution));
  const jg = s.rows.find((r) => r.key === 'JG')!;
  assert.ok(Math.abs(jg.contribution - PLAYER_SHARE * W.JG * (O('CC-CORE-JG') - O('DD-CORE-JG'))) < 1e-12);
  assert.equal(jg.left.name, ROSTER.find((p) => p.id === 'CC-CORE-JG')!.name);
  assert.equal(jg.left.score, O('CC-CORE-JG').toFixed(1));
  assert.equal(jg.diff, (O('CC-CORE-JG') - O('DD-CORE-JG')).toFixed(1));
  assert.equal(jg.left.href, '#/player/CC-CORE-JG');
  assert.equal(jg.compareHref, '#/compare/CC-CORE-JG/DD-CORE-JG');
  // 差の絶対値が最大の 2 軸(JG はコール力 9.5 vs 5.2、次に地力などの 7.4 vs 5.2 の軸)
  assert.equal(jg.axes.length, 2);
  assert.equal(jg.axes[0].label, 'コール力');
  assert.equal(jg.axes[0].left, '9.5');
  assert.equal(jg.axes[0].right, '5.2');
  const coach = s.rows.find((r) => r.key === 'COACH')!;
  assert.equal(coach.left.name, 'Ceros');
  assert.ok(Math.abs(coach.contribution - COACH_SHARE * (7.2 - 5.0)) < 1e-12);
  assert.equal(coach.axes.length, 0);
  const m = matchStory({ tier: 'MASTERS', a: 'CC', b: 'DD', pA: 50, pB: 50 }, ratings, teamEval);
  assert.ok(m.ok);
  assert.equal(m.rows.length, 5);
  assert.ok(m.rows.every((r) => r.key !== 'COACH'));
});

test('用語: 寄与の大きさの境界(0.10 以上 大、0.04 以上 中、それ未満 小)', () => {
  assert.equal(SIZE_BIG, 0.1);
  assert.equal(SIZE_MID, 0.04);
  assert.equal(sizeOf(0.1), '大');
  assert.equal(sizeOf(-0.1), '大');
  assert.equal(sizeOf(0.0999), '中');
  assert.equal(sizeOf(0.04), '中');
  assert.equal(sizeOf(0.0399), '小');
});

test('基準20: 結論の一文は有利なチームと勝率、寄与の上位 2 つの項。S の差が 0.10 未満なら「ほぼ互角」', () => {
  const s = matchStory(input, ratings, teamEval);
  assert.ok(s.ok);
  assert.equal(s.favored, 'CC');
  assert.equal(s.even, false);
  assert.match(s.headline, /^Camellia Crown が有利\(63\.9%\)。いちばんの差は /);
  assert.match(s.headline, new RegExp(`${s.rows[0].label}: ${s.rows[0].left.name} ${s.rows[0].left.score} vs ${s.rows[0].right.name} ${s.rows[0].right.score}`));
  assert.match(s.headline, /、次に /);
  assert.equal(EVEN, 0.1);
  const close: TeamEvalLike = { tierTeams: teamEval.tierTeams.map((t) => (t.team === 'DD' && t.tier === 'CORE' ? { ...t, S: teamEval.tierTeams[0].S - 0.05 } : t)) };
  const e = matchStory({ ...input, pA: 50.6, pB: 49.4 }, ratings, close);
  assert.ok(e.ok);
  assert.equal(e.even, true);
  assert.match(e.headline, /^ほぼ互角/);
});

test('基準22: 上位 2 つの項の両側の人について、出典つきの肯定の根拠を強さの順に最大 2 件。無ければ空', () => {
  const items = positiveEvidence(players.find((p) => p.playerId === 'CC-CORE-JG'));
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((i) => i.strength), ['強', '中']);
  assert.equal(items[0].kind, '他ゲームの IGL');
  assert.equal(items[0].text, '別のゲームで IGL を務めていた');
  assert.equal(items[0].source, 'https://example.com/c');
  const s = matchStory(input, ratings, teamEval);
  assert.ok(s.ok);
  const ids = s.evidence.map((e) => e.id);
  assert.equal(ids.length, 4);
  assert.ok(ids.includes('CC-CORE-JG'));
  assert.ok(s.evidence.find((e) => e.id === 'DD-CORE-JG')!.items.length === 0);
  assert.equal(positiveEvidence(undefined).length, 0);
});

test('基準23・24: 固定の文(入っているもの・入っていないもの)があり、β・対数オッズ・標準偏差の語が無い', () => {
  const s = matchStory(input, ratings, teamEval);
  assert.ok(s.ok);
  assert.deepEqual(s.included, INCLUDED);
  assert.deepEqual(s.excluded, EXCLUDED);
  assert.ok(INCLUDED.some((t) => /コーチ/.test(t)));
  assert.ok(EXCLUDED.some((x) => /チームの仕上がり/.test(x.text) && /F-005/.test(x.feature)));
  assert.ok(EXCLUDED.some((x) => /結果/.test(x.text) && /F-004/.test(x.feature)));
  const text = JSON.stringify(s);
  for (const w of ['β', '対数オッズ', '標準偏差']) assert.ok(!text.includes(w), w);
  const svelte = readFileSync(new URL('../../src/app/story/MatchStory.svelte', import.meta.url), 'utf8').replace(/<style[\s\S]*<\/style>/, '');
  for (const w of ['β', '対数オッズ', '標準偏差']) assert.ok(!svelte.includes(w), `MatchStory に ${w}`);
  assert.match(svelte, /出典つきの根拠は見当たらない/);
  assert.match(svelte, /根拠を出せる材料がありません/);
});

test('基準25: 評価のファイルやチームの評価が無い、または S を計算できないときは理由つきで表を出さない', () => {
  const a = matchStory(input, undefined, teamEval);
  assert.ok(!a.ok && /ratings\.json/.test(a.reason));
  const b = matchStory(input, ratings, undefined);
  assert.ok(!b.ok && /team-evaluation\.json/.test(b.reason));
  const c = matchStory({ ...input, b: 'IT' }, ratings, teamEval);
  assert.ok(!c.ok && /IT-CORE/.test(c.reason) && /S/.test(c.reason));
});

test('基準19: 日程の箱の行はボタンで aria-expanded を持ち、その直下に根拠の節を開く', () => {
  const src = readFileSync(new URL('../../src/app/schedule/DayBox.svelte', import.meta.url), 'utf8');
  assert.match(src, /<button[^>]*class="row-btn"/);
  assert.match(src, /aria-expanded=/);
  assert.match(src, /<MatchStory/);
  const iBtn = src.indexOf('<button');
  const iStory = src.indexOf('<MatchStory');
  assert.ok(iBtn > 0 && iStory > iBtn);
});
