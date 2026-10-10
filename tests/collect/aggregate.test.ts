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
