// F-009 Task-10: 配信の文字起こしの前処理(生成 AI を使わない)。価値責任者の依頼(2026-10-09)
// 自動字幕の重なりを除き、区間にまとめ、LoL・LTK と無関係の区間を落とし、選手の言及とコール・プレイスタンスの手がかりを数える。
// 根拠の抜き出し(AI)は生の文字起こしではなく、この出力を読む。DOM と Node 固有の API に依存しない
import dict from './dictionaries.json' with { type: 'json' };
import aliasFile from './aliases.json' with { type: 'json' };

export interface Line {
  tSec: number;
  text: string;
}

export interface Segment {
  /** 区間の開始(m:ss) */
  t: string;
  tSec: number;
  text: string;
  /** LoL・LTK との関連の点数 */
  score: number;
  /** 一致した選手の ID(確信の高い別名と名簿の名前) */
  players: string[];
  /** 確信の低い別名で一致した選手の ID(players へは入れない) */
  candidates: string[];
  /** 分類ごとの手がかりの語の数 */
  categories: Record<string, number>;
  /** コールに当たる指示の言い回しの数 */
  callPhrases: number;
}

export interface NameEntry {
  text: string;
  id: string;
  confidence: 'high' | 'low';
}

export interface StructureOptions {
  /** 名簿の名前(ID と表示名) */
  roster: { id: string; name: string }[];
  /** チャンピオンの日本語名(メタの一覧と Data Dragon から) */
  champions?: string[];
  /** 区間の目安の長さ(秒)。この長さを超えた後の文の終わりで切る */
  windowSec?: number;
  /** 区間の最長(秒) */
  maxSec?: number;
  /** 間が空いたら切る(秒) */
  gapSec?: number;
  /** 残す点数の下限 */
  threshold?: number;
}

export interface Structured {
  kind: 'transcript-structured';
  source: string;
  lines: number;
  durationSec: number;
  rawChars: number;
  keptChars: number;
  segmentsTotal: number;
  segmentsKept: number;
  segments: Segment[];
  perPlayer: Record<string, { mentions: number; categories: Record<string, number>; addressedCallPhrases: number; times: string[] }>;
  topKeywords: [string, number][];
  caveats: string[];
}

const D = dict as unknown as {
  lol: string[];
  ltk: string[];
  categories: Record<string, string[]>;
  callPhrases: string[];
  stopwords: string[];
  exclude: Record<string, string[]>;
};
const ALIASES = (aliasFile as unknown as { aliases: NameEntry[] }).aliases;

/** "[m:ss] text" / "[h:mm:ss] text" の行を読む。時刻の無い行は無視する */
export function parseLines(raw: string): Line[] {
  const out: Line[] = [];
  for (const l of raw.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = /^\[(\d+):(\d{2})(?::(\d{2}))?\]\s*(.*)$/.exec(l.trim());
    if (!m) continue;
    const tSec = m[3] !== undefined ? +m[1] * 3600 + +m[2] * 60 + +m[3] : +m[1] * 60 + +m[2];
    const text = m[4].trim();
    if (text) out.push({ tSec, text });
  }
  return out;
}

/** 前の行の末尾と次の行の先頭が重なる部分(4 文字以上、または前の行全体)の長さ */
function overlap(prev: string, cur: string): number {
  if (cur.startsWith(prev)) return prev.length;
  for (let k = Math.min(prev.length, cur.length) - 1; k >= 4; k--) {
    if (prev.endsWith(cur.slice(0, k))) return k;
  }
  return 0;
}

/** 自動字幕の転がる重なり(前の行の文が次の行の先頭に繰り返される)を除き、各発話を1回にする */
export function dedupeLines(lines: Line[]): Line[] {
  const out: Line[] = [];
  let prev = '';
  for (const l of lines) {
    const k = overlap(prev, l.text);
    const rest = l.text.slice(k).trim();
    prev = l.text;
    if (rest) out.push({ tSec: l.tSec, text: rest });
  }
  return out;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const ENDS = /[。？！?!]$/;

/** 発話を区間にまとめる。目安の長さを超えた後の文の終わり、最長、間の空きで切る */
export function toSegments(lines: Line[], windowSec = 20, maxSec = 30, gapSec = 8): { tSec: number; text: string; parts: string[] }[] {
  const out: { tSec: number; text: string; parts: string[] }[] = [];
  let cur: { tSec: number; parts: string[]; last: number } | null = null;
  const flush = () => {
    if (cur) out.push({ tSec: cur.tSec, text: cur.parts.join(' '), parts: cur.parts });
    cur = null;
  };
  for (const l of lines) {
    if (cur && (l.tSec - cur.last > gapSec || l.tSec - cur.tSec >= maxSec)) flush();
    if (!cur) cur = { tSec: l.tSec, parts: [], last: l.tSec };
    cur.parts.push(l.text);
    cur.last = l.tSec;
    if (l.tSec - cur.tSec >= windowSec && ENDS.test(l.text)) flush();
  }
  flush();
  return out;
}

const occurrences = (text: string, w: string) => (w && text.includes(w) ? text.split(w).length - 1 : 0);
/** 辞書の語の出現回数。exclude に挙げた長い語(リコール・アンコール など)の中の出現は数えない */
const count = (text: string, ws: readonly string[]) =>
  ws.reduce((n, w) => n + Math.max(0, occurrences(text, w) - (D.exclude?.[w] ?? []).reduce((m, x) => m + occurrences(text, x), 0)), 0);
const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
const words = (text: string) => [...segmenter.segment(text)].filter((s) => s.isWordLike).map((s) => s.segment);

/** 名簿の名前と別名の表。1 文字の名前は語の区切りで、それ以外は部分一致で探す */
export function nameTable(roster: { id: string; name: string }[], aliases: NameEntry[] = ALIASES): NameEntry[] {
  const own = roster.map((p) => ({ text: p.name, id: p.id, confidence: 'high' as const }));
  return [...own, ...aliases].filter((e) => e.text);
}

function findPlayers(text: string, table: NameEntry[]): { players: string[]; candidates: string[] } {
  const tokens = new Set(words(text));
  const hit = (e: NameEntry) => ([...e.text].length <= 1 ? tokens.has(e.text) : text.includes(e.text));
  const players = new Set<string>();
  const candidates = new Set<string>();
  for (const e of table) if (hit(e)) (e.confidence === 'high' ? players : candidates).add(e.id);
  for (const id of players) candidates.delete(id);
  return { players: [...players].sort(), candidates: [...candidates].sort() };
}

/** 文字起こしを構造化する */
export function structureTranscript(raw: string, source: string, opts: StructureOptions): Structured {
  const lines = parseLines(raw);
  const deduped = dedupeLines(lines);
  const segs = toSegments(deduped, opts.windowSec, opts.maxSec, opts.gapSec);
  const table = nameTable(opts.roster);
  const champs = (opts.champions ?? []).filter((c) => [...c].length >= 2);
  const threshold = opts.threshold ?? 2;

  const all: Segment[] = segs.map((s) => {
    const { players, candidates } = findPlayers(s.text, table);
    const categories: Record<string, number> = {};
    for (const [k, ws] of Object.entries(D.categories)) {
      const n = count(s.text, ws);
      if (n) categories[k] = n;
    }
    // 確信の低い別名は 1 点(区間を残す手がかりにはするが、選手の集計には入れない)
    const score = count(s.text, D.lol) + 2 * count(s.text, D.ltk) + 2 * count(s.text, champs) + 3 * players.length + candidates.length;
    // 本文は手がかり(LoL・LTK の語、チャンピオン、選手、分類の語、コールの言い回し)を含む字幕の断片だけを残し、省いた所は「…」にする
    const signal = (t: string) =>
      count(t, D.lol) + count(t, D.ltk) + count(t, champs) + count(t, D.callPhrases) +
      Object.values(D.categories).reduce((n, ws) => n + count(t, ws), 0) + findPlayers(t, table).players.length + findPlayers(t, table).candidates.length > 0;
    const text = s.parts.map((x) => (signal(x) ? x : '…')).join(' ').replace(/(… )+…/g, '…');
    return { t: fmt(s.tSec), tSec: s.tSec, text, score, players, candidates, categories, callPhrases: count(s.text, D.callPhrases) };
  });
  const kept = all.filter((s) => s.score >= threshold || s.players.length > 0);

  const perPlayer: Structured['perPlayer'] = {};
  for (const s of kept) {
    for (const id of s.players) {
      const p = (perPlayer[id] ??= { mentions: 0, categories: {}, addressedCallPhrases: 0, times: [] });
      p.mentions++;
      p.addressedCallPhrases += s.callPhrases;
      for (const [k, n] of Object.entries(s.categories)) p.categories[k] = (p.categories[k] ?? 0) + n;
      if (p.times.length < 8) p.times.push(s.t);
    }
  }
  const freq = new Map<string, number>();
  const stop = new Set(D.stopwords);
  for (const s of kept) {
    for (const w of words(s.text)) {
      if ([...w].length < 2 || stop.has(w) || /^[\p{Script=Hiragana}ー]+$/u.test(w) || /^\d+$/.test(w) || /^[ッャュョァィゥェォーっゃゅょ]/u.test(w)) continue;
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  const topKeywords = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40);

  return {
    kind: 'transcript-structured',
    source,
    lines: lines.length,
    durationSec: lines.length ? lines[lines.length - 1].tSec : 0,
    rawChars: raw.length,
    keptChars: kept.reduce((n, s) => n + s.text.length, 0),
    segmentsTotal: all.length,
    segmentsKept: kept.length,
    segments: kept,
    perPlayer,
    topKeywords,
    caveats: [
      '自動字幕には話者の情報が無い。perPlayer は「その選手の名前が出た区間」の集計で、本人の発話量ではない',
      'addressedCallPhrases は、選手の名前が出た区間のコールの言い回しの数(呼びかけ・指示の推定)。誰が言ったかは分からない',
      '分類の数は辞書の語の部分一致の回数で、否定(〜しない)や文脈は区別しない',
    ],
  };
}
