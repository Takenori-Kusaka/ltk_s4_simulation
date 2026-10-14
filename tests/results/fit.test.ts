// F-004 Task-5: 受入基準 23(当てはまりの確認)。実装より先に受入基準から書いた
// 期待値は手で検算した値(各テストのコメント)。対数損失は自然対数、確率は teams の 1 つ目の階級チームが勝つ確率
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enoughOfficialGames, fitReportOf, formatFitMarkdown, MIN_OFFICIAL_GAMES, officialWeightVariants, oppAdjustVariants, scrimWeightVariants } from '../../src/results/fit.ts';
import { main } from '../../src/results/fit-cli.ts';
import type { ResultsGame } from '../../src/results/official.ts';
import type { Tier } from '../../src/sim/types.ts';

const SOURCE = { url: 'https://www.youtube.com/watch?v=f004-task5' };
/** 本番の 1 試合。a が teams の 1 つ目。pA は予測の a の勝率(%)、null なら予測なし。aWins で a の勝ち */
const g = (n: number, tier: Tier, a: string, b: string, pA: number | null, aWins: boolean): ResultsGame => ({
  matchId: `OFFICIAL_2026111${n}_${tier}_G${n}`,
  date: `2026-11-1${n}`,
  stage: 'regular',
  day: n,
  tier,
  teams: [`${a}-${tier}`, `${b}-${tier}`] as ResultsGame['teams'],
  winner: (aWins ? `${a}-${tier}` : `${b}-${tier}`) as ResultsGame['winner'],
  kind: 'official',
  source: SOURCE,
  forecast: pA === null ? null : { pA, pB: 100 - pA, computedAt: '2026-11-01T00:00:00.000Z' },
  forecastReason: pA === null ? '試合日より前の勝率表が無い' : null,
});

// 8 試合。NEXT の 3 試合は同じ組(CC-NEXT 対 DD-NEXT)
const GAMES: ResultsGame[] = [
  g(1, 'NEXT', 'CC', 'DD', 60, true),
  g(2, 'NEXT', 'CC', 'DD', 60, false),
  g(3, 'NEXT', 'CC', 'DD', 50, true),
  g(4, 'CORE', 'CC', 'DD', 80, true),
  g(5, 'CORE', 'IT', 'LR', 20, true),
  g(6, 'CORE', 'CC', 'IT', 70, false),
  g(7, 'MASTERS', 'CC', 'DD', 90, true),
  g(8, 'MASTERS', 'IT', 'LR', null, true),
];
const SCRIM: ResultsGame = { ...g(9, 'NEXT', 'CC', 'DD', null, true), kind: 'scrim', stage: null, day: null, forecast: undefined, forecastReason: undefined };

// β の目標の広がり ln 4。同じ階級で S のある階級チームが 2 つ(差 1)なら β = ln 4 で、差 +1 の勝率は 1 / (1 + e^(−ln 4)) = 0.8
const TARGET_SD = Math.log(4);
const S_CONFIG = { 'CC-NEXT': 1, 'DD-NEXT': 0, 'IT-NEXT': null, 'LR-NEXT': null };
const S_ZERO = { 'CC-NEXT': 0, 'DD-NEXT': 1, 'IT-NEXT': null, 'LR-NEXT': null };
const VARIANTS = [
  { key: 'scrim-config', label: 'scrimGameWeight 2(設定の値)', S: S_CONFIG },
  { key: 'scrim-0', label: 'scrimGameWeight 0', S: S_ZERO },
];

const close = (actual: number | null, expected: number, msg: string) => {
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-5, `${msg}: ${actual} ≠ ${expected}`);
};

test('基準23: 本番の記録が 8 試合以上のときだけ確認する(スクリムは数えない)', () => {
  assert.equal(MIN_OFFICIAL_GAMES, 8);
  assert.equal(enoughOfficialGames(GAMES), true);
  assert.equal(enoughOfficialGames([...GAMES.slice(0, 7), SCRIM]), false);
});

test('基準23: 予測と実際の対数損失と Brier スコアを、全体と階級ごとに計算する(予測なしの試合は数えずに件数を出す)', () => {
  const r = fitReportOf({ games: [...GAMES, SCRIM], variants: VARIANTS, targetSd: TARGET_SD });
  assert.equal(r.official, 8);
  // 各試合の −ln(実際の結果の確率): 1 −ln .6 = 0.510826、2 −ln .4 = 0.916291、3 −ln .5 = 0.693147、
  // 4 −ln .8 = 0.223144、5 −ln .2 = 1.609438、6 −ln .3 = 1.203973、7 −ln .9 = 0.105361。合計 5.262180 ÷ 7 = 0.751740
  // Brier: .16 + .36 + .25 + .04 + .64 + .49 + .01 = 1.95 ÷ 7 = 0.278571
  assert.equal(r.forecast.all.n, 7);
  assert.equal(r.forecast.missing, 1);
  close(r.forecast.all.logLoss, 0.75174, '全体の対数損失');
  close(r.forecast.all.brier, 0.278571, '全体の Brier');
  // NEXT: 2.120264 ÷ 3 = 0.706755、Brier .77 ÷ 3 = 0.256667
  assert.equal(r.forecast.byTier.NEXT.n, 3);
  close(r.forecast.byTier.NEXT.logLoss, 0.706755, 'NEXT の対数損失');
  close(r.forecast.byTier.NEXT.brier, 0.256667, 'NEXT の Brier');
  // CORE: 3.036555 ÷ 3 = 1.012185、Brier 1.17 ÷ 3 = 0.39
  close(r.forecast.byTier.CORE.logLoss, 1.012185, 'CORE の対数損失');
  close(r.forecast.byTier.CORE.brier, 0.39, 'CORE の Brier');
  // MASTERS: 予測のある 1 試合だけ。−ln .9 = 0.105361、Brier .01
  assert.equal(r.forecast.byTier.MASTERS.n, 1);
  close(r.forecast.byTier.MASTERS.logLoss, 0.105361, 'MASTERS の対数損失');
  close(r.forecast.byTier.MASTERS.brier, 0.01, 'MASTERS の Brier');
});

test('基準23: 事前の勝率 β × (S_A − S_B) を scrimGameWeight のままと 0 の 2 通りで作り、同じ指標を計算する', () => {
  const r = fitReportOf({ games: GAMES, variants: VARIANTS, targetSd: TARGET_SD });
  assert.deepEqual(r.priors.map((p) => p.key), ['scrim-config', 'scrim-0']);
  const [conf, zero] = r.priors;
  // S のある組は NEXT の 3 試合だけ。ほかの 5 試合は S が無く数えない
  assert.equal(conf.all.n, 3);
  assert.equal(conf.missing, 5);
  // 設定の値: CC-NEXT の勝率 0.8。実際は勝・負・勝 → 対数損失 (0.223144 × 2 + 1.609438) ÷ 3 = 0.685242、Brier (.04 + .64 + .04) ÷ 3 = 0.24
  close(conf.all.logLoss, 0.685242, '設定の値の対数損失');
  close(conf.all.brier, 0.24, '設定の値の Brier');
  close(conf.byTier.NEXT.logLoss, 0.685242, '設定の値の NEXT の対数損失');
  assert.equal(conf.byTier.CORE.n, 0);
  assert.equal(conf.byTier.CORE.logLoss, null);
  // 0: CC-NEXT の勝率 0.2 → 対数損失 (1.609438 × 2 + 0.223144) ÷ 3 = 1.147340、Brier (.64 + .04 + .64) ÷ 3 = 0.44
  close(zero.all.logLoss, 1.14734, '0 の対数損失');
  close(zero.all.brier, 0.44, '0 の Brier');
  // 試合の一覧: 各試合の予測と、2 通りの事前の勝率(teams の 1 つ目の勝率)
  assert.equal(r.rows.length, 8);
  const first = r.rows[0];
  assert.equal(first.matchId, GAMES[0].matchId);
  assert.equal(first.forecastA, 60);
  close(first.priorA['scrim-config'], 0.8, '1 試合目の設定の値');
  close(first.priorA['scrim-0'], 0.2, '1 試合目の 0');
  assert.equal(r.rows[3].priorA['scrim-config'], null);
});

test('基準23: 2 通りの組は評価設定の scrimGameWeight と 0(Task-13・F-009 Task-18 は同じ形で組を足す)', () => {
  const v = scrimWeightVariants({ scrimGameWeight: 2 });
  assert.deepEqual(v.map((x) => x.engine), [{}, { scrimGameWeight: 0 }]);
  assert.match(v[0].label, /scrimGameWeight 2/);
  assert.match(v[1].label, /scrimGameWeight 0/);
  assert.notEqual(v[0].key, v[1].key);
});

const RECOMMEND = /推奨|おすすめ|べき|下げ|上げ|改善|望ましい/;

test('基準23: 書き出しは指標と試合の一覧を持ち、推奨の文を持たない', () => {
  const md = formatFitMarkdown(fitReportOf({ games: GAMES, variants: VARIANTS, targetSd: TARGET_SD }), { computedAt: '2026-11-20T00:00:00.000Z' });
  assert.doesNotMatch(md, RECOMMEND);
  assert.match(md, /対数損失/);
  assert.match(md, /Brier/);
  assert.match(md, /scrimGameWeight 2\(設定の値\)/);
  assert.match(md, /scrimGameWeight 0/);
  assert.match(md, /価値責任者/);
  for (const x of GAMES) assert.ok(md.includes(x.matchId), `試合の一覧に ${x.matchId}`);
  // 全体の対数損失 0.751740 を小数第 3 位で
  assert.match(md, /0\.752/);
});

test('基準23: 命令は 8 試合以上で docs/research/results-fit.md の形のファイルを書き、8 試合未満では書かない', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'f004-fit-'));
  const outPath = join(dir, 'results-fit.md');
  const lines: string[] = [];
  const engines: object[] = [];
  const opts = {
    outPath,
    now: () => new Date('2026-11-20T00:00:00.000Z'),
    out: (l: string) => lines.push(l),
    targetSd: TARGET_SD,
    engineConfig: { scrimGameWeight: 2 },
    scoresOf: (engine: object) => {
      engines.push(engine);
      return 'scrimGameWeight' in engine ? S_ZERO : S_CONFIG;
    },
  };
  assert.equal(await main({ ...opts, loadGames: () => ({ games: GAMES.slice(0, 7), errors: [] }) }), 0);
  assert.equal(existsSync(outPath), false);
  assert.ok(lines.some((l) => /7 試合/.test(l) && /8 試合/.test(l)), lines.join('\n'));

  assert.equal(await main({ ...opts, loadGames: () => ({ games: GAMES, errors: [] }) }), 0);
  // 先頭の 2 つが基準23 の組(基準43 などの組はその後ろに足される)
  assert.deepEqual(engines.slice(0, 2), [{}, { scrimGameWeight: 0 }]);
  const md = readFileSync(outPath, 'utf8');
  assert.doesNotMatch(md, RECOMMEND);
  assert.match(md, /0\.685/);
  assert.match(md, /1\.147/);

  // 記録が検証に反したら書かない(終了コード 3)
  const errPath = join(dir, 'err.md');
  assert.equal(await main({ ...opts, outPath: errPath, loadGames: () => ({ games: GAMES, errors: ['x.json[0] winner: 不正'] }) }), 3);
  assert.equal(existsSync(errPath), false);
});

test('基準43: officialGameWeight を設定の値・scrimGameWeight と同じ値・0 の 3 通りにした組', () => {
  const v = officialWeightVariants({ scrimGameWeight: 2, officialGameWeight: 4 });
  assert.deepEqual(v.map((x) => x.engine), [{}, { officialGameWeight: 2 }, { officialGameWeight: 0 }]);
  assert.match(v[0].label, /officialGameWeight 4\(設定の値\)/);
  assert.match(v[1].label, /officialGameWeight 2\(scrimGameWeight と同じ値\)/);
  assert.match(v[2].label, /officialGameWeight 0/);
  assert.equal(new Set([...scrimWeightVariants({ scrimGameWeight: 2 }), ...v].map((x) => x.key)).size, 5);
});

test('基準43: 命令は基準23 の比較に officialGameWeight の 3 通りの対数損失と Brier を足して書き、推奨の文を持たない', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'f004-fit43-'));
  const outPath = join(dir, 'results-fit.md');
  const engines: object[] = [];
  const code = await main({
    outPath,
    now: () => new Date('2026-11-20T00:00:00.000Z'),
    out: () => {},
    targetSd: TARGET_SD,
    engineConfig: { scrimGameWeight: 2, officialGameWeight: 4 },
    loadGames: () => ({ games: GAMES, errors: [] }),
    // scrimGameWeight 0 と officialGameWeight 0 の組は S_ZERO、ほかは S_CONFIG
    scoresOf: (engine: { scrimGameWeight?: number; officialGameWeight?: number }) => {
      engines.push(engine);
      return engine.scrimGameWeight === 0 || engine.officialGameWeight === 0 ? S_ZERO : S_CONFIG;
    },
  });
  assert.equal(code, 0);
  assert.deepEqual(engines.slice(2, 5), [{}, { officialGameWeight: 2 }, { officialGameWeight: 0 }]);
  const md = readFileSync(outPath, 'utf8');
  assert.doesNotMatch(md, RECOMMEND);
  // S_CONFIG の組: 対数損失 0.685242、Brier 0.24(基準23 のテストの検算)。S のある 3 試合、数えなかった 5 試合
  assert.match(md, /\| officialGameWeight 4\(設定の値\) \| 全体 \| 3 \| 0\.685 \| 0\.240 \| 5 \|/);
  assert.match(md, /\| officialGameWeight 2\(scrimGameWeight と同じ値\) \| 全体 \| 3 \| 0\.685 \| 0\.240 \| 5 \|/);
  // S_ZERO の組: 対数損失 1.147340、Brier 0.44
  assert.match(md, /\| officialGameWeight 0 \| 全体 \| 3 \| 1\.147 \| 0\.440 \| 5 \|/);
  // 基準23 の 2 通りも残る
  assert.match(md, /\| scrimGameWeight 0 \| 全体 \| 3 \| 1\.147 \| 0\.440 \| 5 \|/);
});

// F-009 Task-18: 受入基準 45(oppAdjust の 3 通り)。実装より先に受入基準から書いた
const OPP = { ground: 0.15, laning: 0.23 };
// 設定のまま: CC-NEXT 1・DD-NEXT 0 → 0.8。すべて 0: 同じ S → β = 0 → 0.5。2 倍: CC-NEXT 0・DD-NEXT 1 → 0.2
const OPP_VARIANTS = [
  { key: 'opp-config', label: 'oppAdjust 設定の値', S: S_CONFIG },
  { key: 'opp-0', label: 'oppAdjust すべて 0', S: { 'CC-NEXT': 0, 'DD-NEXT': 0, 'IT-NEXT': null, 'LR-NEXT': null } },
  { key: 'opp-2x', label: 'oppAdjust 2 倍', S: S_ZERO },
];

test('基準45: 3 通りの組は評価設定の oppAdjust のまま・すべて 0・2 倍', () => {
  const v = oppAdjustVariants({ oppAdjust: OPP });
  // 0.23 × 2 は 2 進の指数だけが変わるため、0.46 と一致する
  assert.deepEqual(v.map((x) => x.engine), [{}, { oppAdjust: { ground: 0, laning: 0 } }, { oppAdjust: { ground: 0.3, laning: 0.46 } }]);
  assert.equal(new Set(v.map((x) => x.key)).size, 3);
  assert.match(v[0].label, /oppAdjust/);
  assert.match(v[0].label, /設定/);
  assert.match(v[1].label, /0/);
  assert.match(v[2].label, /2 倍/);
  // 設定の値を書き換えない
  assert.deepEqual(OPP, { ground: 0.15, laning: 0.23 });
});

test('基準45: 3 通りの事前の勝率で対数損失と Brier スコアを計算し、推奨を書かない', () => {
  const r = fitReportOf({ games: GAMES, variants: OPP_VARIANTS, targetSd: TARGET_SD });
  assert.deepEqual(r.priors.map((p) => p.key), ['opp-config', 'opp-0', 'opp-2x']);
  const [conf, zero, twice] = r.priors;
  // 設定のまま: 0.8 で勝・負・勝 → (0.223144 × 2 + 1.609438) ÷ 3 = 0.685242、Brier (.04 + .64 + .04) ÷ 3 = 0.24
  close(conf.all.logLoss, 0.685242, '設定のままの対数損失');
  close(conf.all.brier, 0.24, '設定のままの Brier');
  // すべて 0: 0.5 → −ln .5 = 0.693147、Brier .25
  close(zero.all.logLoss, 0.693147, 'すべて 0 の対数損失');
  close(zero.all.brier, 0.25, 'すべて 0 の Brier');
  // 2 倍: 0.2 → (1.609438 × 2 + 0.223144) ÷ 3 = 1.147340、Brier (.64 + .04 + .64) ÷ 3 = 0.44
  close(twice.all.logLoss, 1.14734, '2 倍の対数損失');
  close(twice.all.brier, 0.44, '2 倍の Brier');
  const md = formatFitMarkdown(r, { computedAt: '2026-11-20T00:00:00.000Z' });
  assert.doesNotMatch(md, RECOMMEND);
  for (const l of ['oppAdjust 設定の値', 'oppAdjust すべて 0', 'oppAdjust 2 倍']) assert.ok(md.includes(l), l);
  assert.match(md, /0\.685/);
  assert.match(md, /0\.693/);
  assert.match(md, /1\.147/);
});

test('基準45: 命令は scrimGameWeight の組に加えて oppAdjust の 3 通りで S を作り直し、ファイルへ書く', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'f009-fit-'));
  const outPath = join(dir, 'results-fit.md');
  const engines: object[] = [];
  const code = await main({
    outPath,
    now: () => new Date('2026-11-20T00:00:00.000Z'),
    out: () => {},
    targetSd: TARGET_SD,
    engineConfig: { scrimGameWeight: 2, oppAdjust: OPP },
    loadGames: () => ({ games: GAMES, errors: [] }),
    scoresOf: (engine: object) => {
      engines.push(engine);
      const opp = (engine as { oppAdjust?: Record<string, number> }).oppAdjust;
      if (!opp) return S_CONFIG;
      return opp.ground === 0 ? OPP_VARIANTS[1].S : S_ZERO;
    },
  });
  assert.equal(code, 0);
  // 設定のままの組は上書きなし({})。scrimGameWeight の設定の組と同じ上書きでも、別の組として数える
  assert.deepEqual(engines.slice(5), [{}, { oppAdjust: { ground: 0, laning: 0 } }, { oppAdjust: { ground: 0.3, laning: 0.46 } }]);
  const md = readFileSync(outPath, 'utf8');
  assert.doesNotMatch(md, RECOMMEND);
  assert.ok(md.includes('scrimGameWeight 0'));
  assert.match(md, /oppAdjust/);
  assert.match(md, /0\.693/);
  assert.match(md, /1\.147/);
});
