// F-005 Task-3: 受入基準 9・10・11(関数だけ)・12(材料)・13(切り詰め)。仕上がりの項と、試合日ごとの勝率を作る純粋な関数
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYOFFS_DATE, coPlayOf, dayShift, dayWinrate, daysPlayedBefore, maturationOf, maturationTerm, moodTerm, percentPair, poolFitOf, tauOf, winProbOnDay,
  type DynamicsConfig, type MaturationMember, type MetaChampionLike,
} from '../../src/winrate/dynamics.ts';
import { computePriorWinrates, type TierTeamS, type WinrateConfig } from '../../src/winrate/core.ts';
import { TEAMS, TIERS, type TeamId, type Tier } from '../../src/sim/index.ts';
import baseConfig from '../../src/winrate/config.json' with { type: 'json' };

const CFG = baseConfig as unknown as DynamicsConfig;
const near = (x: number, y: number, eps: number, msg?: string) => assert.ok(Math.abs(x - y) < eps, `${msg ?? ''} ${x} ≠ ${y}`);
const member = (id: string, name: string, role: string, ltk: [string, string][], pool: [number, number][]): MaturationMember => ({
  id, name, role, ltk: ltk.map(([season, team]) => ({ season, team })), pool: pool.map(([championId, games]) => ({ championId, games })),
});
const META: MetaChampionLike[] = [
  { role: 'TOP', key: 68, name: 'ランブル', tier: 'A' }, { role: 'TOP', key: 2, name: 'オラフ', tier: 'B' },
  { role: 'JG', key: 64, name: 'リー・シン', tier: 'A' }, { role: 'MID', key: 1, name: 'アニー', tier: 'B' },
  { role: 'ADC', key: 22, name: 'アッシュ', tier: 'A' }, { role: 'SUP', key: 412, name: 'スレッシュ', tier: 'A' },
];
// 5 人: A と B は S3 の CC、A と C は S2 の DD で一緒。B と D は同じ S3 でも別のチーム、C と D は同じ DD でも別のシーズン。E は記録なし
const MEMBERS: MaturationMember[] = [
  member('X-TOP', '甲', 'TOP', [['S3', 'CC'], ['S2', 'DD'], ['S2', 'DD']], [[68, 5], [2, 3], [999, 10]]),
  member('X-JG', '乙', 'JG', [['S3', 'CC']], [[64, 2]]),
  member('X-MID', '丙', 'MID', [['S2', 'DD']], [[68, 4], [1, 3]]),
  member('X-ADC', '丁', 'ADC', [['S3', 'DD']], []),
  member('X-SUP', '戊', 'SUP', [], [[412, 6]]),
];

test('基準10: τ = tau0 × (1 + a × (1 − c)) × (1 + b × (1 − m))。仕様の計算の例(c 0.0・m 0.3 → 5.10、c 0.6・m 0.8 → 2.52)', () => {
  assert.deepEqual(baseConfig.maturation, { max: 0.2, tau0: 1.5, a: 1.0, b: 1.0 });
  assert.deepEqual(baseConfig.metaFit, { wPool: 0.5, wStyle: 0.5, poolNorm: 3.0 });
  assert.equal(baseConfig.unvalidatedCap, 0.1);
  near(tauOf(0.0, 0.3), 5.1, 1e-9, 'CC');
  near(tauOf(0.6, 0.8), 2.52, 1e-9, 'DD');
  near(tauOf(1, 1), 1.5, 1e-9, '最速');
  near(tauOf(0, 0), 6.0, 1e-9, '最遅');
  // c と m が高いほど τ が小さい(早く仕上がる)
  assert.ok(tauOf(0.8, 0.5) < tauOf(0.2, 0.5) && tauOf(0.5, 0.8) < tauOf(0.5, 0.2));
  near(tauOf(0.3, 0.3, { ...CFG, maturation: { ...CFG.maturation, a: 0, b: 0 } }), 1.5, 1e-9, 'a・b が 0 なら tau0');
});

test('基準9: 仕上がりの項は M × (1 − exp(−d ÷ τ))。d = 0 で 0、仕様の例の第4日(d = 3)は 0.089 と 0.139', () => {
  assert.equal(maturationTerm({ tau: 5.1 }, 0), 0);
  near(maturationTerm({ tau: 5.1 }, 3), 0.089, 0.001, 'CC');
  near(maturationTerm({ tau: 2.52 }, 3), 0.139, 0.001, 'DD');
  // d が進むほど大きく、上限は M(初期値 0.20)
  assert.ok(maturationTerm({ tau: 2.52 }, 1) < maturationTerm({ tau: 2.52 }, 2) && maturationTerm({ tau: 2.52 }, 2) < maturationTerm({ tau: 2.52 }, 6));
  assert.ok(maturationTerm({ tau: 1.5 }, 100) <= 0.2 && maturationTerm({ tau: 1.5 }, 100) > 0.199);
  near(maturationTerm({ tau: 2.52 }, 3, { ...CFG, maturation: { ...CFG.maturation, max: 0.4 } }), 0.278, 0.001, 'M を 0.4 に');
  // τ が無い・0 以下なら 0(壊れた入力で NaN を出さない)
  assert.equal(maturationTerm({ tau: 0 }, 3), 0);
  assert.equal(maturationTerm({ tau: Number.NaN }, 3), 0);
});

test('基準11(関数だけ): 気持ちの補正は k が 2 以上で −min(cap 0.15, perLoss 0.05 × (k − 1))、それ以外は 0', () => {
  assert.deepEqual(baseConfig.mood, { cap: 0.15, perLoss: 0.05 });
  assert.equal(moodTerm(0), 0);
  assert.equal(moodTerm(1), 0);
  near(moodTerm(2), -0.05, 1e-12);
  near(moodTerm(3), -0.1, 1e-12);
  near(moodTerm(4), -0.15, 1e-12);
  near(moodTerm(10), -0.15, 1e-12, '上限');
});

test('基準13: 対数オッズの加算は仕上がりの項の差と気持ちの補正の差で、項ごとに ±unvalidatedCap(0.10)に切り詰める。仕様の例の差 −0.050 は切り詰めない', () => {
  const CC = { tau: 5.1 }, DD = { tau: 2.52 };
  near(dayShift(CC, DD, 3, 3), -0.0503, 0.001, '仕様の例');
  near(dayShift(DD, CC, 3, 3), 0.0503, 0.001, '向きを変えれば符号が変わる');
  assert.equal(dayShift(CC, DD, 0, 0), 0);
  // M を大きくすると差が 0.10 を超え、切り詰めが起きる
  const big = { ...CFG, maturation: { ...CFG.maturation, max: 0.5 } };
  near(maturationTerm(CC, 3, big) - maturationTerm(DD, 3, big), -0.126, 0.001, '切り詰める前');
  assert.equal(dayShift(CC, DD, 3, 3, { config: big }), -0.1);
  assert.equal(dayShift(DD, CC, 3, 3, { config: big }), 0.1);
  // 気持ちの補正の差も ±0.10 に切り詰める(連敗 4 の −0.15 は −0.10 に)
  assert.equal(dayShift(CC, CC, 0, 0, { kA: 4 }), -0.1);
  assert.equal(dayShift(CC, CC, 0, 0, { kB: 4 }), 0.1);
  near(dayShift(CC, CC, 0, 0, { kA: 2 }), -0.05, 1e-12);
  // 2 つの項は別々に切り詰めてから足す
  near(dayShift(CC, DD, 3, 3, { config: big, kA: 4 }), -0.2, 1e-12);
  const cap = { ...CFG, unvalidatedCap: 0.02 };
  assert.equal(dayShift(CC, DD, 3, 3, { config: cap }), -0.02);
});

test('基準9: 試合日の勝率は事前の勝率の対数オッズに加算を加えた値。仕様の例 41.5% − 0.050 → 40.3%。加算 0 なら同じ、0・1 はそのまま', () => {
  near(winProbOnDay(0.415, 0), 0.415, 1e-12);
  assert.deepEqual(percentPair(winProbOnDay(0.415, dayShift({ tau: 5.1 }, { tau: 2.52 }, 3, 3))), [40.3, 59.7]);
  assert.deepEqual(percentPair(winProbOnDay(0.5, 0.1)), [52.5, 47.5]);
  assert.equal(winProbOnDay(0, 0.5), 0);
  assert.equal(winProbOnDay(1, -0.5), 1);
  assert.deepEqual(percentPair(0.4153), [41.5, 58.5]);
  assert.deepEqual(percentPair(0.5), [50, 50]);
});

test('用語「共同プレイ歴 c」: 10 組のうち同じシーズンに同じチームだった組の割合。同じシーズンの別チーム・別シーズンの同じチームは数えない。重複の記録は 1 回', () => {
  const { c, pairs } = coPlayOf(MEMBERS);
  assert.equal(c, 0.2);
  assert.deepEqual(pairs, [{ a: '甲', b: '乙', shared: ['S3 CC'] }, { a: '甲', b: '丙', shared: ['S2 DD'] }]);
  assert.deepEqual(coPlayOf([]), { c: 0, pairs: [] });
  // 5 人全員が S3 の CC なら 10 組すべて(c = 1.0)。2 シーズン一緒なら shared に 2 つ
  const all = ['TOP', 'JG', 'MID', 'ADC', 'SUP'].map((r, i) => member(`Y-${r}`, `選手${i}`, r, [['S3', 'CC'], ['S2', 'CC']], []));
  const full = coPlayOf(all);
  assert.equal(full.c, 1);
  assert.equal(full.pairs.length, 10);
  assert.deepEqual(full.pairs[0].shared, ['S2 CC', 'S3 CC']);
});

test('用語「チャンピオンの近さ m_pool」: 大会のロールで 3 試合以上のピックプールのうち、同じロールのメタの重要チャンピオン(段階A 1.0・B 0.5)の重みの合計 ÷ (5 × poolNorm 3.0)、1 で頭打ち。メタの一覧が無ければ 0.5', () => {
  const { mPool, hits, note } = poolFitOf(MEMBERS, META);
  // 甲: ランブル A + オラフ B、乙: リー・シン 2 試合は数えない、丙: ランブルは TOP の一覧なので MID では数えない + アニー B、丁: プールなし、戊: スレッシュ A
  assert.deepEqual(hits.map((h) => `${h.name}:${h.champion}:${h.tier}:${h.weight}:${h.games}`), ['甲:ランブル:A:1:5', '甲:オラフ:B:0.5:3', '丙:アニー:B:0.5:3', '戊:スレッシュ:A:1:6']);
  assert.equal(hits[0].playerId, 'X-TOP');
  assert.equal(mPool, 0.2); // 3.0 ÷ 15
  assert.match(note ?? '', /ピックプールの無い選手: 丁/);
  // 頭打ち
  assert.equal(poolFitOf(MEMBERS, META, { ...CFG, metaFit: { ...CFG.metaFit, poolNorm: 0.5 } }).mPool, 1);
  assert.equal(poolFitOf(MEMBERS, META, { ...CFG, metaFit: { ...CFG.metaFit, poolNorm: 6.0 } }).mPool, 0.1);
  // メタの一覧が無い(null・undefined)なら 0.5 と理由
  for (const none of [null, undefined]) {
    const r = poolFitOf(MEMBERS, none);
    assert.equal(r.mPool, 0.5);
    assert.deepEqual(r.hits, []);
    assert.match(r.note ?? '', /メタの一覧が無い/);
  }
  assert.deepEqual(poolFitOf([], META), { mPool: 0, hits: [], note: null });
});

test('基準10・12: 階級チームの仕上がりは c・m_pool と内訳・m(m_style が無い間は m = m_pool)・τ・確度「低」・理由を持つ', () => {
  const x = maturationOf(MEMBERS, META);
  assert.equal(x.c, 0.2);
  assert.equal(x.cPairs.length, 2);
  assert.equal(x.mPool, 0.2);
  assert.equal(x.mPoolHits.length, 4);
  assert.equal(x.mStyle, null);
  assert.equal(x.m, 0.2);
  near(x.tau, tauOf(0.2, 0.2), 1e-3, 'τ');
  near(x.tau, 4.86, 1e-9, 'τ = 1.5 × 1.8 × 1.8(小数第三位)');
  assert.equal(x.confidence, '低');
  assert.match(x.note, /mainstreamStyle/);
  assert.match(x.note, /m = m_pool/);
  assert.match(x.note, /±0\.10/);
  assert.match(x.note, /S1〜S3/);
  assert.match(x.note, /丁/);
  // 選手が無い(勝率表の土台のテストなど)なら c = 0。メタの一覧も無ければ m_pool = 0.5 で τ = 1.5 × 2 × 1.5 = 4.5
  const none = maturationOf(undefined, null);
  assert.equal(none.c, 0);
  assert.equal(none.mPool, 0.5);
  assert.equal(none.m, 0.5);
  assert.equal(none.tau, 4.5);
  assert.match(none.note, /選手の記録が無い/);
  assert.match(none.note, /メタの一覧が無い/);
  assert.equal(maturationOf(undefined, META).mPool, 0);
});

// 勝率表の土台: NEXT の 4 チーム(仕様の計算の例の S)。CC は全員が S3 の CC で得意ピックがメタ、DD は記録も当たりも無い
const S: Record<TeamId, number> = { CC: 5.285, DD: 5.716, IT: 4.972, LR: 5.188 };
const roster = (prefix: string, ltk: [string, string][], pool: [number, number][]) =>
  ['TOP', 'JG', 'MID', 'ADC', 'SUP'].map((r, i) => member(`${prefix}-${r}`, `${prefix}${i}`, r, ltk, pool.length ? [pool[i]] : []));
const CC_MEMBERS = roster('CC', [['S3', 'CC']], [[68, 5], [64, 5], [1, 5], [22, 5], [412, 5]]);
const teams = (withMembers: boolean): TierTeamS[] =>
  TIERS.flatMap((tier) => TEAMS.map((team): TierTeamS => ({
    team, tier, S: tier === 'NEXT' ? S[team] : 6.0,
    ...(withMembers && tier === 'NEXT' && team === 'CC' ? { members: CC_MEMBERS } : {}),
    ...(withMembers && tier === 'NEXT' && team === 'DD' ? { members: roster('DD', [], []) } : {}),
  })));

test('基準9・12: 勝率表のファイルは階級チームごとに maturation を持ち、試合ごとの事前の勝率(d = 0)は仕上がりの材料の有無で変わらない', () => {
  const plain = computePriorWinrates(teams(false));
  const out = computePriorWinrates(teams(true), { meta: META });
  assert.deepEqual(out.matches, plain.matches, '事前の勝率は d = 0 のまま');
  assert.deepEqual(out.winTable, plain.winTable);
  assert.ok(out.teams.every((t) => t.maturation && t.maturation.confidence === '低' && Number.isFinite(t.maturation.tau)));
  const cc = out.teams.find((t) => t.key === 'CC-NEXT')!.maturation;
  assert.equal(cc.c, 1);
  assert.equal(cc.cPairs.length, 10);
  // A 1.0 × 4(ランブル・リー・シン・アッシュ・スレッシュ)+ B 0.5(アニー)= 4.5 ÷ 15 = 0.3
  assert.equal(cc.mPool, 0.3);
  assert.deepEqual(cc.mPoolHits.map((h) => h.champion), ['ランブル', 'リー・シン', 'アニー', 'アッシュ', 'スレッシュ']);
  assert.equal(cc.m, 0.3);
  near(cc.tau, 1.5 * 1.0 * 1.7, 1e-9, 'CC の τ');
  const dd = out.teams.find((t) => t.key === 'DD-NEXT')!.maturation;
  assert.equal(dd.c, 0);
  assert.equal(dd.mPool, 0);
  assert.equal(dd.tau, 6);
  // メタの一覧を渡さなければ m_pool = 0.5(中立)で理由が残る
  const noMeta = computePriorWinrates(teams(true));
  const cc2 = noMeta.teams.find((t) => t.key === 'CC-NEXT')!.maturation;
  assert.equal(cc2.mPool, 0.5);
  assert.deepEqual(cc2.mPoolHits, []);
  assert.match(cc2.note, /メタの一覧が無い/);
  // 評価設定で τ の係数を変えられる
  const cfg = { ...baseConfig, maturation: { ...baseConfig.maturation, tau0: 3.0 } } as unknown as WinrateConfig;
  near(computePriorWinrates(teams(true), { meta: META, config: cfg }).teams.find((t) => t.key === 'CC-NEXT')!.maturation.tau, 3.0 * 1.7, 1e-9);
  // 同じ入力からは同じ出力
  assert.deepEqual(computePriorWinrates(teams(true), { meta: META }), out);
});

test('用語「経過した試合日の数 d」: その日より前にその階級チームが本番を戦った試合日の数。Regular Stage は毎日全チーム、MASTERS CUP も全チーム。Playoffs の初日は 6(NEXT・CORE)と 3(MASTERS)', () => {
  assert.equal(PLAYOFFS_DATE, '2026-11-21');
  for (const team of TEAMS) {
    for (const tier of ['NEXT', 'CORE'] as const) {
      assert.equal(daysPlayedBefore(tier, team, '2026-10-15'), 0, `${team} ${tier} 第1日`);
      assert.equal(daysPlayedBefore(tier, team, '2026-10-19'), 1);
      assert.equal(daysPlayedBefore(tier, team, '2026-10-27'), 3, `${team} ${tier} 第4日`);
      assert.equal(daysPlayedBefore(tier, team, '2026-11-06'), 5);
      assert.equal(daysPlayedBefore(tier, team, PLAYOFFS_DATE), 6);
    }
    assert.equal(daysPlayedBefore('MASTERS', team, '2026-10-20'), 0, `${team} CUP 1`);
    assert.equal(daysPlayedBefore('MASTERS', team, '2026-10-28'), 1);
    assert.equal(daysPlayedBefore('MASTERS', team, '2026-11-09'), 2);
    assert.equal(daysPlayedBefore('MASTERS', team, PLAYOFFS_DATE), 3);
  }
});

test('基準9・13・16: 試合日の勝率は両チームの τ と戦力 S がそろうときだけ動く。同じ τ なら動かず、初日(d = 0)は事前の勝率のまま、τ の小さいチームは日が進むと有利になる', () => {
  const out = computePriorWinrates(teams(true), { meta: META });
  const prior = out.winTable.NEXT['CC>DD'];
  near(prior, 0.415, 1e-9, '事前の勝率');
  // 初日
  const day1 = dayWinrate(out.teams, 'NEXT', 'CC', 'DD', prior, '2026-10-15');
  assert.equal(day1.applied, true);
  assert.deepEqual([day1.dA, day1.dB, day1.shift, day1.termA, day1.termB], [0, 0, 0, 0, 0]);
  assert.equal(day1.p, prior);
  assert.equal(day1.a?.tau, out.teams.find((t) => t.key === 'CC-NEXT')!.maturation.tau);
  // 第4日(d = 3): τ の小さい CC が有利に。差は切り詰めの中
  const day4 = dayWinrate(out.teams, 'NEXT', 'CC', 'DD', prior, '2026-10-27');
  assert.deepEqual([day4.dA, day4.dB], [3, 3]);
  assert.ok(day4.shift > 0 && day4.shift <= 0.1, `加算 ${day4.shift}`);
  near(day4.shift, maturationTerm({ tau: 2.55 }, 3) - maturationTerm({ tau: 6 }, 3), 1e-9);
  near(day4.p, winProbOnDay(prior, day4.shift), 1e-12);
  assert.ok(day4.p > prior);
  // 向きを変えれば逆の値(和が 1)
  const rev = dayWinrate(out.teams, 'NEXT', 'DD', 'CC', 1 - prior, '2026-10-27');
  near(rev.p, 1 - day4.p, 1e-9);
  // 全試合日で CC は事前より上
  for (const date of ['2026-10-19', '2026-10-23', '2026-10-27', '2026-11-02', '2026-11-06', PLAYOFFS_DATE]) {
    assert.ok(dayWinrate(out.teams, 'NEXT', 'CC', 'DD', prior, date).p > prior, date);
  }
  // 同じ τ(IT と LR は材料が無く、どちらも τ 6.0)なら、日が進んでも動かない
  const same = dayWinrate(out.teams, 'NEXT', 'IT', 'LR', out.winTable.NEXT['IT>LR'], '2026-11-06');
  assert.equal(same.applied, true);
  assert.equal(same.shift, 0);
  assert.equal(same.p, out.winTable.NEXT['IT>LR']);
  // 基準16: 戦力 S を計算できない試合(50.0%)は動かさない
  const noS = computePriorWinrates(teams(true).map((t) => (t.team === 'DD' && t.tier === 'NEXT' ? { ...t, S: null, reason: '評価の無い選手: SHAKA' } : t)), { meta: META });
  const half = dayWinrate(noS.teams, 'NEXT', 'CC', 'DD', 0.5, '2026-10-27');
  assert.equal(half.applied, false);
  assert.equal(half.p, 0.5);
  assert.equal(half.shift, 0);
  // 仕上がりの無い勝率表(Task-3 より前の形)でも動かない
  const old = out.teams.map(({ maturation: _m, ...t }) => t);
  const none = dayWinrate(old, 'NEXT', 'CC', 'DD', prior, '2026-10-27');
  assert.equal(none.applied, false);
  assert.equal(none.p, prior);
  assert.equal(none.a, null);
});
