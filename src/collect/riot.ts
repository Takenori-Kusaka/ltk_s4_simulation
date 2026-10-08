// F-003 基準3・5: Riot API の呼び出し。キーは X-Riot-Token の見出しでだけ送り、URL・例外・保存物へ出さない
export const QUEUE_SOLO = 420;
export const QUEUE_FLEX = 440;

const REGION = 'https://asia.api.riotgames.com'; // account-v1・match-v5 の地域ルーティング
const PLATFORM = 'https://jp1.api.riotgames.com'; // league-v4 のプラットフォーム

/** Retry-After が無い 429 で待つ秒数 */
const DEFAULT_RETRY_SECONDS = 1;

export interface FetchResponse {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}
export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<FetchResponse>;

/** 取得した応答。url はキーを含まない */
export interface RiotResponse<T> {
  url: string;
  retrievedAt: string;
  data: T;
}

export interface Account { puuid: string; gameName?: string; tagLine?: string }
export interface LeagueEntry { queueType: string; tier?: string; rank?: string; leaguePoints?: number; wins?: number; losses?: number }

export class RiotHttpError extends Error {
  readonly status: number;
  readonly url: string;
  constructor(status: number, url: string) {
    // 応答の本文はキーを含み得るため、例外の文には載せない
    super(`Riot API が HTTP ${status} を返した: ${url}`);
    this.name = 'RiotHttpError';
    this.status = status;
    this.url = url;
  }
}

/** 環境変数 RIOT_API_KEY からキーを読む。手動の実行では `node --env-file=scripts/.env src/collect/cli.ts` で渡す */
export function loadApiKey(env: Record<string, string | undefined>): string {
  const key = env.RIOT_API_KEY?.trim();
  if (!key) throw new Error('環境変数 RIOT_API_KEY が設定されていない');
  return key;
}

export interface RiotClientOptions {
  apiKey: string;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

export interface RiotClient {
  accountByRiotId(gameName: string, tagLine: string): Promise<RiotResponse<Account>>;
  leagueEntriesByPuuid(puuid: string): Promise<RiotResponse<LeagueEntry[]>>;
  matchIdsByPuuid(puuid: string, q: { queue: number; count: number; startTime?: number }): Promise<RiotResponse<string[]>>;
  match(matchId: string): Promise<RiotResponse<unknown>>;
  /** 文中のキーを伏せる(保存・ログの前の多重の防御) */
  redact(text: string): string;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createRiotClient(opts: RiotClientOptions): RiotClient {
  const fetch = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? (() => new Date());
  const key = opts.apiKey;

  /** 基準3: 429 は Retry-After の秒数だけ待ち、同じ要求をやり直す。回数で打ち切らない */
  async function get<T>(url: string): Promise<RiotResponse<T>> {
    for (;;) {
      const res = await fetch(url, { headers: { 'X-Riot-Token': key } });
      if (res.status === 429) {
        const sec = Number(res.headers.get('Retry-After'));
        await sleep((Number.isFinite(sec) && sec > 0 ? sec : DEFAULT_RETRY_SECONDS) * 1000);
        continue;
      }
      if (res.status !== 200) throw new RiotHttpError(res.status, url);
      return { url, retrievedAt: now().toISOString(), data: (await res.json()) as T };
    }
  }
  const enc = encodeURIComponent;

  return {
    accountByRiotId: (gameName, tagLine) =>
      get(`${REGION}/riot/account/v1/accounts/by-riot-id/${enc(gameName)}/${enc(tagLine)}`),
    leagueEntriesByPuuid: (puuid) => get(`${PLATFORM}/lol/league/v4/entries/by-puuid/${enc(puuid)}`),
    matchIdsByPuuid: (puuid, q) => {
      const p = new URLSearchParams({ queue: String(q.queue), start: '0', count: String(q.count) });
      if (q.startTime !== undefined) p.set('startTime', String(q.startTime));
      return get(`${REGION}/lol/match/v5/matches/by-puuid/${enc(puuid)}/ids?${p}`);
    },
    match: (matchId) => get(`${REGION}/lol/match/v5/matches/${enc(matchId)}`),
    redact: (text) => text.split(key).join('***'),
  };
}
