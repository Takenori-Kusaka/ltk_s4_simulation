// F-004 Task-2: 受入基準 12〜17(スクリムを個人の評価へ)。実装を読まずに受入基準から書いた
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrimGameRecords } from '../../src/results/to-games.ts';
import type { LoadedResults, MatchResult, PlayerResult, TeamResult, TierTeamId } from '../../src/results/types.ts';
import type { GameRecord } from '../../src/rating/types.ts';
import { ROSTER, type Role } from '../../src/data/roster.ts';

const ROLES: Role[] = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];
const POSITION_OF: Record<string, string> = { TOP: 'TOP', JG: 'JUNGLE', MID: 'MIDDLE', ADC: 'BOTTOM', SUP: 'UTILITY' };

type RowOver = Partial<Omit<PlayerResult, 'playerId' | 'rosterName' | 'role'>>;

/** 名簿の選手の行。値は既定(2/2/4・10,000 ゴールド・10,000 ダメージ)に over を重ねる */
const row = (teamId: TierTeamId, role: Role, over: RowOver = {}): PlayerResult => {
  const [team, tier] = teamId.split('-');
  const p = ROSTER.find((x) => x.team === team && x.tier === tier && x.role === role)!;
  return {
    playerId: p.id,
    rosterName: p.name,
    role,
    champion: 'アカリ',
    championId: 84,
    kills: 2, deaths: 2, assists: 4, gold: 10000, damage: 10000,
    cs: 200, level: 15, goldPerMin: 350,
    mappingConfidence: '確信',
    use: true,
    ...over,
  };
};

/** 階級チームの 5 人。チームの kills は over で上書きできる(既定は 5 人の kills の和) */
const teamOf = (teamId: TierTeamId, rows: Partial<Record<Role, RowOver>> = {}, teamOver: Partial<TeamResult> = {}): TeamResult => {
  const players = ROLES.map((r) => row(teamId, r, rows[r] ?? {}));
  const sum = (k: 'kills' | 'deaths' | 'assists' | 'gold') => players.reduce((s, p) => s + p[k], 0);
  return { kills: sum('kills'), deaths: sum('deaths'), assists: sum('assists'), gold: sum('gold'), players, ...teamOver };
};

const match = (o: { matchId: string; kind?: 'scrim' | 'official'; date?: string; durationSec?: number; teams: [TierTeamId, TierTeamId]; winner: TierTeamId; stats: Record<string, TeamResult> }): MatchResult => ({
  matchId: o.matchId,
  kind: o.kind ?? 'scrim',
  date: o.date ?? '2026-10-10',
  file: '2026-10-10-lr-core-vs-dd-core.json',
  index: 0,
  duration: '30:30',
  durationSec: o.durationSec ?? 1830,
  teams: o.teams,
  winner: o.winner,
  sides: { blue: o.teams[0], red: o.teams[1] },
  source: { url: 'https://www.youtube.com/watch?v=AZbkNH5Z5-I', resultScreenSec: 30135 },
  official: o.kind === 'official' ? { stage: 'regular', day: 1, tier: 'NEXT', match: null, game: 1 } : null,
  stats: o.stats,
});

/** 対応表の検査用の 1 試合。DD CORE が勝ち、LR CORE はキル 0。DD の TOP は「未確認」 */
const G1 = match({
  matchId: 'SC-20261010-DD-CORE-LR-CORE-G1',
  teams: ['DD-CORE', 'LR-CORE'],
  winner: 'DD-CORE',
  durationSec: 1830,
  stats: {
    'DD-CORE': teamOf('DD-CORE', {
      TOP: { damage: 10000, use: false, mappingConfidence: '未確認' },
      JG: { damage: 8000, kills: 3 },
      MID: { damage: 18000, kills: 6 },
      ADC: { kills: 5, deaths: 1, assists: 3, gold: 12000, damage: 20000, cs: 250, level: 16, goldPerMin: 400, champion: 'ユナラ', championId: 804 },
      SUP: { damage: 4000, kills: 0 },
    }, { kills: 16 }),
    'LR-CORE': teamOf('LR-CORE', {
      TOP: { kills: 0 }, JG: { kills: 0 }, MID: { kills: 0 }, SUP: { kills: 0 },
      ADC: { kills: 0, deaths: 4, assists: 1, gold: 9000, damage: 15000, cs: null, level: null, goldPerMin: null, champion: null, championId: null },
    }, { kills: 0 }),
  },
});
const G2 = match({
  matchId: 'SC-20261010-DD-CORE-LR-CORE-G2',
  teams: ['DD-CORE', 'LR-CORE'],
  winner: 'LR-CORE',
  durationSec: 1500,
  stats: { 'DD-CORE': teamOf('DD-CORE'), 'LR-CORE': teamOf('LR-CORE') },
});
const OFFICIAL = match({
  matchId: 'RS-1-CC-DD-NEXT',
  kind: 'official',
  date: '2026-10-15',
  teams: ['CC-NEXT', 'DD-NEXT'],
  winner: 'CC-NEXT',
  stats: { 'CC-NEXT': teamOf('CC-NEXT'), 'DD-NEXT': teamOf('DD-NEXT') },
});

const loaded = (games: MatchResult[]): Pick<LoadedResults, 'games'> => ({ games });

/** キーの集合が同じで、値が 1e-9 以内で一致する */
const near = (actual: Record<string, number> | null | undefined, expected: Record<string, number>, label: string) => {
  assert.ok(actual, `${label}: 値が無い`);
  assert.deepEqual(Object.keys(actual!).sort(), Object.keys(expected).sort(), `${label}: キー`);
  for (const k of Object.keys(expected)) assert.ok(Math.abs(actual![k] - expected[k]) < 1e-9, `${label}.${k}: ${actual![k]} vs ${expected[k]}`);
};

const one = (out: Record<string, GameRecord[]>, id: string): GameRecord => {
  assert.equal(out[id]?.length, 1, `${id} の記録の数`);
  return out[id][0];
};

test('基準12: 試合 ID・queueId 0・終了時刻(試合日の正午 JST)・試合時間(分)・名簿のロールの teamPosition を持つ', () => {
  const out = scrimGameRecords(loaded([G1]), { weight: 2 });
  const adc = one(out, 'DD-CORE-ADC');
  assert.equal(adc.matchId, 'SC-20261010-DD-CORE-LR-CORE-G1');
  assert.equal(adc.queueId, 0);
  assert.equal(adc.endTime, Date.parse('2026-10-10T12:00:00+09:00'));
  assert.ok(Math.abs(adc.durationMin - 30.5) < 1e-9, `${adc.durationMin}`);
  for (const teamId of ['DD-CORE', 'LR-CORE'] as const) {
    for (const role of ROLES) {
      const id = `${teamId}-${role}`;
      if (id === 'DD-CORE-TOP') continue; // 「未確認」の行
      assert.equal(one(out, id).position, POSITION_OF[role], id);
    }
  }
});

test('基準12: 指標の対応表のとおりに me を作る(すべてのキー。対応表に無い指標は持たない)', () => {
  const adc = one(scrimGameRecords(loaded([G1]), { weight: 2 }), 'DD-CORE-ADC');
  near(adc.me, {
    totalDamageDealtToChampions: 20000,
    goldPerMinute: 400,
    deaths: 1,
    kills: 5,
    assists: 3,
    killParticipation: (5 + 3) / 16,
    teamDamagePercentage: 20000 / (10000 + 8000 + 18000 + 20000 + 4000),
    goldEarned: 12000,
    totalMinionsKilled: 250,
    champLevel: 16,
    win: 1,
    championId: 804,
  }, 'DD-CORE-ADC.me');
});

test('基準12: opp は対面(相手チームの同じロール)の行の同じ対応。goldPerMin・cs・level・champion が null の扱い、チームのキル 0 のキル関与 0、負けは win 0', () => {
  const out = scrimGameRecords(loaded([G1]), { weight: 2 });
  const lrDamage = 10000 * 4 + 15000;
  const lrAdc = {
    totalDamageDealtToChampions: 15000,
    goldPerMinute: 9000 / (1830 / 60),
    deaths: 4,
    kills: 0,
    assists: 1,
    killParticipation: 0,
    teamDamagePercentage: 15000 / lrDamage,
    goldEarned: 9000,
    win: 0,
  };
  // 対面の行から作った opp は、相手の選手自身の me と同じ
  near(one(out, 'DD-CORE-ADC').opp, lrAdc, 'DD-CORE-ADC.opp');
  near(one(out, 'LR-CORE-ADC').me, lrAdc, 'LR-CORE-ADC.me');
  const me = one(out, 'LR-CORE-ADC').me;
  assert.ok(!('totalMinionsKilled' in me), 'cs が null なら totalMinionsKilled を持たない');
  assert.ok(!('champLevel' in me), 'level が null なら champLevel を持たない');
  assert.ok(!('championId' in me), 'championId が null なら championId を持たない');
  assert.equal(one(out, 'LR-CORE-ADC').opp?.championId, 804);
});

test('基準12: チームのキルが 0 なら、キル関与はアシストがあっても 0', () => {
  const out = scrimGameRecords(loaded([G1]), { weight: 2 });
  for (const role of ROLES) {
    const g = one(out, `LR-CORE-${role}`);
    assert.equal(g.me.killParticipation, 0, role);
    assert.ok(Number.isFinite(g.me.killParticipation), role);
  }
});

test('基準12(基準6): 「未確認」(use: false)の行は記録を作らず、その行を対面とする相手の opp は null', () => {
  const out = scrimGameRecords(loaded([G1]), { weight: 2 });
  assert.equal((out['DD-CORE-TOP'] ?? []).length, 0);
  assert.equal(one(out, 'LR-CORE-TOP').opp, null);
  assert.notEqual(one(out, 'LR-CORE-JG').opp, null);
});

test('基準12: 本番の記録(kind official)からは試合の記録を作らない', () => {
  const out = scrimGameRecords(loaded([G1, OFFICIAL]), { weight: 2 });
  for (const teamId of ['CC-NEXT', 'DD-NEXT']) {
    for (const role of ROLES) assert.equal((out[`${teamId}-${role}`] ?? []).length, 0, `${teamId}-${role}`);
  }
  const all = Object.values(out).flat();
  assert.ok(all.every((g) => g.matchId.startsWith('SC-')), all.map((g) => g.matchId).join(','));
  assert.deepEqual(scrimGameRecords(loaded([OFFICIAL]), { weight: 2 }), {}, '本番だけなら空');
});

test('基準12: 選手ごとの配列は記録の順。勝敗は試合ごと', () => {
  const out = scrimGameRecords(loaded([G1, G2]), { weight: 2 });
  const adc = out['DD-CORE-ADC'];
  assert.deepEqual(adc.map((g) => g.matchId), ['SC-20261010-DD-CORE-LR-CORE-G1', 'SC-20261010-DD-CORE-LR-CORE-G2']);
  assert.deepEqual(adc.map((g) => g.me.win), [1, 0]);
  assert.ok(Math.abs(adc[1].durationMin - 25) < 1e-9);
  // G2 では DD-CORE-TOP は確認済み → 1 試合だけ
  assert.deepEqual(out['DD-CORE-TOP'].map((g) => g.matchId), ['SC-20261010-DD-CORE-LR-CORE-G2']);
});

test('基準13: 各記録に opts.weight の重みを付ける', () => {
  const two = Object.values(scrimGameRecords(loaded([G1, G2]), { weight: 2 })).flat();
  assert.ok(two.length > 0);
  assert.ok(two.every((g) => g.weight === 2), two.map((g) => g.weight).join(','));
  const other = Object.values(scrimGameRecords(loaded([G1]), { weight: 1.5 })).flat();
  assert.ok(other.every((g) => g.weight === 1.5));
});
