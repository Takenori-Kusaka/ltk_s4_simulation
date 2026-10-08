// F-002 Task-1: 受入基準 2・4・6・7・11
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER } from '../../src/data/roster.ts';
import { validatePlayerFile } from '../../src/data/validate.ts';
import type { PlayerFile } from '../../src/data/types.ts';
import { AXES, scorePlayer, tierRadar, teamRadar, tierAverage, rankToScore } from '../../src/score/index.ts';

const ev = (value: number | string) => ({
  value,
  source: 'https://example.invalid/test',
  retrievedAt: '2026-10-08',
  confidence: '高' as const,
  author: { kind: 'human' as const },
});
const qual = (score: number) => ({
  score,
  rationale: 'テスト用の根拠',
  sources: ['docs/research/players-dd-cc.md'],
  author: { kind: 'human' as const },
});
const fullFile = (id: string): PlayerFile => ({
  playerId: id,
  metrics: {
    soloRank: ev('DIAMOND II 50'),
    peakRank: ev('MASTER I 200'),
    kda: ev(3.2),
    csPerMin: ev(7.5),
    killParticipation: ev(0.55),
    damageShare: ev(0.25),
    ltkGames: ev(16),
    ltkWinRate: ev(0.6),
    championPoolSize: ev(12),
  },
  qualitative: { laning: qual(6), teamfight: qual(7), shotcalling: qual(5), metaFit: qual(6) },
  recentMatches: [],
});

test('前提: 名簿は公式発表の60名(4チーム × 3階級 × 5ロール)', () => {
  assert.equal(ROSTER.length, 60);
  assert.equal(new Set(ROSTER.map((p) => p.id)).size, 60);
  assert.equal(ROSTER.find((p) => p.team === 'LR' && p.tier === 'NEXT' && p.role === 'SUP')?.name, 'No.1005');
});

test('5軸は大会向け5軸', () => {
  assert.deepEqual(AXES.map((a) => a.label), ['個人技量', 'レーン戦', 'チームファイト', 'コール・大会経験', 'プールとメタ適合']);
});

test('AC2: 各軸は 0〜10 で、同じ入力から同じ点数を返す', () => {
  const p = ROSTER[0];
  const a = scorePlayer(p, fullFile(p.id));
  const b = scorePlayer(p, fullFile(p.id));
  assert.deepEqual(a, b);
  for (const axis of a.axes) {
    assert.ok(axis.score !== null && axis.score >= 0 && axis.score <= 10, axis.key);
  }
});

test('AC2: 点数は指標と採点規則から計算され、根拠に使った指標と重みを返す', () => {
  const p = ROSTER[0];
  const s = scorePlayer(p, fullFile(p.id));
  const skill = s.axes.find((x) => x.key === 'skill')!;
  assert.ok(skill.components.length > 0);
  for (const c of skill.components) {
    assert.equal(typeof c.weight, 'number');
    assert.ok('source' in c && 'retrievedAt' in c);
  }
});

test('AC2: ランクが高いほど個人技量が高い', () => {
  const p = ROSTER[0];
  const lo = fullFile(p.id);
  lo.metrics.soloRank = ev('GOLD IV 0');
  const hi = fullFile(p.id);
  hi.metrics.soloRank = ev('CHALLENGER I 1500');
  const sk = (f: PlayerFile) => scorePlayer(p, f).axes.find((x) => x.key === 'skill')!.score!;
  assert.ok(sk(hi) > sk(lo));
  assert.ok(rankToScore('CHALLENGER I 1500') > rankToScore('MASTER I 0'));
  assert.ok(rankToScore('MASTER I 0') > rankToScore('DIAMOND I 99'));
  assert.ok(rankToScore('IRON IV 0') >= 0);
});

test('AC4: 軸の指標がすべて無いと、その軸は 0 ではなく null(データなし)', () => {
  const p = ROSTER[0];
  const f = fullFile(p.id);
  delete f.metrics.championPoolSize;
  delete f.qualitative.metaFit;
  const pool = scorePlayer(p, f).axes.find((x) => x.key === 'pool')!;
  assert.equal(pool.score, null);
});

test('AC4: 一部の指標だけ無いときは、ある指標で計算し、欠けた指標の名前を返す', () => {
  const p = ROSTER[0];
  const f = fullFile(p.id);
  delete f.metrics.kda;
  const skill = scorePlayer(p, f).axes.find((x) => x.key === 'skill')!;
  assert.notEqual(skill.score, null);
  assert.deepEqual(skill.missing, ['kda']);
});

const tierScores = (vals: Record<string, number>) =>
  Object.fromEntries(Object.entries(vals).map(([team, v]) => [team, AXES.map(() => v)]));

test('AC6: 階級の相対評価は 5.0 + 2.0 × 標準化した値を 0〜10 に切り詰める', () => {
  // 4チームの平均 5, 標準偏差(母集団)= sqrt(5) ≈ 2.236
  const r = tierRadar(tierScores({ DD: 2, CC: 4, IT: 6, LR: 8 }));
  const sd = Math.sqrt(5);
  assert.ok(Math.abs(r.DD[0]! - (5 + (2 * (2 - 5)) / sd)) < 1e-9);
  assert.ok(Math.abs(r.LR[0]! - (5 + (2 * (8 - 5)) / sd)) < 1e-9);
  const extreme = tierRadar(tierScores({ DD: 0, CC: 10, IT: 10, LR: 10 }));
  assert.ok(extreme.DD[0]! >= 0 && extreme.CC[0]! <= 10);
});

test('AC6: 4チームが同じ点数なら全チーム 5.0', () => {
  const r = tierRadar(tierScores({ DD: 7, CC: 7, IT: 7, LR: 7 }));
  for (const t of ['DD', 'CC', 'IT', 'LR']) assert.equal(r[t][0], 5);
});

test('AC6: 階級の平均は、データなしの選手を除いた5選手の平均を使う', () => {
  const players = ROSTER.filter((p) => p.team === 'DD' && p.tier === 'CORE');
  const files = players.map((p) => fullFile(p.id));
  delete files[0].metrics.championPoolSize;
  delete files[0].qualitative.metaFit;
  const scored = players.map((p, i) => scorePlayer(p, files[i]));
  const avg = (scored.slice(1).reduce((s, x) => s + x.axes[4].score!, 0)) / 4;
  assert.ok(Math.abs(tierAverage(scored)[4]! - avg) < 1e-9);
});

test('AC7: チーム全体は3階級の相対評価の平均', () => {
  const byTier = {
    NEXT: { DD: [4, 4, 4, 4, 4] },
    CORE: { DD: [6, 6, 6, 6, 6] },
    MASTERS: { DD: [8, 8, 8, 8, 8] },
  };
  assert.deepEqual(teamRadar(byTier, 'DD'), [6, 6, 6, 6, 6]);
});

test('AC11: 型に合わない指標ファイルは、選手と項目名を含むエラーを返す', () => {
  const bad = fullFile('DD-CORE-TOP') as unknown as Record<string, any>;
  bad.metrics.kda = { value: 3.2, source: '', retrievedAt: '2026-10-08', confidence: '高', author: { kind: 'human' } };
  const errs = validatePlayerFile(bad);
  assert.ok(errs.some((e) => e.includes('DD-CORE-TOP') && e.includes('kda')));
});

test('AC11: 根拠の文章の無い定性の評価と、範囲外の点数はエラー', () => {
  const bad = fullFile('DD-CORE-TOP') as unknown as Record<string, any>;
  bad.qualitative.laning = { score: 6, rationale: '', sources: [], author: { kind: 'human' } };
  bad.qualitative.teamfight = { score: 11, rationale: 'x', sources: ['y'], author: { kind: 'human' } };
  const errs = validatePlayerFile(bad);
  assert.ok(errs.some((e) => e.includes('laning')));
  assert.ok(errs.some((e) => e.includes('teamfight')));
});

test('AC11: 名簿に無い選手のファイルと、playerId の無いファイルはエラー', () => {
  assert.ok(validatePlayerFile({ ...fullFile('XX-CORE-TOP') }).some((e) => e.includes('XX-CORE-TOP')));
  assert.ok(validatePlayerFile({}).length > 0);
});

test('AC11: 正しいファイルはエラーなし', () => {
  assert.deepEqual(validatePlayerFile(fullFile('DD-CORE-TOP')), []);
});
