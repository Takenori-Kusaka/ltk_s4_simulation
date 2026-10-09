// F-010 Task-4: 受入基準 7・8・9・10・11・12・12b・12c・13(戦い方の特性とウィークサイド)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER } from '../../src/data/roster.ts';
import { POSITION, type PlayerRating, type PlayerRatingInput } from '../../src/rating/build.ts';
import type { GameRecord } from '../../src/rating/types.ts';
import type { TournamentRecord } from '../../src/rating/evidence.ts';
import type { Ltk3Row, Ltk3Snapshot } from '../../src/team/ltk3.ts';
import type { TierTeamIndicators } from '../../src/rating/team-indicators.ts';
import { computeStyle, TRAIT_DEFS, type StyleInput, type TierTeamStyle } from '../../src/team/style.ts';
import { computeStrength } from '../../src/team/strength.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-09T00:00:00Z');
const KEYS = ['ground', 'laning', 'teamfight', 'synergy', 'stability', 'pool', 'shotcalling', 'tournament'];
const near = (a: number | null | undefined, b: number, eps = 1e-9) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} != ${b}`);

function rating(id: string, axes: Partial<Record<string, number>> = {}, conf: Partial<Record<string, '高' | '中' | '低'>> = {}): PlayerRating {
  const p = ROSTER.find((r) => r.id === id)!;
  return {
    playerId: id, name: p.name, tier: p.tier, position: POSITION[p.role],
    form: { coefficient: 1, label: '普通', insufficient: false, games: 10, wins: 5, score: 0, components: { winRate: 0.5, winRateTerm: 0, lpDelta: null, lpTerm: 0, practiceTerm: 0 }, reason: '' },
    axes: KEYS.map((key) => ({ key, label: key, base: axes[key] ?? 5, display: axes[key] ?? 5, confidence: conf[key] ?? '高', estimated: false, marks: [], reason: '' })),
  };
}
const NO_RECORD: TournamentRecord = { ltk: [], coach: [], pro: [], other: [] };
const s3 = (team: string, tier: string, role: string): TournamentRecord => ({
  ...NO_RECORD, ltk: [{ season: 'S3', team, tier, role, wins: 1, losses: 1, source: 'test' }],
});
function input(id: string, extra: Partial<PlayerRatingInput> = {}): PlayerRatingInput {
  const p = ROSTER.find((r) => r.id === id)!;
  return { playerId: id, name: p.name, tier: p.tier, position: POSITION[p.role], rank: null, games: [], league: [], shotcalling: [], tournament: NO_RECORD, ...extra };
}
let seq = 0;
/** 自分のゴールドの割合 share と、対面とのゴールド差 diff の試合 */
const goldGame = (pos: string, share: number, diff: number): GameRecord => ({
  matchId: `G${++seq}`, endTime: NOW - (1 + (seq % 30)) * DAY, durationMin: 30, queueId: 420, position: pos,
  me: { goldEarned: 10000, teamGoldEarned: 10000 / share, win: 1 }, opp: { goldEarned: 10000 - diff, win: 0 },
});

const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];
interface G { ka14: number; kaA: number; tgd: number; lane: number; kp: number; games: number }
const BASE: G = { ka14: 0.2, kaA: 0.4, tgd: 0, lane: 300, kp: 0.5, games: 12 };
const metrics = (g: G, share: number | null, dmg: number | null, lane: number) => ({
  kaPerMinTo14: g.ka14, kaPerMinAfter14: g.kaA, teamGoldDiff14: g.tgd, laneGoldDiff14: lane, kp14: g.kp, goldShare: share, damageShare: dmg,
});
/** 12 の(チーム・階級)の本番の集計。over で一部の群の値を変える */
function ltk3(over: Record<string, Partial<G>> = {}, extra: Ltk3Row[] = []): Ltk3Snapshot {
  const teams: Ltk3Row[] = [];
  const roles: Ltk3Row[] = [];
  const SHARE: Record<string, number> = { TOP: 0.22, JG: 0.18, MID: 0.24, ADC: 0.26, SUP: 0.1 };
  for (const team of ['DD', 'CC', 'IT', 'LR'] as const) {
    for (const tier of ['NEXT', 'CORE', 'MASTERS']) {
      const g = { ...BASE, ...over[`${team}-${tier}`] };
      teams.push({ team, tier, kind: '本番', games: g.games, metrics: metrics(g, null, null, g.lane / 5) });
      for (const role of ROLES) {
        roles.push({ team, tier, kind: '本番', role, games: g.games, metrics: metrics(g, SHARE[role], SHARE[role], role === 'TOP' ? g.lane : -g.lane) });
      }
    }
  }
  return { kind: 'ltk3-aggregate', source: { name: 't', url: 'https://example.com', retrievedAt: '2026-10-09' }, description: '', teams: [...teams, ...extra], roles };
}

/** CC CORE は4人が S3 の CC CORE に所属(継続4人)、DD CORE は継続1人、IT CORE は継続3人(S3 の IT CORE) */
function base(): StyleInput {
  const ratings = ROSTER.map((p) => rating(p.id));
  const inputs = ROSTER.map((p) => {
    const t = `${p.team}-${p.tier}`;
    if (t === 'CC-CORE' && p.role !== 'SUP') return input(p.id, { tournament: s3('CC', 'CORE', p.role) });
    if (t === 'DD-CORE' && p.role === 'TOP') return input(p.id, { tournament: s3('DD', 'CORE', 'TOP') });
    if (t === 'IT-CORE' && ['TOP', 'JG', 'MID'].includes(p.role)) return input(p.id, { tournament: s3('IT', 'CORE', p.role) });
    return input(p.id);
  });
  return { ratings, inputs, now: NOW, ltk3: ltk3({ 'CC-CORE': { ka14: 0.4, tgd: 1500, lane: 900, kp: 0.3, games: 25 }, 'IT-CORE': { games: 12 } }), matches: [] };
}
const find = (xs: TierTeamStyle[], key: string) => xs.find((x) => `${x.team}-${x.tier}` === key)!;
const trait = (s: TierTeamStyle, key: string) => s.traits.find((t) => t.key === key)!;

test('AC7: 戦い方の特性は両端に名前の付いた目盛りで、強さの軸に入らない', () => {
  assert.deepEqual(TRAIT_DEFS.map((t) => [t.key, t.minusLabel, t.plusLabel]), [
    ['tempo', '終盤型', '序盤型'],
    ['laneVsGroup', '集合重視', 'レーン戦重視'],
    ['centroid', '', ''],
    ['objective', '優先度が低い', '優先度が高い'],
  ]);
  const strengthKeys = computeStrength({ ratings: base().ratings, inputs: base().inputs, now: NOW })[0].axes.map((a) => a.key as string);
  for (const t of TRAIT_DEFS) assert.ok(!strengthKeys.includes(t.key));
});

test('AC8: 序盤型⇄終盤型は (14 分までの K+A/分 ÷ 以降) の z とチームのゴールド差の z の平均 ÷ 2 で、+ が序盤型', () => {
  const out = computeStyle(base());
  const cc = trait(find(out, 'CC-CORE'), 'tempo');
  // 母集団: 12 群。CC CORE だけ比 1.0・差 1500、ほかは比 0.5・差 0。中央値 0.5 と 0、標準偏差 = 外れ値1つの母標準偏差
  const sdOf = (hi: number, lo: number) => Math.sqrt(((hi - lo) ** 2 * 11) / 144);
  const z1 = (1.0 - 0.5) / sdOf(1.0, 0.5);
  const z2 = 1500 / sdOf(1500, 0);
  near(cc.value, Math.min(1, ((z1 + z2) / 2) / 2));
  assert.ok(cc.value! > 0);
  near(trait(find(out, 'IT-CORE'), 'tempo').value, 0);
  assert.equal(cc.source, 'LTK3');
});

test('AC9: レーン戦重視⇄集合重視は (レーンのゴールド差の絶対値の平均の z − キル関与率の z) ÷ 2 ÷ 2 で、+ がレーン戦重視', () => {
  const cc = trait(find(computeStyle(base()), 'CC-CORE'), 'laneVsGroup');
  const sdOf = (hi: number, lo: number) => Math.sqrt(((hi - lo) ** 2 * 11) / 144);
  const zl = (900 - 300) / sdOf(900, 300);
  const zk = (0.3 - 0.5) / sdOf(0.3, 0.5);
  near(cc.value, Math.max(-1, Math.min(1, ((zl - zk) / 2) / 2)));
  assert.ok(cc.value! > 0);
});

test('AC10: 重心は TOP・JG・MID・BOT の合計が 100%、BOT は ADC と SUP の和。継続2人未満は個人の偏りだけで確度 低', () => {
  const out = computeStyle(base());
  const cc = trait(find(out, 'CC-CORE'), 'centroid');
  const sum = Object.values(cc.shares!).reduce((a, b) => a + b, 0);
  near(sum, 100, 1e-6);
  // 全員 地力・レーン戦 5.0 で個人の偏りは各 0.2。ADC 0.26・SUP 0.10 → BOT = (0.26 + 0.10) × 0.8 + 0.4 × 0.2
  near(cc.shares!.BOT, ((0.26 + 0.1) * 0.8 + 0.4 * 0.2) * 100, 1e-6);
  const dd = trait(find(out, 'DD-CORE'), 'centroid');
  near(dd.shares!.BOT, 40, 1e-6);
  near(dd.shares!.TOP, 20, 1e-6);
  assert.equal(dd.confidence, '低');
});

test('AC11: オブジェクトの優先度は F-009 のチームの指標「オブジェクト」を (点数 − 5) ÷ 5 に写し、データなしならデータなし', () => {
  const ind = (team: string, tier: string, score: number | null): TierTeamIndicators => ({
    team, tier, indicators: [{ key: 'objectives', label: 'オブジェクト', score, confidence: score === null ? null : '中', reason: '', players: [], evidence: [] }],
  });
  const out = computeStyle({ ...base(), teamIndicators: [ind('CC', 'CORE', 7.5), ind('DD', 'CORE', null)] });
  near(trait(find(out, 'CC-CORE'), 'objective').value, 0.5);
  assert.equal(trait(find(out, 'CC-CORE'), 'objective').confidence, '中');
  assert.equal(trait(find(out, 'DD-CORE'), 'objective').value, null);
  assert.equal(trait(find(out, 'IT-CORE'), 'objective').value, null);
});

test('AC12: LTK3 を使う特性の確度は 継続4人以上かつ20試合以上で高、3人以上かつ10試合以上で中、継続2人未満はデータなし', () => {
  const out = computeStyle(base());
  assert.equal(trait(find(out, 'CC-CORE'), 'tempo').confidence, '高');
  assert.equal(trait(find(out, 'IT-CORE'), 'tempo').confidence, '中');
  assert.equal(trait(find(out, 'DD-CORE'), 'tempo').value, null);
  assert.equal(trait(find(out, 'DD-CORE'), 'laneVsGroup').value, null);
  assert.deepEqual(find(out, 'CC-CORE').continuing.length, 4);
});

/** TOP は崩れにくい(資源が少ない試合でも差が変わらない)、MID は資源が少ないと崩れる */
function weakInput(lowGames: number): StyleInput {
  const b = base();
  const top = ROSTER.find((p) => p.team === 'LR' && p.tier === 'CORE' && p.role === 'TOP')!.id;
  const mid = ROSTER.find((p) => p.team === 'LR' && p.tier === 'CORE' && p.role === 'MID')!.id;
  const games = (pos: string, collapse: boolean) => [
    ...Array.from({ length: lowGames }, () => goldGame(pos, 0.12, collapse ? -800 : 200)),
    ...Array.from({ length: lowGames * 2 }, () => goldGame(pos, 0.3, collapse ? 600 : 200)),
  ];
  b.inputs = b.inputs.map((p) => (p.playerId === top ? { ...p, games: games('TOP', false) } : p.playerId === mid ? { ...p, games: games('MIDDLE', true) } : p));
  return b;
}

test('AC12b: ウィークサイドは TOP・ADC・MID のうち 安定感 × 0.6 + 崩れにくさ × 0.4 が最も高い選手のレーンで、根拠を付ける', () => {
  const ws = find(computeStyle(weakInput(6)), 'LR-CORE').weakSide;
  assert.equal(ws.lane, 'TOP');
  const top = ws.candidates.find((c) => c.role === 'TOP')!;
  const mid = ws.candidates.find((c) => c.role === 'MID')!;
  near(top.resilience, 10);
  assert.ok(mid.resilience! < 10);
  near(top.score, 5 * 0.6 + 10 * 0.4);
  assert.equal(top.lowResourceGames, 6);
  assert.equal(top.estimated, false);
  assert.deepEqual(ws.candidates.map((c) => c.role).sort(), ['ADC', 'MID', 'TOP']);
});

test('AC12c: 資源が少ない試合が6試合未満なら、崩れにくさを使わず安定感だけで計算し、確度 低・推定', () => {
  const ws = find(computeStyle(weakInput(5)), 'LR-CORE').weakSide;
  const top = ws.candidates.find((c) => c.role === 'TOP')!;
  assert.equal(top.resilience, null);
  assert.equal(top.estimated, true);
  assert.equal(top.confidence, '低');
  near(top.score, 5);
  const adc = ws.candidates.find((c) => c.role === 'ADC')!;
  assert.equal(adc.lowResourceGames, 0);
  assert.equal(adc.estimated, true);
});

test('AC13: Finale の記録が3試合以上ある階級チームは LTK3 ではなく Finale の記録を使い、無い間は LTK3(Finale 0 試合)', () => {
  const b = base();
  const fin = ltk3({ 'DD-CORE': { ka14: 0.6, tgd: 2000, games: 3 } });
  const finale = { 'DD-CORE': { teams: fin.teams.filter((t) => t.team === 'DD' && t.tier === 'CORE'), roles: fin.roles.filter((r) => r.team === 'DD' && r.tier === 'CORE') } };
  const out = computeStyle({ ...b, finale });
  const dd = trait(find(out, 'DD-CORE'), 'tempo');
  assert.equal(dd.source, 'Finale');
  assert.ok(dd.value! > 0);
  const cc = trait(find(out, 'CC-CORE'), 'tempo');
  assert.equal(cc.source, 'LTK3');
  assert.match(cc.reason, /Finale の記録 0 試合/);
});

test('作業上の選択: 本番とスクリムの集計は、スクリムを 0.5 の重みで合わせる', () => {
  const b = base();
  const scrim: Ltk3Row = { team: 'IT', tier: 'CORE', kind: 'スクリム', games: 24, metrics: metrics({ ...BASE, tgd: 900 }, null, null, 60) };
  const out = computeStyle({ ...b, ltk3: ltk3({ 'CC-CORE': { ka14: 0.4, tgd: 1500, lane: 900, kp: 0.3, games: 25 }, 'IT-CORE': { games: 12 } }, [scrim]) });
  const it = trait(find(out, 'IT-CORE'), 'tempo');
  assert.ok(it.value! > 0);
  assert.match(it.reason, /スクリム/);
  assert.equal(it.games, 12 + 24);
});
