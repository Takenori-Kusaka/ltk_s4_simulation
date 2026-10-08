// F-009 Task-5: 受入基準 26(サモナーレベル・熟練度)・27(直近 120 日の試合を最大 60 件)
// F-003 Task-1: 受入基準 1(ランクと差分の試合を取得日時つきで保存)・4(未取得)・5(キーを書かない)、二重起動の防止、収集ログ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRiotClient } from '../../src/collect/riot.ts';
import { runCollection, CollectionLockedError } from '../../src/collect/collect.ts';
import { main } from '../../src/collect/cli.ts';

const KEY = 'RGAPI-11111111-collect-secret-key';
const T0 = Date.parse('2026-10-08T00:00:00.000Z');
const DAY = 86_400_000;

interface FakeMatch { id: string; puuid: string; queue: 420 | 440; startMs: number }

/** Riot API の振る舞いを真似る fetch。要求の URL と見出しを記録する */
function fakeRiot() {
  const accounts: Record<string, string> = {
    'Alice#JP1': 'PUUID-A', 'Dan#JP1': 'PUUID-D', 'Eve#JP1': 'PUUID-E', 'Fay#JP1': 'PUUID-F', 'Gin#JP1': 'PUUID-G',
  };
  const matches: FakeMatch[] = [];
  const add = (n: number, puuid: string, queue: 420 | 440, startMs: number) =>
    matches.push({ id: `JP1_${n}`, puuid, queue, startMs });
  // Alice: ソロ 100〜120、フレックス 121〜136(合計37。番号が大きいほど新しい)
  for (let n = 100; n <= 136; n++) add(n, 'PUUID-A', n <= 120 ? 420 : 440, T0 - 2 * DAY + n * 60_000);
  for (let n = 300; n <= 302; n++) add(n, 'PUUID-D', 420, T0 - 2 * DAY + n * 60_000);
  add(400, 'PUUID-F', 420, T0 - DAY);
  // Gin: 直近 120 日にソロ 1000〜1049・フレックス 1050〜1079(合計80)、120 日より前にソロ 900〜904
  for (let n = 1000; n <= 1079; n++) add(n, 'PUUID-G', n <= 1049 ? 420 : 440, T0 - 10 * DAY + (n - 1000) * 60_000);
  for (let n = 900; n <= 904; n++) add(n, 'PUUID-G', 420, T0 - 130 * DAY + n * 60_000);
  const failMatch = new Set<string>();
  const calls: { url: string; token: string | null }[] = [];
  const reply = (body: unknown, status = 200, token: string | null = null) =>
    new Response(JSON.stringify(status === 200 ? body : { status: { status_code: status, message: `error (token ${token})` } }), {
      status, headers: { 'content-type': 'application/json' },
    });
  const fetch = async (url: string, init?: { headers?: Record<string, string> }) => {
    const token = init?.headers?.['X-Riot-Token'] ?? null;
    calls.push({ url, token });
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname);
    let m = path.match(/^\/riot\/account\/v1\/accounts\/by-riot-id\/(.+)\/(.+)$/);
    if (m) {
      const puuid = accounts[`${m[1]}#${m[2]}`];
      return puuid ? reply({ puuid, gameName: m[1], tagLine: m[2] }) : reply(null, 404, token);
    }
    m = path.match(/^\/lol\/league\/v4\/entries\/by-puuid\/(.+)$/);
    if (m) {
      if (m[1] === 'PUUID-E') return reply(null, 404, token);
      return reply([
        { queueType: 'RANKED_SOLO_5x5', tier: 'DIAMOND', rank: 'II', leaguePoints: 50, wins: 10, losses: 8, puuid: m[1] },
        { queueType: 'RANKED_FLEX_SR', tier: 'PLATINUM', rank: 'I', leaguePoints: 20, wins: 3, losses: 2, puuid: m[1] },
      ]);
    }
    m = path.match(/^\/lol\/match\/v5\/matches\/by-puuid\/(.+)\/ids$/);
    if (m) {
      const queue = Number(u.searchParams.get('queue'));
      const count = Number(u.searchParams.get('count') ?? 20);
      const start = u.searchParams.get('startTime');
      const ids = matches
        .filter((x) => x.puuid === m![1] && x.queue === queue && (start === null || x.startMs >= Number(start) * 1000))
        .sort((a, b) => b.startMs - a.startMs)
        .slice(0, count)
        .map((x) => x.id);
      return reply(ids);
    }
    m = path.match(/^\/lol\/match\/v5\/matches\/(JP1_\d+)$/);
    if (m) {
      const x = matches.find((y) => y.id === m![1]);
      if (!x || failMatch.has(x.id)) return reply(null, failMatch.has(m[1]) ? 500 : 404, token);
      return reply({ metadata: { matchId: x.id, participants: [x.puuid] }, info: { queueId: x.queue, gameStartTimestamp: x.startMs } });
    }
    m = path.match(/^\/lol\/summoner\/v4\/summoners\/by-puuid\/(.+)$/);
    if (m) return reply({ puuid: m[1], profileIconId: 1, revisionDate: T0, summonerLevel: 321 });
    m = path.match(/^\/lol\/champion-mastery\/v4\/champion-masteries\/by-puuid\/(.+)\/top$/);
    if (m) {
      const count = Number(u.searchParams.get('count') ?? 3);
      const all = Array.from({ length: 15 }, (_, i) => ({ puuid: m![1], championId: i + 1, championLevel: 7, championPoints: 100_000 - i * 1000 }));
      return reply(all.slice(0, count));
    }
    m = path.match(/^\/lol\/champion-mastery\/v4\/scores\/by-puuid\/(.+)$/);
    if (m) return reply(987);
    return reply(null, 404, token);
  };
  return { fetch, calls, add, failMatch };
}

const PLAYERS = [
  { id: 'A', riotId: 'Alice#JP1' },
  { id: 'B', riotId: null },
  { id: 'C', riotId: 'Ghost#JP1' },
  { id: 'D', riotId: 'Dan#JP1' },
  { id: 'E', riotId: 'Eve#JP1' },
];

const tmp = () => mkdtempSync(join(tmpdir(), 'f003-collect-'));
const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const detailCalls = (calls: { url: string }[]) =>
  calls.map((c) => new URL(c.url).pathname).filter((p) => /^\/lol\/match\/v5\/matches\/JP1_\d+$/.test(p)).map((p) => p.split('/').pop());
function allFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? allFiles(p) : [p];
  });
}
function clientFor(api: ReturnType<typeof fakeRiot>, at: number) {
  return createRiotClient({ apiKey: KEY, fetch: api.fetch, sleep: async () => {}, now: () => new Date(at) });
}

test('基準1(F-009 基準27 で置き換え): 初回は選手ごとに現在のランク(ソロ・フレックス)と直近 120 日の試合(60 件以内なら全件)の詳細を、取得日時つきで保存する', async () => {
  const dir = tmp();
  const api = fakeRiot();
  const summary = await runCollection({ players: PLAYERS, client: clientFor(api, T0), dataDir: dir, now: () => new Date(T0) });

  const a = readJson(join(dir, 'players', 'A.json'));
  assert.equal(a.status, '取得済み');
  assert.equal(a.league.retrievedAt, new Date(T0).toISOString());
  const queues = a.league.data.map((e: { queueType: string }) => e.queueType).sort();
  assert.deepEqual(queues, ['RANKED_FLEX_SR', 'RANKED_SOLO_5x5']);

  // ソロ(420)とフレックス(440)の両方を要求する
  const idQueues = api.calls.map((c) => new URL(c.url)).filter((u) => u.pathname.endsWith('/PUUID-A/ids')).map((u) => u.searchParams.get('queue'));
  assert.deepEqual(idQueues.sort(), ['420', '440']);

  // 直近 120 日の 37 試合(JP1_100〜JP1_136)を取り、それぞれ取得日時つきで保存する
  const aliceDetails = detailCalls(api.calls).filter((id) => Number(id!.slice(4)) < 300);
  assert.equal(aliceDetails.length, 37);
  for (let n = 100; n <= 136; n++) {
    const saved = readJson(join(dir, 'matches', `JP1_${n}.json`));
    assert.equal(saved.retrievedAt, new Date(T0).toISOString());
    assert.equal(saved.data.metadata.matchId, `JP1_${n}`);
  }
  assert.equal(a.matchIds.length, 37);
  assert.equal(summary.players.find((p) => p.playerId === 'A')!.newMatches, 37);
  assert.equal(summary.players.find((p) => p.playerId === 'D')!.newMatches, 3);
});

test('基準1: 2回目は前回の収集より後の試合だけを要求し、保存済みの試合の詳細を取り直さない', async () => {
  const dir = tmp();
  const api = fakeRiot();
  await runCollection({ players: PLAYERS, client: clientFor(api, T0), dataDir: dir, now: () => new Date(T0) });
  // 前回の収集の後に行われた試合
  api.add(137, 'PUUID-A', 420, T0 + DAY / 2);
  api.add(138, 'PUUID-A', 440, T0 + DAY / 2 + 60_000);
  api.calls.length = 0;
  const T1 = T0 + DAY;
  const summary = await runCollection({ players: PLAYERS, client: clientFor(api, T1), dataDir: dir, now: () => new Date(T1) });

  const idUrls = api.calls.map((c) => new URL(c.url)).filter((u) => u.pathname.endsWith('/ids'));
  assert.ok(idUrls.length > 0);
  for (const u of idUrls) {
    const st = u.searchParams.get('startTime');
    assert.ok(st !== null, '差分の要求には startTime が要る');
    assert.ok(Number(st) <= T0 / 1000, 'startTime は前回の収集の時刻以前');
    assert.ok(Number(st) > (T0 - 2 * DAY) / 1000 + 136 * 60 - 1, 'startTime は前回の収集で取った試合より後');
  }
  assert.deepEqual(detailCalls(api.calls).sort(), ['JP1_137', 'JP1_138']);
  const a = readJson(join(dir, 'players', 'A.json'));
  assert.ok(a.matchIds.includes('JP1_137') && a.matchIds.includes('JP1_138') && a.matchIds.includes('JP1_107'));
  assert.equal(readJson(join(dir, 'matches', 'JP1_137.json')).retrievedAt, new Date(T1).toISOString());
  assert.equal(summary.players.find((p) => p.playerId === 'A')!.newMatches, 2);
  assert.equal(summary.players.find((p) => p.playerId === 'D')!.newMatches, 0);
});

test('基準4: Riot ID が未登録、または 404 の選手は「未取得」と記録し、ほかの選手の収集を続ける', async () => {
  const dir = tmp();
  const api = fakeRiot();
  const summary = await runCollection({ players: PLAYERS, client: clientFor(api, T0), dataDir: dir, now: () => new Date(T0) });
  const status = Object.fromEntries(summary.players.map((p) => [p.playerId, p.status]));
  assert.deepEqual(status, { A: '取得済み', B: '未取得', C: '未取得', D: '取得済み', E: '未取得' });
  for (const id of ['B', 'C', 'E']) {
    const f = readJson(join(dir, 'players', `${id}.json`));
    assert.equal(f.status, '未取得');
    assert.ok(typeof f.reason === 'string' && f.reason.length > 0);
  }
  assert.match(readJson(join(dir, 'players', 'C.json')).reason, /404/);
  assert.match(readJson(join(dir, 'players', 'E.json')).reason, /404/);
  // 404 の選手(C)の後の選手(D)も収集している
  assert.ok(existsSync(join(dir, 'matches', 'JP1_302.json')));
  // Riot ID の無い選手(B)については API を呼ばない
  assert.equal(api.calls.filter((c) => c.url.includes('by-riot-id/null')).length, 0);
});

test('基準5: 保存したファイル・収集ログ・画面への出力のどれにも API キーの文字列が現れない', async () => {
  const dir = tmp();
  const api = fakeRiot();
  api.failMatch.add('JP1_400'); // キーを含む本文の 500 を返す
  const out: string[] = [];
  const players = [...PLAYERS, { id: 'F', riotId: 'Fay#JP1' }];
  await runCollection({ players, client: clientFor(api, T0), dataDir: dir, now: () => new Date(T0), out: (l) => out.push(l) });
  // キーを実際に使っている(この検査が空振りでない)
  assert.ok(api.calls.length > 0 && api.calls.every((c) => c.token === KEY));
  const files = allFiles(dir);
  assert.ok(files.some((f) => f.includes('logs')));
  assert.ok(files.length > 10);
  for (const f of files) assert.ok(!readFileSync(f, 'utf8').includes(KEY), `キーが ${f} に書かれている`);
  assert.ok(out.length > 0);
  assert.ok(!out.join('\n').includes(KEY));
});

test('収集ログ: 開始・終了・選手ごとの件数・エラーをファイルに残す', async () => {
  const dir = tmp();
  const api = fakeRiot();
  await runCollection({ players: PLAYERS, client: clientFor(api, T0), dataDir: dir, now: () => new Date(T0) });
  const logs = readdirSync(join(dir, 'logs'));
  assert.equal(logs.length, 1);
  const text = readFileSync(join(dir, 'logs', logs[0]), 'utf8');
  assert.match(text, /開始/);
  assert.match(text, /終了/);
  assert.match(text, /A .*37/);
  assert.match(text, /D .*3/);
  assert.match(text, /C .*未取得.*404/);
  assert.match(text, /B .*未取得/);
});

test('二重起動の防止: 収集中のロックがあれば、API を呼ばずに失敗する', async () => {
  const dir = tmp();
  const api = fakeRiot();
  writeFileSync(join(dir, 'collect.lock'), 'running');
  await assert.rejects(
    runCollection({ players: PLAYERS, client: clientFor(api, T0), dataDir: dir, now: () => new Date(T0) }),
    CollectionLockedError,
  );
  assert.equal(api.calls.length, 0);
});

test('二重起動の防止: 同時に2つ起動すると片方だけが動き、終わればロックを外す', async () => {
  const dir = tmp();
  const api = fakeRiot();
  const run = () => runCollection({ players: PLAYERS, client: clientFor(api, T0), dataDir: dir, now: () => new Date(T0) });
  const results = await Promise.allSettled([run(), run()]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.ok(rejected.reason instanceof CollectionLockedError);
  assert.equal(existsSync(join(dir, 'collect.lock')), false);
});

test('キーが無効(401)なら収集を止め、ログにエラーを残してロックを外す', async () => {
  const dir = tmp();
  const fetch = async () => new Response('{"status":{"status_code":401}}', { status: 401 });
  const client = createRiotClient({ apiKey: KEY, fetch, sleep: async () => {} });
  await assert.rejects(runCollection({ players: PLAYERS, client, dataDir: dir, now: () => new Date(T0) }), /401/);
  assert.equal(existsSync(join(dir, 'collect.lock')), false);
  const logs = readdirSync(join(dir, 'logs'));
  assert.match(readFileSync(join(dir, 'logs', logs[0]), 'utf8'), /401/);
});

test('コマンド: RIOT_API_KEY が無ければ収集せずに失敗の終了コードを返す', async () => {
  const out: string[] = [];
  const code = await main({ env: {}, dataDir: tmp(), out: (l) => out.push(l), fetch: async () => { throw new Error('呼ばれない'); } });
  assert.notEqual(code, 0);
  assert.match(out.join('\n'), /RIOT_API_KEY/);
});

test('コマンド: 環境変数のキーで収集し、成功の終了コードを返す。出力にキーを含めない', async () => {
  const dir = tmp();
  const api = fakeRiot();
  const out: string[] = [];
  const code = await main({ env: { RIOT_API_KEY: KEY }, dataDir: dir, players: PLAYERS, fetch: api.fetch, sleep: async () => {}, out: (l) => out.push(l) });
  assert.equal(code, 0);
  assert.ok(existsSync(join(dir, 'players', 'A.json')));
  assert.ok(api.calls.every((c) => c.token === KEY));
  assert.ok(!out.join('\n').includes(KEY));
});

const GIN = [{ id: 'G', riotId: 'Gin#JP1' }];
const WINDOW_SEC = 120 * 86_400;
const idRequests = (calls: { url: string }[]) => calls.map((c) => new URL(c.url)).filter((u) => u.pathname.endsWith('/ids'));
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `JP1_${from + i}`);

test('F-009 基準26: 選手ごとにサモナーレベルと熟練度の上位(10件)・合計を、取得日時つきで選手の記録へ保存する', async () => {
  const dir = tmp();
  const api = fakeRiot();
  await runCollection({ players: PLAYERS, client: clientFor(api, T0), dataDir: dir, now: () => new Date(T0) });
  const at = new Date(T0).toISOString();
  for (const id of ['A', 'D']) {
    const rec = readJson(join(dir, 'players', `${id}.json`));
    assert.equal(rec.summoner.data.summonerLevel, 321);
    assert.equal(rec.summoner.retrievedAt, at);
    assert.equal(rec.masteryTop.data.length, 10);
    assert.equal(rec.masteryTop.data[0].championPoints, 100_000);
    assert.equal(rec.masteryTop.retrievedAt, at);
    assert.equal(rec.masteryScore.data, 987);
    assert.equal(rec.masteryScore.retrievedAt, at);
  }
  const top = api.calls.map((c) => new URL(c.url)).filter((u) => u.pathname.endsWith('/top'));
  assert.ok(top.length >= 2 && top.every((u) => u.searchParams.get('count') === '10' && u.host === 'jp1.api.riotgames.com'));
});

test('F-009 基準27: 初回は直近 120 日のソロ・フレックスの試合を、新しい順に最大 60 件だけ取得する', async () => {
  const dir = tmp();
  const api = fakeRiot();
  const summary = await runCollection({ players: GIN, client: clientFor(api, T0), dataDir: dir, now: () => new Date(T0) });
  const reqs = idRequests(api.calls);
  assert.deepEqual(reqs.map((u) => u.searchParams.get('queue')).sort(), ['420', '440']);
  for (const u of reqs) {
    assert.equal(Number(u.searchParams.get('startTime')), T0 / 1000 - WINDOW_SEC);
    assert.ok(Number(u.searchParams.get('count')) >= 60);
  }
  assert.deepEqual(detailCalls(api.calls).sort(), range(1020, 1079).sort());
  const g = readJson(join(dir, 'players', 'G.json'));
  assert.equal(g.matchIds.length, 60);
  assert.ok(!g.matchIds.some((id: string) => Number(id.slice(4)) < 1000));
  assert.equal(existsSync(join(dir, 'matches', 'JP1_904.json')), false);
  assert.equal(summary.players[0].newMatches, 60);
});

test('F-009 基準27: 2回目以降は保存済みでない試合だけを取り、要求の起点は直近 120 日より前にならない', async () => {
  const dir = tmp();
  const api = fakeRiot();
  await runCollection({ players: GIN, client: clientFor(api, T0), dataDir: dir, now: () => new Date(T0) });

  api.add(1080, 'PUUID-G', 420, T0 + DAY / 2);
  api.calls.length = 0;
  const T1 = T0 + DAY;
  await runCollection({ players: GIN, client: clientFor(api, T1), dataDir: dir, now: () => new Date(T1) });
  assert.deepEqual(detailCalls(api.calls), ['JP1_1080']);
  for (const u of idRequests(api.calls)) {
    const st = Number(u.searchParams.get('startTime'));
    assert.ok(st >= T1 / 1000 - WINDOW_SEC && st <= T0 / 1000);
  }

  // 前回の収集が 120 日より前でも、起点は直近 120 日の始まり
  const T2 = T0 + 130 * DAY;
  api.add(1081, 'PUUID-G', 440, T2 - DAY);
  api.calls.length = 0;
  const summary = await runCollection({ players: GIN, client: clientFor(api, T2), dataDir: dir, now: () => new Date(T2) });
  const reqs = idRequests(api.calls);
  assert.equal(reqs.length, 2);
  for (const u of reqs) assert.equal(Number(u.searchParams.get('startTime')), T2 / 1000 - WINDOW_SEC);
  assert.deepEqual(detailCalls(api.calls), ['JP1_1081']);
  assert.equal(summary.players[0].newMatches, 1);
});

test('F-009 基準27: 2回目以降も、新しい試合が 60 件を超えるときは新しい順に 60 件だけ取得する', async () => {
  const dir = tmp();
  const api = fakeRiot();
  await runCollection({ players: GIN, client: clientFor(api, T0), dataDir: dir, now: () => new Date(T0) });
  for (let n = 2000; n <= 2069; n++) api.add(n, 'PUUID-G', n % 2 ? 420 : 440, T0 + n * 1000);
  api.calls.length = 0;
  const T1 = T0 + DAY;
  await runCollection({ players: GIN, client: clientFor(api, T1), dataDir: dir, now: () => new Date(T1) });
  assert.deepEqual(detailCalls(api.calls).sort(), range(2010, 2069).sort());
});

test('F-009 基準27: F-003 の初回 30 試合で作った記録は、次の収集で直近 120 日を取り直し、保存済みの試合は取り直さない', async () => {
  const dir = tmp();
  const api = fakeRiot();
  // F-003 の形の記録: lastCollectedAt はあるが、120 日の窓で集めた印が無い
  mkdirSync(join(dir, 'players'), { recursive: true });
  mkdirSync(join(dir, 'matches'), { recursive: true });
  const old = range(107, 136);
  writeFileSync(join(dir, 'players', 'A.json'), JSON.stringify({
    playerId: 'A', riotId: 'Alice#JP1', status: '取得済み', collectedAt: new Date(T0 - 3600_000).toISOString(),
    lastCollectedAt: T0 / 1000 - 3600, matchIds: old,
  }));
  for (const id of old) writeFileSync(join(dir, 'matches', `${id}.json`), '{}');
  await runCollection({ players: [{ id: 'A', riotId: 'Alice#JP1' }], client: clientFor(api, T0), dataDir: dir, now: () => new Date(T0) });
  for (const u of idRequests(api.calls)) assert.equal(Number(u.searchParams.get('startTime')), T0 / 1000 - WINDOW_SEC);
  assert.deepEqual(detailCalls(api.calls).sort(), range(100, 106).sort());
  assert.equal(readJson(join(dir, 'players', 'A.json')).matchIds.length, 37);
});

test('F-009 基準27: コマンドは注入した時計で直近 120 日の起点を決める', async () => {
  const dir = tmp();
  const api = fakeRiot();
  const code = await main({
    env: { RIOT_API_KEY: KEY }, dataDir: dir, players: GIN, fetch: api.fetch, sleep: async () => {}, out: () => {}, now: () => new Date(T0),
  });
  assert.equal(code, 0);
  for (const u of idRequests(api.calls)) assert.equal(Number(u.searchParams.get('startTime')), T0 / 1000 - WINDOW_SEC);
  assert.equal(readJson(join(dir, 'players', 'G.json')).summoner.retrievedAt, new Date(T0).toISOString());
});

test('コマンド: 収集中のロックがあれば失敗の終了コードを返す', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'collect.lock'), 'running');
  const out: string[] = [];
  const code = await main({ env: { RIOT_API_KEY: KEY }, dataDir: dir, players: PLAYERS, fetch: fakeRiot().fetch, out: (l) => out.push(l) });
  assert.notEqual(code, 0);
  assert.ok(!out.join('\n').includes(KEY));
});
