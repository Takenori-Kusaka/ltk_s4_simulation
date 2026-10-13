// F-010 Task-8(基準23〜25): 価値責任者の見立てのうち、階級チームとコーチを対象とする項目を振り分ける。
// 記録の読み込みと形の検査は F-009 の src/rating/owner-views.ts(readOwnerViews の others)。DOM と Node 固有の API に依存しない
import { ROSTER } from '../data/roster.ts';
import { TEAMS, TIERS } from '../sim/types.ts';
import type { OwnerView } from '../rating/owner-views.ts';
import type { CoachEvidence, CoachSnapshot } from './coach.ts';
import conf from './config.json' with { type: 'json' };

const COACHES = (conf as unknown as { coaches: Record<string, string> }).coaches;
/** 基準23: 見立てを加える強さの軸 */
export const TEAM_AXES: readonly string[] = ['synergy', 'shotcalling'];
/** F-005 基準18 の勢い。F-010 では使わず、警告もしない */
export const TEAM_OTHER_AXES: readonly string[] = ['momentum'];
/** 基準24: 見立てを根拠として数えるコーチの評価軸 */
export const COACH_VIEW_AXES: readonly ('verbal' | 'tactics' | 'fit')[] = ['verbal', 'tactics', 'fit'];

const TIER_TEAMS = new Set(TEAMS.flatMap((t) => TIERS.map((tier) => `${t}-${tier}`)));

/** 基準23〜25: 階級チーム(例 DD-CORE)ごとの項目と、担当コーチを対象とする項目に分ける。使えない項目は警告にする */
export function splitTeamViews(views: readonly OwnerView[]): {
  team: Record<string, OwnerView[]>;
  coach: Record<string, OwnerView[]>;
  warnings: string[];
} {
  const team: Record<string, OwnerView[]> = {};
  const coach: Record<string, OwnerView[]> = {};
  const warnings: string[] = [];
  for (const v of views) {
    if (v.targetKind === 'team') {
      if (!TIER_TEAMS.has(v.target)) warnings.push(`価値責任者の見立て ${v.target}: 名簿に無い階級チームのため使わない`);
      else if (TEAM_AXES.includes(v.axis) || TEAM_OTHER_AXES.includes(v.axis)) (team[v.target] ??= []).push(v);
      else warnings.push(`価値責任者の見立て ${v.target}: 軸 ${v.axis} は連携の厚み・司令塔でないため使わない`);
    } else if (v.targetKind === 'coach') {
      if (!COACHES[v.target]) warnings.push(`価値責任者の見立て ${v.target}: 担当コーチのいない階級チームのため使わない`);
      else if ((COACH_VIEW_AXES as readonly string[]).includes(v.axis)) (coach[v.target] ??= []).push(v);
      else warnings.push(`価値責任者の見立て ${v.target}: 軸 ${v.axis} は言語化力・戦術とドラフトの設計・チームとの相性でないため使わない`);
    }
  }
  return { team, coach, warnings };
}

/** 基準24: コーチの見立てを、出典「価値責任者の見立て」の根拠としてコーチの評価軸の根拠に加えた記録を返す(元の記録は変えない) */
export function withCoachViews(snapshot: CoachSnapshot, coachViews: Record<string, OwnerView[]>): CoachSnapshot {
  const coaches = { ...snapshot.coaches };
  for (const [tierTeam, views] of Object.entries(coachViews)) {
    const id = COACHES[tierTeam];
    const base = coaches[id] ?? { name: ROSTER.find((p) => p.id === id)?.name ?? id, tierTeam, seasons: [], rankGains: [], verbal: [], tactics: [], fit: [] };
    const next = { ...base, verbal: [...base.verbal], tactics: [...base.tactics], fit: [...base.fit] };
    for (const v of views) {
      const ev: CoachEvidence = {
        summary: `価値責任者の見立て(${v.date}): 「${v.quote}」`,
        source: v.source,
        direction: v.direction,
        strength: v.strength,
        collectedBy: 'human',
      };
      next[v.axis as 'verbal' | 'tactics' | 'fit'].push(ev);
    }
    coaches[id] = next;
  }
  return { ...snapshot, coaches };
}
