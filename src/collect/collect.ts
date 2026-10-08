// F-003 基準1・4・5: 選手ごとのランクと差分の試合を Riot API から取り、生の応答を取得日時つきで data/raw/ へ保存する
// F-009 基準26・27: サモナーレベルと熟練度も保存し、試合は直近 120 日を最大 60 件まで取る
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { QUEUE_FLEX, QUEUE_SOLO, RiotHttpError } from './riot.ts';
import type { Account, ChampionMastery, LeagueEntry, RiotClient, RiotResponse, Summoner } from './riot.ts';

/** F-003 の初回の試合数。収集の取り方には使わない(aggregate.ts の集計の窓の既定として残す) */
export const INITIAL_MATCH_COUNT = 30;
/** F-009 基準27: 収集する試合の期間(日)。この期間より前の試合は要求しない */
export const MATCH_WINDOW_DAYS = 120;
/** F-009 基準27: 1回の収集で選手ごとに取る試合の上限(ソロ・フレックスの合計、新しい順) */
export const MAX_MATCHES = 60;
/** F-009 基準26: 熟練度の上位として取るチャンピオンの数 */
export const MASTERY_TOP_COUNT = 10;
/** 差分の収集で1つのキューから一度に取る試合ID の上限(match-v5 の count の上限) */
const DIFF_MATCH_COUNT = 100;
/** 前回の収集の時点で進行中だった試合を取りこぼさないための重なり(秒)。重なった試合は既知の ID として除く */
const OVERLAP_SECONDS = 3600;

export type PlayerStatus = '取得済み' | '未取得';

export interface CollectPlayer { id: string; riotId: string | null }

/** data/raw/players/<id>.json の形 */
export interface PlayerRecord {
  playerId: string;
  riotId: string | null;
  status: PlayerStatus;
  reason?: string;
  /** この記録を書いた収集の開始日時 */
  collectedAt: string;
  /** 最後に取得済みになった収集の開始時刻(エポック秒)。次の差分の起点 */
  lastCollectedAt?: number;
  /** 試合を集めた期間(日)。F-003 の記録には無く、無ければ次の収集で期間の全体を取り直す */
  windowDays?: number;
  puuid?: string;
  account?: RiotResponse<Account>;
  league?: RiotResponse<LeagueEntry[]>;
  summoner?: RiotResponse<Summoner>;
  masteryTop?: RiotResponse<ChampionMastery[]>;
  masteryScore?: RiotResponse<number>;
  matchIds: string[];
}

export interface CollectionSummary {
  startedAt: string;
  finishedAt: string;
  players: { playerId: string; status: PlayerStatus; reason?: string; newMatches: number }[];
}

export class CollectionLockedError extends Error {
  constructor(lockPath: string) {
    super(`ほかの収集が実行中(ロック ${lockPath} がある)。実行中の収集が無いのに残っている場合は、人がロックのファイルを消す`);
    this.name = 'CollectionLockedError';
  }
}

export interface CollectOptions {
  players: readonly CollectPlayer[];
  client: RiotClient;
  /** 生の応答の置き場(既定は data/raw。gitignore 済み) */
  dataDir: string;
  now?: () => Date;
  /** 選手ごとに取る試合の上限(既定は MAX_MATCHES) */
  maxMatches?: number;
  /** 画面への出力 */
  out?: (line: string) => void;
}

/** キーの無効・権限の不足。選手を替えても回復しないため収集を止める */
const isFatal = (e: unknown) => e instanceof RiotHttpError && (e.status === 401 || e.status === 403);
const reasonOf = (e: unknown) => (e instanceof RiotHttpError ? `HTTP ${e.status}` : e instanceof Error ? e.message : String(e));
/** JP1_123 の数値の部分。大きいほど新しい */
const matchSeq = (id: string) => Number(id.slice(id.lastIndexOf('_') + 1)) || 0;

export async function runCollection(opts: CollectOptions): Promise<CollectionSummary> {
  const { players, client, dataDir } = opts;
  const now = opts.now ?? (() => new Date());
  const maxMatches = opts.maxMatches ?? MAX_MATCHES;
  mkdirSync(dataDir, { recursive: true });

  // 二重起動の防止: 作成の排他(wx)でロックを取る
  const lockPath = join(dataDir, 'collect.lock');
  let fd: number;
  try {
    fd = openSync(lockPath, 'wx');
  } catch {
    throw new CollectionLockedError(lockPath);
  }
  const started = now();
  writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: started.toISOString() }));
  closeSync(fd);

  const playersDir = join(dataDir, 'players');
  const matchesDir = join(dataDir, 'matches');
  const logsDir = join(dataDir, 'logs');
  for (const d of [playersDir, matchesDir, logsDir]) mkdirSync(d, { recursive: true });
  const logPath = join(logsDir, `collect-${started.toISOString().replace(/[:.]/g, '-')}.log`);
  // 基準5: 保存・ログ・画面への出力は、すべて redact を通す
  const log = (msg: string) => {
    const line = client.redact(`${now().toISOString()} ${msg}`);
    appendFileSync(logPath, line + '\n');
    opts.out?.(line);
  };
  const writeJson = (path: string, value: unknown) => writeFileSync(path, client.redact(JSON.stringify(value, null, 2)) + '\n');

  const startedAt = started.toISOString();
  const startedSec = Math.floor(started.getTime() / 1000);
  const results: CollectionSummary['players'] = [];

  async function collectPlayer(p: CollectPlayer, prev: PlayerRecord | undefined): Promise<{ rec: PlayerRecord; newMatches: number }> {
    const known = new Set(prev?.matchIds ?? []);
    const base = { playerId: p.id, riotId: p.riotId, collectedAt: startedAt, matchIds: [...known] };
    const missing = (reason: string) => ({ rec: { ...prev, ...base, status: '未取得' as const, reason }, newMatches: 0 });
    if (!p.riotId) return missing('Riot ID 未登録');
    const hash = p.riotId.lastIndexOf('#');
    if (hash <= 0 || hash === p.riotId.length - 1) return missing('Riot ID の形式が「ゲーム名#タグ」でない');

    try {
      const account = await client.accountByRiotId(p.riotId.slice(0, hash), p.riotId.slice(hash + 1));
      const puuid = account.data.puuid;
      const league = await client.leagueEntriesByPuuid(puuid);
      // F-009 基準26: サモナーレベルと熟練度(上位・合計)
      const summoner = await client.summonerByPuuid(puuid);
      const masteryTop = await client.championMasteryTop(puuid, MASTERY_TOP_COUNT);
      const masteryScore = await client.championMasteryScore(puuid);

      // F-009 基準27: 直近 MATCH_WINDOW_DAYS 日の試合を新しい順に最大 maxMatches 件。
      // 2回目以降は前回の収集より後(起点は期間の始まりより前にしない)。期間の印の無い記録(F-003)は期間の全体を取り直す
      const windowStart = startedSec - MATCH_WINDOW_DAYS * 86_400;
      const full = prev?.lastCollectedAt === undefined || prev.windowDays !== MATCH_WINDOW_DAYS;
      const startTime = full ? windowStart : Math.max(windowStart, prev.lastCollectedAt! - OVERLAP_SECONDS);
      const ids = new Set<string>();
      for (const queue of [QUEUE_SOLO, QUEUE_FLEX]) {
        const q = { queue, count: full ? maxMatches : DIFF_MATCH_COUNT, startTime };
        for (const id of (await client.matchIdsByPuuid(puuid, q)).data) ids.add(id);
      }
      const fresh = [...ids].sort((a, b) => matchSeq(b) - matchSeq(a)).slice(0, maxMatches).filter((id) => !known.has(id));

      const added: string[] = [];
      for (const id of fresh) {
        const path = join(matchesDir, `${id}.json`);
        if (!existsSync(path)) {
          try {
            writeJson(path, await client.match(id));
          } catch (e) {
            if (isFatal(e)) throw e;
            log(`${p.id} 試合 ${id} の取得に失敗 (${reasonOf(e)})`);
            continue;
          }
        }
        added.push(id);
      }
      const rec: PlayerRecord = {
        ...base, status: '取得済み', lastCollectedAt: startedSec, windowDays: MATCH_WINDOW_DAYS,
        puuid, account, league, summoner, masteryTop, masteryScore, matchIds: [...known, ...added],
      };
      return { rec, newMatches: added.length };
    } catch (e) {
      if (isFatal(e)) throw e;
      // 基準4: 404 などはその選手を未取得とし、ほかの選手を続ける
      return missing(reasonOf(e));
    }
  }

  try {
    log(`収集の開始 対象 ${players.length} 名`);
    for (const p of players) {
      const recPath = join(playersDir, `${p.id}.json`);
      const prev = existsSync(recPath) ? (JSON.parse(readFileSync(recPath, 'utf8')) as PlayerRecord) : undefined;
      const { rec, newMatches } = await collectPlayer(p, prev);
      writeJson(recPath, rec);
      results.push({ playerId: p.id, status: rec.status, ...(rec.reason ? { reason: rec.reason } : {}), newMatches });
      log(rec.status === '取得済み' ? `${p.id} 取得済み 新しい試合 ${newMatches} 件` : `${p.id} 未取得 (${rec.reason})`);
    }
    const ok = results.filter((r) => r.status === '取得済み').length;
    log(`収集の終了 取得済み ${ok} 名 / 未取得 ${results.length - ok} 名`);
    return { startedAt, finishedAt: now().toISOString(), players: results };
  } catch (e) {
    log(`エラーにより収集を中断 (${reasonOf(e)})`);
    log('収集の終了(中断)');
    throw e;
  } finally {
    unlinkSync(lockPath);
  }
}
