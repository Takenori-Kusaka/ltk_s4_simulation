// F-009 基準12 の追記: プロの年数は経歴の記録(career.json の lol.years)と出場記録(tournament.json の pro)の大きい方
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ev from '../../src/rating/evidence.ts';
import type { ProCareer, TournamentConfig } from '../../src/rating/evidence.ts';

const tc: TournamentConfig = {
  seasonScores: [2.0, 4.0, 5.5, 6.5],
  gamesFull: 30,
  gamesMax: 1.0,
  coachPerSeason: 0.5,
  coachMax: 1.0,
  proPerYear: { LJL: 0.5, 'LJL CS': 0.25, 'その他のプロ': 0.25 },
  proMax: 2.0,
  otherPer: 0.5,
  otherMax: 1.0,
};
const pro = (league: string, team: string, years: number): ProCareer => ({ league, team, years, source: 'docs/research/players-dd-cc.md', url: 'https://example.invalid/p' });
/** 経歴の記録の lol.years(水準ごとの年数。無い水準は 0) */
const years = (o: Record<string, number>) => ({ 'overseas-major': 0, 'LJL-starter': 0, 'LJL-sub': 0, 'overseas-minor': 0, 'LJL CS-starter': 0, 'LJL CS-sub': 0, academy: 0, ...o });

test('基準12: 経歴の記録の年数が出場記録より多い水準は、差分を「経歴の記録(career.json)」の項として足す(出典は lol.statusSource)', () => {
  const t = [pro('LJL', 'V3 Esports', 1), pro('LJL', 'QT DIG∞', 1)];
  const merged = ev.mergeProYears(t, { years: years({ 'LJL-starter': 5 }), statusSource: 'https://lol.fandom.com/wiki/Washidai' });
  assert.equal(merged.length, 3);
  assert.deepEqual(merged.slice(0, 2), t, '元の項は変えない');
  assert.equal(merged[2].league, 'LJL');
  assert.equal(merged[2].team, '経歴の記録(career.json)');
  assert.equal(merged[2].years, 3);
  assert.equal(merged[2].source, 'https://lol.fandom.com/wiki/Washidai');
});

test('基準12: 出場記録の年数が経歴の記録以上の水準は足さない(小さい方へ減らさない)', () => {
  const cs = [pro('LJL CS', 'x', 1)];
  assert.deepEqual(ev.mergeProYears(cs, { years: years({}), statusSource: null }), cs, '経歴の記録 0 年 vs 出場記録 1 年');
  const dfm = [pro('LJL', 'DetonatioN FocusMe', 10)];
  assert.deepEqual(ev.mergeProYears(dfm, { years: years({ 'LJL-starter': 10 }), statusSource: 's' }), dfm, '同じ年数');
  assert.deepEqual(ev.mergeProYears(dfm, { years: years({ 'LJL-starter': 8 }), statusSource: 's' }), dfm, '出場記録の方が多い');
});

test('基準12: 経歴の記録が無ければ出場記録のまま', () => {
  const t = [pro('LJL', 'USG', 2)];
  assert.deepEqual(ev.mergeProYears(t, null), t);
  assert.deepEqual(ev.mergeProYears(t, undefined), t);
  assert.deepEqual(ev.mergeProYears([], null), []);
});

test('基準12: 水準は LJL-starter + LJL-sub → LJL、LJL CS-starter + LJL CS-sub → LJL CS、overseas-major + overseas-minor + academy → その他のプロ にまとめて比べる', () => {
  const lol = { years: years({ 'LJL-starter': 2, 'LJL-sub': 1, 'LJL CS-starter': 1, 'LJL CS-sub': 1, 'overseas-major': 1, 'overseas-minor': 1, academy: 1 }), statusSource: null };
  const merged = ev.mergeProYears([pro('LJL', 'Sengoku Gaming', 1)], lol);
  assert.deepEqual(merged.slice(1).map((x) => [x.league, x.years]), [['LJL', 2], ['LJL CS', 2], ['その他のプロ', 3]]);
  assert.ok(merged.slice(1).every((x) => x.source === 'docs/research/grounds/normalized/career.json'), '出典(statusSource)が無ければ経歴の記録のファイル');
  assert.deepEqual(ev.mergeProYears([], { years: years({ academy: 2 }), statusSource: null }).map((x) => [x.league, x.years]), [['その他のプロ', 2]]);
});

test('基準12: 足した項目は大会経験の理由の文と根拠の一覧に出て、点数に効く(LJL 1 年 = +0.5、上限 +2.0)', () => {
  const base = { ltk: [], coach: [], pro: [pro('LJL', '7th Heaven', 1)], other: [] };
  const before = ev.tournamentAxis(base, tc);
  const merged = { ...base, pro: ev.mergeProYears(base.pro, { years: years({ 'LJL-starter': 5 }), statusSource: 'https://lol.fandom.com/wiki/ThintoN' }) };
  const after = ev.tournamentAxis(merged, tc);
  assert.equal(before.score, 2.5);
  assert.equal(after.score, 4.0);
  assert.ok(after.reason.includes('LJL 経歴の記録(career.json) 4 年'), after.reason);
  assert.ok(after.evidence.some((e) => e.text.includes('経歴の記録(career.json) 4 年') && e.source === 'https://lol.fandom.com/wiki/ThintoN'));
});
