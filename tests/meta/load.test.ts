// F-011 Task-1: 受入基準 2・10(メタの一覧の形、主張の根拠の印、章ごとの「AI 執筆」の印)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateMetaGuide, loadMetaGuide, importantChampions, claimMarks, chapterMarks, ROLES,
  type MetaGuide,
} from '../../src/meta/load.ts';

const RAW = JSON.parse(readFileSync('data/meta/26.20.json', 'utf8'));
const clone = (): MetaGuide => structuredClone(RAW);

test('メタの一覧の初版(26.20)は検証に通り、対象のパッチ・更新日・Data Dragon の版を持つ', () => {
  const { guide, errors } = validateMetaGuide(RAW);
  assert.deepEqual(errors, []);
  assert.equal(guide!.patch, '26.20');
  assert.match(guide!.updatedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(guide!.ddragonVersion, '16.20.1');
  assert.equal(loadMetaGuide().patch, '26.20');
});

test('AC2: ロールごと(TOP・JG・MID・ADC・SUP)に段階A と段階B のチャンピオンをすべて、一覧の件数どおりに返す', () => {
  const g = loadMetaGuide();
  assert.deepEqual([...ROLES], ['TOP', 'JG', 'MID', 'ADC', 'SUP']);
  let total = 0;
  for (const role of ROLES) {
    const { A, B } = importantChampions(g, role);
    const inList = g.champions.filter((c) => c.role === role);
    assert.ok(A.length > 0 && B.length > 0, role);
    assert.equal(A.length + B.length, inList.length, role);
    assert.ok(A.every((c) => c.tier === 'A' && c.role === role));
    assert.ok(B.every((c) => c.tier === 'B' && c.role === role));
    total += A.length + B.length;
  }
  assert.equal(total, g.champions.length);
});

test('AC2: 各チャンピオンは数値の key・id・日本語名・段階・根拠の略号と、根拠の印つきの理由を持つ', () => {
  const g = loadMetaGuide();
  const rumble = g.champions.find((c) => c.id === 'Rumble')!;
  assert.equal(rumble.key, 68);
  assert.equal(rumble.name, 'ランブル');
  assert.equal(rumble.role, 'TOP');
  assert.equal(rumble.tier, 'A');
  assert.deepEqual(rumble.basis, ['P', 'L']);
  assert.ok(rumble.reason.text.length > 0);
  assert.deepEqual(claimMarks(rumble.reason), ['出典']);
  assert.match(rumble.reason.url!, /^https:\/\//);
  const wukong = g.champions.find((c) => c.id === 'MonkeyKing')!;
  assert.equal(wukong.key, 62);
  assert.equal(wukong.name, 'ウーコン');
  for (const code of new Set(g.champions.flatMap((c) => c.basis))) assert.ok(g.basisLegend[code], code);
});

test('AC2: 段階が A・B 以外、key が数でない、ロールが5つ以外、同じロールで key が重なる項目は検証で失敗する', () => {
  const g = clone();
  g.champions[0].tier = 'C' as 'A';
  g.champions[1].key = '2' as unknown as number;
  g.champions[2].role = 'BOT' as 'ADC';
  g.champions.push({ ...g.champions[3] });
  const { errors } = validateMetaGuide(g);
  assert.ok(errors.some((e) => /段階/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => /key/.test(e)));
  assert.ok(errors.some((e) => /ロール/.test(e)));
  assert.ok(errors.some((e) => /重複/.test(e)));
});

test('AC10: 主張の根拠の印は「出典の URL」「推定」「未確認」の3種類で、1つの主張にちょうど1つ', () => {
  assert.deepEqual(claimMarks({ text: 'a', url: 'https://example.com' }), ['出典']);
  assert.deepEqual(claimMarks({ text: 'a', estimated: true }), ['推定']);
  assert.deepEqual(claimMarks({ text: 'a', unverified: true }), ['未確認']);
  assert.deepEqual(claimMarks({ text: 'a' }), []);
  assert.deepEqual(claimMarks({ text: 'a', url: 'https://example.com', unverified: true }), ['出典', '未確認']);
});

test('AC10: 印の無い主張・印を2つ以上持つ主張があれば、原稿の検証は失敗し、章と主張の番号を示す', () => {
  const g = clone();
  g.chapters[0].claims.push({ text: '印の無い主張' });
  g.chapters[0].claims.push({ text: '印が2つ', estimated: true, unverified: true });
  const n = g.chapters[0].claims.length;
  const { errors } = validateMetaGuide(g);
  assert.ok(errors.some((e) => e.includes(g.chapters[0].id) && e.includes(`${n - 1}`) && /印が無い/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes(`${n}`) && /2つ以上/.test(e)));
});

test('AC10: チャンピオンの理由にも根拠の印がちょうど1つ要り、出典の URL は http(s) でなければ失敗する', () => {
  const g = clone();
  g.champions[0].reason = { text: '理由' };
  g.champions[1].reason = { text: '理由', url: 'docs/research/meta-draft.md' };
  const { errors } = validateMetaGuide(g);
  assert.ok(errors.some((e) => e.includes(g.champions[0].id) && /印が無い/.test(e)), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes(g.champions[1].id) && /URL/.test(e)));
});

test('AC10: AI が書いた章には章ごとに「AI 執筆」の印が付き、人が書いた章には付かない。章は全主張が印を持つ', () => {
  const g = loadMetaGuide();
  assert.ok(g.chapters.length > 0);
  for (const ch of g.chapters) {
    assert.ok(ch.claims.length > 0, ch.id);
    assert.ok(ch.claims.every((c) => claimMarks(c).length === 1), ch.id);
  }
  assert.deepEqual(chapterMarks({ id: 'x', title: 't', aiWritten: true, claims: [] }), ['AI 執筆']);
  assert.deepEqual(chapterMarks({ id: 'x', title: 't', aiWritten: false, claims: [] }), []);
  const bad = clone();
  delete (bad.chapters[0] as { aiWritten?: boolean }).aiWritten;
  assert.ok(validateMetaGuide(bad).errors.some((e) => /AI 執筆/.test(e)));
});

test('形が違うファイル(kind 違い、パッチや更新日の形の誤り)は検証で失敗する', () => {
  assert.ok(validateMetaGuide({ kind: 'other' }).errors.length > 0);
  const g = clone();
  g.patch = '26-20';
  g.updatedAt = '10/09';
  const { errors } = validateMetaGuide(g);
  assert.ok(errors.some((e) => /パッチ/.test(e)));
  assert.ok(errors.some((e) => /更新日/.test(e)));
});
