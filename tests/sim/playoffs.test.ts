// F-001 Task-2: 受入基準 6〜8
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playBo4, assignTiers, matchWinProbability, runPlayoffs } from '../../src/sim/playoffs.ts';
import type { Tier } from '../../src/sim/types.ts';

/** 決めた順に値を返す乱数。各 GAME は rng() < 上位シードの勝率 のとき上位シードの勝ち */
const scripted = (vals: number[]) => {
  let i = 0;
  return () => {
    if (i >= vals.length) throw new Error('乱数の列が足りない');
    return vals[i++];
  };
};
const even: Record<Tier, number> = { NEXT: 0.5, CORE: 0.5, MASTERS: 0.5 };
const W = 0.1; // 上位シードの勝ち
const L = 0.9; // 下位シードの勝ち

test('AC6: GAME 1〜3 を上位シードが全勝すると 4-0 で GAME 4 は行わない', () => {
  const r = playBo4('DD', 'CC', even, ['NEXT', 'CORE', 'MASTERS'], scripted([W, W, W]));
  assert.deepEqual(r.score, [4, 0]);
  assert.equal(r.winner, 'DD');
  assert.equal(r.loser, 'CC');
  assert.equal(r.games.length, 3);
});

test('AC6: GAME 3 の勝者に 2pt を与える(1勝2敗でも GAME 3 を取れば 3-1)', () => {
  const r = playBo4('DD', 'CC', even, ['NEXT', 'CORE', 'MASTERS'], scripted([L, W, W]));
  assert.deepEqual(r.score, [3, 1]);
  assert.equal(r.winner, 'DD');
});

test('AC6: 2-2 の場合は GAME 3 に出ていない階級で GAME 4 を行い、その勝者がマッチの勝者', () => {
  const r = playBo4('DD', 'CC', even, ['NEXT', 'CORE', 'MASTERS'], scripted([W, W, L, L]));
  assert.equal(r.games.length, 4);
  assert.notEqual(r.games[3].tier, 'MASTERS');
  assert.ok(['NEXT', 'CORE'].includes(r.games[3].tier));
  assert.deepEqual(r.score, [2, 3]);
  assert.equal(r.winner, 'CC');
});

test('AC6: 下位シードが GAME 1・2 を取り GAME 3 を落とすと 2-2 から GAME 4', () => {
  const r = playBo4('DD', 'CC', even, ['NEXT', 'CORE', 'MASTERS'], scripted([L, L, W, W]));
  assert.equal(r.games.length, 4);
  assert.deepEqual(r.score, [3, 2]);
  assert.equal(r.winner, 'DD');
});

test('AC7: 既定の方針は上位シードの勝率が最も高い階級を GAME 3、残りを勝率の低い順に GAME 1・2 に置く', () => {
  const order = assignTiers({ NEXT: 0.6, CORE: 0.4, MASTERS: 0.7 });
  assert.deepEqual(order, ['CORE', 'NEXT', 'MASTERS']);
});

test('AC7: 方針 max-match はマッチ勝率が最大の並びを選ぶ', () => {
  const p = { NEXT: 0.9, CORE: 0.2, MASTERS: 0.55 };
  const order = assignTiers(p, 'max-match');
  const best = Math.max(
    ...(['NEXT', 'CORE', 'MASTERS'] as Tier[]).flatMap((a) =>
      (['NEXT', 'CORE', 'MASTERS'] as Tier[]).filter((b) => b !== a).map((b) => {
        const c = (['NEXT', 'CORE', 'MASTERS'] as Tier[]).find((t) => t !== a && t !== b)!;
        return matchWinProbability(p, [a, b, c]);
      }),
    ),
  );
  assert.ok(Math.abs(matchWinProbability(p, order) - best) < 1e-12);
});

test('AC7: 方針 random は乱数に従って6通りから選ぶ', () => {
  const a = assignTiers(even, 'random', () => 0.0);
  const b = assignTiers(even, 'random', () => 0.99);
  assert.equal(new Set(a).size, 3);
  assert.notDeepEqual(a, b);
});

test('AC6: マッチ勝率の式(全階級 50% なら 50%、全階級 100% なら 100%)', () => {
  assert.ok(Math.abs(matchWinProbability(even, ['NEXT', 'CORE', 'MASTERS']) - 0.5) < 1e-12);
  assert.equal(matchWinProbability({ NEXT: 1, CORE: 1, MASTERS: 1 }, ['NEXT', 'CORE', 'MASTERS']), 1);
});

test('AC8: 1位vs2位(UF)、3位vs4位(LS)、UF敗者vsLS勝者(LF)、UF勝者vsLF勝者(GF)の順に進む', () => {
  // すべての試合で上位シードが勝つ
  const r = runPlayoffs(['DD', 'LR', 'CC', 'IT'], () => even, scripted(Array(40).fill(W)));
  assert.deepEqual([r.upperFinal.winner, r.upperFinal.loser], ['DD', 'LR']);
  assert.deepEqual([r.lowerSemi.winner, r.lowerSemi.loser], ['CC', 'IT']);
  assert.deepEqual([r.lowerFinal.winner, r.lowerFinal.loser], ['LR', 'CC']);
  assert.deepEqual([r.grandFinal.winner, r.grandFinal.loser], ['DD', 'LR']);
  assert.equal(r.champion, 'DD');
  assert.deepEqual(r.placement, ['DD', 'LR', 'CC', 'IT']);
});

test('AC8: Grand Final にアドバンテージは無く、Lower から上がったチームも優勝できる', () => {
  // UF: DD 勝ち, LS: CC 勝ち, LF: CC(下位シード)が LR に勝つ, GF: CC(下位シード)が DD に勝つ
  const rng = scripted([W, W, W, W, W, W, L, L, L, L, L, L]);
  const r = runPlayoffs(['DD', 'LR', 'CC', 'IT'], () => even, rng);
  assert.equal(r.lowerFinal.winner, 'CC');
  assert.equal(r.grandFinal.winner, 'CC');
  assert.equal(r.champion, 'CC');
  assert.deepEqual(r.placement, ['CC', 'DD', 'LR', 'IT']);
});
