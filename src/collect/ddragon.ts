// F-003 基準10: Riot の Data Dragon から最新の版とチャンピオンの一覧(日本語の名前)を取り、版とともに保存する
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FetchLike } from './riot.ts';

const BASE = 'https://ddragon.leagueoflegends.com';
const LOCALE = 'ja_JP';

/** data/public/champions.json の形。champions はチャンピオンの ID(match-v5 の championName と同じ)→ 日本語の名前 */
export interface ChampionsFile {
  version: string;
  source: string;
  /** YYYY-MM-DD */
  retrievedAt: string;
  champions: Record<string, string>;
}

export interface DataDragonOptions {
  fetch?: FetchLike;
  now?: () => Date;
}

async function getJson(fetch: FetchLike, url: string): Promise<unknown> {
  const res = await fetch(url);
  if (res.status !== 200) throw new Error(`Data Dragon が HTTP ${res.status} を返した: ${url}`);
  return res.json();
}

export async function fetchDataDragon(opts: DataDragonOptions = {}): Promise<ChampionsFile> {
  const fetch = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
  const now = opts.now ?? (() => new Date());
  const versions = await getJson(fetch, `${BASE}/api/versions.json`);
  // versions.json は新しい版から並ぶ
  if (!Array.isArray(versions) || typeof versions[0] !== 'string') throw new Error('Data Dragon の版の一覧が読めない');
  const version = versions[0];
  const list = (await getJson(fetch, `${BASE}/cdn/${version}/data/${LOCALE}/champion.json`)) as { data?: Record<string, { id?: string; name?: string }> };
  const champions: Record<string, string> = {};
  for (const c of Object.values(list?.data ?? {})) if (c?.id && c.name) champions[c.id] = c.name;
  if (Object.keys(champions).length === 0) throw new Error(`Data Dragon ${version} のチャンピオンの一覧が空`);
  return { version, source: `Riot Data Dragon ${version} (${LOCALE})`, retrievedAt: now().toISOString().slice(0, 10), champions };
}

/** 取得に成功したときだけ `<publicDir>/champions.json` を書き、パスを返す */
export async function saveDataDragon(publicDir: string, opts: DataDragonOptions = {}): Promise<string> {
  const data = await fetchDataDragon(opts);
  mkdirSync(publicDir, { recursive: true });
  const path = join(publicDir, 'champions.json');
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  return path;
}
