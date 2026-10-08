// F-010 Task-1: 受入基準 21・21b(LTK3 の集計のスナップショット。集計値だけを出典つきで書き出す)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggregateLtk3, parseCsv, validateLtk3Snapshot, LTK3_SOURCE, type Ltk3Snapshot } from '../../src/team/ltk3.ts';
import { main } from '../../src/team/ltk3-cli.ts';

/** スプレッドシートの Data シートと同じ見出し(49 列) */
const HEADER = [
  'Day', 'Month', 'Game', 'DayN', '0.0', 'GameN', 'Team', 'W/L', 'Time', 'Ban', 'Streamer', 'Summoner', 'Role', 'Champion',
  'Kill', 'Death', 'Assist', 'KDA', 'KP', 'CS', 'CSM', 'Damage', 'Gold', 'DPM', 'DMG%', 'GPM', 'D/G', '対戦相手', 'チーム', '14.0',
  'Kill@14', 'Death@14', 'Assist@14', 'KDA@14', 'KP@14', 'CS@14', 'CSM@14', 'Gold@14', 'GPM@14', 'GD@14', 'TeamGD@14', 'C / N',
  'スクリム/本番', 'KDA@after14', 'Kill@a14', 'Death@a14', 'Assist@a14', 'K+A/M@14', 'K+A/M@after14',
];
const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];
interface P { gold: number; dmgPct: number; kp14: number; gd14: number; ka14: number; kaAfter: number; champion?: string }
/** 1試合 = 2チーム × 5人の行。teamGd はチーム A の 14 分のゴールド差 */
function gameRows(game: number, tier: string, kind: string, a: string, b: string, teamGd: number, pa: (r: number) => P, pb: (r: number) => P): string[][] {
  const row = (team: string, opp: string, side: string, r: number, p: P, tgd: number) => {
    const v: Record<string, string | number> = {
      Day: '2026-05-02 00:00:00', Game: game, GameN: 1, Team: side, 'W/L': tgd > 0 ? 'Win' : 'Lose', Streamer: `S${game}${team}${r}`,
      Summoner: `Sum${game}${r}`, Role: ROLES[r], Champion: p.champion ?? 'アーリ', Gold: p.gold, 'DMG%': p.dmgPct, 'KP@14': p.kp14,
      'GD@14': p.gd14, 'TeamGD@14': tgd, 'C / N': tier, 'スクリム/本番': kind, 'K+A/M@14': p.ka14, 'K+A/M@after14': p.kaAfter,
      対戦相手: opp, チーム: team,
    };
    return HEADER.map((h) => String(v[h] ?? 0));
  };
  return [
    ...ROLES.map((_, r) => row(a, b, 'Blue', r, pa(r), teamGd)),
    ...ROLES.map((_, r) => row(b, a, 'Red', r, pb(r), -teamGd)),
  ];
}
const flat = (o: Partial<P> = {}) => (r: number): P => ({ gold: 10000, dmgPct: 0.2, kp14: 0.5, gd14: 0, ka14: 0.2, kaAfter: 0.4, ...o, ...(r === 3 ? { gold: 14000 } : {}) });
const toCsv = (rows: string[][]) => '﻿' + [HEADER, ...rows].map((r) => r.join(',')).join('\r\n') + '\r\n';
const SAMPLE = () =>
  toCsv([
    ...gameRows(1, 'CORE', '本番', '🟥Camellia Crown CORE', '🟧Dahlia Diadem CORE', 1000, flat({ ka14: 0.3 }), flat({ ka14: 0.1 })),
    ...gameRows(2, 'CORE', '本番', '🟥Camellia Crown CORE', '🟦Iris Tiara CORE', -400, flat({ ka14: 0.5 }), flat()),
    ...gameRows(3, 'CORE', 'スクリム', '🟥Camellia Crown CORE', '🟩Laurel Regalia CORE', 200, flat(), flat()),
    ...gameRows(4, 'NEXT', 'スクリム', '🟥Camellia Crown NEXT', '⬜️リスナー', 300, flat(), flat()),
  ]);
const SOURCE = { ...LTK3_SOURCE, retrievedAt: '2026-10-09' };

test('CSV の読み込み: 先頭の BOM と CRLF を除き、引用符つきのカンマを1つの値として読む', () => {
  const rows = parseCsv('﻿a,b,c\r\n1,"x,y",3\r\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', 'x,y', '3']]);
});

test('AC21b: (チーム・階級)と(チーム・階級・ロール)ごとに、本番とスクリムを分けて試合数と集計値を出す', () => {
  const s = aggregateLtk3(SAMPLE(), SOURCE);
  const cc = s.teams.find((t) => t.team === 'CC' && t.tier === 'CORE' && t.kind === '本番')!;
  assert.equal(cc.games, 2);
  assert.ok(Math.abs(cc.metrics.kaPerMinTo14 - 0.4) < 1e-9);
  assert.ok(Math.abs(cc.metrics.kaPerMinAfter14 - 0.4) < 1e-9);
  assert.equal(cc.metrics.teamGoldDiff14, 300);
  assert.ok(Math.abs(cc.metrics.kp14 - 0.5) < 1e-9);
  assert.equal(s.teams.find((t) => t.team === 'CC' && t.tier === 'CORE' && t.kind === 'スクリム')!.games, 1);
  const adc = s.roles.find((r) => r.team === 'CC' && r.tier === 'CORE' && r.kind === '本番' && r.role === 'ADC')!;
  assert.equal(adc.games, 2);
  assert.ok(Math.abs(adc.metrics.goldShare! - 14000 / 54000) < 1e-9);
  assert.ok(Math.abs(adc.metrics.damageShare! - 0.2) < 1e-9);
  assert.equal(adc.metrics.laneGoldDiff14, 0);
});

test('AC21b: リスナーなど大会の4チーム以外の行と、片方のチームしか無い試合は集計に入れない', () => {
  const s = aggregateLtk3(SAMPLE(), SOURCE);
  assert.ok(s.teams.every((t) => ['DD', 'CC', 'IT', 'LR'].includes(t.team)));
  const next = s.teams.find((t) => t.team === 'CC' && t.tier === 'NEXT');
  assert.equal(next, undefined);
});

test('AC21・21b: 書き出しは出典(名前・URL・取得日)と集計値だけで、試合ごとの行・選手名・チャンピオンを含まない', () => {
  const s = aggregateLtk3(SAMPLE(), SOURCE);
  assert.equal(s.kind, 'ltk3-aggregate');
  assert.deepEqual(s.source, SOURCE);
  const text = JSON.stringify(s);
  for (const forbidden of ['Sum1', 'S1🟥', 'アーリ', 'Streamer', 'Summoner', 'Champion', '2026-05-02']) assert.ok(!text.includes(forbidden), forbidden);
  assert.deepEqual(validateLtk3Snapshot(s), []);
});

test('AC21: 試合ごとの行・出典の欠け・大会外のチームを含むスナップショットを拒否する', () => {
  const s = aggregateLtk3(SAMPLE(), SOURCE);
  const bad1 = { ...s, source: { name: 'x', url: '', retrievedAt: '2026-10-09' } } as Ltk3Snapshot;
  assert.ok(validateLtk3Snapshot(bad1).some((e) => /出典/.test(e)));
  const bad2 = { ...s, rows: [{ Summoner: 'a', Champion: 'b' }] };
  assert.ok(validateLtk3Snapshot(bad2).some((e) => /試合ごと|集計値以外/.test(e)));
  const bad3 = { ...s, teams: [{ ...s.teams[0], team: 'XX' }] };
  assert.ok(validateLtk3Snapshot(bad3).some((e) => /XX/.test(e)));
  const bad4 = { ...s, teams: [{ ...s.teams[0], player: 'someone' }] };
  assert.ok(validateLtk3Snapshot(bad4).some((e) => /player/.test(e)));
  assert.ok(validateLtk3Snapshot({ kind: 'other' }).length > 0);
});

test('AC21b: 取り込みの命令は CSV を読み、集計のスナップショットだけを書き、0 を返す', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f010-ltk3-'));
  const csv = join(dir, 'Data.csv');
  const out = join(dir, 'snapshots', 'ltk3-aggregate.json');
  writeFileSync(csv, SAMPLE());
  const lines: string[] = [];
  const code = main(['--csv', csv, '--out', out, '--retrieved', '2026-10-09'], (l) => lines.push(l));
  assert.equal(code, 0);
  const saved = JSON.parse(readFileSync(out, 'utf8')) as Ltk3Snapshot;
  assert.equal(saved.source.retrievedAt, '2026-10-09');
  assert.ok(saved.teams.length > 0);
  assert.deepEqual(validateLtk3Snapshot(saved), []);
});

test('AC21b: 引数が欠けた命令は書かずに 1 を返す', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f010-ltk3-bad-'));
  const out = join(dir, 'x.json');
  const lines: string[] = [];
  assert.equal(main(['--out', out], (l) => lines.push(l)), 1);
  assert.ok(!existsSync(out));
  assert.ok(lines.some((l) => /--csv/.test(l)));
});
