// F-002 の QA 指摘(2026-10-08)の再発防止。受入基準 1・3・4・5・11 の違反として再現したもの
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER } from '../../src/data/roster.ts';
import type { PlayerFile } from '../../src/data/types.ts';
import { validatePlayerFile } from '../../src/data/validate.ts';
import { rankToScore, scorePlayer } from '../../src/score/index.ts';
import { formatScore, parseRoute, playerView, radarLabelAnchor, pageTitle } from '../../src/app/lib/index.ts';
import { teamView } from '../../src/app/team/view.ts';

const ev = (value: number | string) => ({
  value,
  source: 'https://example.invalid/x',
  retrievedAt: '2026-10-08',
  confidence: '高' as const,
  author: { kind: 'human' as const },
});
const base = (id = 'DD-CORE-MID'): PlayerFile => ({
  playerId: id,
  metrics: { soloRank: ev('DIAMOND II 30'), kda: ev(3) },
  qualitative: {},
  recentMatches: [],
});

test('H1 / AC11: 数値の指標に文字列が入っていたら、選手と項目名つきのエラー', () => {
  const f = base();
  f.metrics.kda = ev('abc');
  const errs = validatePlayerFile(f);
  assert.ok(errs.some((e) => e.includes('DD-CORE-MID') && e.includes('kda')), errs.join('\n'));
});

test('H1 / AC1: NaN や無限大は点数として表示しない', () => {
  assert.equal(formatScore(Number.NaN), 'データなし');
  assert.equal(formatScore(Number.POSITIVE_INFINITY), 'データなし');
});

test('H2 / AC11: 解釈できないランクの文字列は、選手と項目名つきのエラー', () => {
  for (const bad of ['ダイヤモンド2', 'DIAMOND', 'DIAMOND V 10', 'GOLDEN I 0']) {
    const f = base();
    f.metrics.soloRank = ev(bad);
    const errs = validatePlayerFile(f);
    assert.ok(errs.some((e) => e.includes('soloRank')), `${bad}: ${errs.join(' / ')}`);
  }
  for (const ok of ['GOLD IV 0', 'MASTER I 320', 'GRANDMASTER 900', 'CHALLENGER I 1500', 'UNRANKED']) {
    const f = base();
    f.metrics.soloRank = ev(ok);
    assert.deepEqual(validatePlayerFile(f), [], ok);
  }
});

test('H2 / AC4: 未ランク(UNRANKED)は 0 点ではなく、その指標が無いものとして扱う', () => {
  assert.equal(rankToScore('UNRANKED'), null);
  const p = ROSTER.find((x) => x.id === 'DD-CORE-MID')!;
  const f = base();
  f.metrics.soloRank = ev('UNRANKED');
  const skill = scorePlayer(p, f).axes.find((a) => a.key === 'skill')!;
  assert.ok(skill.missing.includes('soloRank'));
  assert.ok(!skill.components.some((c) => c.metric === 'soloRank'));
});

test('M7 / AC3: 定性の評価の取得日を根拠に出す', () => {
  const p = ROSTER.find((x) => x.id === 'DD-CORE-MID')!;
  const f = base();
  f.qualitative.teamfight = { score: 7, rationale: '集団戦の判断が早い', sources: ['docs/research/x.md'], retrievedAt: '2026-10-07', author: { kind: 'human' } };
  const tf = playerView(p, f).axes.find((a) => a.label === 'チームファイト')!;
  assert.equal(tf.components.find((c) => c.metric === 'teamfight')!.retrievedAt, '2026-10-07');
});

test('M7 / AC11: 定性の評価の取得日は YYYY-MM-DD でなければエラー', () => {
  const f = base();
  f.qualitative.teamfight = { score: 7, rationale: 'x', sources: ['y'], retrievedAt: '昨日', author: { kind: 'human' } };
  assert.ok(validatePlayerFile(f).some((e) => e.includes('teamfight')));
});

test('M4: 小文字の ID と末尾の / や ? は正しい画面へ、不正な経路は「見つからない」', () => {
  assert.deepEqual(parseRoute('#/player/dd-core-mid'), { page: 'player', id: 'DD-CORE-MID' });
  assert.deepEqual(parseRoute('#/team/dd/'), { page: 'team', team: 'DD' });
  assert.deepEqual(parseRoute('#/player/CC-CORE-ADC?x=1'), { page: 'player', id: 'CC-CORE-ADC' });
  assert.deepEqual(parseRoute('#/team/ZZ'), { page: 'notfound', hash: '#/team/ZZ' });
  assert.deepEqual(parseRoute('#/player/XX-CORE-TOP'), { page: 'notfound', hash: '#/player/XX-CORE-TOP' });
  assert.deepEqual(parseRoute(''), { page: 'home' });
  assert.deepEqual(parseRoute('#/'), { page: 'home' });
});

test('M1: レーダーのラベルは左右の軸で外側へ寄せ、点と重ならない', () => {
  assert.equal(radarLabelAnchor(0), 'middle');
  assert.equal(radarLabelAnchor(40), 'start');
  assert.equal(radarLabelAnchor(-40), 'end');
});

test('L1 / AC5: チームの階級に指標ファイルの無い選手がいれば、その人数を返す', () => {
  const files: Record<string, PlayerFile> = {};
  for (const p of ROSTER) if (p.id !== 'IT-CORE-SUP') files[p.id] = { ...base(p.id) };
  const core = teamView('IT', files).radars.find((r) => r.label === 'CORE')!;
  assert.equal(core.excluded, 1);
  assert.equal(teamView('IT', files).radars.find((r) => r.label === 'NEXT')!.excluded, 0);
});

test('L2: 画面ごとに文書の題名を変える', () => {
  assert.match(pageTitle({ page: 'player', id: 'CC-CORE-ADC' }), /龍巻ちせ/);
  assert.match(pageTitle({ page: 'team', team: 'IT' }), /Iris Tiara/);
  assert.match(pageTitle({ page: 'notfound', hash: '#/x' }), /見つかりません/);
  assert.match(pageTitle({ page: 'home' }), /Season Finale/);
});
