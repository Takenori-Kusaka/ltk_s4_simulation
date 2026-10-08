// F-003 Task-1: 受入基準 3(429 の再試行)・5(キーを外へ出さない)と、Riot API の呼び出しの形
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRiotClient, loadApiKey, RiotHttpError, QUEUE_SOLO, QUEUE_FLEX } from '../../src/collect/riot.ts';

const KEY = 'RGAPI-00000000-test-secret-key';

interface Call { url: string; token: string | null }

/** 応答の列を順に返す fetch。呼び出しを記録する */
function scripted(responses: (() => Response)[]) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, token: init?.headers?.['X-Riot-Token'] ?? null });
    const next = responses.shift();
    if (!next) throw new Error('想定外の要求: ' + url);
    return next();
  };
  return { fetch, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

function fakeSleep() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => { waits.push(ms); } };
}

test('基準3: 429 を受けたら Retry-After の秒数だけ待ち、同じ要求をやり直して結果を返す', async () => {
  const { fetch, calls } = scripted([
    json({ status: { status_code: 429 } }, 429, { 'Retry-After': '7' }),
    json({ puuid: 'P1', gameName: 'a', tagLine: 'b' }),
  ]);
  const { waits, sleep } = fakeSleep();
  const client = createRiotClient({ apiKey: KEY, fetch, sleep });
  const res = await client.accountByRiotId('a', 'b');
  assert.equal(res.data.puuid, 'P1');
  assert.deepEqual(waits, [7000]);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, calls[1].url);
});

test('基準3: 429 が続いても、そのたびに Retry-After だけ待って中断しない', async () => {
  const { fetch, calls } = scripted([
    json({}, 429, { 'Retry-After': '1' }),
    json({}, 429, { 'Retry-After': '3' }),
    json({}, 429, { 'Retry-After': '2' }),
    json(['JP1_1']),
  ]);
  const { waits, sleep } = fakeSleep();
  const client = createRiotClient({ apiKey: KEY, fetch, sleep });
  const res = await client.matchIdsByPuuid('P1', { queue: QUEUE_SOLO, count: 30 });
  assert.deepEqual(res.data, ['JP1_1']);
  assert.deepEqual(waits, [1000, 3000, 2000]);
  assert.equal(new Set(calls.map((c) => c.url)).size, 1);
});

test('基準3: 429 に Retry-After が無いときも、待ってからやり直す', async () => {
  const { fetch, calls } = scripted([json({}, 429), json({ metadata: { matchId: 'JP1_9' } })]);
  const { waits, sleep } = fakeSleep();
  const client = createRiotClient({ apiKey: KEY, fetch, sleep });
  await client.match('JP1_9');
  assert.equal(calls.length, 2);
  assert.equal(waits.length, 1);
  assert.ok(waits[0] > 0);
});

test('基準4 の前提: 404 は状態 404 の RiotHttpError になる(再試行しない)', async () => {
  const { fetch, calls } = scripted([json({ status: { status_code: 404 } }, 404)]);
  const client = createRiotClient({ apiKey: KEY, fetch, sleep: fakeSleep().sleep });
  await assert.rejects(client.accountByRiotId('x', 'y'), (e: unknown) => e instanceof RiotHttpError && e.status === 404);
  assert.equal(calls.length, 1);
});

test('基準5: キーは X-Riot-Token の見出しでだけ送り、URL と例外の文に含めない', async () => {
  const { fetch, calls } = scripted([json({ message: `bad ${KEY}` }, 500)]);
  const client = createRiotClient({ apiKey: KEY, fetch, sleep: fakeSleep().sleep });
  let err: unknown;
  try { await client.leagueEntriesByPuuid('P1'); } catch (e) { err = e; }
  assert.ok(err instanceof RiotHttpError);
  assert.equal(err.status, 500);
  assert.equal(calls[0].token, KEY);
  assert.ok(!calls[0].url.includes(KEY));
  assert.ok(!String(err.message).includes(KEY));
  assert.ok(!JSON.stringify(err).includes(KEY));
});

test('基準5: redact は文中のキーを伏せる', () => {
  const client = createRiotClient({ apiKey: KEY, fetch: scripted([]).fetch });
  assert.equal(client.redact(`x ${KEY} y ${KEY}`).includes(KEY), false);
});

test('呼び出し先: account-v1 は asia、league-v4 は jp1、match-v5 は asia。取得日時と URL を返す', async () => {
  const { fetch, calls } = scripted([
    json({ puuid: 'P1' }), json([]), json(['JP1_2']), json({ metadata: {} }),
  ]);
  const now = () => new Date('2026-10-08T01:02:03.000Z');
  const client = createRiotClient({ apiKey: KEY, fetch, sleep: fakeSleep().sleep, now });
  const acc = await client.accountByRiotId('Ninja of Ninjas', 'JP1');
  await client.leagueEntriesByPuuid('P1');
  await client.matchIdsByPuuid('P1', { queue: QUEUE_FLEX, count: 100, startTime: 1759881600 });
  await client.match('JP1_2');
  assert.equal(acc.retrievedAt, '2026-10-08T01:02:03.000Z');
  assert.equal(acc.url, calls[0].url);
  const u0 = new URL(calls[0].url);
  assert.equal(u0.host, 'asia.api.riotgames.com');
  assert.equal(decodeURIComponent(u0.pathname), '/riot/account/v1/accounts/by-riot-id/Ninja of Ninjas/JP1');
  const u1 = new URL(calls[1].url);
  assert.equal(u1.host, 'jp1.api.riotgames.com');
  assert.equal(u1.pathname, '/lol/league/v4/entries/by-puuid/P1');
  const u2 = new URL(calls[2].url);
  assert.equal(u2.host, 'asia.api.riotgames.com');
  assert.equal(u2.pathname, '/lol/match/v5/matches/by-puuid/P1/ids');
  assert.equal(u2.searchParams.get('queue'), '440');
  assert.equal(u2.searchParams.get('count'), '100');
  assert.equal(u2.searchParams.get('startTime'), '1759881600');
  assert.equal(new URL(calls[3].url).pathname, '/lol/match/v5/matches/JP1_2');
});

test('F-009 基準26: summoner-v4 と champion-mastery-v4(上位・合計)は jp1 へ、キーを見出しでだけ送って取得日時つきで返す', async () => {
  const { fetch, calls } = scripted([
    json({ puuid: 'P1', summonerLevel: 321 }),
    json([{ championId: 1, championPoints: 1000 }]),
    json(4321),
  ]);
  const now = () => new Date('2026-10-09T00:00:00.000Z');
  const client = createRiotClient({ apiKey: KEY, fetch, sleep: fakeSleep().sleep, now });
  const s = await client.summonerByPuuid('P/1');
  const top = await client.championMasteryTop('P/1', 10);
  const score = await client.championMasteryScore('P/1');
  assert.equal(s.data.summonerLevel, 321);
  assert.equal(s.retrievedAt, '2026-10-09T00:00:00.000Z');
  assert.equal(top.data[0].championPoints, 1000);
  assert.equal(top.retrievedAt, '2026-10-09T00:00:00.000Z');
  assert.equal(score.data, 4321);
  assert.equal(score.retrievedAt, '2026-10-09T00:00:00.000Z');
  const [u0, u1, u2] = calls.map((c) => new URL(c.url));
  for (const u of [u0, u1, u2]) assert.equal(u.host, 'jp1.api.riotgames.com');
  assert.equal(u0.pathname, '/lol/summoner/v4/summoners/by-puuid/P%2F1');
  assert.equal(u1.pathname, '/lol/champion-mastery/v4/champion-masteries/by-puuid/P%2F1/top');
  assert.equal(u1.searchParams.get('count'), '10');
  assert.equal(u2.pathname, '/lol/champion-mastery/v4/scores/by-puuid/P%2F1');
  assert.ok(calls.every((c) => c.token === KEY && !c.url.includes(KEY)));
});

test('キーの読み込み: 環境変数 RIOT_API_KEY から読み、無ければキーを含まない文で失敗する', () => {
  assert.equal(loadApiKey({ RIOT_API_KEY: ` ${KEY}\n` }), KEY);
  assert.throws(() => loadApiKey({}), /RIOT_API_KEY/);
  assert.throws(() => loadApiKey({ RIOT_API_KEY: '  ' }), /RIOT_API_KEY/);
});
