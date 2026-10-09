# 実装計画

対象の機能仕様: `specs/F-008/spec.md`。

比較の論理と経路は `src/app/compare/` と `src/app/lib/index.ts`(DOM に依存しない)。画面は `src/app/components/`。入力は F-009 の評価のファイル(ratings.json)と `teamRatingView`、日程は `src/sim/schedule.ts`。

## タスク

| ID | 内容 | 対応する受入基準 | 変更の対象パス | 依存 | 並列可 |
| --- | --- | --- | --- | --- | --- |
| Task-1 | 比較の論理(対象の解決、種類と階級の検査、差の計算、重複の除去)と `#/compare/...` の経路 | 10, 11, 12, 13, 14, 18, 19, 20, 21 | `src/app/compare/view.ts`、`src/app/lib/index.ts`、`tests/app/compare.test.ts` | — | 可 |
| Task-2 | 複数の系列を重ねるレーダーと比較の画面(選手の系列。凡例・差の表。チームを選んだときはチームの評価の後に出す旨の文) | 1, 2, 3, 4, 5, 6, 7, 8, 11b, 22 | `src/app/components/Radar.svelte`、`src/app/compare/ComparePage.svelte`、`src/app/components/App.svelte`、`src/app/app.css`、`tests/app/compare-render.test.ts` | Task-1 | 不可 |
| Task-3 | 選手のページとチームのページからの入口、次に当たる対面の解決 | 15, 16, 17 | `src/app/compare/opponent.ts`、`src/app/components/PlayerSheet.svelte`、`src/app/team/TeamPage.svelte`、`tests/app/compare-entry.test.ts` | Task-2 | 不可 |
| Task-4 | (2026-10-09 に価値責任者の決定で追加)チームの比較: 階級チームは F-010 の強さの軸、チーム全体は総合の軸の系列で重ねる。根拠の無い軸の凡例 | 9, 11 | `src/app/compare/**`、`tests/app/compare-team.test.ts` | Task-2, F-010 Task-5 | 不可 |

## 粒度の確認

| 項目 | 上限 | 見込み |
| --- | --- | --- |
| 変更行数 | 800 | Task-1 約350 / Task-2 約550 / Task-3 約300 |
| 変更ファイル数 | 15 | 各 3〜6 |
| レビュー所要時間 | 30分 | 各 20〜30 分 |

## テストの方針

| 受入基準 | テストの種類 | どこに置くか |
| --- | --- | --- |
| 10〜14, 18〜21 | 単体(経路の往復、不正・重複・混在、差の表) | `tests/app/compare.test.ts` |
| 1〜8, 11b, 22 | 画面の論理の単体(系列ごとの線・欠損・色)と、Chrome での幅 360px・1280px の確認 | `tests/app/compare-render.test.ts` |
| 15〜17 | 単体(基準日から次の対面、MASTERS の準決勝の相手、試合が無いときのボタンなし) | `tests/app/compare-entry.test.ts` |

## スタック構成(依存する変更を積み上げる場合のみ)

| 層 | 対応タスク | ベース | 扱う関心事 |
| --- | --- | --- | --- |
| 1 | Task-1 | main | 比較の論理と経路 |
| 2 | Task-2 | 層1 のマージ後の main | 比較の画面 |
| 3 | Task-3 | 層2 のマージ後の main | 入口と次の対面 |
| 4 | Task-4 | 層3 と F-010 Task-5 のマージ後の main | チームの比較 |

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
