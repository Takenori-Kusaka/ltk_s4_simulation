// F-001: 大会の型
export const TEAMS = ['DD', 'CC', 'IT', 'LR'] as const;
export type TeamId = (typeof TEAMS)[number];

export const TIERS = ['NEXT', 'CORE', 'MASTERS'] as const;
export type Tier = (typeof TIERS)[number];

export interface Card {
  blue: TeamId;
  red: TeamId;
}

export interface RegularDay {
  day: number;
  date: string;
  cards: [Card, Card];
}

export type Pair = [TeamId, TeamId];

export interface MastersCup {
  cup: number;
  date: string;
  semis: [Pair, Pair];
}

export type Points = Partial<Record<TeamId, number>>;

