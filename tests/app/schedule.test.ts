// F-014 Task-1: 受入基準 1〜7・11(論理)・12・13(直近の試合日、日程の箱、順位表、データなし、ホームの配置)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computePriorWinrates, type TierTeamS } from '../../src/winrate/core.ts';
import { TEAMS, TIERS, type TeamId, type Tier } from '../../src/sim/index.ts';
import { runSimulation, type WinratesFile } from '../../src/app/sim/view.ts';
import { allDays, dateLabel, dayBox, nearestDay, standings, jstDate } from '../../src/app/schedule/view.ts';

const S: Record<Tier, Record<TeamId, number | null>> = {
  NEXT: { DD: 5.7, CC: 5.3, IT: 5.0, LR: 5.2 },
  CORE: { DD: 6.0, CC: 6.8, IT: 6.5, LR: 6.2 },
  MASTERS: { DD: 7.1, CC: 6.8, IT: 6.6, LR: 6.7 },
};
const teams = (s: typeof S): TierTeamS[] =>
  TIERS.flatMap((tier) => TEAMS.map((team) => (s[tier][team] === null ? { team, tier, S: null, reason: '評価の無い選手: ハレっち' } : { team, tier, S: s[tier][team] as number })));
const file: WinratesFile = { ...computePriorWinrates(teams(S)), computedAt: '2026-10-10T10:00:00.000Z', configVersion: 'abcdef012345', results: null };
const at = (iso: string) => new Date(iso);

test('基準2: 直近の試合日は閲覧日(JST)以降で最も近い日程の日。最後の日より後なら最後の日', () => {
  assert.equal(jstDate(at('2026-10-15T14:59:00Z')), '2026-10-15');
  assert.equal(jstDate(at('2026-10-15T15:00:00Z')), '2026-10-16');
  assert.deepEqual(allDays().map((d) => d.date), ['2026-10-15', '2026-10-19', '2026-10-20', '2026-10-23', '2026-10-27', '2026-10-28', '2026-11-02', '2026-11-06', '2026-11-09']);
  assert.deepEqual(nearestDay(at('2026-10-01T00:00:00+09:00')), { kind: 'regular', day: 1, date: '2026-10-15' });
  assert.deepEqual(nearestDay(at('2026-10-15T23:30:00+09:00')), { kind: 'regular', day: 1, date: '2026-10-15' });
  assert.deepEqual(nearestDay(at('2026-10-16T00:00:00+09:00')), { kind: 'regular', day: 2, date: '2026-10-19' });
  assert.deepEqual(nearestDay(at('2026-10-20T12:00:00+09:00')), { kind: 'masters', cup: 1, date: '2026-10-20' });
  assert.deepEqual(nearestDay(at('2026-10-21T00:00:00+09:00')), { kind: 'regular', day: 3, date: '2026-10-23' });
  assert.deepEqual(nearestDay(at('2026-12-01T00:00:00+09:00')), { kind: 'masters', cup: 3, date: '2026-11-09' });
  assert.equal(dateLabel('2026-10-15'), '10/15 THU');
  assert.equal(dateLabel('2026-11-02'), '11/2 MON');
});

test('基準1・3・12・13: Regular Stage の日の箱は 2 カード × NEXT/CORE の行。左がブルー、右がレッド。勝率は matches の pA・pB そのもの', () => {
  const box = dayBox(file, { kind: 'regular', day: 1, date: '2026-10-15' });
  assert.equal(box.title, 'DAY 1');
  assert.equal(box.dateLabel, '10/15 THU');
  assert.equal(box.boxes.length, 2);
  assert.deepEqual(box.boxes[0].rows.map((r) => r.tier), ['NEXT', 'CORE']);
  const next = box.boxes[0].rows[0];
  assert.equal(next.blue.team, 'CC');
  assert.equal(next.red.team, 'DD');
  const m = file.matches.find((x) => x.stage === 'regular' && x.day === 1 && x.tier === 'NEXT')!;
  assert.equal(next.blue.p, m.pA.toFixed(1));
  assert.equal(next.red.p, m.pB.toFixed(1));
  assert.equal(next.blue.pNum + next.red.pNum, 100);
  assert.equal(next.blue.name, 'Camellia Crown');
  assert.match(next.blue.color, /^#/);
  assert.ok(next.blue.petals > 0);
  assert.equal(next.dataMissing, null);
  assert.equal(box.boxes[1].rows[1].blue.team, 'IT');
  assert.equal(box.boxes[1].rows[1].red.team, 'LR');
  assert.equal(box.placeholders.length, 0);
});

test('基準1・3: MASTERS CUP の日の箱は準決勝の 2 箱(MASTERS の行)と、M3・M4 の「準決勝の勝者・敗者」の箱', () => {
  const box = dayBox(file, { kind: 'masters', cup: 1, date: '2026-10-20' });
  assert.equal(box.title, 'MASTERS CUP 1');
  assert.equal(box.boxes.length, 2);
  assert.deepEqual(box.boxes[0].rows.map((r) => r.tier), ['MASTERS']);
  assert.equal(box.boxes[0].rows[0].blue.team, 'DD');
  assert.equal(box.boxes[0].rows[0].red.team, 'CC');
  const m = file.matches.find((x) => x.stage === 'masters' && x.cup === 1 && x.a === 'DD')!;
  assert.equal(box.boxes[0].rows[0].blue.p, m.pA.toFixed(1));
  assert.deepEqual(box.placeholders.map((p) => p.label), ['M3', 'M4']);
  assert.match(box.placeholders[1].text, /準決勝の勝者/);
});

test('基準3・5(データ不足): S を計算できない階級チームの行は「データ不足」と理由を持つ', () => {
  const missing: WinratesFile = { ...computePriorWinrates(teams({ ...S, MASTERS: { ...S.MASTERS, LR: null } })), computedAt: '2026-10-10T10:00:00.000Z', configVersion: 'x', results: null };
  const box = dayBox(missing, { kind: 'masters', cup: 1, date: '2026-10-20' });
  const row = box.boxes[1].rows[0];
  assert.equal(row.red.team, 'LR');
  assert.equal(row.red.p, '50.0');
  assert.match(row.dataMissing ?? '', /データ不足/);
  assert.match(row.dataMissing ?? '', /ハレっち/);
});

test('基準4・5・13: 順位表は期待勝ち数(6 試合の勝率の和)と期待 pt で埋め、TOTAL の高い順、1 位の印、「予想(開幕前)」', () => {
  const sim = runSimulation(file);
  const t = standings(file, sim);
  assert.equal(t.label, '予想(開幕前)');
  assert.equal(t.rows.length, 4);
  assert.deepEqual(t.rows.map((r) => r.no), [1, 2, 3, 4]);
  assert.equal(t.rows[0].first, true);
  assert.equal(t.rows[1].first, false);
  for (let i = 1; i < 4; i++) assert.ok(Number(t.rows[i - 1].total) >= Number(t.rows[i].total));
  for (const r of t.rows) {
    let next = 0, core = 0;
    for (const m of file.matches) {
      if (m.stage !== 'regular') continue;
      const p = m.a === r.team ? m.pA : m.b === r.team ? m.pB : null;
      if (p === null) continue;
      if (m.tier === 'NEXT') next += p / 100;
      else core += p / 100;
    }
    assert.equal(r.nextWL, `${next.toFixed(1)} - ${(6 - next).toFixed(1)}`);
    assert.equal(r.coreWL, `${core.toFixed(1)} - ${(6 - core).toFixed(1)}`);
    assert.equal(r.masters, sim.expectedMastersPoints[r.team].toFixed(1));
    assert.equal(r.total, (sim.expectedRegularPoints[r.team] + sim.expectedMastersPoints[r.team]).toFixed(1));
    assert.equal(r.champion, (sim.championProbability[r.team] * 100).toFixed(1));
    assert.match(r.nextWL, /^\d\.\d - \d\.\d$/);
  }
  const withResults = standings({ ...file, results: { regular: [] } }, sim);
  assert.notEqual(withResults.label, '予想(開幕前)');
});

test('基準6・7・12: ホームは勝率のデータが無いときの文を持ち、直近の試合日の箱と順位表を 4 王家の一覧の上に置く', () => {
  const home = readFileSync(new URL('../../src/app/components/Home.svelte', import.meta.url), 'utf8');
  assert.match(home, /noDataNotice/);
  const day = home.indexOf('<DayBox');
  const st = home.indexOf('<StandingsBoard');
  const houses = home.indexOf('class="houses"');
  assert.ok(day > 0 && st > day && houses > st, `順序 DayBox ${day} / StandingsBoard ${st} / houses ${houses}`);
  const daybox = readFileSync(new URL('../../src/app/schedule/DayBox.svelte', import.meta.url), 'utf8');
  assert.match(daybox, /BLUE SIDE/);
  assert.match(daybox, /RED SIDE/);
  assert.match(daybox, /<Emblem/);
  const board = readFileSync(new URL('../../src/app/schedule/StandingsBoard.svelte', import.meta.url), 'utf8');
  for (const col of ['NO.', 'TEAM', 'CORE W-L', 'NEXT W-L', 'MASTERS', 'TOTAL']) assert.ok(board.includes(col), col);
  assert.match(board, /overflow-x:\s*auto/);
});
