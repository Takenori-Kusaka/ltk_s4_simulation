// F-004 Task-2: 受入基準 12(指標の対応表で GameRecord を作る)・14(評価の試合の条件と調子の係数)。実装を読まずに受入基準から書いた
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrimGameRecords } from '../../src/results/to-games.ts';
import { collectResults, loadResults } from '../../src/results/load.ts';
import { readChampionList } from '../../src/results/champions.ts';
import { formFactor } from '../../src/rating/form.ts';
import { loadEngineConfig, selectGames } from '../../src/rating/engine.ts';
import { ROSTER } from '../../src/data/roster.ts';

type Row = Record<string, unknown>;
const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'] as const;
const CHAMP: Record<string, string> = { TOP: 'ヨリック', JG: 'パンテオン', MID: 'アカリ', ADC: 'ユナラ', SUP: 'ルル' };
const CHAMPS = readChampionList({ champions: { Yorick: 'ヨリック', Pantheon: 'パンテオン', Akali: 'アカリ', Yunara: 'ユナラ', Lulu: 'ルル' }, keys: { Yorick: 83, Pantheon: 80, Akali: 84, Yunara: 804, Lulu: 117 } }).list!;
const SCRIM_FILE = '2026-10-10-lr-core-vs-dd-core.json';
const NOON_JST = Date.parse('2026-10-10T12:00:00+09:00');

/** 階級チームの 5 人。各 2 キル・2 デス・4 アシスト・10,000 ゴールド・10,000 ダメージ(goldPerMin は持たせない) */
const teamOf = (label: string): Row => {
  const [team, tier] = label.split(' ');
  const players = ROLES.map((role) => {
    const p = ROSTER.find((x) => x.team === team && x.tier === tier && x.role === role)!;
    return { role, rosterName: p.name, mappingConfidence: '確信', champion: CHAMP[role], kills: 2, deaths: 2, assists: 4, gold: 10000, damage: 10000 };
  });
  return { kills: 10, deaths: 10, assists: 20, gold: 50000, players };
};
const record = (over: Row = {}): Row => ({
  kind: 'scrim', date: '2026-10-10', listeners: false, source: { url: 'https://www.youtube.com/watch?v=x' }, duration: '40:00', winner: 'DD CORE',
  teams: { 'LR CORE': teamOf('LR CORE'), 'DD CORE': teamOf('DD CORE') }, ...over,
});
const team = (rec: Row, label: string) => (rec.teams as Record<string, { players: Row[] } & Row>)[label];
const load = (raw: Row[]) => {
  const r = collectResults([{ file: SCRIM_FILE, kind: 'scrim', raw }], { champions: CHAMPS });
  assert.deepEqual(r.errors, []);
  return scrimGameRecords(r.games);
};

test('基準12: 既存の記録(2026-10-09 の 3 試合)から、選手ごとに queueId 0・名簿のロールの teamPosition・正午(JST)・試合時間(分)の記録を作る', () => {
  // 試合日は LTKDB の 2026-10-09(価値責任者の確認 2026-10-12。配信の日付は 10-10)
  const REAL_FILE = '2026-10-09-lr-core-vs-dd-core.json';
  const REAL_NOON_JST = Date.parse('2026-10-09T12:00:00+09:00');
  const r = loadResults({ root: 'docs/research/grounds', champions: null });
  const by = scrimGameRecords(r.games.filter((g) => g.file === REAL_FILE));
  assert.equal(by.size, 10, '10 人');
  const jasper = by.get('DD-CORE-ADC')!;
  assert.equal(jasper.length, 3);
  const g6 = jasper.find((g) => g.matchId === 'SC-20261009-DD-CORE-LR-CORE-G3')!;
  assert.equal(g6.kind, 'scrim');
  assert.equal(g6.queueId, 0);
  assert.equal(g6.position, 'BOTTOM');
  assert.equal(g6.endTime, REAL_NOON_JST);
  assert.ok(Math.abs(g6.durationMin - (37 * 60 + 31) / 60) < 1e-9);
  // 6 試合目: じゃすぱー 44,348 ダメージ・573 G/分・10/5/8、チームのキル 24、チームのダメージ合計 101,063。対面は大御所にゅん子 32,700・435・3/5/8、チームのキル 16
  assert.equal(g6.me.totalDamageDealtToChampions, 44348);
  assert.equal(g6.me.goldPerMinute, 573);
  assert.deepEqual([g6.me.kills, g6.me.deaths, g6.me.assists, g6.me.goldEarned, g6.me.champLevel, g6.me.win], [10, 5, 8, 21498, 17, 1]);
  assert.ok(Math.abs(g6.me.killParticipation - 18 / 24) < 1e-9);
  assert.ok(Math.abs(g6.me.teamDamagePercentage - 44348 / 101063) < 1e-9);
  assert.equal('totalMinionsKilled' in g6.me, false, 'cs が null なら持たない');
  assert.equal('championId' in g6.me, false, '一覧が無ければ championId を持たない');
  assert.equal(g6.opp?.totalDamageDealtToChampions, 32700);
  assert.equal(g6.opp?.goldPerMinute, 435);
  assert.ok(Math.abs((g6.opp?.killParticipation ?? 0) - 11 / 16) < 1e-9);
  assert.equal(g6.opp?.win, 0);
  // 対応表に無い指標は持たない(F-009 基準 8 で除外される)
  for (const k of ['soloKills', 'maxCsAdvantageOnLaneOpponent', 'laningPhaseGoldExpAdvantage', 'enemyChampionImmobilizations', 'pickKillWithAlly', 'damageTakenOnTeamPercentage', 'visionScorePerMinute', 'teamGoldEarned']) {
    assert.equal(k in g6.me, false, k);
  }
  // 5 試合目は CS がある
  const g5 = jasper.find((g) => g.matchId === 'SC-20261009-DD-CORE-LR-CORE-G2')!;
  assert.equal(g5.me.totalMinionsKilled, 489);
  // 負けた側は win 0、全員が 3 試合
  assert.ok([...by.values()].every((gs) => gs.length === 3));
  assert.ok(by.get('LR-CORE-TOP')!.every((g) => g.me.win === 0 && g.opp?.win === 1));
});

test('基準12: goldPerMin が無ければ gold ÷ 試合時間(分)、champion は一覧の key、null なら championId を持たず、「未確認」の行は記録を作らず対面も無し', () => {
  const rec = record();
  team(rec, 'DD CORE').players[3].cs = 300;
  team(rec, 'DD CORE').players[3].level = 18;
  team(rec, 'DD CORE').players[1].champion = null;
  team(rec, 'LR CORE').players[3].mappingConfidence = '未確認(表示名が違う)';
  const by = load([rec]);
  const adc = by.get('DD-CORE-ADC')![0];
  assert.ok(Math.abs(adc.me.goldPerMinute - 10000 / 40) < 1e-9, 'gold ÷ 40 分');
  assert.equal(adc.me.championId, 804);
  assert.deepEqual([adc.me.totalMinionsKilled, adc.me.champLevel], [300, 18]);
  assert.equal(adc.opp, null, '対面(LR CORE ADC)が未確認なら対面なし');
  assert.equal(by.has('LR-CORE-ADC'), false, '未確認の行は記録を作らない');
  assert.equal('championId' in by.get('DD-CORE-JG')![0].me, false, 'champion が null なら championId を持たない');
  assert.equal(by.get('DD-CORE-JG')![0].opp?.championId, 80, '対面のチャンピオン');
  assert.equal(by.get('DD-CORE-TOP')![0].opp?.totalDamageDealtToChampions, 10000);
  assert.ok(Math.abs(by.get('DD-CORE-TOP')![0].me.teamDamagePercentage - 0.2) < 1e-9);
  assert.ok(Math.abs(by.get('DD-CORE-TOP')![0].me.killParticipation - 6 / 10) < 1e-9);
});

test('基準12: チームのキルが 0 ならキル関与は 0。本番の記録は対象外', () => {
  const rec = record();
  for (const p of team(rec, 'LR CORE').players) { p.kills = 0; p.assists = 0; }
  team(rec, 'LR CORE').kills = 0;
  team(rec, 'LR CORE').assists = 0;
  const by = load([rec]);
  assert.equal(by.get('LR-CORE-MID')![0].me.killParticipation, 0);
  const r = collectResults([{ file: '2026-10-15-regular-day1.json', kind: 'official', raw: [{ ...record({ kind: 'official', date: '2026-10-15', stage: 'regular', day: 1, tier: 'NEXT', match: null, game: 1, winner: 'CC NEXT', teams: { 'CC NEXT': teamOf('CC NEXT'), 'DD NEXT': teamOf('DD NEXT') } }) }] }], { champions: CHAMPS });
  assert.deepEqual(r.errors, []);
  assert.equal(scrimGameRecords(r.games).size, 0);
});

test('基準14: スクリムの記録はソロランクと同じ条件(120 日・10 分・ロール)で選ばれ、調子の係数(キュー 420・440)には使われない', () => {
  const cfg = loadEngineConfig();
  const now = Date.parse('2026-10-11T03:00:00Z');
  const by = load([record(), record({ duration: '09:30' })]);
  const games = by.get('DD-CORE-MID')!;
  assert.equal(games.length, 2);
  assert.equal(selectGames(games, now, cfg, { roleOnly: false, position: 'MIDDLE' }).length, 1, '10 分未満は除く');
  assert.equal(selectGames(games, now, cfg, { roleOnly: true, position: 'TOP' }).length, 0, 'ロールが違えば除く');
  assert.equal(selectGames(games, now + 121 * 86_400_000, cfg, { roleOnly: false, position: 'MIDDLE' }).length, 0, '120 日より古ければ除く');
  const form = formFactor(games.map((g) => ({ endTime: g.endTime, durationMin: g.durationMin, queueId: g.queueId, win: g.me.win === 1 })), [], now);
  assert.equal(form.games, 0, 'スクリムは調子の係数の試合に数えない');
  assert.equal(form.coefficient, 1);
});
