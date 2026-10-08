// F-009 Task-7(旧 Task-4b): 常識の一覧の検査(受入基準 21・22、docs/design/rating-model.md 節6)
// 評価の結果と入力を突き合わせ、反した条件ごとに選手と軸を列挙する。中身(条件と値)は known-facts.json
import { rankAnchor, loadEngineConfig, selectGames } from './engine.ts';
import { loadEvidenceConfig, type ShotcallingEvidence } from './evidence.ts';
import type { PlayerRating, RatingInputs } from './build.ts';
import data from './known-facts.json' with { type: 'json' };

export interface KnownFact {
  id: string;
  text: string;
  params: Record<string, unknown>;
  /** 保留の理由。検査に必要な計算がまだ無い条件 */
  pending?: string;
}

export interface FactViolation {
  factId: string;
  playerId: string;
  /** 軸の名前(地力・コール力 など) */
  axis: string;
  detail: string;
}

export interface FactResult {
  id: string;
  text: string;
  status: '合格' | '違反' | '保留';
  note?: string;
  violations: FactViolation[];
}

export interface FactReport {
  ok: boolean;
  results: FactResult[];
  violations: FactViolation[];
}

export function loadKnownFacts(): KnownFact[] {
  return structuredClone((data as unknown as { facts: KnownFact[] }).facts);
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback);
const fmt = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : String(x));

/** コール力の根拠の肯定と否定の強さの合計(評価設定の重みで数える) */
function shotcallingSums(entries: readonly ShotcallingEvidence[]) {
  const cfg = loadEvidenceConfig().shotcalling;
  const w = (e: ShotcallingEvidence) => (cfg.kindWeights[e.kind] ?? 0) * cfg.strengthPoints[e.strength];
  const used = entries.filter((e) => (cfg.kindWeights[e.kind] ?? 0) > 0);
  return {
    positives: used.filter((e) => e.direction === '+').length,
    pos: used.filter((e) => e.direction === '+').reduce((s, e) => s + w(e), 0),
    neg: used.filter((e) => e.direction === '-').reduce((s, e) => s + w(e), 0),
  };
}

export interface CheckOptions {
  /** 同じ入力・同じ基準日で計算し直す(K-07)。省略すると K-07 は保留 */
  recompute?: () => PlayerRating[];
  facts?: KnownFact[];
}

/** 基準21: 常識の一覧の全条件を検査する */
export function checkKnownFacts(ratings: readonly PlayerRating[], inputs: RatingInputs, now: number, opts: CheckOptions = {}): FactReport {
  const facts = opts.facts ?? loadKnownFacts();
  const engine = loadEngineConfig();
  const input = new Map(inputs.players.map((p) => [p.playerId, p]));
  const axisOf = (r: PlayerRating, key: string) => r.axes.find((a) => a.key === key);

  const checks: Record<string, (f: KnownFact, out: FactViolation[]) => string | undefined> = {
    'K-01': (f, out) => {
      const gap = num(f.params.anchorGap, 3);
      for (const a of ratings) {
        for (const b of ratings) {
          if (a === b || a.position !== b.position) continue;
          const ra = rankAnchor(input.get(a.playerId)?.rank);
          const rb = rankAnchor(input.get(b.playerId)?.rank);
          if (ra === null || rb === null || ra - rb < gap) continue;
          const ga = axisOf(a, 'ground')?.base ?? NaN;
          const gb = axisOf(b, 'ground')?.base ?? NaN;
          if (!(ga >= gb)) {
            out.push({ factId: f.id, playerId: a.playerId, axis: '地力', detail: `ランクの基準 ${fmt(ra)} の選手の地力 ${fmt(ga)} が、基準 ${fmt(rb)} の ${b.playerId} の地力 ${fmt(gb)} を下回る` });
          }
        }
      }
      return undefined;
    },
    'K-02': (f, out) => {
      const min = num(f.params.minRoleGames, 5);
      for (const r of ratings) {
        const p = input.get(r.playerId);
        const n = p ? selectGames(p.games, now, engine, { roleOnly: true, position: p.position }).length : 0;
        const c = axisOf(r, 'laning')?.confidence;
        if (n < min && c !== '低') out.push({ factId: f.id, playerId: r.playerId, axis: 'レーン戦', detail: `大会のロールの試合 ${n} 件(${min} 未満)なのに確度が「${c}」` });
      }
      return undefined;
    },
    'K-03': (f, out) => {
      const noPos = num(f.params.noPositiveMax, 2.5);
      const negMax = num(f.params.negativeMax, 4);
      for (const r of ratings) {
        const s = shotcallingSums(input.get(r.playerId)?.shotcalling ?? []);
        const score = axisOf(r, 'shotcalling')?.base ?? NaN;
        if (s.positives === 0 && !(score <= noPos)) {
          out.push({ factId: f.id, playerId: r.playerId, axis: 'コール力', detail: `肯定の根拠が無いのにコール力 ${fmt(score)}(${noPos} 以下であること)` });
        } else if (s.positives > 0 && s.neg > s.pos && !(score <= negMax)) {
          out.push({ factId: f.id, playerId: r.playerId, axis: 'コール力', detail: `否定(強さ ${fmt(s.neg)})が肯定(強さ ${fmt(s.pos)})を上回るのにコール力 ${fmt(score)}(${negMax} 以下であること)` });
        }
      }
      return undefined;
    },
    'K-04': (f, out) => {
      const max = num(f.params.max, 4);
      const ids = Array.isArray(f.params.nonCallers) ? (f.params.nonCallers as string[]) : [];
      for (const r of ratings.filter((x) => ids.includes(x.playerId))) {
        const score = axisOf(r, 'shotcalling')?.base ?? NaN;
        if (!(score <= max)) out.push({ factId: f.id, playerId: r.playerId, axis: 'コール力', detail: `価値責任者が「コールしない側」と確認したのにコール力 ${fmt(score)}(${max} 以下であること)` });
      }
      return 'チームのマクロの指標は未計算のため、後半(マクロの根拠が無いチームは「データなし」)は検査していない';
    },
    'K-05': (f, out) => {
      const league = String(f.params.league ?? 'LJL');
      const pros = ratings.filter((r) => r.tier === 'MASTERS' && (input.get(r.playerId)?.tournament.pro ?? []).some((x) => x.league === league));
      const rookies = ratings.filter((r) => r.tier === 'NEXT' && (input.get(r.playerId)?.tournament.ltk.length ?? 0) === 0);
      for (const a of pros) {
        for (const b of rookies) {
          const ta = axisOf(a, 'tournament')?.base ?? NaN;
          const tb = axisOf(b, 'tournament')?.base ?? NaN;
          if (!(ta > tb)) out.push({ factId: f.id, playerId: a.playerId, axis: '大会経験', detail: `${league} の経歴があるのに大会経験 ${fmt(ta)} が、LTK 初出場の NEXT の ${b.playerId}(${fmt(tb)})以下` });
        }
      }
      return undefined;
    },
    'K-06': (f, out) => {
      for (const r of ratings) {
        for (const a of r.axes) {
          const bad = [a.base, a.display].some((x) => !Number.isFinite(x) || x < 0 || x > 10);
          const noConf = !['高', '中', '低'].includes(a.confidence as string);
          if (bad || noConf) {
            out.push({ factId: f.id, playerId: r.playerId, axis: a.label, detail: `基礎 ${fmt(a.base)}・表示 ${fmt(a.display)}・確度 ${a.confidence ?? 'なし'}` });
          }
        }
      }
      return undefined;
    },
    'K-07': (f, out) => {
      if (!opts.recompute) return '計算し直す手段が渡されていないため検査していない';
      const again = new Map(opts.recompute().map((r) => [r.playerId, r]));
      for (const r of ratings) {
        const b = again.get(r.playerId);
        for (const a of r.axes) {
          const x = b && axisOf(b, a.key);
          if (!x || x.base !== a.base || x.display !== a.display) {
            out.push({ factId: f.id, playerId: r.playerId, axis: a.label, detail: `計算し直すと ${fmt(a.base)} が ${x ? fmt(x.base) : 'なし'} になった` });
          }
        }
      }
      return undefined;
    },
  };

  const results = facts.map((f): FactResult => {
    const check = checks[f.id];
    if (f.pending || !check) return { id: f.id, text: f.text, status: '保留', note: f.pending ?? '検査の手段が無い', violations: [] };
    const violations: FactViolation[] = [];
    const note = check(f, violations);
    return { id: f.id, text: f.text, status: violations.length ? '違反' : '合格', note, violations };
  });
  const violations = results.flatMap((r) => r.violations);
  return { ok: violations.length === 0, results, violations };
}

/** 報告の行: 条件ごとの結果と、反した選手・軸 */
export function formatReport(report: FactReport): string[] {
  const lines: string[] = [];
  for (const r of report.results) {
    lines.push(`${r.id} ${r.status}: ${r.text}${r.note ? `(${r.note})` : ''}`);
    for (const v of r.violations) lines.push(`  ${v.factId} 違反 ${v.playerId} ${v.axis}: ${v.detail}`);
  }
  return lines;
}
