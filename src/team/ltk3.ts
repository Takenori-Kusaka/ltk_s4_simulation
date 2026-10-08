// F-010 Task-1: LTK3 の集計のスナップショット(受入基準 21・21b、価値責任者の決定 D2)
// 第三者の公開スプレッドシート(Data シートの CSV)から、(チーム・階級)と(チーム・階級・ロール)ごとの集計値だけを作る。
// 試合ごとの行・選手名・チャンピオン・日付は書き出さない。DOM と Node 固有の API に依存しない

export const TEAM_CODES = ['DD', 'CC', 'IT', 'LR'] as const;
export type TeamCode = (typeof TEAM_CODES)[number];
const TIERS = ['NEXT', 'CORE', 'MASTERS'];
const KINDS = ['本番', 'スクリム'] as const;
export type Ltk3Kind = (typeof KINDS)[number];

/** スプレッドシートのチーム名 → チームの略号(Finale と同じ4チーム) */
const TEAM_BY_NAME: [RegExp, TeamCode][] = [
  [/Dahlia Diadem/, 'DD'],
  [/Camellia Crown/, 'CC'],
  [/Iris Tiara/, 'IT'],
  [/Laurel Regalia/, 'LR'],
];

export interface Ltk3Source {
  name: string;
  url: string;
  /** 取得日(YYYY-MM-DD) */
  retrievedAt: string;
}

/** 出典(meta-draft.md 節4 の調査で使ったスプレッドシート) */
export const LTK3_SOURCE: Omit<Ltk3Source, 'retrievedAt'> = {
  name: 'League The k4sen 3rd スクリム・本番戦績(ふつぐ氏の公開スプレッドシート)',
  url: 'https://docs.google.com/spreadsheets/d/1brY8SO40YPcvgf7DT_LkojBaTBL6IY-vklsTReeaLdU/',
};

export interface Ltk3Metrics {
  /** 14 分までの (K+A)/分(選手の平均) */
  kaPerMinTo14: number;
  /** 14 分以降の (K+A)/分(選手の平均) */
  kaPerMinAfter14: number;
  /** 14 分時点のチームのゴールド差(試合の平均) */
  teamGoldDiff14: number;
  /** 14 分時点のレーンのゴールド差(選手の平均) */
  laneGoldDiff14: number;
  /** 14 分までのキル関与率(選手の平均) */
  kp14: number;
  /** チーム内のゴールドの割合(ロールの行だけ。チームの行は 1/5 で意味を持たないため null) */
  goldShare: number | null;
  /** チーム内のダメージの割合(同上) */
  damageShare: number | null;
}

export interface Ltk3Row {
  team: TeamCode;
  tier: string;
  kind: Ltk3Kind;
  /** ロールの行だけ */
  role?: string;
  games: number;
  metrics: Ltk3Metrics;
}

export interface Ltk3Snapshot {
  kind: 'ltk3-aggregate';
  source: Ltk3Source;
  description: string;
  teams: Ltk3Row[];
  roles: Ltk3Row[];
}

/** RFC 4180 の CSV(引用符・引用符の二重化・CRLF・先頭の BOM) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x !== ''));
}

const teamOf = (name: string): TeamCode | null => TEAM_BY_NAME.find(([re]) => re.test(name))?.[1] ?? null;
const num = (v: string | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

interface PlayerRow {
  game: string;
  team: TeamCode;
  tier: string;
  kind: Ltk3Kind;
  role: string;
  gold: number;
  dmgPct: number;
  kp14: number;
  gd14: number;
  teamGd14: number;
  ka14: number;
  kaAfter: number;
}

/** 基準21b: Data シートの CSV から集計のスナップショットを作る */
export function aggregateLtk3(csvText: string, source: Ltk3Source): Ltk3Snapshot {
  const [header, ...body] = parseCsv(csvText);
  const ix = new Map(header.map((h, i) => [h, i]));
  const get = (r: string[], k: string) => r[ix.get(k) ?? -1];
  const rows: PlayerRow[] = [];
  for (const r of body) {
    const team = teamOf(get(r, 'チーム') ?? '');
    const kind = get(r, 'スクリム/本番') as Ltk3Kind;
    const tier = get(r, 'C / N') ?? '';
    if (!team || !KINDS.includes(kind) || !TIERS.includes(tier)) continue;
    rows.push({
      // 試合の識別(analyze_ltk3.py と同じ: 日・Game・GameN・階級)。書き出さない
      game: [(get(r, 'Day') ?? '').slice(0, 10), get(r, 'Game'), get(r, 'GameN'), tier].join('|'),
      team, tier, kind,
      role: get(r, 'Role') ?? '',
      gold: num(get(r, 'Gold')),
      dmgPct: num(get(r, 'DMG%')),
      kp14: num(get(r, 'KP@14')),
      gd14: num(get(r, 'GD@14')),
      teamGd14: num(get(r, 'TeamGD@14')),
      ka14: num(get(r, 'K+A/M@14')),
      kaAfter: num(get(r, 'K+A/M@after14')),
    });
  }
  // 大会の2チームがそろった試合だけ(リスナーとの試合、片方のチームしか無い重複行を除く)
  const teamsInGame = new Map<string, Set<TeamCode>>();
  for (const r of rows) teamsInGame.set(r.game, (teamsInGame.get(r.game) ?? new Set()).add(r.team));
  const used = rows.filter((r) => (teamsInGame.get(r.game)?.size ?? 0) === 2);

  const teamGold = new Map<string, number>();
  for (const r of used) teamGold.set(`${r.game}|${r.team}`, (teamGold.get(`${r.game}|${r.team}`) ?? 0) + r.gold);

  const group = (keyOf: (r: PlayerRow) => string) => {
    const m = new Map<string, PlayerRow[]>();
    for (const r of used) m.set(keyOf(r), [...(m.get(keyOf(r)) ?? []), r]);
    return [...m.values()];
  };
  const metrics = (rs: PlayerRow[], withShares: boolean): Ltk3Metrics => {
    const perGame = new Map<string, number>();
    for (const r of rs) perGame.set(r.game, r.teamGd14);
    return {
      kaPerMinTo14: mean(rs.map((r) => r.ka14)),
      kaPerMinAfter14: mean(rs.map((r) => r.kaAfter)),
      teamGoldDiff14: mean([...perGame.values()]),
      laneGoldDiff14: mean(rs.map((r) => r.gd14)),
      kp14: mean(rs.map((r) => r.kp14)),
      goldShare: withShares ? mean(rs.map((r) => r.gold / (teamGold.get(`${r.game}|${r.team}`) || 1))) : null,
      damageShare: withShares ? mean(rs.map((r) => r.dmgPct)) : null,
    };
  };
  const order = (a: Ltk3Row, b: Ltk3Row) =>
    TEAM_CODES.indexOf(a.team) - TEAM_CODES.indexOf(b.team) || TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) ||
    KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || (a.role ?? '').localeCompare(b.role ?? '');
  const teams = group((r) => `${r.team}|${r.tier}|${r.kind}`)
    .map((rs): Ltk3Row => ({ team: rs[0].team, tier: rs[0].tier, kind: rs[0].kind, games: new Set(rs.map((r) => r.game)).size, metrics: metrics(rs, false) }))
    .sort(order);
  const roles = group((r) => `${r.team}|${r.tier}|${r.kind}|${r.role}`)
    .map((rs): Ltk3Row => ({ team: rs[0].team, tier: rs[0].tier, kind: rs[0].kind, role: rs[0].role, games: new Set(rs.map((r) => r.game)).size, metrics: metrics(rs, true) }))
    .sort(order);
  return {
    kind: 'ltk3-aggregate',
    source,
    description: 'F-010 基準21・21b。第三者の公開スプレッドシートの Data シートから作った集計値だけ。試合ごとの行・選手名・チャンピオン・日付は含まない(価値責任者の決定 D2)',
    teams,
    roles,
  };
}

const ROW_KEYS = new Set(['team', 'tier', 'kind', 'role', 'games', 'metrics']);
const METRIC_KEYS = new Set(['kaPerMinTo14', 'kaPerMinAfter14', 'teamGoldDiff14', 'laneGoldDiff14', 'kp14', 'goldShare', 'damageShare']);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 基準21: 出典の欠け、集計値以外の項目(試合ごとの行・選手名など)、大会外のチームを拒否する */
export function validateLtk3Snapshot(raw: unknown): string[] {
  if (!isObj(raw) || raw.kind !== 'ltk3-aggregate') return ['kind が ltk3-aggregate のスナップショットではない'];
  const errors: string[] = [];
  const src = raw.source;
  if (!isObj(src) || [src.name, src.url, src.retrievedAt].some((v) => typeof v !== 'string' || !v.trim())) {
    errors.push('出典(名前・URL・取得日)が欠けている');
  }
  for (const k of Object.keys(raw)) {
    if (!['kind', 'source', 'description', 'teams', 'roles'].includes(k)) errors.push(`集計値以外の項目 ${k} がある(試合ごとの行は書き出さない)`);
  }
  for (const key of ['teams', 'roles'] as const) {
    const list = Array.isArray(raw[key]) ? (raw[key] as unknown[]) : [];
    list.forEach((row, i) => {
      if (!isObj(row)) return errors.push(`${key} の ${i + 1} 件目が表の行でない`);
      for (const k of Object.keys(row)) if (!ROW_KEYS.has(k)) errors.push(`${key} の ${i + 1} 件目に集計値以外の項目 ${k} がある`);
      if (!TEAM_CODES.includes(row.team as TeamCode)) errors.push(`${key} の ${i + 1} 件目のチーム ${String(row.team)} は大会の4チームでない`);
      if (!TIERS.includes(row.tier as string)) errors.push(`${key} の ${i + 1} 件目の階級 ${String(row.tier)} が不正`);
      if (!Number.isInteger(row.games) || (row.games as number) < 1) errors.push(`${key} の ${i + 1} 件目の試合数が不正`);
      if (isObj(row.metrics)) {
        for (const k of Object.keys(row.metrics)) if (!METRIC_KEYS.has(k)) errors.push(`${key} の ${i + 1} 件目に集計値以外の項目 ${k} がある`);
      } else errors.push(`${key} の ${i + 1} 件目に集計値が無い`);
    });
  }
  return errors;
}
