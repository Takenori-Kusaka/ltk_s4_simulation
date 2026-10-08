// F-003 Task-1: 受入基準 1(ランクと差分の試合を取得日時つきで保存)・4(未取得)・5(キーを書かない)、二重起動の防止、収集ログ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
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
  const accounts: Record<string, string> = { 'Alice#JP1': 'PUUID-A', 'Dan#JP1': 'PUUID-D', 'Eve#JP1': 'PUUID-E', 'Fay#JP1': 'PUUID-F' };
  const matches: FakeMatch[] = [];
  const add = (n: number, puuid: string, queue: 420 | 440, startMs: number) =>
    matches.push({ id: `JP1_${n}`, puuid, queue, startMs });
  // Alice: ソロ 100〜120、フレックス 121〜136(合計37。番号が大きいほど新しい)
  for (let n = 100; n <= 136; n++) add(n, 'PUUID-A', n <= 120 ? 420 : 440, T0 - 2 * DAY + n * 60_000);
  for (let n = 300; n <= 302; n++) add(n, 'PUUID-D', 420, T0 - 2 * DAY + n * 60_000);
  add(400, 'PUUID-F', 420, T0 - DAY);
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

test('基準1: 初回は選手ごとに現在のランク(ソロ・フレックス)と直近30試合の詳細を、取得日時つきで保存する', async () => {
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

  // 直近30試合(JP1_107〜JP1_136)だけを取り、それぞれ取得日時つきで保存する
  const aliceDetails = detailCalls(api.calls).filter((id) => Number(id!.slice(4)) < 300);
  assert.equal(aliceDetails.length, 30);
  for (let n = 107; n <= 136; n++) {
    const saved = readJson(join(dir, 'matches', `JP1_${n}.json`));
    assert.equal(saved.retrievedAt, new Date(T0).toISOString());
    assert.equal(saved.data.metadata.matchId, `JP1_${n}`);
  }
  assert.equal(existsSync(join(dir, 'matches', 'JP1_106.json')), false);
  assert.equal(a.matchIds.length, 30);
  assert.equal(summary.players.find((p) => p.playerId === 'A')!.newMatches, 30);
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
  assert.match(text, /A .*30/);
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

test('コマンド: 収集中のロックがあれば失敗の終了コードを返す', async () => {
  const dir = tmp();
  writeFileSync(join(dir, 'collect.lock'), 'running');
  const out: string[] = [];
  const code = await main({ env: { RIOT_API_KEY: KEY }, dataDir: dir, players: PLAYERS, fetch: fakeRiot().fetch, out: (l) => out.push(l) });
  assert.notEqual(code, 0);
  assert.ok(!out.join('\n').includes(KEY));
});
