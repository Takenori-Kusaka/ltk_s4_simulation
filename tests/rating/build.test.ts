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
  assert.match(reason('EX'), /ランクの基準 8\.00\(元プロの下限: LJL-sub。出典: https:\/\/example\.test\/wiki\/A\)/);
  assert.match(reason('PK'), /ランクの基準 8\.16\(最高ランク: Master 120LP。出典: https:\/\/example\.test\/opgg\/pk\)/);
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
  const real = loadResults({ root: 'docs/research/grounds', champions: null });
  const { inputs, errors } = loadRatingInputs({ rawDir: rawDir(), groundsDir: grounds(), scrims: real.games.filter((g) => g.file === SCRIM_FILE) });
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
