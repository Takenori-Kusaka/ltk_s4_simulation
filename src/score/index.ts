// F-002 基準2・4・6・7: 5軸の採点、階級の相対評価、チーム全体
import rules from './scoring.json' with { type: 'json' };
import type { Player, Role } from '../data/roster.ts';
import type { PlayerFile } from '../data/types.ts';

interface Component {
  metric: string;
  kind: 'rank' | 'linear' | 'qualitative';
  weight: number;
  min?: number;
  max?: number;
  byRole?: Partial<Record<Role, { min: number; max: number }>>;
}
interface Axis {
  key: string;
  label: string;
  components: Component[];
}

export const AXES: readonly Axis[] = (rules as { axes: Axis[] }).axes;

const TIER_BASE: Record<string, number> = {
  IRON: 0, BRONZE: 4, SILVER: 8, GOLD: 12, PLATINUM: 16, EMERALD: 20, DIAMOND: 24, MASTER: 28, GRANDMASTER: 28, CHALLENGER: 28,
};
const DIVISION: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 };

/** 'DIAMOND II 50' を 0〜10 へ換算する。Master 以上は LP で伸ばし、Master 0LP=8.0、1500LP 以上=10.0 */
export function rankToScore(rank: string): number {
  const [tier, div = 'IV', lpText = '0'] = rank.trim().toUpperCase().split(/\s+/);
  const lp = Number(lpText) || 0;
  const base = TIER_BASE[tier] ?? 0;
  if (base >= 28) return Math.min(10, 8 + (2 * lp) / 1500);
  const steps = base + (DIVISION[div] ?? 0) + Math.min(lp, 100) / 100;
  return Math.min(8, (steps / 28) * 8);
}

const clamp10 = (x: number) => Math.max(0, Math.min(10, x));

export interface ComponentScore {
  metric: string;
  weight: number;
  raw: number | string;
  score: number;
  source: string;
  retrievedAt: string;
  rationale?: string;
}
export interface AxisScore {
  key: string;
  label: string;
  /** null はデータなし(基準4) */
  score: number | null;
  components: ComponentScore[];
  missing: string[];
}
export interface PlayerScore {
  playerId: string;
  axes: AxisScore[];
}

/** 基準2・4: 選手の5軸。軸の指標がすべて無ければ null、一部が無ければある指標の重みで平均する */
export function scorePlayer(p: Player, f: PlayerFile): PlayerScore {
  const axes = AXES.map((axis): AxisScore => {
    const components: ComponentScore[] = [];
    const missing: string[] = [];
    for (const c of axis.components) {
      if (c.kind === 'qualitative') {
        const q = f.qualitative[c.metric];
        if (!q) { missing.push(c.metric); continue; }
        components.push({ metric: c.metric, weight: c.weight, raw: q.score, score: clamp10(q.score), source: q.sources.join(' / '), retrievedAt: '', rationale: q.rationale });
        continue;
      }
      const m = f.metrics[c.metric];
      if (!m) { missing.push(c.metric); continue; }
      let score: number;
      if (c.kind === 'rank') score = rankToScore(String(m.value));
      else {
        const range = c.byRole?.[p.role] ?? { min: c.min!, max: c.max! };
        score = clamp10(((Number(m.value) - range.min) / (range.max - range.min)) * 10);
      }
      components.push({ metric: c.metric, weight: c.weight, raw: m.value, score, source: m.source, retrievedAt: m.retrievedAt });
    }
    const w = components.reduce((s, c) => s + c.weight, 0);
    const score = w > 0 ? components.reduce((s, c) => s + c.score * c.weight, 0) / w : null;
    return { key: axis.key, label: axis.label, score, components, missing };
  });
  return { playerId: p.id, axes };
}

/** 基準6: 階級の5選手の軸ごとの平均(データなしを除く。全員データなしなら null) */
export function tierAverage(players: readonly PlayerScore[]): (number | null)[] {
  return AXES.map((_, i) => {
    const vals = players.map((p) => p.axes[i].score).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
}

/** 基準6: 同じ階級の4チームの平均を標準化し、5.0 + 2.0 × z を 0〜10 に切り詰める */
export function tierRadar(averages: Record<string, (number | null)[]>): Record<string, (number | null)[]> {
  const teams = Object.keys(averages);
  const out: Record<string, (number | null)[]> = Object.fromEntries(teams.map((t) => [t, []]));
  AXES.forEach((_, i) => {
    const vals = teams.map((t) => averages[t][i]).filter((v): v is number => v !== null);
    const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length || 1));
    for (const t of teams) {
      const v = averages[t][i];
      out[t][i] = v === null ? null : sd === 0 ? 5 : clamp10(5 + (2 * (v - mean)) / sd);
    }
  });
  return out;
}

/** 基準7: チーム全体 = 3階級の相対評価の平均(データなしの階級を除く) */
export function teamRadar(byTier: Record<string, Record<string, (number | null)[]>>, team: string): (number | null)[] {
  return AXES.map((_, i) => {
    const vals = Object.values(byTier).map((r) => r[team]?.[i]).filter((v): v is number => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
}
