// F-009 Task-7(旧 Task-4b): 60 選手の評価を組み立てる(データの6軸 + 根拠の2軸 + 調子の係数)
// 純粋な組み立て(buildRatings)と、data/raw と根拠の記録からの読み込み(loadRatingInputs)を分ける
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROSTER } from '../data/roster.ts';
import { buildRatingContext, rateDataAxes, type RatedAxis } from './axes.ts';
import { extractGame, loadEngineConfig, populationMatch } from './engine.ts';
import {
  readCareerSnapshot, readShotcallingSnapshot, readTournamentSnapshot, shotcallingAxis, tournamentAxis,
  type EvidenceAxisResult, type ShotcallingEvidence, type TournamentRecord,
} from './evidence.ts';
import { applyForm, formFactor, type FormGame, type FormResult, type LeagueSnapshot } from './form.ts';
import type { Confidence, ExProCareer, GameRecord, MatchForPopulation, RankEntry } from './types.ts';
import axesConfig from './axes.json' with { type: 'json' };
import ratingConfig from './config.json' with { type: 'json' };
import knownFacts from './known-facts.json' with { type: 'json' };

/** 大会のロール(名簿の表記)→ teamPosition */
export const POSITION: Record<string, string> = { TOP: 'TOP', JG: 'JUNGLE', MID: 'MIDDLE', ADC: 'BOTTOM', SUP: 'UTILITY' };

export interface PlayerRatingInput {
  playerId: string;
  name: string;
  /** 階級(NEXT・CORE・MASTERS) */
  tier: string;
  /** 大会のロール(teamPosition の値) */
  position: string;
  rank: RankEntry | null;
  /** 出典つきの最高ランク(経歴の記録 career.json の peak.allTime。基準28) */
  peakRank?: RankEntry | null;
  /** 出典つきのプロの経歴(経歴の記録の lol.highestLevel。基準29) */
  exPro?: ExProCareer | null;
  games: GameRecord[];
  league: LeagueSnapshot[];
  masteryScore?: number;
  shotcalling: ShotcallingEvidence[];
  tournament: TournamentRecord;
}

export interface RatingInputs {
  players: PlayerRatingInput[];
  matches: MatchForPopulation[];
}

export interface AxisRating {
  key: string;
  label: string;
  /** 基礎の点数(調子を加える前) */
  base: number;
  /** 表示の点数 = 基礎 + (係数 − 1) × 5(基準19) */
  display: number;
  confidence: Confidence;
  /** データの軸: 事前値だけで決まった */
  estimated: boolean;
  marks: string[];
  reason: string;
  data?: RatedAxis;
  evidence?: EvidenceAxisResult;
}

export interface PlayerRating {
  playerId: string;
  name: string;
  tier: string;
  position: string;
  form: FormResult;
  axes: AxisRating[];
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const EMPTY_RECORD: TournamentRecord = { ltk: [], coach: [], pro: [], other: [] };

/** 評価設定の版: 評価に効く設定ファイルの内容のハッシュ(先頭 12 文字) */
export function configVersion(): string {
  const h = createHash('sha256');
  for (const c of [ratingConfig, axesConfig, knownFacts]) h.update(JSON.stringify(c));
  return h.digest('hex').slice(0, 12);
}

/** 調子に使う試合(勝敗は participant の win を 1・0 にした値) */
const formGames = (games: readonly GameRecord[]): FormGame[] =>
  games.map((g) => ({ endTime: g.endTime, durationMin: g.durationMin, queueId: g.queueId, win: g.me.win === 1 }));

/** 全選手の評価。同じ入力と基準日なら同じ結果を返す(基準23) */
export function buildRatings(inputs: RatingInputs, now: number): PlayerRating[] {
  const cfg = loadEngineConfig();
  const ratingPlayers = inputs.players.map((p) => ({
    playerId: p.playerId,
    tier: p.tier,
    position: p.position,
    rank: p.rank,
    peakRank: p.peakRank ?? null,
    exPro: p.exPro ?? null,
    games: p.games,
    ltkSeasons: new Set(p.tournament.ltk.map((x) => x.season)).size,
    ltkSeasonNames: [...new Set(p.tournament.ltk.map((x) => x.season))].sort(),
    masteryScore: p.masteryScore,
  }));
  const ctx = buildRatingContext(ratingPlayers, inputs.matches, cfg, now);
  return inputs.players.map((p, i) => {
    const form = formFactor(formGames(p.games), p.league, now);
    const show = (base: number) => round2(applyForm(base, form.coefficient));
    const data = rateDataAxes(ratingPlayers[i], ctx).map((a): AxisRating => ({
      key: a.key,
      label: a.label,
      base: round2(a.base),
      display: show(a.base),
      confidence: a.confidence,
      estimated: a.estimated,
      marks: [],
      reason: [`ランクの基準 ${a.anchor.toFixed(2)}(${a.anchorSource}${a.anchorNote ? `: ${a.anchorNote}` : ''})`, `補正 ${a.correction.toFixed(2)} × 縮小 ${a.shrink.toFixed(2)}`, a.bonusReason]
        .filter(Boolean)
        .join('。'),
      data: a,
    }));
    const evidence = [shotcallingAxis(p.shotcalling), tournamentAxis(p.tournament)].map((e): AxisRating => ({
      key: e.key,
      label: e.label,
      base: e.score,
      display: show(e.score),
      confidence: e.confidence,
      estimated: false,
      marks: e.marks,
      reason: e.reason,
      evidence: e,
    }));
    return { playerId: p.playerId, name: p.name, tier: p.tier, position: p.position, form, axes: [...data, ...evidence] };
  });
}

// --- 読み込み(Node の I/O) ---

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

interface RawRecord {
  playerId: string;
  status?: string;
  collectedAt?: string;
  puuid?: string;
  league?: { data?: { queueType: string; tier: string; rank: string; leaguePoints: number }[] };
  masteryScore?: { data?: number } | number;
  matchIds?: string[];
}

export interface LoadOptions {
  rawDir: string;
  /** 根拠の正規化した記録の置き場(shotcalling.json・tournament.json。career.json はあれば読む) */
  groundsDir: string;
}

/** data/raw と根拠の記録から評価の入力を作る。読めないファイルは errors に出す */
export function loadRatingInputs(opts: LoadOptions): { inputs: RatingInputs; errors: string[] } {
  const errors: string[] = [];
  const read = <T>(path: string): T | null => {
    try {
      return readJson(path) as T;
    } catch (e) {
      errors.push(`${path}: ${(e as Error).message}`);
      return null;
    }
  };
  const sc = readShotcallingSnapshot(read(join(opts.groundsDir, 'shotcalling.json')));
  const tr = readTournamentSnapshot(read(join(opts.groundsDir, 'tournament.json')));
  // 経歴の記録(基準28)。無ければ従来どおり(ソロランク、無ければ母集団の中央値)
  const careerPath = join(opts.groundsDir, 'career.json');
  const cr: ReturnType<typeof readCareerSnapshot> = existsSync(careerPath) ? readCareerSnapshot(read(careerPath)) : { players: {}, errors: [] };
  errors.push(...sc.errors, ...tr.errors, ...cr.errors);

  const infos = new Map<string, unknown>();
  const matchInfo = (id: string) => {
    if (!infos.has(id)) {
      const path = join(opts.rawDir, 'matches', `${id}.json`);
      infos.set(id, existsSync(path) ? (read<{ data?: { info?: unknown } }>(path)?.data?.info ?? null) : null);
    }
    return infos.get(id) as Parameters<typeof extractGame>[1] | null;
  };

  const players = ROSTER.map((r): PlayerRatingInput => {
    const path = join(opts.rawDir, 'players', `${r.id}.json`);
    const raw = existsSync(path) ? read<RawRecord>(path) : null;
    const ok = raw?.status === '取得済み' && !!raw.puuid;
    const solo = ok ? raw!.league?.data?.find((e) => e.queueType === 'RANKED_SOLO_5x5') : undefined;
    const games = ok
      ? (raw!.matchIds ?? []).flatMap((id) => {
          const info = matchInfo(id);
          const g = info ? extractGame(id, info, raw!.puuid!) : null;
          return g ? [g] : [];
        })
      : [];
    const ms = raw?.masteryScore;
    return {
      playerId: r.id,
      name: r.name,
      tier: r.tier,
      position: POSITION[r.role],
      rank: solo ? { tier: solo.tier, division: solo.rank, lp: solo.leaguePoints } : null,
      peakRank: cr.players[r.id]?.peakRank ?? null,
      exPro: cr.players[r.id]?.exPro ?? null,
      games,
      league: solo && raw?.collectedAt ? [{ date: raw.collectedAt, tier: solo.tier, division: solo.rank, lp: solo.leaguePoints }] : [],
      masteryScore: typeof ms === 'number' ? ms : typeof ms?.data === 'number' ? ms.data : undefined,
      shotcalling: sc.players[r.id] ?? [],
      tournament: tr.players[r.id] ?? EMPTY_RECORD,
    };
  });
  const matches = [...infos.values()].filter((x): x is NonNullable<ReturnType<typeof matchInfo>> => !!x).map(populationMatch);
  return { inputs: { players, matches }, errors };
}

