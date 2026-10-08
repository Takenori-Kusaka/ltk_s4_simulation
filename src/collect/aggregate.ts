// F-003 基準2・6: 保存した試合の詳細(data/raw/)から選手ごと・チャンピオンごとに集計し、集計値だけを data/public/ へ出す
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROSTER } from '../data/roster.ts';
import { validatePlayerFile } from '../data/validate.ts';
import type { Confidence, Evidence, PlayerFile, RecentMatch } from '../data/types.ts';
import { INITIAL_MATCH_COUNT } from './collect.ts';
import type { PlayerRecord } from './collect.ts';
import { QUEUE_FLEX, QUEUE_SOLO } from './riot.ts';
import { loadSnapshotFile, toPlayerFile } from './snapshots.ts';
import type { QualitativeSnapshot, StaticSnapshot } from './snapshots.ts';

/** 試合数・勝率・KDA・分あたり CS・分あたり視界・ダメージ割合・キル関与率。比率は試合の合計どうしで割る */
export interface Stats {
  games: number;
  wins: number;
  winRate: number;
  kda: number;
  csPerMin: number;
  visionPerMin: number;
  damageShare: number;
  killParticipation: number;
}
export interface ChampionStats extends Stats { champion: string }

/** data/public/champion-stats/<playerId>.json の形(PlayerFile にチャンピオン別の置き場が無いため別のファイルにする) */
export interface ChampionStatsFile {
  playerId: string;
  source: string;
  /** YYYY-MM-DD */
  retrievedAt: string;
  author: { kind: 'riot-api' };
  champions: ChampionStats[];
}

export interface AggregateResult {
  overall: Stats;
  champions: ChampionStats[];
  recentMatches: RecentMatch[];
}

/** 1試合から取り出した、本人の集計に要る値だけ */
interface Row {
  created: number; champion: string; win: boolean; kills: number; deaths: number; assists: number;
  cs: number; vision: number; damage: number; teamDamage: number; teamKills: number; minutes: number;
}

const RANKED_QUEUES = new Set([QUEUE_SOLO, QUEUE_FLEX]);
const JST_MS = 9 * 3600_000;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const round = (v: number) => Math.round(v * 1000) / 1000;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** match-v5 の試合の詳細から本人の行を取り出す。ランク以外・リメイク・本人のいない試合は null */
function toRow(puuid: string, match: unknown): Row | null {
  if (!isObj(match) || !isObj(match.info) || !Array.isArray(match.info.participants)) return null;
  const info = match.info;
  if (!RANKED_QUEUES.has(num(info.queueId))) return null;
  const parts = (info.participants as unknown[]).filter(isObj);
  const me = parts.find((p) => p.puuid === puuid);
  if (!me || me.gameEndedInEarlySurrender === true) return null;
  const team = parts.filter((p) => p.teamId === me.teamId);
  // gameEndTimestamp の無い古い試合は gameDuration がミリ秒
  const seconds = info.gameEndTimestamp === undefined ? num(info.gameDuration) / 1000 : num(info.gameDuration);
  if (seconds <= 0) return null;
  const sum = (key: string) => team.reduce((s, p) => s + num(p[key]), 0);
  return {
    created: num(info.gameCreation), champion: String(me.championName ?? ''), win: me.win === true,
    kills: num(me.kills), deaths: num(me.deaths), assists: num(me.assists),
    cs: num(me.totalMinionsKilled) + num(me.neutralMinionsKilled), vision: num(me.visionScore),
    damage: num(me.totalDamageDealtToChampions), teamDamage: sum('totalDamageDealtToChampions'), teamKills: sum('kills'),
    minutes: seconds / 60,
  };
}

function statsOf(rows: Row[]): Stats {
  const t = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0);
  const minutes = t((r) => r.minutes);
  const wins = rows.filter((r) => r.win).length;
  const div = (a: number, b: number) => (b > 0 ? round(a / b) : 0);
  return {
    games: rows.length,
    wins,
    winRate: div(wins, rows.length),
    // デス0 は 1 として割る
    kda: round((t((r) => r.kills) + t((r) => r.assists)) / Math.max(1, t((r) => r.deaths))),
    csPerMin: div(t((r) => r.cs), minutes),
    visionPerMin: div(t((r) => r.vision), minutes),
    damageShare: div(t((r) => r.damage), t((r) => r.teamDamage)),
    killParticipation: div(t((r) => r.kills + r.assists), t((r) => r.teamKills)),
  };
}

/** 本人(puuid)の直近 window 試合(ランクのソロ・フレックス)を集計する */
export function aggregateMatches(puuid: string, matches: readonly unknown[], opts: { window?: number } = {}): AggregateResult {
  const rows = matches
    .map((m) => toRow(puuid, m))
    .filter((r): r is Row => r !== null)
    .sort((a, b) => b.created - a.created)
    .slice(0, opts.window ?? INITIAL_MATCH_COUNT);
  const byChampion = new Map<string, Row[]>();
  for (const r of rows) byChampion.set(r.champion, [...(byChampion.get(r.champion) ?? []), r]);
  const champions = [...byChampion]
    .map(([champion, rs]) => ({ champion, ...statsOf(rs) }))
    .sort((a, b) => b.games - a.games || a.champion.localeCompare(b.champion));
  const recentMatches: RecentMatch[] = rows.map((r) => ({
    date: new Date(r.created + JST_MS).toISOString().slice(0, 10), queue: 'ranked', champion: r.champion, win: r.win,
    kills: r.kills, deaths: r.deaths, assists: r.assists, cs: r.cs,
  }));
  return { overall: statsOf(rows), champions, recentMatches };
}

/** 試合数による確度。少ない試合の集計は揺れが大きい */
const confidenceOf = (games: number): Confidence => (games >= 20 ? '高' : games >= 10 ? '中' : '低');
const RANK_QUEUES = { soloRank: 'RANKED_SOLO_5x5', flexRank: 'RANKED_FLEX_SR' } as const;

/** 収集の記録と試合の詳細から、公開してよい集計値だけの指標ファイルとチャンピオン別の集計を作る */
export function buildPublicPlayer(
  record: PlayerRecord,
  matches: readonly unknown[],
  opts: { window?: number } = {},
): { player: PlayerFile; championStats: ChampionStatsFile } {
  const agg = aggregateMatches(record.puuid ?? '', matches, opts);
  const date = record.collectedAt.slice(0, 10);
  const metrics: Record<string, Evidence> = {};

  const league = record.league;
  for (const [key, queueType] of Object.entries(RANK_QUEUES)) {
    const e = league?.data.find((x) => x.queueType === queueType);
    if (!league || !e?.tier) continue;
    metrics[key] = {
      value: `${e.tier} ${e.rank ?? ''} ${e.leaguePoints ?? 0}`.replace(/\s+/g, ' '),
      source: 'Riot API league-v4', retrievedAt: league.retrievedAt.slice(0, 10), confidence: '高', author: { kind: 'riot-api' },
    };
  }

  const o = agg.overall;
  const source = `Riot API match-v5 (直近${o.games}試合)`;
  if (o.games > 0) {
    const values: Record<string, number> = {
      rankedGames: o.games, rankedWinRate: o.winRate, kda: o.kda, csPerMin: o.csPerMin, visionPerMin: o.visionPerMin,
      killParticipation: o.killParticipation, damageShare: o.damageShare, championPoolSize: agg.champions.length,
    };
    for (const [key, value] of Object.entries(values)) {
      metrics[key] = { value, source, retrievedAt: date, confidence: confidenceOf(o.games), author: { kind: 'riot-api' } };
    }
  }
  return {
    player: { playerId: record.playerId, metrics, qualitative: {}, recentMatches: agg.recentMatches },
    championStats: { playerId: record.playerId, source, retrievedAt: date, author: { kind: 'riot-api' }, champions: agg.champions },
  };
}

export interface WritePublicOptions {
  /** 収集の出力(既定は data/raw) */
  rawDir: string;
  /** 公開の配信物の置き場(既定は data/public) */
  publicDir: string;
  /** 静的・定性のスナップショット(既定は data/snapshots)。無ければ API の集計だけを出す */
  snapshotsDir?: string;
  window?: number;
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const jsonFiles = (dir: string | undefined) =>
  dir && existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => join(dir, n)) : [];

/** 選手ごとに players/<id>.json(指標ファイル)と champion-stats/<id>.json を書く。生の応答の項目は書かない(基準6) */
export function writePublicData(opts: WritePublicOptions): { written: string[]; errors: string[] } {
  const errors: string[] = [];
  const written: string[] = [];
  const statics: StaticSnapshot[] = [];
  const qualitatives: QualitativeSnapshot[] = [];
  for (const path of jsonFiles(opts.snapshotsDir)) {
    try {
      const s = loadSnapshotFile(path);
      errors.push(...s.errors);
      if (s.kind === 'static') statics.push(s.snapshot);
      if (s.kind === 'qualitative') qualitatives.push(s.snapshot);
    } catch (e) {
      errors.push(`${path}: ${(e as Error).message}`);
    }
  }

  const records = new Map<string, PlayerRecord>();
  for (const path of jsonFiles(join(opts.rawDir, 'players'))) {
    try {
      const rec = readJson(path) as PlayerRecord;
      records.set(rec.playerId, rec);
    } catch (e) {
      errors.push(`${path}: ${(e as Error).message}`);
    }
  }

  const write = (path: string, value: unknown) => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
    written.push(path);
  };

  for (const { id } of ROSTER) {
    const base = toPlayerFile(id, statics, qualitatives);
    const rec = records.get(id);
    const matches = (rec?.status === '取得済み' ? rec.matchIds : []).flatMap((m) => {
      const path = join(opts.rawDir, 'matches', `${m}.json`);
      if (!existsSync(path)) return [];
      try {
        return [(readJson(path) as { data?: unknown }).data];
      } catch (e) {
        errors.push(`${path}: ${(e as Error).message}`);
        return [];
      }
    });
    const built = rec?.status === '取得済み' ? buildPublicPlayer(rec, matches, { window: opts.window }) : undefined;

    // 同じ項目は取得日の新しい値を採る(同じ日なら API の値)
    const metrics = { ...base.metrics };
    for (const [key, e] of Object.entries(built?.player.metrics ?? {})) {
      if (e && (!metrics[key] || e.retrievedAt >= metrics[key]!.retrievedAt)) metrics[key] = e;
    }
    const player: PlayerFile = { ...base, metrics, recentMatches: built?.player.recentMatches ?? [] };
    if (Object.keys(metrics).length + Object.keys(player.qualitative).length + player.recentMatches.length === 0) continue;
    const errs = validatePlayerFile(player);
    if (errs.length > 0) {
      errors.push(...errs);
      continue;
    }
    write(join(opts.publicDir, 'players', `${id}.json`), player);
    if (built && built.championStats.champions.length > 0) {
      write(join(opts.publicDir, 'champion-stats', `${id}.json`), built.championStats);
    }
  }
  return { written, errors };
}
