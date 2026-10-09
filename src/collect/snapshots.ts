// F-003 Task-3 基準7・8・9: 静的・定性・メタのスナップショットの読み込みと検証(形式は data/snapshots/README.md)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROSTER } from '../data/roster.ts';
import { validatePlayerFile } from '../data/validate.ts';
import type { Author, Confidence, Evidence, PlayerFile, Qualitative } from '../data/types.ts';

export interface StaticSnapshot {
  kind: 'static';
  players: Record<string, Record<string, Evidence>>;
}
export interface QualitativeSnapshot {
  kind: 'qualitative';
  players: Record<string, Record<string, Qualitative>>;
}
export type MetaItem = Record<string, unknown> & { patch: string; retrievedAt: string };
export const META_LISTS = ['patchChanges', 'worldsPickBan', 'roleTiers', 'trends'] as const;
export interface MetaSnapshot extends Record<(typeof META_LISTS)[number], MetaItem[]> {
  kind: 'meta';
  /** '25.19' の形 */
  patch: string;
  /** YYYY-MM-DD */
  retrievedAt: string;
  source: string;
  confidence: Confidence;
  author: Author;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const absent = (v: unknown) => v === undefined || v === null || v === '';
const EVIDENCE_FIELDS = ['value', 'source', 'retrievedAt', 'confidence', 'author'] as const;

/** 選手ごと・項目ごとに検証し、通った項目だけを残す。拒否した項目は「選手: 項目」の形でエラーに出す */
function readPlayers<T>(
  raw: unknown,
  kind: 'static' | 'qualitative',
  check: (id: string, key: string, entry: unknown) => string[],
): { players: Record<string, Record<string, T>>; errors: string[] } {
  const players: Record<string, Record<string, T>> = {};
  if (!isObj(raw) || raw.kind !== kind || !isObj(raw.players)) {
    return { players, errors: [`${kind} のスナップショットではない(kind: '${kind}' と players が要る)`] };
  }
  const errors: string[] = [];
  for (const [id, entries] of Object.entries(raw.players)) {
    if (!ROSTER.some((p) => p.id === id)) {
      errors.push(`${id}: 名簿に無い選手`);
      continue;
    }
    if (!isObj(entries)) {
      errors.push(`${id}: 項目の一覧がオブジェクトではない`);
      continue;
    }
    const accepted: Record<string, T> = {};
    for (const [key, entry] of Object.entries(entries)) {
      const errs = check(id, key, entry);
      if (errs.length === 0) accepted[key] = entry as T;
      else errors.push(...errs);
    }
    players[id] = accepted;
  }
  return { players, errors };
}

/** 基準7: 値・出典・取得日・確度・書いた主体のどれかが欠けた値を拒否する */
export function readStaticSnapshot(raw: unknown): { snapshot: StaticSnapshot; errors: string[] } {
  const { players, errors } = readPlayers<Evidence>(raw, 'static', (id, key, e) => {
    const missing = isObj(e) ? EVIDENCE_FIELDS.filter((f) => absent(e[f])) : [...EVIDENCE_FIELDS];
    if (missing.length > 0) return [`${id}: 静的な値 ${key} に ${missing.join('・')} が欠けている`];
    return validatePlayerFile({ playerId: id, metrics: { [key]: e }, qualitative: {}, recentMatches: [] });
  });
  return { snapshot: { kind: 'static', players }, errors };
}

/** 基準8: 0〜10 の点数と根拠の文章(と出典・書いた主体)を持つ評価だけを受け付ける */
export function readQualitativeSnapshot(raw: unknown): { snapshot: QualitativeSnapshot; errors: string[] } {
  const { players, errors } = readPlayers<Qualitative>(raw, 'qualitative', (id, key, q) =>
    validatePlayerFile({ playerId: id, metrics: {}, qualitative: { [key]: q }, recentMatches: [] }),
  );
  return { snapshot: { kind: 'qualitative', players }, errors };
}

/** 基準9: パッチ番号と取得日の無いメタを拒否し、各データにパッチ番号と取得日を付ける */
export function readMetaSnapshot(raw: unknown): { snapshot: MetaSnapshot | null; errors: string[] } {
  if (!isObj(raw) || raw.kind !== 'meta') return { snapshot: null, errors: ["meta のスナップショットではない(kind: 'meta' が要る)"] };
  const errors: string[] = [];
  if (typeof raw.patch !== 'string' || !/^\d+\.\d+$/.test(raw.patch)) errors.push("メタ: パッチ番号 patch が無い('25.19' の形)");
  // 出典・取得日・確度・書いた主体はファイル単位で持つ(ADR-0003)。形は指標の検証を使う
  const evErrs = validatePlayerFile({
    playerId: ROSTER[0].id,
    metrics: { meta: { value: 'meta', source: raw.source, retrievedAt: raw.retrievedAt, confidence: raw.confidence, author: raw.author } },
    qualitative: {},
    recentMatches: [],
  });
  if (evErrs.length > 0) errors.push('メタ: 取得日 retrievedAt(YYYY-MM-DD)・出典 source・確度 confidence・書いた主体 author のどれかが欠けている');
  for (const list of META_LISTS) {
    const items = raw[list] ?? [];
    if (!Array.isArray(items) || !items.every(isObj)) errors.push(`メタ: ${list} がオブジェクトの配列ではない`);
  }
  if (errors.length > 0) return { snapshot: null, errors };
  const patch = raw.patch as string;
  const retrievedAt = raw.retrievedAt as string;
  const stamp = (list: string) => ((raw[list] ?? []) as Record<string, unknown>[]).map((i) => ({ ...i, patch, retrievedAt }));
  return {
    snapshot: {
      kind: 'meta',
      patch,
      retrievedAt,
      source: raw.source as string,
      confidence: raw.confidence as Confidence,
      author: raw.author as Author,
      patchChanges: stamp('patchChanges'),
      worldsPickBan: stamp('worldsPickBan'),
      roleTiers: stamp('roleTiers'),
      trends: stamp('trends'),
    },
    errors,
  };
}

/** 基準9: 検証したメタを `<dir>/meta-<patch>-<retrievedAt>.json` へ保存し、パスを返す。不正なら保存せずに投げる */
export function saveMetaSnapshot(dir: string, raw: unknown): string {
  const { snapshot, errors } = readMetaSnapshot(raw);
  if (!snapshot) throw new Error(errors.join('\n'));
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `meta-${snapshot.patch}-${snapshot.retrievedAt}.json`);
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + '\n');
  return path;
}

export type LoadedSnapshot =
  | { kind: 'static'; snapshot: StaticSnapshot; errors: string[] }
  | { kind: 'qualitative'; snapshot: QualitativeSnapshot; errors: string[] }
  | { kind: 'meta'; snapshot: MetaSnapshot | null; errors: string[] }
  | { kind: null; snapshot: null; errors: string[] };

/** data/snapshots/ に置かれるが、選手の指標の材料ではないスナップショットの kind(F-010 の LTK3 の集計・コーチの根拠) */
const OTHER_FEATURE_KINDS: readonly string[] = ['ltk3-aggregate', 'evidence-coach'];

/** JSON のファイルを読み、kind に応じて検証する */
export function loadSnapshotFile(path: string): LoadedSnapshot {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const kind = isObj(raw) ? raw.kind : undefined;
  if (kind === 'static') return { kind, ...readStaticSnapshot(raw) };
  if (kind === 'qualitative') return { kind, ...readQualitativeSnapshot(raw) };
  if (kind === 'meta') return { kind, ...readMetaSnapshot(raw) };
  // 他の機能が同じ置き場に置くスナップショット。検証はその機能が行い、ここでは読み飛ばす(#54)
  if (typeof kind === 'string' && OTHER_FEATURE_KINDS.includes(kind)) return { kind: null, snapshot: null, errors: [] };
  return { kind: null, snapshot: null, errors: [`${path}: kind が static・qualitative・meta のどれでもない`] };
}

/** 検証済みの静的・定性のスナップショットを F-002 の指標ファイルの形へ統合する。同じ項目は取得日の新しい値を採る */
export function toPlayerFile(playerId: string, statics: StaticSnapshot[], qualitatives: QualitativeSnapshot[]): PlayerFile {
  const metrics: Record<string, Evidence> = {};
  for (const s of statics) {
    for (const [key, e] of Object.entries(s.players[playerId] ?? {})) {
      if (!metrics[key] || e.retrievedAt >= metrics[key].retrievedAt) metrics[key] = e;
    }
  }
  const qualitative: Record<string, Qualitative> = {};
  for (const q of qualitatives) Object.assign(qualitative, q.players[playerId] ?? {});
  return { playerId, metrics, qualitative, recentMatches: [] };
}
