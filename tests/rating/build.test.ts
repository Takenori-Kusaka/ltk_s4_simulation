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
  assert.deepEqual(top.exPro, { level: 'LJL-starter', source: 'https://example.test/wiki/top' });
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
