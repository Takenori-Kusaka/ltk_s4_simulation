// F-003: 集計のコマンド。収集(src/collect/cli.ts)の後に `node src/collect/aggregate-cli.ts` で実行する
// Riot API は呼ばない(保存済みの data/raw/ を読む)。Data Dragon だけをネットワークから取る
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writePublicData } from './aggregate.ts';
import { saveDataDragon } from './ddragon.ts';
import type { FetchLike } from './riot.ts';
import { buildRatings, configVersion, loadRatingInputs } from '../rating/build.ts';
import { checkKnownFacts, formatReport, type KnownFact } from '../rating/known-facts.ts';
import { teamIndicators } from '../rating/team-indicators.ts';
import { nextDraftForecast } from '../predict/next-draft.ts';
import { computePriorWinrates, MACRO_KEYS, readExternalViews, type MacroPart, type TierTeamS } from '../winrate/core.ts';
import { TIERS } from '../sim/types.ts';
import winrateConfig from '../winrate/config.json' with { type: 'json' };
import { createHash } from 'node:crypto';
import { loadMetaGuide } from '../meta/load.ts';
import { ROSTER } from '../data/roster.ts';
import { evaluateTeams } from '../team/evaluate.ts';

export interface AggregateMainOptions {
  rawDir?: string;
  publicDir?: string;
  snapshotsDir?: string;
  fetch?: FetchLike;
  now?: () => Date;
  out?: (line: string) => void;
  /** コール力・大会経験の根拠の記録(既定は docs/research/grounds/normalized) */
  groundsDir?: string;
  /** 常識の一覧(既定は src/rating/known-facts.json) */
  facts?: KnownFact[];
}

/**
 * 終了コード: 0 = 完了、1 = 一部の失敗(Data Dragon の取得、読めないファイル)。失敗しても書ける集計は書く
 * 2 = 評価が常識の一覧に反した(公開用の評価 ratings.json を書かない。基準22)
 */
export async function main(opts: AggregateMainOptions = {}): Promise<number> {
  const out = opts.out ?? ((l: string) => console.log(l));
  const publicDir = opts.publicDir ?? 'data/public';
  let code = 0;
  const { written, errors } = writePublicData({
    rawDir: opts.rawDir ?? 'data/raw', publicDir, snapshotsDir: opts.snapshotsDir ?? 'data/snapshots',
  });
  out(`集計のファイル ${written.length} 件を書いた`);
  for (const e of errors) out(`エラー: ${e}`);
  if (errors.length > 0) code = 1;
  code = Math.max(code, writeRatings(opts, publicDir, out));
  try {
    const path = await saveDataDragon(publicDir, { fetch: opts.fetch, now: opts.now });
    out(`Data Dragon のチャンピオンの一覧を書いた: ${path}`);
  } catch (e) {
    out(`Data Dragon の取得に失敗: ${e instanceof Error ? e.message : String(e)}`);
    code = 1;
  }
  return code;
}

/** F-009 基準21・22: 評価を計算し、常識の一覧を検査して、反しなければ ratings.json を書く */
function writeRatings(opts: AggregateMainOptions, publicDir: string, out: (l: string) => void): number {
  const now = (opts.now ?? (() => new Date()))();
  const groundsDir = opts.groundsDir ?? 'docs/research/grounds/normalized';
  const { inputs, errors } = loadRatingInputs({ rawDir: opts.rawDir ?? 'data/raw', groundsDir });
  for (const e of errors) out(`評価の入力のエラー: ${e}`);
  const ratings = buildRatings(inputs, now.getTime());
  const report = checkKnownFacts(ratings, inputs, now.getTime(), { recompute: () => buildRatings(inputs, now.getTime()), facts: opts.facts });
  for (const l of formatReport(report)) out(l);
  if (!report.ok) {
    out(`常識の一覧に ${report.violations.length} 件反したため、評価のファイルを書かない`);
    return 2;
  }
  const teamOf = new Map(ROSTER.map((r) => [r.id, r.team]));
  const teams = teamIndicators(inputs.players.map((p) => ({ ...p, team: teamOf.get(p.playerId) ?? '' })), inputs.matches, now.getTime());
  const path = join(publicDir, 'ratings.json');
  mkdirSync(publicDir, { recursive: true });
  const checks = report.results.map(({ id, status, note }) => ({ id, status, ...(note ? { note } : {}) }));
  const file = { kind: 'ratings', computedAt: now.toISOString(), configVersion: configVersion(), matches: inputs.matches.length, checks, players: ratings, teams };
  writeFileSync(path, JSON.stringify(file, null, 2) + '\n');
  out(`評価のファイルを書いた: ${path}(評価設定の版 ${file.configVersion})`);
  // F-006 基準9: F-005 が読む NEXT の予想ピックとプロテクト候補
  const draftPath = join(publicDir, 'next-draft.json');
  writeFileSync(draftPath, JSON.stringify(nextDraftForecast(file, loadMetaGuide()), null, 2) + '\n');
  out(`NEXT の予想ピックとプロテクト候補を書いた: ${draftPath}`);
  // F-010: 階級チームの評価と全階級チームの総合の軸
  const ev = evaluateTeams({ ratings, inputs: inputs.players, matches: inputs.matches, teamIndicators: teams, now: now.getTime(), snapshotsDir: opts.snapshotsDir ?? 'data/snapshots' });
  for (const e of ev.errors) out(`チームの評価の入力: ${e}`);
  const teamPath = join(publicDir, 'team-evaluation.json');
  writeFileSync(teamPath, JSON.stringify({ kind: 'team-evaluation', computedAt: now.toISOString(), configVersion: configVersion(), tierTeams: ev.tierTeams, overall: ev.overall, beta: ev.beta }, null, 2) + '\n');
  out(`チームの評価を書いた: ${teamPath}`);
  // F-005 Task-1: 事前の勝率表(F-001 の入力の形式)。S を計算できない階級チームは理由つきで null(基準16)
  // F-005 Task-6: マクロの点数 M の内訳は F-010 のチームの軸「連携の厚み」「司令塔」の素点(相対評価の前の値)
  const rated = new Set(ratings.map((r) => r.playerId));
  const tierTeams: TierTeamS[] = ev.tierTeams.map((t) => {
    const unrated = ROSTER.filter((p) => p.team === t.team && p.tier === t.tier && !rated.has(p.id)).map((p) => p.name);
    const macroParts: MacroPart[] = MACRO_KEYS.flatMap((key) => {
      const axis = t.axes.find((a) => a.key === key);
      return axis ? [{ key, label: axis.label, raw: axis.raw }] : [];
    });
    const base = { team: t.team as TierTeamS['team'], tier: t.tier as TierTeamS['tier'], macroParts };
    return unrated.length ? { ...base, S: null, reason: `評価の無い選手: ${unrated.join('・')}` } : { ...base, S: t.S };
  });
  // 外部の見立て(groundsDir の external-views.json)。無ければ項は 0
  const externalPath = join(groundsDir, 'external-views.json');
  let externalRaw: unknown = null;
  try {
    if (existsSync(externalPath)) externalRaw = JSON.parse(readFileSync(externalPath, 'utf8'));
  } catch (e) {
    out(`外部の見立ての入力: ${externalPath}: ${(e as Error).message}`);
  }
  const external = readExternalViews(externalRaw);
  for (const e of external.errors) out(`外部の見立ての入力: ${e}`);
  const winrates = computePriorWinrates(tierTeams, { externalViews: external.items });
  const winratePath = join(publicDir, 'winrates.json');
  const winrateVersion = createHash('sha256').update(JSON.stringify(winrateConfig)).digest('hex').slice(0, 12);
  writeFileSync(winratePath, JSON.stringify({ ...winrates, computedAt: now.toISOString(), configVersion: winrateVersion, results: null }, null, 2) + '\n');
  const scales = TIERS.map((tier) => `${tier} β ${winrates.beta[tier]} / β_macro ${winrates.betaMacro[tier]} / β_ext ${winrates.betaExt[tier]}`).join('、');
  out(`勝率表を書いた: ${winratePath}(${scales})`);
  return errors.length ? 1 : 0;
}

// 直接の実行の入口。テストは main を呼ぶ
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
