// F-004 Task-2・Task-12: スクリム・本番の記録 → F-009 の試合の記録(GameRecord)。指標の対応表は specs/F-004/spec.md「指標の対応表」
// 対応表に無い指標は持たない(F-009 基準 8 で、その指標はその試合で除外される)。DOM と Node 固有の API に依存しない
import type { Role } from '../data/roster.ts';
import type { GameRecord, Position } from '../rating/types.ts';
import type { MatchResult, PlayerResult, TeamResult } from './types.ts';

/** 名簿のロール → teamPosition(src/rating/build.ts の POSITION と同じ値) */
const POSITION_OF: Record<Role, Position> = { TOP: 'TOP', JG: 'JUNGLE', MID: 'MIDDLE', ADC: 'BOTTOM', SUP: 'UTILITY' };
/** スクリム・本番の試合の記録の queueId。ランクのキュー(420・440)ではないため、調子の係数(基準14・41)には使われない */
export const SCRIM_QUEUE_ID = 0;

/** 基準12: 日付の正午(JST)を試合の終了時刻にする */
export const scrimEndTime = (date: string): number => Date.parse(`${date}T12:00:00+09:00`);

/** 指標の対応表: 選手の行 → F-009 の指標のキー。cs・level・champion(key)は無ければ持たない */
export function scrimStats(row: PlayerResult, team: TeamResult, durationMin: number, win: boolean): Record<string, number> {
  const teamDamage = team.players.reduce((s, p) => s + p.damage, 0);
  const stats: Record<string, number> = {
    totalDamageDealtToChampions: row.damage,
    goldPerMinute: row.goldPerMin ?? row.gold / durationMin,
    deaths: row.deaths,
    kills: row.kills,
    assists: row.assists,
    killParticipation: team.kills > 0 ? (row.kills + row.assists) / team.kills : 0,
    teamDamagePercentage: teamDamage > 0 ? row.damage / teamDamage : 0,
    goldEarned: row.gold,
    win: win ? 1 : 0,
  };
  if (row.cs !== null) stats.totalMinionsKilled = row.cs;
  if (row.level !== null) stats.champLevel = row.level;
  if (row.championId !== null) stats.championId = row.championId;
  return stats;
}

/**
 * 基準12・41: 受け付けたスクリム・本番の記録から、選手 ID → 試合の記録(基準26 の csAt14 を含む。kind は記録の kind)。
 * 使わない行(「未確認」)は記録を作らず、対面がその行なら対面なし(F-009 基準 8 で除外)。
 * 基準29・41: 結果だけの記録は選手の行を持たず、試合の記録(ピックプールの元)を作らない
 */
export function scrimGameRecords(games: readonly MatchResult[]): Map<string, GameRecord[]> {
  const out = new Map<string, GameRecord[]>();
  for (const g of games) {
    if (g.resultOnly || g.durationSec === null) continue;
    const durationMin = g.durationSec / 60;
    for (const teamId of g.teams) {
      const team = g.stats[teamId];
      const oppTeam = g.stats[g.teams[0] === teamId ? g.teams[1] : g.teams[0]];
      for (const row of team.players) {
        if (!row.use) continue;
        const oppRow = oppTeam.players.find((p) => p.role === row.role && p.use) ?? null;
        const me = scrimStats(row, team, durationMin, g.winner === teamId);
        const opp = oppRow ? scrimStats(oppRow, oppTeam, durationMin, g.winner !== teamId) : null;
        // 基準26: TOP・JG・MID・ADC で自分と対面の両方に cs14 があるときだけ csAt14 を持たせる(SUP と片方が null の試合には持たせない)
        if (opp && oppRow && row.role !== 'SUP' && typeof row.cs14 === 'number' && typeof oppRow.cs14 === 'number') {
          me.csAt14 = row.cs14;
          opp.csAt14 = oppRow.cs14;
        }
        const record: GameRecord = {
          matchId: g.matchId,
          endTime: scrimEndTime(g.date),
          durationMin,
          queueId: SCRIM_QUEUE_ID,
          position: POSITION_OF[row.role],
          me,
          opp,
          kind: g.kind,
        };
        const list = out.get(row.playerId) ?? [];
        list.push(record);
        out.set(row.playerId, list);
      }
    }
  }
  return out;
}
