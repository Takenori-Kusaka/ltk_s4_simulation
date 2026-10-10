// F-005 Task-3(2 本目): 受入基準 9・12・13 の画面側。試合日ごとの勝率を日程の箱・順位表・期待勝ち数・M3/M4・シミュレーション・根拠のストーリーで使う
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computePriorWinrates, type TierTeamS } from '../../src/winrate/core.ts';
import { dayWinrate, percentPair, PLAYOFFS_DATE, type MaturationMember, type MetaChampionLike } from '../../src/winrate/dynamics.ts';
import { simulate, TEAMS, TIERS, type TeamId, type Tier, type WinTable } from '../../src/sim/index.ts';
import { MASTERS_CUPS, REGULAR_DAYS } from '../../src/sim/schedule.ts';
import { dayWinTables, playoffWinTable, runSimulation, SIM_SEED, SIM_TRIALS, type WinratesFile } from '../../src/app/sim/view.ts';
import { dayBox, dayPercent, expectedWins, predictedResult, predictedWinner, standings } from '../../src/app/schedule/view.ts';
import { tierTeamMatches } from '../../src/app/schedule/fan.ts';
import { EXCLUDED, INCLUDED, matchStory, type PlayerLike, type StoryInput, type TeamEvalLike } from '../../src/app/story/story.ts';
import { winRateMetaView } from '../../src/app/meta/winrate.ts';

const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const near = (x: number, y: number, eps: number, msg?: string) => assert.ok(Math.abs(x - y) < eps, `${msg ?? ''} ${x} ≠ ${y}`);
const tenths = (p: number) => Math.round(p * 10);

// 勝率表のファイル: CC-NEXT と DD-MASTERS は全員が過去に同じチームで得意ピックがメタ(τ 小)、DD-NEXT と CC-MASTERS は記録も当たりも無い(τ 6.0)。ほかは材料なし(τ 6.0 で同じ)
const META: MetaChampionLike[] = [
  { role: 'TOP', key: 68, name: 'ランブル', tier: 'A' }, { role: 'JG', key: 64, name: 'リー・シン', tier: 'A' }, { role: 'MID', key: 1, name: 'アニー', tier: 'B' },
  { role: 'ADC', key: 22, name: 'アッシュ', tier: 'A' }, { role: 'SUP', key: 412, name: 'スレッシュ', tier: 'A' },
];
const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];
const PICKS: [number, number][] = [[68, 5], [64, 5], [1, 5], [22, 5], [412, 5]];
const roster = (prefix: string, together: boolean, meta: boolean): MaturationMember[] =>
  ROLES.map((role, i) => ({ id: `${prefix}-${role}`, name: `${prefix}${i}`, role, ltk: together ? [{ season: 'S3', team: prefix.split('-')[0] }] : [], pool: meta ? [{ championId: PICKS[i][0], games: PICKS[i][1] }] : [] }));
const S: Record<Tier, Record<TeamId, number>> = {
  NEXT: { DD: 5.7, CC: 5.3, IT: 5.0, LR: 5.2 },
  CORE: { DD: 6.0, CC: 6.8, IT: 6.5, LR: 6.2 },
  MASTERS: { DD: 7.1, CC: 6.8, IT: 6.6, LR: 6.7 },
};
const teams: TierTeamS[] = TIERS.flatMap((tier) => TEAMS.map((team): TierTeamS => {
  const fast = (tier === 'NEXT' && team === 'CC') || (tier === 'MASTERS' && team === 'DD');
  const slow = (tier === 'NEXT' && team === 'DD') || (tier === 'MASTERS' && team === 'CC');
  return { team, tier, S: S[tier][team], ...(fast || slow ? { members: roster(`${team}-${tier}`, fast, fast) } : {}) };
}));
const file: WinratesFile = { ...computePriorWinrates(teams, { meta: META }), computedAt: '2026-10-10T10:00:00.000Z', configVersion: 'abcdef012345', results: null };
// Task-3 より前の形(仕上がりが無い)の勝率表
const old: WinratesFile = { ...file, teams: file.teams.map(({ maturation: _m, ...t }) => t) as WinratesFile['teams'] };
const regular = (day: number, tier: Tier, a: TeamId, b: TeamId) => file.matches.find((m) => m.stage === 'regular' && m.day === day && m.tier === tier && m.a === a && m.b === b)!;
const dateOf = (day: number) => REGULAR_DAYS.find((d) => d.day === day)!.date;

test('土台: CC-NEXT と DD-MASTERS の τ は小さく、DD-NEXT と CC-MASTERS は 6.0、材料の無い階級チームも 6.0', () => {
  const tau = (key: string) => file.teams.find((t) => t.key === key)!.maturation.tau;
  assert.ok(tau('CC-NEXT') < 3 && tau('DD-MASTERS') < 3, `${tau('CC-NEXT')} / ${tau('DD-MASTERS')}`);
  assert.equal(tau('DD-NEXT'), 6);
  assert.equal(tau('CC-MASTERS'), 6);
  assert.equal(tau('IT-NEXT'), 6);
  assert.equal(tau('LR-CORE'), 6);
});

test('基準9: 試合日の勝率(dayPercent)は 0.1% 単位で和が 100.0。初日は事前の勝率のまま、τ の小さい側は日が進むと上がる。仕上がりの無い勝率表では事前の勝率のまま', () => {
  const m1 = regular(1, 'NEXT', 'CC', 'DD');
  const d1 = dayPercent(file, 'NEXT', 'CC', 'DD', m1.pA / 100, dateOf(1));
  assert.deepEqual([d1.pA, d1.pB], [m1.pA, m1.pB]);
  assert.ok(d1.maturation);
  assert.deepEqual([d1.maturation.dA, d1.maturation.dB, d1.maturation.shift], [0, 0, 0]);
  // 第4日は DD(ブルー)対 CC(レッド)。CC の勝率は事前より上がる
  const m4 = regular(4, 'NEXT', 'DD', 'CC');
  const d4 = dayPercent(file, 'NEXT', 'DD', 'CC', m4.pA / 100, dateOf(4));
  assert.equal(tenths(d4.pA) + tenths(d4.pB), 1000);
  assert.ok(d4.pB > m4.pB, `CC ${d4.pB} > ${m4.pB}`);
  const expect = percentPair(dayWinrate(file.teams, 'NEXT', 'DD', 'CC', m4.pA / 100, dateOf(4)).p);
  assert.deepEqual([d4.pA, d4.pB], expect);
  assert.ok(d4.maturation);
  assert.deepEqual([d4.maturation.dA, d4.maturation.dB], [3, 3]);
  assert.equal(d4.maturation.pPriorA, m4.pA);
  assert.ok(d4.maturation.shift < 0 && d4.maturation.shift >= -0.1);
  assert.equal(d4.maturation.a.tau, 6);
  assert.ok(d4.maturation.b.tau < 3);
  // 同じ τ の組(IT 対 LR)は動かない
  const m = regular(4, 'NEXT', 'LR', 'IT');
  assert.deepEqual([dayPercent(file, 'NEXT', 'LR', 'IT', m.pA / 100, dateOf(4)).pA, dayPercent(file, 'NEXT', 'LR', 'IT', m.pA / 100, dateOf(4)).pB], [m.pA, m.pB]);
  // 仕上がりの無い勝率表
  const o = dayPercent(old, 'NEXT', 'DD', 'CC', m4.pA / 100, dateOf(4));
  assert.deepEqual([o.pA, o.pB], [m4.pA, m4.pB]);
  assert.equal(o.maturation, undefined);
});

test('基準9(日程の箱): 行の勝率はその試合日の値。初日は matches の pA・pB そのもの、第4日の CC-NEXT は事前より上。行は根拠の節へ渡す仕上がりを持つ', () => {
  const day1 = dayBox(file, { kind: 'regular', day: 1, date: dateOf(1) });
  const n1 = day1.boxes[0].rows[0];
  const m1 = regular(1, 'NEXT', 'CC', 'DD');
  assert.equal(n1.blue.p, m1.pA.toFixed(1));
  assert.equal(n1.red.p, m1.pB.toFixed(1));
  assert.ok(n1.maturation);
  assert.equal(n1.maturation.dA, 0);
  const day4 = dayBox(file, { kind: 'regular', day: 4, date: dateOf(4) });
  const row = day4.boxes.flatMap((b) => b.rows).find((r) => r.tier === 'NEXT' && r.blue.team === 'DD' && r.red.team === 'CC')!;
  const m4 = regular(4, 'NEXT', 'DD', 'CC');
  const expect = dayPercent(file, 'NEXT', 'DD', 'CC', m4.pA / 100, dateOf(4));
  assert.equal(row.red.p, expect.pB.toFixed(1));
  assert.equal(row.blue.pNum + row.red.pNum, 100);
  assert.ok(row.red.pNum > m4.pB);
  assert.deepEqual(row.maturation, expect.maturation);
  assert.equal(row.pLane, m4.pLaneA, 'レーン相対の勝率は事前のまま');
  // 仕上がりの無い勝率表では従来どおり
  const o = dayBox(old, { kind: 'regular', day: 4, date: dateOf(4) }).boxes.flatMap((b) => b.rows).find((r) => r.tier === 'NEXT' && r.blue.team === 'DD')!;
  assert.equal(o.red.p, m4.pB.toFixed(1));
  assert.equal(o.maturation, undefined);
});

test('基準9(MASTERS CUP): 準決勝の行と、予想の組み合わせ M3・M4 の勝率はそのカップの日の値(CUP 2 は d = 1)', () => {
  const cup2 = MASTERS_CUPS.find((c) => c.cup === 2)!;
  const box = dayBox(file, { kind: 'masters', cup: 2, date: cup2.date });
  const semi = box.boxes[1].rows[0]; // CC 対 LR
  const m = file.matches.find((x) => x.stage === 'masters' && x.cup === 2 && x.a === 'CC' && x.b === 'LR')!;
  const expect = dayPercent(file, 'MASTERS', 'CC', 'LR', m.pA / 100, cup2.date);
  assert.equal(semi.blue.p, expect.pA.toFixed(1));
  assert.ok(semi.maturation && semi.maturation.dA === 1 && semi.maturation.dB === 1);
  // CC-MASTERS(τ 6.0)は LR(τ 6.0)と同じ速さなので動かないが、DD(τ 小)の試合は動く
  assert.equal(semi.blue.p, m.pA.toFixed(1));
  const dd = box.boxes[0].rows[0]; // DD 対 IT
  const mdd = file.matches.find((x) => x.stage === 'masters' && x.cup === 2 && x.a === 'DD' && x.b === 'IT')!;
  assert.ok(dd.blue.pNum > mdd.pA, `DD ${dd.blue.pNum} > ${mdd.pA}`);
  for (const b of box.boxes.slice(2)) {
    const r = b.rows[0];
    const [a, c] = [r.blue.team, r.red.team];
    const prior = file.stageWinTables.masters.MASTERS[`${a}>${c}`];
    const e = dayPercent(file, 'MASTERS', a, c, prior, cup2.date);
    assert.equal(r.blue.p, e.pA.toFixed(1), b.label);
    assert.ok(r.maturation && r.maturation.dA === 1, b.label);
  }
});

test('基準9(順位表・期待勝ち数): 予想の結果と期待勝ち数は試合日の勝率から作る', () => {
  const pr = predictedResult(file);
  for (const d of REGULAR_DAYS) {
    for (const card of d.cards) {
      for (const tier of ['NEXT', 'CORE'] as const) {
        const m = regular(d.day, tier, card.blue, card.red);
        const p = dayPercent(file, tier, card.blue, card.red, m.pA / 100, d.date);
        const w = predictedWinner(file, tier, card.blue, card.red, p.pA, p.pB);
        // 勝者は試合日の勝率の高い側(同率は S)
        assert.equal(w, p.pA > p.pB ? card.blue : p.pB > p.pA ? card.red : w);
      }
    }
  }
  for (const tier of ['NEXT', 'CORE'] as const) {
    assert.equal(TEAMS.reduce((s, t) => s + pr.wins[t][tier], 0), 12);
    let sum = 0;
    for (const d of REGULAR_DAYS) {
      const card = d.cards.find((c) => c.blue === 'CC' || c.red === 'CC')!;
      const m = regular(d.day, tier, card.blue, card.red);
      const p = dayPercent(file, tier, card.blue, card.red, m.pA / 100, d.date);
      sum += card.blue === 'CC' ? p.pA : p.pB;
    }
    near(expectedWins(file, 'CC', tier), sum / 100, 1e-9, tier);
    const fan = tierTeamMatches(file, 'CC', tier);
    assert.equal(fan.expected, (sum / 100).toFixed(1));
    for (const r of fan.rows) {
      const day = REGULAR_DAYS.find((d) => d.date === r.date)!;
      const card = day.cards.find((c) => c.blue === 'CC' || c.red === 'CC')!;
      const m = regular(day.day, tier, card.blue, card.red);
      const p = dayPercent(file, tier, card.blue, card.red, m.pA / 100, day.date);
      assert.equal(r.p, (card.blue === 'CC' ? p.pA : p.pB).toFixed(1), `${tier} ${r.label}`);
    }
  }
  // NEXT の CC は第4日以降に事前より高い値になる(τ 小)
  const next = tierTeamMatches(file, 'CC', 'NEXT').rows;
  const m4 = regular(4, 'NEXT', 'DD', 'CC');
  assert.ok(next[3].pNum > m4.pB);
  assert.ok(expectedWins(file, 'CC', 'NEXT') > expectedWins(old, 'CC', 'NEXT'));
  const table = standings(file, runSimulation(file));
  assert.equal(table.rows.length, 4);
  assert.equal(table.rows.find((r) => r.team === 'CC')!.nextWL, `${pr.wins.CC.NEXT} - ${6 - pr.wins.CC.NEXT}`);
});

test('基準9(シミュレーション): 試合日ごとの勝率表(Regular Stage の日・MASTERS CUP のカップ)と Playoffs の表を F-001 の模擬に渡す。仕上がりの無い勝率表では従来と同じ結果', () => {
  const tables = dayWinTables(file);
  assert.deepEqual(Object.keys(tables.regular).map(Number), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(Object.keys(tables.masters).map(Number), [1, 2, 3]);
  // 第1日はステージの表のまま、第4日の CC 対 DD(NEXT)は試合日の値
  assert.deepEqual(tables.regular[1], file.stageWinTables.regular);
  const m4 = regular(4, 'NEXT', 'DD', 'CC');
  const e4 = dayPercent(file, 'NEXT', 'CC', 'DD', file.stageWinTables.regular.NEXT['CC>DD'], dateOf(4));
  near(tables.regular[4].NEXT['CC>DD'], e4.pA / 100, 1e-9);
  assert.ok(tables.regular[4].NEXT['CC>DD'] > 1 - m4.pA / 100, 'CC(τ 小)が第4日に上がる');
  assert.equal(tables.regular[4].CORE['CC>DD'], file.stageWinTables.regular.CORE['CC>DD'], 'CORE は材料が無く動かない');
  const cup3 = MASTERS_CUPS.find((c) => c.cup === 3)!;
  const e3 = dayPercent(file, 'MASTERS', 'CC', 'DD', file.stageWinTables.masters.MASTERS['CC>DD'], cup3.date);
  near(tables.masters[3].MASTERS['CC>DD'], e3.pA / 100, 1e-9);
  assert.ok(tables.masters[3].MASTERS['CC>DD'] < file.stageWinTables.masters.MASTERS['CC>DD'], 'DD(τ 小)が上がる');
  // Playoffs は初日(11/21)までの試合日の数で作る
  const po = playoffWinTable(file);
  const ep = dayPercent(file, 'NEXT', 'CC', 'DD', file.stageWinTables.playoffs.NEXT['CC>DD'], PLAYOFFS_DATE);
  near(po.NEXT['CC>DD'], ep.pA / 100, 1e-9);
  assert.ok(ep.maturation && ep.maturation.dA === 6);
  // どの表も F-001 の検証に通る
  for (const t of [...Object.values(tables.regular), ...Object.values(tables.masters), po] as WinTable[]) {
    for (const tier of TIERS) for (const a of TEAMS) for (const b of TEAMS) if (a < b) assert.ok(t[tier][`${a}>${b}`] >= 0 && t[tier][`${a}>${b}`] <= 1);
  }
  const sim = runSimulation(file);
  assert.equal(sim.trials, SIM_TRIALS);
  const direct = simulate({ winTable: file.winTable, stageWinTables: { ...file.stageWinTables, playoffs: po }, dayWinTables: tables, seed: SIM_SEED, trials: SIM_TRIALS });
  assert.deepEqual(sim, direct);
  const plain = simulate({ winTable: file.winTable, stageWinTables: file.stageWinTables, seed: SIM_SEED, trials: SIM_TRIALS });
  assert.notDeepEqual(sim, plain, 'τ の違いが模擬に入る');
  assert.ok(sim.expectedRegularPoints.CC > plain.expectedRegularPoints.CC, 'CC-NEXT の仕上がりが速い分、CC の期待 pt が上がる');
  // 仕上がりの無い勝率表では、従来の模擬と同じ
  const oldTables = dayWinTables(old);
  for (const t of Object.values(oldTables.regular)) assert.deepEqual(t, old.stageWinTables.regular);
  for (const t of Object.values(oldTables.masters)) assert.deepEqual(t, old.stageWinTables.masters);
  assert.deepEqual(playoffWinTable(old), old.stageWinTables.playoffs);
  assert.deepEqual(runSimulation(old), simulate({ winTable: old.winTable, stageWinTables: old.stageWinTables, seed: SIM_SEED, trials: SIM_TRIALS }));
});

// ---- 根拠のストーリー(基準 12) ----
const KEYS: [string, string][] = [
  ['ground', '地力'], ['laning', 'レーン戦'], ['teamfight', '集団戦'], ['synergy', '連携'], ['stability', '安定感'], ['pool', 'ピックプール'], ['shotcalling', 'コール力'], ['tournament', '大会経験'],
];
const player = (id: string, base: number): PlayerLike => ({ playerId: id, name: id, axes: KEYS.map(([key, label]) => ({ key, label, display: base })) });
const ratings = { kind: 'ratings', players: [...ROLES.map((r) => player(`CC-NEXT-${r}`, 6.0)), ...ROLES.map((r) => player(`DD-NEXT-${r}`, 7.0))] };
const teamEval: TeamEvalLike = { tierTeams: [{ team: 'CC', tier: 'NEXT', S: 5.3, coachC: 6.0, coachId: null }, { team: 'DD', tier: 'NEXT', S: 5.7, coachC: 6.0, coachId: null }] };
const m4 = regular(4, 'NEXT', 'DD', 'CC');
const e4 = dayPercent(file, 'NEXT', 'DD', 'CC', m4.pA / 100, dateOf(4));
const input: StoryInput = { tier: 'NEXT', a: 'DD', b: 'CC', pA: e4.pA, pB: e4.pB, pLane: m4.pLaneA, pMacro: m4.pMacroA, maturation: e4.maturation };

test('基準12: 根拠の節の「仕上がり」は両チームの仕上がりの項・τ・c と組・m とその内訳(m_pool と当たった選手とチャンピオン)・経過した試合日の数・気持ちの補正(0、連敗 0)・確度「低」と切り詰めの固定文を持つ。結論の勝率は試合日の値、掛け合わせの行は事前の値', () => {
  const s = matchStory(input, ratings, teamEval);
  assert.ok(s.ok);
  const mt = s.layers.maturation;
  assert.ok(mt, '仕上がりの小節');
  assert.equal(mt.a.d, '3');
  assert.equal(mt.b.d, '3');
  assert.match(mt.a.term, /^0\.\d{3}$/);
  assert.match(mt.b.term, /^0\.\d{3}$/);
  assert.ok(Number(mt.b.term) > Number(mt.a.term), 'CC(τ 小)の仕上がりの項が大きい');
  assert.equal(mt.a.tau, '6.00');
  assert.equal(mt.b.tau, e4.maturation!.b.tau.toFixed(2));
  assert.equal(mt.a.c, '0.0');
  assert.deepEqual(mt.a.cPairs, []);
  assert.equal(mt.b.c, '1.0');
  assert.equal(mt.b.cPairs.length, 10);
  assert.equal(mt.b.cPairs[0], 'CC-NEXT0 × CC-NEXT1(S3 CC)');
  assert.equal(mt.a.m, '0.00');
  assert.equal(mt.a.mPool, '0.00');
  assert.deepEqual(mt.a.mPoolHits, []);
  assert.equal(mt.b.m, '0.30');
  assert.equal(mt.b.mPool, '0.30');
  assert.deepEqual(mt.b.mPoolHits, ['CC-NEXT0: ランブル(段階A)', 'CC-NEXT1: リー・シン(段階A)', 'CC-NEXT2: アニー(段階B)', 'CC-NEXT3: アッシュ(段階A)', 'CC-NEXT4: スレッシュ(段階A)']);
  assert.equal(mt.a.mood, '0.00(連敗 0)');
  assert.equal(mt.b.mood, '0.00(連敗 0)');
  assert.match(mt.shift, /^-0\.\d{3}$/);
  assert.equal(Number(mt.shift), Math.round(e4.maturation!.shift * 1000) / 1000);
  assert.equal(mt.pDay, e4.pA.toFixed(1));
  assert.equal(mt.pPrior, m4.pA.toFixed(1));
  assert.equal(mt.confidence, '低');
  assert.ok(mt.notes.some((n) => /S1〜S3/.test(n) && /±0\.10/.test(n) && /確度/.test(n)));
  assert.ok(mt.notes.some((n) => /本番の結果が入るまで/.test(n) && /連敗 0/.test(n)));
  assert.ok(mt.notes.some((n) => /mainstreamStyle|主流の向き/.test(n)));
  assert.match(mt.summary, /Camellia Crown/);
  assert.match(mt.summary, /3 試合日/);
  // 結論の一文は試合日の勝率、3 行の掛け合わせは事前の勝率
  assert.match(s.headline, new RegExp(`\\(${e4.pB.toFixed(1)}%\\)|${e4.pA.toFixed(1)}%`));
  assert.equal(s.layers.combined.p, m4.pA.toFixed(1));
  assert.equal(s.layers.lane.p, m4.pLaneA.toFixed(1));
  // 固定の文: 仕上がりは「入っているもの」へ、気持ちの補正とドラフトは「まだ入っていないもの」のまま
  assert.ok(INCLUDED.some((t) => /仕上がり/.test(t) && /共同プレイ歴/.test(t) && /メタの近さ/.test(t)));
  assert.ok(!EXCLUDED.some((x) => /仕上がり/.test(x.text)));
  assert.ok(EXCLUDED.some((x) => /気持ち/.test(x.text) && /F-004/.test(x.feature)));
  assert.ok(EXCLUDED.some((x) => /ドラフト/.test(x.text)));
  const text = JSON.stringify(s);
  for (const w of ['β', '対数オッズ', '標準偏差']) assert.ok(!text.includes(w), w);
  // 仕上がりを渡さなければ小節は無く、掛け合わせの行は従来どおり pA
  const n = matchStory({ ...input, maturation: undefined }, ratings, teamEval);
  assert.ok(n.ok);
  assert.equal(n.layers.maturation, null);
  assert.equal(n.layers.combined.p, e4.pA.toFixed(1));
  // 初日(d = 0)は両方の項が 0 で、どちらが先に仕上がるかを示す
  const m1 = regular(1, 'NEXT', 'CC', 'DD');
  const e1 = dayPercent(file, 'NEXT', 'CC', 'DD', m1.pA / 100, dateOf(1));
  const first = matchStory({ tier: 'NEXT', a: 'CC', b: 'DD', pA: e1.pA, pB: e1.pB, maturation: e1.maturation }, ratings, teamEval);
  assert.ok(first.ok && first.layers.maturation);
  assert.deepEqual([first.layers.maturation.a.term, first.layers.maturation.b.term, first.layers.maturation.shift], ['0.000', '0.000', '+0.000']);
  assert.match(first.layers.maturation.summary, /初日/);
  assert.match(first.layers.maturation.summary, /Camellia Crown/);
});

test('基準12(表示): 3 行の下に「仕上がりを加えた、この試合日の勝率」、外部の見立ての後に「仕上がり」の小節。日程の箱は行の仕上がりを根拠の節へ渡す。禁止語は無い', () => {
  const svelte = src('../../src/app/story/MatchStory.svelte').replace(/<style[\s\S]*<\/style>/, '');
  const iComb = svelte.indexOf('掛け合わせた試合の勝率');
  const iDay = svelte.indexOf('仕上がりを加えた、この試合日の勝率');
  const iLaneTitle = svelte.indexOf('>レーン(個人)<');
  const iExtTitle = svelte.indexOf('外部の見立て(元プロ・解説)');
  const iMat = svelte.indexOf('仕上がり(試合日で変わる強さ)');
  const iScope = svelte.indexOf('この予想に入っているもの');
  assert.ok(iComb > 0 && iDay > iComb && iDay < iLaneTitle, '4 行目は掛け合わせの直後');
  assert.ok(iExtTitle > 0 && iMat > iExtTitle && iMat < iScope, '仕上がりの小節は外部の見立ての後、範囲の前');
  assert.match(svelte, /\{#if story\.layers\.maturation\}/);
  for (const k of ['.a.term', '.b.term', '.a.tau', '.a.cPairs', '.a.mPoolHits', '.a.mood', '.pDay', '.summary', '.notes']) assert.ok(svelte.includes(k), k);
  assert.match(svelte, /経過した試合日/);
  assert.match(svelte, /共同プレイ歴/);
  assert.match(svelte, /メタの近さ/);
  assert.match(svelte, /気持ちの補正/);
  for (const w of ['β', '対数オッズ', '標準偏差']) assert.ok(!svelte.includes(w), `MatchStory に ${w}`);
  const daybox = src('../../src/app/schedule/DayBox.svelte');
  const m = /<MatchStory input=\{\{([^}]*)\}\}/.exec(daybox);
  assert.ok(m && m[1].includes('maturation: r.maturation'), 'DayBox が仕上がりを渡す');
});

test('F-011 基準9: 勝率の計算がメタ(チャンピオンの近さ m_pool)を使うようになったので、メタのページは「使用中」と使い方を出す', () => {
  const v = winRateMetaView({ winRateImplemented: true });
  assert.equal(v.status, '使用中');
  assert.match(v.headline, /m_pool|チャンピオンの近さ/);
  assert.doesNotMatch(v.headline, /使っていない|まだ実装されていません/);
  assert.doesNotMatch(v.plannedLabel, /予定|未実装/);
  assert.ok(v.planned.some((r) => /m_style/.test(r.label) && /m = m_pool/.test(r.value)));
  const page = src('../../src/app/meta/MetaPage.svelte');
  assert.match(page, /winRateMetaView\(\{\s*winRateImplemented:\s*true\s*\}\)/);
});
