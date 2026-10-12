// F-009 Task-3: 受入基準 12〜16(根拠の軸: コール力・大会経験)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { roleSwitchDiscount,
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
  proMax: 3.0,
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

const shotSnap = readShotcallingSnapshot(JSON.parse(readFileSync('docs/research/grounds/normalized/shotcalling.json', 'utf8')));
const tourSnap = readTournamentSnapshot(JSON.parse(readFileSync('docs/research/grounds/normalized/tournament.json', 'utf8')));
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

// --- 基準16(2026-10-09 改訂): 肯定と否定の強さの差で決める ---
test('基準16: 差が正なら 5.0 + 差(弱い否定1件で強い肯定を打ち消さない)', () => {
  // 強 1.5 − 弱 0.5 = 1.0 → 6.0
  const r = shotcallingAxis([ev({ strength: '強' }), ev({ direction: '-', strength: '弱' })], sc);
  assert.equal(r.score, 6.0);
  assert.match(r.reason, /否定/);
  // 強い肯定が多い選手は弱い否定1件があっても高い
  const many = [...Array.from({ length: 3 }, () => ev({ strength: '強' })), ev({ strength: '中' }), ev({ direction: '-', strength: '弱' })];
  assert.equal(shotcallingAxis(many, sc).score, 9.5);
});

test('基準16: 差が 0 以下なら 4.0 + 差 × 0.5(2.5〜4.0)', () => {
  // 中 1.0 − 強 1.5 = −0.5 → 3.75
  assert.equal(shotcallingAxis([ev({ strength: '中' }), ev({ direction: '-', strength: '強' })], sc).score, 3.75);
  // 差 0 → 4.0
  assert.equal(shotcallingAxis([ev({ strength: '中' }), ev({ direction: '-', strength: '中' })], sc).score, 4.0);
  // 大きく負 → 下限 2.5
  const r = shotcallingAxis([ev({ strength: '弱' }), ...Array.from({ length: 3 }, () => ev({ direction: '-', strength: '強' }))], sc);
  assert.equal(r.score, 2.5);
});

test('基準16: 価値責任者が「コールしない側」と確認した選手は、肯定の根拠に依らず 4.0 以下', () => {
  const r = shotcallingAxis(
    [...Array.from({ length: 3 }, () => ev({ strength: '強' })), ev({ direction: '-', strength: '強', kind: 'owner-confirmation', collectedBy: 'human' })],
    sc,
  );
  assert.ok(r.score <= 4.0, `${r.score}`);
});

test('基準16: 否定が上回るときの上限は評価設定から読む', () => {
  const r = shotcallingAxis([ev({ strength: '中' }), ev({ direction: '-', strength: '中' })], { ...sc, negativeCap: 3.5 });
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

// 2026-10-11: 価値責任者の決定 Q3(B)(龍巻ちせの 2026-10-08 の確認を 10-11 の確認で置き換えて外す。叶は置き換える確認が無く据え置き)と Q5(A)(まいたけを足す)
test('K-04: 価値責任者が「コールしない側」と確認した4名のコール力は 4.0 以下で、人の確認の根拠を持つ', () => {
  for (const name of ['叶', '空澄セナ', '獅子堂あかり', 'まいたけ']) {
    const list = shotSnap.players[idOf(name)];
    const r = shotcallingAxis(list, loadEvidenceConfig().shotcalling);
    assert.ok(r.score <= 4.0, `${name} ${r.score}`);
    assert.ok(list.some((e) => e.collectedBy === 'human' && e.direction === '-' && e.source.includes('価値責任者')), name);
  }
});

test('K-03: 肯定の根拠が無い選手は 2.5 以下、否定が肯定を上回る選手は 4.0 以下(全 60 名)', () => {
  const cfg = loadEvidenceConfig().shotcalling;
  const pts = (list: ShotcallingEvidence[], dir: string) =>
    list.filter((e) => e.direction === dir).reduce((s, e) => s + cfg.strengthPoints[e.strength] * (cfg.kindWeights[e.kind] ?? 0), 0);
  for (const [id, list] of Object.entries(shotSnap.players)) {
    const r = shotcallingAxis(list, cfg);
    const pos = list.some((e) => e.direction === '+' && cfg.kindWeights[e.kind] > 0);
    if (!pos) assert.ok(r.score <= 2.5, `${id} ${r.score}`);
    if (pts(list, '-') >= pts(list, '+')) assert.ok(r.score <= 4.0, `${id} ${r.score}`);
    assert.ok(r.score >= 0 && r.score <= 10);
  }
});

test('スナップショット: 春茶は根拠が無く「コール役の実績が見当たらない」', () => {
  const cfg = loadEvidenceConfig().shotcalling;
  const r = shotcallingAxis(shotSnap.players[idOf('春茶')], cfg);
  assert.match(r.reason, /コール役の実績が見当たらない/);
});

// 2026-10-09: hetel の配信で叶に肯定の根拠が入った。価値責任者の「コールしない側」の確認により 4.0 以下に収まる(価値責任者がテストの変更を決定)
test('スナップショット: 叶は肯定の根拠があっても、価値責任者の確認により 4.0 以下', () => {
  const cfg = loadEvidenceConfig().shotcalling;
  const r = shotcallingAxis(shotSnap.players[idOf('叶')], cfg);
  assert.ok(shotSnap.players[idOf('叶')].some((e) => e.direction === '+'));
  assert.ok(r.score <= cfg.negativeCap, String(r.score));
});

// 2026-10-11: 価値責任者の決定 Q3(B)。龍巻ちせの 2026-10-08 の確認「コールしない側」を 10-11 のレビューの肯定の確認で置き換えた(叶は置き換える確認が無く据え置き)
test('スナップショット: 龍巻ちせに 2026-10-08 の「コールしない側」の確認は無く、2026-10-11 の肯定の確認がある', () => {
  const list = shotSnap.players[idOf('龍巻ちせ')];
  assert.ok(!list.some((e) => e.kind === 'owner-confirmation' && e.direction === '-'));
  assert.ok(!list.some((e) => e.source.includes('2026-10-08')));
  assert.ok(list.some((e) => e.kind === 'owner-confirmation' && e.direction === '+' && e.source.includes('2026-10-11')));
});

// 2026-10-11: 価値責任者の決定 Q4(B)。言語・喋り方を理由にした 10-11 のレビューの発言を否定の根拠(kind player・collectedBy human・強さ 中。「コールしない側」の確認ではないため上限はかけない)として入れ、監査で外した否定のうち規則に当たる 3 件を戻した
test('スナップショット: ねすてぃー・Recap に 2026-10-11 の人の否定(player・中)があり、ねすてぃー・Killin9Hit・天帝フォルテに戻した否定が元の出典つきである', () => {
  for (const name of ['ねすてぃー', 'Recap']) {
    const list = shotSnap.players[idOf(name)];
    assert.ok(list.some((e) => e.kind === 'player' && e.collectedBy === 'human' && e.direction === '-' && e.strength === '中' && e.source.includes('2026-10-11')), name);
    assert.ok(!list.some((e) => e.kind === 'owner-confirmation' && e.direction === '-'), name);
  }
  const restored: [string, RegExp, string][] = [
    ['ねすてぃー', /日本語・滑舌の問題で意図が伝わりにくい/, 'xdsbfDbaqRU'],
    ['Killin9Hit', /試合中の日本語でのコミュニケーションを課題/, 'EMad3J7DPa0'],
    ['天帝フォルテ', /喋ってない/, '6cUq6njtOdE'],
  ];
  for (const [name, re, videoId] of restored) {
    const hit = shotSnap.players[idOf(name)].find((e) => e.direction === '-' && re.test(e.summary));
    assert.ok(hit && hit.source.includes(videoId) && hit.collectedBy === 'ai', name);
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

// 2026-10-11 基準12 の改訂(再判定 4): プロの経歴の加点の上限 2.0 → 3.0
test('基準12: プロの経歴(LJL の年数、上限 +3.0)と他の大会(上限 +1.0)を出典つきで加える', () => {
  const ljl = (years: number) => ({ league: 'LJL', team: 't', years, source: 'docs/research/players-dd-cc.md', url: 'https://example.invalid/p' });
  assert.equal(tournamentAxis({ ...empty, pro: [ljl(2)] }, tc).score, 3.0);
  assert.equal(tournamentAxis({ ...empty, pro: [ljl(10)] }, tc).score, 5.0);
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


// --- 2026-10-10 基準12 の改訂・基準31: ロール転向 ---
test('基準12(改訂): 今のロール以外の出場は 0.5、NEXT の出場は 0.75 で数える(シーズンの点は補間)', () => {
  const wc = { ...tc, roleOtherWeight: 0.5, tierWeights: { MASTERS: 1, CORE: 1, NEXT: 0.75 } };
  const adc = { ...S('S1', null, null), role: 'ADC' };
  assert.equal(tournamentAxis({ ...empty, ltk: [S('S1', null, null)] }, wc, 'TOP').score, 4.0);
  assert.equal(tournamentAxis({ ...empty, ltk: [adc] }, wc, 'TOP').score, 3.0);
  assert.equal(tournamentAxis({ ...empty, ltk: [{ ...S('S1', null, null), tier: 'NEXT' }] }, wc, 'TOP').score, 3.5);
  // ロールを渡さなければロールの重みは掛けない
  assert.equal(tournamentAxis({ ...empty, ltk: [adc] }, wc).score, 4.0);
});

test('基準31: ロール転向の割引は LTK の出場シーズンのうち今のロール以外の割合 × 設定の値。出場歴が無ければ 0', () => {
  const adc = (s: string) => ({ ...S(s, null, null), role: 'ADC' });
  assert.equal(roleSwitchDiscount(empty, 'TOP', 0.5).value, 0);
  assert.equal(roleSwitchDiscount({ ...empty, ltk: [S('S1', null, null)] }, 'TOP', 0.5).value, 0);
  assert.equal(roleSwitchDiscount({ ...empty, ltk: [adc('S1'), adc('S2')] }, 'TOP', 0.5).value, 0.5);
  assert.ok(Math.abs(roleSwitchDiscount({ ...empty, ltk: [adc('S1'), adc('S2'), S('S3', null, null)] }, 'TOP', 0.5).value - (0.5 * 2) / 3) < 1e-12);
  assert.equal(roleSwitchDiscount({ ...empty, ltk: [adc('S1')] }, undefined, 0.5).value, 0);
});

// --- 2026-10-11 基準12 の改訂・基準32(再判定 4): プロの加点の上限 3.0、国際大会の加点、他の大会との重複の除外 ---
const DEF = loadEvidenceConfig().tournament;
const intl = (event: string, year: number) => ({ event, year, source: 'https://lol.fandom.com/wiki/X', ref: 'lolPro[0]' });
const other = (name: string) => ({ name, source: 'docs/research/players-dd-cc.md', url: 'https://example.invalid/o' });
const ljlPro = (years: number) => ({ league: 'LJL', team: 't', years, source: 'docs/research/players-dd-cc.md', url: 'https://example.invalid/p' });

test('基準12(改訂): 評価設定の初期値は proMax 3.0、国際大会 1 大会 0.5・上限 1.0、別名の表は仕様の 4 組', () => {
  assert.equal(DEF.proMax, 3);
  assert.equal(DEF.internationalPer, 0.5);
  assert.equal(DEF.internationalMax, 1);
  assert.deepEqual(DEF.internationalAliases, {
    'LCP P&R': ['入れ替え戦', 'Promotion'],
    Worlds: ['世界大会', 'World Championship'],
    MSI: ['Mid-Season Invitational'],
    'アジア競技大会': ['Asian Games'],
  });
});

test('基準12(改訂): プロの経歴の加点の上限は 3.0(LJL のスタメン 6 年分)', () => {
  assert.equal(tournamentAxis({ ...empty, pro: [ljlPro(5)] }, DEF).score, 4.5);
  assert.equal(tournamentAxis({ ...empty, pro: [ljlPro(6)] }, DEF).score, 5.0);
  assert.equal(tournamentAxis({ ...empty, pro: [ljlPro(10)] }, DEF).score, 5.0);
});

test('基準12(改訂): 国際大会の記録を 1 大会 +0.5 で足し、上限 +1.0 で止める。説明と根拠の一覧に出典つきで出す', () => {
  const one = tournamentAxis({ ...empty, international: [intl('IWCI', 2016)] }, DEF);
  assert.equal(one.score, 2.5);
  const two = tournamentAxis({ ...empty, international: [intl('Asia Masters', 2025), intl('LCP P&R', 2025)] }, DEF);
  assert.equal(two.score, 3.0);
  const seven = tournamentAxis({ ...empty, international: [2015, 2016, 2017, 2018, 2019, 2021, 2022].map((y) => intl('Worlds', y)) }, DEF);
  assert.equal(seven.score, 3.0);
  assert.match(seven.reason, /国際大会 7 件/);
  assert.match(two.reason, /国際大会 2 件/);
  assert.match(two.reason, /Asia Masters 2025/);
  const items = two.evidence.filter((e) => e.text.includes('国際大会'));
  assert.equal(items.length, 2);
  assert.ok(items.every((e) => e.source === 'https://lol.fandom.com/wiki/X' && e.used));
  assert.equal(two.confidence, '高');
  // 同じ大会名と年の記録は 1 大会
  assert.equal(tournamentAxis({ ...empty, international: [intl('Worlds', 2018), intl('Worlds', 2018)] }, DEF).score, 2.5);
  // 国際大会の記録が無ければ従来どおり
  assert.equal(tournamentAxis(empty, DEF).score, 2.0);
  assert.equal(tournamentAxis({ ...empty, international: [] }, DEF).score, 2.0);
});

test('基準12(改訂): 国際大会の加点と上限は評価設定から読む(設定に無ければ足さない)', () => {
  const rec = { ...empty, international: [intl('MSI', 2019), intl('Worlds', 2019), intl('Worlds', 2018)] };
  assert.equal(tournamentAxis(rec, { ...DEF, internationalPer: 0.25, internationalMax: 2 }).score, 2.75);
  assert.equal(tournamentAxis(rec, { ...DEF, internationalMax: 2 }).score, 3.5);
  assert.equal(tournamentAxis(rec, tc).score, 2.0);
});

test('基準32: 他の大会の名前が国際大会の記録と同じ大会名・同じ年を指すなら他の大会として数えず、「国際大会の項で数えた」と示す', () => {
  const r = tournamentAxis({ ...empty, international: [intl('Worlds', 2018)], other: [other('Worlds 2018(DFM)')] }, DEF);
  assert.equal(r.score, 2.5, '国際大会 +0.5 だけ(他の大会 +0.5 を重ねない)');
  assert.match(r.reason, /国際大会の項で数えた/);
  assert.match(r.reason, /他の大会 0 件/);
  const item = r.evidence.find((e) => e.text.includes('Worlds 2018(DFM)'))!;
  assert.equal(item.used, false);
  assert.match(item.text, /国際大会の項で数えた/);
  // 年が違えば別の大会として数える
  const diff = tournamentAxis({ ...empty, international: [intl('Worlds', 2018)], other: [other('Worlds 2021(DFM、ベスト16)')] }, DEF);
  assert.equal(diff.score, 3.0);
  assert.doesNotMatch(diff.reason, /国際大会の項で数えた/);
  assert.ok(diff.evidence.every((e) => e.used));
  // 名前に 4 桁の年が無ければ大会名だけで判定する
  assert.equal(tournamentAxis({ ...empty, international: [intl('Worlds', 2018)], other: [other('Worlds(DFM)')] }, DEF).score, 2.5);
  // 大会名が違えば、同じ年でも数える
  assert.equal(tournamentAxis({ ...empty, international: [intl('Worlds', 2018)], other: [other('JCG の大会 2018')] }, DEF).score, 3.0);
  // 国際大会の記録が無ければ、他の大会は従来どおり数える
  assert.equal(tournamentAxis({ ...empty, other: [other('Worlds 2018(DFM)')] }, DEF).score, 2.5);
});

test('基準32: 別名の表(internationalAliases)にある別名も同じ大会と判定する。表に無い名前は数える', () => {
  const lcp = [intl('Asia Masters', 2025), intl('LCP P&R', 2025)];
  const dup = tournamentAxis({ ...empty, international: lcp, other: [other('LCP 入れ替え戦 2025(QT DIG∞)')] }, DEF);
  assert.equal(dup.score, 3.0, '国際大会 2 件 +1.0 だけ');
  assert.match(dup.reason, /国際大会の項で数えた/);
  // 別名の表に無い言い方(昇格戦)は同じ大会と判定しない
  assert.equal(tournamentAxis({ ...empty, international: lcp, other: [other('LCP 昇格戦 2025(QT DIG∞)')] }, DEF).score, 3.5);
  // 別名でも年が違えば数える
  assert.equal(tournamentAxis({ ...empty, international: lcp, other: [other('LCP 入れ替え戦 2024')] }, DEF).score, 3.5);
  // 別名の表が空なら大会名だけで判定する
  assert.equal(tournamentAxis({ ...empty, international: lcp, other: [other('LCP 入れ替え戦 2025(QT DIG∞)')] }, { ...DEF, internationalAliases: {} }).score, 3.5);
  // ほかの別名: 世界大会 = Worlds、Mid-Season Invitational = MSI、Asian Games = アジア競技大会
  const three = [intl('Worlds', 2019), intl('MSI', 2019), intl('アジア競技大会', 2022)];
  const r = tournamentAxis({ ...empty, international: three, other: [other('世界大会 2019'), other('Mid-Season Invitational 2019'), other('Asian Games 2022')] }, DEF);
  assert.equal(r.score, 3.0);
  assert.equal(r.evidence.filter((e) => !e.used).length, 3);
});

test('基準12・32 の計算の例(Ceros の形): LJL 9 年・国際大会 7 件・他の大会「Worlds 2018(DFM)」で、改訂前の設定(上限 2.0・国際大会なし)より +1.5', () => {
  const events = ([['IWCI', 2015], ['IWCT', 2015], ['IWCI', 2016], ['Rift Rivals', 2017], ['Worlds', 2018], ['MSI', 2019], ['Worlds', 2019]] as [string, number][]).map(([e, y]) => intl(e, y));
  const rec = { ...empty, pro: [ljlPro(9)], other: [other('Worlds 2018(DFM)')] };
  const before = tournamentAxis(rec, { ...DEF, proMax: 2 }).score; // 2 + 2.0 + 0.5
  const after = tournamentAxis({ ...rec, international: events }, DEF).score; // 2 + 3.0 + 国際大会 1.0 + 他の大会 0
  assert.equal(before, 4.5);
  assert.equal(after, 6.0);
});
