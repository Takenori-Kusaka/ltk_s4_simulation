// F-009 Task-1: 評価の土台(ADR-0004、docs/design/rating-model.md)
// データの軸の基礎の点数 = clamp( A×r + 5×(1−r) + P × n/(n+k) × perfScale + 加点, 0, 10 )
import type {
  AnchorSource,
  BlankInfo,
  Confidence,
  DataAxisDef,
  DataAxisResult,
  EngineConfig,
  GameRecord,
  MatchForPopulation,
  MetricDef,
  Population,
  PlayerAxisInput,
  RankEntry,
} from './types.ts';
import engineDefaults from './config.json' with { type: 'json' };

const DAY = 86_400_000;
const TIER_BASE: Record<string, number> = {
  IRON: 0, BRONZE: 4, SILVER: 8, GOLD: 12, PLATINUM: 16, EMERALD: 20, DIAMOND: 24, MASTER: 28, GRANDMASTER: 28, CHALLENGER: 28,
};
const DIVISION: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 };
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** ランクの基準(0〜10)。Master 0LP = 8.0、Master 以上は LP 1500 で 10.0 */
export function rankAnchor(r: RankEntry | null | undefined): number | null {
  if (!r) return null;
  const base = TIER_BASE[r.tier.toUpperCase()];
  if (base === undefined) return null;
  if (base >= 28) return Math.min(10, 8 + (2 * Math.max(0, r.lp)) / 1500);
  const steps = base + (DIVISION[r.division.toUpperCase()] ?? 0) + clamp(r.lp, 0, 100) / 100;
  return Math.min(8, (steps / 28) * 8);
}

/** 元プロのランクの基準の下限(基準29): Challenger 0 LP の基準 */
export const EX_PRO_FLOOR = 8;
/** 元プロの下限を経歴の水準で決める(基準29 の改訂、2026-10-10): 設定の exProFloor[水準]、無ければ default、無ければ従来の 8.0 */
export function exProFloorOf(level: string, years = 0): number {
  const m = loadEngineConfig().exProFloor;
  const v = m?.[level] ?? m?.default ?? EX_PRO_FLOOR;
  // 水準での年数で上がる下限(LJL のスタメン: 8.0 + 0.5 × 年数、上限 10.0)
  return typeof v === 'number' ? v : Math.min(v.max, v.base + v.perYear * Math.max(0, years));
}

/** ランクの表記(最高ランクの説明に使う): Challenger 1883LP、Emerald II 45LP */
const rankText = (r: RankEntry) => [r.tier, r.division, `${r.lp}LP`].filter(Boolean).join(' ');

/** 基準35: 到達の時点(元プロの下限では最終出場年)が不明な記録に付ける印 */
export const REACH_UNKNOWN_MARK = '到達の時点が不明(減衰なし)';
/** 基準35: 不明な記録をランクの基準に採った軸の、確度の理由に足す文 */
export const REACH_UNKNOWN_DOWNGRADE = '到達の時点が不明な記録をランクの基準に採ったため 1 段下げた';

/**
 * 到達の時点('2021'・'2024-01'・'2025-07-28' の形)→ 時刻(UTC)。年月日ならその日、年だけなら 7 月 1 日、年月だけならその月の 1 日。
 * この形でなければ null(不明)
 */
export function reachTime(at: string | null | undefined): number | null {
  const m = typeof at === 'string' ? /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(at) : null;
  if (!m) return null;
  return m[2] ? Date.UTC(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1) : Date.UTC(Number(m[1]), 6, 1);
}

/**
 * 基準33・34: 到達の時点から計算の基準日までのブランク b(日数 ÷ 365.25。負なら 0)と、
 * ブランクの減衰 blankDecayPerYear × max(0, b − blankGraceYears)。到達の時点が不明なら減衰なし(基準35)
 */
export function blankInfo(at: string | null | undefined, now: number, cfg: Pick<EngineConfig, 'blankDecayPerYear' | 'blankGraceYears'> = loadEngineConfig()): BlankInfo {
  const t = reachTime(at);
  if (t === null) return { at: null, years: null, decay: 0 };
  const years = Math.max(0, (now - t) / DAY / 365.25);
  return { at: at as string, years, decay: (cfg.blankDecayPerYear ?? 0) * Math.max(0, years - (cfg.blankGraceYears ?? 0)) };
}

/** 基準36: 「到達 2021、ブランク 5.3 年、−1.28」(減衰が 0 でも示す)。不明なら基準35 の印 */
const blankText = (b: BlankInfo) => (b.at === null || b.years === null ? REACH_UNKNOWN_MARK : `到達 ${b.at}、ブランク ${b.years.toFixed(1)} 年、−${b.decay.toFixed(2)}`);

export interface AnchorChoice {
  anchor: number;
  anchorSource: AnchorSource;
  /** 出どころの補足(最高ランクの値と出典、元プロの区分と出典、到達の時点・ブランク・減衰) */
  anchorNote?: string;
  /** ソロランクが無い(基準9: 確度を 1 段下げる) */
  soloMissing: boolean;
  /** 採った記録の到達の時点(元プロの下限では最終出場年)が不明(基準35: 確度を 1 段下げる) */
  whenUnknown: boolean;
}

/**
 * 基準6・9・28〜30・33〜36: ランクの基準の決め方。
 * ソロランク・歴代の最高ランク・今季の最高ランク(出典つき)のうち、基準の値が最も高い記録を採る
 * (LP 不明は 0 LP。同じ値ならソロランク → 歴代 → 今季の順)。どれも無ければ母集団の中央値。
 * 歴代の最高ランクは、記録に載ったブランクの減衰を引いた値で比べる(ソロランクと今季の最高ランクは減衰しない)。
 * 出典つきのプロの経歴があれば、経歴の水準と年数で決めた下限からブランクの減衰を引いた値(8.0 を下回らない)を下限にする(元プロの下限)。
 * 到達の時点が不明な記録は減衰せず、同じ値の候補があれば不明でない候補を採る
 */
export function resolveAnchor(input: Pick<PlayerAxisInput, 'rank' | 'peakRank' | 'seasonPeakRank' | 'exPro' | 'medianAnchor'>): AnchorChoice {
  const soloMissing = rankAnchor(input.rank) === null;
  const records: [RankEntry | null | undefined, AnchorSource][] = [
    [input.rank, 'ソロランク'],
    [input.peakRank, '最高ランク'],
    [input.seasonPeakRank, '最高ランク(今季)'],
  ];
  let choice: AnchorChoice = { anchor: input.medianAnchor ?? 5, anchorSource: '母集団の中央値', soloMissing, whenUnknown: false };
  let best: number | null = null;
  for (const [r, source] of records) {
    const raw = rankAnchor(r);
    if (raw === null) continue;
    const blank = source === '最高ランク' ? r!.blank : undefined;
    const a = Math.max(0, raw - (blank?.decay ?? 0));
    const unknown = blank !== undefined && blank.at === null;
    if (best !== null && (a < best || (a === best && !(choice.whenUnknown && !unknown)))) continue;
    best = a;
    choice = { anchor: a, anchorSource: source, soloMissing, whenUnknown: unknown };
    if (source !== 'ソロランク') choice.anchorNote = `${rankText(r!)}${r!.source ? `。出典: ${r!.source}` : ''}${blank ? `。${blankText(blank)}` : ''}`;
  }
  if (input.exPro) {
    const base = exProFloorOf(input.exPro.level, input.exPro.years ?? 0);
    const blank = input.exPro.blank;
    // 基準34: 減衰後の下限は Challenger 0 LP の基準(8.0)を下回らない
    const floor = blank ? Math.max(Math.min(base, EX_PRO_FLOOR), base - blank.decay) : base;
    const unknown = blank !== undefined && blank.at === null;
    if (choice.anchor < floor || (choice.anchor === floor && choice.whenUnknown && !unknown)) {
      const note = blank ? `。${blankText(blank)}${unknown ? '' : `(最終出場年から${floor > base - blank.decay ? `。下限は ${EX_PRO_FLOOR.toFixed(1)} を下回らない` : ''})`}` : '';
      choice = { ...choice, anchor: floor, anchorSource: '元プロの下限', whenUnknown: unknown, anchorNote: `${input.exPro.level}。出典: ${input.exPro.source}${note}` };
    }
  }
  return choice;
}

/** 新しさの重み 0.5^(日数 / 半減期) */
export function recencyWeight(ageDays: number, halfLifeDays: number): number {
  return 0.5 ** (Math.max(0, ageDays) / halfLifeDays);
}

/** F-004 基準13: 1 試合の重み = 新しさの重み × (スクリムの記録なら scrimGameWeight。省略時 1) */
export function gameWeight(g: GameRecord, now: number, cfg: EngineConfig): number {
  return recencyWeight((now - g.endTime) / DAY, cfg.halfLifeDays) * (g.kind === 'scrim' ? cfg.scrimGameWeight ?? 1 : 1);
}

/** F-004 基準15: 「スクリム n 試合(重み w)を含む」。0 件なら null */
export function scrimSentence(scrimGames: number, weight: number): string | null {
  return scrimGames > 0 ? `スクリム ${scrimGames} 試合(重み ${weight.toFixed(1)})を含む` : null;
}

/** 確度の理由: 有効な試合数と閾値。スクリムを含む軸はその数と重み(F-004 基準15) */
export function confidenceReasonOf(n: number, scrimGames: number, cfg: EngineConfig, weight = cfg.scrimGameWeight ?? 1): string {
  const s = scrimSentence(scrimGames, weight);
  return `有効な試合数 ${n.toFixed(1)}(${cfg.confidence.high} 以上で高、${cfg.confidence.mid} 以上で中)${s ? `。${s}` : ''}`;
}

/** 基準1・2: 評価の試合(期間・長さ)と、ロールに依存する軸では大会のロールの試合 */
export function selectGames(
  games: readonly GameRecord[],
  now: number,
  cfg: EngineConfig,
  opt: { roleOnly: boolean; position: string },
): GameRecord[] {
  return games.filter(
    (g) =>
      now - g.endTime <= cfg.windowDays * DAY &&
      g.durationMin >= cfg.minMinutes &&
      (!opt.roleOnly || g.position === opt.position),
  );
}

/** 基準4 */
export function confidenceOf(n: number, cfg: EngineConfig): Confidence {
  if (n >= cfg.confidence.high) return '高';
  if (n >= cfg.confidence.mid) return '中';
  return '低';
}

const downgrade = (c: Confidence): Confidence => (c === '高' ? '中' : '低');

/** F-009 基準42: 大会のロールの試合(重みを掛けない件数)が下限に満たない軸は、有効な試合数に依らず確度を「低」にし、理由に件数を足す */
export function roleGamesFloor<T extends { confidence: Confidence; confidenceReason: string }>(r: T, roleGames: number, min: number): T {
  return roleGames < min ? { ...r, confidence: '低', confidenceReason: `${r.confidenceReason}。大会のロールの試合 ${roleGames} 件(${min} 未満)` } : r;
}

/** 1試合の指標の値(対面との差)。相手がいない・値が無いときは null(基準8) */
export function metricDiff(def: MetricDef, me: Record<string, number>, opp: Record<string, number> | null): number | null {
  if (!opp) return null;
  const a = me[def.key];
  const b = opp[def.key];
  if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (def.mode === 'logratio') return Math.log((Math.max(0, a) + 1) / (Math.max(0, b) + 1));
  if (def.mode === 'negdiff') return -(a - b);
  return a - b;
}

const popKey = (def: MetricDef) => `${def.key}:${def.mode}`;

/** 基準7: 母集団(全試合の全参加者)の、ロールごと・指標ごとの「対面との差」の分布 */
export function buildPopulation(matches: readonly MatchForPopulation[], axes: readonly DataAxisDef[]): Population {
  const defs = new Map<string, MetricDef>();
  for (const a of axes) for (const m of a.metrics) defs.set(popKey(m), m);
  const acc: Record<string, Record<string, number[]>> = {};
  for (const match of matches) {
    for (const p of match.participants) {
      const opp = match.participants.find((q) => q.teamId !== p.teamId && q.position === p.position);
      if (!opp || !p.position) continue;
      for (const [k, def] of defs) {
        const v = metricDiff(def, p.stats, opp.stats);
        if (v === null) continue;
        ((acc[p.position] ??= {})[k] ??= []).push(v);
      }
    }
  }
  const out: Population = {};
  for (const [pos, byKey] of Object.entries(acc)) {
    out[pos] = {};
    for (const [k, xs] of Object.entries(byKey)) {
      const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
      out[pos][k] = { mean, sd, count: xs.length };
    }
  }
  return out;
}

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * 基準3〜9: データの軸の基礎の点数。bonus は軸の外から加える項(LTK の経験の項。基準6・10)
 */
export function scoreDataAxis(
  axis: DataAxisDef,
  input: PlayerAxisInput,
  population: Population,
  cfg: EngineConfig,
  now: number,
  bonus = 0,
): DataAxisResult {
  // ランクの基準と事前値(基準6・9・28〜30・33〜36)
  const { anchor, anchorSource, anchorNote, soloMissing, whenUnknown } = resolveAnchor(input);
  const games = selectGames(input.games, now, cfg, { roleOnly: axis.roleDependent, position: input.position })
    .slice()
    .sort((a, b) => b.endTime - a.endTime || a.matchId.localeCompare(b.matchId));

  let n = 0;
  let pSum = 0;
  let scrimGames = 0;
  const metricAcc = axis.metrics.map(() => ({ zSum: 0, vSum: 0, w: 0, count: 0 }));
  for (const g of games) {
    const w = gameWeight(g, now, cfg);
    let gz = 0;
    let gw = 0;
    axis.metrics.forEach((def, i) => {
      if (def.positions && !def.positions.includes(g.position)) return;
      const v = metricDiff(def, g.me, g.opp);
      if (v === null) return;
      const dist = population[g.position]?.[popKey(def)];
      const z = dist && dist.sd > 0 ? clamp((v - dist.mean) / dist.sd, -cfg.zClip, cfg.zClip) : 0;
      gz += def.weight * z;
      gw += def.weight;
      const m = metricAcc[i];
      m.zSum += w * z;
      m.vSum += w * v;
      m.w += w;
      m.count += 1;
    });
    if (gw === 0) continue; // この試合に使える指標が無い
    pSum += w * (gz / gw);
    n += w;
    if (g.kind === 'scrim') scrimGames += 1;
  }
  const correction = n > 0 ? pSum / n : 0;
  const shrink = n / (n + cfg.k);
  const r = axis.rankWeight;
  const base = clamp(anchor * r + 5 * (1 - r) + correction * shrink * cfg.perfScale + bonus, 0, 10);
  const estimated = n === 0;
  let confidence: Confidence = estimated ? '低' : confidenceOf(n, cfg);
  if (soloMissing && !estimated) confidence = downgrade(confidence);
  // 基準35: 到達の時点が不明な記録をランクの基準に採った軸は、確度を 1 段下げる
  if (whenUnknown && !estimated) confidence = downgrade(confidence);
  const onRole = games.filter((g) => g.position === input.position).length;
  return {
    key: axis.key,
    label: axis.label,
    base,
    confidence,
    estimated,
    anchor,
    anchorSource,
    ...(anchorNote ? { anchorNote } : {}),
    ...(whenUnknown ? { anchorWhenUnknown: true } : {}),
    correction,
    shrink,
    effectiveGames: n,
    gamesUsed: games.length,
    roleShare: games.length ? onRole / games.length : 0,
    newest: games.length ? isoDay(games[0].endTime) : null,
    oldest: games.length ? isoDay(games[games.length - 1].endTime) : null,
    bonus,
    scrimGames,
    confidenceReason: confidenceReasonOf(n, scrimGames, cfg) + (whenUnknown && !estimated ? `。${REACH_UNKNOWN_DOWNGRADE}` : ''),
    metrics: axis.metrics.map((def, i) => {
      const m = metricAcc[i];
      return {
        key: def.key,
        mode: def.mode,
        value: m.w > 0 ? m.vSum / m.w : null,
        z: m.w > 0 ? m.zSum / m.w : 0,
        gamesWithOpponent: m.count,
      };
    }),
  };
}

// ---- 実データ(match-v5 の info)からの変換 ----

/** 評価設定の既定値 */
export function loadEngineConfig(): EngineConfig {
  return { ...(engineDefaults as { engine: EngineConfig }).engine };
}

interface RawParticipant {
  puuid?: string;
  teamId: number;
  teamPosition?: string;
  challenges?: Record<string, unknown>;
  [k: string]: unknown;
}
interface RawInfo {
  gameEndTimestamp: number;
  gameDuration: number;
  queueId: number;
  participants: RawParticipant[];
}

/** participant の数値と challenges の数値を1つの表に平らにする */
function flatten(p: RawParticipant): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v ? 1 : 0; // 勝敗などの真偽値は 1 と 0
  }
  for (const [k, v] of Object.entries(p.challenges ?? {})) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
}

/** 選手(puuid)の1試合の記録。選手がいなければ null */
export function extractGame(matchId: string, info: RawInfo, puuid: string): GameRecord | null {
  const me = info.participants.find((p) => p.puuid === puuid);
  if (!me) return null;
  const opp = me.teamPosition
    ? info.participants.find((p) => p.teamId !== me.teamId && p.teamPosition === me.teamPosition) ?? null
    : null;
  return {
    matchId,
    endTime: info.gameEndTimestamp,
    durationMin: info.gameDuration / 60,
    queueId: info.queueId,
    position: me.teamPosition ?? '',
    me: { ...flatten(me), teamGoldEarned: teamGold(info, me.teamId) },
    opp: opp ? flatten(opp) : null,
  };
}

/** F-010 基準12b: 用語「資源が少ない試合」に使うチームの獲得ゴールドの合計 */
function teamGold(info: RawInfo, teamId: number): number {
  return info.participants.filter((p) => p.teamId === teamId).reduce((s, p) => s + (typeof p.goldEarned === 'number' ? p.goldEarned : 0), 0);
}

/** 母集団に使う形(ロールの無い参加者を除く) */
export function populationMatch(info: RawInfo): MatchForPopulation {
  return {
    participants: info.participants
      .filter((p) => !!p.teamPosition)
      .map((p) => ({ position: p.teamPosition as string, teamId: p.teamId, stats: flatten(p) })),
  };
}
