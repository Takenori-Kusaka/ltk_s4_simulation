// F-009 Task-7(旧 Task-4b): 60 選手の評価を組み立てる(データの6軸 + 根拠の2軸 + 調子の係数)
// 純粋な組み立て(buildRatings)と、data/raw と根拠の記録からの読み込み(loadRatingInputs)を分ける
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROSTER } from '../data/roster.ts';
import { scrimGameRecords } from '../results/to-games.ts';
import type { MatchResult } from '../results/types.ts';
import { buildRatingContext, DATA_AXES, rateDataAxes, type RatedAxis } from './axes.ts';
import { blankInfo, buildResultsPopulation, extractGame, loadEngineConfig, officialSentence, populationMatch, REACH_UNKNOWN_DOWNGRADE, scrimSentence } from './engine.ts';
import { roleSwitchDiscount,
  mergeProYears, readCareerSnapshot, readShotcallingSnapshot, readTournamentSnapshot, shotcallingAxis, tournamentAxis,
  type EvidenceAxisResult, type ShotcallingEvidence, type TournamentRecord,
} from './evidence.ts';
import { loadOwnerViewConfig, ownerViewAdjust, ownerViewSentence, readOwnerViews, type OwnerView, type OwnerViewAdjust } from './owner-views.ts';
import { applyForm, formFactor, type FormGame, type FormResult, type LeagueSnapshot } from './form.ts';
import type { Confidence, ExProCareer, GameRecord, MatchForPopulation, RankEntry } from './types.ts';
import axesConfig from './axes.json' with { type: 'json' };
import ratingConfig from './config.json' with { type: 'json' };
import knownFacts from './known-facts.json' with { type: 'json' };

/** 大会のロール(名簿の表記)→ teamPosition */
export const POSITION: Record<string, string> = { TOP: 'TOP', JG: 'JUNGLE', MID: 'MIDDLE', ADC: 'BOTTOM', SUP: 'UTILITY' };
/** ポジション → LTK の出場記録のロールの記法 */
export const ROLE_OF: Record<string, string> = Object.fromEntries(Object.entries(POSITION).map(([k, v]) => [v, k]));

export interface PlayerRatingInput {
  playerId: string;
  name: string;
  /** 階級(NEXT・CORE・MASTERS) */
  tier: string;
  /** 大会のロール(teamPosition の値) */
  position: string;
  rank: RankEntry | null;
  /** 出典つきの歴代の最高ランク(経歴の記録 career.json の peak.allTime。基準28) */
  peakRank?: RankEntry | null;
  /** 出典つきの今季の最高ランク(経歴の記録の peak.thisSeason。ソロランク・歴代と合わせ、基準の値が最も高い記録を採る) */
  seasonPeakRank?: RankEntry | null;
  /** 出典つきのプロの経歴(経歴の記録の lol.highestLevel。基準29) */
  exPro?: ExProCareer | null;
  games: GameRecord[];
  league: LeagueSnapshot[];
  masteryScore?: number;
  shotcalling: ShotcallingEvidence[];
  tournament: TournamentRecord;
  /** 価値責任者の見立て(基準37。owner-views.json の選手を対象とする項目) */
  ownerViews?: OwnerView[];
}

export interface RatingInputs {
  players: PlayerRatingInput[];
  matches: MatchForPopulation[];
  /** 価値責任者の見立てのうち階級チーム・コーチを対象とする項目(F-010 基準23〜25 が使う) */
  teamViews?: OwnerView[];
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
  /** 価値責任者の見立ての加点(基準37・39)。項目が無ければ持たない */
  ownerView?: OwnerViewAdjust;
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
const downgrade = (c: Confidence): Confidence => (c === '高' ? '中' : '低');
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
    // 基準33〜35: 到達点からのブランクを記録へ載せる。歴代の最高ランクは到達の時点から、元プロの下限は最終出場年(7 月 1 日)から計算の基準日まで。
    // 到達の時点・最終出場年の無い記録は不明(減衰なし)。ソロランクと今季の最高ランクは減衰しないため載せない
    peakRank: p.peakRank ? { ...p.peakRank, blank: blankInfo(p.peakRank.reachedAt, now, cfg) } : null,
    seasonPeakRank: p.seasonPeakRank ?? null,
    exPro: p.exPro ? { ...p.exPro, blank: blankInfo(p.exPro.lastYear === undefined ? null : String(p.exPro.lastYear), now, cfg) } : null,
    games: p.games,
    ltkSeasons: new Set(p.tournament.ltk.map((x) => x.season)).size,
    ltkSeasonNames: [...new Set(p.tournament.ltk.map((x) => x.season))].sort(),
    masteryScore: p.masteryScore,
  }));
  const ctx = buildRatingContext(ratingPlayers, inputs.matches, cfg, now);
  const ovCfg = loadOwnerViewConfig();
  return inputs.players.map((p, i) => {
    const form = formFactor(formGames(p.games), p.league, now);
    const show = (base: number) => round2(applyForm(base, form.coefficient));
    // 基準31: ロール転向の割引(LTK の出場シーズンのうち今のロール以外の割合 × 設定の値)をデータの軸から引く
    const discount = roleSwitchDiscount(p.tournament, ROLE_OF[p.position], cfg.roleSwitchPenalty ?? 0);
    const rated = rateDataAxes(ratingPlayers[i], ctx);
    // 基準35: ランクの基準は 6 軸で同じ記録を採る。ピックプールは確度を自分で決める(axes.ts の ratePool)ため、
    // 到達の時点が不明な記録を採ったときの 1 段下げを、ここでほかの 5 軸に揃える
    const whenUnknown = rated.some((a) => a.anchorWhenUnknown);
    const aligned = rated.map((a): RatedAxis => (a.key === 'pool' && whenUnknown && !a.anchorWhenUnknown
      ? { ...a, anchorWhenUnknown: true, ...(a.estimated ? {} : { confidence: downgrade(a.confidence), confidenceReason: `${a.confidenceReason}。${REACH_UNKNOWN_DOWNGRADE}` }) }
      : a));
    const data = aligned.map((a): AxisRating => {
      // 基準37: 価値責任者の見立ての加点を、ロール転向の割引の後・調子の前に加える
      const ov = ownerViewAdjust(p.ownerViews ?? [], a.key, ovCfg);
      const base = Math.min(10, Math.max(0, a.base - discount.value + (ov?.value ?? 0)));
      return {
      key: a.key,
      label: a.label,
      base: round2(base),
      display: show(base),
      confidence: a.confidence,
      estimated: a.estimated,
      marks: [],
      // F-004 基準15・42: スクリム・本番の試合を使った軸は、その数と重み(ピックプールは 1 試合として数えるため 1.0)を説明に示す
      reason: [`ランクの基準 ${a.anchor.toFixed(2)}(${a.anchorSource}${a.anchorNote ? `: ${a.anchorNote}` : ''})`, `補正 ${a.correction.toFixed(2)} × 縮小 ${a.shrink.toFixed(2)}`, a.shapeAdj !== undefined && Math.abs(a.shapeAdj) >= 0.005 ? `形の補正 ${a.shapeAdj > 0 ? '+' : ''}${a.shapeAdj.toFixed(2)}(6 軸の平均からのずれ)` : undefined, a.bonusReason, scrimSentence(a.scrimGames, a.key === 'pool' ? 1 : cfg.scrimGameWeight ?? 1), officialSentence(a.officialGames, a.key === 'pool' ? 1 : cfg.officialGameWeight ?? 1)]
        .filter(Boolean)
        .join('。') + (discount.reason ? `。${discount.reason}` : '') + (ov ? `。${ownerViewSentence(ov)}` : ''),
      data: a,
      ...(ov ? { ownerView: ov } : {}),
      };
    });
    const evidence = [shotcallingAxis(p.shotcalling), tournamentAxis(p.tournament, undefined, ROLE_OF[p.position])].map((e): AxisRating => ({
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
  /** F-004 基準12・41: 受け付けた試合結果の記録(src/results/load.ts)。スクリム・本番の記録を選手の試合の記録に足す。無ければ足さない */
  scrims?: readonly MatchResult[];
}

/** data/raw と根拠の記録から評価の入力を作る。読めないファイルは errors に、読まなかった根拠は warnings に出す */
export function loadRatingInputs(opts: LoadOptions): { inputs: RatingInputs; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const scrimGames = scrimGameRecords(opts.scrims ?? []);
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
  // 基準37・38: 価値責任者の見立て。無ければ加点しない。使えない項目は警告にする
  const ovPath = join(opts.groundsDir, 'owner-views.json');
  const ov = readOwnerViews(existsSync(ovPath) ? read(ovPath) : null, new Set(ROSTER.map((r) => r.id)));
  const warnings = [...sc.warnings, ...ov.warnings];

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
    const career = cr.players[r.id];
    // 基準12 の追記: プロの年数は経歴の記録(career.json の lol.years)と出場記録(tournament.json)の大きい方
    const record = tr.players[r.id] ?? EMPTY_RECORD;
    return {
      playerId: r.id,
      name: r.name,
      tier: r.tier,
      position: POSITION[r.role],
      rank: solo ? { tier: solo.tier, division: solo.rank, lp: solo.leaguePoints } : null,
      peakRank: career?.peakRank ?? null,
      seasonPeakRank: career?.seasonPeakRank ?? null,
      exPro: career?.exPro ?? null,
      games: [...games, ...(scrimGames.get(r.id) ?? [])],
      league: solo && raw?.collectedAt ? [{ date: raw.collectedAt, tier: solo.tier, division: solo.rank, lp: solo.leaguePoints }] : [],
      masteryScore: typeof ms === 'number' ? ms : typeof ms?.data === 'number' ? ms.data : undefined,
      shotcalling: sc.players[r.id] ?? [],
      // 基準12 の改訂(2026-10-11): 国際大会の記録(career.json の lol.internationalEvents。出典つき)を大会経験の入力に加える
      tournament: { ...record, pro: mergeProYears(record.pro, career?.lol), international: career?.lol?.international ?? [] },
      ownerViews: ov.players[r.id] ?? [],
    };
  });
  // F-004 基準40: csAt14 の組の数が下限に満たないロールと組の数を出力する(評価の組み立て buildRatingContext と同じ入力・同じ計算)。
  // 実戦の記録(スクリム・本番)が 1 件も無ければ出さない
  const allGames = players.flatMap((p) => p.games);
  if (allGames.some((g) => g.kind !== undefined)) {
    warnings.push(...buildResultsPopulation(allGames, DATA_AXES, loadEngineConfig().cs14MinPairs ?? 0).warnings);
  }
  const matches = [...infos.values()].filter((x): x is NonNullable<ReturnType<typeof matchInfo>> => !!x).map(populationMatch);
  return { inputs: { players, matches, teamViews: ov.others }, errors, warnings };
}

