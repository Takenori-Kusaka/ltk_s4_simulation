// F-014 Task-3: 受入基準 14〜18(推しチーム・推し選手の視点。画面の論理の単体テストと、部品の文字列の検査)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computePriorWinrates, type TierTeamS } from '../../src/winrate/core.ts';
import { TEAMS, TIERS, type TeamId, type Tier } from '../../src/sim/index.ts';
import { MASTERS_CUPS, REGULAR_DAYS } from '../../src/sim/schedule.ts';
import { ROSTER } from '../../src/data/roster.ts';
import { noDataNotice, runSimulation, type WinratesFile } from '../../src/app/sim/view.ts';
import { dayBox, expectedWins, jstDate, standings } from '../../src/app/schedule/view.ts';
import { nextOpponent, opponentCompareHref } from '../../src/app/compare/opponent.ts';
import {
  FAVORITE_KEY,
  facing,
  playerNext,
  readFavorite,
  teamDayBox,
  teamOutlook,
  tierTeamMatches,
  writeFavorite,
  type FavoriteStorage,
} from '../../src/app/schedule/fan.ts';

const S: Record<Tier, Record<TeamId, number | null>> = {
  NEXT: { DD: 5.7, CC: 5.3, IT: 5.0, LR: 5.2 },
  CORE: { DD: 6.0, CC: 6.8, IT: 6.5, LR: 6.2 },
  MASTERS: { DD: 7.1, CC: 6.8, IT: 6.6, LR: 6.7 },
};
const teams = (s: typeof S): TierTeamS[] =>
  TIERS.flatMap((tier) => TEAMS.map((team) => (s[tier][team] === null ? { team, tier, S: null, reason: '評価の無い選手: ハレっち' } : { team, tier, S: s[tier][team] as number })));
const file: WinratesFile = { ...computePriorWinrates(teams(S)), computedAt: '2026-10-10T10:00:00.000Z', configVersion: 'abcdef012345', results: null };
const at = (iso: string) => new Date(iso);
const src = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('基準14(b)・13: NEXT・CORE の試合の一覧は Regular Stage の 6 試合(Day・相手・サイド・勝率)。勝率は matches の値そのもの。期待勝ち数は勝率の和', () => {
  for (const tier of ['NEXT', 'CORE'] as const) {
    const v = tierTeamMatches(file, 'CC', tier);
    assert.equal(v.tier, tier);
    assert.equal(v.rows.length, 6);
    assert.deepEqual(v.rows.map((r) => r.label), ['DAY 1', 'DAY 2', 'DAY 3', 'DAY 4', 'DAY 5', 'DAY 6']);
    let sum = 0;
    for (const r of v.rows) {
      const day = REGULAR_DAYS.find((d) => d.date === r.date)!;
      const card = day.cards.find((c) => c.blue === 'CC' || c.red === 'CC')!;
      assert.equal(r.tier, tier);
      assert.equal(r.side, card.blue === 'CC' ? 'BLUE' : 'RED');
      assert.equal(r.opponent, card.blue === 'CC' ? card.red : card.blue);
      const m = file.matches.find((x) => x.stage === 'regular' && x.day === day.day && x.tier === tier && x.a === card.blue && x.b === card.red)!;
      const p = card.blue === 'CC' ? m.pA : m.pB;
      assert.equal(r.p, p.toFixed(1));
      assert.equal(r.pNum, p);
      assert.equal(r.dataMissing, null);
      sum += p;
    }
    assert.equal(v.expected, (sum / 100).toFixed(1));
    // 順位表の W(expectedWins)と同じ値
    assert.equal(v.expected, expectedWins(file, 'CC', tier).toFixed(1));
    assert.match(v.expected, /^\d\.\d$/);
  }
  const d1 = tierTeamMatches(file, 'CC', 'NEXT').rows[0];
  assert.equal(d1.date, '2026-10-15');
  assert.equal(d1.dateLabel, '10/15 THU');
  assert.equal(d1.side, 'BLUE');
  assert.equal(d1.opponent, 'DD');
  assert.equal(d1.opponentName, 'Dahlia Diadem');
  assert.match(d1.opponentColor, /^#/);
  assert.equal(tierTeamMatches(file, 'DD', 'CORE').rows[0].side, 'RED');
});

test('基準14(b)・13: MASTERS の一覧は MASTERS CUP の準決勝 3 試合(サイドなし)。期待勝ち数は 3 試合の勝率の和', () => {
  const v = tierTeamMatches(file, 'LR', 'MASTERS');
  assert.equal(v.rows.length, 3);
  assert.deepEqual(v.rows.map((r) => r.label), ['MASTERS CUP 1', 'MASTERS CUP 2', 'MASTERS CUP 3']);
  assert.deepEqual(v.rows.map((r) => r.opponent), ['IT', 'CC', 'DD']);
  assert.deepEqual(v.rows.map((r) => r.dateLabel), ['10/20 TUE', '10/28 WED', '11/9 MON']);
  assert.ok(v.rows.every((r) => r.side === null));
  let sum = 0;
  for (const r of v.rows) {
    const cup = MASTERS_CUPS.find((c) => c.date === r.date)!;
    const semi = cup.semis.find((s) => s.includes('LR'))!;
    const m = file.matches.find((x) => x.stage === 'masters' && x.cup === cup.cup && x.a === semi[0] && x.b === semi[1])!;
    const p = m.a === 'LR' ? m.pA : m.pB;
    assert.equal(r.p, p.toFixed(1));
    assert.equal(r.pNum, p);
    sum += p;
  }
  assert.equal(v.expected, (sum / 100).toFixed(1));
});

test('基準14(b)(データ不足): S を計算できない階級チームの行は 50.0% と「データ不足」の理由を持つ', () => {
  const missing: WinratesFile = { ...computePriorWinrates(teams({ ...S, MASTERS: { ...S.MASTERS, LR: null } })), computedAt: '2026-10-10T10:00:00.000Z', configVersion: 'x', results: null };
  const v = tierTeamMatches(missing, 'LR', 'MASTERS');
  assert.equal(v.rows.length, 3);
  for (const r of v.rows) {
    assert.equal(r.p, '50.0');
    assert.match(r.dataMissing ?? '', /データ不足/);
    assert.match(r.dataMissing ?? '', /ハレっち/);
  }
  // 相手の側から見ても同じ試合の値(matches の pA・pB そのもの)
  assert.equal(tierTeamMatches(missing, 'IT', 'MASTERS').rows[0].p, '50.0');
  assert.equal(tierTeamMatches(missing, 'CC', 'NEXT').rows[0].dataMissing, null);
});

test('基準29(再判定 3): 言い回しと英語のチーム名(予想 pt・乱数の種・推しボタン・日程の箱・順位表の副題)', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const fan = read('../../src/app/schedule/FanSection.svelte');
  assert.match(fan, /予想 pt\(RS\+MASTERS CUP\)/);
  assert.ok(!/期待 pt/.test(fan));
  const sim = read('../../src/app/sim/SimPage.svelte');
  assert.match(sim, /乱数の種/);
  assert.match(sim, /SEASON FORECAST · 全日程の予想/);
  const home = read('../../src/app/components/Home.svelte');
  assert.match(home, /\{team\} · \{TEAM_INFO\[team\]\.name\}/);
  assert.match(home, /SEASON FORECAST · 全日程の予想/);
  assert.match(home, /forecastHeading/);
  const day = read('../../src/app/schedule/DayBox.svelte');
  assert.match(day, /class="full">\{r\.blue\.name\}/);
  assert.match(day, /class="full">\{r\.red\.name\}/);
  const board = read('../../src/app/schedule/StandingsBoard.svelte');
  assert.match(board, /\{view\.note\}/);
  const sheet = read('../../src/app/components/PlayerSheet.svelte');
  assert.match(sheet, /A-Za-z0-9/);
});

test('基準14(a): チームの直近の試合日の箱は、その日の箱からそのチームのカードだけを残す(ブルー・レッドの配置は公式のまま)', () => {
  const ref = { kind: 'regular', day: 1, date: '2026-10-15' } as const;
  const b = teamDayBox(file, 'LR', ref);
  assert.equal(b.title, 'DAY 1');
  assert.equal(b.dateLabel, '10/15 THU');
  assert.equal(b.boxes.length, 1);
  assert.deepEqual(b.boxes[0].rows.map((r) => r.tier), ['NEXT', 'CORE']);
  assert.equal(b.boxes[0].rows[0].blue.team, 'IT');
  assert.equal(b.boxes[0].rows[0].red.team, 'LR');
  assert.deepEqual(b.boxes[0], dayBox(file, ref).boxes[1]);
  assert.equal(b.placeholders.length, 0);
  const m = teamDayBox(file, 'CC', { kind: 'masters', cup: 2, date: '2026-10-28' });
  assert.equal(m.title, 'MASTERS CUP 2');
  // 再判定 2(Task-5): M3・M4 は予想の組み合わせの箱になり、そのチームが出る方が残る
  assert.equal(m.boxes.length, 2);
  assert.equal(m.boxes[0].rows[0].blue.team, 'CC');
  assert.equal(m.boxes[0].rows[0].red.team, 'LR');
  assert.equal(m.placeholders.length, 0);
  assert.match(m.boxes[1].label, /予想の組み合わせ/);
  assert.ok(m.boxes[1].rows[0].blue.team === 'CC' || m.boxes[1].rows[0].red.team === 'CC');
});

test('基準14(c)・13: 見通しは F-001 の優勝確率・シード 1〜4 位の確率を丸めた値と、順位表での予想の順位', () => {
  const sim = runSimulation(file);
  const table = standings(file, sim);
  for (const team of TEAMS) {
    const o = teamOutlook(file, sim, team);
    const row = table.rows.find((r) => r.team === team)!;
    assert.equal(o.champion, (sim.championProbability[team] * 100).toFixed(1));
    assert.equal(o.seeds.length, 4);
    assert.deepEqual(o.seeds, sim.seedProbability[team].map((p) => (p * 100).toFixed(1)));
    assert.equal(o.rank, row.no);
    assert.equal(o.total, row.total);
    assert.match(o.champion, /^\d{1,3}\.\d$/);
  }
  assert.deepEqual(TEAMS.map((team) => teamOutlook(file, sim, team).rank).sort(), [1, 2, 3, 4]);
});

test('基準15(a)・(b): 選手の直近の試合は階級チームの直近の試合(日・相手・サイド・勝率)。対面は F-008 の nextOpponent と同じ相手で、比較ページへのリンクを持つ', () => {
  const sena = ROSTER.find((p) => p.id === 'CC-NEXT-MID')!;
  const n1 = playerNext(file, sena, at('2026-10-01T00:00:00+09:00'))!;
  assert.equal(n1.label, 'DAY 1');
  assert.equal(n1.dateLabel, '10/15 THU');
  assert.equal(n1.opponent, 'DD');
  assert.equal(n1.side, 'BLUE');
  assert.equal(n1.p, file.matches.find((m) => m.stage === 'regular' && m.day === 1 && m.tier === 'NEXT' && m.a === 'CC')!.pA.toFixed(1));
  // 試合日の当日はその日。翌日は次の日
  assert.equal(playerNext(file, sena, at('2026-10-15T23:30:00+09:00'))!.label, 'DAY 1');
  const n2 = playerNext(file, sena, at('2026-10-16T00:00:00+09:00'))!;
  assert.equal(n2.label, 'DAY 2');
  assert.equal(n2.opponent, 'LR');
  // MASTERS CUP の日(10/20)に NEXT の選手が見ると、次の Regular Stage の日(Day 3。CC はレッド、相手 IT)
  const n3 = playerNext(file, sena, at('2026-10-20T12:00:00+09:00'))!;
  assert.equal(n3.label, 'DAY 3');
  assert.equal(n3.side, 'RED');
  assert.equal(n3.opponent, 'IT');
  assert.equal(n3.p, file.matches.find((m) => m.stage === 'regular' && m.day === 3 && m.tier === 'NEXT' && m.b === 'CC')!.pB.toFixed(1));
  // MASTERS の選手は準決勝
  const washidai = ROSTER.find((p) => p.id === 'DD-MASTERS-TOP')!;
  const m1 = playerNext(file, washidai, at('2026-10-16T00:00:00+09:00'))!;
  assert.equal(m1.label, 'MASTERS CUP 1');
  assert.equal(m1.opponent, 'CC');
  assert.equal(m1.side, null);
  assert.equal(m1.p, file.matches.find((m) => m.stage === 'masters' && m.cup === 1 && m.a === 'DD')!.pA.toFixed(1));
  // 最後の試合日の後は無い
  assert.equal(playerNext(file, sena, at('2026-11-07T00:00:00+09:00')), null);
  assert.equal(playerNext(file, washidai, at('2026-11-10T00:00:00+09:00')), null);
  // (b) 対面の選手: F-008 の nextOpponent・opponentCompareHref と同じ相手・同じ URL
  const now = at('2026-10-20T12:00:00+09:00');
  const f = facing(sena, now)!;
  const o = nextOpponent(sena.id, jstDate(now))!;
  assert.equal(f.id, o.opponentId);
  assert.equal(f.id, 'IT-NEXT-MID');
  assert.equal(f.team, n3.opponent);
  assert.equal(f.name, ROSTER.find((p) => p.id === 'IT-NEXT-MID')!.name);
  assert.equal(f.href, opponentCompareHref(sena.id, now));
  assert.equal(f.href, '#/compare/CC-NEXT-MID/IT-NEXT-MID');
  assert.equal(facing(sena, at('2026-11-07T00:00:00+09:00')), null);
});

test('基準16: 推しチームの読み書きは注入した storage にだけ行い、不正な値は null。解除で消える。storage が無い・壊れていても落ちない', () => {
  const store = new Map<string, string>();
  const storage: FavoriteStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
    removeItem: (k) => void store.delete(k),
  };
  assert.equal(FAVORITE_KEY, 'ltk-favorite-team');
  assert.equal(readFavorite(storage), null);
  writeFavorite(storage, 'CC');
  assert.equal(store.get(FAVORITE_KEY), 'CC');
  assert.equal(store.size, 1);
  assert.equal(readFavorite(storage), 'CC');
  writeFavorite(storage, 'LR');
  assert.equal(readFavorite(storage), 'LR');
  writeFavorite(storage, null);
  assert.equal(readFavorite(storage), null);
  assert.equal(store.size, 0);
  for (const bad of ['XX', 'cc', '', 'DD CC', '{"team":"DD"}']) {
    store.set(FAVORITE_KEY, bad);
    assert.equal(readFavorite(storage), null, bad);
  }
  assert.equal(readFavorite(null), null);
  assert.equal(readFavorite(undefined), null);
  assert.doesNotThrow(() => writeFavorite(null, 'DD'));
  const broken: FavoriteStorage = {
    getItem: () => { throw new Error('disabled'); },
    setItem: () => { throw new Error('disabled'); },
    removeItem: () => { throw new Error('disabled'); },
  };
  assert.equal(readFavorite(broken), null);
  assert.doesNotThrow(() => writeFavorite(broken, 'DD'));
  assert.doesNotThrow(() => writeFavorite(broken, null));
});

test('基準16・17: ホームは推しチームの選択・解除・強調・導線を持ち、選択を外部へ送る呼び出しを持たない', () => {
  const home = src('../../src/app/components/Home.svelte');
  assert.match(home, /readFavorite/);
  assert.match(home, /writeFavorite/);
  assert.match(home, /localStorage/);
  assert.match(home, /解除/);
  assert.match(home, /は勝てるのか/);
  assert.match(home, /#\/team\//);
  assert.match(home, /<DayBox[^>]*highlight=/);
  assert.match(home, /<StandingsBoard[^>]*highlight=/);
  for (const [name, text] of [
    ['Home.svelte', home],
    ['fan.ts', src('../../src/app/schedule/fan.ts')],
    ['data.ts', src('../../src/app/schedule/data.ts')],
    ['FanSection.svelte', src('../../src/app/schedule/FanSection.svelte')],
  ]) {
    assert.doesNotMatch(text, /fetch\(/, name);
    assert.doesNotMatch(text, /XMLHttpRequest/, name);
    assert.doesNotMatch(text, /sendBeacon/, name);
    assert.doesNotMatch(text, /WebSocket/, name);
  }
});

test('基準18: 勝率表が無い、または kind が winrates でないときの文。チームのページと選手のページは「は勝てるのか」の節を持ち、その文を出す経路を持つ', () => {
  assert.match(noDataNotice(undefined) ?? '', /勝率のデータがありません/);
  assert.match(noDataNotice({ kind: 'ratings' }) ?? '', /勝率のデータがありません/);
  assert.equal(noDataNotice(file), null);
  const team = src('../../src/app/team/TeamPage.svelte');
  const sheet = src('../../src/app/components/PlayerSheet.svelte');
  for (const s of [team, sheet]) {
    assert.match(s, /は勝てるのか/);
    assert.match(s, /noDataNotice/);
    assert.match(s, /loadWinrates/);
    assert.match(s, /<FanSection/);
  }
  // 「勝てるのか」の節はレーダーの節の前
  assert.ok(team.indexOf('<FanSection') < team.indexOf('court-whole'), 'FanSection はレーダーの節の前');
  const fan = src('../../src/app/schedule/FanSection.svelte');
  assert.match(fan, /notice/);
  assert.match(fan, /<DayBox/);
  assert.match(fan, /期待勝ち数/);
  assert.match(fan, /優勝確率/);
  assert.match(fan, /シード/);
  assert.match(fan, /対面/);
  // 勝率表は main.ts と同じファイルを同じ読み方で読む
  const data = src('../../src/app/schedule/data.ts');
  assert.match(data, /import\.meta\.glob\('\.\.\/\.\.\/\.\.\/data\/public\/winrates\.json'/);
  assert.match(src('../../src/app/main.ts'), /import\.meta\.glob\('\.\.\/\.\.\/data\/public\/winrates\.json'/);
});
