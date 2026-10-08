// F-002 Task-3: 受入基準 5(チーム全体・NEXT・CORE・MASTERS の4つのレーダー)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER } from '../../src/data/roster.ts';
import type { PlayerFile } from '../../src/data/types.ts';
import { teamView } from '../../src/app/team/view.ts';
import { parseRoute } from '../../src/app/lib/index.ts';

const q = (score: number) => ({ score, rationale: 'テスト', sources: ['x'], author: { kind: 'human' as const } });
/** 全軸に効く定性の評価だけを持つファイル(チームごとに点を変える) */
const fileFor = (id: string, v: number): PlayerFile => ({
  playerId: id,
  metrics: {},
  qualitative: { laning: q(v), teamfight: q(v), shotcalling: q(v), metaFit: q(v) },
  recentMatches: [],
});
const TEAM_VALUE: Record<string, number> = { DD: 8, CC: 6, IT: 4, LR: 2 };
const files = Object.fromEntries(ROSTER.map((p) => [p.id, fileFor(p.id, TEAM_VALUE[p.team])]));

test('AC5: チームのページはチーム全体・NEXT・CORE・MASTERS の4つの5軸レーダーを持つ', () => {
  const v = teamView('DD', files);
  assert.deepEqual(v.radars.map((r) => r.label), ['チーム全体', 'NEXT', 'CORE', 'MASTERS']);
  for (const r of v.radars) {
    assert.equal(r.scores.length, 5);
    assert.equal(r.displays.length, 5);
  }
});

test('AC5: 階級のレーダーは4チームの相対評価で、強いチームほど高い', () => {
  const dd = teamView('DD', files).radars.find((r) => r.label === 'CORE')!;
  const lr = teamView('LR', files).radars.find((r) => r.label === 'CORE')!;
  // レーン戦(index 1)は定性の評価だけで決まる
  assert.ok(dd.scores[1]! > 5 && lr.scores[1]! < 5);
  assert.equal(dd.displays[1], dd.scores[1]!.toFixed(1));
});

test('AC5: チーム全体は3階級の平均', () => {
  const v = teamView('CC', files);
  const tiers = v.radars.slice(1).map((r) => r.scores[1]!);
  assert.ok(Math.abs(v.radars[0].scores[1]! - tiers.reduce((a, b) => a + b, 0) / 3) < 1e-9);
});

test('AC5: 指標ファイルの無い選手だけの軸はデータなし', () => {
  const v = teamView('DD', {});
  assert.ok(v.radars.every((r) => r.displays.every((d) => d === 'データなし')));
});

test('AC5: チームのページは各階級の5選手へのリンクを持つ', () => {
  const v = teamView('IT', files);
  assert.equal(v.members.length, 15);
  assert.ok(v.members.every((m) => m.href.startsWith('#/player/IT-')));
});

test('AC5: ハッシュ #/team/<チーム> でチームのページを開く', () => {
  assert.deepEqual(parseRoute('#/team/DD'), { page: 'team', team: 'DD' });
  // 不正なチームは「見つからない」を案内する(QA 指摘 M4)
  assert.deepEqual(parseRoute('#/team/XX'), { page: 'notfound', hash: '#/team/XX' });
});
