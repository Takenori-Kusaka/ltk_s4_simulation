// F-009 Task-4: 受入基準 17〜19(調子の係数と表示の点数)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formFactor, applyForm, displayScore, loadFormConfig, ladderLp } from '../../src/rating/form.ts';
import type { FormGame, LeagueSnapshot, FormConfig } from '../../src/rating/form.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-09T00:00:00Z');
const cfg: FormConfig = loadFormConfig();

const g = (ageDays: number, win: boolean, o: Partial<FormGame> = {}): FormGame => ({
  endTime: NOW - ageDays * DAY,
  durationMin: 30,
  queueId: 420,
  win,
  ...o,
});
/** n 試合のうち w 勝(すべて直近 14 日以内) */
const games = (n: number, w: number): FormGame[] => Array.from({ length: n }, (_, i) => g(1 + (i % 13), i < w));
const snap = (ageDays: number, tier: string, division: string, lp: number): LeagueSnapshot => ({
  date: new Date(NOW - ageDays * DAY).toISOString(),
  tier,
  division,
  lp,
});

test('設定: 既定値は設計書(rating-model.md 2c)のとおり', () => {
  assert.equal(cfg.windowDays, 14);
  assert.equal(cfg.minGames, 3);
  assert.deepEqual([...cfg.queues].sort(), [420, 440]);
  assert.equal(cfg.minMinutes, 10);
  assert.equal(cfg.min, 0.9);
  assert.equal(cfg.max, 1.1);
});

test('基準17: 係数は 0.90〜1.10 に収まる(極端な入力でも)', () => {
  const cases: [FormGame[], LeagueSnapshot[]][] = [
    [games(100, 100), [snap(13, 'IRON', 'IV', 0), snap(0, 'CHALLENGER', 'I', 3000)]],
    [games(100, 0), [snap(13, 'CHALLENGER', 'I', 3000), snap(0, 'IRON', 'IV', 0)]],
    [games(3, 3), []],
    [games(3, 0), []],
    [games(30, 15), [snap(10, 'GOLD', 'II', 50), snap(1, 'GOLD', 'II', 50)]],
  ];
  for (const [gs, hist] of cases) {
    const r = formFactor(gs, hist, NOW, cfg);
    assert.ok(r.coefficient >= 0.9 && r.coefficient <= 1.1, `係数 ${r.coefficient}`);
    assert.ok(r.score >= -1 && r.score <= 1, `S ${r.score}`);
  }
  assert.equal(formFactor(games(100, 100), [snap(13, 'IRON', 'IV', 0), snap(0, 'CHALLENGER', 'I', 3000)], NOW, cfg).coefficient, 1.1);
  assert.equal(formFactor(games(100, 0), [snap(13, 'CHALLENGER', 'I', 3000), snap(0, 'IRON', 'IV', 0)], NOW, cfg).coefficient, 0.9);
});

test('基準17: 設計の式どおりに3つの項を足す(勝率の縮小・LP の増減・練習量)', () => {
  // m = 10、7 勝、LP +75(GOLD II 50 → GOLD I 25)
  const hist = [snap(12, 'GOLD', 'II', 50), snap(5, 'GOLD', 'I', 0), snap(0, 'GOLD', 'I', 25)];
  const r = formFactor(games(10, 7), hist, NOW, cfg);
  const win = 0.5 * ((0.7 - 0.5) / 0.15) * (10 / 15);
  const lp = 0.3 * (75 / 150);
  const practice = 0.2 * (10 / 30);
  assert.equal(r.games, 10);
  assert.ok(Math.abs((r.components.winRate ?? NaN) - 0.7) < 1e-9);
  assert.ok(Math.abs(r.components.winRateTerm - win) < 1e-9);
  assert.equal(r.components.lpDelta, 75);
  assert.ok(Math.abs(r.components.lpTerm - lp) < 1e-9);
  assert.ok(Math.abs(r.components.practiceTerm - practice) < 1e-9);
  assert.ok(Math.abs(r.score - (win + lp + practice)) < 1e-9);
  assert.ok(Math.abs(r.coefficient - (1 + 0.1 * (win + lp + practice))) < 1e-9);
});

test('基準17: 勝率の項は試合数で縮小する(同じ勝率なら試合が少ないほど小さい)', () => {
  const few = formFactor(games(4, 4), [], NOW, cfg).components.winRateTerm;
  const many = formFactor(games(20, 20), [], NOW, cfg).components.winRateTerm;
  assert.ok(few > 0 && many > few);
  assert.ok(Math.abs(few - 0.5 * (0.5 / 0.15) * (4 / 9)) < 1e-9);
});

test('基準17: 練習量の項は 30 試合で頭打ち', () => {
  assert.ok(Math.abs(formFactor(games(30, 15), [], NOW, cfg).components.practiceTerm - 0.2) < 1e-9);
  assert.ok(Math.abs(formFactor(games(60, 30), [], NOW, cfg).components.practiceTerm - 0.2) < 1e-9);
});

test('基準17: 直近 14 日・ランク(420/440)・10 分以上の試合だけを数える', () => {
  const gs = [
    ...games(3, 3),
    g(15, true), // 期間外
    g(2, true, { queueId: 450 }), // ARAM
    g(2, true, { queueId: 400 }), // ノーマル
    g(2, true, { durationMin: 9 }), // 短い
    g(2, false, { queueId: 440 }), // フレックスは数える
    g(-1, true), // 未来の試合は数えない
  ];
  const r = formFactor(gs, [], NOW, cfg);
  assert.equal(r.games, 4);
  assert.ok(Math.abs((r.components.winRate ?? NaN) - 0.75) < 1e-9);
});

test('基準17: LP の換算(ディビジョンは 100LP、Master 以上は LP をそのまま)', () => {
  const lp = (tier: string, division: string, v: number) => ladderLp({ tier, division, lp: v }) as number;
  assert.equal(lp('GOLD', 'I', 30) - lp('GOLD', 'II', 30), 100);
  assert.equal(lp('PLATINUM', 'IV', 0) - lp('GOLD', 'I', 90), 10);
  assert.equal(lp('MASTER', 'I', 300) - lp('MASTER', 'I', 100), 200);
  assert.equal(lp('GRANDMASTER', 'I', 700) - lp('MASTER', 'I', 500), 200);
  assert.equal(lp('MASTER', 'I', 20) - lp('DIAMOND', 'I', 90), 30);
  assert.equal(lp('master', 'i', 0), lp('MASTER', 'I', 0));
  assert.equal(ladderLp({ tier: 'UNKNOWN', division: 'I', lp: 0 }), null);
});

test('基準17: LP の記録が 14 日以内に 2 件未満なら LP の項は 0 で、理由に「記録の蓄積待ち」を書く', () => {
  const none = formFactor(games(10, 7), [], NOW, cfg);
  assert.equal(none.components.lpTerm, 0);
  assert.equal(none.components.lpDelta, null);
  assert.match(none.reason, /LP の推移は記録の蓄積待ち/);
  // 1 件は期間外(20 日前)、期間内は 1 件だけ
  const one = formFactor(games(10, 7), [snap(20, 'GOLD', 'IV', 0), snap(1, 'GOLD', 'I', 0)], NOW, cfg);
  assert.equal(one.components.lpTerm, 0);
  assert.match(one.reason, /LP の推移は記録の蓄積待ち/);
  // 換算できない階級だけなら同じ扱い
  const bad = formFactor(games(10, 7), [snap(5, 'UNKNOWN', 'I', 0), snap(1, 'UNKNOWN', 'I', 50)], NOW, cfg);
  assert.equal(bad.components.lpTerm, 0);
  // 2 件そろえば項が入り、理由には増減が載る(与える順序に依らず古い順に見る)
  const two = formFactor(games(10, 7), [snap(1, 'GOLD', 'I', 0), snap(10, 'GOLD', 'II', 0)], NOW, cfg);
  assert.equal(two.components.lpDelta, 100);
  assert.doesNotMatch(two.reason, /蓄積待ち/);
  assert.match(two.reason, /\+100/);
});

test('基準18: 直近 14 日の評価の試合が 3 件未満なら係数 1.00 と「調子: 判断材料なし」', () => {
  for (const gs of [[], games(1, 1), games(2, 2), [...games(2, 0), g(20, true), g(1, true, { queueId: 450 })]]) {
    const r = formFactor(gs, [snap(10, 'IRON', 'IV', 0), snap(0, 'CHALLENGER', 'I', 3000)], NOW, cfg);
    assert.equal(r.coefficient, 1);
    assert.equal(r.label, '調子: 判断材料なし');
    assert.equal(r.insufficient, true);
  }
  const three = formFactor(games(3, 3), [], NOW, cfg);
  assert.equal(three.insufficient, false);
  assert.notEqual(three.label, '調子: 判断材料なし');
});

test('基準17: ラベルは係数の高い順に 絶好調・好調・普通・不調・絶不調', () => {
  const top = formFactor(games(30, 30), [snap(13, 'GOLD', 'IV', 0), snap(0, 'DIAMOND', 'IV', 0)], NOW, cfg);
  const bottom = formFactor(games(30, 0), [snap(13, 'DIAMOND', 'IV', 0), snap(0, 'GOLD', 'IV', 0)], NOW, cfg);
  assert.equal(top.label, '絶好調');
  assert.equal(bottom.label, '絶不調');
  assert.equal(formFactor(games(10, 7), [], NOW, cfg).label, '好調'); // S ≈ +0.289 → 1.029
  assert.equal(formFactor(games(10, 4), [], NOW, cfg).label, '普通'); // S ≈ −0.156 → 0.984
  assert.equal(formFactor(games(10, 3), [], NOW, cfg).label, '不調'); // S ≈ −0.378 → 0.962
});

test('基準17: 同じ入力なら同じ結果(順序にも依らない)', () => {
  const gs = games(12, 8);
  const hist = [snap(12, 'GOLD', 'II', 50), snap(0, 'GOLD', 'I', 25)];
  const a = formFactor(gs, hist, NOW, cfg);
  const b = formFactor([...gs].reverse(), [...hist].reverse(), NOW, cfg);
  assert.deepEqual(a, b);
  assert.deepEqual(formFactor(gs, hist, NOW, cfg), a);
});

test('基準17: 理由の文に試合数と勝率を書く', () => {
  const r = formFactor(games(10, 7), [], NOW, cfg);
  assert.match(r.reason, /10 試合/);
  assert.match(r.reason, /70%/);
});

test('基準19: 表示の点数 = 基礎 + (係数 − 1) × 5(±0.5 点まで)、0〜10 に切り詰め', () => {
  assert.ok(Math.abs(applyForm(5, 1.1) - 5.5) < 1e-9);
  assert.ok(Math.abs(applyForm(5, 0.9) - 4.5) < 1e-9);
  assert.ok(Math.abs(applyForm(8, 1.1) - 8.5) < 1e-9);
  assert.ok(Math.abs(applyForm(3, 1.04) - 3.2) < 1e-9);
  assert.equal(applyForm(7, 1), 7);
  assert.equal(applyForm(9.8, 1.1), 10);
  assert.equal(applyForm(0.2, 0.9), 0);
  assert.equal(applyForm(12, 1), 10);
  assert.equal(applyForm(-1, 1), 0);
});

test('基準19: 好調なら実力帯に依らず必ず上がり、不調なら必ず下がる(同じ幅)', () => {
  for (const base of [1, 3, 5, 7, 9]) {
    assert.ok(applyForm(base, 1.06) > base, `好調 ${base}`);
    assert.ok(applyForm(base, 0.94) < base, `不調 ${base}`);
    assert.ok(Math.abs(applyForm(base, 1.06) - base - 0.3) < 1e-9);
  }
});

test('基準19: 軸の説明のために基礎の点数と係数を返す', () => {
  const form = formFactor(games(10, 7), [], NOW, cfg);
  const d = displayScore(6.4, form);
  assert.equal(d.base, 6.4);
  assert.equal(d.coefficient, form.coefficient);
  assert.equal(d.label, form.label);
  assert.ok(Math.abs(d.display - applyForm(6.4, form.coefficient)) < 1e-12);
  const none = displayScore(6.4, formFactor([], [], NOW, cfg));
  assert.equal(none.display, 6.4);
  assert.equal(none.coefficient, 1);
});

test('設定を省略すると既定値を使う', () => {
  assert.deepEqual(formFactor(games(10, 7), [], NOW), formFactor(games(10, 7), [], NOW, cfg));
});
