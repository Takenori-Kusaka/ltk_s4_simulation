// F-010 Task-4: 戦い方の特性とウィークサイド(受入基準 7・8・9・10・11・12・12b・12c・13)
// 特性は良し悪しではなく向き(−1.0〜+1.0)。強さの軸のレーダーには入れない。DOM と Node 固有の API に依存しない
import { ROSTER } from '../data/roster.ts';
import { TEAMS, TIERS } from '../sim/types.ts';
import { buildPopulation, loadEngineConfig, selectGames } from '../rating/engine.ts';
import type { PlayerRating, PlayerRatingInput } from '../rating/build.ts';
import type { TierTeamIndicators } from '../rating/team-indicators.ts';
import type { Confidence, GameRecord, MatchForPopulation } from '../rating/types.ts';
import type { Ltk3Metrics, Ltk3Row, Ltk3Snapshot } from './ltk3.ts';
import conf from './config.json' with { type: 'json' };

const CFG = (conf as unknown as {
  style: {
    scrimWeight: number;
    traitScale: number;
    centroid: { gold: number; damage: number; bias: number };
    confidence: { high: { continuing: number; games: number }; mid: { continuing: number; games: number }; minContinuing: number };
    weakSide: { stability: number; resilience: number; dropScale: number; minLowGames: number; lanes: string[] };
    finaleMinGames: number;
  };
}).style;

export type TraitKey = 'tempo' | 'laneVsGroup' | 'centroid' | 'objective';

/** 基準7: 両端に名前の付いた目盛り(重心は割合で示すため両端の名前を持たない) */
export const TRAIT_DEFS: readonly { key: TraitKey; label: string; minusLabel: string; plusLabel: string }[] = [
  { key: 'tempo', label: '序盤型⇄終盤型', minusLabel: '終盤型', plusLabel: '序盤型' },
  { key: 'laneVsGroup', label: 'レーン戦重視⇄集合重視', minusLabel: '集合重視', plusLabel: 'レーン戦重視' },
  { key: 'centroid', label: '重心', minusLabel: '', plusLabel: '' },
  { key: 'objective', label: 'オブジェクトの優先度', minusLabel: '優先度が低い', plusLabel: '優先度が高い' },
];

export interface Trait {
  key: TraitKey;
  label: string;
  minusLabel: string;
  plusLabel: string;
  /** −1.0〜+1.0。データなしは null(重心は shares を使い value は null) */
  value: number | null;
  /** 重心の割合(%)。TOP・JG・MID・BOT の合計 100 */
  shares?: { TOP: number; JG: number; MID: number; BOT: number };
  confidence: Confidence | null;
  source: 'LTK3' | 'Finale' | 'F-009' | '個人の偏り' | 'データなし';
  /** 使った試合の数(LTK3・Finale) */
  games: number;
  reason: string;
}

export interface WeakSideCandidate {
  playerId: string;
  role: string;
  stability: number;
  /** 崩れにくさ。資源が少ない試合が足りなければ null */
  resilience: number | null;
  lowResourceGames: number;
  score: number;
  confidence: Confidence;
  estimated: boolean;
  reason: string;
}

export interface TierTeamStyle {
  team: string;
  tier: string;
  /** 継続した選手(S3 の LTK3 の集計に含まれる選手) */
  continuing: string[];
  traits: Trait[];
  weakSide: { lane: string | null; playerId: string | null; confidence: Confidence | null; estimated: boolean; candidates: WeakSideCandidate[] };
}

export interface StyleInput {
  ratings: readonly PlayerRating[];
  inputs: readonly PlayerRatingInput[];
  now: number;
  /** LTK3 の集計のスナップショット(Task-1)。無ければ基準8〜10 の LTK3 の項はデータなし */
  ltk3: Ltk3Snapshot | null;
  /** F-009 のチームの指標(基準11) */
  teamIndicators?: readonly TierTeamIndicators[];
  /** 母集団の試合(対面とのゴールド差の標準偏差)。空なら選手の試合で補う */
  matches: readonly MatchForPopulation[];
  /** F-004 の Finale の記録の集計(階級チーム → 集計の行)。F-004 が無い間は渡さない(0 試合として扱う) */
  finale?: Record<string, { teams: readonly Ltk3Row[]; roles: readonly Ltk3Row[] }>;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sdOf = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const r2 = (x: number) => x.toFixed(2);
const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];

/** 群(チーム・階級)の本番とスクリムの行を、スクリムを scrimWeight の重みで合わせた集計値 */
interface Group { metrics: Ltk3Metrics; games: number; kinds: string[]; roles: Record<string, Ltk3Metrics> }
function blend(rows: readonly Ltk3Row[]): { metrics: Ltk3Metrics; games: number; kinds: string[] } | null {
  if (!rows.length) return null;
  const w = (r: Ltk3Row) => r.games * (r.kind === 'スクリム' ? CFG.scrimWeight : 1);
  const W = rows.reduce((s, r) => s + w(r), 0);
  const avg = (k: keyof Ltk3Metrics) => {
    const xs = rows.filter((r) => r.metrics[k] !== null);
    const ww = xs.reduce((s, r) => s + w(r), 0);
    return ww > 0 ? xs.reduce((s, r) => s + w(r) * (r.metrics[k] as number), 0) / ww : null;
  };
  const metrics = {
    kaPerMinTo14: avg('kaPerMinTo14') ?? 0, kaPerMinAfter14: avg('kaPerMinAfter14') ?? 0, teamGoldDiff14: avg('teamGoldDiff14') ?? 0,
    laneGoldDiff14: avg('laneGoldDiff14') ?? 0, kp14: avg('kp14') ?? 0, goldShare: avg('goldShare'), damageShare: avg('damageShare'),
  };
  return W > 0 ? { metrics, games: rows.reduce((s, r) => s + r.games, 0), kinds: [...new Set(rows.map((r) => r.kind))] } : null;
}
function groupOf(teams: readonly Ltk3Row[], roles: readonly Ltk3Row[]): Group | null {
  const t = blend(teams);
  if (!t) return null;
  const rs: Record<string, Ltk3Metrics> = {};
  for (const role of ROLES) {
    const b = blend(roles.filter((r) => r.role === role));
    if (b) rs[role] = b.metrics;
  }
  return { ...t, roles: rs };
}

/** 基準8・9 の素の値(標準化の前) */
const tempoRaw = (g: Group) => ({ ratio: g.metrics.kaPerMinAfter14 > 0 ? g.metrics.kaPerMinTo14 / g.metrics.kaPerMinAfter14 : null, gd: g.metrics.teamGoldDiff14 });
const laneRaw = (g: Group) => ({ lane: mean(ROLES.filter((r) => g.roles[r]).map((r) => Math.abs(g.roles[r].laneGoldDiff14))), kp: g.metrics.kp14 });

const zFn = (xs: number[]) => {
  const med = median(xs);
  const sd = sdOf(xs);
  return (x: number) => (sd > 0 ? (x - med) / sd : 0);
};
const toTrait = (z: number) => clamp(z / CFG.traitScale, -1, 1);

function confidenceOf(continuing: number, games: number): Confidence {
  const c = CFG.confidence;
  if (continuing >= c.high.continuing && games >= c.high.games) return '高';
  if (continuing >= c.mid.continuing && games >= c.mid.games) return '中';
  return '低';
}

/** 用語「資源が少ない試合」と基準12b の落ち込み */
function weakSideOf(
  rating: PlayerRating, input: PlayerRatingInput | undefined, role: string, sdByPos: Record<string, number>, now: number,
): WeakSideCandidate {
  const ws = CFG.weakSide;
  const stabilityAxis = rating.axes.find((a) => a.key === 'stability');
  const stability = stabilityAxis?.display ?? 5;
  const games = input ? selectGames(input.games, now, loadEngineConfig(), { roleOnly: true, position: input.position }) : [];
  const usable = games
    .filter((g): g is GameRecord & { opp: Record<string, number> } => !!g.opp && g.me.teamGoldEarned > 0 && typeof g.me.goldEarned === 'number')
    .map((g) => ({ share: g.me.goldEarned / g.me.teamGoldEarned, diff: g.me.goldEarned - (g.opp.goldEarned ?? 0) }))
    .sort((a, b) => a.share - b.share);
  const low = usable.slice(0, Math.floor(usable.length / 3));
  const sd = sdByPos[input?.position ?? ''] ?? 0;
  if (low.length < ws.minLowGames || sd <= 0) {
    return {
      playerId: rating.playerId, role, stability, resilience: null, lowResourceGames: low.length, score: stability, confidence: '低', estimated: true,
      reason: `資源が少ない試合 ${low.length} 試合(${ws.minLowGames} 試合未満)のため安定感 ${r2(stability)} だけで推定`,
    };
  }
  const drop = Math.max(0, mean(usable.map((u) => u.diff)) - mean(low.map((u) => u.diff))) / sd;
  const resilience = clamp(10 - drop * ws.dropScale, 0, 10);
  return {
    playerId: rating.playerId, role, stability, resilience, lowResourceGames: low.length,
    score: stability * ws.stability + resilience * ws.resilience,
    confidence: stabilityAxis?.confidence ?? '低', estimated: false,
    reason: `安定感 ${r2(stability)} × ${ws.stability} + 崩れにくさ ${r2(resilience)} × ${ws.resilience}(資源が少ない試合 ${low.length} 試合、落ち込み ${r2(drop)})`,
  };
}

/** 基準7〜13: 12 の階級チームの戦い方の特性とウィークサイド */
export function computeStyle(input: StyleInput): TierTeamStyle[] {
  const ratingOf = new Map(input.ratings.map((r) => [r.playerId, r]));
  const inputOf = new Map(input.inputs.map((p) => [p.playerId, p]));
  const snap = input.ltk3;
  const groups = new Map<string, Group>();
  for (const team of TEAMS) {
    for (const tier of TIERS) {
      const g = snap ? groupOf(snap.teams.filter((r) => r.team === team && r.tier === tier), snap.roles.filter((r) => r.team === team && r.tier === tier)) : null;
      if (g) groups.set(`${team}-${tier}`, g);
    }
  }
  // 母集団: LTK3 の集計の全階級チーム(基準8・9 の標準化)
  const all = [...groups.values()];
  const zRatio = zFn(all.map((g) => tempoRaw(g).ratio).filter((x): x is number => x !== null));
  const zGd = zFn(all.map((g) => tempoRaw(g).gd));
  const zLane = zFn(all.map((g) => laneRaw(g).lane));
  const zKp = zFn(all.map((g) => laneRaw(g).kp));
  const tempoOf = (g: Group) => {
    const t = tempoRaw(g);
    return t.ratio === null ? null : toTrait((zRatio(t.ratio) + zGd(t.gd)) / 2);
  };
  const laneOf = (g: Group) => {
    const l = laneRaw(g);
    return toTrait((zLane(l.lane) - zKp(l.kp)) / 2);
  };

  // 対面とのゴールド差のロールごとの標準偏差(F-009 の母集団。試合が無ければ選手の試合で補う)
  const fromPlayers: MatchForPopulation[] = input.inputs.flatMap((p) =>
    p.games.filter((g) => g.opp).map((g) => ({ participants: [{ position: g.position, teamId: 1, stats: g.me }, { position: g.position, teamId: 2, stats: g.opp! }] })),
  );
  const pop = buildPopulation(input.matches.length ? input.matches : fromPlayers, [
    { key: 'gold', label: 'gold', rankWeight: 0, roleDependent: true, metrics: [{ key: 'goldEarned', weight: 1, mode: 'diff' }] },
  ]);
  const sdByPos = Object.fromEntries(Object.entries(pop).map(([pos, m]) => [pos, m['goldEarned:diff']?.sd ?? 0]));

  return TEAMS.flatMap((team) =>
    TIERS.map((tier): TierTeamStyle => {
      const key = `${team}-${tier}`;
      const members = ROSTER.filter((p) => p.team === team && p.tier === tier);
      // 継続した選手と、その S3 の(チーム・階級)
      const s3 = members.flatMap((p) => {
        const a = inputOf.get(p.id)?.tournament.ltk.find((x) => x.season === 'S3');
        return a && groups.has(`${a.team}-${a.tier}`) ? [{ id: p.id, group: `${a.team}-${a.tier}` }] : [];
      });
      const weights = new Map<string, number>();
      for (const c of s3) weights.set(c.group, (weights.get(c.group) ?? 0) + 1);
      const finale = input.finale?.[key];
      const finaleGroup = finale ? groupOf(finale.teams, finale.roles) : null;
      const useFinale = !!finaleGroup && finaleGroup.games >= CFG.finaleMinGames;
      const used: [Group, number][] = useFinale ? [[finaleGroup!, 1]] : [...weights].map(([g, w]) => [groups.get(g)!, w]);
      const W = used.reduce((s, [, w]) => s + w, 0);
      const games = useFinale ? finaleGroup!.games : [...weights.keys()].reduce((s, g) => s + groups.get(g)!.games, 0);
      const kinds = [...new Set(used.flatMap(([g]) => g.kinds))].join('・');
      const enough = useFinale || s3.length >= CFG.confidence.minContinuing;
      const conf = useFinale ? confidenceOf(Infinity, games) : confidenceOf(s3.length, games);
      const source = useFinale ? 'Finale' : 'LTK3';
      const basis = useFinale
        ? `Finale の記録 ${games} 試合`
        : `継続した選手 ${s3.length} 人の S3 の(チーム・階級)${[...weights].map(([g, w]) => `${g}×${w}`).join('・') || 'なし'} の LTK3 の集計(${kinds || '—'}、${games} 試合。Finale の記録 0 試合)`;
      const weighted = (f: (g: Group) => number | null) => {
        const xs = used.map(([g, w]) => [f(g), w] as const).filter((x): x is readonly [number, number] => x[0] !== null);
        const ww = xs.reduce((s, [, w]) => s + w, 0);
        return ww > 0 ? xs.reduce((s, [v, w]) => s + v * w, 0) / ww : null;
      };
      const none = (k: TraitKey, why: string): Trait => ({ ...TRAIT_DEFS.find((d) => d.key === k)!, value: null, confidence: null, source: 'データなし', games: 0, reason: why });
      const ltkTrait = (k: TraitKey, f: (g: Group) => number | null): Trait => {
        if (!enough || !W) return none(k, `継続した選手が ${s3.length} 人(${CFG.confidence.minContinuing} 人未満)のため LTK3 の集計を使わずデータなし`);
        const v = weighted(f);
        return v === null ? none(k, `${basis}に値が無い`) : { ...TRAIT_DEFS.find((d) => d.key === k)!, value: v, confidence: conf, source, games, reason: basis };
      };

      // 基準10: 重心
      const ratingsIn = members.map((p) => ({ p, r: ratingOf.get(p.id) }));
      const gl = (r: PlayerRating | undefined) => (r ? (r.axes.find((a) => a.key === 'ground')?.display ?? 5) + (r.axes.find((a) => a.key === 'laning')?.display ?? 5) : 10);
      const glSum = ratingsIn.reduce((s, x) => s + gl(x.r), 0) || 1;
      const c = CFG.centroid;
      const useShares = enough && W > 0;
      const roleScore = Object.fromEntries(ratingsIn.map(({ p, r }) => {
        const bias = gl(r) / glSum;
        if (!useShares) return [p.role, bias];
        const gs = weighted((g) => g.roles[p.role]?.goldShare ?? null) ?? 0.2;
        const ds = weighted((g) => g.roles[p.role]?.damageShare ?? null) ?? 0.2;
        return [p.role, gs * c.gold + ds * c.damage + bias * c.bias];
      })) as Record<string, number>;
      const total = Object.values(roleScore).reduce((a, b) => a + b, 0) || 1;
      const pct = (x: number) => (x / total) * 100;
      const centroid: Trait = {
        ...TRAIT_DEFS.find((d) => d.key === 'centroid')!, value: null,
        shares: { TOP: pct(roleScore.TOP ?? 0), JG: pct(roleScore.JG ?? 0), MID: pct(roleScore.MID ?? 0), BOT: pct((roleScore.ADC ?? 0) + (roleScore.SUP ?? 0)) },
        confidence: useShares ? conf : '低', source: useShares ? source : '個人の偏り', games: useShares ? games : 0,
        reason: useShares
          ? `ゴールドの割合 × ${c.gold} + ダメージの割合 × ${c.damage} + 個人の偏り × ${c.bias}。${basis}`
          : `継続した選手が ${s3.length} 人(${CFG.confidence.minContinuing} 人未満)のため個人の偏り((地力 + レーン戦)の割合)だけで計算`,
      };

      // 基準11: オブジェクトの優先度
      const obj = input.teamIndicators?.find((t) => t.team === team && t.tier === tier)?.indicators.find((i) => i.key === 'objectives');
      const objective: Trait = obj && obj.score !== null
        ? { ...TRAIT_DEFS.find((d) => d.key === 'objective')!, value: clamp((obj.score - 5) / 5, -1, 1), confidence: obj.confidence, source: 'F-009', games: 0, reason: `F-009 のチームの指標「オブジェクト」${r2(obj.score)} を (点数 − 5.0) ÷ 5.0 に写した` }
        : none('objective', 'F-009 のチームの指標「オブジェクト」がデータなし');

      // 基準12b・12c: ウィークサイド
      const candidates = members
        .filter((p) => CFG.weakSide.lanes.includes(p.role) && ratingOf.has(p.id))
        .map((p) => weakSideOf(ratingOf.get(p.id)!, inputOf.get(p.id), p.role, sdByPos, input.now))
        // 価値責任者の決定 2026-10-09: 推定の候補(基準12c)は、崩れにくさを計算できた候補の後に並べる。同じ組の中は点の高い順(同点は名簿の順)
        .sort((a, b) => Number(a.estimated) - Number(b.estimated) || b.score - a.score);
      const best = candidates[0] ?? null;

      return {
        team, tier, continuing: s3.map((x) => x.id),
        traits: [ltkTrait('tempo', tempoOf), ltkTrait('laneVsGroup', laneOf), centroid, objective],
        weakSide: { lane: best?.role ?? null, playerId: best?.playerId ?? null, confidence: best?.confidence ?? null, estimated: best?.estimated ?? false, candidates },
      };
    }),
  );
}
