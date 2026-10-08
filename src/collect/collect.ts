// F-003 基準1・4・5: 選手ごとのランクと差分の試合を Riot API から取り、生の応答を取得日時つきで data/raw/ へ保存する
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { QUEUE_FLEX, QUEUE_SOLO, RiotHttpError } from './riot.ts';
import type { Account, LeagueEntry, RiotClient, RiotResponse } from './riot.ts';

/** 初回の収集で取る試合数(ソロ・フレックスの合計。spec「確定した事項」) */
export const INITIAL_MATCH_COUNT = 30;
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
  puuid?: string;
  account?: RiotResponse<Account>;
  league?: RiotResponse<LeagueEntry[]>;
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
  initialCount?: number;
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
  const initialCount = opts.initialCount ?? INITIAL_MATCH_COUNT;
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

      // 基準1: 前回の収集より後の試合だけ(初回は直近 initialCount 試合)
      const ids = new Set<string>();
      for (const queue of [QUEUE_SOLO, QUEUE_FLEX]) {
        const q = prev?.lastCollectedAt !== undefined
          ? { queue, count: DIFF_MATCH_COUNT, startTime: prev.lastCollectedAt - OVERLAP_SECONDS }
          : { queue, count: initialCount };
        for (const id of (await client.matchIdsByPuuid(puuid, q)).data) if (!known.has(id)) ids.add(id);
      }
      let fresh = [...ids].sort((a, b) => matchSeq(b) - matchSeq(a));
      if (prev?.lastCollectedAt === undefined) fresh = fresh.slice(0, initialCount);

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
        ...base, status: '取得済み', lastCollectedAt: startedSec, puuid, account, league, matchIds: [...known, ...added],
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
