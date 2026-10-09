// F-008 Task-2: 受入基準 1〜9・22(複数の系列を重ねるレーダーと比較の画面)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROSTER } from '../../src/data/roster.ts';
import { buildRatings, POSITION, type PlayerRatingInput } from '../../src/rating/build.ts';
import type { GameRecord } from '../../src/rating/types.ts';
import type { RatingsFile } from '../../src/app/rating/view.ts';
import { compareView, SERIES_COLORS } from '../../src/app/compare/view.ts';
import {
  overlayGeometry, axisLabel, markerPath, legendItems, tableRows, SERIES_FILL_OPACITY, candidateTargets,
} from '../../src/app/compare/render.ts';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-09T00:00:00Z');
let seq = 0;
const game = (pos: string, gpm: number, ageDays: number): GameRecord => ({
  matchId: `M${++seq}`,
  endTime: NOW - ageDays * DAY,
  durationMin: 30,
  queueId: 420,
  position: pos,
  me: { championId: 1, win: 1, deaths: 4, totalDamageDealtToChampions: 20000, goldPerMinute: gpm },
  opp: { championId: 2, win: 0, deaths: 4, totalDamageDealtToChampions: 20000, goldPerMinute: 400 },
});
const RANK: Record<string, string> = { DD: 'CHALLENGER', CC: 'DIAMOND', IT: 'PLATINUM', LR: 'GOLD' };
/** 60 選手。DD-NEXT-TOP は試合が少なく確度「低」の軸を持つ。LR-NEXT-SUP は評価なし */
const FILE: RatingsFile = (() => {
  const xs: PlayerRatingInput[] = ROSTER.map((r) => ({
    playerId: r.id,
    name: r.name,
    tier: r.tier,
    position: POSITION[r.role],
    rank: { tier: RANK[r.team], division: 'I', lp: 50 },
    games: Array.from({ length: r.id === 'DD-NEXT-TOP' ? 2 : 20 }, (_, i) => game(POSITION[r.role], 400 + i * 3, 2 + i)),
    league: [],
    shotcalling: [],
    tournament: { ltk: [], coach: [], pro: [], other: [] },
  }));
  const players = buildRatings({ players: xs, matches: [] }, NOW).filter((p) => p.playerId !== 'LR-NEXT-SUP');
  return { kind: 'ratings', computedAt: new Date(NOW).toISOString(), configVersion: 'test', checks: [], players };
})();
const view = (ids: string[]) => {
  const v = compareView(ids, FILE);
  assert.ok(v.ok, v.ok ? '' : v.message);
  return v;
};

test('AC1: 2〜4つの対象を、全軸(8軸)のレーダーとして1つの図に重ねる', () => {
  const g = overlayGeometry(view(['DD-CORE-MID', 'CC-CORE-MID', 'IT-CORE-MID', 'LR-CORE-MID']).series);
  assert.equal(g.series.length, 4);
  assert.equal(g.outline.length, 8);
  for (const s of g.series) assert.equal(s.points.length, 8);
  assert.ok(g.series.every((s) => s.polygon.split(' ').length === 8));
});

test('AC2: 確度「低」の頂点に触れる辺は点線、データなしの軸はその系列の頂点を飛ばして結ぶ', () => {
  const g = overlayGeometry(view(['DD-NEXT-TOP', 'CC-NEXT-TOP']).series);
  const low = g.series[0];
  const laning = 1;
  assert.equal(low.lines[laning], 'dotted');
  assert.ok(low.edges.some((e) => e.dotted));
  // 点線は確度「低」の頂点に触れる辺だけ(試験用の記録ではコール力などの根拠の軸も「低」になる)
  const s1 = g.series[1];
  const at = (q: { x: number; y: number }) => s1.points.findIndex((x) => x !== null && x.x === q.x && x.y === q.y);
  assert.ok(s1.edges.every((e) => e.dotted === (s1.lines[at(e.from)] === 'dotted' || s1.lines[at(e.to)] === 'dotted')));
  assert.equal(s1.lines[0], 'solid');
  assert.ok(s1.edges.some((e) => !e.dotted));
  const missing = overlayGeometry(view(['LR-NEXT-SUP', 'CC-NEXT-SUP']).series);
  assert.equal(missing.series[0].points.filter((p) => p !== null).length, 0);
  assert.equal(missing.series[0].edges.length, 0);
  assert.ok(missing.series[0].lines.every((l) => l === 'missing'));
});

test('AC3: いずれかの系列で「データなし」の軸のラベルに「?」を付ける', () => {
  const g = overlayGeometry(view(['LR-NEXT-SUP', 'CC-NEXT-SUP']).series);
  assert.ok(g.axisMissing.every((m) => m));
  assert.equal(axisLabel('地力', true), '地力 ?');
  assert.equal(axisLabel('地力', false), '地力');
  const all = overlayGeometry(view(['DD-CORE-MID', 'CC-CORE-MID']).series);
  assert.ok(all.axisMissing.every((m) => !m));
});

test('AC4: 系列の塗りは半透明で、光彩(グロー)を付けない', () => {
  assert.ok(SERIES_FILL_OPACITY > 0 && SERIES_FILL_OPACITY < 0.5);
  const src = readFileSync(new URL('../../src/app/compare/CompareRadar.svelte', import.meta.url), 'utf8');
  assert.ok(!/drop-shadow|feGaussianBlur|filter:/.test(src));
  assert.match(src, /fill-opacity=\{SERIES_FILL_OPACITY\}/);
});

test('AC5: 系列の色は並びの順で固定(チームの色を使わない)、点の形も変え、色・点の形・名前の凡例を出す', () => {
  const a = legendItems(view(['DD-CORE-MID', 'CC-CORE-MID', 'IT-CORE-MID', 'LR-CORE-MID']).series);
  const b = legendItems(view(['LR-CORE-MID', 'IT-CORE-MID']).series);
  assert.deepEqual(a.map((x) => x.color), [...SERIES_COLORS]);
  assert.deepEqual(b.map((x) => x.color), SERIES_COLORS.slice(0, 2));
  assert.deepEqual(a.map((x) => x.shape), ['circle', 'square', 'triangle', 'diamond']);
  assert.equal(a[0].label, ROSTER.find((p) => p.id === 'DD-CORE-MID')!.name);
  const paths = ['circle', 'square', 'triangle', 'diamond'].map((s) => markerPath(s as 'circle', 10, 10, 4));
  assert.equal(new Set(paths).size, 4);
  for (const p of paths) assert.match(p, /^M/);
});

test('AC6: 軸ごとの表に、各系列の点数(小数第一位)と確度の文字(高・中・低・データなし)を出す', () => {
  const rows = tableRows(view(['DD-NEXT-TOP', 'CC-NEXT-TOP', 'LR-NEXT-SUP']), FILE);
  assert.equal(rows.length, 8);
  for (const r of rows) {
    assert.equal(r.cells.length, 3);
    for (const c of r.cells) {
      assert.ok(['高', '中', '低', 'データなし'].includes(c.confidence), c.confidence);
      assert.match(c.display, /^(\d+\.\d|データなし)$/);
    }
  }
  assert.equal(rows[1].cells[0].confidence, '低');
  assert.equal(rows[0].cells[2].confidence, 'データなし');
});

test('AC6: 階級チーム・チーム全体の系列の確度は、所属選手のその軸の確度の最も低いもの', () => {
  const rows = tableRows(view(['DD-NEXT', 'CC-NEXT']), FILE);
  // 地力: DD-NEXT は DD-NEXT-TOP(2 試合)が「低」、CC-NEXT は全員が十分な試合を持つ
  assert.equal(rows[0].cells[0].confidence, '低');
  assert.ok(['高', '中'].includes(rows[0].cells[1].confidence));
});

test('AC7・8: 2つ目以降の差は 1つ目との差を符号つきで出し、どちらかがデータなしなら「—」', () => {
  const v = view(['CC-NEXT-SUP', 'DD-NEXT-SUP', 'LR-NEXT-SUP']);
  const rows = tableRows(v, FILE);
  for (const r of rows) {
    assert.equal(r.diffs[0], null);
    assert.match(r.diffs[1]!, /^[+−]\d+\.\d$/);
    assert.equal(r.diffs[2], '—');
  }
});

test('AC9: 評価の無い選手がいるチームの系列は、凡例に「データの無い n 名を除いて計算」を出す', () => {
  const items = legendItems(view(['LR-NEXT', 'CC-NEXT']).series);
  assert.equal(items[0].note, 'データの無い 1 名を除いて計算');
  assert.equal(items[1].note, undefined);
  const whole = legendItems(view(['LR', 'DD']).series);
  assert.equal(whole[0].note, 'データの無い 1 名を除いて計算');
});

test('AC1・14: 加えられる対象の候補は同じ種類(階級チームは同じ階級)で、まだ選んでいないもの', () => {
  const players = candidateTargets(['CC-CORE-MID', 'DD-CORE-MID']);
  assert.ok(players.every((c) => /^(DD|CC|IT|LR)-(NEXT|CORE|MASTERS)-(TOP|JG|MID|ADC|SUP)$/.test(c.id)));
  assert.ok(!players.some((c) => c.id === 'CC-CORE-MID'));
  assert.ok(players.some((c) => c.id === 'IT-MASTERS-ADC'));
  assert.deepEqual(candidateTargets(['CC-CORE', 'DD-CORE']).map((c) => c.id), ['IT-CORE', 'LR-CORE']);
  assert.deepEqual(candidateTargets(['CC', 'DD']).map((c) => c.id), ['IT', 'LR']);
  assert.deepEqual(candidateTargets(['CC', 'DD', 'IT', 'LR']), []);
});

test('AC22: 軸ごとの表は枠の中だけで横にスクロールし、画面は横にはみ出さない', () => {
  const css = readFileSync(new URL('../../src/app/app.css', import.meta.url), 'utf8');
  const wrap = /\.compare-table-wrap\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  assert.match(wrap, /overflow-x:\s*auto/);
  assert.match(wrap, /max-width:\s*100%/);
  const page = /\.compare\s*\{[^}]*\}/.exec(css)?.[0] ?? '';
  assert.match(page, /min-width:\s*0/);
});
