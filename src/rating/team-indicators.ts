// F-009 Task-8: チームの指標(視界・オブジェクト・マクロ)。docs/design/rating-model.md 節2b、受入基準25
// 視界とオブジェクトは所属選手の試合の対面との差(ロール別に標準化)から、マクロは出典つきの根拠だけから作る
import { buildPopulation, confidenceOf, loadEngineConfig, scoreDataAxis } from './engine.ts';
import type { Confidence, DataAxisDef, MatchForPopulation } from './types.ts';
import type { PlayerRatingInput } from './build.ts';
import def from './axes.json' with { type: 'json' };

export const TEAM_INDICATORS: readonly DataAxisDef[] = (def as unknown as { teamIndicators: DataAxisDef[] }).teamIndicators;

export interface IndicatorPlayer {
  playerId: string;
  score: number;
  gamesUsed: number;
  confidence: Confidence;
}

export interface TeamIndicator {
  key: 'vision' | 'objectives' | 'macro';
  label: string;
  /** 階級チームの点数(0.0〜10.0)。材料が無ければ null(データなし) */
  score: number | null;
  confidence: Confidence | null;
  reason: string;
  players: IndicatorPlayer[];
  /** マクロの出典つきの根拠 */
  evidence: { text: string; source: string }[];
}

export interface TierTeamIndicators {
  team: string;
  tier: string;
  indicators: TeamIndicator[];
}

/** マクロの根拠(階級チームごと)。2026-10-09 時点で出典つきの根拠は集めていない */
export type MacroEvidence = Record<string, { text: string; source: string }[]>;

const round2 = (x: number) => Math.round(x * 100) / 100;

/** 基準25: 階級チームごとの視界・オブジェクト・マクロ */
export function teamIndicators(
  players: readonly (PlayerRatingInput & { team: string })[],
  matches: readonly MatchForPopulation[],
  now: number,
  macro: MacroEvidence = {},
): TierTeamIndicators[] {
  const cfg = loadEngineConfig();
  // 母集団: 収集した全試合の全参加者。試合が無いときは選手の試合の自分と対面で補う(axes.ts と同じ)
  const fromPlayers: MatchForPopulation[] = players.flatMap((p) =>
    p.games
      .filter((g) => g.opp)
      .map((g) => ({ participants: [{ position: g.position, teamId: 1, stats: g.me }, { position: g.position, teamId: 2, stats: g.opp! }] })),
  );
  const population = buildPopulation(matches.length ? matches : fromPlayers, TEAM_INDICATORS);

  const groups = new Map<string, (PlayerRatingInput & { team: string })[]>();
  for (const p of players) {
    const k = `${p.team}-${p.tier}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups.entries()].map(([k, members]) => {
    const [team, tier] = [members[0].team, members[0].tier];
    const data = TEAM_INDICATORS.map((axis): TeamIndicator => {
      const rated = members.map((p) => {
        const r = scoreDataAxis(axis, { rank: null, medianAnchor: 5, games: p.games, position: p.position }, population, cfg, now, 0);
        return { playerId: p.playerId, score: round2(r.base), gamesUsed: r.gamesUsed, confidence: r.confidence, effective: r.effectiveGames };
      });
      const used = rated.filter((r) => r.gamesUsed > 0);
      if (!used.length) {
        return { key: axis.key as TeamIndicator['key'], label: axis.label, score: null, confidence: null, reason: '所属選手の大会のロールの試合が無いためデータなし', players: [], evidence: [] };
      }
      const score = round2(used.reduce((s, r) => s + r.score, 0) / used.length);
      const meanEffective = used.reduce((s, r) => s + r.effective, 0) / members.length;
      return {
        key: axis.key as TeamIndicator['key'],
        label: axis.label,
        score,
        confidence: confidenceOf(meanEffective, cfg),
        reason: `所属選手 ${used.length} / ${members.length} 名の大会のロールの試合の、対面との差(ロール別に標準化)の平均。指標: ${axis.metrics.map((m) => m.key).join('・')}`,
        players: used.map(({ playerId, score: s, gamesUsed, confidence }) => ({ playerId, score: s, gamesUsed, confidence })),
        evidence: [],
      };
    });
    const ev = macro[k] ?? [];
    const macroIndicator: TeamIndicator = {
      key: 'macro',
      label: 'マクロ',
      score: null,
      confidence: null,
      reason: ev.length
        ? `出典つきの根拠 ${ev.length} 件(点数への換算は未定のため点数は付けない)`
        : '出典つきの根拠(チームとしての運営の評価、過去の LTK での運営の記述)が無いためデータなし',
      players: [],
      evidence: ev,
    };
    return { team, tier, indicators: [...data, macroIndicator] };
  });
}
