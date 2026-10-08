// F-001 Task-1: 受入基準 1〜5(QC-04)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGULAR_DAYS, MASTERS_CUPS } from '../../src/sim/schedule.ts';
import { TEAMS, TIERS } from '../../src/sim/types.ts';
import { scoreRegularCard, mastersCupPoints, computeSeeds } from '../../src/sim/standings.ts';

// 基準1: docs/research/format-history.md 節2.1 の表(左がブルー)
test('AC1: Regular Stage の6日・各日2カードとサイドが公式の表と一致する (QC-04)', () => {
  const expected = [
    [['CC', 'DD'], ['IT', 'LR']],
    [['CC', 'LR'], ['DD', 'IT']],
    [['LR', 'DD'], ['IT', 'CC']],
    [['LR', 'IT'], ['DD', 'CC']],
    [['IT', 'DD'], ['LR', 'CC']],
    [['CC', 'IT'], ['DD', 'LR']],
  ];
  const dates = ['2026-10-15', '2026-10-19', '2026-10-23', '2026-10-27', '2026-11-02', '2026-11-06'];
  assert.equal(REGULAR_DAYS.length, 6);
  REGULAR_DAYS.forEach((d, i) => {
    assert.equal(d.day, i + 1);
    assert.equal(d.date, dates[i]);
    assert.deepEqual(d.cards.map((c) => [c.blue, c.red]), expected[i]);
  });
});

test('AC1: 4チームと3階級の定義が公式発表と一致し、日程の全チームがそこに含まれる', () => {
  assert.deepEqual([...TEAMS], ['DD', 'CC', 'IT', 'LR']);
  assert.deepEqual([...TIERS], ['NEXT', 'CORE', 'MASTERS']);
  for (const d of REGULAR_DAYS) for (const c of d.cards) {
    assert.ok(TEAMS.includes(c.blue) && TEAMS.includes(c.red));
  }
});

test('AC1: 同じ相手と2回当たり、ブルーとレッドを1回ずつ受け持つ', () => {
  const seen = new Map<string, string[]>();
  for (const d of REGULAR_DAYS) for (const c of d.cards) {
    const key = [c.blue, c.red].sort().join('-');
    seen.set(key, [...(seen.get(key) ?? []), c.blue]);
  }
  assert.equal(seen.size, 6);
  for (const blues of seen.values()) {
    assert.equal(blues.length, 2);
    assert.notEqual(blues[0], blues[1]);
  }
});

test('AC3: MASTERS CUP の準決勝の組み合わせが固定値と一致する', () => {
  assert.deepEqual(MASTERS_CUPS.map((m) => m.date), ['2026-10-20', '2026-10-28', '2026-11-09']);
  assert.deepEqual(MASTERS_CUPS.map((m) => m.semis), [
    [['DD', 'CC'], ['IT', 'LR']],
    [['DD', 'IT'], ['CC', 'LR']],
    [['DD', 'LR'], ['CC', 'IT']],
  ]);
});

// 基準2
test('AC2: 両階級を同じチームが勝つと 3pt と 0pt (QC-04)', () => {
  assert.deepEqual(scoreRegularCard({ blue: 'CC', red: 'DD' }, 'CC', 'CC'), { CC: 3, DD: 0 });
  assert.deepEqual(scoreRegularCard({ blue: 'CC', red: 'DD' }, 'DD', 'DD'), { CC: 0, DD: 3 });
});

test('AC2: 階級ごとに勝者が分かれると 1pt ずつ (QC-04)', () => {
  assert.deepEqual(scoreRegularCard({ blue: 'IT', red: 'LR' }, 'IT', 'LR'), { IT: 1, LR: 1 });
  assert.deepEqual(scoreRegularCard({ blue: 'IT', red: 'LR' }, 'LR', 'IT'), { IT: 1, LR: 1 });
});

test('AC2: カードに無いチームを勝者に指定するとエラー', () => {
  assert.throws(() => scoreRegularCard({ blue: 'IT', red: 'LR' }, 'CC', 'LR'));
});

// 基準3
test('AC3: MASTERS CUP の順位点は 1位3・2位2・3位1・4位0 (QC-04)', () => {
  const pts = mastersCupPoints({
    semis: [['DD', 'CC'], ['IT', 'LR']],
    semiWinners: ['CC', 'IT'],
    thirdPlaceWinner: 'LR',
    finalWinner: 'IT',
  });
  assert.deepEqual(pts, { IT: 3, CC: 2, LR: 1, DD: 0 });
});

test('AC3: 準決勝の勝者がその組に属さないとエラー', () => {
  assert.throws(() => mastersCupPoints({
    semis: [['DD', 'CC'], ['IT', 'LR']],
    semiWinners: ['IT', 'LR'],
    thirdPlaceWinner: 'DD',
    finalWinner: 'IT',
  }));
});

test('AC3: 決勝の勝者が準決勝の勝者でない、または3位決定戦の勝者が準決勝の敗者でないとエラー', () => {
  const base = { semis: [['DD', 'CC'], ['IT', 'LR']] as [['DD', 'CC'], ['IT', 'LR']], semiWinners: ['CC', 'IT'] as ['CC', 'IT'] };
  assert.throws(() => mastersCupPoints({ ...base, thirdPlaceWinner: 'LR', finalWinner: 'DD' }));
  assert.throws(() => mastersCupPoints({ ...base, thirdPlaceWinner: 'CC', finalWinner: 'IT' }));
});

// 基準4
test('AC4: 合計 pt の降順でシード1〜4位を決める', () => {
  const r = computeSeeds([
    { team: 'DD', rs: 10, mc: 6 },
    { team: 'CC', rs: 3, mc: 8 },
    { team: 'IT', rs: 9, mc: 1 },
    { team: 'LR', rs: 8, mc: 4 },
  ]);
  assert.deepEqual(r.order, ['DD', 'LR', 'CC', 'IT']);
  assert.equal(r.tiebreakUsed, null);
});

// 基準5: S3 の実例 CC と LR が 11pt で並び、RS 8pt の LR が上位
test('AC5: 同点は既定で RS の pt が多い方を上位にし、使った同点処理を結果に含める', () => {
  const r = computeSeeds([
    { team: 'DD', rs: 10, mc: 6 },
    { team: 'CC', rs: 3, mc: 8 },
    { team: 'IT', rs: 9, mc: 1 },
    { team: 'LR', rs: 8, mc: 3 },
  ]);
  assert.deepEqual(r.order, ['DD', 'LR', 'CC', 'IT']);
  assert.equal(r.tiebreakUsed, 'rs-points');
});

test('AC5: RS の pt も同点なら乱数で決め、乱数の結果に従う', () => {
  const rows = [
    { team: 'DD' as const, rs: 6, mc: 3 },
    { team: 'CC' as const, rs: 6, mc: 3 },
    { team: 'IT' as const, rs: 1, mc: 0 },
    { team: 'LR' as const, rs: 0, mc: 0 },
  ];
  const low = computeSeeds(rows, { rng: () => 0.1 });
  const high = computeSeeds(rows, { rng: () => 0.9 });
  assert.deepEqual(new Set(low.order.slice(0, 2)), new Set(['DD', 'CC']));
  assert.notDeepEqual(low.order.slice(0, 2), high.order.slice(0, 2));
  assert.equal(low.tiebreakUsed, 'rs-points+random');
});

test('AC5: 選択肢 RS の直接対決を優先すると、直接対決の勝ち点が多い方を上位にする', () => {
  const r = computeSeeds(
    [
      { team: 'DD', rs: 10, mc: 6 },
      { team: 'CC', rs: 5, mc: 6 },
      { team: 'IT', rs: 9, mc: 1 },
      { team: 'LR', rs: 8, mc: 3 },
    ],
    { tiebreak: 'rs-head-to-head', headToHead: { 'CC>LR': 4, 'LR>CC': 1 } },
  );
  assert.deepEqual(r.order, ['DD', 'CC', 'LR', 'IT']);
  assert.equal(r.tiebreakUsed, 'rs-head-to-head');
});

test('AC5: 直接対決も同点なら RS の pt で決める', () => {
  const r = computeSeeds(
    [
      { team: 'DD', rs: 10, mc: 6 },
      { team: 'CC', rs: 5, mc: 6 },
      { team: 'IT', rs: 9, mc: 1 },
      { team: 'LR', rs: 8, mc: 3 },
    ],
    { tiebreak: 'rs-head-to-head' },
  );
  assert.deepEqual(r.order, ['DD', 'LR', 'CC', 'IT']);
});
