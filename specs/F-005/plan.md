# 実装計画

対象の機能仕様: `specs/F-005/spec.md`。式と初期値の根拠は `docs/design/team-model-algorithm.md`。

勝率の計算は `src/winrate/`(DOM と Node 固有の API に依存しない純粋な TypeScript)。入力は F-010 の戦力 S(`src/team/`)、F-009 の評価(ratings.json)、F-004 の結果、F-006 の NEXT の予想ピック。出力は F-001 の入力の形式(`src/sim/`)。S1〜S3 の当てはまりの確認は `scripts/` の検証の命令(第三者のデータはリポジトリに置かない)。画面は `src/app/`。

## タスク

| ID | 内容 | 対応する受入基準 | 変更の対象パス | 依存 | 並列可 |
| --- | --- | --- | --- | --- | --- |
| Task-1 | 勝率の土台: 評価設定、β の決め方、事前の勝率、ステージ補正、S を計算できないときの 50.0%、F-001 の勝率表の出力 | 1, 2, 3, 6, 7, 16 | `src/winrate/core.ts`、`src/winrate/config.json`、`tests/winrate/core.test.ts` | F-010 Task-2・Task-3 | 不可 |
| Task-2 | 結果による θ の当て直し(Bradley-Terry と事前分布、本番とスクリムの重み)と、80% の区間(1,000 回の抽出、乱数の種) | 4, 7b | `src/winrate/update.ts`、`src/winrate/interval.ts`、`tests/winrate/update.test.ts` | Task-1 | 不可 |
| Task-3 | 仕上がりの項(共同プレイ歴・メタの近さ(チャンピオンの近さと戦い方の近さ)・τ)と気持ちの補正、ドラフトの優位の項(F-006 の出力を読む)と寄与の切り詰め | 9, 10, 11, 13, 14 | `src/winrate/dynamics.ts`、`tests/winrate/dynamics.test.ts` | Task-1 | 可 |
| Task-4 | S1〜S3 での当てはまりの確認の命令と記録、常識の検査 K-08・K-09(反したら勝率表を書かずに失敗) | 13, 15 | `scripts/winrate-backtest.mjs`、`src/winrate/checks.ts`、`src/rating/known-facts.json`、`tests/winrate/checks.test.ts` | Task-2, Task-3 | 不可 |
| Task-5 | 試合の分析ページ(事前と更新後の勝率、上位3つの要因、β、区間、仕上がりと気持ちの内訳、予測と実際の結果) | 5, 8, 12 | `src/app/match/**`、`src/app/components/App.svelte`、`src/app/lib/index.ts`、`src/app/app.css`、`tests/app/match.test.ts` | Task-4 | 不可 |

## 粒度の確認

| 項目 | 上限 | 見込み |
| --- | --- | --- |
| 変更行数 | 800 | Task-1 約500 / Task-2 約550 / Task-3 約450 / Task-4 約500 / Task-5 約700 |
| 変更ファイル数 | 15 | 各 3〜8 |
| レビュー所要時間 | 30分 | 各 20〜30 分 |

## テストの方針

| 受入基準 | テストの種類 | どこに置くか |
| --- | --- | --- |
| 1, 2, 3, 6, 7, 16 | 単体(固定の S から β と勝率、和が 100.0%、ステージ補正、欠けたときの 50.0%、F-001 の形式) | `tests/winrate/core.test.ts` |
| 4, 7b | 単体(固定の結果で θ の向き、スクリムの重み、F-004 が無いときの θ = 0、同じ種で同じ区間) | `tests/winrate/update.test.ts` |
| 9, 10, 11, 13, 14 | 単体(d・c・m と τ の向き、m_pool と m_style の計算と、特性が無いときの m = m_pool、連敗と回復、F-006 が無いときの 0、切り詰め) | `tests/winrate/dynamics.test.ts` |
| 13, 15 | 単体(K-08・K-09 に反すると書かずに失敗、確認の記録の形) | `tests/winrate/checks.test.ts` |
| 5, 8, 12 | 画面の論理の単体と、Chrome での確認 | `tests/app/match.test.ts` |

## スタック構成(依存する変更を積み上げる場合のみ)

| 層 | 対応タスク | ベース | 扱う関心事 |
| --- | --- | --- | --- |
| 1 | Task-1 | F-010 Task-3 のマージ後の main | 勝率の土台 |
| 2 | Task-2・Task-3 | 層1 のマージ後の main | 結果による更新 / 時間で変わる項(並列) |
| 3 | Task-4 | 層2 のマージ後の main | 当てはまりの確認と常識の検査 |
| 4 | Task-5 | 層3 のマージ後の main | 試合の分析ページ |

## AI エージェントへ与える分割の指示

- 1つの変更単位で1つの関心事のみを扱う
- 変更単位ごとに単独でビルドと自動検証が通る状態にする
- 依存の順序は上表の層番号に従う。上限(800 行・15 ファイル)を超えそうなら、行数で切らずに関心事で分け直し、この計画を直す

## 承認(G-4)

| 項目 | 値 |
| --- | --- |
| 判定者 | 価値責任者(takenori-kusaka) |
| 判定日 | |
| 結果 | |
