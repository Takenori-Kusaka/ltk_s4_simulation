// F-002 Task-2: 受入基準 1・3・4・8・10(画面の論理部分。Svelte の部品はこの結果を描くだけ)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROSTER } from '../../src/data/roster.ts';
import type { PlayerFile } from '../../src/data/types.ts';
import { formatScore, radarGeometry, playerView, placeholderAvatar, parseRoute, emptyPlayerFile } from '../../src/app/lib/index.ts';

const ev = (value: number | string) => ({
  value,
  source: 'https://example.invalid/src',
  retrievedAt: '2026-10-08',
  confidence: '高' as const,
  author: { kind: 'riot-api' as const },
});
const p = ROSTER.find((x) => x.id === 'CC-CORE-ADC')!;
const file = (): PlayerFile => ({
  playerId: p.id,
  metrics: { soloRank: ev('MASTER I 446'), kda: ev(3.8) },
  qualitative: { teamfight: { score: 7.25, rationale: '集団戦の位置取りが安定', sources: ['docs/research/players-dd-cc.md'], author: { kind: 'human' } } },
  recentMatches: [],
});

test('AC1: 点数は 0.0〜10.0 の範囲で小数第一位まで表示する', () => {
  assert.equal(formatScore(7.25), '7.3');
  assert.equal(formatScore(7), '7.0');
  assert.equal(formatScore(0), '0.0');
  assert.equal(formatScore(10), '10.0');
  assert.equal(formatScore(12), '10.0');
  assert.equal(formatScore(-1), '0.0');
});

test('AC1: 選手のページは選手名・チーム・階級・ロールと5軸を持つ', () => {
  const v = playerView(p, file());
  assert.equal(v.name, '龍巻ちせ');
  assert.equal(v.team, 'CC');
  assert.equal(v.tier, 'CORE');
  assert.equal(v.role, 'ADC');
  assert.equal(v.axes.length, 5);
  for (const a of v.axes) assert.match(a.display, /^(\d{1,2}\.\d|データなし)$/);
});

test('AC3: 軸の根拠に、使った指標の値・重み・出典・取得日を含める', () => {
  const skill = playerView(p, file()).axes.find((a) => a.label === '個人技量')!;
  const solo = skill.components.find((c) => c.metric === 'soloRank')!;
  assert.equal(solo.raw, 'MASTER I 446');
  assert.equal(typeof solo.weight, 'number');
  assert.equal(solo.source, 'https://example.invalid/src');
  assert.equal(solo.retrievedAt, '2026-10-08');
  const tf = playerView(p, file()).axes.find((a) => a.label === 'チームファイト')!;
  assert.equal(tf.components.find((c) => c.metric === 'teamfight')!.rationale, '集団戦の位置取りが安定');
});

test('AC4: 指標がすべて無い軸は「データなし」と表示する', () => {
  const pool = playerView(p, file()).axes.find((a) => a.label === 'プールとメタ適合')!;
  assert.equal(pool.display, 'データなし');
  assert.equal(pool.score, null);
});

test('AC4: レーダーでは欠損の軸を中心(0)に置かず、欠損として区別する', () => {
  const g = radarGeometry([5, null, 10, 0, 2.5], 100);
  assert.deepEqual(g.missing, [1]);
  assert.equal(g.points[1], null);
  // 0 点の軸は中心に置く(欠損とは別)
  assert.deepEqual(g.points[3], { x: 100, y: 100 });
  // 10 点は外周(半径 = size × 0.8)
  const top = g.points[2]!;
  assert.ok(Math.abs(Math.hypot(top.x - 100, top.y - 100) - 80) < 1e-9);
  // 多角形は欠損の軸を飛ばした点だけで作る
  assert.equal(g.polygon.split(' ').length, 4);
  assert.equal(g.outline.length, 5);
});

test('AC4: 指標ファイルが無い選手は、全軸データなしで表示できる', () => {
  const v = playerView(p, emptyPlayerFile(p.id));
  assert.ok(v.axes.every((a) => a.display === 'データなし'));
});

test('AC8: 公開版の立ち絵は、ロールのアイコンと名前の頭文字の代替表示', () => {
  const a = placeholderAvatar(p);
  assert.equal(a.initial, '龍');
  assert.equal(a.role, 'ADC');
  assert.ok(a.roleIcon.length > 0);
  assert.match(a.color, /^#[0-9a-f]{6}$/i);
});

test('AC8: リポジトリの配信物の元(src・public・index.html)に立ち絵の画像を含めない', () => {
  const walk = (d: string): string[] =>
    existsSync(d) ? readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)])) : [];
  const files = [...walk('src'), ...walk('public')];
  assert.deepEqual(files.filter((f) => /\.(png|jpe?g|webp|gif|avif)$/i.test(f)), []);
  assert.doesNotMatch(readFileSync('index.html', 'utf8'), /<img/i);
});

test('AC1: ハッシュから画面を選ぶ(選手のページと一覧)', () => {
  assert.deepEqual(parseRoute('#/player/CC-CORE-ADC'), { page: 'player', id: 'CC-CORE-ADC' });
  assert.deepEqual(parseRoute(''), { page: 'home' });
  // 不正な経路は「見つからない」を案内する(QA 指摘 M4。2026-10-08 に価値責任者が保留を解いて変更を承認)
  assert.deepEqual(parseRoute('#/unknown'), { page: 'notfound', hash: '#/unknown' });
});

test('AC10: スマホ幅で横スクロールを起こす固定幅を CSS に置かない', () => {
  const css = readFileSync('src/app/app.css', 'utf8');
  // 360px を超える固定の width / min-width を禁止(max-width は可)
  // メディアクエリの条件(@media (min-width: 900px))は固定幅ではないので除く
  const rules = css.replace(/@media[^{]*/g, '');
  for (const m of rules.matchAll(/(?<!max-)(?:min-)?width:\s*(\d+)px/g)) assert.ok(Number(m[1]) <= 360, m[0]);
  assert.match(css, /max-width:\s*100%/);
});

test('総合値はデータのある軸の平均で、全軸データなしなら null', async () => {
  const { overallScore } = await import('../../src/app/lib/index.ts');
  assert.equal(overallScore([4, null, 8, null, 6]), 6);
  assert.equal(overallScore([null, null]), null);
});

test('開幕までの日数(2026-10-15 JST)', async () => {
  const { daysUntilOpening } = await import('../../src/app/lib/index.ts');
  assert.equal(daysUntilOpening(new Date('2026-10-08T12:00:00+09:00')), 7);
  assert.equal(daysUntilOpening(new Date('2026-10-20T00:00:00+09:00')), 0);
});

test('AC3: 根拠の指標は日本語の名前で表示する', () => {
  const skill = playerView(p, file()).axes.find((a) => a.label === '個人技量')!;
  assert.equal(skill.components.find((c) => c.metric === 'soloRank')!.label, '現在ランク(ソロ)');
});

test('4チームの意匠(名前・花・色)を持つ', async () => {
  const { TEAM_INFO } = await import('../../src/app/lib/index.ts');
  assert.deepEqual(Object.keys(TEAM_INFO), ['DD', 'CC', 'IT', 'LR']);
  assert.equal(TEAM_INFO.IT.name, 'Iris Tiara');
});
