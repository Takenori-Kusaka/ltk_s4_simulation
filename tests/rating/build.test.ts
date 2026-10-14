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
  assert.deepEqual(top.exPro, { level: 'LJL-starter', source: 'https://example.test/wiki/top', years: 0 });
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
  assert.match(reason('EX'), /ランクの基準 8\.00\(元プロの下限: LJL-sub。出典: https:\/\/example\.test\/wiki\/A。到達の時点が不明\(減衰なし\)\)/);
  assert.match(reason('PK'), /ランクの基準 8\.16\(最高ランク: Master 120LP。出典: https:\/\/example\.test\/opgg\/pk。到達の時点が不明\(減衰なし\)\)/);
  assert.match(reason('SO'), /ランクの基準 \d\.\d\d\(ソロランク\)/);
  assert.match(reason('SE'), /ランクの基準 9\.41\(最高ランク\(今季\): Grandmaster 1060LP。出典: https:\/\/example\.test\/opgg\/se\)/);
});

// F-009 基準12 の追記: 読み込み時に、経歴の記録の年数と出場記録の年数の大きい方をプロの経歴にする
test('基準12: career.json の lol.years が tournament.json の pro の年数より多い水準は、差分を足して評価の入力にし、理由の文に出る', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f009-grounds-pro-'));
  const src = 'docs/research/players-dd-cc.md';
  writeFileSync(join(dir, 'shotcalling.json'), JSON.stringify({ kind: 'evidence-shotcalling', players: {} }));
  writeFileSync(join(dir, 'tournament.json'), JSON.stringify({
    kind: 'evidence-tournament',
    players: {
      'DD-MASTERS-TOP': { ltk: [], coach: [], pro: [{ league: 'LJL', team: 'V3 Esports', years: 1, source: src }, { league: 'LJL', team: 'QT DIG∞', years: 1, source: src }], other: [] },
      'DD-MASTERS-MID': { ltk: [], coach: [], pro: [{ league: 'LJL CS', team: 'x', years: 1, source: src }], other: [] },
    },
  }));
  const years = (o: Record<string, number>) => ({ 'overseas-major': 0, 'LJL-starter': 0, 'LJL-sub': 0, 'overseas-minor': 0, 'LJL CS-starter': 0, 'LJL CS-sub': 0, academy: 0, ...o });
  writeFileSync(join(dir, 'career.json'), JSON.stringify({
    kind: 'evidence-career-normalized',
    players: {
      'DD-MASTERS-TOP': { peak: { allTime: null, thisSeason: null }, lol: { highestLevel: 'LJL-starter', years: years({ 'LJL-starter': 5 }), basis: ['lolPro[0]'], statusSource: 'https://lol.fandom.com/wiki/Washidai' } },
      'DD-MASTERS-MID': { peak: { allTime: null, thisSeason: null }, lol: { highestLevel: 'none', years: years({}), basis: [], statusSource: null } },
    },
  }));
  const { inputs, errors } = loadRatingInputs({ rawDir: rawDir(), groundsDir: dir });
  assert.deepEqual(errors, []);
  const top = find(inputs.players, 'DD-MASTERS-TOP').tournament.pro;
  assert.deepEqual(top.map((x) => [x.league, x.team, x.years]), [['LJL', 'V3 Esports', 1], ['LJL', 'QT DIG∞', 1], ['LJL', '経歴の記録(career.json)', 3]]);
  assert.equal(top[2].source, 'https://lol.fandom.com/wiki/Washidai');
  // 出場記録の方が多い水準(経歴の記録 0 年 vs 出場記録 1 年)は変えない
  assert.deepEqual(find(inputs.players, 'DD-MASTERS-MID').tournament.pro.map((x) => [x.league, x.years]), [['LJL CS', 1]]);
  // 評価の理由の文に足した項目が出る
  const rating = buildRatings(inputs, NOW).find((r) => r.playerId === 'DD-MASTERS-TOP')!;
  const t = rating.axes.find((a) => a.key === 'tournament')!;
  assert.ok(t.reason.includes('LJL 経歴の記録(career.json) 3 年'), t.reason);
});

// F-004 Task-2: 受入基準 12(評価の入力へ足す)・13・15(軸の説明と確度の理由)・16(ピックプール)・17(スクリムの文字起こしのコール力の根拠)
import { collectResults, loadResults } from '../../src/results/load.ts';
import { readChampionList } from '../../src/results/champions.ts';
import { ROSTER } from '../../src/data/roster.ts';

const NOW2 = Date.parse('2026-10-11T03:00:00Z');
const SCRIM_FILE = '2026-10-10-lr-core-vs-dd-core.json';
const F004_ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'] as const;
const F004_CHAMP: Record<string, string> = { TOP: 'ヨリック', JG: 'パンテオン', MID: 'アカリ', ADC: 'ユナラ', SUP: 'ルル' };
const F004_CHAMPS = readChampionList({ champions: { Yorick: 'ヨリック', Pantheon: 'パンテオン', Akali: 'アカリ', Yunara: 'ユナラ', Lulu: 'ルル' }, keys: { Yorick: 83, Pantheon: 80, Akali: 84, Yunara: 804, Lulu: 117 } }).list!;
type Row = Record<string, unknown>;
/** 階級チームの 5 人(JG のチャンピオンは null)。kills で両チームの差を付ける */
const f004Team = (label: string, kills: number): Row => {
  const [team, tier] = label.split(' ');
  const players = F004_ROLES.map((role) => {
    const p = ROSTER.find((x) => x.team === team && x.tier === tier && x.role === role)!;
    return { role, rosterName: p.name, mappingConfidence: '確信', champion: role === 'JG' ? null : F004_CHAMP[role], kills, deaths: 2, assists: 4, gold: 10000, damage: 10000 };
  });
  return { kills: kills * 5, deaths: 10, assists: 20, gold: 50000, players };
};
const f004Scrim = (duration: string, winner: 'DD CORE' | 'LR CORE'): Row => ({
  kind: 'scrim', date: '2026-10-10', listeners: false, source: { url: 'https://www.youtube.com/watch?v=x' }, duration, winner,
  teams: { 'LR CORE': f004Team('LR CORE', winner === 'LR CORE' ? 3 : 1), 'DD CORE': f004Team('DD CORE', winner === 'DD CORE' ? 3 : 1) },
});
/** 評価の入力: 根拠は空、ソロランクの試合は無し、スクリムだけ */
const f004Inputs = (raw: Row[]) => {
  const r = collectResults([{ file: SCRIM_FILE, kind: 'scrim', raw }], { champions: F004_CHAMPS });
  assert.deepEqual(r.errors, []);
  return loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds(), scrims: r.games });
};
const axisOf = (ratings: ReturnType<typeof buildRatings>, id: string, key: string) => ratings.find((r) => r.playerId === id)!.axes.find((a) => a.key === key)!;

test('F-004 AC12: loadRatingInputs は受け付けたスクリムの記録から作った試合の記録を、ソロランクの試合と同じ games に足す', () => {
  // 既存の記録の試合日は LTKDB の 2026-10-09(価値責任者の確認 2026-10-12)
  const REAL_FILE = '2026-10-09-lr-core-vs-dd-core.json';
  const real = loadResults({ root: 'docs/research/grounds', champions: null });
  const { inputs, errors } = loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds(), scrims: real.games.filter((g) => g.file === REAL_FILE) });
  assert.deepEqual(errors, []);
  const adc = find(inputs.players, 'DD-CORE-ADC');
  assert.equal(adc.games.length, 3);
  assert.ok(adc.games.every((g) => g.kind === 'scrim' && g.queueId === 0 && g.position === 'BOTTOM'));
  assert.equal(find(inputs.players, 'CC-MASTERS-TOP').games.length, 0);
  assert.equal(inputs.matches.length, 0, 'スクリムは母集団(matches)に入れない');
  // 渡さなければ従来どおり
  assert.equal(find(loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds() }).inputs.players, 'DD-CORE-ADC').games.length, 0);
});

test('F-004 AC13/AC15: 軸の説明と確度の理由に「スクリム n 試合(重み 2.0)を含む」。有効な試合数は 2.0 倍。スクリムが効かない軸(レーン戦)には文を出さない', () => {
  const { inputs } = f004Inputs([f004Scrim('40:00', 'DD CORE'), f004Scrim('35:00', 'DD CORE'), f004Scrim('30:00', 'LR CORE')]);
  const ratings = buildRatings(inputs, NOW2);
  const ground = axisOf(ratings, 'DD-CORE-ADC', 'ground');
  assert.match(ground.reason, /スクリム 3 試合\(重み 2\.0\)を含む/);
  assert.match(ground.data!.confidenceReason, /スクリム 3 試合\(重み 2\.0\)を含む/);
  assert.equal(ground.data!.scrimGames, 3);
  const w = 0.5 ** (1 / 45); // 2026-10-10 正午(JST)から基準日まで 1 日
  assert.ok(Math.abs(ground.data!.effectiveGames - 6 * w) < 1e-6, `有効な試合数 ${ground.data!.effectiveGames}`);
  const laning = axisOf(ratings, 'DD-CORE-ADC', 'laning');
  assert.equal(laning.data!.scrimGames, 0);
  assert.doesNotMatch(laning.reason, /スクリム/);
  assert.doesNotMatch(laning.data!.confidenceReason, /スクリム/);
  assert.equal(laning.estimated, true, '14 分の値が無いレーン戦は事前値のまま');
  const none = axisOf(ratings, 'CC-MASTERS-TOP', 'ground');
  assert.doesNotMatch(none.reason, /スクリム/);
});

test('F-004 AC16: ピックプールはスクリムの使用チャンピオンを 1 試合(勝敗つき)として数え(重みは掛けない)、champion が null の行は数えない', () => {
  const { inputs } = f004Inputs([f004Scrim('40:00', 'DD CORE'), f004Scrim('35:00', 'DD CORE'), f004Scrim('30:00', 'LR CORE')]);
  const ratings = buildRatings(inputs, NOW2);
  const pool = axisOf(ratings, 'DD-CORE-ADC', 'pool');
  assert.equal(pool.estimated, false);
  assert.deepEqual(pool.data!.poolDetail?.list.map((c) => [c.championId, c.games]), [[804, 3]]);
  assert.ok(Math.abs((pool.data!.poolDetail?.list[0].winRate ?? 0) - (2 + 2.5) / (3 + 5)) < 1e-9, '2 勝 1 敗を事前 5 試合で縮小');
  const w = 0.5 ** (1 / 45);
  assert.ok(Math.abs(pool.data!.effectiveGames - 3 * w) < 1e-6, 'ピックプールの有効な試合数には scrimGameWeight を掛けない');
  assert.equal(pool.data!.scrimGames, 3);
  const jg = axisOf(ratings, 'DD-CORE-JG', 'pool');
  assert.equal(jg.estimated, true, 'champion が null の行は試合の数にも数えない');
  assert.equal(jg.data!.effectiveGames, 0);
  assert.equal(jg.data!.scrimGames, 0);
});

test('F-004 AC17: スクリムの文字起こしの根拠は speakerIdentified と時刻つきの URL が無ければ読まず警告し、読んだ根拠は確度「低」(確度の数に入れない)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f004-grounds-sc-'));
  writeFileSync(join(dir, 'tournament.json'), JSON.stringify({ kind: 'evidence-tournament', players: {} }));
  const item = (over: Record<string, unknown>) => ({ summary: '根拠', source: 'https://www.youtube.com/watch?v=AZbkNH5Z5-I&t=27865s', direction: '+', strength: '中', kind: 'player', collectedBy: 'human', ...over });
  writeFileSync(join(dir, 'shotcalling.json'), JSON.stringify({
    kind: 'evidence-shotcalling',
    players: { 'DD-CORE-ADC': { evidence: [
      item({ origin: 'scrim-transcript:2026-10-10', speakerIdentified: true }),
      item({ origin: 'scrim-transcript:2026-10-10' }),
      item({ origin: 'scrim-transcript:2026-10-10', speakerIdentified: true, source: 'https://www.youtube.com/watch?v=AZbkNH5Z5-I' }),
      item({ origin: 'video:2026-10-01', source: 'https://example.test/talk' }),
    ] } },
  }));
  const { inputs, errors, warnings } = loadRatingInputs({ rawDir: rawDir(), groundsDir: dir });
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 2, warnings.join('\n'));
  assert.ok(warnings.every((w) => w.includes('DD-CORE-ADC')));
  assert.ok(warnings.some((w) => /話者/.test(w)) && warnings.some((w) => /時刻/.test(w)), warnings.join('\n'));
  const sc = find(inputs.players, 'DD-CORE-ADC').shotcalling;
  assert.equal(sc.length, 2);
  const axis = axisOf(buildRatings(inputs, NOW2), 'DD-CORE-ADC', 'shotcalling');
  assert.equal(axis.base, 7, '肯定 中 2 件: 5.0 + 1.0 + 1.0');
  assert.equal(axis.confidence, '中', '人が確認した根拠は 1 件(スクリムの文字起こしは確度に数えない)');
  assert.match(axis.evidence!.confidenceReason, /スクリムの文字起こし/);
  const scrimItem = axis.evidence!.evidence.find((e) => e.source.includes('t=27865s'))!;
  assert.ok(scrimItem.marks.some((m) => /低/.test(m)), JSON.stringify(scrimItem.marks));
  assert.equal(scrimItem.used, true);
});

// F-009 Task-12: 受入基準 12(2026-10-11 の改訂: 国際大会の記録)・32(他の大会との重複の除外)
import { ROLE_OF } from '../../src/rating/build.ts';
import { loadEvidenceConfig, tournamentAxis } from '../../src/rating/evidence.ts';

test('基準12(改訂): career.json の lol.internationalEvents を出典つきで読み(出典は lol.statusSource、無ければ ref の行)、どちらも無い項目は数えずエラーに出す。大会経験の説明と根拠の一覧に出る', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f009-grounds-intl-'));
  const src = 'docs/research/players-dd-cc.md';
  writeFileSync(join(dir, 'shotcalling.json'), JSON.stringify({ kind: 'evidence-shotcalling', players: {} }));
  writeFileSync(join(dir, 'tournament.json'), JSON.stringify({
    kind: 'evidence-tournament',
    players: { 'DD-MASTERS-TOP': { ltk: [], coach: [], pro: [], other: [{ name: 'LCP 入れ替え戦 2025(QT DIG∞)', source: src }] } },
  }));
  const status = 'https://lol.fandom.com/wiki/Washidai ; https://x.com/Washidai_';
  writeFileSync(join(dir, 'career.json'), JSON.stringify({
    kind: 'evidence-career-normalized',
    players: {
      'DD-MASTERS-TOP': {
        peak: { allTime: null, thisSeason: null },
        lol: {
          highestLevel: 'LJL-starter', years: { 'LJL-starter': 5 }, basis: ['lolPro[0]'], statusSource: status,
          internationalEvents: [{ event: 'Asia Masters', year: 2025, ref: 'competitiveActivity[6]' }, { event: 'LCP P&R', year: 2025, ref: 'lolPro[4]' }],
        },
      },
      'DD-MASTERS-MID': {
        peak: { allTime: null, thisSeason: null },
        lol: { highestLevel: 'none', years: {}, basis: [], statusSource: null, internationalEvents: [{ event: 'IWCI', year: 2016, ref: 'lolPro[2]' }, { event: 'MSI', year: 2019 }] },
      },
    },
  }));
  const { inputs, errors } = loadRatingInputs({ rawDir: rawDir(), groundsDir: dir });
  const top = find(inputs.players, 'DD-MASTERS-TOP').tournament.international ?? [];
  assert.deepEqual(top.map((x) => [x.event, x.year, x.source]), [['Asia Masters', 2025, status], ['LCP P&R', 2025, status]]);
  // 出典(statusSource)が無ければ ref が指す経歴の記録の行。どちらも無い MSI 2019 は数えない
  const mid = find(inputs.players, 'DD-MASTERS-MID').tournament.international ?? [];
  assert.deepEqual(mid.map((x) => [x.event, x.year]), [['IWCI', 2016]]);
  assert.match(mid[0].source, /lolPro\[2\]/);
  assert.equal(errors.length, 1, errors.join('\n'));
  assert.ok(errors[0].includes('DD-MASTERS-MID') && errors[0].includes('国際大会'), errors[0]);
  // 記録に無い選手は空
  assert.deepEqual(find(inputs.players, 'CC-MASTERS-TOP').tournament.international ?? [], []);
  // 評価: プロ LJL 5 年 2.5 + 国際大会 2 件 1.0。他の大会「LCP 入れ替え戦 2025」は LCP P&R 2025 と同じ大会のため数えない(基準32)
  const ratings = buildRatings(inputs, NOW);
  const t = axisOf(ratings, 'DD-MASTERS-TOP', 'tournament');
  assert.equal(t.base, 5.5);
  assert.match(t.reason, /国際大会 2 件/);
  assert.match(t.reason, /国際大会の項で数えた/);
  assert.ok(t.evidence!.evidence.some((e) => e.text.includes('Asia Masters 2025') && e.source === status && e.used));
  assert.equal(axisOf(ratings, 'DD-MASTERS-MID', 'tournament').base, 2.5);
});

test('基準12・32 の計算の例(経歴の記録と出場記録の実データ): 改訂前の設定(上限 2.0・国際大会なし)との差は Ceros +1.5、わしだい +1.0、Enty +2.0、たぬき忍者 0。下がる選手はいない', () => {
  const { inputs, errors } = loadRatingInputs({ rawDir: rawDir(), groundsDir: 'docs/research/grounds/normalized' });
  assert.deepEqual(errors, []);
  const cfg = loadEvidenceConfig().tournament;
  const delta = (p: PlayerRatingInput) => {
    const role = ROLE_OF[p.position];
    const after = tournamentAxis(p.tournament, cfg, role).score;
    const before = tournamentAxis({ ...p.tournament, international: [] }, { ...cfg, proMax: 2 }, role).score;
    return Math.round((after - before) * 100) / 100;
  };
  const of = (id: string) => delta(find(inputs.players, id));
  assert.equal(of('CC-MASTERS-MID'), 1.5, 'Ceros: プロ +1.0、国際大会 7 件 +1.0、他の大会「Worlds 2018(DFM)」−0.5');
  assert.equal(of('DD-MASTERS-TOP'), 1.0, 'わしだい: プロ +0.5、国際大会 2 件 +1.0、他の大会「LCP 入れ替え戦 2025」−0.5');
  assert.equal(of('IT-MASTERS-SUP'), 2.0, 'Enty: プロ +1.0、国際大会 5 件 +1.0');
  assert.equal(of('DD-MASTERS-MID'), 0, 'たぬき忍者: LJL CS 1 年、国際大会 0 件');
  for (const p of inputs.players) assert.ok(delta(p) >= 0, `${p.name} ${delta(p)}`);
  // 国際大会の記録は全項目に出典がある
  for (const p of inputs.players) for (const e of p.tournament.international ?? []) assert.ok(e.source.length > 0, `${p.name} ${e.event}`);
  assert.equal(find(inputs.players, 'CC-MASTERS-MID').tournament.international?.length, 7);
});

// F-009 Task-13: 受入基準 6(2026-10-11 の追記)・33〜36(到達点からのブランク)。計算の基準日は仕様の計算の例と同じ 2026-10-11
import { blankInfo, loadEngineConfig } from '../../src/rating/engine.ts';
import { readReachedAt } from '../../src/rating/evidence.ts';
import type { GameRecord } from '../../src/rating/types.ts';

const NOW13 = Date.parse('2026-10-11T00:00:00Z');

test('用語(到達の時点の読み方): 西暦 4 桁の年(年・年月・年月日)と S<n>(n は 1〜20。2010 + n 年)を拾い、最も遅い日付を採る。どちらも無ければ不明', () => {
  // 仕様の 4 つの形
  assert.equal(readReachedAt('2019'), '2019');
  assert.equal(readReachedAt('2024-01'), '2024-01');
  assert.equal(readReachedAt('2026年9月'), '2026-09');
  assert.equal(readReachedAt('2020-02-15'), '2020-02-15');
  // S<n> は 2010 + n 年。n は 1〜20
  assert.equal(readReachedAt('S6'), '2016');
  assert.equal(readReachedAt('S1'), '2011');
  assert.equal(readReachedAt('S20'), '2030');
  assert.equal(readReachedAt('S21'), null);
  assert.equal(readReachedAt('S0'), null);
  // S2026 は S<n> ではなく西暦の年
  assert.equal(readReachedAt('S2026'), '2026');
  // 最も遅い日付を採る(年だけは 7 月 1 日として比べる)
  assert.equal(readReachedAt('2018(S8)・2025'), '2025');
  assert.equal(readReachedAt('2026-03-16 に到達。2026 にも'), '2026');
  assert.equal(readReachedAt('2026。2026-10-08 に再到達'), '2026-10-08');
  assert.equal(readReachedAt('2025-12 と 2026-02-03'), '2026-02-03');
  // 日付の無い記述、文字列でない値は不明
  assert.equal(readReachedAt('未確認(NA から JP サーバーへ移った後)'), null);
  assert.equal(readReachedAt(''), null);
  assert.equal(readReachedAt(null), null);
  assert.equal(readReachedAt(undefined), null);
});

/** 経歴の記録の peak.allTime.when(2026-10-11 の時点の 59 件)と、仕様の読み方で手で読んだ到達の時点 */
const WHEN_59: [string, string, string | null][] = [
  ['わしだい', '2026(日本サーバー1位の到達は 2026-02-02 の本人の投稿)', '2026'],
  ['しゃるる', 'S9(2019)。本人は S7・S8・S9・S10(2017〜2020)の到達を申告', '2020'],
  ['たぬき忍者', '2026(今季)。ほかに S7・S8 の終了時、2020-07、2022-02 にも Challenger', '2026'],
  ['Day1', '2018(S8)・2025', '2025'],
  ['hetel', '2026', '2026'],
  ['酒寄颯馬', '2026年(スプリットは未特定。Wiki の確認では 2026-09-16(Split 3)に E1)', '2026-09-16'],
  ['きなこ', '2026-05-03', '2026-05-03'],
  ['スタンミじゃぱん', '2026-07-22 初到達(7回目の昇格戦)', '2026-07-22'],
  ['じゃすぱー', 'JP サーバー。2024-05 以前に ADC で初到達、2024-11〜12 頃に再到達', '2024-11'],
  ['神楽めあ', '2025-05-01 初到達。2026年に今季最高 274LP', '2026'],
  ['SHAKA', '2026(S2026。4月にまざー3とのデュオでエメラルド昇格)', '2026'],
  ['まざー3', '2026(S2026。4月に SHAKA とのデュオでエメラルド昇格)', '2026'],
  ['天ノ川ねる', '2026(S2026。3月にエメラルド昇格)', '2026'],
  ['夢野あかり', '2026(2026 Season 2)', '2026'],
  ['白波らむね', '2026 Season 1(3/4 プラチナ到達、4/10 にプラチナ2)', '2026'],
  ['Yutapon', 'NA S3(2013)に到達との記述あり。LP 最大は S2026', '2026'],
  ['Rainbrain', 'S2026(今季の最高)と S2024 S2(終了時)', '2026'],
  ['Ceros', 'S2026。S2025・S2024 S2・S2024 S1 の終了時も Master', '2026'],
  ['Yuhi', 'S2026。2023-1・2024-2 もシーズン終了時 Challenger', '2026'],
  ['Nemoh', 'KR で 2020 シーズンに到達(本人のインタビュー)。JP は op.gg で S2023 S2・S2024 S2・S2024 S3・S2025 の終了時 Master(S2024 S1 は D1 40)', '2025'],
  ['YUKIO(ゆきお)', 'S2026(147LP到達日は未確認。マスター初到達は 2026-05-01 公開の切り抜きの直前)', '2026'],
  ['k4sen', 'S2023 S2(2024-01 初ダイヤ到達)', '2024-01'],
  ['葛葉', 'S2023 S2、S2026 に並ぶ', '2026'],
  ['龍巻ちせ', '2025年頃(デビュー前)', '2025'],
  ['昏昏アリア', 'S2026(到達日未確認。2026-04-27 時点は D1)', '2026'],
  ['叶', '2026年9月ごろ(Wiki の 9/4 確認でエメラルド4)', '2026-09'],
  ['ゆふな', '2026年(10/8 より前)', '2026'],
  ['空澄セナ', '2026年9月下旬ごろ', '2026-09'],
  ['獅子堂あかり', '2026-10-08〜10', '2026-10-08'],
  ['鷹宮リオン', '2026-03-16', '2026-03-16'],
  ['らいじん', '未確認(NA から JP サーバーへ移った後)', null],
  ['ゆにか', 'S2026', '2026'],
  ['Eugeo', '初到達はプロ入り前の JG(エリス)期(本人談)', null],
  ['Zerost', 'S2026(下限。プロ時代の最高は未確認)', '2026'],
  ['Enty(えんてぃ)', 'S6(2016)', '2016'],
  ['mittiii', '2026 シーズン(期中の最高)', '2026'],
  ['AlphaAzur', '2026 シーズン(期中の最高)', '2026'],
  ['たかやスペシャル', 'LP の最高は 2026 シーズン。初の Master は 2017(S7、日本サーバー)', '2026'],
  ['ごんかね', '2026 シーズン(初の Master 到達は 2026-03 ごろ)', '2026'],
  ['橘ひなの', '2025-08-03 の週報で初めて自己最高 P2(その週のうちに到達。08-04 の日報にも P3→P2)。2026 シーズンにも P2 25LP(到達日は未確認)', '2026'],
  ['ありけん', '2026-03 上旬(03-02 に G4→G3 で自己最高。G2 96LP は op.gg の今季最高)', '2026-03'],
  ['まいたけ', '2026 シーズン(05-17 週に G1、05-24 週に P4。P3 の到達日は未確認)', '2026'],
  ['天帝フォルテ', '2026-04-26 前後(P1→E4 で自己最高更新)', '2026-04-26'],
  ['白那しずく', '2026-05 下旬(05-31 の週報で自己最高 P2)', '2026-05'],
  ['apaMEN', '2026 シーズン(今季の最高。op.gg の Top tier 表示、2026-10-11 取得。同じアカウントの過去シーズン末は S2023 S2 の Diamond 2 が最高)', '2026-10-11'],
  ['ねすてぃー / Nesty', '2026 シーズン(今季の最高。op.gg の Top tier 表示、2026-10-11 取得。同じアカウントの過去シーズン末は S2024 S1 の Master 318 が最高)', '2026-10-11'],
  ['Recap', '2026 シーズン(今季の最高。op.gg の Top tier 表示、2026-10-11 取得。同じアカウントの過去シーズン末は S2023 S2 の Challenger 1012 が最高)', '2026-10-11'],
  ['ハレっち / Haretti', '2020-02 以前(時期は未確認。調査員は op.gg で S8(2018)の 276LP と読んだ)', '2020-02'],
  ['てぃんとん / ThintoN', '2026 シーズン(今季の最高。op.gg の Top tier 表示、2026-10-11 取得。同じアカウントの過去シーズン末は S2023 S2 の Grandmaster 693・S2024 S2 の Grandmaster 685)', '2026-10-11'],
  ['焼きパン', '初到達は 2025-07-27〜08-03 の週。2026-05-10〜17 の週に再到達', '2026-05-10'],
  ['Killin9Hit', '2026年(2025年にも E4 に到達。LP 未確認)', '2026'],
  ['乾伸一郎', '2024年スプリット1', '2024'],
  ['大御所にゅん子', '2026年(週報では 2026-08-23 に M1。6〜7月に一度到達した可能性)', '2026-08-23'],
  ['千燈ゆうひ', '2025-07-28(初到達)', '2025-07-28'],
  ['狐白うる', 'S2026', '2026'],
  ['アステル・レダ', 'S2026(今季の最高。op.gg の Top tier 表示、2026-10-11 取得。同じアカウントの過去シーズン末は S2025 の Gold 4 が最高)', '2026-10-11'],
  ['春茶', 'S2026', '2026'],
  ['なぎさっち', 'S2026(初エメラルド 2025-01-24)', '2026'],
  ['No.1005(とおこ)', 'S2026(ソロ)', '2026'],
];

test('用語(到達の時点の読み方): 経歴の記録の when 59 件を読む。年を読めないのは 2 件(らいじん・Eugeo)、ブランクの減衰が掛かる(基準日の 1 年前より前)のは 10 件', () => {
  assert.equal(WHEN_59.length, 59);
  for (const [name, when, expected] of WHEN_59) assert.equal(readReachedAt(when), expected, `${name}: ${when}`);
  assert.deepEqual(WHEN_59.filter(([, , at]) => at === null).map(([name]) => name), ['らいじん', 'Eugeo']);
  const cfg = loadEngineConfig();
  const decayed = WHEN_59.filter(([, , at]) => blankInfo(at, NOW13, cfg).decay > 0).map(([name, , at]) => `${name} ${at}`);
  assert.deepEqual(decayed, [
    'しゃるる 2020', 'Day1 2025', 'じゃすぱー 2024-11', 'Nemoh 2025', 'k4sen 2024-01', '龍巻ちせ 2025',
    'Enty(えんてぃ) 2016', 'ハレっち / Haretti 2020-02', '乾伸一郎 2024', '千燈ゆうひ 2025-07-28',
  ]);
});

test('基準33・34 の入力: career.json の peak.allTime.when から到達の時点、lol.lastCompetitiveYear から最終出場年を読む。読めなければ欄を持たない(不明)。今季の最高ランクには付けない', () => {
  const career = {
    kind: 'evidence-career-normalized',
    players: {
      'DD-MASTERS-TOP': {
        peak: {
          allTime: { tier: 'Challenger', division: null, lp: null, when: 'S6(2016)', source: 'https://example.test/opgg/top' },
          thisSeason: { tier: 'Diamond', division: 2, lp: 65, when: '2026', source: 'https://example.test/opgg/top' },
        },
        lol: { highestLevel: 'LJL-starter', years: { 'LJL-starter': 10 }, lastCompetitiveYear: 2025, basis: ['lolPro[0]'], statusSource: 'https://example.test/wiki/top' },
      },
      'DD-MASTERS-JG': {
        peak: {
          allTime: { tier: 'Challenger', division: null, lp: 1185, when: '初到達はプロ入り前の JG(エリス)期(本人談)', source: 'https://example.test/opgg/jg' },
          thisSeason: { tier: 'Challenger', division: null, lp: 1185, when: '2026', source: 'https://example.test/opgg/jg' },
        },
        lol: { highestLevel: 'LJL CS-starter', years: { 'LJL CS-starter': 1 }, basis: ['lolPro[0]'], statusSource: 'https://example.test/wiki/jg' },
      },
      'DD-MASTERS-MID': {
        peak: { allTime: { tier: 'Diamond', division: 4, lp: 24, source: 'https://example.test/opgg/mid' }, thisSeason: null },
        lol: { highestLevel: 'none', years: {}, lastCompetitiveYear: null, basis: [], statusSource: null },
      },
    },
  };
  const { inputs, errors } = loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds(career) });
  assert.deepEqual(errors, []);
  const top = find(inputs.players, 'DD-MASTERS-TOP');
  assert.equal(top.peakRank?.reachedAt, '2016');
  assert.equal(top.exPro?.lastYear, 2025);
  assert.equal(top.seasonPeakRank?.reachedAt, undefined, '今季の最高ランクは減衰しないため到達の時点を持たない');
  // 年を読めない when・最終出場年の無い経歴は、欄を持たない(不明)
  const jg = find(inputs.players, 'DD-MASTERS-JG');
  assert.ok(jg.peakRank && !('reachedAt' in jg.peakRank));
  assert.ok(jg.exPro && !('lastYear' in jg.exPro));
  // when の無い記録も不明
  const mid = find(inputs.players, 'DD-MASTERS-MID');
  assert.ok(mid.peakRank && !('reachedAt' in mid.peakRank));
});

const p13 = (id: string, extra: Partial<PlayerRatingInput>): PlayerRatingInput => ({
  playerId: id, name: id, tier: 'MASTERS', position: 'MIDDLE', rank: null, games: [], league: [], shotcalling: [],
  tournament: { ltk: [], coach: [], pro: [], other: [] }, ...extra,
});
const DATA_KEYS = ['ground', 'laning', 'teamfight', 'synergy', 'stability', 'pool'];

test('基準33・34・36 の計算の例(仕様): Ceros 8.78(最高ランク)、Enty 9.92(元プロの下限)、たぬき忍者 10.00(最高ランク)、わしだい 10.00(ソロランク)。6 軸で同じ基準と説明', () => {
  const src = 'https://example.test/src';
  const players = [
    p13('CEROS', {
      rank: { tier: 'MASTER', division: 'I', lp: 232 },
      peakRank: { tier: 'Master', division: '', lp: 584, source: src, reachedAt: '2026' },
      seasonPeakRank: { tier: 'Master', division: '', lp: 584, source: src },
      exPro: { level: 'LJL-starter', source: src, years: 9, lastYear: 2021 },
    }),
    p13('ENTY', {
      rank: { tier: 'DIAMOND', division: 'II', lp: 65 },
      peakRank: { tier: 'Challenger', division: '', lp: 0, source: src, reachedAt: '2016' },
      seasonPeakRank: { tier: 'Diamond', division: 'II', lp: 65, source: src },
      exPro: { level: 'LJL-starter', source: src, years: 10, lastYear: 2025 },
    }),
    p13('TANUKI', {
      rank: { tier: 'GRANDMASTER', division: 'I', lp: 700 },
      peakRank: { tier: 'Challenger', division: '', lp: 1580, source: src, reachedAt: '2026' },
      seasonPeakRank: { tier: 'Challenger', division: '', lp: 1580, source: src },
      exPro: { level: 'LJL CS-starter', source: src, years: 1 },
    }),
    p13('WASHIDAI', {
      rank: { tier: 'CHALLENGER', division: 'I', lp: 1883 },
      peakRank: { tier: 'Challenger', division: '', lp: 1883, source: src, reachedAt: '2026' },
      seasonPeakRank: { tier: 'Challenger', division: '', lp: 1883, source: src },
      exPro: { level: 'LJL-starter', source: src, years: 5, lastYear: 2025 },
    }),
  ];
  const ratings = buildRatings({ players, matches: [] }, NOW13);
  const expected: Record<string, RegExp> = {
    CEROS: /^ランクの基準 8\.78\(最高ランク: Master 584LP。出典: https:\/\/example\.test\/src。到達 2026、ブランク 0\.3 年、−0\.00\)/,
    ENTY: /^ランクの基準 9\.92\(元プロの下限: LJL-starter。出典: https:\/\/example\.test\/src。到達 2025、ブランク 1\.3 年、−0\.08/,
    TANUKI: /^ランクの基準 10\.00\(最高ランク: Challenger 1580LP。出典: https:\/\/example\.test\/src。到達 2026、ブランク 0\.3 年、−0\.00\)/,
    WASHIDAI: /^ランクの基準 10\.00\(ソロランク\)/,
  };
  for (const [id, re] of Object.entries(expected)) {
    for (const key of DATA_KEYS) assert.match(axisOf(ratings, id, key).reason, re, `${id} ${key}`);
  }
  // 不明な下限(たぬき忍者の LJL CS、最終出場年なし)は採られないので、印は付かない
  assert.doesNotMatch(axisOf(ratings, 'TANUKI', 'ground').reason, /到達の時点が不明/);
});

/** データの軸が推定にならない試合の記録(大会のロールで同じチャンピオンを 20 試合) */
const games13 = (): GameRecord[] => Array.from({ length: 20 }, (_, i) => ({
  matchId: `B13-${i}`, endTime: NOW13 - 86_400_000, durationMin: 30, queueId: 420, position: 'MIDDLE',
  me: { championId: 103, win: i % 2, deaths: 4, totalDamageDealtToChampions: 20000, goldPerMinute: 400 },
  opp: { deaths: 4, totalDamageDealtToChampions: 20000, goldPerMinute: 400 },
}));

test('基準35: 到達の時点が不明な記録をランクの基準に採ると、説明に「到達の時点が不明(減衰なし)」の印が付き、データの 6 軸(ピックプールを含む)の確度が 1 段下がる', () => {
  const src = 'https://example.test/src';
  const gold = { tier: 'GOLD', division: 'IV', lp: 0 };
  const peak = { tier: 'Master', division: '', lp: 120, source: src };
  const players = [
    p13('KNOWN', { rank: gold, games: games13(), peakRank: { ...peak, reachedAt: '2026' } }),
    p13('UNKNOWN', { rank: gold, games: games13(), peakRank: peak }),
    p13('FLOOR-UNKNOWN', { rank: gold, games: games13(), exPro: { level: 'LJL-sub', source: src } }),
    p13('NOT-ADOPTED', { rank: { tier: 'CHALLENGER', division: 'I', lp: 900 }, games: games13(), peakRank: peak }),
  ];
  const ratings = buildRatings({ players, matches: [] }, NOW13);
  const down = (c: string) => (c === '高' ? '中' : '低');
  let notEstimated = 0;
  for (const key of DATA_KEYS) {
    const known = axisOf(ratings, 'KNOWN', key);
    assert.match(known.reason, /^ランクの基準 8\.16\(最高ランク: Master 120LP。出典: https:\/\/example\.test\/src。到達 2026、ブランク 0\.3 年、−0\.00\)/, key);
    const unknown = axisOf(ratings, 'UNKNOWN', key);
    assert.match(unknown.reason, /^ランクの基準 8\.16\(最高ランク: Master 120LP。出典: https:\/\/example\.test\/src。到達の時点が不明\(減衰なし\)\)/, key);
    const floor = axisOf(ratings, 'FLOOR-UNKNOWN', key);
    assert.match(floor.reason, /^ランクの基準 8\.00\(元プロの下限: LJL-sub。出典: https:\/\/example\.test\/src。到達の時点が不明\(減衰なし\)\)/, key);
    const notAdopted = axisOf(ratings, 'NOT-ADOPTED', key);
    assert.match(notAdopted.reason, /^ランクの基準 9\.20\(ソロランク\)/, key);
    assert.equal(known.estimated, unknown.estimated, key);
    if (known.estimated) continue;
    notEstimated += 1;
    // 不明な記録を採った選手は、同じ試合の記録で到達の時点が分かる選手より 1 段低い。採らなければ下がらない
    assert.equal(unknown.confidence, down(known.confidence), `${key}: ${known.confidence} → ${unknown.confidence}`);
    assert.equal(unknown.data!.confidence, unknown.confidence, key);
    assert.match(unknown.data!.confidenceReason, /到達の時点が不明/, key);
    assert.equal(floor.confidence, down(known.confidence), key);
    assert.equal(notAdopted.confidence, known.confidence, key);
    assert.doesNotMatch(known.data!.confidenceReason, /到達の時点が不明/, key);
    assert.doesNotMatch(notAdopted.data!.confidenceReason, /到達の時点が不明/, key);
  }
  assert.ok(notEstimated >= 2, `推定でない軸 ${notEstimated}`);
  assert.equal(axisOf(ratings, 'KNOWN', 'ground').confidence, '高');
  assert.equal(axisOf(ratings, 'UNKNOWN', 'ground').confidence, '中');
  assert.equal(axisOf(ratings, 'KNOWN', 'pool').estimated, false);
  assert.equal(axisOf(ratings, 'KNOWN', 'pool').confidence, '高');
  assert.equal(axisOf(ratings, 'UNKNOWN', 'pool').confidence, '中');
});

test('基準33〜36(経歴の記録の実データ): 到達の時点・最終出場年は読める形で入り、基準の説明は 6 軸で同じ', () => {
  const { inputs, errors } = loadRatingInputs({ rawDir: rawDir(), groundsDir: 'docs/research/grounds/normalized' });
  assert.deepEqual(errors, []);
  for (const p of inputs.players) {
    if (p.peakRank?.reachedAt !== undefined) assert.match(p.peakRank.reachedAt, /^\d{4}(-\d{2}(-\d{2})?)?$/, p.name);
    if (p.exPro?.lastYear !== undefined) assert.ok(Number.isInteger(p.exPro.lastYear) && p.exPro.lastYear >= 2009 && p.exPro.lastYear <= 2099,`${p.name} ${p.exPro.lastYear}`);
    assert.equal(p.seasonPeakRank?.reachedAt, undefined, p.name);
  }
  const ratings = buildRatings(inputs, NOW13);
  for (const r of ratings) {
    const anchorText = (key: string) => r.axes.find((a) => a.key === key)!.reason.split('。補正')[0];
    for (const key of DATA_KEYS) assert.equal(anchorText(key), anchorText('ground'), `${r.name} ${key}`);
    // 歴代の最高ランクまたは元プロの下限を採った選手は、到達・ブランク・減衰か、不明の印のどちらかを示す(基準 36・35)
    const g = r.axes.find((a) => a.key === 'ground')!;
    if (g.data!.anchorSource === '最高ランク' || g.data!.anchorSource === '元プロの下限') {
      assert.match(g.reason, /到達 \d{4}(-\d{2}(-\d{2})?)?、ブランク \d+\.\d 年、−\d+\.\d\d|到達の時点が不明\(減衰なし\)/,`${r.name}: ${g.reason}`);
    } else {
      assert.doesNotMatch(g.reason.split('。補正')[0], /ブランク|到達の時点が不明/, r.name);
    }
  }
});

// F-004 Task-12: 受入基準 41(本番の試合の記録を評価の入力へ。調子の係数とピックプールの数え方)・42(重み officialGameWeight と説明の文)・40(組の数の出力)。受入基準から書いた
const NOW3 = Date.parse('2026-10-16T03:00:00Z');
const URL_X = { url: 'https://www.youtube.com/watch?v=x' };
const nextTeams = (winner: 'CC NEXT' | 'DD NEXT'): Row => ({ 'CC NEXT': f004Team('CC NEXT', winner === 'CC NEXT' ? 3 : 1), 'DD NEXT': f004Team('DD NEXT', winner === 'DD NEXT' ? 3 : 1) });
const nextScrim = (duration: string, winner: 'CC NEXT' | 'DD NEXT'): Row => ({ kind: 'scrim', date: '2026-10-10', listeners: false, source: URL_X, duration, winner, teams: nextTeams(winner) });
/** Regular Stage 1 日目の NEXT の CC NEXT 対 DD NEXT(試合 ID RS-1-CC-DD-NEXT)。2026-10-15 正午(JST)は NOW3 の 1 日前 */
const nextOfficial = (winner: 'CC NEXT' | 'DD NEXT', over: Row = {}): Row => ({
  kind: 'official', date: '2026-10-15', stage: 'regular', day: 1, tier: 'NEXT', match: null, game: 1, listeners: false, source: URL_X, duration: '40:00', winner, teams: nextTeams(winner), ...over,
});
const nextInputs = (scrims: Row[], officials: Row[]) => {
  const files = [
    ...(scrims.length ? [{ file: '2026-10-10-cc-next-vs-dd-next.json', kind: 'scrim' as const, raw: scrims }] : []),
    ...(officials.length ? [{ file: '2026-10-15-cc-next-vs-dd-next.json', kind: 'official' as const, raw: officials }] : []),
  ];
  const r = collectResults(files, { champions: F004_CHAMPS });
  assert.deepEqual(r.errors, []);
  return loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds(), scrims: r.games });
};

test('F-004 AC41/AC42: 本番の試合の記録を games に足し、軸の説明と確度の理由に「本番 n 試合(重み 4.0)を含む」。有効な試合数は 4.0 倍。調子の係数には数えない', () => {
  const { inputs, errors } = nextInputs([], [nextOfficial('DD NEXT')]);
  assert.deepEqual(errors, []);
  const adc = find(inputs.players, 'DD-NEXT-ADC');
  assert.equal(adc.games.length, 1);
  assert.ok(adc.games.every((g) => g.kind === 'official' && g.queueId === 0 && g.position === 'BOTTOM'));
  assert.equal(inputs.matches.length, 0, '本番は母集団(matches)に入れない');
  const ratings = buildRatings(inputs, NOW3);
  const ground = axisOf(ratings, 'DD-NEXT-ADC', 'ground');
  assert.match(ground.reason, /本番 1 試合\(重み 4\.0\)を含む/);
  assert.match(ground.data!.confidenceReason, /本番 1 試合\(重み 4\.0\)を含む/);
  assert.doesNotMatch(ground.reason, /スクリム/);
  assert.equal(ground.data!.officialGames, 1);
  const w1 = 0.5 ** (1 / 45); // 2026-10-15 正午(JST)から基準日まで 1 日
  assert.ok(Math.abs(ground.data!.effectiveGames - 4 * w1) < 1e-6, `有効な試合数 ${ground.data!.effectiveGames}`);
  // 14 分の CS の無い試合はレーン戦に使われず、文を出さない(基準27)
  const laning = axisOf(ratings, 'DD-NEXT-ADC', 'laning');
  assert.equal(laning.data!.officialGames, 0);
  assert.doesNotMatch(laning.reason, /本番/);
  assert.doesNotMatch(axisOf(ratings, 'CC-MASTERS-TOP', 'ground').reason, /本番/);
  // 基準14: 調子の係数(キュー 420・440)に本番の試合を使わない
  assert.equal(ratings.find((r) => r.playerId === 'DD-NEXT-ADC')!.form.games, 0);
});

test('F-004 AC41(基準16): ピックプールは本番の使用チャンピオンを 1 試合(勝敗つき)として数え、officialGameWeight を掛けない', () => {
  // スクリム 3 試合(DD NEXT の 2 勝 1 敗)+ 本番 1 試合(DD NEXT の勝ち)。ユナラ(804)4 試合 3 勝
  const { inputs } = nextInputs([nextScrim('40:00', 'DD NEXT'), nextScrim('35:00', 'DD NEXT'), nextScrim('30:00', 'CC NEXT')], [nextOfficial('DD NEXT')]);
  const ratings = buildRatings(inputs, NOW3);
  const pool = axisOf(ratings, 'DD-NEXT-ADC', 'pool');
  assert.equal(pool.estimated, false);
  assert.deepEqual(pool.data!.poolDetail?.list.map((c) => [c.championId, c.games]), [[804, 4]]);
  // 3 勝 1 敗を事前 5 試合で縮小: (3 + 2.5) ÷ (4 + 5) = 0.6111
  assert.ok(Math.abs((pool.data!.poolDetail?.list[0].winRate ?? 0) - 5.5 / 9) < 1e-9);
  // 有効な試合数: スクリム 3 × 0.5^(6/45)(10-10 正午から 6 日)+ 本番 1 × 0.5^(1/45)。重みは掛けない
  const expected = 3 * 0.5 ** (6 / 45) + 0.5 ** (1 / 45);
  assert.ok(Math.abs(pool.data!.effectiveGames - expected) < 1e-6, `${pool.data!.effectiveGames} vs ${expected}`);
  assert.deepEqual([pool.data!.scrimGames, pool.data!.officialGames], [3, 1]);
  assert.match(pool.reason, /本番 1 試合\(重み 1\.0\)を含む/);
  // champion が null の行(JG)は数えない
  assert.equal(axisOf(ratings, 'DD-NEXT-JG', 'pool').data!.officialGames, 0);
});

test('F-004 AC40: csAt14 の組の数が下限に満たないロールと組の数を、評価の入力の警告に出す。実戦の記録が無ければ出さない', () => {
  const rec = nextOfficial('DD NEXT', { cs14Sec: 840 });
  const t = rec.teams as Record<string, { players: Row[] }>;
  t['CC NEXT'].players[0].cs14 = 100;
  t['DD NEXT'].players[0].cs14 = 90;
  const { warnings } = nextInputs([], [rec]);
  const cs = warnings.filter((w) => w.includes('csAt14'));
  // TOP 1 組・JUNGLE・MIDDLE・BOTTOM 0 組(下限 8)
  assert.ok(cs.some((w) => /TOP/.test(w) && /1 組/.test(w)), cs.join('\n'));
  assert.ok(cs.some((w) => /JUNGLE/.test(w) && /0 組/.test(w)), cs.join('\n'));
  assert.equal(cs.filter((w) => /UTILITY/.test(w)).length, 0, 'SUP は分布を作らない');
  assert.deepEqual(loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds() }).warnings.filter((w) => w.includes('csAt14')), []);
});
