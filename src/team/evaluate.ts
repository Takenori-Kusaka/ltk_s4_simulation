// F-010 Task-5: チームの評価の組み立て(強さの軸・コーチの枠・戦い方の特性・総合の軸)。集計のコマンドから呼ぶ
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlayerRating, PlayerRatingInput } from '../rating/build.ts';
import type { MatchForPopulation } from '../rating/types.ts';
import type { TierTeamIndicators } from '../rating/team-indicators.ts';
import { computeStrength } from './strength.ts';
import { computeCoaches, readCoachSnapshot, type CoachSnapshot } from './coach.ts';
import { computeStyle } from './style.ts';
import { computeOverall } from './overall.ts';
import { validateLtk3Snapshot, type Ltk3Snapshot } from './ltk3.ts';

export interface TeamEvaluationInput {
  ratings: readonly PlayerRating[];
  inputs: readonly PlayerRatingInput[];
  matches: readonly MatchForPopulation[];
  teamIndicators: readonly TierTeamIndicators[];
  now: number;
  /** evidence-coach.json と ltk3-aggregate.json の置き場(既定は data/snapshots) */
  snapshotsDir: string;
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

/** 基準18b: 担当コーチの戦術の根拠のうち、ウィークサイドの作り方に触れる肯定の根拠の数(チームごと) */
function coachWeakSideEvidence(snapshot: CoachSnapshot): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of Object.values(snapshot.coaches)) {
    const team = c.tierTeam.split('-')[0];
    const n = c.tactics.filter((e) => e.direction === '+' && /ウィークサイド/.test(e.summary)).length;
    out[team] = (out[team] ?? 0) + n;
  }
  return out;
}

/** 12 の階級チームの評価と、4チームの総合の軸。スナップショットが読めなければ errors に出し、事前値で計算する */
export function evaluateTeams(input: TeamEvaluationInput) {
  const errors: string[] = [];
  const coachPath = join(input.snapshotsDir, 'evidence-coach.json');
  let coachSnap: CoachSnapshot = { kind: 'evidence-coach', retrievedAt: '', description: '', coaches: {} };
  if (existsSync(coachPath)) {
    const r = readCoachSnapshot(readJson(coachPath));
    errors.push(...r.errors);
    if (r.snapshot) coachSnap = r.snapshot;
  } else errors.push(`${coachPath} が無い(コーチの評価は事前値)`);
  const ltk3Path = join(input.snapshotsDir, 'ltk3-aggregate.json');
  let ltk3: Ltk3Snapshot | null = null;
  if (existsSync(ltk3Path)) {
    const raw = readJson(ltk3Path);
    const errs = validateLtk3Snapshot(raw);
    if (errs.length) errors.push(...errs.map((e) => `${ltk3Path}: ${e}`));
    else ltk3 = raw as Ltk3Snapshot;
  }

  const records = Object.fromEntries(input.inputs.map((p) => [p.playerId, p.tournament]));
  const coaches = computeCoaches(coachSnap, records, input.ratings);
  const strength = computeStrength({ ratings: input.ratings, inputs: input.inputs, now: input.now, coachC: coaches.coachC });
  const style = computeStyle({ ratings: input.ratings, inputs: input.inputs, now: input.now, ltk3, teamIndicators: input.teamIndicators, matches: input.matches });
  const overall = computeOverall({ strength, coaching: coaches.teams, style, inputs: input.inputs, coachWeakSideEvidence: coachWeakSideEvidence(coachSnap) });
  const tierTeams = strength.map((s) => {
    const key = `${s.team}-${s.tier}`;
    return { ...s, coaching: coaches.teams[key], style: style.find((x) => x.team === s.team && x.tier === s.tier) ?? null };
  });
  return { tierTeams, overall: overall.teams, beta: overall.beta, errors };
}
