// F-011 Task-2: 受入基準 1・3・4・5・6・11・12(メタ解説のページの論理と、原稿の検証の追加)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import raw from '../../data/meta/26.20.json' with { type: 'json' };
import { validateMetaGuide, loadMetaGuide, REQUIRED_RANKED, REQUIRED_CHAPTERS } from '../../src/meta/load.ts';
import { metaPageView, staleNotice, loadTournamentPatch } from '../../src/app/meta/view.ts';
import { parseRoute, pageTitle } from '../../src/app/lib/index.ts';

const clone = () => structuredClone(raw) as Record<string, any>;
const guide = loadMetaGuide();

test('AC1: ページの見出しの近くに、原稿の対象のパッチ番号と更新日を出す', () => {
  const v = metaPageView(guide, '26.20');
  assert.equal(v.patch, guide.patch);
  assert.equal(v.updatedAt, guide.updatedAt);
  assert.match(v.headline, new RegExp(`パッチ ${guide.patch.replace('.', '\\.')}`));
  assert.match(v.headline, new RegExp(guide.updatedAt));
});

test('AC3: オブジェクト(ドラゴン・ヴォイドグラブ・ヘラルド・バロン・タワー)ごとに重要度(順位)と理由を出す', () => {
  const v = metaPageView(guide, '26.20');
  const ids = v.objectives.items.map((i) => i.id);
  for (const id of REQUIRED_RANKED.objectives) assert.ok(ids.includes(id), id);
  for (const i of v.objectives.items) {
    assert.ok(Number.isInteger(i.rank) && i.rank >= 1, `${i.id} の順位`);
    assert.ok(i.reason.text.length > 0);
    assert.equal(i.marks.length, 1);
  }
  const ranks = v.objectives.items.map((i) => i.rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), '重要度の順に並ぶ');
});

test('AC3: 重要度の値の無いオブジェクトか、必須のオブジェクトの欠けがあれば原稿の検証は失敗する', () => {
  const g1 = clone();
  delete g1.ranked.objectives.items[0].rank;
  assert.ok(validateMetaGuide(g1).errors.some((e) => /重要度/.test(e)));
  const g2 = clone();
  g2.ranked.objectives.items = g2.ranked.objectives.items.filter((i: { id: string }) => i.id !== 'baron');
  assert.ok(validateMetaGuide(g2).errors.some((e) => /baron/.test(e)));
});

test('AC4: SUP の型(5つ)と MID の役割(4つ)の項目ごとに重要度と理由を出す', () => {
  const v = metaPageView(guide, '26.20');
  assert.deepEqual([...v.supTypes.items.map((i) => i.id)].sort(), [...REQUIRED_RANKED.supTypes].sort());
  assert.deepEqual([...v.midRoles.items.map((i) => i.id)].sort(), [...REQUIRED_RANKED.midRoles].sort());
  for (const i of [...v.supTypes.items, ...v.midRoles.items]) {
    assert.ok(Number.isInteger(i.rank) && i.rank >= 1, i.id);
    assert.equal(i.marks.length, 1, i.id);
  }
});

test('AC4: SUP の型か MID の役割に重要度の値の無い項目があれば、原稿の検証は失敗する', () => {
  for (const key of ['supTypes', 'midRoles']) {
    const g = clone();
    g.ranked[key].items[1].rank = 'high';
    assert.ok(validateMetaGuide(g).errors.some((e) => /重要度/.test(e)), key);
  }
});

test('AC5・AC6: ウィークサイド・ブルーとレッド・LTK のドラフト規則の章があり、無ければ原稿の検証は失敗する', () => {
  assert.deepEqual([...REQUIRED_CHAPTERS].sort(), ['ltk-rules', 'sides', 'weakside']);
  const v = metaPageView(guide, '26.20');
  for (const id of REQUIRED_CHAPTERS) assert.ok(v.chapters.some((c) => c.id === id), id);
  const g = clone();
  g.chapters = g.chapters.filter((c: { id: string }) => c.id !== 'sides');
  assert.ok(validateMetaGuide(g).errors.some((e) => /sides/.test(e)));
});

test('AC5: ブルーとレッドの章は LTK の過去のサイドごとの勝率を含み、出典で確かめられない値は「未確認」か「推定」の印を持つ', () => {
  const sides = metaPageView(guide, '26.20').chapters.find((c) => c.id === 'sides')!;
  assert.ok(sides.claims.some((c) => /LTK/.test(c.text) && /勝率/.test(c.text)));
  assert.ok(sides.claims.every((c) => c.marks.length === 1));
});

test('AC6: LTK の規則の章は NEXT のプロテクト・CORE の使用禁止・MASTERS のフィアレスを扱う', () => {
  const rules = metaPageView(guide, '26.20').chapters.find((c) => c.id === 'ltk-rules')!;
  const text = rules.claims.map((c) => c.text).join('\n');
  for (const w of ['プロテクト', 'CORE', 'フィアレス']) assert.ok(text.includes(w), w);
});

test('AC10: 章ごとに「AI 執筆」の印、主張ごとに根拠の印を1つ出す', () => {
  const v = metaPageView(guide, '26.20');
  for (const c of v.chapters) {
    assert.deepEqual(c.marks, guide.chapters.find((x) => x.id === c.id)!.aiWritten ? ['AI 執筆'] : []);
    for (const cl of c.claims) assert.equal(cl.marks.length, 1);
  }
});

test('AC11: 大会のパッチが原稿のパッチと違う間と、設定の値が空の間は、原稿が古い可能性の注意を出す', () => {
  assert.equal(staleNotice('26.20', '26.20'), null);
  assert.match(staleNotice('26.20', '26.21') ?? '', /26\.21.*26\.20|26\.20.*26\.21/);
  assert.match(staleNotice('26.20', '') ?? '', /設定/);
  assert.match(staleNotice('26.20', null) ?? '', /設定/);
  assert.equal(metaPageView(guide, '26.21').notice, staleNotice(guide.patch, '26.21'));
  assert.ok(['string', 'object'].includes(typeof loadTournamentPatch()));
});

test('経路: #/meta でメタ解説のページを開き、題名を付ける', () => {
  assert.deepEqual(parseRoute('#/meta'), { page: 'meta' });
  assert.deepEqual(parseRoute('#/META/'), { page: 'meta' });
  assert.match(pageTitle({ page: 'meta' }), /メタ/);
});
