// F-011 Task-2: メタ解説のページの論理(受入基準 1・3・4・5・6・10・11)。DOM に依存しない
import tournament from '../../../data/meta/tournament.json' with { type: 'json' };
import { claimMarks, chapterMarks, importantChampions, ROLES, type Claim, type ClaimMark, type MetaChampion, type MetaGuide, type MetaRole, type RankedSection } from '../../meta/load.ts';

export interface ClaimView {
  text: string;
  marks: ClaimMark[];
  /** 出典の URL(印が「出典」のとき) */
  url?: string;
}
export interface RankedView {
  title: string;
  marks: string[];
  items: { id: string; name: string; rank: number; reason: ClaimView; marks: ClaimMark[] }[];
}
export interface ChapterView {
  id: string;
  title: string;
  marks: string[];
  claims: ClaimView[];
}
export interface MetaPageView {
  patch: string;
  updatedAt: string;
  /** 基準1: 見出しの近くに出す一行 */
  headline: string;
  /** 基準11: 原稿が古い可能性の注意。注意が要らなければ null */
  notice: string | null;
  roles: { role: MetaRole; A: MetaChampion[]; B: MetaChampion[] }[];
  objectives: RankedView;
  supTypes: RankedView;
  midRoles: RankedView;
  chapters: ChapterView[];
}

const claimView = (c: Claim): ClaimView => ({ text: c.text, marks: claimMarks(c), url: c.url });

function rankedView(sec: RankedSection): RankedView {
  return {
    title: sec.title,
    marks: sec.aiWritten ? ['AI 執筆'] : [],
    items: [...sec.items]
      .sort((a, b) => a.rank - b.rank)
      .map((i) => ({ id: i.id, name: i.name, rank: i.rank, reason: claimView(i.reason), marks: claimMarks(i.reason) })),
  };
}

/** 基準11: 大会のパッチの設定(data/meta/tournament.json)。空なら null */
export function loadTournamentPatch(): string | null {
  const v = (tournament as { tournamentPatch?: unknown }).tournamentPatch;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** 基準11: 大会のパッチが原稿のパッチと違う間と、設定の値が空の間は注意を出す */
export function staleNotice(guidePatch: string, tournamentPatch: string | null | undefined): string | null {
  if (!tournamentPatch || !tournamentPatch.trim()) {
    return `大会で使われるパッチの設定がまだ無いため、この原稿(パッチ ${guidePatch})が古い可能性があります`;
  }
  if (tournamentPatch.trim() !== guidePatch) {
    return `大会のパッチ ${tournamentPatch.trim()} と原稿のパッチ ${guidePatch} が違います。原稿が古い可能性があります`;
  }
  return null;
}

/** ページの表示内容 */
export function metaPageView(guide: MetaGuide, tournamentPatch: string | null = loadTournamentPatch()): MetaPageView {
  return {
    patch: guide.patch,
    updatedAt: guide.updatedAt,
    headline: `パッチ ${guide.patch} 対象 · 原稿の更新 ${guide.updatedAt}`,
    notice: staleNotice(guide.patch, tournamentPatch),
    roles: ROLES.map((role) => ({ role, ...importantChampions(guide, role) })),
    objectives: rankedView(guide.ranked.objectives),
    supTypes: rankedView(guide.ranked.supTypes),
    midRoles: rankedView(guide.ranked.midRoles),
    chapters: guide.chapters.map((ch) => ({ id: ch.id, title: ch.title, marks: chapterMarks(ch), claims: ch.claims.map(claimView) })),
  };
}
