// F-009 Task-3: 受入基準 12〜16(根拠の軸: コール力・大会経験)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  shotcallingAxis,
  tournamentAxis,
  readShotcallingSnapshot,
  readTournamentSnapshot,
  loadEvidenceConfig,
} from '../../src/rating/evidence.ts';
import type { ShotcallingEvidence, ShotcallingConfig, TournamentConfig, TournamentRecord } from '../../src/rating/evidence.ts';
import { ROSTER } from '../../src/data/roster.ts';

const sc: ShotcallingConfig = {
  base: 5.0,
  max: 9.5,
  strengthPoints: { 強: 1.5, 中: 1.0, 弱: 0.5 },
  kindWeights: { player: 1, coach: 1, 'other-game': 1, other: 0, 'owner-confirmation': 1 },
  negativeCap: 4.0,
  noPositive: 2.5,
  confidence: { highHuman: 2, midHuman: 1, midAiPoints: 2, aiPoints: { 強: 2, 中: 1, 弱: 0.5 } },
};
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

const ev = (o: Partial<ShotcallingEvidence>): ShotcallingEvidence => ({
  summary: '根拠',
  source: 'https://example.invalid/a',
  direction: '+',
  strength: '中',
  kind: 'player',
  collectedBy: 'ai',
  ...o,
});
const empty: TournamentRecord = { ltk: [], coach: [], pro: [], other: [] };
const S = (season: string, wins: number | null, losses: number | null) => ({
  season, team: 'DD', tier: 'CORE', role: 'TOP', wins, losses, source: 'docs/research/format-history.md 節6', url: 'https://example.invalid/s',
});

const shotSnap = readShotcallingSnapshot(JSON.parse(readFileSync('data/snapshots/evidence-shotcalling.json', 'utf8')));
const tourSnap = readTournamentSnapshot(JSON.parse(readFileSync('data/snapshots/evidence-tournament.json', 'utf8')));
const idOf = (name: string) => ROSTER.find((p) => p.name === name)!.id;

// --- 基準14: 肯定の根拠が無い ---
test('基準14: 根拠が1件も無い選手は 2.5 で「コール役の実績が見当たらない」', () => {
  const r = shotcallingAxis([], sc);
  assert.equal(r.score, 2.5);
  assert.match(r.reason, /コール役の実績が見当たらない/);
});

test('基準14: 肯定に数えない種類(解説者の経歴など)だけの選手も 2.5', () => {
  const r = shotcallingAxis([ev({ kind: 'other', strength: '強' })], sc);
  assert.equal(r.score, 2.5);
  assert.match(r.reason, /コール役の実績が見当たらない/);
});

test('基準14: 否定の根拠だけの選手は 2.5 で、理由に否定の根拠も示す', () => {
  const r = shotcallingAxis([ev({ direction: '-', strength: '強' }), ev({ direction: '-', strength: '弱' })], sc);
  assert.equal(r.score, 2.5);
  assert.match(r.reason, /コール役の実績が見当たらない/);
  assert.match(r.reason, /否定/);
});

// --- 基準13: 出典つきの根拠だけ、種類ごとの重み ---
test('基準13: 肯定の根拠を 5.0 から強さで積む(強 +1.5・中 +1.0・弱 +0.5)', () => {
  assert.equal(shotcallingAxis([ev({ strength: '強' })], sc).score, 6.5);
  assert.equal(shotcallingAxis([ev({ strength: '中' })], sc).score, 6.0);
  assert.equal(shotcallingAxis([ev({ strength: '弱' })], sc).score, 5.5);
  assert.equal(shotcallingAxis([ev({ strength: '強' }), ev({ strength: '中' }), ev({ strength: '弱' })], sc).score, 8.0);
});

test('基準13: 上限は 9.5', () => {
  const r = shotcallingAxis(Array.from({ length: 6 }, () => ev({ strength: '強' })), sc);
  assert.equal(r.score, 9.5);
});

test('基準13: コーチとしての指示と他ゲームの IGL は、選手としてのコールと同じ肯定の根拠に数える', () => {
  const player = shotcallingAxis([ev({ kind: 'player', strength: '中' })], sc).score;
  assert.equal(shotcallingAxis([ev({ kind: 'coach', strength: '中' })], sc).score, player);
  assert.equal(shotcallingAxis([ev({ kind: 'other-game', strength: '中' })], sc).score, player);
  assert.ok(shotcallingAxis([ev({ kind: 'coach', strength: '中' })], sc).score > 2.5);
});

test('基準13: 種類の重みは評価設定から読む', () => {
  const half = { ...sc, kindWeights: { ...sc.kindWeights, coach: 0.5 } };
  assert.equal(shotcallingAxis([ev({ kind: 'coach', strength: '強' })], half).score, 5.75);
});

test('基準13: コール力の入力は根拠と評価設定だけで、ランク・経験・データの軸を受け取らない', () => {
  assert.ok(shotcallingAxis.length <= 2);
  const cfg = loadEvidenceConfig().shotcalling as unknown as Record<string, unknown>;
  for (const k of Object.keys(cfg)) assert.doesNotMatch(k, /rank|anchor|ltk|games/i);
  const a = shotcallingAxis([ev({ strength: '強' })], sc);
  const b = shotcallingAxis([ev({ strength: '強' })], sc);
  assert.deepEqual(a, b);
});

test('基準13: 出典の無い根拠はスナップショットの読み込みで拒否し、選手をエラーに出す', () => {
  const r = readShotcallingSnapshot({
    kind: 'evidence-shotcalling',
    players: { 'DD-CORE-TOP': { name: 'x', evidence: [{ summary: 's', source: '', direction: '+', strength: '強', kind: 'player', collectedBy: 'ai' }, { summary: 's', source: 'https://a', direction: '+', strength: '強', kind: 'player', collectedBy: 'ai' }] } },
  });
  assert.equal(r.players['DD-CORE-TOP'].length, 1);
  assert.ok(r.errors.some((e) => e.includes('DD-CORE-TOP')));
});

test('基準13: 形の違うスナップショットは全体を拒否する', () => {
  assert.ok(readShotcallingSnapshot({ kind: 'static' }).errors.length > 0);
  assert.ok(readTournamentSnapshot(null).errors.length > 0);
});

// --- 基準16: 否定の根拠があれば上限 4.0 ---
test('基準16: 否定の根拠が1件でもあれば、肯定の根拠の件数に依らず 4.0 以下', () => {
  const many = [...Array.from({ length: 5 }, () => ev({ strength: '強' })), ev({ direction: '-', strength: '弱' })];
  const r = shotcallingAxis(many, sc);
  assert.ok(r.score <= 4.0);
  assert.equal(r.score, 4.0);
  assert.match(r.reason, /否定/);
});

test('基準16: 上限の値は評価設定から読む', () => {
  const r = shotcallingAxis([ev({ strength: '強' }), ev({ direction: '-' })], { ...sc, negativeCap: 3.5 });
  assert.equal(r.score, 3.5);
});

// --- 基準15: AI 収集の印と確度 ---
test('基準15: AI が集めた根拠を使った軸と根拠に「AI 収集」の印を付ける', () => {
  const r = shotcallingAxis([ev({ collectedBy: 'ai' }), ev({ collectedBy: 'human' })], sc);
  assert.ok(r.marks.includes('AI 収集'));
  const ai = r.evidence.filter((e) => e.marks.includes('AI 収集'));
  assert.equal(ai.length, 1);
  assert.ok(r.evidence.every((e) => e.source.length > 0));
});

test('基準15: 人が確認した根拠だけなら「AI 収集」の印を付けない', () => {
  const r = shotcallingAxis([ev({ collectedBy: 'human' })], sc);
  assert.ok(!r.marks.includes('AI 収集'));
});

test('基準15: 確度は件数と強さで決める(人の確認 2件で高、1件で中、AI の根拠の強さの合計 2 以上で中、それ未満は低)', () => {
  assert.equal(shotcallingAxis([ev({ collectedBy: 'human' }), ev({ collectedBy: 'human', direction: '-' })], sc).confidence, '高');
  assert.equal(shotcallingAxis([ev({ collectedBy: 'human' })], sc).confidence, '中');
  assert.equal(shotcallingAxis([ev({ strength: '中' }), ev({ strength: '中' })], sc).confidence, '中');
  assert.equal(shotcallingAxis([ev({ strength: '強' })], sc).confidence, '中');
  assert.equal(shotcallingAxis([ev({ strength: '弱' })], sc).confidence, '低');
  assert.equal(shotcallingAxis([ev({ strength: '弱' }), ev({ strength: '弱' })], sc).confidence, '低');
  assert.equal(shotcallingAxis([], sc).confidence, '低');
});

test('基準15: 確度の理由を説明に示す', () => {
  const r = shotcallingAxis([ev({ collectedBy: 'human' })], sc);
  assert.match(r.confidenceReason, /人が確認/);
});

// --- 実データ(スナップショット)での常識 K-03・K-04 ---
test('スナップショット: 60 名全員の根拠があり、すべての根拠に出典がある', () => {
  assert.deepEqual(shotSnap.errors, []);
  assert.equal(Object.keys(shotSnap.players).length, 60);
  for (const p of ROSTER) assert.ok(shotSnap.players[p.id], p.id);
  for (const list of Object.values(shotSnap.players)) for (const e of list) assert.ok(e.source.length > 0);
});

test('K-04: 価値責任者が「コールしない側」と確認した4名のコール力は 4.0 以下で、人の確認の根拠を持つ', () => {
  for (const name of ['龍巻ちせ', '叶', '空澄セナ', '獅子堂あかり']) {
    const list = shotSnap.players[idOf(name)];
    const r = shotcallingAxis(list, loadEvidenceConfig().shotcalling);
    assert.ok(r.score <= 4.0, `${name} ${r.score}`);
    assert.ok(list.some((e) => e.collectedBy === 'human' && e.direction === '-' && e.source.includes('価値責任者')), name);
  }
});

test('K-03: 肯定の根拠が無い選手は 2.5 以下、否定の根拠がある選手は 4.0 以下(全 60 名)', () => {
  const cfg = loadEvidenceConfig().shotcalling;
  for (const [id, list] of Object.entries(shotSnap.players)) {
    const r = shotcallingAxis(list, cfg);
    const pos = list.some((e) => e.direction === '+' && cfg.kindWeights[e.kind] > 0);
    if (!pos) assert.ok(r.score <= 2.5, `${id} ${r.score}`);
    if (list.some((e) => e.direction === '-')) assert.ok(r.score <= 4.0, `${id} ${r.score}`);
    assert.ok(r.score >= 0 && r.score <= 10);
  }
});

test('スナップショット: 叶・春茶は根拠が無く「コール役の実績が見当たらない」', () => {
  const cfg = loadEvidenceConfig().shotcalling;
  for (const name of ['叶', '春茶']) {
    const r = shotcallingAxis(shotSnap.players[idOf(name)], cfg);
    assert.match(r.reason, /コール役の実績が見当たらない/);
  }
});

// --- 基準12: 大会経験 ---
test('基準12: LTK も他の大会もプロの経歴も無い選手は 2.0', () => {
  const r = tournamentAxis(empty, tc);
  assert.equal(r.score, 2.0);
});

test('基準12: LTK の参加シーズン数で 1 → 4.0、2 → 5.5、3 → 6.5 を基準にする(試合数の加点を除く)', () => {
  const noGames = (n: number) => ({ ...empty, ltk: Array.from({ length: n }, (_, i) => S(`S${i + 1}`, null, null)) });
  assert.equal(tournamentAxis(noGames(1), tc).score, 4.0);
  assert.equal(tournamentAxis(noGames(2), tc).score, 5.5);
  assert.equal(tournamentAxis(noGames(3), tc).score, 6.5);
});

test('基準12: LTK の試合数を加点し、上限を超えない', () => {
  const r = tournamentAxis({ ...empty, ltk: [S('S1', 9, 6)] }, tc);
  assert.equal(r.score, 4.5);
  const many = tournamentAxis({ ...empty, ltk: [S('S1', 30, 30)] }, tc);
  assert.equal(many.score, 5.0);
});

test('基準12: 勝率は使わない(試合数が同じなら勝敗に依らず同じ点数)', () => {
  const a = tournamentAxis({ ...empty, ltk: [S('S1', 9, 1)] }, tc);
  const b = tournamentAxis({ ...empty, ltk: [S('S1', 0, 10)] }, tc);
  assert.equal(a.score, b.score);
});

test('基準12: プロの経歴(LJL の年数、上限 +2.0)と他の大会(上限 +1.0)を出典つきで加える', () => {
  const ljl = (years: number) => ({ league: 'LJL', team: 't', years, source: 'docs/research/players-dd-cc.md', url: 'https://example.invalid/p' });
  assert.equal(tournamentAxis({ ...empty, pro: [ljl(2)] }, tc).score, 3.0);
  assert.equal(tournamentAxis({ ...empty, pro: [ljl(10)] }, tc).score, 4.0);
  const o = { name: 'Worlds', source: 'docs/research/players-dd-cc.md', url: 'https://example.invalid/w' };
  assert.equal(tournamentAxis({ ...empty, other: [o] }, tc).score, 2.5);
  assert.equal(tournamentAxis({ ...empty, other: [o, o, o, o] }, tc).score, 3.0);
});

test('基準12: LTK の出場を他の大会・プロの1年より重く数える', () => {
  const one = tournamentAxis({ ...empty, ltk: [S('S1', null, null)] }, tc).score - 2.0;
  const ljlYear = tournamentAxis({ ...empty, pro: [{ league: 'LJL', team: 't', years: 1, source: 's', url: 'u' }] }, tc).score - 2.0;
  const otherOne = tournamentAxis({ ...empty, other: [{ name: 'x', source: 's', url: 'u' }] }, tc).score - 2.0;
  assert.ok(one > ljlYear);
  assert.ok(one > otherOne);
});

test('基準12: 説明にシーズンと出典を示し、出典つきの記録があれば確度は高', () => {
  const r = tournamentAxis({ ...empty, ltk: [S('S3', 8, 3)] }, tc);
  assert.equal(r.confidence, '高');
  assert.match(r.reason, /S3/);
  assert.ok(r.evidence.length > 0 && r.evidence.every((e) => e.source.length > 0));
  assert.equal(tournamentAxis(empty, tc).confidence === '高', false);
});

test('基準12: 出典の無い記録はスナップショットの読み込みで拒否する', () => {
  const r = readTournamentSnapshot({
    kind: 'evidence-tournament',
    players: { 'DD-CORE-TOP': { name: 'x', ltk: [{ season: 'S1', team: 'DD', tier: 'CORE', role: 'TOP', wins: 1, losses: 1, source: '' }], coach: [], pro: [], other: [] } },
  });
  assert.equal(r.players['DD-CORE-TOP'].ltk.length, 0);
  assert.ok(r.errors.some((e) => e.includes('DD-CORE-TOP')));
});

test('スナップショット: 大会経験は 60 名全員にあり、全項目に出典がある', () => {
  assert.deepEqual(tourSnap.errors, []);
  assert.equal(Object.keys(tourSnap.players).length, 60);
  for (const rec of Object.values(tourSnap.players)) {
    for (const e of [...rec.ltk, ...rec.coach, ...rec.pro, ...rec.other]) assert.ok(e.source.length > 0);
  }
});

test('K-05: MASTERS の元プロ(LJL の経歴あり)は、LTK 初出場の NEXT の選手より大会経験が高い', () => {
  const cfg = loadEvidenceConfig().tournament;
  const score = (id: string) => tournamentAxis(tourSnap.players[id], cfg).score;
  const firstNext = ROSTER.filter((p) => p.tier === 'NEXT' && tourSnap.players[p.id].ltk.length === 0);
  assert.ok(firstNext.length >= 3);
  const exPro = ROSTER.filter((p) => p.tier === 'MASTERS' && tourSnap.players[p.id].pro.some((x) => x.league === 'LJL'));
  assert.ok(exPro.length >= 10);
  for (const m of exPro) for (const n of firstNext) assert.ok(score(m.id) > score(n.id), `${m.name} > ${n.name}`);
});

test('スナップショット: 調査の訂正(しゃるるは元プロでない、たぬき忍者は LJL CS)を反映する', () => {
  assert.equal(tourSnap.players[idOf('しゃるる')].pro.length, 0);
  const t = tourSnap.players[idOf('たぬき忍者')].pro;
  assert.ok(t.length > 0 && t.every((x) => x.league !== 'LJL'));
});
