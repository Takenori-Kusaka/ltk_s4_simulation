// F-004 Task-2: スクリムの記録を F-009 の試合の記録(GameRecord)にする(基準12・13、用語「指標の対応表」)。DOM と Node 固有の API に依存しない
import type { GameRecord } from '../rating/types.ts';
import { SCRIM_QUEUE } from '../rating/engine.ts';
import type { LoadedResults, MatchResult, PlayerResult, TeamResult } from './types.ts';

/** 名簿のロール → teamPosition */
const POSITION: Record<string, string> = { TOP: 'TOP', JG: 'JUNGLE', MID: 'MIDDLE', ADC: 'BOTTOM', SUP: 'UTILITY' };

/** 指標の対応表: 選手の行 → F-009 の指標のキー。値の無い欄(cs・level・champion)はキーを持たない */
function stats(p: PlayerResult, team: TeamResult, win: boolean, minutes: number): Record<string, number> {
  const teamDamage = team.players.reduce((s, x) => s + x.damage, 0);
  const out: Record<string, number> = {
    totalDamageDealtToChampions: p.damage,
    goldPerMinute: p.goldPerMin ?? (minutes > 0 ? p.gold / minutes : 0),
    deaths: p.deaths,
    kills: p.kills,
    assists: p.assists,
    killParticipation: team.kills > 0 ? (p.kills + p.assists) / team.kills : 0,
    teamDamagePercentage: teamDamage > 0 ? p.damage / teamDamage : 0,
    goldEarned: p.gold,
    win: win ? 1 : 0,
  };
  if (p.cs !== null) out.totalMinionsKilled = p.cs;
  if (p.level !== null) out.champLevel = p.level;
  if (p.championId !== null) out.championId = p.championId;
  return out;
}

function recordsOf(m: MatchResult, weight: number): [string, GameRecord][] {
  const minutes = m.durationSec / 60;
  const endTime = Date.parse(`${m.date}T12:00:00+09:00`);
  const out: [string, GameRecord][] = [];
  for (const [teamId, team] of Object.entries(m.stats)) {
    const other = Object.entries(m.stats).find(([id]) => id !== teamId)?.[1];
    const otherWin = m.winner !== teamId;
    for (const p of team.players) {
      if (!p.use) continue; // 基準6: 「未確認」の行は記録を作らない
      const o = other?.players.find((x) => x.role === p.role);
      out.push([
        p.playerId,
        {
          matchId: m.matchId,
          endTime,
          durationMin: minutes,
          queueId: SCRIM_QUEUE,
          position: POSITION[p.role],
          me: stats(p, team, m.winner === teamId, minutes),
          opp: o && o.use && other ? stats(o, other, otherWin, minutes) : null,
          weight,
        },
      ]);
    }
  }
  return out;
}

/** 基準12・13: スクリムの記録の各選手の行から GameRecord を作る(名簿の選手 ID → 記録の順の配列)。本番の記録は使わない */
export function scrimGameRecords(loaded: Pick<LoadedResults, 'games'>, opts: { weight: number }): Record<string, GameRecord[]> {
  const byPlayer: Record<string, GameRecord[]> = {};
  for (const m of loaded.games) {
    if (m.kind !== 'scrim') continue;
    for (const [id, g] of recordsOf(m, opts.weight)) (byPlayer[id] ??= []).push(g);
  }
  return byPlayer;
}
