// F-011 Task-1: メタの一覧と原稿のデータの形、読み込み・検証(受入基準 2・10)
// データは data/meta/<パッチ>.json。DOM と Node 固有の API に依存しない
import current from '../../data/meta/26.20.json' with { type: 'json' };

export const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUP'] as const;
export type MetaRole = (typeof ROLES)[number];
export type MetaTier = 'A' | 'B';

/** 主張。根拠の印(出典の URL・推定・未確認)をちょうど1つ持つ(基準10) */
export interface Claim {
  text: string;
  url?: string;
  estimated?: boolean;
  unverified?: boolean;
}

export interface MetaChampion {
  role: MetaRole;
  /** Data Dragon の数値の key(F-009 の poolDetail の championId と同じ値) */
  key: number;
  /** Data Dragon の文字列の id */
  id: string;
  name: string;
  /** 段階A = 最重要、段階B = 重要 */
  tier: MetaTier;
  /** 根拠の略号(basisLegend のキー) */
  basis: string[];
  reason: Claim;
}

export interface Chapter {
  id: string;
  title: string;
  /** AI が書いた章(章ごとに「AI 執筆」の印を付ける) */
  aiWritten: boolean;
  claims: Claim[];
}

/** 重要度つきの項目(基準3・4)。rank は 1 が最も重要な順位 */
export interface RankedItem {
  id: string;
  name: string;
  rank: number;
  reason: Claim;
}

export interface RankedSection {
  title: string;
  aiWritten: boolean;
  items: RankedItem[];
}

/** 基準3・4: 必ず載せる項目 */
export const REQUIRED_RANKED = {
  objectives: ['dragon', 'grubs', 'herald', 'baron', 'tower'],
  supTypes: ['enchanter', 'tank', 'mage', 'assassin', 'hybrid'],
  midRoles: ['sidePush', 'survive', 'waveclear', 'roam'],
} as const;
export type RankedKey = keyof typeof REQUIRED_RANKED;

/** 基準5・6: 必ず載せる章(ウィークサイド、ブルーとレッド、LTK のドラフト規則) */
export const REQUIRED_CHAPTERS = ['weakside', 'sides', 'ltk-rules'] as const;

export interface MetaGuide {
  kind: 'meta-guide';
  /** 原稿の対象のパッチ(例: 26.20) */
  patch: string;
  /** 原稿の更新日 */
  updatedAt: string;
  ddragonVersion: string;
  idSource: string;
  basisLegend: Record<string, { label: string; url: string }>;
  champions: MetaChampion[];
  chapters: Chapter[];
  ranked: Record<RankedKey, RankedSection>;
}

export type ClaimMark = '出典' | '推定' | '未確認';

/** 主張が持つ根拠の印(基準10。正しい主張は長さ1) */
export function claimMarks(c: Claim): ClaimMark[] {
  const marks: ClaimMark[] = [];
  if (c.url !== undefined) marks.push('出典');
  if (c.estimated === true) marks.push('推定');
  if (c.unverified === true) marks.push('未確認');
  return marks;
}

/** 章の印(基準10。AI が書いた章は「AI 執筆」) */
export function chapterMarks(ch: Chapter): string[] {
  return ch.aiWritten ? ['AI 執筆'] : [];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isUrl = (v: unknown) => typeof v === 'string' && /^https?:\/\/\S+$/.test(v);

function checkClaim(c: unknown, where: string, errors: string[]): void {
  if (!isObj(c) || !str(c.text)) {
    errors.push(`${where}: 主張の文が無い`);
    return;
  }
  const marks = claimMarks(c as unknown as Claim);
  if (marks.length === 0) errors.push(`${where}: 主張の根拠の印が無い(出典の URL・推定・未確認のどれか1つ)`);
  if (marks.length > 1) errors.push(`${where}: 主張の根拠の印が2つ以上ある(${marks.join('・')})`);
  if (c.url !== undefined && !isUrl(c.url)) errors.push(`${where}: 出典の URL が http(s) の URL ではない(${String(c.url)})`);
}

/** 基準2・10: メタの一覧と原稿を検証する。エラーが無ければ guide を返す */
export function validateMetaGuide(raw: unknown): { guide?: MetaGuide; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(raw) || raw.kind !== 'meta-guide') return { errors: ['kind が meta-guide のファイルではない'] };
  if (typeof raw.patch !== 'string' || !/^\d+\.\d+$/.test(raw.patch)) errors.push(`パッチの番号の形が違う(${String(raw.patch)}。例: 26.20)`);
  if (typeof raw.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.updatedAt)) errors.push(`更新日の形が違う(${String(raw.updatedAt)}。例: 2026-10-09)`);
  if (!str(raw.ddragonVersion)) errors.push('Data Dragon の版が無い');
  const legend = isObj(raw.basisLegend) ? raw.basisLegend : {};
  for (const [code, v] of Object.entries(legend)) {
    if (!isObj(v) || !str(v.label) || !isUrl(v.url)) errors.push(`根拠の略号 ${code}: 説明か出典の URL が無い`);
  }

  const champions = Array.isArray(raw.champions) ? raw.champions : [];
  if (!champions.length) errors.push('メタの一覧にチャンピオンが無い');
  const seen = new Set<string>();
  champions.forEach((c: unknown, i) => {
    const where = `チャンピオン ${i + 1} 件目${isObj(c) && str(c.id) ? `(${c.id})` : ''}`;
    if (!isObj(c)) return errors.push(`${where}: 形が違う`);
    if (!ROLES.includes(c.role as MetaRole)) errors.push(`${where}: ロールが TOP・JG・MID・ADC・SUP のどれでもない(${String(c.role)})`);
    if (typeof c.key !== 'number' || !Number.isInteger(c.key) || c.key <= 0) errors.push(`${where}: key が正の整数ではない(${String(c.key)})`);
    if (!str(c.id) || !str(c.name)) errors.push(`${where}: id か日本語名が無い`);
    if (c.tier !== 'A' && c.tier !== 'B') errors.push(`${where}: 段階が A・B のどちらでもない(${String(c.tier)})`);
    const basis = Array.isArray(c.basis) ? c.basis : [];
    if (!basis.length) errors.push(`${where}: 根拠の略号が無い`);
    for (const b of basis) if (!isObj(legend[b as string])) errors.push(`${where}: 根拠の略号 ${String(b)} が basisLegend に無い`);
    checkClaim(c.reason, `${where} の理由`, errors);
    const k = `${String(c.role)}:${String(c.key)}`;
    if (seen.has(k)) errors.push(`${where}: 同じロールで key が重複している(${k})`);
    seen.add(k);
  });

  const chapters = Array.isArray(raw.chapters) ? raw.chapters : [];
  if (!chapters.length) errors.push('原稿に章が無い');
  chapters.forEach((ch: unknown, i) => {
    const where = `章 ${isObj(ch) && str(ch.id) ? ch.id : i + 1}`;
    if (!isObj(ch)) return errors.push(`${where}: 形が違う`);
    if (!str(ch.title)) errors.push(`${where}: 題が無い`);
    if (typeof ch.aiWritten !== 'boolean') errors.push(`${where}: AI 執筆かどうか(aiWritten)が無い`);
    const claims = Array.isArray(ch.claims) ? ch.claims : [];
    if (!claims.length) errors.push(`${where}: 主張が無い`);
    claims.forEach((c: unknown, j) => checkClaim(c, `${where} の主張 ${j + 1}`, errors));
  });

  const ids = new Set(chapters.filter(isObj).map((ch) => ch.id));
  for (const id of REQUIRED_CHAPTERS) if (!ids.has(id)) errors.push(`章 ${id} が無い(基準5・6)`);

  const ranked = isObj(raw.ranked) ? raw.ranked : {};
  for (const key of Object.keys(REQUIRED_RANKED) as RankedKey[]) {
    const sec = ranked[key];
    if (!isObj(sec)) {
      errors.push(`重要度の表 ${key} が無い(基準3・4)`);
      continue;
    }
    if (!str(sec.title)) errors.push(`重要度の表 ${key}: 題が無い`);
    if (typeof sec.aiWritten !== 'boolean') errors.push(`重要度の表 ${key}: AI 執筆かどうか(aiWritten)が無い`);
    const items = Array.isArray(sec.items) ? sec.items : [];
    const have = new Set(items.filter(isObj).map((i) => i.id));
    for (const id of REQUIRED_RANKED[key]) if (!have.has(id)) errors.push(`重要度の表 ${key}: 項目 ${id} が無い`);
    items.forEach((it: unknown, i) => {
      const where = `重要度の表 ${key} の ${isObj(it) && str(it.id) ? it.id : i + 1}`;
      if (!isObj(it)) return errors.push(`${where}: 形が違う`);
      if (!str(it.name)) errors.push(`${where}: 名前が無い`);
      if (typeof it.rank !== 'number' || !Number.isInteger(it.rank) || it.rank < 1) errors.push(`${where}: 重要度(1 以上の順位)が無い`);
      checkClaim(it.reason, `${where} の理由`, errors);
    });
  }

  return errors.length ? { errors } : { guide: raw as unknown as MetaGuide, errors };
}

/** 現在の原稿(data/meta/26.20.json)。検証に通らなければ例外 */
export function loadMetaGuide(): MetaGuide {
  const { guide, errors } = validateMetaGuide(current);
  if (!guide) throw new Error(`メタの一覧の検証に失敗: ${errors.join(' / ')}`);
  return guide;
}

/** 基準2: ロールの段階A と段階B のチャンピオン(一覧の順) */
export function importantChampions(guide: MetaGuide, role: MetaRole): { A: MetaChampion[]; B: MetaChampion[] } {
  const list = guide.champions.filter((c) => c.role === role);
  return { A: list.filter((c) => c.tier === 'A'), B: list.filter((c) => c.tier === 'B') };
}
