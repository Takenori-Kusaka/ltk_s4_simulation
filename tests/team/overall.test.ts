// F-010 Task-5: 受入基準 14・14b・15・16・17・18・18b(全階級チームの総合の軸)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeOverall, OVERALL_AXES, type OverallInput } from '../../src/team/overall.ts';
import type { TierTeamStrength, StrengthKey } from '../../src/team/strength.ts';
import type { TeamCoaching, CoachRating } from '../../src/team/coach.ts';
import type { TierTeamStyle, WeakSideCandidate } from '../../src/team/style.ts';
import type { PlayerRatingInput } from '../../src/rating/build.ts';
import { ROSTER } from '../../src/data/roster.ts';

const TEAMS = ['DD', 'CC', 'IT', 'LR'];
const TIERS = ['NEXT', 'CORE', 'MASTERS'];
const KEYS: StrengthKey[] = ['power', 'synergy', 'shotcalling', 'continuity', 'pool', 'fearless'];

/** S は階級ごとに与え、表示の点数は軸ごとに与える */
function strength(S: Record<string, number>, display: Record<string, Partial<Record<StrengthKey, number | null>>> = {}, overlap: Record<string, number> = {}): TierTeamStrength[] {
  return TEAMS.flatMap((team) =>
    TIERS.map((tier) => {
      const k = `${team}-${tier}`;
      return {
        team, tier, S: S[k] ?? 5, coachC: tier === 'MASTERS' ? null : 6, coachEstimated: false, coachId: null,
        overlap: tier === 'MASTERS' ? 0 : (overlap[team] ?? 0),
        axes: KEYS.map((key) => {
          const d = display[k]?.[key];
          return { key, label: key, raw: 5, display: d === undefined ? 5 : d, confidence: '高' as const, reason: '' };
        }),
      };
    }),
  );
}
const coachRating = (C: number): CoachRating => ({ coachId: 'x', name: 'x', tierTeam: 'x', axes: [], C });
function coaching(C: Record<string, number> = {}): Record<string, TeamCoaching> {
  const out: Record<string, TeamCoaching> = {};
  for (const team of TEAMS) for (const tier of TIERS) {
    const k = `${team}-${tier}`;
    out[k] = tier === 'MASTERS'
      ? { team, tier, coach: null, coaching: { raw: null, display: null, label: '対象外', confidence: null } }
      : { team, tier, coach: coachRating(C[k] ?? 6), coaching: { raw: C[k] ?? 6, display: 5, label: '指導', confidence: '中' } };
  }
  return out;
}
const cand = (score: number): WeakSideCandidate => ({ playerId: 'p', role: 'TOP', stability: 5, resilience: 5, lowResourceGames: 10, score, confidence: '高', estimated: false, reason: '' });
function style(scores: Record<string, number[]> = {}): TierTeamStyle[] {
  return TEAMS.flatMap((team) => TIERS.map((tier) => {
    const s = scores[`${team}-${tier}`] ?? [6, 5];
    return { team, tier, continuing: [], traits: [], weakSide: { lane: 'TOP', playerId: 'p', confidence: '高' as const, estimated: false, candidates: s.map(cand) } };
  }));
}
const noTournament = { ltk: [], coach: [], pro: [], other: [] };
function inputs(ltk: Record<string, { season: string; team: string; tier: string }[]> = {}): PlayerRatingInput[] {
  return ROSTER.map((r) => ({
    playerId: r.id, name: r.name, tier: r.tier, position: 'TOP', rank: null, games: [], league: [], shotcalling: [],
    tournament: { ...noTournament, ltk: (ltk[r.id] ?? []).map((x) => ({ ...x, role: 'TOP', wins: null, losses: null, source: 's' })) },
  }));
}
const base = (over: Partial<OverallInput> = {}): OverallInput => ({
  strength: strength({}), coaching: coaching(), style: style(), inputs: inputs(), ...over,
});
const axis = (r: ReturnType<typeof computeOverall>, team: string, key: string) => r.teams.find((t) => t.team === team)!.axes.find((a) => a.key === key)!;

test('総合の軸は7本(Regular Stage の得点力・MASTERS CUP の力・エースの階級・階級の均衡・コーチングの活用・一体感・チーム設計)を4チームに出す', () => {
  const r = computeOverall(base());
  assert.deepEqual(OVERALL_AXES.map((a) => a.label), ['Regular Stage の得点力', 'MASTERS CUP の力', 'エースの階級', '階級の均衡', 'コーチングの活用', '一体感', 'チーム設計']);
  assert.deepEqual(r.teams.map((t) => t.team), TEAMS);
  for (const t of r.teams) assert.equal(t.axes.length, 7);
});

test('AC14・14b: F-005 の勝率表が無い間、Regular Stage の得点力と MASTERS CUP の力はデータなし', () => {
  const r = computeOverall(base());
  for (const key of ['rsPoints', 'mastersCup']) {
    const a = axis(r, 'DD', key);
    assert.equal(a.value, null);
    assert.match(a.reason, /F-005/);
  }
});

test('AC15: エースの階級は (S − 階級の平均) × β が最大の階級。β は 6 組の差の標準偏差 × β = 0.35', () => {
  // NEXT: DD だけが 0.3 高い。CORE: DD が 0.6 高く LR が 0.6 低い(β で割ると CORE の方が大きい)。MASTERS は全員 5
  const S = { 'DD-NEXT': 5.3, 'CC-NEXT': 5, 'IT-NEXT': 5, 'LR-NEXT': 5, 'DD-CORE': 5.6, 'CC-CORE': 5, 'IT-CORE': 5, 'LR-CORE': 4.4 };
  const r = computeOverall(base({ strength: strength(S) }));
  const a = axis(r, 'DD', 'ace');
  assert.equal(a.label, 'エースの階級');
  assert.equal(a.tier, 'CORE');
  // CORE の 6 組の差: DD-CC 0.6, DD-IT 0.6, DD-LR 1.2, CC-IT 0, CC-LR 0.6, IT-LR 0.6 → 標準偏差
  const diffs = [0.6, 0.6, 1.2, 0, 0.6, 0.6];
  const m = diffs.reduce((x, y) => x + y, 0) / 6;
  const sd = Math.sqrt(diffs.reduce((s, d) => s + (d - m) ** 2, 0) / 6);
  const beta = 0.35 / sd;
  assert.ok(Math.abs(r.beta.CORE - beta) < 1e-9);
  assert.ok(Math.abs(a.value! - (5.6 - 5) * beta) < 1e-9);
});

test('AC15: 4チームの S が同じ階級は β を持たず、エースの候補にならない', () => {
  const r = computeOverall(base());
  assert.equal(r.beta.MASTERS, null);
  assert.equal(axis(r, 'CC', 'ace').value, null);
});

test('AC16: 階級の均衡 = 10 − 3階級の戦力の表示の点数の標準偏差 × 2(0〜10)', () => {
  const r = computeOverall(base({ strength: strength({}, { 'DD-NEXT': { power: 3 }, 'DD-CORE': { power: 5 }, 'DD-MASTERS': { power: 7 } }) }));
  const sd = Math.sqrt(((3 - 5) ** 2 + 0 + (7 - 5) ** 2) / 3);
  assert.ok(Math.abs(axis(r, 'DD', 'balance').value! - (10 - sd * 2)) < 1e-9);
  assert.equal(axis(r, 'CC', 'balance').value, 10);
});

test('AC17: コーチングの活用 = CORE と NEXT の (C ÷ 10) × (10 − 強さの軸の最も低い表示の点数) の平均', () => {
  const r = computeOverall(base({
    coaching: coaching({ 'DD-CORE': 8, 'DD-NEXT': 4 }),
    strength: strength({}, { 'DD-CORE': { pool: 2, fearless: null }, 'DD-NEXT': { synergy: 3 } }),
  }));
  const want = ((8 / 10) * (10 - 2) + (4 / 10) * (10 - 3)) / 2;
  assert.ok(Math.abs(axis(r, 'DD', 'coachingUse').value! - want) < 1e-9);
});

test('AC18: 一体感 = 共闘の項(異なる階級の同じシーズン・同じチームの組 × 0.5、上限 4)+ リーダーの項 + 重なりの項', () => {
  const s1 = { season: 'S1', team: 'X', tier: 'CORE' };
  // DD の NEXT TOP と CORE TOP と MASTERS TOP が S1 で同じチーム → 異なる階級の組 3 → 1.5
  const ltk = { 'DD-NEXT-TOP': [s1], 'DD-CORE-TOP': [s1], 'DD-MASTERS-TOP': [s1], 'DD-CORE-MID': [s1] };
  const r = computeOverall(base({
    inputs: inputs(ltk),
    strength: strength({}, {}, { DD: 5 }),
    leaderEvidence: { DD: [{ text: 'リーダー', source: 'https://example.com' }, { text: 'リーダー2', source: 'https://example.com/2' }] },
  }));
  // 異なる階級の組: NEXT-TOP×CORE-TOP, NEXT-TOP×MASTERS-TOP, CORE-TOP×MASTERS-TOP, NEXT-TOP×CORE-MID, MASTERS-TOP×CORE-MID = 5 → 2.5
  const co = 5 * 0.5;
  const leader = 2;
  const overlapTerm = 3 - 5 / 5;
  assert.ok(Math.abs(axis(r, 'DD', 'cohesion').value! - (co + leader + overlapTerm)) < 1e-9);
  assert.match(axis(r, 'DD', 'cohesion').reason, /共闘/);
  // 重なりが無くリーダーの根拠が無いチームは 共闘の項 + 3.0
  assert.equal(axis(r, 'CC', 'cohesion').value, 3);
});

test('AC18: 共闘の項は上限 4.0、リーダーの項は上限 3.0', () => {
  const s1 = { season: 'S1', team: 'X', tier: 'CORE' };
  const ltk = Object.fromEntries(ROSTER.filter((p) => p.team === 'LR').map((p) => [p.id, [s1]]));
  const leaders = Array.from({ length: 5 }, (_, i) => ({ text: `l${i}`, source: `https://example.com/${i}` }));
  const r = computeOverall(base({ inputs: inputs(ltk), leaderEvidence: { LR: leaders } }));
  assert.equal(axis(r, 'LR', 'cohesion').value, 4 + 3 + 3);
});

test('AC18b: チーム設計 = 3階級のウィークサイドの確かさの平均 × 6 + コーチの根拠 1 件 1.0(上限 4.0)', () => {
  const r = computeOverall(base({
    style: style({ 'DD-NEXT': [7, 6], 'DD-CORE': [9, 5], 'DD-MASTERS': [6, 5.5] }),
    coachWeakSideEvidence: { DD: 2, CC: 9 },
  }));
  const certainty = (Math.min(1, 1 / 2) + 1 + 0.25) / 3;
  assert.ok(Math.abs(axis(r, 'DD', 'design').value! - (certainty * 6 + 2)) < 1e-9);
  const ccCertainty = (0.5 + 0.5 + 0.5) / 3;
  assert.ok(Math.abs(axis(r, 'CC', 'design').value! - (ccCertainty * 6 + 4)) < 1e-9);
});

test('AC18b: 候補が1人以下の階級は確かさの平均から除き、全階級に無ければデータなし', () => {
  const r = computeOverall(base({ style: style({ 'IT-NEXT': [6], 'IT-CORE': [], 'IT-MASTERS': [] }) }));
  assert.equal(axis(r, 'IT', 'design').value, null);
});

test('エースの階級を除く総合の軸の値は 0.0〜10.0 か null で、すべての軸が理由を持つ', () => {
  const r = computeOverall(base({ strength: strength({ 'DD-CORE': 9, 'LR-CORE': 1 }) }));
  for (const t of r.teams) for (const a of t.axes) {
    // エースの階級は (S − 平均) × β の値で、範囲を持たない(基準15)
    if (a.key !== 'ace') assert.ok(a.value === null || (a.value >= 0 && a.value <= 10), `${t.team} ${a.key} ${a.value}`);
    assert.ok(a.reason.length > 0);
  }
});
