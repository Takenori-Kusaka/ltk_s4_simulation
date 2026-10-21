// F-003 Task-2: 受入基準 2(選手・チャンピオンごとの集計)・6(公開物は集計値だけ)・10(Data Dragon の版と一覧)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePlayerFile } from '../../src/data/validate.ts';
import { aggregateMatches, buildPublicPlayer, writePublicData } from '../../src/collect/aggregate.ts';
import { fetchDataDragon, saveDataDragon } from '../../src/collect/ddragon.ts';
import { main } from '../../src/collect/aggregate-cli.ts';

const ME = 'PUUID-ME-secret';
const close = (actual: number | undefined, expected: number, msg?: string) =>
  assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-3, `${msg ?? ''} 期待 ${expected} 実際 ${actual}`);

interface Spec {
  id: string; created: string; durationSec: number; queue: number; champion: string; win: boolean;
  k: number; d: number; a: number; minions: number; neutral: number; vision: number; dmg: number;
  mateKills: number[]; mateDmg: number; remake?: boolean;
}

/** match-v5 の試合の詳細(DTO)を真似る。自分は teamId 100、味方4人と敵5人 */
function matchDto(s: Spec) {
  const mates = s.mateKills.map((kills, i) => ({
    puuid: `MATE-${i}`, teamId: 100, championName: 'Garen', championId: 86, win: s.win, kills, deaths: 1, assists: 1,
    totalMinionsKilled: 100, neutralMinionsKilled: 0, visionScore: 5, totalDamageDealtToChampions: s.mateDmg,
    gameEndedInEarlySurrender: !!s.remake,
  }));
  const enemies = [0, 1, 2, 3, 4].map((i) => ({
    puuid: `ENEMY-${i}`, teamId: 200, championName: 'Darius', championId: 122, win: !s.win, kills: 9, deaths: 1, assists: 9,
    totalMinionsKilled: 100, neutralMinionsKilled: 0, visionScore: 5, totalDamageDealtToChampions: 99999,
    gameEndedInEarlySurrender: !!s.remake,
  }));
  const me = {
    puuid: ME, teamId: 100, championName: s.champion, championId: 1, win: s.win, kills: s.k, deaths: s.d, assists: s.a,
    totalMinionsKilled: s.minions, neutralMinionsKilled: s.neutral, visionScore: s.vision, totalDamageDealtToChampions: s.dmg,
    gameEndedInEarlySurrender: !!s.remake,
  };
  return {
    metadata: { matchId: s.id, participants: [ME, ...mates.map((m) => m.puuid), ...enemies.map((e) => e.puuid)] },
    info: {
      gameCreation: Date.parse(s.created), gameDuration: s.durationSec, gameEndTimestamp: Date.parse(s.created) + s.durationSec * 1000,
      queueId: s.queue, participants: [me, ...mates, ...enemies],
    },
  };
}

// 自分の数値: 試合1 Ahri 勝ち、試合2 Ahri 負け、試合3 Zed 勝ち。ほかに集計の対象外(ARAM・リメイク)
const M1 = matchDto({ id: 'JP1_101', created: '2026-10-01T12:00:00Z', durationSec: 1800, queue: 420, champion: 'Ahri', win: true,
  k: 5, d: 2, a: 7, minions: 200, neutral: 10, vision: 30, dmg: 20000, mateKills: [3, 2, 1, 4], mateDmg: 15000 });
const M2 = matchDto({ id: 'JP1_102', created: '2026-10-02T12:00:00Z', durationSec: 1200, queue: 440, champion: 'Ahri', win: false,
  k: 1, d: 4, a: 2, minions: 150, neutral: 0, vision: 10, dmg: 10000, mateKills: [1, 1, 1, 1], mateDmg: 10000 });
const M3 = matchDto({ id: 'JP1_103', created: '2026-10-03T12:00:00Z', durationSec: 1500, queue: 420, champion: 'Zed', win: true,
  k: 10, d: 0, a: 5, minions: 200, neutral: 25, vision: 20, dmg: 30000, mateKills: [2, 2, 2, 4], mateDmg: 10000 });
const ARAM = matchDto({ id: 'JP1_104', created: '2026-10-04T12:00:00Z', durationSec: 1000, queue: 450, champion: 'Lux', win: true,
  k: 30, d: 0, a: 30, minions: 10, neutral: 0, vision: 0, dmg: 90000, mateKills: [1, 1, 1, 1], mateDmg: 1000 });
const REMAKE = matchDto({ id: 'JP1_105', created: '2026-10-05T12:00:00Z', durationSec: 200, queue: 420, champion: 'Teemo', win: false,
  k: 0, d: 0, a: 0, minions: 1, neutral: 0, vision: 0, dmg: 10, mateKills: [0, 0, 0, 0], mateDmg: 10, remake: true });
const ALL = [M1, M2, ARAM, M3, REMAKE];

// ---- 基準2: 選手ごと・チャンピオンごとの集計 ----

test('基準2: 選手ごとに試合数・勝率・KDA・分あたり CS・分あたり視界・ダメージ割合・キル関与率を集計する', () => {
  const r = aggregateMatches(ME, ALL);
  const o = r.overall;
  assert.equal(o.games, 3, 'ランク(420・440)以外とリメイクは数えない');
  assert.equal(o.wins, 2);
  close(o.winRate, 2 / 3, '勝率');
  close(o.kda, 5, 'KDA = (16+14)/6');
  close(o.csPerMin, 585 / 75, '分あたり CS(ミニオン+中立)');
  close(o.visionPerMin, 60 / 75, '分あたり視界');
  close(o.damageShare, 60000 / 200000, 'チーム内のダメージ割合');
  close(o.killParticipation, 30 / 40, 'キル関与率');
});

test('基準2: チャンピオンごとに同じ指標を集計し、試合数の多い順に並べる', () => {
  const r = aggregateMatches(ME, ALL);
  assert.deepEqual(r.champions.map((c) => c.champion), ['Ahri', 'Zed']);
  const ahri = r.champions[0];
  assert.equal(ahri.games, 2);
  assert.equal(ahri.wins, 1);
  close(ahri.winRate, 0.5);
  close(ahri.kda, 15 / 6);
  close(ahri.csPerMin, 360 / 50);
  close(ahri.visionPerMin, 40 / 50);
  close(ahri.damageShare, 30000 / 130000);
  close(ahri.killParticipation, 15 / 20);
  const zed = r.champions[1];
  assert.equal(zed.games, 1);
  close(zed.kda, 15, 'デス0 は 1 として割る');
  close(zed.csPerMin, 9);
  close(zed.damageShare, 30000 / 70000);
});

test('基準2: 直近の試合を新しい順に、ランクの試合として並べる', () => {
  const r = aggregateMatches(ME, ALL);
  assert.deepEqual(r.recentMatches.map((m) => [m.champion, m.win, m.queue]), [
    ['Zed', true, 'ranked'], ['Ahri', false, 'ranked'], ['Ahri', true, 'ranked'],
  ]);
  assert.deepEqual(r.recentMatches[0], {
    date: '2026-10-03', queue: 'ranked', champion: 'Zed', win: true, kills: 10, deaths: 0, assists: 5, cs: 225,
  });
});

test('基準2: 集計の範囲は直近の window 試合に限る', () => {
  const r = aggregateMatches(ME, ALL, { window: 2 });
  assert.equal(r.overall.games, 2);
  assert.deepEqual(r.champions.map((c) => c.champion).sort(), ['Ahri', 'Zed']);
  assert.equal(r.recentMatches.at(-1)?.date, '2026-10-02');
});

test('基準2: 本人が参加していない試合と形の壊れた試合は数えない', () => {
  const r = aggregateMatches('SOMEONE-ELSE', [M1, null, { info: {} }, 'x']);
  assert.equal(r.overall.games, 0);
  assert.deepEqual(r.champions, []);
  assert.deepEqual(r.recentMatches, []);
});

const record = (over: Record<string, unknown> = {}) => ({
  playerId: 'DD-CORE-TOP', riotId: 'Me#JP1', status: '取得済み', collectedAt: '2026-10-08T03:00:00.000Z',
  lastCollectedAt: 1791428400, puuid: ME,
  account: { url: 'https://asia.api.riotgames.com/riot/account/v1/x', retrievedAt: '2026-10-08T03:00:01.000Z', data: { puuid: ME } },
  league: {
    url: 'https://jp1.api.riotgames.com/lol/league/v4/entries/by-puuid/x', retrievedAt: '2026-10-08T03:00:02.000Z',
    data: [
      { queueType: 'RANKED_FLEX_SR', tier: 'PLATINUM', rank: 'I', leaguePoints: 20, wins: 3, losses: 2, puuid: ME },
      { queueType: 'RANKED_SOLO_5x5', tier: 'DIAMOND', rank: 'II', leaguePoints: 50, wins: 10, losses: 8, puuid: ME },
    ],
  },
  matchIds: ['JP1_101', 'JP1_102', 'JP1_103', 'JP1_104', 'JP1_105'],
  ...over,
});

test('基準2: 選手の指標を、採点の指標名で出典・取得日・確度・書いた主体つきの値として出す', () => {
  const { player, championStats } = buildPublicPlayer(record() as never, ALL);
  assert.deepEqual(validatePlayerFile(player), []);
  const m = player.metrics;
  assert.equal(m.soloRank?.value, 'DIAMOND II 50');
  assert.match(m.soloRank!.source, /league-v4/);
  assert.equal(m.soloRank?.retrievedAt, '2026-10-08');
  close(m.kda?.value as number, 5);
  close(m.csPerMin?.value as number, 585 / 75);
  close(m.killParticipation?.value as number, 0.75);
  close(m.damageShare?.value as number, 0.3);
  assert.equal(m.championPoolSize?.value, 2);
  for (const key of ['kda', 'csPerMin', 'killParticipation', 'damageShare', 'championPoolSize']) {
    const e = m[key]!;
    assert.match(e.source, /Riot API match-v5/, key);
    assert.match(e.source, /直近3試合/, key);
    assert.equal(e.retrievedAt, '2026-10-08', key);
    assert.deepEqual(e.author, { kind: 'riot-api' }, key);
    assert.ok(['高', '中', '低'].includes(e.confidence), key);
  }
  assert.equal(player.recentMatches.length, 3);
  assert.equal(championStats.playerId, 'DD-CORE-TOP');
  assert.equal(championStats.champions[0].champion, 'Ahri');
  assert.equal(championStats.champions[0].games, 2);
});

test('基準2: ランクの無い選手・試合の無い選手は、その指標を出さない', () => {
  const { player } = buildPublicPlayer(record({ league: { url: 'u', retrievedAt: '2026-10-08T00:00:00Z', data: [] } }) as never, []);
  assert.deepEqual(validatePlayerFile(player), []);
  assert.equal(player.metrics.soloRank, undefined);
  assert.equal(player.metrics.kda, undefined);
  assert.deepEqual(player.recentMatches, []);
});

// ---- 基準6: 公開物は集計値だけ ----

function setupRaw() {
  const root = mkdtempSync(join(tmpdir(), 'f003-agg-'));
  const rawDir = join(root, 'raw');
  const publicDir = join(root, 'public');
  const snapshotsDir = join(root, 'snapshots');
  for (const d of ['players', 'matches']) mkdirSync(join(rawDir, d), { recursive: true });
  mkdirSync(snapshotsDir, { recursive: true });
  writeFileSync(join(rawDir, 'players', 'DD-CORE-TOP.json'), JSON.stringify(record()));
  writeFileSync(join(rawDir, 'players', 'DD-CORE-JG.json'), JSON.stringify({
    playerId: 'DD-CORE-JG', riotId: null, status: '未取得', reason: 'Riot ID 未登録', collectedAt: '2026-10-08T03:00:00.000Z', matchIds: [],
  }));
  for (const m of ALL) {
    writeFileSync(join(rawDir, 'matches', `${m.metadata.matchId}.json`), JSON.stringify({
      url: `https://asia.api.riotgames.com/lol/match/v5/matches/${m.metadata.matchId}`, retrievedAt: '2026-10-08T03:00:03.000Z', data: m,
    }));
  }
  const ev = (value: string | number) => ({ value, source: 'docs/research/x.md', retrievedAt: '2026-10-01', confidence: '中', author: { kind: 'human' } });
  writeFileSync(join(snapshotsDir, 'static.json'), JSON.stringify({
    kind: 'static', players: { 'DD-CORE-TOP': { peakRank: ev('MASTER I 200'), ltkGames: ev(12) }, 'DD-CORE-JG': { ltkGames: ev(4) } },
  }));
  writeFileSync(join(snapshotsDir, 'qual.json'), JSON.stringify({
    kind: 'qualitative', players: { 'DD-CORE-TOP': { laning: { score: 7, rationale: '対面に負けない', sources: ['docs/research/x.md'], author: { kind: 'human' } } } },
  }));
  return { root, rawDir, publicDir, snapshotsDir };
}

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? listFiles(join(dir, n)) : [join(dir, n)]));

const RAW_ONLY_KEYS = ['puuid', 'matchId', 'matchIds', 'participants', 'metadata', 'info', 'url', 'account', 'league', 'riotId'];
function keysOf(v: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, acc));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { acc.add(k); keysOf(x, acc); }
  return acc;
}

test('基準6: 公開の配信物に生の応答の項目(puuid・試合ID・参加者の配列・URL)が無い', () => {
  const { rawDir, publicDir, snapshotsDir } = setupRaw();
  const r = writePublicData({ rawDir, publicDir, snapshotsDir });
  assert.deepEqual(r.errors, []);
  const files = listFiles(publicDir);
  assert.ok(files.length >= 2, '選手と チャンピオン別の集計のファイルがある');
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const s of [ME, 'MATE-0', 'ENEMY-0', 'JP1_101', 'api.riotgames.com', 'Me#JP1']) assert.ok(!text.includes(s), `${f} に ${s}`);
    const keys = keysOf(JSON.parse(text));
    for (const k of RAW_ONLY_KEYS) assert.ok(!keys.has(k), `${f} に項目 ${k}`);
  }
});

test('基準6: 選手のファイルは指標ファイルの形で、スナップショットの値と統合する', () => {
  const { rawDir, publicDir, snapshotsDir } = setupRaw();
  writePublicData({ rawDir, publicDir, snapshotsDir });
  const top = JSON.parse(readFileSync(join(publicDir, 'players', 'DD-CORE-TOP.json'), 'utf8'));
  assert.deepEqual(validatePlayerFile(top), []);
  assert.equal(top.metrics.soloRank.value, 'DIAMOND II 50');
  assert.equal(top.metrics.peakRank.value, 'MASTER I 200');
  assert.equal(top.metrics.ltkGames.value, 12);
  assert.equal(top.qualitative.laning.score, 7);
  assert.equal(top.recentMatches.length, 3);
  const stats = JSON.parse(readFileSync(join(publicDir, 'champion-stats', 'DD-CORE-TOP.json'), 'utf8'));
  assert.equal(stats.champions.find((c: { champion: string }) => c.champion === 'Ahri').games, 2);
  // 未取得の選手もスナップショットの値は出す
  const jg = JSON.parse(readFileSync(join(publicDir, 'players', 'DD-CORE-JG.json'), 'utf8'));
  assert.deepEqual(validatePlayerFile(jg), []);
  assert.equal(jg.metrics.ltkGames.value, 4);
  assert.equal(jg.metrics.kda, undefined);
});

test('基準6: 生のデータもスナップショットも無ければ、選手のファイルを書かない', () => {
  const root = mkdtempSync(join(tmpdir(), 'f003-agg-empty-'));
  const publicDir = join(root, 'public');
  const r = writePublicData({ rawDir: join(root, 'raw'), publicDir, snapshotsDir: join(root, 'snap') });
  assert.deepEqual(r.written, []);
  assert.ok(!existsSync(join(publicDir, 'players')) || readdirSync(join(publicDir, 'players')).length === 0);
});

// ---- 基準10: Data Dragon ----

function fakeDdragon(opts: { failChampion?: boolean } = {}) {
  const calls: string[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetch = async (url: string) => {
    calls.push(url);
    if (url === 'https://ddragon.leagueoflegends.com/api/versions.json') return json(['15.20.1', '15.19.1', '15.18.1']);
    if (url === 'https://ddragon.leagueoflegends.com/cdn/15.20.1/data/ja_JP/champion.json') {
      if (opts.failChampion) return json({}, 503);
      return json({ type: 'champion', version: '15.20.1', data: {
        Ahri: { id: 'Ahri', key: '103', name: 'アーリ' },
        MonkeyKing: { id: 'MonkeyKing', key: '62', name: 'ウーコン' },
      } });
    }
    return json({}, 404);
  };
  return { fetch, calls };
}
const NOW = () => new Date('2026-10-08T03:00:00.000Z');

test('基準10: Data Dragon の最新の版と、その版の日本語のチャンピオンの一覧を取る', async () => {
  const { fetch, calls } = fakeDdragon();
  const d = await fetchDataDragon({ fetch, now: NOW });
  assert.equal(d.version, '15.20.1');
  assert.deepEqual(d.champions, { Ahri: 'アーリ', MonkeyKing: 'ウーコン' });
  assert.equal(d.retrievedAt, '2026-10-08');
  assert.match(d.source, /Data Dragon/);
  assert.ok(calls.includes('https://ddragon.leagueoflegends.com/cdn/15.20.1/data/ja_JP/champion.json'));
});

test('基準10: 版とチャンピオンの一覧を champions.json へ保存する', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'f003-dd-'));
  const path = await saveDataDragon(join(dir, 'public'), { fetch: fakeDdragon().fetch, now: NOW });
  assert.equal(path, join(dir, 'public', 'champions.json'));
  const saved = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(saved.version, '15.20.1');
  assert.equal(saved.champions.MonkeyKing, 'ウーコン');
});

test('基準10: Data Dragon が失敗したら例外にし、ファイルを書かない', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'f003-dd-fail-'));
  await assert.rejects(saveDataDragon(join(dir, 'public'), { fetch: fakeDdragon({ failChampion: true }).fetch, now: NOW }), /503/);
  assert.ok(!existsSync(join(dir, 'public', 'champions.json')));
});

// ---- コマンド ----

test('コマンド: 集計と Data Dragon の保存を行い、0 を返す', async () => {
  const { rawDir, publicDir, snapshotsDir } = setupRaw();
  const lines: string[] = [];
  const code = await main({ rawDir, publicDir, snapshotsDir, fetch: fakeDdragon().fetch, now: NOW, out: (l) => lines.push(l) });
  assert.equal(code, 0);
  assert.ok(existsSync(join(publicDir, 'champions.json')));
  assert.ok(existsSync(join(publicDir, 'players', 'DD-CORE-TOP.json')));
  assert.ok(lines.length > 0);
});

test('コマンド: Data Dragon が失敗しても選手の集計は書き、1 を返す', async () => {
  const { rawDir, publicDir, snapshotsDir } = setupRaw();
  const lines: string[] = [];
  const code = await main({ rawDir, publicDir, snapshotsDir, fetch: fakeDdragon({ failChampion: true }).fetch, now: NOW, out: (l) => lines.push(l) });
  assert.equal(code, 1);
  assert.ok(existsSync(join(publicDir, 'players', 'DD-CORE-TOP.json')));
  assert.ok(lines.some((l) => /Data Dragon/.test(l)));
});

// F-005 Task-6(再判定 2): 外部の見立ての読み込みと、M の内訳(連携の厚み・司令塔)
interface WinratesFile {
  betaExt: Record<string, number>;
  teams: { key: string; E: number; externalCount: number; macroParts: { key: string }[] }[];
}

test('コマンド: groundsDir の external-views.json を勝率表の E に入れ、形の違う項目は理由を出して除く。ファイルが無ければ E = 0', async () => {
  const { root, rawDir, publicDir, snapshotsDir } = setupRaw();
  const groundsDir = join(root, 'grounds');
  mkdirSync(groundsDir, { recursive: true });
  for (const f of ['shotcalling.json', 'tournament.json']) copyFileSync(join('docs/research/grounds/normalized', f), join(groundsDir, f));
  const lines: string[] = [];
  const opts = { rawDir, publicDir, snapshotsDir, groundsDir, fetch: fakeDdragon().fetch, now: NOW, out: (l: string) => lines.push(l) };
  await main(opts);
  const before = JSON.parse(readFileSync(join(publicDir, 'winrates.json'), 'utf8')) as WinratesFile;
  assert.ok(before.teams.every((t) => t.E === 0 && t.externalCount === 0));
  assert.equal(before.betaExt.CORE, 0);
  assert.ok(!lines.some((l) => /外部の見立て/.test(l)));
  assert.deepEqual(before.teams.find((t) => t.key === 'DD-CORE')?.macroParts.map((p) => p.key), ['synergy', 'shotcalling']);

  const item = (target: string, direction: '+' | '-', strength: string) =>
    ({ target, direction, strength, speaker: '解説者', speakerKind: 'analyst', summary: '見立て', source: 'https://example.com/x', date: '2026-10-10' });
  writeFileSync(join(groundsDir, 'external-views.json'), JSON.stringify({
    kind: 'external-views',
    // 強 1.5 − 弱 0.5 + 自チームの中 1.0 × 0.5 = 1.5(3 件)。ZZ-CORE は階級チームではないため除く
    items: [item('DD-CORE', '+', '強'), item('DD-CORE', '-', '弱'), { ...item('DD-CORE', '+', '中'), selfTeam: true }, item('ZZ-CORE', '+', '強')],
  }));
  lines.length = 0;
  await main(opts);
  const after = JSON.parse(readFileSync(join(publicDir, 'winrates.json'), 'utf8')) as WinratesFile;
  const dd = after.teams.find((t) => t.key === 'DD-CORE');
  assert.equal(dd?.E, 1.5);
  assert.equal(dd?.externalCount, 3);
  assert.ok(after.teams.filter((t) => t.key !== 'DD-CORE').every((t) => t.E === 0 && t.externalCount === 0));
  assert.ok(after.betaExt.CORE > 0);
  assert.equal(after.betaExt.NEXT, 0);
  assert.ok(lines.some((l) => /外部の見立て/.test(l) && /items\[3\]/.test(l) && /ZZ-CORE/.test(l)));
});

// ---- F-004 Task-3: 受入基準 8・9・10・11・20・24(results.json・勝率表の results・予測の凍結・再現性)。実装より先に受入基準から書いた ----
import { ROSTER } from '../../src/data/roster.ts';

type ResultRow = Record<string, unknown>;
interface ResultsFileLike {
  kind: string;
  computedAt: string;
  games: {
    matchId: string; kind: string; date: string; stage: string | null; day: number | null; tier: string | null; teams: string[]; winner: string;
    source: { url: string }; forecast?: { pA: number; pB: number; computedAt: string } | null; forecastReason?: string | null;
  }[];
  teams: { key: string; k: number; form: string }[];
}
interface WinratesResultsLike {
  computedAt: string;
  results: { official: number; scrim: number; latestDate: string } | null;
  teams: { key: string; result: { theta: number; official: number; scrim: number } }[];
  matches: { stage: string; day?: number; tier: string; a: string; b: string; pA: number; pB: number }[];
}
const RESULT_SOURCE_URL = 'https://www.youtube.com/watch?v=f004-task3';
const NO_TABLE = '試合日より前の勝率表が無い';
const PUBLIC_FILES = ['results.json', 'ratings.json', 'winrates.json'];

/** 階級チーム(例 'DD CORE')の名簿の 5 人。champion は null(テスト用の Data Dragon の一覧に依らない) */
const resultTeam = (label: string): ResultRow => {
  const [team, tier] = label.split(' ');
  const players = (['TOP', 'JG', 'MID', 'ADC', 'SUP'] as const).map((role) => {
    const p = ROSTER.find((x) => x.team === team && x.tier === tier && x.role === role)!;
    return { role, rosterName: p.name, mappingConfidence: '確信(名簿の Riot ID と一致)', champion: null, kills: 2, deaths: 2, assists: 4, gold: 10000, damage: 10000 };
  });
  return { kills: 10, deaths: 10, assists: 20, gold: 50000, players };
};
const resultRecord = (a: string, b: string, winner: string, over: ResultRow): ResultRow => ({
  kind: 'scrim', listeners: false, source: { url: RESULT_SOURCE_URL, resultScreenSec: 5400 }, duration: '30:00', winner, teams: { [a]: resultTeam(a), [b]: resultTeam(b) }, ...over,
});
/** Regular Stage の本番の記録。1 日目(2026-10-15)は CC 対 DD・IT 対 LR、3 日目(2026-10-23)は LR 対 DD・IT 対 CC(左がブルー) */
const regularRecord = (day: number, date: string, blue: string, red: string, tier: string, winner: string): ResultRow =>
  resultRecord(`${blue} ${tier}`, `${red} ${tier}`, `${winner} ${tier}`, { kind: 'official', date, stage: 'regular', day, tier, match: null, game: 1 });
const day1 = (blue: string, red: string, tier: string, winner: string) => regularRecord(1, '2026-10-15', blue, red, tier, winner);
/** LR CORE 対 DD CORE のスクリムの記録 */
const coreScrim = (date: string, duration: string, winner: string, over: ResultRow = {}) => resultRecord('LR CORE', 'DD CORE', winner, { date, duration, ...over });

/** 記録の置き場の親(results/ と scrims/ を持つ)へ記録を置く。files は「置き場/ファイル名」→ 記録の配列 */
function putResults(root: string, files: Record<string, ResultRow[]>): string {
  for (const [rel, raw] of Object.entries(files)) {
    mkdirSync(join(root, rel.split('/')[0]), { recursive: true });
    writeFileSync(join(root, rel), JSON.stringify(raw));
  }
  return root;
}
const resultsRootOf = (files: Record<string, ResultRow[]>) => putResults(mkdtempSync(join(tmpdir(), 'f004-task3-')), files);
const readJson = <T>(dir: string, name: string): T => JSON.parse(readFileSync(join(dir, name), 'utf8')) as T;
const gameOf = (publicDir: string, matchId: string) => {
  const g = readJson<ResultsFileLike>(publicDir, 'results.json').games.find((x) => x.matchId === matchId);
  assert.ok(g, `${matchId} が results.json の games[] にある`);
  return g;
};

/** 集計を基準日 now で実行する(常識の一覧は空にして、評価の中身では止めない)。終了コード 0 を確かめ、出力の行を返す */
async function aggregateAt(env: { rawDir: string; publicDir: string; snapshotsDir: string }, resultsRoot: string, now: string): Promise<string[]> {
  const lines: string[] = [];
  const code = await main({
    rawDir: env.rawDir, publicDir: env.publicDir, snapshotsDir: env.snapshotsDir, resultsRoot, facts: [],
    fetch: fakeDdragon().fetch, now: () => new Date(now), out: (l) => lines.push(l),
  });
  assert.equal(code, 0, lines.join('\n'));
  return lines;
}

test('F-004 基準8・9・20: 集計は results.json に games[](本番とスクリム。試合日の昇順、同じ日は日程の順)と teams[](連敗の数 k と勝敗の並び)を書く', async () => {
  const env = setupRaw();
  const root = resultsRootOf({
    'scrims/2026-10-10-lr-core-vs-dd-core.json': [
      coreScrim('2026-10-10', '30:00', 'DD CORE'), coreScrim('2026-10-10', '31:00', 'LR CORE'), coreScrim('2026-10-10', '32:00', 'DD CORE', { listeners: true }),
    ],
    'scrims/2026-10-16-lr-core-vs-dd-core.json': [coreScrim('2026-10-16', '30:00', 'DD CORE')],
    // 本番の記録は日程と逆の順に置く
    'results/2026-10-15-regular-day1.json': [day1('IT', 'LR', 'CORE', 'LR'), day1('CC', 'DD', 'CORE', 'CC'), day1('IT', 'LR', 'NEXT', 'IT'), day1('CC', 'DD', 'NEXT', 'CC')],
  });
  const lines = await aggregateAt(env, root, '2026-10-17T03:00:00.000Z');
  const file = readJson<ResultsFileLike>(env.publicDir, 'results.json');
  assert.equal(file.kind, 'results');
  assert.equal(file.computedAt, '2026-10-17T03:00:00.000Z');
  // 基準8・20: リスナー参加の記録は入らない。スクリムは kind "scrim"
  assert.deepEqual(file.games.map((g) => [g.matchId, g.kind, g.date, g.winner]), [
    ['SC-20261010-DD-CORE-LR-CORE-G1', 'scrim', '2026-10-10', 'DD-CORE'],
    ['SC-20261010-DD-CORE-LR-CORE-G2', 'scrim', '2026-10-10', 'LR-CORE'],
    ['RS-1-CC-DD-NEXT', 'official', '2026-10-15', 'CC-NEXT'],
    ['RS-1-CC-DD-CORE', 'official', '2026-10-15', 'CC-CORE'],
    ['RS-1-IT-LR-NEXT', 'official', '2026-10-15', 'IT-NEXT'],
    ['RS-1-IT-LR-CORE', 'official', '2026-10-15', 'LR-CORE'],
    ['SC-20261016-DD-CORE-LR-CORE-G1', 'scrim', '2026-10-16', 'DD-CORE'],
  ]);
  const g = file.games[2];
  assert.deepEqual([g.stage, g.day, g.tier, g.teams, g.source.url], ['regular', 1, 'NEXT', ['CC-NEXT', 'DD-NEXT'], RESULT_SOURCE_URL]);
  assert.deepEqual([file.games[0].teams, file.games[0].source.url], [['DD-CORE', 'LR-CORE'], RESULT_SOURCE_URL]);
  // 基準9: 本番だけを数える(スクリムの勝ち負けでは k も並びも動かない)
  assert.equal(file.teams.length, 12);
  const streak = Object.fromEntries(file.teams.map((t) => [t.key, [t.k, t.form]]));
  assert.deepEqual(streak['DD-NEXT'], [1, 'L']);
  assert.deepEqual(streak['CC-NEXT'], [0, 'W']);
  assert.deepEqual(streak['DD-CORE'], [1, 'L'], '本番の負けの後のスクリムの勝ちでは 0 に戻らない');
  assert.deepEqual(streak['LR-CORE'], [0, 'W'], 'スクリムの負けは数えない');
  assert.deepEqual(streak['DD-MASTERS'], [0, ''], '本番の記録が無い階級チーム');
  // 基準20: θ への重みはこの機能の側で持たない
  assert.ok(!/weight/i.test(readFileSync(join(env.publicDir, 'results.json'), 'utf8')));
  assert.ok(lines.some((l) => /results\.json/.test(l)), '書いたファイルを出力に残す');
});

test('F-004 基準10: 本番の記録が追加されたら、次の集計で勝率表を本番の結果を含めて作り直し、results に本番の試合数・スクリムの試合数・最新の試合日を書く', async () => {
  const env = setupRaw();
  const root = resultsRootOf({ 'scrims/2026-10-10-lr-core-vs-dd-core.json': [coreScrim('2026-10-10', '30:00', 'DD CORE'), coreScrim('2026-10-10', '31:00', 'LR CORE')] });
  const resultOf = (file: WinratesResultsLike, key: string) => file.teams.find((t) => t.key === key)!.result;
  await aggregateAt(env, root, '2026-10-14T03:00:00.000Z');
  const before = readJson<WinratesResultsLike>(env.publicDir, 'winrates.json');
  // 本番の記録が無い間は null のまま(画面は results の有無で「予想(開幕前)」と「結果を反映」を分ける。基準22)
  assert.equal(before.results, null);
  assert.deepEqual(resultOf(before, 'CC-NEXT'), { theta: 0, official: 0, scrim: 0 });

  putResults(root, { 'results/2026-10-15-regular-day1.json': [day1('CC', 'DD', 'NEXT', 'CC'), day1('IT', 'LR', 'NEXT', 'IT')] });
  await aggregateAt(env, root, '2026-10-16T03:00:00.000Z');
  const after = readJson<WinratesResultsLike>(env.publicDir, 'winrates.json');
  assert.equal(after.computedAt, '2026-10-16T03:00:00.000Z');
  assert.deepEqual(after.results, { official: 2, scrim: 2, latestDate: '2026-10-15' });
  // θ の当て直し(F-005 基準4)の入力に games[] が渡っている: 本番 1 試合ずつ、勝った側の θ が上がり負けた側が下がる
  assert.deepEqual([resultOf(after, 'CC-NEXT').official, resultOf(after, 'DD-NEXT').official, resultOf(after, 'DD-CORE').official, resultOf(after, 'DD-CORE').scrim], [1, 1, 0, 2]);
  assert.ok(resultOf(after, 'CC-NEXT').theta > 0, `CC-NEXT の θ ${resultOf(after, 'CC-NEXT').theta}`);
  assert.ok(resultOf(after, 'DD-NEXT').theta < 0, `DD-NEXT の θ ${resultOf(after, 'DD-NEXT').theta}`);
});

test('F-004 基準11: 本番の記録を初めて読んだ集計で、前回の勝率表(試合日の 0 時(JST)より前の計算)の勝率を forecast に書き、以後の集計では書き換えない', async () => {
  const env = setupRaw();
  const root = resultsRootOf({});
  // 開幕前(2026-10-14)の集計。この勝率表が 1 日目の試合の予測になる
  await aggregateAt(env, root, '2026-10-14T03:00:00.000Z');
  const opening = readJson<WinratesResultsLike>(env.publicDir, 'winrates.json');
  const prior = opening.matches.find((m) => m.stage === 'regular' && m.day === 1 && m.tier === 'NEXT' && m.a === 'CC' && m.b === 'DD')!;
  const frozen = { pA: prior.pA, pB: prior.pB, computedAt: '2026-10-14T03:00:00.000Z' };
  const empty = readJson<ResultsFileLike>(env.publicDir, 'results.json');
  assert.deepEqual([empty.games, empty.teams.length, empty.teams.every((t) => t.k === 0 && t.form === '')], [[], 12, true], '記録が 0 件でも results.json を書く');

  // 1 日目の NEXT の記録を初めて読む集計(2026-10-16)
  putResults(root, { 'results/2026-10-15-regular-day1.json': [day1('CC', 'DD', 'NEXT', 'DD')] });
  await aggregateAt(env, root, '2026-10-16T03:00:00.000Z');
  assert.deepEqual(gameOf(env.publicDir, 'RS-1-CC-DD-NEXT').teams, ['CC-NEXT', 'DD-NEXT']);
  assert.deepEqual(gameOf(env.publicDir, 'RS-1-CC-DD-NEXT').forecast, frozen);
  assert.equal(readJson<WinratesResultsLike>(env.publicDir, 'winrates.json').computedAt, '2026-10-16T03:00:00.000Z', '勝率表は作り直されている');

  // 同じ日の別の試合の記録が後から増えた集計(2026-10-17)。前回の勝率表は 2026-10-16 の計算で、試合日より前ではない
  putResults(root, { 'results/2026-10-15-regular-day1.json': [day1('CC', 'DD', 'NEXT', 'DD'), day1('IT', 'LR', 'NEXT', 'IT')] });
  for (const now of ['2026-10-17T03:00:00.000Z', '2026-10-18T03:00:00.000Z']) {
    await aggregateAt(env, root, now);
    assert.deepEqual(gameOf(env.publicDir, 'RS-1-CC-DD-NEXT').forecast, frozen, `${now}: 前回の results.json の forecast を引き継ぐ`);
    assert.equal(gameOf(env.publicDir, 'RS-1-IT-LR-NEXT').forecast, null, now);
    assert.equal(gameOf(env.publicDir, 'RS-1-IT-LR-NEXT').forecastReason, NO_TABLE, now);
  }
});

test('F-004 基準11: 前回の勝率表が無ければ forecast は null と理由。勝率表の a・b の向きが games[].teams と逆なら勝率を入れ替える', async () => {
  // 2 日目(2026-10-19)は LR がブルー、DD がレッド。games[].teams は辞書順(DD-NEXT・LR-NEXT)
  const root = resultsRootOf({ 'results/2026-10-19-regular-day2.json': [regularRecord(2, '2026-10-19', 'LR', 'DD', 'NEXT', 'LR')] });
  const fresh = setupRaw();
  await aggregateAt(fresh, root, '2026-10-20T03:00:00.000Z');
  assert.equal(gameOf(fresh.publicDir, 'RS-2-LR-DD-NEXT').forecast, null);
  assert.equal(gameOf(fresh.publicDir, 'RS-2-LR-DD-NEXT').forecastReason, NO_TABLE);

  const env = setupRaw();
  mkdirSync(env.publicDir, { recursive: true });
  writeFileSync(join(env.publicDir, 'winrates.json'), JSON.stringify({
    kind: 'winrates', computedAt: '2026-10-18T03:00:00.000Z', matches: [{ stage: 'regular', day: 2, tier: 'NEXT', a: 'LR', b: 'DD', pA: 70, pB: 30 }],
  }));
  await aggregateAt(env, root, '2026-10-20T03:00:00.000Z');
  assert.deepEqual(gameOf(env.publicDir, 'RS-2-LR-DD-NEXT').teams, ['DD-NEXT', 'LR-NEXT']);
  assert.deepEqual(gameOf(env.publicDir, 'RS-2-LR-DD-NEXT').forecast, { pA: 30, pB: 70, computedAt: '2026-10-18T03:00:00.000Z' });
});

test('F-004 基準24: 同じ入力(記録・ソロランクの試合・根拠・評価設定・基準日)から同じ results.json・ratings.json・winrates.json を返す', async () => {
  const root = resultsRootOf({
    'scrims/2026-10-10-lr-core-vs-dd-core.json': [coreScrim('2026-10-10', '30:00', 'DD CORE'), coreScrim('2026-10-10', '31:00', 'LR CORE')],
    'results/2026-10-15-regular-day1.json': [day1('CC', 'DD', 'NEXT', 'CC'), day1('CC', 'DD', 'CORE', 'DD'), day1('IT', 'LR', 'NEXT', 'IT'), day1('IT', 'LR', 'CORE', 'LR')],
  });
  const NOW_AT = '2026-10-16T03:00:00.000Z';
  const texts = (publicDir: string) => PUBLIC_FILES.map((f) => readFileSync(join(publicDir, f), 'utf8'));
  const a = setupRaw(), b = setupRaw();
  await aggregateAt(a, root, NOW_AT);
  await aggregateAt(b, root, NOW_AT);
  const first = texts(a.publicDir);
  assert.deepEqual(texts(b.publicDir), first, '別の作業用の置き場で集計しても同じ');
  assert.equal(readJson<ResultsFileLike>(a.publicDir, 'results.json').games.length, 6);
  // 同じ置き場でもう一度集計しても同じ(前回の results.json と勝率表を読んでも出力は変わらない)
  await aggregateAt(a, root, NOW_AT);
  assert.deepEqual(texts(a.publicDir), first, '同じ置き場でもう一度集計しても同じ');
});

test('F-004: resultsRoot を渡さない集計は記録を読まず、results.json を書かない(勝率表の results は null)', async () => {
  const env = setupRaw();
  const code = await main({ rawDir: env.rawDir, publicDir: env.publicDir, snapshotsDir: env.snapshotsDir, facts: [], fetch: fakeDdragon().fetch, now: NOW, out: () => {} });
  assert.equal(code, 0);
  assert.ok(!existsSync(join(env.publicDir, 'results.json')));
  assert.equal(readJson<WinratesResultsLike>(env.publicDir, 'winrates.json').results, null);
});

// ---- F-004 Task-10: 受入基準 9(集計が数えた k の dayShift への受け渡し)。実装より先に受入基準から書いた ----
import { dayShift, dayWinrate, type DayTeamLike } from '../../src/winrate/dynamics.ts';

interface WinratesMoodLike { teams: (DayTeamLike & { key: string; mood: { date: string; k: number }[] })[] }

test('F-004 基準9: 集計は本番の結果から数えた k を勝率表の teams[].mood へ書き、試合日の勝率の dayShift の kA・kB に届く', async () => {
  const env = setupRaw();
  const root = resultsRootOf({
    'results/2026-10-15-regular-day1.json': [day1('CC', 'DD', 'NEXT', 'CC'), day1('IT', 'LR', 'NEXT', 'IT')],
    'results/2026-10-23-regular-day3.json': [regularRecord(3, '2026-10-23', 'DD', 'IT', 'NEXT', 'IT')],
    // スクリムの負けは数えない
    'scrims/2026-10-21-lr-core-vs-dd-core.json': [coreScrim('2026-10-21', '30:00', 'LR CORE')],
  });
  await aggregateAt(env, root, '2026-10-24T03:00:00.000Z');
  const file = readJson<WinratesMoodLike>(env.publicDir, 'winrates.json');
  const moodOf = (key: string) => file.teams.find((t) => t.key === key)!.mood;
  assert.deepEqual(moodOf('DD-NEXT'), [{ date: '2026-10-15', k: 1 }, { date: '2026-10-23', k: 2 }]);
  assert.deepEqual(moodOf('IT-NEXT'), [{ date: '2026-10-15', k: 0 }, { date: '2026-10-23', k: 0 }]);
  assert.deepEqual(moodOf('DD-CORE'), [], 'スクリムだけの階級チームは空');
  // results.json の teams[].k と、勝率表の mood の最後の k は同じ
  const streaks = readJson<ResultsFileLike>(env.publicDir, 'results.json').teams;
  for (const t of streaks) assert.equal(moodOf(t.key).at(-1)?.k ?? 0, t.k, t.key);
  // 戦力 S をそろえて(この置き場の評価では S が無い)、第6日の DD 対 LR の勝率を作る
  const rows = file.teams.map((t) => ({ ...t, S: 6 }));
  const d = dayWinrate(rows, 'NEXT', 'DD', 'LR', 0.5, '2026-11-06');
  assert.equal(d.applied, true);
  assert.deepEqual([d.kA, d.kB], [2, 1], 'LR-NEXT は 1 日目に IT-NEXT に負けている(k = 1 の補正は 0)');
  assert.equal(d.shift, dayShift(d.a!, d.b!, d.dA, d.dB, { kA: 2 }));
  assert.ok(Math.abs(d.shift - dayShift(d.a!, d.b!, d.dA, d.dB) - -0.05) < 1e-12, '2 連敗の −0.05 が加わる');
});

test('F-004 基準9: 本番の記録が無い集計(resultsRoot なし・スクリムだけ)では、勝率表の mood は空で、気持ちの補正は 0', async () => {
  for (const resultsRoot of [undefined, resultsRootOf({ 'scrims/2026-10-10-lr-core-vs-dd-core.json': [coreScrim('2026-10-10', '30:00', 'DD CORE')] })]) {
    const env = setupRaw();
    const code = await main({ rawDir: env.rawDir, publicDir: env.publicDir, snapshotsDir: env.snapshotsDir, resultsRoot, facts: [], fetch: fakeDdragon().fetch, now: NOW, out: () => {} });
    assert.equal(code, 0);
    const file = readJson<WinratesMoodLike>(env.publicDir, 'winrates.json');
    assert.ok(file.teams.every((t) => Array.isArray(t.mood) && t.mood.length === 0));
    const d = dayWinrate(file.teams.map((t) => ({ ...t, S: 6 })), 'NEXT', 'DD', 'LR', 0.5, '2026-11-06');
    assert.deepEqual([d.kA, d.kB], [0, 0]);
    assert.equal(d.shift, dayShift(d.a!, d.b!, d.dA, d.dB));
  }
});
