// F-004 Task-1: チャンピオンの一覧(用語)。F-003 の data/public/champions.json(Data Dragon ja_JP)に数値の key を keys として足したもの
// 記録の champion(日本語名)の検証(基準2)と、後続のタスクの championId(F-009 のピックプールと同じ値)に使う

export interface ChampionList {
  version: string | null;
  /** 日本語名の集合 */
  names: Set<string>;
  /** 日本語名 → 数値の key。keys の無い古い一覧では空 */
  keyByName: Map<string, number>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** champions.json を読む。形が違えば list を null にして理由を返す */
export function readChampionList(raw: unknown): { list: ChampionList | null; error: string | null } {
  if (!isObj(raw) || !isObj(raw.champions)) return { list: null, error: 'champions.json の形が違う(champions: チャンピオンの ID → 日本語名)' };
  const keys = isObj(raw.keys) ? raw.keys : {};
  const names = new Set<string>();
  const keyByName = new Map<string, number>();
  for (const [id, name] of Object.entries(raw.champions)) {
    if (typeof name !== 'string' || !name) continue;
    names.add(name);
    const key = Number(keys[id]);
    if (Number.isInteger(key) && key > 0) keyByName.set(name, key);
  }
  if (names.size === 0) return { list: null, error: 'champions.json のチャンピオンの一覧が空' };
  return { list: { version: typeof raw.version === 'string' ? raw.version : null, names, keyByName }, error: null };
}

/** 日本語名 → 数値の key。名前が null、一覧が無い、一覧に keys が無ければ null */
export function championKeyOf(list: ChampionList | null | undefined, name: string | null): number | null {
  return name && list ? list.keyByName.get(name) ?? null : null;
}
