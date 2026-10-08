// F-002 基準5: チームのページの表示内容(チーム全体・NEXT・CORE・MASTERS の4つのレーダー)
import { ROSTER } from '../../data/roster.ts';
import type { PlayerFile } from '../../data/types.ts';
import { scorePlayer, tierAverage, tierRadar, teamRadar, AXES } from '../../score/index.ts';
import { TEAMS, TIERS } from '../../sim/types.ts';
import type { TeamId, Tier } from '../../sim/types.ts';
import { emptyPlayerFile, formatScore } from '../lib/index.ts';

export interface RadarView {
  label: 'チーム全体' | Tier;
  scores: (number | null)[];
  displays: string[];
  /** 指標ファイルが無く、計算から除いた選手の数(QA 指摘 L1) */
  excluded: number;
}

export interface TeamView {
  team: TeamId;
  axisLabels: string[];
  radars: RadarView[];
  members: { id: string; name: string; tier: Tier; role: string; href: string }[];
}

/** 全チーム・全階級の相対評価(基準6)を計算する */
function relativeByTier(files: Record<string, PlayerFile>): Record<Tier, Record<string, (number | null)[]>> {
  const out = {} as Record<Tier, Record<string, (number | null)[]>>;
  for (const tier of TIERS) {
    const averages: Record<string, (number | null)[]> = {};
    for (const team of TEAMS) {
      const scored = ROSTER.filter((p) => p.team === team && p.tier === tier).map((p) =>
        scorePlayer(p, files[p.id] ?? emptyPlayerFile(p.id)),
      );
      averages[team] = tierAverage(scored);
    }
    out[tier] = tierRadar(averages);
  }
  return out;
}

const view = (label: RadarView['label'], scores: (number | null)[], excluded: number): RadarView => ({
  label,
  scores,
  displays: scores.map(formatScore),
  excluded,
});

export function teamView(team: TeamId, files: Record<string, PlayerFile>): TeamView {
  const byTier = relativeByTier(files);
  const missing = (tier?: Tier) =>
    ROSTER.filter((p) => p.team === team && (!tier || p.tier === tier) && !files[p.id]).length;
  return {
    team,
    axisLabels: AXES.map((a) => a.label),
    radars: [
      view('チーム全体', teamRadar(byTier, team), missing()),
      ...TIERS.map((tier) => view(tier, byTier[tier][team], missing(tier))),
    ],
    members: ROSTER.filter((p) => p.team === team).map((p) => ({
      id: p.id,
      name: p.name,
      tier: p.tier,
      role: p.role,
      href: `#/player/${p.id}`,
    })),
  };
}
