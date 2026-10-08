// F-009 Task-7(旧 Task-4b): 受入基準 21・22(常識の一覧の検査、反したら公開用の評価を書かずに失敗)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRatings, configVersion, type PlayerRatingInput, type PlayerRating, type RatingInputs } from '../../src/rating/build.ts';
import { checkKnownFacts, formatReport, loadKnownFacts } from '../../src/rating/known-facts.ts';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../../src/collect/aggregate-cli.ts';
import type { GameRecord } from '../../src/rating/types.ts';
import type { ShotcallingEvidence, TournamentRecord } from '../../src/rating/evidence.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-09T00:00:00Z');
let seq = 0;
const game = (pos: string, win = true, ageDays = 3): GameRecord => ({
  matchId: `M${++seq}`,
  endTime: NOW - ageDays * DAY,
  durationMin: 30,
  queueId: 420,
  position: pos,
  me: { championId: 1, win: win ? 1 : 0, deaths: 4, totalDamageDealtToChampions: 20000, goldPerMinute: 400 },
  opp: { championId: 2, win: win ? 0 : 1, deaths: 4, totalDamageDealtToChampions: 20000, goldPerMinute: 400 },
});
const NO_RECORD: TournamentRecord = { ltk: [], coach: [], pro: [], other: [] };
const ev = (direction: '+' | '-', strength: '強' | '中' | '弱' = '強', kind: ShotcallingEvidence['kind'] = 'player'): ShotcallingEvidence => ({
  summary: 'テストの根拠', source: 'https://example.com', direction, strength, kind, collectedBy: 'ai',
});
const p = (playerId: string, extra: Partial<PlayerRatingInput> = {}): PlayerRatingInput => ({
  playerId,
  name: playerId,
  tier: 'CORE',
  position: 'MIDDLE',
  rank: { tier: 'DIAMOND', division: 'IV', lp: 0 },
  games: Array.from({ length: 10 }, () => game('MIDDLE')),
  league: [],
  shotcalling: [ev('+')],
  tournament: NO_RECORD,
  ...extra,
});
const inputsOf = (players: PlayerRatingInput[]): RatingInputs => ({ players, matches: [] });
const axis = (r: PlayerRating, key: string) => r.axes.find((a) => a.key === key)!;
const run = (inputs: RatingInputs, tamper?: (rs: PlayerRating[]) => void) => {
  const ratings = buildRatings(inputs, NOW);
  tamper?.(ratings);
  return checkKnownFacts(ratings, inputs, NOW, { recompute: () => buildRatings(inputs, NOW) });
};
const ids = (report: ReturnType<typeof run>, id: string) => report.violations.filter((v) => v.factId === id);

const SAMPLE = () =>
  inputsOf([
    p('HIGH', { rank: { tier: 'CHALLENGER', division: 'I', lp: 900 } }),
    p('LOW', { rank: { tier: 'GOLD', division: 'IV', lp: 0 }, shotcalling: [] }),
    p('PRO', { tier: 'MASTERS', tournament: { ...NO_RECORD, pro: [{ league: 'LJL', team: 'T', years: 3, source: 's' }] } }),
    p('ROOKIE', { tier: 'NEXT', position: 'TOP', games: [game('TOP'), game('MIDDLE')] }),
    p('CC-NEXT-TOP', { tier: 'NEXT', shotcalling: [ev('+', '弱'), ev('-', '強', 'owner-confirmation')] }),
  ]);

test('評価: 全選手に 8 軸(データの6軸 + コール力・大会経験)と調子の係数が付き、表示の点数は 基礎 + (係数 − 1) × 5', () => {
  const rs = buildRatings(SAMPLE(), NOW);
  for (const r of rs) {
    assert.deepEqual(r.axes.map((a) => a.label), ['地力', 'レーン戦', '集団戦', '連携', '安定感', 'ピックプール', 'コール力', '大会経験']);
    for (const a of r.axes) {
      const want = Math.min(10, Math.max(0, a.base + (r.form.coefficient - 1) * 5));
      assert.ok(Math.abs(a.display - want) < 0.011, `${r.playerId} ${a.label}`);
    }
  }
  assert.match(configVersion(), /^[0-9a-f]{12}$/);
});

test('AC21: 評価を計算したとき、常識の一覧の全条件(K-01〜K-09)を検査する。勝率の条件は保留と示す', () => {
  const report = run(SAMPLE());
  assert.deepEqual(report.results.map((r) => r.id), loadKnownFacts().map((f) => f.id));
  assert.deepEqual(report.results.map((r) => r.id), ['K-01', 'K-02', 'K-03', 'K-04', 'K-05', 'K-06', 'K-07', 'K-08', 'K-09']);
  assert.equal(report.results.find((r) => r.id === 'K-08')!.status, '保留');
  assert.equal(report.results.find((r) => r.id === 'K-09')!.status, '保留');
  assert.ok(report.ok, formatReport(report).join('\n'));
  assert.ok(report.results.filter((r) => !/K-0[89]/.test(r.id)).every((r) => r.status === '合格'));
});

test('AC21 K-01: ランクの基準の差が 3.0 以上の同じロールで地力が逆転したら、2選手と地力を列挙する', () => {
  const report = run(SAMPLE(), (rs) => {
    axis(rs.find((r) => r.playerId === 'HIGH')!, 'ground').base = 1;
  });
  const v = ids(report, 'K-01');
  assert.ok(v.some((x) => x.playerId === 'HIGH' && x.axis === '地力' && /LOW/.test(x.detail)));
  assert.equal(report.ok, false);
});

test('AC21 K-02: 大会のロールの試合が 5 未満なのにレーン戦の確度が「低」でなければ列挙する', () => {
  const report = run(SAMPLE(), (rs) => {
    axis(rs.find((r) => r.playerId === 'ROOKIE')!, 'laning').confidence = '中';
  });
  assert.deepEqual(ids(report, 'K-02').map((v) => [v.playerId, v.axis]), [['ROOKIE', 'レーン戦']]);
});

test('AC21 K-03: 肯定の根拠が無いのに 2.5 を超える、否定が肯定を上回るのに 4.0 を超えるコール力を列挙する', () => {
  const inputs = SAMPLE();
  inputs.players.push(p('NEG', { shotcalling: [ev('+', '弱'), ev('-', '強')] }));
  const report = run(inputs, (rs) => {
    axis(rs.find((r) => r.playerId === 'LOW')!, 'shotcalling').base = 3;
    axis(rs.find((r) => r.playerId === 'NEG')!, 'shotcalling').base = 4.5;
  });
  assert.deepEqual(ids(report, 'K-03').map((v) => [v.playerId, v.axis]).sort(), [['LOW', 'コール力'], ['NEG', 'コール力']]);
});

test('AC21 K-04: 価値責任者が「コールしない側」と確認した選手のコール力が 4.0 を超えたら列挙し、チームのマクロは未計算と示す', () => {
  const report = run(SAMPLE(), (rs) => {
    axis(rs.find((r) => r.playerId === 'CC-NEXT-TOP')!, 'shotcalling').base = 4.5;
  });
  assert.deepEqual(ids(report, 'K-04').map((v) => [v.playerId, v.axis]), [['CC-NEXT-TOP', 'コール力']]);
  assert.match(report.results.find((r) => r.id === 'K-04')!.note ?? '', /マクロ/);
});

test('AC21 K-05: LJL の経歴を持つ MASTERS の選手の大会経験が、LTK 初出場の NEXT の選手以下なら列挙する', () => {
  const report = run(SAMPLE(), (rs) => {
    axis(rs.find((r) => r.playerId === 'PRO')!, 'tournament').base = 1;
  });
  const v = ids(report, 'K-05');
  assert.ok(v.some((x) => x.playerId === 'PRO' && x.axis === '大会経験' && /ROOKIE/.test(x.detail)));
});

test('AC21 K-06: 0.0〜10.0 の外の点数、数でない点数、確度の無い軸を列挙する', () => {
  const report = run(SAMPLE(), (rs) => {
    axis(rs[0], 'teamfight').display = 10.5;
    axis(rs[1], 'synergy').base = Number.NaN;
    (axis(rs[2], 'pool') as { confidence?: string }).confidence = undefined;
  });
  assert.deepEqual(ids(report, 'K-06').map((v) => [v.playerId, v.axis]), [['HIGH', '集団戦'], ['LOW', '連携'], ['PRO', 'ピックプール']]);
});

test('AC21 K-07: 同じ入力・同じ基準日で計算し直した点数が食い違えば列挙する', () => {
  const inputs = SAMPLE();
  const ratings = buildRatings(inputs, NOW);
  const report = checkKnownFacts(ratings, inputs, NOW, {
    recompute: () => {
      const again = buildRatings(inputs, NOW);
      axis(again[3], 'stability').base += 0.5;
      return again;
    },
  });
  assert.deepEqual(ids(report, 'K-07').map((v) => [v.playerId, v.axis]), [['ROOKIE', '安定感']]);
});

test('AC21: 報告は反した条件ごとに、該当する選手と軸を行に出す', () => {
  const report = run(SAMPLE(), (rs) => {
    axis(rs.find((r) => r.playerId === 'ROOKIE')!, 'laning').confidence = '高';
  });
  const lines = formatReport(report);
  assert.ok(lines.some((l) => l.includes('K-02') && l.includes('ROOKIE') && l.includes('レーン戦')));
  assert.ok(lines.some((l) => l.includes('K-08') && l.includes('保留')));
});

// ---- 基準22: 集計のコマンド ----

const ddragon = async (url: string) => {
  const body = url.endsWith('versions.json') ? ['16.20.1'] : { type: 'champion', version: '16.20.1', data: { Ahri: { id: 'Ahri', key: '103', name: 'アーリ' } } };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
};
const cli = async (facts?: ReturnType<typeof loadKnownFacts>) => {
  const root = mkdtempSync(join(tmpdir(), 'f009-kf-'));
  const publicDir = join(root, 'public');
  const lines: string[] = [];
  const code = await main({
    rawDir: join(root, 'raw'), publicDir, snapshotsDir: join(root, 'snap'), fetch: ddragon,
    now: () => new Date(NOW), out: (l) => lines.push(l), facts,
  });
  return { code, lines, ratingsPath: join(publicDir, 'ratings.json') };
};

test('AC22: 常識の一覧に反しなければ、公開用の評価(版・基準日・検査の結果つき)を書き、0 を返す', async () => {
  const { code, lines, ratingsPath } = await cli();
  assert.equal(code, 0, lines.join('\n'));
  const saved = JSON.parse(readFileSync(ratingsPath, 'utf8'));
  assert.equal(saved.kind, 'ratings');
  assert.equal(saved.computedAt, new Date(NOW).toISOString());
  assert.equal(saved.configVersion, configVersion());
  assert.equal(saved.players.length, 60);
  assert.deepEqual(saved.checks.map((c: { id: string }) => c.id), ['K-01', 'K-02', 'K-03', 'K-04', 'K-05', 'K-06', 'K-07', 'K-08', 'K-09']);
});

test('AC22: 常識の一覧に1件でも反したら、公開用の評価を書かずに失敗の終了コードを返し、反した選手と軸を出す', async () => {
  const facts = loadKnownFacts().map((f) => (f.id === 'K-03' ? { ...f, params: { ...f.params, noPositiveMax: -1 } } : f));
  const { code, lines, ratingsPath } = await cli(facts);
  assert.notEqual(code, 0);
  assert.ok(!existsSync(ratingsPath));
  assert.ok(lines.some((l) => l.includes('K-03') && l.includes('コール力')));
});
