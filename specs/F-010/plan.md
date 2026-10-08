# 実装計画

対象の機能仕様: `specs/F-010/spec.md`。式と初期値は `docs/design/team-model.md` と `docs/design/team-model-algorithm.md`。

チームの評価の計算は `src/team/`(DOM と Node 固有の API に依存しない純粋な TypeScript)。入力は F-009 の評価(`src/rating/`、ratings.json)と F-001 の日程・順位(`src/sim/`)。書き出しは `src/collect/aggregate-cli.ts`。画面は `src/app/`。

## タスク

| ID | 内容 | 対応する受入基準 | 変更の対象パス | 依存 | 並列可 |
| --- | --- | --- | --- | --- | --- |
| Task-1 | LTK3 の集計のスナップショット(集計値だけ・出典つき)の形と読み込み・検査、試験用の小さな記録 | 21, 21b | `src/team/ltk3.ts`、`data/snapshots/ltk3-*.json`、`tests/team/ltk3.test.ts`、`tests/fixtures/ltk3/**` | — | 可 |
| Task-2 | 強さの軸(戦力 S・連携の厚み・司令塔・継続性・ピックの幅・フィアレス耐性)と相対評価 | 1, 2, 2b, 3, 4, 6, 6b | `src/team/strength.ts`、`src/team/config.json`、`tests/team/strength.test.ts` | Task-1 | 可 |
| Task-3 | コーチの枠とコーチの評価軸、戦力 S へのコーチの項(重み 0.15) | 5, 5b, 5c, 5d, 5e | `src/team/coach.ts`、`src/team/config.json`、`data/snapshots/evidence-coach.json`、`tests/team/coach.test.ts` | Task-2 | 不可 |
| Task-4 | 戦い方の特性(向きの目盛り)とウィークサイド、資源が少ない試合 | 7, 8, 9, 10, 11, 12, 12b, 12c, 13 | `src/team/style.ts`、`tests/team/style.test.ts` | Task-1, Task-2 | 可 |
| Task-5 | 総合の軸(RS の期待得点・MASTERS CUP の力・均衡・コーチングの活用・一体感・チーム設計)と F-001 との接続、ratings.json への書き出し | 14, 14b, 15, 16, 17, 18, 18b | `src/team/overall.ts`、`src/collect/aggregate-cli.ts`、`tests/team/overall.test.ts` | Task-3, Task-4 | 不可 |
| Task-6 | 階級チームのページ(コーチの枠のレーダー・強さの軸・特性・根拠)と比較 | 5e, 19b, 20, 22 | `src/app/team/**`、`src/app/app.css`、`tests/app/team-eval.test.ts` | Task-5 | 不可 |
| Task-7 | 全階級チームのページ(総合の軸と、勝率の表は F-005 までデータなし) | 19 | `src/app/**`、`tests/app/all-tier.test.ts` | Task-6 | 不可 |

## 粒度の確認

| 項目 | 上限 | 見込み |
| --- | --- | --- |
| 変更行数 | 800 | Task-1 約300 / Task-2 約500 / Task-3 約450 / Task-4 約600 / Task-5 約550 / Task-6 約650 / Task-7 約400 |
| 変更ファイル数 | 15 | 各 3〜8 |
| レビュー所要時間 | 30分 | 各 20〜30 分 |

## テストの方針

| 受入基準 | テストの種類 | どこに置くか |
| --- | --- | --- |
| 21, 21b | 単体(集計値だけを持つこと、出典の無い行の拒否) | `tests/team/ltk3.test.ts` |
| 1〜4, 6, 6b | 単体(固定の選手の評価から戦力 S と相対評価、MASTERS の扱い) | `tests/team/strength.test.ts` |
| 5〜5e | 単体(コーチの評価軸、根拠が無いときの推定、S への重み 0.15) | `tests/team/coach.test.ts` |
| 7〜13 | 単体(向きの目盛り −1.0〜+1.0、確度、F-004 が無い間の扱い) | `tests/team/style.test.ts` |
| 14〜18b | 単体(F-001 の期待得点、F-005 が無い間のデータなし、K-08 の検査) | `tests/team/overall.test.ts` |
| 5e, 19, 19b, 20, 22 | 画面の論理の単体と、Chrome での確認 | `tests/app/**` |

## スタック構成(依存する変更を積み上げる場合のみ)

| 層 | 対応タスク | ベース | 扱う関心事 |
| --- | --- | --- | --- |
| 1 | Task-1 | main | LTK3 の集計 |
| 2 | Task-2 | 層1 のマージ後の main | 強さの軸 |
| 3 | Task-3・Task-4 | 層2 のマージ後の main | コーチの枠 / 戦い方の特性(並列) |
| 4 | Task-5 | 層3 のマージ後の main | 総合の軸 |
| 5 | Task-6 | 層4 のマージ後の main | 階級チームのページ |
| 6 | Task-7 | 層5 のマージ後の main | 全階級チームのページ |

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
