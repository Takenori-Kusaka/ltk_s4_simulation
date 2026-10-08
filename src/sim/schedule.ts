// F-001 基準1・3: 公式の日程(docs/research/format-history.md 節2.1・2.2)。左がブルー
import type { MastersCup, RegularDay, TeamId } from './types.ts';

const card = (blue: TeamId, red: TeamId) => ({ blue, red });

export const REGULAR_DAYS: readonly RegularDay[] = [
  { day: 1, date: '2026-10-15', cards: [card('CC', 'DD'), card('IT', 'LR')] },
  { day: 2, date: '2026-10-19', cards: [card('CC', 'LR'), card('DD', 'IT')] },
  { day: 3, date: '2026-10-23', cards: [card('LR', 'DD'), card('IT', 'CC')] },
  { day: 4, date: '2026-10-27', cards: [card('LR', 'IT'), card('DD', 'CC')] },
  { day: 5, date: '2026-11-02', cards: [card('IT', 'DD'), card('LR', 'CC')] },
  { day: 6, date: '2026-11-06', cards: [card('CC', 'IT'), card('DD', 'LR')] },
];

export const MASTERS_CUPS: readonly MastersCup[] = [
  { cup: 1, date: '2026-10-20', semis: [['DD', 'CC'], ['IT', 'LR']] },
  { cup: 2, date: '2026-10-28', semis: [['DD', 'IT'], ['CC', 'LR']] },
  { cup: 3, date: '2026-11-09', semis: [['DD', 'LR'], ['CC', 'IT']] },
];
