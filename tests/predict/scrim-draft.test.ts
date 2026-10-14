// F-006 Task-6: 受入基準 13(相手からの BAN 数 b・スクリムの試合数 n_s・順のある試合数 n_o と、予想の出力の scrimDraft)。実装を読まずに受入基準から書いた
// 固定の記録は、LTKDB の 2026-10-14 の BP詳細の 3 つの形(順のある 20 手・順の無い BAN と PICK・PICK だけ)と NOBAN(BAN しなかった枠)を写した結果だけの記録
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectResults } from '../../src/results/load.ts';
import { readChampionList } from '../../src/results/champions.ts';
import { scrimDraftByTeam, scrimDraftOf } from '../../src/predict/scrim-draft.ts';
import { nextDraftForecast } from '../../src/predict/next-draft.ts';
import { main } from '../../src/collect/aggregate-cli.ts';
import type { MetaGuide } from '../../src/meta/load.ts';

type Row = Record<string, unknown>;
const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'] as const;
/** Data Dragon の ID → [日本語名, key] */
const CHAMPS: Record<string, [string, number]> = {
  Ahri: ['アーリ', 103], LeeSin: ['リー・シン', 64], Yorick: ['ヨリック', 83], Pantheon: ['パンテオン', 80], Akali: ['アカリ', 84],
  Yunara: ['ユナラ', 804], Lulu: ['ルル', 117], Garen: ['ガレン', 86], Jinx: ['ジンクス', 222], Sona: ['ソナ', 37],
};
const NAMES = Object.fromEntries(Object.entries(CHAMPS).map(([id, [name]]) => [id, name]));
const KEYS = Object.fromEntries(Object.entries(CHAMPS).map(([id, [, key]]) => [id, String(key)]));
const LIST = readChampionList({ version: 'test', champions: NAMES, keys: KEYS }).list!;
/** 1 つ目のチームのピック(TOP〜SUP)と 2 つ目のチームのピック */
const SET1 = ['ヨリック', 'パンテオン', 'アカリ', 'ユナラ', 'ルル'];
const SET2 = ['ガレン', 'リー・シン', 'アーリ', 'ジンクス', 'ソナ'];

/** draft: a の BAN、b の BAN、a の 5 PICK、b の 5 PICK の順。ordered なら order は 1 から、そうでなければすべて null */
const draft = (a: string, aBans: (string | null)[], b: string, bBans: (string | null)[], ordered: boolean): Row[] => {
  const rows: Row[] = [
    ...aBans.map((champion) => ({ team: a, type: 'BAN', champion, role: null })),
    ...bBans.map((champion) => ({ team: b, type: 'BAN', champion, role: null })),
    ...ROLES.map((role, i) => ({ team: a, type: 'PICK', champion: SET1[i], role })),
    ...ROLES.map((role, i) => ({ team: b, type: 'PICK', champion: SET2[i], role })),
  ];
  return rows.map((x, i) => ({ order: ordered ? i + 1 : null, ...x }));
};
const LTKDB = 'https://demo-lab0110.github.io/ltk-schedule-status-site/';
const rec = (a: string, b: string, game: number, d: Row[] | undefined, over: Row = {}): Row => ({
  kind: 'scrim', resultOnly: true, date: '2026-10-10', game, listeners: false, source: { url: LTKDB }, winner: a, teams: { [a]: {}, [b]: {} },
  ...(d ? { draft: d } : {}), ...over,
});
const CC = 'CC NEXT';
const DD = 'DD NEXT';
const IT = 'IT NEXT';
const RECORDS: Row[] = [
  // G1 順のある 20 手の形: CC が アーリ と NOBAN、DD が ヨリック と アカリ を BAN
  rec(CC, DD, 1, draft(CC, ['アーリ', null], DD, ['ヨリック', 'アカリ'], true)),
  // G2 順のある形: CC が アーリ・リー・シン、DD が ヨリック と NOBAN
  rec(CC, DD, 2, draft(CC, ['アーリ', 'リー・シン'], DD, ['ヨリック', null], true)),
  // G3 順の無い BAN と PICK の形: CC が アーリ、DD が アカリ
  rec(CC, DD, 3, draft(CC, ['アーリ'], DD, ['アカリ'], false)),
  // G4 PICK だけの形(順あり)
  rec(CC, DD, 4, draft(CC, [], DD, [], true)),
  // G5 draft の無い記録
  rec(CC, DD, 5, undefined),
  // G6 リスナー参加: CC が アーリ を BAN しても数えない
  rec(CC, DD, 6, draft(CC, ['アーリ'], DD, ['アカリ'], true), { listeners: true }),
];
const RECORDS_IT: Row[] = [
  // IT 対 DD の順の無い形: IT が ヨリック を BAN、DD は BAN しない
  rec(IT, DD, 1, draft(IT, ['ヨリック'], DD, [], false), { date: '2026-10-11' }),
];
const loaded = () =>
  collectResults(
    [
      { file: '2026-10-10-cc-next-vs-dd-next.json', kind: 'scrim', raw: RECORDS },
      { file: '2026-10-11-it-next-vs-dd-next.json', kind: 'scrim', raw: RECORDS_IT },
    ],
    { champions: LIST },
  );

test('固定の記録は検証を通り、リスナー参加の 1 件だけが除かれる(前提)', () => {
  const r = loaded();
  assert.deepEqual(r.errors, []);
  assert.equal(r.games.length, 6);
  assert.deepEqual(r.excluded.map((x) => x.reason), ['リスナー参加']);
});

test('基準13: DD NEXT の b・n_s・n_o。PICK だけの記録は n_s に入らず、リスナー参加と null の BAN は数えない', () => {
  const s = scrimDraftOf(loaded().games, 'DD-NEXT', LIST)!;
  // n_s: BAN を含む draft = G1・G2・G3・IT 戦 = 4(G4 は PICK だけ、G5 は draft なし、G6 はリスナー参加)
  assert.equal(s.games, 4);
  // n_o: order が null でない draft = G1・G2・G4 = 3
  assert.equal(s.ordered, 3);
  // b: 相手の BAN。アーリ G1・G2・G3 = 3(G6 は数えない)、リー・シン G2 = 1、ヨリック IT 戦 = 1。G1 の NOBAN は数えない
  // 並びは回数の降順、同数は名前の文字コード順(ヨ U+30E8 < リ U+30EA)
  assert.deepEqual(s.bannedBy, [
    { champion: 'アーリ', championId: 103, count: 3 },
    { champion: 'ヨリック', championId: 83, count: 1 },
    { champion: 'リー・シン', championId: 64, count: 1 },
  ]);
});

test('基準13: CC NEXT の b・n_s・n_o(相手 DD の BAN だけを数え、自分の BAN は b に入れない)', () => {
  const s = scrimDraftOf(loaded().games, 'CC-NEXT', LIST)!;
  // n_s: G1・G2・G3 = 3、n_o: G1・G2・G4 = 3
  assert.equal(s.games, 3);
  assert.equal(s.ordered, 3);
  // b: DD の BAN。ヨリック G1・G2 = 2、アカリ G1・G3 = 2(G2 の NOBAN は数えない)。同数はア U+30A2 < ヨ
  assert.deepEqual(s.bannedBy, [
    { champion: 'アカリ', championId: 84, count: 2 },
    { champion: 'ヨリック', championId: 83, count: 2 },
  ]);
});

test('基準15 の材料: そのチームが BAN した回数と、順のある試合の最初のピック(PICK のうち order の最も小さいもの)', () => {
  const s = scrimDraftOf(loaded().games, 'DD-NEXT', LIST)!;
  // DD の BAN: ヨリック G1・G2 = 2、アカリ G1・G3 = 2(G6 はリスナー参加、IT 戦は BAN なし)
  assert.deepEqual(s.bans, [
    { champion: 'アカリ', championId: 84, count: 2 },
    { champion: 'ヨリック', championId: 83, count: 2 },
  ]);
  // 最初のピック: 順のある G1・G2・G4 で、DD の PICK の最初は TOP の ガレン(順の無い G3・IT 戦は数えない)
  assert.deepEqual(s.firstPicks, [{ champion: 'ガレン', championId: 86, count: 3 }]);
  assert.deepEqual(scrimDraftOf(loaded().games, 'CC-NEXT', LIST)!.firstPicks, [{ champion: 'ヨリック', championId: 83, count: 3 }]);
});

test('基準13: BAN を受けていない階級チームは b が空、draft を持つ記録の無い階級チームは null', () => {
  const games = loaded().games;
  const it = scrimDraftOf(games, 'IT-NEXT', LIST)!;
  // IT 戦の 1 試合: BAN を含む(IT の ヨリック)ので n_s = 1、順なしで n_o = 0、DD は BAN していない
  assert.deepEqual([it.games, it.ordered, it.bannedBy, it.firstPicks], [1, 0, [], []]);
  assert.equal(scrimDraftOf(games, 'LR-NEXT', LIST), null);
  assert.equal(scrimDraftOf(games, 'DD-CORE', LIST), null);
  // PICK だけの draft しか持たない階級チームは null ではなく n_s = 0
  const picksOnly = collectResults([{ file: '2026-10-10-cc-core-vs-dd-core.json', kind: 'scrim', raw: [rec('CC CORE', 'DD CORE', 1, draft('CC CORE', [], 'DD CORE', [], false))] }], { champions: LIST });
  assert.deepEqual(picksOnly.errors, []);
  const cc = scrimDraftOf(picksOnly.games, 'CC-CORE', LIST)!;
  assert.deepEqual([cc.games, cc.ordered, cc.bannedBy], [0, 0, []]);
});

test('基準13: 全階級チームの欄。チャンピオンの一覧に key が無ければ championId は null', () => {
  const all = scrimDraftByTeam(loaded().games, LIST);
  assert.equal(Object.keys(all).length, 12);
  assert.equal(all['DD-NEXT']!.games, 4);
  assert.equal(all['LR-NEXT'], null);
  const noKeys = readChampionList({ version: 'test', champions: NAMES }).list!;
  assert.deepEqual(scrimDraftOf(loaded().games, 'DD-NEXT', noKeys)!.bannedBy[0], { champion: 'アーリ', championId: null, count: 3 });
});

const guide = { kind: 'meta-guide', patch: '26.20', updatedAt: '2026-10-09', ddragonVersion: '16.20.1', idSource: 'x', basisLegend: {}, chapters: [], champions: [] } as unknown as MetaGuide;

test('基準13: 予想の出力(next-draft.json の形)の scrimDraft に階級チームごとの値を書く。渡されなければすべて null', () => {
  const sd = scrimDraftByTeam(loaded().games, LIST);
  const out = nextDraftForecast({ players: [] }, guide, undefined, sd);
  assert.equal(out.scrimDraft['DD-NEXT']!.games, 4);
  assert.equal(out.scrimDraft['LR-NEXT'], null);
  const none = nextDraftForecast({ players: [] }, guide);
  assert.equal(Object.keys(none.scrimDraft).length, 12);
  assert.ok(Object.values(none.scrimDraft).every((v) => v === null));
});

test('基準13: 集計のコマンドは記録の置き場の draft から next-draft.json の scrimDraft を書く', async () => {
  const root = mkdtempSync(join(tmpdir(), 'f006-t6-'));
  const grounds = join(root, 'grounds');
  mkdirSync(join(grounds, 'scrims'), { recursive: true });
  writeFileSync(join(grounds, 'scrims', '2026-10-10-cc-next-vs-dd-next.json'), JSON.stringify(RECORDS));
  writeFileSync(join(grounds, 'scrims', '2026-10-11-it-next-vs-dd-next.json'), JSON.stringify(RECORDS_IT));
  const data = Object.fromEntries(Object.entries(CHAMPS).map(([id, [name, key]]) => [id, { id, key: String(key), name }]));
  const ddragon = async (url: string) =>
    new Response(JSON.stringify(url.endsWith('versions.json') ? ['16.20.1'] : { type: 'champion', version: '16.20.1', data }), { status: 200, headers: { 'content-type': 'application/json' } });
  const lines: string[] = [];
  const code = await main({
    rawDir: join(root, 'raw'), publicDir: join(root, 'public'), snapshotsDir: join(root, 'snap'),
    resultsRoot: grounds, facts: [], fetch: ddragon, now: () => new Date('2026-10-14T00:00:00Z'), out: (l) => lines.push(l),
  });
  assert.equal(code, 0, lines.join('\n'));
  const saved = JSON.parse(readFileSync(join(root, 'public', 'next-draft.json'), 'utf8'));
  assert.deepEqual(saved.scrimDraft['DD-NEXT'].bannedBy[0], { champion: 'アーリ', championId: 103, count: 3 });
  assert.equal(saved.scrimDraft['DD-NEXT'].games, 4);
  assert.equal(saved.scrimDraft['DD-NEXT'].ordered, 3);
  assert.equal(saved.scrimDraft['LR-NEXT'], null);
});
