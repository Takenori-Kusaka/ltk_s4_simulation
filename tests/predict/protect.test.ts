// F-006 Task-2: 受入基準 4・4b・5・9(プロテクト候補と軸にする選手・理由、BAN 候補、F-005 へ渡す NEXT の予想の出力)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPickConfig, pickCandidates } from '../../src/predict/picks.ts';
import { protectCandidates, protectValue, ROLE_WEIGHTS } from '../../src/predict/protect.ts';
import { banCandidates } from '../../src/predict/bans.ts';
import { nextDraftForecast, NEXT_DRAFT_KIND } from '../../src/predict/next-draft.ts';
import type { PlayerPool } from '../../src/meta/match.ts';
import type { MetaGuide } from '../../src/meta/load.ts';
import { main } from '../../src/collect/aggregate-cli.ts';

const guide = {
  kind: 'meta-guide', patch: '26.20', updatedAt: '2026-10-09', ddragonVersion: '16.20.1', idSource: 'x', basisLegend: {},
  chapters: [],
  champions: [
    { role: 'MID', key: 103, id: 'Ahri', name: 'アーリ', tier: 'A', basis: ['P'], reason: { text: 't', url: 'https://example.com' } },
    { role: 'JG', key: 64, id: 'LeeSin', name: 'リー・シン', tier: 'B', basis: ['P'], reason: { text: 't', url: 'https://example.com' } },
  ],
} as unknown as MetaGuide;

const pool = (playerId: string, role: PlayerPool['role'], list: PlayerPool['list']): PlayerPool => ({ playerId, name: playerId, team: 'CC', tier: 'NEXT', role, list });
const e = (championId: number, games: number, winRate = 0.5) => ({ championId, games, winRate });

/** 狭い選手のいないチーム: MID のアーリ(段階A)が最大、次は JG のリー・シン(段階B) */
const WIDE = [
  pool('CC-NEXT-TOP', 'TOP', [e(1, 10), e(2, 5), e(3, 4)]),
  pool('CC-NEXT-JG', 'JG', [e(64, 10), e(5, 6), e(6, 3)]),
  pool('CC-NEXT-MID', 'MID', [e(103, 10), e(8, 6), e(9, 3)]),
  pool('CC-NEXT-ADC', 'ADC', [e(10, 10), e(11, 5), e(12, 3)]),
  pool('CC-NEXT-SUP', 'SUP', [e(13, 10), e(14, 5), e(15, 3)]),
];

test('プロテクトの値 = 見込みの値 × ロールの重み × (1 + 0.5 × メタの重要度)', () => {
  assert.deepEqual(ROLE_WEIGHTS, { MID: 0.24, JG: 0.21, SUP: 0.21, TOP: 0.17, ADC: 0.17 });
  const cfg = loadPickConfig();
  const c = pickCandidates(WIDE[2], guide, cfg).candidates[0];
  assert.equal(c.championId, 103);
  assert.ok(Math.abs(protectValue(c, 'MID', cfg) - c.value * 0.24 * 1.5) < 1e-12);
});

test('AC4: 狭い選手がいなければ、プロテクトの値の降順で軸にする選手が異なる2体を選び、相手が BAN しそうな1体は値の大きい方', () => {
  const r = protectCandidates(WIDE, guide);
  assert.deepEqual(r.protects.map((p) => [p.championId, p.playerId]), [[103, 'CC-NEXT-MID'], [64, 'CC-NEXT-JG']]);
  assert.ok(r.protects[0].protectValue >= r.protects[1].protectValue);
  assert.equal(r.likelyBan, 103);
  assert.equal(r.narrowPlayerId, null);
});

test('AC4: 同じ選手の2体目より、別の選手の最大を選ぶ(MID の2体目は選ばない)', () => {
  const team = WIDE.map((p) => (p.role === 'MID' ? pool('CC-NEXT-MID', 'MID', [e(103, 10), e(8, 10, 0.9), e(9, 3)]) : p));
  const r = protectCandidates(team, guide);
  assert.equal(new Set(r.protects.map((p) => p.playerId)).size, 2);
});

test('AC4: ピックプールが狭い選手(2体以下)がいれば、その選手の2体を守る。0体の選手は狭い選手に数えない', () => {
  const team = WIDE.map((p) =>
    p.role === 'SUP' ? pool('CC-NEXT-SUP', 'SUP', [e(13, 4), e(14, 3)]) : p.role === 'ADC' ? pool('CC-NEXT-ADC', 'ADC', []) : p,
  );
  const r = protectCandidates(team, guide);
  assert.equal(r.narrowPlayerId, 'CC-NEXT-SUP');
  assert.deepEqual(r.protects.map((p) => [p.championId, p.playerId]), [[13, 'CC-NEXT-SUP'], [14, 'CC-NEXT-SUP']]);
});

test('AC4: 狭い選手が複数なら最大のプロテクトの値を持つ選手、その選手のプールが1体なら残りは他の選手の最大', () => {
  const team = WIDE.map((p) =>
    p.role === 'SUP' ? pool('CC-NEXT-SUP', 'SUP', [e(13, 4), e(14, 3)]) : p.role === 'MID' ? pool('CC-NEXT-MID', 'MID', [e(103, 10)]) : p,
  );
  const r = protectCandidates(team, guide);
  assert.equal(r.narrowPlayerId, 'CC-NEXT-MID');
  assert.deepEqual(r.protects.map((p) => [p.championId, p.playerId]), [[103, 'CC-NEXT-MID'], [64, 'CC-NEXT-JG']]);
});

test('AC4: 別の選手が同じチャンピオンを持っていても、同じチャンピオンを2回守らない', () => {
  const team = WIDE.map((p) => (p.role === 'JG' ? pool('CC-NEXT-JG', 'JG', [e(103, 10), e(64, 9)]) : p));
  const r = protectCandidates(team, guide);
  assert.equal(new Set(r.protects.map((p) => p.championId)).size, 2);
});

test('AC4b: 理由は試合数・縮小した勝率・メタの段階・プロテクトの値。狭い選手の2体を選んだときはその旨を示す', () => {
  const wide = protectCandidates(WIDE, guide).protects[0];
  assert.match(wide.reason, /10 試合/);
  assert.match(wide.reason, /勝率 50%/);
  assert.match(wide.reason, /段階A/);
  assert.match(wide.reason, /プロテクトの値 0\.\d{3}/);
  const team = WIDE.map((p) => (p.role === 'SUP' ? pool('CC-NEXT-SUP', 'SUP', [e(13, 4), e(14, 3)]) : p));
  const narrow = protectCandidates(team, guide).protects;
  assert.ok(narrow.every((p) => /ピックプールが 2 体と狭いため、この選手の2体を守る/.test(p.reason)));
});

test('AC4: 守れるチャンピオンが足りなければ、足りない枠の数を返す', () => {
  const team = WIDE.map((p) => pool(p.playerId, p.role, p.role === 'MID' ? [e(103, 3)] : []));
  const r = protectCandidates(team, guide);
  assert.equal(r.protects.length, 1);
  assert.equal(r.missing, 1);
  assert.equal(r.likelyBan, 103);
});

test('AC5: BAN 候補は、相手の5人の上位3体の見込みの値をチャンピオンごとに合計した降順の上位5体', () => {
  const cfg = loadPickConfig();
  const picks = WIDE.map((p) => pickCandidates(p, guide, cfg));
  const bans = banCandidates(picks);
  assert.equal(bans.length, 5);
  const sums = new Map<number, number>();
  for (const pl of picks) for (const c of pl.candidates) sums.set(c.championId, (sums.get(c.championId) ?? 0) + c.value);
  const want = [...sums.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 5).map(([id]) => id);
  assert.deepEqual(bans.map((b) => b.championId), want);
  assert.ok(bans.every((b, i) => i === 0 || bans[i - 1].value >= b.value));
});

test('AC5: NEXT の試合では、相手のプロテクト候補のうち BAN できない1体を除く(BAN できる1体は残す)', () => {
  const cfg = loadPickConfig();
  const picks = WIDE.map((p) => pickCandidates(p, guide, cfg));
  const prot = protectCandidates(WIDE, guide);
  const unbannable = prot.protects.find((p) => p.championId !== prot.likelyBan)!.championId;
  const bans = banCandidates(picks, prot);
  assert.ok(!bans.some((b) => b.championId === unbannable));
  assert.ok(bans.some((b) => b.championId === prot.likelyBan));
});

test('AC9: NEXT の試合ごとに、両チームの予想ピック(各選手の1位)とプロテクト候補を、試合の識別・チーム・チャンピオンの key で出す', () => {
  const ratings = {
    players: WIDE.map((p) => ({ playerId: p.playerId, axes: [{ key: 'pool', data: { poolDetail: { list: p.list } } }] })),
  };
  const out = nextDraftForecast(ratings, guide);
  assert.equal(out.kind, NEXT_DRAFT_KIND);
  assert.equal(out.matches.length, 12);
  const m = out.matches.find((x) => x.matchId === 'RS-1-CC-DD-NEXT')!;
  assert.deepEqual(m.teams.map((t) => t.team), ['CC', 'DD']);
  const cc = m.teams[0];
  assert.deepEqual(cc.picks, [1, 64, 103, 10, 13]);
  assert.deepEqual(cc.protects, [103, 64]);
  assert.deepEqual(m.teams[1].picks, []);
  assert.deepEqual(m.teams[1].protects, []);
});

test('AC9: 集計のコマンドは F-005 が読む NEXT の予想のファイルを書く', async () => {
  const root = mkdtempSync(join(tmpdir(), 'f006-t2-'));
  const ddragon = async (url: string) =>
    new Response(JSON.stringify(url.endsWith('versions.json') ? ['16.20.1'] : { type: 'champion', version: '16.20.1', data: { Ahri: { id: 'Ahri', key: '103', name: 'アーリ' } } }), { status: 200, headers: { 'content-type': 'application/json' } });
  const code = await main({ rawDir: join(root, 'raw'), publicDir: join(root, 'public'), snapshotsDir: join(root, 'snap'), fetch: ddragon, now: () => new Date('2026-10-09T00:00:00Z'), out: () => {} });
  assert.equal(code, 0);
  const saved = JSON.parse(readFileSync(join(root, 'public', 'next-draft.json'), 'utf8'));
  assert.equal(saved.kind, NEXT_DRAFT_KIND);
  assert.equal(saved.matches.length, 12);
});
