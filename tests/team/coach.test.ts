// F-010 Task-3: 受入基準 5・5b・5c・5d・5e(コーチの枠とコーチの評価軸、戦力 S へのコーチの項)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROSTER } from '../../src/data/roster.ts';
import { POSITION, type PlayerRating, type PlayerRatingInput } from '../../src/rating/build.ts';
import type { TournamentRecord } from '../../src/rating/evidence.ts';
import { computeStrength } from '../../src/team/strength.ts';
import {
  rateCoach, computeCoaches, readCoachSnapshot, COACH_AXES, type CoachEntry, type CoachSnapshot,
} from '../../src/team/coach.ts';
import { loadSnapshotFile } from '../../src/collect/snapshots.ts';

const NOW = Date.parse('2026-10-09T00:00:00Z');
const KEYS = ['ground', 'laning', 'teamfight', 'synergy', 'stability', 'pool', 'shotcalling', 'tournament'];
const near = (a: number | null | undefined, b: number, eps = 1e-9) => assert.ok(typeof a === 'number' && Math.abs(a - b) < eps, `${a} != ${b}`);

function rating(id: string, axes: Partial<Record<string, number>> = {}): PlayerRating {
  const p = ROSTER.find((r) => r.id === id)!;
  return {
    playerId: id, name: p.name, tier: p.tier, position: POSITION[p.role],
    form: { coefficient: 1, label: '普通', insufficient: false, games: 10, wins: 5, score: 0, components: { winRate: 0.5, winRateTerm: 0, lpDelta: null, lpTerm: 0, practiceTerm: 0 }, reason: '' },
    axes: KEYS.map((key) => ({ key, label: key, base: axes[key] ?? 5, display: axes[key] ?? 5, confidence: '高', estimated: false, marks: [], reason: '' })),
  };
}
const NO_RECORD: TournamentRecord = { ltk: [], coach: [], pro: [], other: [] };
function input(id: string): PlayerRatingInput {
  const p = ROSTER.find((r) => r.id === id)!;
  return { playerId: id, name: p.name, tier: p.tier, position: POSITION[p.role], rank: null, games: [], league: [], shotcalling: [], tournament: NO_RECORD };
}
const ev = (direction: '+' | '-', strength: '強' | '中' | '弱') => ({ summary: 'テストの根拠', source: 'https://example.com/e', direction, strength, collectedBy: 'ai' as const });
const season = (s: string) => ({ season: s, team: 'XX', source: 'https://example.com/s' });
const entry = (o: Partial<CoachEntry> = {}): CoachEntry => ({ name: 'テスト', tierTeam: 'DD-CORE', seasons: [], rankGains: [], verbal: [], tactics: [], fit: [], ...o });
const axis = (r: ReturnType<typeof rateCoach>, key: string) => r.axes.find((a) => a.key === key)!;

test('AC5b: コーチの評価軸は 指導の実績・言語化力・戦術とドラフトの設計・選手時代の知見・チームとの相性 の5つ', () => {
  assert.deepEqual(COACH_AXES.map((a) => a.label), ['指導の実績', '言語化力', '戦術とドラフトの設計', '選手時代の知見', 'チームとの相性']);
});

test('AC5b: 指導の実績 = 4.0 + コーチのシーズン数 × 1.0(上限 3.0)+ 順位の伸び1つにつき 0.5(−1.5〜+1.5)', () => {
  near(axis(rateCoach('X', entry({ seasons: [season('S1'), season('S2')] }), NO_RECORD, 5), 'record').score, 6.0);
  near(axis(rateCoach('X', entry({ seasons: ['S1', 'S2', 'S3', 'S4', 'S5'].map(season) }), NO_RECORD, 5), 'record').score, 7.0);
  const gains = [{ season: 'S2', gain: 4, source: 'https://example.com/g' }];
  near(axis(rateCoach('X', entry({ seasons: [season('S1')], rankGains: gains }), NO_RECORD, 5), 'record').score, 4 + 1 + 1.5);
  const loss = [{ season: 'S2', gain: -1, source: 'https://example.com/g' }];
  near(axis(rateCoach('X', entry({ seasons: [season('S1')], rankGains: loss }), NO_RECORD, 5), 'record').score, 4 + 1 - 0.5);
});

test('AC5b: 言語化力・戦術・相性 = 5.0 + 肯定の強さ − 否定の強さ(強 1.5・中 1.0・弱 0.5)を 0〜10 に切り詰める', () => {
  const r = rateCoach('X', entry({ verbal: [ev('+', '強'), ev('+', '中'), ev('-', '弱')], tactics: [ev('-', '強'), ev('-', '強')], fit: Array.from({ length: 5 }, () => ev('+', '強')) }), NO_RECORD, 5);
  near(axis(r, 'verbal').score, 5 + 1.5 + 1 - 0.5);
  near(axis(r, 'tactics').score, 5 - 3);
  near(axis(r, 'fit').score, 10);
});

test('AC5b: 選手時代の知見 = プロの経歴があれば 6.0 + LJL の年数 × 1.0 + LJL CS の年数 × 0.5、無ければ大会経験の軸の値', () => {
  const pro: TournamentRecord = { ...NO_RECORD, pro: [{ league: 'LJL', team: 'A', years: 2, source: 's' }, { league: 'LJL CS', team: 'B', years: 1, source: 's' }] };
  near(axis(rateCoach('X', entry(), pro, 5), 'knowledge').score, 6 + 2 + 0.5);
  const big: TournamentRecord = { ...NO_RECORD, pro: [{ league: 'LJL', team: 'A', years: 8, source: 's' }] };
  near(axis(rateCoach('X', entry(), big, 5), 'knowledge').score, 10);
  near(axis(rateCoach('X', entry(), NO_RECORD, 6.5), 'knowledge').score, 6.5);
});

test('AC5c: 根拠の無い軸は事前値で確度「低」と「推定」、1〜2 件は「中」、3 件以上は「高」', () => {
  const r = rateCoach('X', entry({ verbal: [ev('+', '中')], tactics: [ev('+', '中'), ev('+', '中'), ev('-', '弱')] }), NO_RECORD, 6);
  const rec = axis(r, 'record');
  near(rec.score, 4.0);
  assert.equal(rec.confidence, '低');
  assert.equal(rec.estimated, true);
  near(axis(r, 'fit').score, 5.0);
  assert.equal(axis(r, 'fit').confidence, '低');
  assert.equal(axis(r, 'knowledge').estimated, true);
  near(axis(r, 'knowledge').score, 6);
  assert.equal(axis(r, 'verbal').confidence, '中');
  assert.equal(axis(r, 'verbal').estimated, false);
  assert.equal(axis(r, 'tactics').confidence, '高');
});

test('AC5b: コーチの総合 C は5軸の平均', () => {
  const r = rateCoach('X', entry({ seasons: [season('S1')], verbal: [ev('+', '強')] }), NO_RECORD, 7);
  near(r.C, (5 + 6.5 + 5 + 7 + 5) / 5);
});

/** 8人のコーチの記録(DD-CORE だけ強い根拠) */
function snapshot(): CoachSnapshot {
  const coaches: Record<string, CoachEntry> = {};
  const map: Record<string, string> = {
    'DD-CORE': 'DD-MASTERS-TOP', 'DD-NEXT': 'DD-MASTERS-MID', 'CC-CORE': 'CC-MASTERS-MID', 'CC-NEXT': 'CC-MASTERS-ADC',
    'IT-CORE': 'IT-MASTERS-MID', 'IT-NEXT': 'IT-MASTERS-SUP', 'LR-CORE': 'LR-MASTERS-MID', 'LR-NEXT': 'LR-MASTERS-JG',
  };
  for (const [tt, id] of Object.entries(map)) coaches[id] = entry({ tierTeam: tt });
  coaches['DD-MASTERS-TOP'] = entry({ tierTeam: 'DD-CORE', seasons: [season('S1'), season('S2'), season('S3')], verbal: [ev('+', '強')], tactics: [ev('+', '強')], fit: [ev('+', '強')] });
  return { kind: 'evidence-coach', retrievedAt: '2026-10-09', description: 't', coaches };
}

test('AC5: 指導の軸の素点はコーチの総合 C(選手としての評価は使わない)。NEXT・CORE は4チームの相対評価、MASTERS は対象外', () => {
  const ratings = ROSTER.map((r) => rating(r.id, r.id === 'DD-MASTERS-TOP' ? { ground: 10, shotcalling: 10 } : {}));
  const records = Object.fromEntries(ROSTER.map((r) => [r.id, NO_RECORD]));
  const c = computeCoaches(snapshot(), records, ratings);
  const dd = c.teams['DD-CORE'];
  near(dd.coaching.raw, c.coaches['DD-MASTERS-TOP'].C);
  assert.ok(dd.coaching.display! > 5);
  assert.ok(c.teams['CC-CORE'].coaching.display! < 5);
  assert.equal(c.teams['DD-MASTERS'].coaching.display, null);
  assert.equal(c.teams['DD-MASTERS'].coaching.label, '対象外');
  assert.equal(c.teams['DD-MASTERS'].coach, null);
  // 選手としての評価(地力・コール力 10)を使わない: C は根拠と大会経験(5.0)だけで決まる
  near(c.coaches['DD-MASTERS-TOP'].C, (7 + 6.5 + 6.5 + 5 + 6.5) / 5);
});

test('AC5d: コーチの総合 C を NEXT・CORE の戦力 S に重み 0.15 で加え、選手の部分を 0.85 に縮める', () => {
  const ratings = ROSTER.map((r) => rating(r.id));
  const records = Object.fromEntries(ROSTER.map((r) => [r.id, NO_RECORD]));
  const c = computeCoaches(snapshot(), records, ratings);
  const s = computeStrength({ ratings, inputs: ROSTER.map((r) => input(r.id)), now: NOW, coachC: c.coachC });
  const t = s.find((x) => x.team === 'DD' && x.tier === 'CORE')!;
  near(t.S, 0.85 * 5 + 0.15 * c.coaches['DD-MASTERS-TOP'].C);
  assert.equal(t.coachEstimated, false);
  assert.equal(c.coachC['DD-MASTERS'], undefined);
});

test('AC5e: 階級チームのコーチの枠は、コーチの名前・5軸の点数・各軸の根拠(出典)・確度を持つ', () => {
  const ratings = ROSTER.map((r) => rating(r.id));
  const records = Object.fromEntries(ROSTER.map((r) => [r.id, NO_RECORD]));
  const slot = computeCoaches(snapshot(), records, ratings).teams['DD-CORE'].coach!;
  assert.equal(slot.coachId, 'DD-MASTERS-TOP');
  assert.equal(slot.axes.length, 5);
  for (const a of slot.axes) {
    assert.ok(a.score >= 0 && a.score <= 10);
    assert.ok(['高', '中', '低'].includes(a.confidence));
  }
  assert.deepEqual(slot.axes.find((a) => a.key === 'verbal')!.evidence.map((e) => e.source), ['https://example.com/e']);
});

test('記録の検査: 出典の無い根拠、向き・強さの欠け、名簿に無いコーチを拒否する', () => {
  const bad = { kind: 'evidence-coach', retrievedAt: '2026-10-09', description: 't', coaches: {
    'DD-MASTERS-TOP': { ...entry(), verbal: [{ summary: 'x', source: '', direction: '+', strength: '強', collectedBy: 'ai' }], tactics: [{ summary: 'x', source: 'u', direction: '?', strength: '強', collectedBy: 'ai' }] },
    'NO-SUCH-ID': entry(),
  } };
  const r = readCoachSnapshot(bad);
  assert.ok(r.errors.some((e) => /DD-MASTERS-TOP/.test(e) && /verbal/.test(e)));
  assert.ok(r.errors.some((e) => /tactics/.test(e)));
  assert.ok(r.errors.some((e) => /NO-SUCH-ID/.test(e)));
  assert.equal(r.snapshot!.coaches['DD-MASTERS-TOP'].verbal.length, 0);
  assert.ok(readCoachSnapshot({ kind: 'other' }).errors.length > 0);
});

test('初版の記録: data/snapshots/evidence-coach.json は8人のコーチをすべて持ち、検査のエラーが無い', () => {
  const r = readCoachSnapshot(JSON.parse(readFileSync('data/snapshots/evidence-coach.json', 'utf8')));
  assert.deepEqual(r.errors, []);
  assert.equal(Object.keys(r.snapshot!.coaches).length, 8);
  for (const e of Object.values(r.snapshot!.coaches)) {
    for (const k of ['verbal', 'tactics', 'fit'] as const) for (const x of e[k]) assert.match(x.source, /^https?:\/\//);
  }
});

test('集計の読み込み: kind が evidence-coach の記録は選手の指標のエラーにしない', () => {
  const d = mkdtempSync(join(tmpdir(), 'coach-kind-'));
  const p = join(d, 'evidence-coach.json');
  writeFileSync(p, JSON.stringify(snapshot()));
  assert.deepEqual(loadSnapshotFile(p).errors, []);
});
