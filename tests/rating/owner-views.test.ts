// F-009 Task-14: 受入基準 37・38(価値責任者の見立ての読み込みと、データの軸の基礎の点数への加点)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRatings, loadRatingInputs } from '../../src/rating/build.ts';
import { ownerViewAdjust, readOwnerViews, type OwnerView } from '../../src/rating/owner-views.ts';

const NOW = Date.parse('2026-10-12T00:00:00Z');
const CFG = { strength: { 強: 1.0, 中: 0.6, 弱: 0.3 }, cap: 1.5 };
const IDS = new Set(['LR-NEXT-JG', 'LR-NEXT-TOP']);

const view = (over: Partial<OwnerView> = {}): OwnerView => ({
  targetKind: 'player', target: 'LR-NEXT-JG', axis: 'ground', direction: '+', strength: '強',
  date: '2026-10-12', quote: 'jgとしてのパフォーマンスはnext jgの中では2,3番手になりそう', source: 'https://example.test/thread', ...over,
});

function grounds(ownerViews?: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'f009-ov-'));
  writeFileSync(join(dir, 'shotcalling.json'), JSON.stringify({ kind: 'evidence-shotcalling', players: {} }));
  writeFileSync(join(dir, 'tournament.json'), JSON.stringify({ kind: 'evidence-tournament', players: {} }));
  if (ownerViews !== undefined) writeFileSync(join(dir, 'owner-views.json'), JSON.stringify(ownerViews));
  return dir;
}

function rawDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'f009-ov-raw-'));
  mkdirSync(join(dir, 'players'));
  mkdirSync(join(dir, 'matches'));
  return dir;
}

test('AC37: 加点は Σ(向き × 強さの重み)。強 1.0・中 0.6・弱 0.3、マイナスは引く', () => {
  assert.equal(ownerViewAdjust([view()], 'ground', CFG)!.value, 1);
  assert.equal(ownerViewAdjust([view({ strength: '中', direction: '-' })], 'ground', CFG)!.value, -0.6);
  assert.equal(ownerViewAdjust([view({ strength: '弱' }), view({ strength: '中' })], 'ground', CFG)!.value, 0.9);
  assert.equal(ownerViewAdjust([view()], 'laning', CFG), null, '別の軸の項目は加えない');
});

test('AC37: 合計は ±cap(1.5)で切り詰め、切り詰めたことを返す', () => {
  const up = ownerViewAdjust([view(), view(), view({ strength: '中' })], 'ground', CFG)!;
  assert.deepEqual([up.value, up.raw, up.clipped], [1.5, 2.6, true]);
  const down = ownerViewAdjust([view({ direction: '-' }), view({ direction: '-' })], 'ground', CFG)!;
  assert.deepEqual([down.value, down.clipped], [-1.5, true]);
  assert.equal(ownerViewAdjust([view()], 'ground', CFG)!.clipped, false);
});

test('AC38: 欠けた項目・名簿に無い選手・データの軸でない軸(コール力・大会経験)は使わずに選手 ID と理由を警告する', () => {
  const r = readOwnerViews({
    views: [
      view(),
      view({ quote: '' }),
      { ...view(), source: undefined },
      view({ target: 'XX-NEXT-JG' }),
      view({ axis: 'shotcalling' }),
      view({ axis: 'tournament' }),
    ],
  }, IDS);
  assert.equal(r.players['LR-NEXT-JG'].length, 1);
  assert.equal(r.warnings.length, 5);
  assert.match(r.warnings[0], /LR-NEXT-JG.*原文/);
  assert.match(r.warnings[1], /LR-NEXT-JG.*出典/);
  assert.match(r.warnings[2], /XX-NEXT-JG.*名簿に無い/);
  assert.match(r.warnings[3], /LR-NEXT-JG.*shotcalling.*データの軸でない/);
  assert.match(r.warnings[4], /LR-NEXT-JG.*tournament/);
});

test('AC38: 伸びしろ(F-005 基準17)は警告せずに読む。チーム・コーチの項目は F-010 へ渡す', () => {
  const r = readOwnerViews({ views: [view({ axis: 'growth' }), view({ targetKind: 'team', target: 'DD-CORE', axis: 'synergy' })] }, IDS);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.players['LR-NEXT-JG'][0].axis, 'growth');
  assert.equal(r.others[0].target, 'DD-CORE');
});

test('AC37: owner-views.json が無ければ加点しない(警告もエラーも無い)', () => {
  const { inputs, errors, warnings } = loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds() });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.ok(inputs.players.every((p) => (p.ownerViews ?? []).length === 0));
});

test('AC37: 見立ての加点は、同じ入力で見立てが無い場合の基礎の点数に足され(調子の前)、他の軸と他の選手は変わらない。説明の文に出る', () => {
  const plain = loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds() }).inputs;
  const withOv = loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds({ views: [view(), view({ axis: 'teamfight', direction: '-', strength: '中' })] }) }).inputs;
  const a = buildRatings(plain, NOW);
  const b = buildRatings(withOv, NOW);
  const axis = (rs: typeof a, id: string, key: string) => rs.find((r) => r.playerId === id)!.axes.find((x) => x.key === key)!;
  const g0 = axis(a, 'LR-NEXT-JG', 'ground');
  const g1 = axis(b, 'LR-NEXT-JG', 'ground');
  assert.equal(Math.round((g1.base - g0.base) * 100) / 100, 1);
  assert.equal(Math.round((g1.display - g0.display) * 100) / 100, 1, '調子の係数は加点の後に同じ値で効く');
  assert.equal(Math.round((axis(b, 'LR-NEXT-JG', 'teamfight').base - axis(a, 'LR-NEXT-JG', 'teamfight').base) * 100) / 100, -0.6);
  assert.equal(axis(b, 'LR-NEXT-JG', 'laning').base, axis(a, 'LR-NEXT-JG', 'laning').base);
  assert.equal(axis(b, 'LR-NEXT-TOP', 'ground').base, axis(a, 'LR-NEXT-TOP', 'ground').base);
  assert.equal(g1.ownerView?.value, 1);
  assert.equal(g0.ownerView, undefined);
  assert.match(g1.reason, /価値責任者の見立て \+1\.00.2026-10-12 \+強./);
});

test('AC37: 実データの見立ての記録は、警告なしで読める', () => {
  const raw = JSON.parse(readFileSync('docs/research/grounds/normalized/owner-views.json', 'utf8'));
  const ids = new Set(loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds() }).inputs.players.map((p) => p.playerId));
  const r = readOwnerViews(raw, ids);
  assert.deepEqual(r.warnings, []);
  assert.ok(Object.keys(r.players).length > 0);
});

test('AC39: 選手のページの軸の説明は、見立ての加点・原文・日付・強さ・切り詰めを「価値責任者の見立て」として、データの補正の行とは別に持つ', async () => {
  const { ratingAxesView } = await import('../../src/app/rating/view.ts');
  const inputs = loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds({ views: [view(), view(), view({ strength: '中' })] }) }).inputs;
  const r = buildRatings(inputs, NOW).find((x) => x.playerId === 'LR-NEXT-JG')!;
  const axes = ratingAxesView(r);
  const g = axes.find((a) => a.key === 'ground')!;
  assert.equal(g.ownerView?.value, '+1.50');
  assert.match(g.ownerView!.clipped!, /合計 \+2\.60 を上限で \+1\.50 に切り詰めた/);
  assert.equal(g.ownerView!.items.length, 3);
  assert.deepEqual(g.ownerView!.items[2], { quote: view().quote, date: '2026-10-12', strength: '肯定・中', source: view().source });
  assert.ok(!g.details.some((d) => d.label.includes('見立て')), 'データの補正の行に混ぜない');
  assert.equal(axes.find((a) => a.key === 'laning')!.ownerView, undefined);
  const plain = ratingAxesView(buildRatings(loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds() }).inputs, NOW).find((x) => x.playerId === 'LR-NEXT-JG')!);
  assert.equal(plain.find((a) => a.key === 'ground')!.ownerView, undefined);
});
