// F-009 Task-11: 受入基準 28〜30(経歴の記録の読み込みと、ランクの基準の出どころ・出典の表示)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRatings, loadRatingInputs, type PlayerRatingInput } from '../../src/rating/build.ts';

const NOW = Date.parse('2026-10-09T00:00:00Z');

/** 根拠の記録の置き場(コール力・大会経験は空)。career を渡せば経歴の記録も置く */
function grounds(career?: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'f009-grounds-'));
  writeFileSync(join(dir, 'shotcalling.json'), JSON.stringify({ kind: 'evidence-shotcalling', players: {} }));
  writeFileSync(join(dir, 'tournament.json'), JSON.stringify({ kind: 'evidence-tournament', players: {} }));
  if (career !== undefined) writeFileSync(join(dir, 'career.json'), JSON.stringify(career));
  return dir;
}

/** 取得済みの選手がいない data/raw */
function rawDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'f009-raw-'));
  mkdirSync(join(dir, 'players'));
  mkdirSync(join(dir, 'matches'));
  return dir;
}

/** 経歴の記録(docs/research/grounds/normalized/career.json)の形 */
const CAREER = {
  kind: 'evidence-career-normalized',
  players: {
    'DD-MASTERS-TOP': {
      peak: {
        allTime: { tier: 'Challenger', division: null, lp: 1883, isLowerBound: false, source: 'https://example.test/opgg/top' },
        thisSeason: { tier: 'Challenger', division: null, lp: 1883, isLowerBound: false, source: 'https://example.test/opgg/top' },
      },
      lol: { highestLevel: 'LJL-starter', basis: ['lolPro[0]'], statusSource: 'https://example.test/wiki/top' },
    },
    'DD-MASTERS-JG': {
      peak: {
        allTime: { tier: 'Emerald', division: 2, lp: 45, isLowerBound: false, source: 'https://example.test/opgg/jg' },
        thisSeason: { tier: 'Diamond', division: 4, lp: null, isLowerBound: true, source: 'https://example.test/opgg/jg-season' },
      },
      lol: { highestLevel: 'none', basis: [], statusSource: 'https://example.test/news/jg' },
    },
    'DD-MASTERS-MID': {
      peak: { allTime: null, thisSeason: null },
      lol: { highestLevel: 'LJL CS-starter', basis: ['lolPro[0]'], statusSource: null },
    },
    'DD-MASTERS-ADC': {
      peak: {
        allTime: { tier: 'Master', division: null, lp: null, isLowerBound: true, source: '' },
        thisSeason: { tier: 'Master', division: null, lp: 200, isLowerBound: false, source: null },
      },
      lol: { highestLevel: 'academy', basis: [], statusSource: null },
    },
  },
};

const find = (players: PlayerRatingInput[], id: string) => players.find((p) => p.playerId === id)!;

test('AC28: career.json が無ければ従来どおり(最高ランクと元プロの経歴は空、エラーも無い)', () => {
  const { inputs, errors } = loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds() });
  assert.deepEqual(errors, []);
  assert.equal(inputs.players.length, 60);
  for (const p of inputs.players) {
    assert.equal(p.peakRank ?? null, null, p.playerId);
    assert.equal(p.seasonPeakRank ?? null, null, p.playerId);
    assert.equal(p.exPro ?? null, null, p.playerId);
  }
});

test('AC28: career.json を読み、最高ランク(tier・division・lp・出典)と元プロの経歴(区分・出典)を入力に加える', () => {
  const { inputs, errors } = loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds(CAREER) });
  const top = find(inputs.players, 'DD-MASTERS-TOP');
  assert.deepEqual(top.peakRank, { tier: 'Challenger', division: '', lp: 1883, source: 'https://example.test/opgg/top' });
  assert.deepEqual(top.seasonPeakRank, { tier: 'Challenger', division: '', lp: 1883, source: 'https://example.test/opgg/top' });
  assert.deepEqual(top.exPro, { level: 'LJL-starter', source: 'https://example.test/wiki/top', years: 0 });
  // division は 1〜4 の数で記録されている → I〜IV。今季の記録(peak.thisSeason)も読み、LP 不明は 0 LP
  const jg = find(inputs.players, 'DD-MASTERS-JG');
  assert.deepEqual(jg.peakRank, { tier: 'Emerald', division: 'II', lp: 45, source: 'https://example.test/opgg/jg' });
  assert.deepEqual(jg.seasonPeakRank, { tier: 'Diamond', division: 'IV', lp: 0, source: 'https://example.test/opgg/jg-season' });
  assert.equal(jg.exPro ?? null, null, 'highestLevel が none なら元プロではない');
  // 最高ランクが無い(tier が無い)選手。プロの経歴の出典は、statusSource が無ければ経歴の記録の行(basis)
  const mid = find(inputs.players, 'DD-MASTERS-MID');
  assert.equal(mid.peakRank ?? null, null);
  assert.equal(mid.seasonPeakRank ?? null, null);
  assert.equal(mid.exPro?.level, 'LJL CS-starter');
  assert.match(mid.exPro?.source ?? '', /lolPro\[0\]/);
  // 出典の無い最高ランク(歴代・今季)・出典の無いプロの経歴は使わず、エラーに出す
  const adc = find(inputs.players, 'DD-MASTERS-ADC');
  assert.equal(adc.peakRank ?? null, null);
  assert.equal(adc.seasonPeakRank ?? null, null);
  assert.equal(adc.exPro ?? null, null);
  assert.ok(errors.some((e) => e.includes('DD-MASTERS-ADC') && e.includes('最高ランク') && !e.includes('今季')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('DD-MASTERS-ADC') && e.includes('最高ランク(今季)')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('DD-MASTERS-ADC') && e.includes('プロの経歴')), errors.join('\n'));
  // 記録に無い選手は空
  const other = find(inputs.players, 'CC-MASTERS-TOP');
  assert.equal(other.peakRank ?? null, null);
  assert.equal(other.seasonPeakRank ?? null, null);
  assert.equal(other.exPro ?? null, null);
});

test('AC29/AC30: 軸の説明にランクの基準の出どころ(ソロランク / 最高ランク / 元プロの下限)と出典を示す', () => {
  const base = (id: string, extra: Partial<PlayerRatingInput>): PlayerRatingInput => ({
    playerId: id,
    name: id,
    tier: 'MASTERS',
    position: 'MIDDLE',
    rank: null,
    games: [],
    league: [],
    shotcalling: [],
    tournament: { ltk: [], coach: [], pro: [], other: [] },
    ...extra,
  });
  const players = [
    base('EX', { rank: { tier: 'GOLD', division: 'IV', lp: 0 }, exPro: { level: 'LJL-sub', source: 'https://example.test/wiki/A' } }),
    base('PK', { rank: { tier: 'EMERALD', division: 'II', lp: 40 }, peakRank: { tier: 'Master', division: '', lp: 120, source: 'https://example.test/opgg/pk' } }),
    base('SO', { rank: { tier: 'DIAMOND', division: 'I', lp: 50 } }),
    // 歴代は Challenger の LP 不明(0 LP = 8.00)、今季は Grandmaster 1060LP(9.41)→ 今季の記録を採る
    base('SE', {
      rank: { tier: 'EMERALD', division: 'I', lp: 10 },
      peakRank: { tier: 'Challenger', division: '', lp: 0, source: 'https://example.test/opgg/se-all' },
      seasonPeakRank: { tier: 'Grandmaster', division: '', lp: 1060, source: 'https://example.test/opgg/se' },
    }),
  ];
  const ratings = buildRatings({ players, matches: [] }, NOW);
  const reason = (id: string) => ratings.find((r) => r.playerId === id)!.axes.find((a) => a.key === 'ground')!.reason;
  assert.match(reason('EX'), /ランクの基準 8\.00\(元プロの下限: LJL-sub。出典: https:\/\/example\.test\/wiki\/A\)/);
  assert.match(reason('PK'), /ランクの基準 8\.16\(最高ランク: Master 120LP。出典: https:\/\/example\.test\/opgg\/pk\)/);
  assert.match(reason('SO'), /ランクの基準 \d\.\d\d\(ソロランク\)/);
  assert.match(reason('SE'), /ランクの基準 9\.41\(最高ランク\(今季\): Grandmaster 1060LP。出典: https:\/\/example\.test\/opgg\/se\)/);
});

// F-009 基準12 の追記: 読み込み時に、経歴の記録の年数と出場記録の年数の大きい方をプロの経歴にする
test('基準12: career.json の lol.years が tournament.json の pro の年数より多い水準は、差分を足して評価の入力にし、理由の文に出る', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f009-grounds-pro-'));
  const src = 'docs/research/players-dd-cc.md';
  writeFileSync(join(dir, 'shotcalling.json'), JSON.stringify({ kind: 'evidence-shotcalling', players: {} }));
  writeFileSync(join(dir, 'tournament.json'), JSON.stringify({
    kind: 'evidence-tournament',
    players: {
      'DD-MASTERS-TOP': { ltk: [], coach: [], pro: [{ league: 'LJL', team: 'V3 Esports', years: 1, source: src }, { league: 'LJL', team: 'QT DIG∞', years: 1, source: src }], other: [] },
      'DD-MASTERS-MID': { ltk: [], coach: [], pro: [{ league: 'LJL CS', team: 'x', years: 1, source: src }], other: [] },
    },
  }));
  const years = (o: Record<string, number>) => ({ 'overseas-major': 0, 'LJL-starter': 0, 'LJL-sub': 0, 'overseas-minor': 0, 'LJL CS-starter': 0, 'LJL CS-sub': 0, academy: 0, ...o });
  writeFileSync(join(dir, 'career.json'), JSON.stringify({
    kind: 'evidence-career-normalized',
    players: {
      'DD-MASTERS-TOP': { peak: { allTime: null, thisSeason: null }, lol: { highestLevel: 'LJL-starter', years: years({ 'LJL-starter': 5 }), basis: ['lolPro[0]'], statusSource: 'https://lol.fandom.com/wiki/Washidai' } },
      'DD-MASTERS-MID': { peak: { allTime: null, thisSeason: null }, lol: { highestLevel: 'none', years: years({}), basis: [], statusSource: null } },
    },
  }));
  const { inputs, errors } = loadRatingInputs({ rawDir: rawDir(), groundsDir: dir });
  assert.deepEqual(errors, []);
  const top = find(inputs.players, 'DD-MASTERS-TOP').tournament.pro;
  assert.deepEqual(top.map((x) => [x.league, x.team, x.years]), [['LJL', 'V3 Esports', 1], ['LJL', 'QT DIG∞', 1], ['LJL', '経歴の記録(career.json)', 3]]);
  assert.equal(top[2].source, 'https://lol.fandom.com/wiki/Washidai');
  // 出場記録の方が多い水準(経歴の記録 0 年 vs 出場記録 1 年)は変えない
  assert.deepEqual(find(inputs.players, 'DD-MASTERS-MID').tournament.pro.map((x) => [x.league, x.years]), [['LJL CS', 1]]);
  // 評価の理由の文に足した項目が出る
  const rating = buildRatings(inputs, NOW).find((r) => r.playerId === 'DD-MASTERS-TOP')!;
  const t = rating.axes.find((a) => a.key === 'tournament')!;
  assert.ok(t.reason.includes('LJL 経歴の記録(career.json) 3 年'), t.reason);
});

// F-004 Task-2: 受入基準 12・15・16・17(スクリムを個人の評価へ)。実装を読まずに受入基準から書いた
import { readShotcallingSnapshot, shotcallingAxis } from '../../src/rating/evidence.ts';
import type { GameRecord, MatchForPopulation } from '../../src/rating/types.ts';
import type { LoadedResults, MatchResult, PlayerResult, TeamResult, TierTeamId } from '../../src/results/types.ts';
import { ROSTER } from '../../src/data/roster.ts';

const NOW2 = Date.parse('2026-10-12T00:00:00Z');
const DAY = 86_400_000;

/** スクリムの指標の対応表のキーをすべて持つ値(ADC) */
const scrimStats = (o: Record<string, number> = {}): Record<string, number> => ({
  totalDamageDealtToChampions: 20000, goldPerMinute: 400, deaths: 2, kills: 4, assists: 5, killParticipation: 0.6,
  teamDamagePercentage: 0.3, goldEarned: 12000, totalMinionsKilled: 250, champLevel: 16, win: 1, championId: 51, ...o,
});
const scrimRecord = (id: string, o: { ageDays?: number; me?: Record<string, number>; opp?: Record<string, number> | null } = {}): GameRecord => ({
  matchId: id,
  endTime: NOW2 - (o.ageDays ?? 2) * DAY,
  durationMin: 30,
  queueId: 0,
  position: 'BOTTOM',
  me: o.me ?? scrimStats(),
  opp: o.opp === undefined ? scrimStats({ totalDamageDealtToChampions: 15000, goldPerMinute: 350, deaths: 4, killParticipation: 0.5, teamDamagePercentage: 0.25, win: 0, championId: 22 }) : o.opp,
  weight: 2,
} as GameRecord);
const rankedRecord = (id: string, championId: number, win: 0 | 1, ageDays = 3): GameRecord => ({
  matchId: id,
  endTime: NOW2 - ageDays * DAY,
  durationMin: 30,
  queueId: 420,
  position: 'BOTTOM',
  me: { ...scrimStats({ championId, win }), soloKills: 1 },
  opp: { ...scrimStats({ totalDamageDealtToChampions: 18000, championId: 22, win: 1 - win }), soloKills: 0 },
});
/** 母集団: BOTTOM の対面の差がばらつく 4 試合 */
const POP: MatchForPopulation[] = [0, 1, 2, 3].map((i) => ({
  participants: [
    { position: 'BOTTOM', teamId: 100, stats: { ...scrimStats({ totalDamageDealtToChampions: 18000 + 1000 * i, goldPerMinute: 380 + 10 * i, deaths: 2 + i, killParticipation: 0.4 + 0.05 * i, teamDamagePercentage: 0.25 + 0.02 * i }), soloKills: i } },
    { position: 'BOTTOM', teamId: 200, stats: { ...scrimStats({ totalDamageDealtToChampions: 20000 - 1000 * i, goldPerMinute: 400 - 10 * i, deaths: 4 - i, killParticipation: 0.5 - 0.05 * i, teamDamagePercentage: 0.3 - 0.02 * i }), soloKills: 2 - i } },
  ],
}));
const adcInput = (id: string, games: GameRecord[]): PlayerRatingInput => ({
  playerId: id,
  name: id,
  tier: 'CORE',
  position: 'BOTTOM',
  rank: { tier: 'DIAMOND', division: 'IV', lp: 0 },
  games,
  league: [],
  shotcalling: [],
  tournament: { ltk: [], coach: [], pro: [], other: [] },
});

test('基準15: スクリムの試合を使ったデータの軸の説明に「スクリム n 試合(重み 2)を含む」を出し、0 件の軸と選手には出さない', () => {
  const ranked = [rankedRecord('R1', 51, 1), rankedRecord('R2', 51, 0)];
  const scrims = [scrimRecord('S1'), scrimRecord('S2'), scrimRecord('S3')];
  const ratings = buildRatings({ players: [adcInput('WITH', [...ranked, ...scrims]), adcInput('WITHOUT', ranked)], matches: POP }, NOW2);
  const axisOf = (pid: string, key: string) => ratings.find((r) => r.playerId === pid)!.axes.find((a) => a.key === key)!;
  // 地力(ダメージ・GPM)・集団戦(BOTTOM のダメージ割合)・連携(キル関与)・安定感(デス)はスクリムの指標で計算できる
  for (const key of ['ground', 'teamfight', 'synergy', 'stability']) {
    const a = axisOf('WITH', key);
    assert.equal(a.data?.scrimGames, 3, `${key} の scrimGames`);
    assert.ok(a.reason.includes('スクリム 3 試合(重み 2)を含む'), `${key}: ${a.reason}`);
  }
  // レーン戦は 14 分の値を要する → スクリムは効かない
  const laning = axisOf('WITH', 'laning');
  assert.equal(laning.data?.scrimGames, 0);
  assert.ok(!laning.reason.includes('スクリム'), laning.reason);
  const without = ratings.find((r) => r.playerId === 'WITHOUT')!;
  for (const a of without.axes) assert.ok(!a.reason.includes('スクリム'), `${a.key}: ${a.reason}`);
});

test('基準15: 説明の n はその軸に使った試合の数(期間外のスクリムは数えない)', () => {
  const games = [rankedRecord('R1', 51, 1), scrimRecord('S1'), scrimRecord('S2'), scrimRecord('OLD', { ageDays: 121 })];
  const r = buildRatings({ players: [adcInput('P', games)], matches: POP }, NOW2)[0];
  const ground = r.axes.find((a) => a.key === 'ground')!;
  assert.ok(ground.reason.includes('スクリム 2 試合(重み 2)を含む'), ground.reason);
});

test('基準16: ピックプールはスクリムの使用チャンピオンを 1 試合(重みを掛けない)として数え、championId の無い試合は数えない', () => {
  const noChamp = scrimStats();
  delete noChamp.championId;
  const games = [
    rankedRecord('R1', 51, 1), rankedRecord('R2', 51, 0), rankedRecord('R3', 51, 1),
    scrimRecord('S1', { me: scrimStats({ championId: 51, win: 1 }) }),
    scrimRecord('S2', { me: scrimStats({ championId: 51, win: 0 }) }),
    scrimRecord('S3', { me: scrimStats({ championId: 202, win: 1 }) }),
    scrimRecord('S4', { me: scrimStats({ championId: 202, win: 1 }) }),
    scrimRecord('S5', { me: scrimStats({ championId: 202, win: 0 }) }),
    scrimRecord('S6', { me: noChamp }),
    scrimRecord('S7', { me: noChamp }),
  ];
  const r = buildRatings({ players: [adcInput('P', games)], matches: POP }, NOW2)[0];
  const pool = r.axes.find((a) => a.key === 'pool')!.data!.poolDetail!;
  const byId = Object.fromEntries(pool.list.map((x) => [x.championId, x.games]));
  assert.equal(byId[51], 5, 'ソロランク 3 + スクリム 2(重み 2 を掛ければ 7)');
  assert.equal(byId[202], 3, 'スクリムだけのチャンピオン 3 試合(重みを掛ければ 6)');
  assert.deepEqual(Object.keys(byId).map(Number).sort((a, b) => a - b), [51, 202], 'championId の無い試合はチャンピオンに数えない');
  assert.equal(pool.list.reduce((s, x) => s + x.games, 0), 8, 'championId の無い試合は試合数にも数えない');
  assert.equal(pool.champions, 2);
});

test('基準16: スクリムの試合は勝敗つきで数える(同じ試合数で全勝と全敗の勝率が違う)', () => {
  const make = (win: 0 | 1) => [0, 1, 2, 3].map((i) => scrimRecord(`S${i}`, { me: scrimStats({ championId: 202, win }) }));
  const wins = buildRatings({ players: [adcInput('W', make(1))], matches: POP }, NOW2)[0].axes.find((a) => a.key === 'pool')!.data!.poolDetail!;
  const losses = buildRatings({ players: [adcInput('L', make(0))], matches: POP }, NOW2)[0].axes.find((a) => a.key === 'pool')!.data!.poolDetail!;
  const w = wins.list.find((x) => x.championId === 202)!;
  const l = losses.list.find((x) => x.championId === 202)!;
  assert.equal(w.games, 4);
  assert.equal(l.games, 4);
  assert.ok(w.winRate > l.winRate, `${w.winRate} vs ${l.winRate}`);
});

// --- 基準12: loadRatingInputs の results ---
const ROLES5 = ['TOP', 'JG', 'MID', 'ADC', 'SUP'] as const;
const resultTeam = (teamId: TierTeamId): TeamResult => {
  const [team, tier] = teamId.split('-');
  const players: PlayerResult[] = ROLES5.map((role) => {
    const p = ROSTER.find((x) => x.team === team && x.tier === tier && x.role === role)!;
    return {
      playerId: p.id, rosterName: p.name, role, champion: 'アカリ', championId: 84,
      kills: 2, deaths: 2, assists: 4, gold: 10000, damage: 10000, cs: 200, level: 15, goldPerMin: null,
      mappingConfidence: '確信', use: true,
    };
  });
  return { kills: 10, deaths: 10, assists: 20, gold: 50000, players };
};
const scrimResults = (): LoadedResults => {
  const g: MatchResult = {
    matchId: 'SC-20261010-DD-CORE-LR-CORE-G1', kind: 'scrim', date: '2026-10-10', file: '2026-10-10-lr-core-vs-dd-core.json', index: 0,
    duration: '30:00', durationSec: 1800, teams: ['DD-CORE', 'LR-CORE'], winner: 'DD-CORE', sides: { blue: 'DD-CORE', red: 'LR-CORE' },
    source: { url: 'https://www.youtube.com/watch?v=AZbkNH5Z5-I', resultScreenSec: 30135 }, official: null,
    stats: { 'DD-CORE': resultTeam('DD-CORE'), 'LR-CORE': resultTeam('LR-CORE') },
  };
  return { games: [g], excluded: [], unconfirmed: [], estimated: 0, errors: [], files: ['scrims/2026-10-10-lr-core-vs-dd-core.json'] };
};

test('基準12: loadRatingInputs に results を渡すと、スクリムの試合を各選手の games(ソロランクと同じ配列)に足し、warnings を返す', () => {
  const r = loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds(), results: scrimResults() } as Parameters<typeof loadRatingInputs>[0]);
  assert.ok(Array.isArray((r as { warnings?: unknown }).warnings), 'warnings は配列');
  const adc = find(r.inputs.players, 'DD-CORE-ADC');
  const sc = adc.games.filter((g) => g.queueId === 0);
  assert.equal(sc.length, 1);
  assert.equal(sc[0].matchId, 'SC-20261010-DD-CORE-LR-CORE-G1');
  assert.equal(sc[0].position, 'BOTTOM');
  assert.equal((sc[0] as GameRecord & { weight?: number }).weight, 2, '重みは評価設定の scrimGameWeight');
  assert.equal(sc[0].me.win, 1);
  assert.equal(find(r.inputs.players, 'LR-CORE-SUP').games.filter((g) => g.queueId === 0)[0]?.position, 'UTILITY');
  // 記録に出ていない選手には足さない
  assert.equal(find(r.inputs.players, 'CC-CORE-ADC').games.filter((g) => g.queueId === 0).length, 0);
});

test('基準12: results を渡さなければスクリムの試合は足さない', () => {
  const r = loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds() });
  assert.ok(r.inputs.players.every((p) => p.games.every((g) => g.queueId !== 0)));
});

// --- 基準17: スクリムの文字起こしから作ったコール力の根拠 ---
const scEv = (o: Record<string, unknown>) => ({ summary: 's', source: 'https://www.youtube.com/watch?v=abc&t=1234s', direction: '+', strength: '強', kind: 'player', collectedBy: 'human', ...o });
const SCRIM_ORIGIN = 'scrim-transcript-2026-10-10';

test('基準17: origin が scrim-transcript の根拠は、話者の特定(speakerIdentified: true)と時刻つきの URL が両方ある場合だけ読む', () => {
  const r = readShotcallingSnapshot({
    kind: 'evidence-shotcalling',
    players: {
      'DD-CORE-SUP': {
        name: 'x',
        evidence: [
          scEv({ summary: 'ok-query', origin: SCRIM_ORIGIN, speakerIdentified: true }),
          scEv({ summary: 'ok-short', origin: SCRIM_ORIGIN, speakerIdentified: true, source: 'https://youtu.be/abc?t=90' }),
          scEv({ summary: 'ok-hash', origin: SCRIM_ORIGIN, speakerIdentified: true, source: 'https://www.youtube.com/watch?v=abc#t=90' }),
          scEv({ summary: 'no-speaker', origin: SCRIM_ORIGIN }),
          scEv({ summary: 'speaker-false', origin: SCRIM_ORIGIN, speakerIdentified: false }),
          scEv({ summary: 'no-time', origin: SCRIM_ORIGIN, speakerIdentified: true, source: 'https://www.youtube.com/watch?v=abc' }),
          scEv({ summary: 'not-url', origin: SCRIM_ORIGIN, speakerIdentified: true, source: 'data/transcript/scrim.txt' }),
          scEv({ summary: 'other-origin', origin: 'career-research-2026-10-10', source: 'https://example.test/no-time' }),
        ],
      },
    },
  }) as ReturnType<typeof readShotcallingSnapshot> & { warnings?: string[] };
  assert.deepEqual(r.players['DD-CORE-SUP'].map((e) => e.summary), ['ok-query', 'ok-short', 'ok-hash', 'other-origin']);
  assert.deepEqual(r.errors, [], '読まない根拠はエラーではなく警告');
  const warnings = r.warnings ?? [];
  assert.ok(Array.isArray(r.warnings), 'warnings は配列');
  assert.ok(warnings.length >= 4, warnings.join('\n'));
  assert.ok(warnings.every((w) => w.includes('DD-CORE-SUP')), warnings.join('\n'));
  assert.ok(warnings.some((w) => w.includes('話者')), warnings.join('\n'));
  assert.ok(warnings.some((w) => w.includes('時刻')), warnings.join('\n'));
});

test('基準17: 条件を満たす根拠だけなら警告は出ない', () => {
  const r = readShotcallingSnapshot({
    kind: 'evidence-shotcalling',
    players: { 'DD-CORE-SUP': { name: 'x', evidence: [scEv({ origin: SCRIM_ORIGIN, speakerIdentified: true })] } },
  }) as ReturnType<typeof readShotcallingSnapshot> & { warnings?: string[] };
  assert.equal(r.players['DD-CORE-SUP'].length, 1);
  assert.deepEqual(r.warnings, []);
});

test('基準17: 読んだスクリムの文字起こしの根拠は確度を上げない(それだけなら「低」)', () => {
  const r = readShotcallingSnapshot({
    kind: 'evidence-shotcalling',
    players: {
      'DD-CORE-SUP': {
        name: 'x',
        evidence: [
          scEv({ summary: 'a', origin: SCRIM_ORIGIN, speakerIdentified: true }),
          scEv({ summary: 'b', origin: SCRIM_ORIGIN, speakerIdentified: true, source: 'https://www.youtube.com/watch?v=abc&t=2000s' }),
        ],
      },
      'DD-CORE-MID': {
        name: 'y',
        evidence: [
          scEv({ summary: 'a', origin: SCRIM_ORIGIN, speakerIdentified: true }),
          scEv({ summary: 'b', origin: SCRIM_ORIGIN, speakerIdentified: true, source: 'https://www.youtube.com/watch?v=abc&t=2000s' }),
          scEv({ summary: 'human', source: 'https://example.test/human' }),
        ],
      },
    },
  });
  assert.equal(r.players['DD-CORE-SUP'].length, 2);
  // 人の確認 2 件なら通常は「高」。スクリムの文字起こしの根拠だけなので「低」
  assert.equal(shotcallingAxis(r.players['DD-CORE-SUP']).confidence, '低');
  // 通常の根拠(人の確認 1 件 = 中)にスクリムの根拠を足しても「高」に上がらない
  assert.equal(shotcallingAxis(r.players['DD-CORE-MID']).confidence, '中');
});
