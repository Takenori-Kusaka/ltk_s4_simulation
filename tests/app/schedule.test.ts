// F-014 Task-1: 受入基準 1〜7・11(論理)・12・13(直近の試合日、日程の箱、順位表、データなし、ホームの配置)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computePriorWinrates, type TierTeamS } from '../../src/winrate/core.ts';
import { TEAMS, TIERS, type TeamId, type Tier } from '../../src/sim/index.ts';
import { runSimulation, type WinratesFile } from '../../src/app/sim/view.ts';
import { allDays, dateLabel, dayBox, nearestDay, standings, jstDate, predictedResult, predictedWinner } from '../../src/app/schedule/view.ts';
import { REGULAR_DAYS } from '../../src/sim/schedule.ts';

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

test('基準1・3: MASTERS CUP の日の箱は準決勝の 2 箱と、予想の結果で決まる M3(敗者どうし)・M4(勝者どうし)の組み合わせの箱(勝率つき)', () => {
  const box = dayBox(file, { kind: 'masters', cup: 1, date: '2026-10-20' });
  assert.equal(box.title, 'MASTERS CUP 1');
  assert.equal(box.boxes.length, 4);
  assert.deepEqual(box.boxes[0].rows.map((r) => r.tier), ['MASTERS']);
  assert.equal(box.boxes[0].rows[0].blue.team, 'DD');
  assert.equal(box.boxes[0].rows[0].red.team, 'CC');
  const m = file.matches.find((x) => x.stage === 'masters' && x.cup === 1 && x.a === 'DD')!;
  assert.equal(box.boxes[0].rows[0].blue.p, m.pA.toFixed(1));
  assert.equal(box.placeholders.length, 0);
  const pr = predictedResult(file).cups.find((c) => c.cup === 1)!;
  const m3 = box.boxes[2], m4 = box.boxes[3];
  assert.match(m3.label, /^M3 .*予想の組み合わせ/);
  assert.match(m4.label, /^M4 .*予想の組み合わせ/);
  assert.deepEqual([m3.rows[0].blue.team, m3.rows[0].red.team].sort(), [...pr.semiLosers].sort());
  assert.deepEqual([m4.rows[0].blue.team, m4.rows[0].red.team].sort(), [...pr.semiWinners].sort());
  for (const b of [m3, m4]) {
    const r = b.rows[0];
    assert.equal(r.tier, 'MASTERS');
    assert.equal(Math.round((r.blue.pNum + r.red.pNum) * 10), 1000);
    const key = r.blue.team + '>' + r.red.team;
    assert.equal(r.blue.p, (file.winTable.MASTERS[key] * 100).toFixed(1));
    assert.equal(r.dataMissing, null);
  }
  const txt = JSON.stringify(box);
  assert.ok(!/どうし/.test(txt), '仮置きの文が無い');
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

test('基準4・5・13: 順位表は予想の結果(整数の勝ち数・負け数・ポイント)で埋め、TOTAL の高い順(同点は RS のポイント → 優勝確率)、1 位の印、「予想(開幕前)」', () => {
  const sim = runSimulation(file);
  const t = standings(file, sim);
  assert.equal(t.label, '予想(開幕前)');
  assert.equal(t.rows.length, 4);
  assert.deepEqual(t.rows.map((r) => r.no), [1, 2, 3, 4]);
  assert.equal(t.rows[0].first, true);
  assert.equal(t.rows[1].first, false);
  const pr = predictedResult(file);
  for (let i = 1; i < 4; i++) {
    const a = t.rows[i - 1], b = t.rows[i];
    const ta = pr.total[a.team], tb = pr.total[b.team];
    assert.ok(ta > tb || (ta === tb && (pr.rsPoints[a.team] > pr.rsPoints[b.team] || (pr.rsPoints[a.team] === pr.rsPoints[b.team] && sim.championProbability[a.team] >= sim.championProbability[b.team]))));
  }
  for (const r of t.rows) {
    assert.match(r.coreWL, /^[0-6] - [0-6]$/);
    assert.match(r.nextWL, /^[0-6] - [0-6]$/);
    assert.match(r.masters, /^\d+$/);
    assert.match(r.total, /^\d+$/);
    assert.equal(r.coreWL, `${pr.wins[r.team].CORE} - ${6 - pr.wins[r.team].CORE}`);
    assert.equal(r.nextWL, `${pr.wins[r.team].NEXT} - ${6 - pr.wins[r.team].NEXT}`);
    assert.equal(r.masters, String(pr.mcPoints[r.team]));
    assert.equal(r.total, String(pr.rsPoints[r.team] + pr.mcPoints[r.team]));
    assert.equal(r.champion, (sim.championProbability[r.team] * 100).toFixed(1));
    assert.ok(!/\./.test(r.coreWL + r.nextWL + r.masters + r.total), '順位表に小数が無い');
  }
  const withResults = standings({ ...file, results: { regular: [] } }, sim);
  assert.notEqual(withResults.label, '予想(開幕前)');
});

test('用語「予想の結果」: 勝率の高い側が勝ち、各階級の勝ち数の合計は 12。1 勝 1pt と同日の両勝ちの +1pt、MASTERS CUP は 3/2/1/0pt で合計 6pt × 3 回', () => {
  const pr = predictedResult(file);
  for (const tier of ['NEXT', 'CORE'] as const) assert.equal(TEAMS.reduce((s, t) => s + pr.wins[t][tier], 0), 12);
  // 各試合の勝者は勝率の高い側
  for (const m of file.matches.filter((x) => x.stage === 'regular')) {
    const w = predictedWinner(file, m.tier, m.a, m.b, m.pA, m.pB);
    assert.equal(w, m.pA > m.pB ? m.a : m.pB > m.pA ? m.b : w);
  }
  // RS のポイント = 勝ち数 + 両方勝った日の数
  for (const t of TEAMS) {
    let bonus = 0;
    for (const d of REGULAR_DAYS) {
      let dayWins = 0;
      for (const card of d.cards) for (const tier of ['NEXT', 'CORE'] as const) {
        const m = file.matches.find((x) => x.stage === 'regular' && x.day === d.day && x.tier === tier)!;
        const mm = file.matches.find((x) => x.stage === 'regular' && x.day === d.day && x.tier === tier && x.a === card.blue && x.b === card.red) ?? m;
        if (predictedWinner(file, tier, card.blue, card.red, mm.pA, mm.pB) === t) dayWins++;
      }
      if (dayWins === 2) bonus++;
    }
    assert.equal(pr.rsPoints[t], pr.wins[t].NEXT + pr.wins[t].CORE + bonus);
    assert.equal(pr.total[t], pr.rsPoints[t] + pr.mcPoints[t]);
  }
  assert.equal(pr.cups.length, 3);
  for (const c of pr.cups) {
    assert.equal(c.placing.length, 4);
    assert.deepEqual([...c.placing].sort(), [...TEAMS].sort());
    assert.ok(c.semiWinners.includes(c.final!));
    assert.ok(c.semiLosers.includes(c.third!));
  }
  assert.equal(TEAMS.reduce((s, t) => s + pr.mcPoints[t], 0), 18);
});

test('用語「予想の結果」: 勝率が同じなら戦力 S の高い側、それも同じならブルーサイド', () => {
  assert.equal(predictedWinner(file, 'NEXT', 'CC', 'DD', 50, 50), 'DD'); // S: DD 5.7 > CC 5.3
  assert.equal(predictedWinner(file, 'NEXT', 'DD', 'CC', 50, 50), 'DD');
  const same: WinratesFile = { ...file, teams: file.teams.map((t) => (t.tier === 'NEXT' ? { ...t, S: 5.5 } : t)) };
  assert.equal(predictedWinner(same, 'NEXT', 'CC', 'DD', 50, 50), 'CC');
  assert.equal(predictedWinner(file, 'NEXT', 'CC', 'DD', 49.9, 50.1), 'DD');
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
