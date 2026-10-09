# 実装計画

対象の機能仕様: `specs/F-006/spec.md`。

ピックとプロテクトの予想は `src/predict/`(DOM と Node 固有の API に依存しない純粋な TypeScript)。入力は F-009 の評価のファイル(poolDetail)、F-011 のメタの一覧(`data/meta/`)、日程(`src/sim/schedule.ts`)。AI 分析は日次の処理(F-007)から呼ぶ命令。画面は F-005 の試合の分析ページ(`src/app/match/`)に加える。

## タスク

| ID | 内容 | 対応する受入基準 | 変更の対象パス | 依存 | 並列可 |
| --- | --- | --- | --- | --- | --- |
| Task-1 | 見込みの値とピック候補の上位3体、CORE とフィアレスの除外、評価のファイルやメタの一覧が無いときの扱い | 1, 2, 3, 10 | `src/predict/picks.ts`、`src/predict/config.json`、`tests/predict/picks.test.ts` | — | 可 |
| Task-2 | プロテクト候補(軸にする選手と理由、ピックプールが狭い選手の扱い)、BAN 候補、F-005 へ渡す NEXT の予想ピックとプロテクト候補の出力 | 4, 4b, 5, 9 | `src/predict/protect.ts`、`src/predict/bans.ts`、`src/collect/aggregate-cli.ts`、`tests/predict/protect.test.ts` | Task-1 | 不可 |
| Task-3 | 作戦の項目と選択肢(評価設定)、選択肢の点と確率、入力の無い項目のデータなし、AI 分析による補足の文章(入力の制限、失敗時の前回の表示、入出力の記録) | 6, 6c, 6d, 7, 8, 11 | `src/predict/strategy.ts`、`src/predict/strategy.json`、`src/predict/strategy-cli.ts`、`tests/predict/strategy.test.ts` | Task-2 | 可 |
| Task-4 | 試合の分析ページへの表示(ピック候補と内訳、プロテクトの印と軸の選手、BAN 候補、作戦の項目ごとの予想と確率、AI の補足) | 1, 4, 4b, 4c, 5, 6b, 6d, 8 | `src/app/match/**`、`src/app/app.css`、`tests/app/match-picks.test.ts` | Task-2, Task-3, F-005 Task-5 | 不可 |

## 粒度の確認

| 項目 | 上限 | 見込み |
| --- | --- | --- |
| 変更行数 | 800 | Task-1 約450 / Task-2 約500 / Task-3 約450 / Task-4 約550 |
| 変更ファイル数 | 15 | 各 3〜6 |
| レビュー所要時間 | 30分 | 各 20〜30 分 |

## テストの方針

| 受入基準 | テストの種類 | どこに置くか |
| --- | --- | --- |
| 1, 2, 3, 10 | 単体(固定のピックプールとメタの一覧で順位と同点の順、除外、データなし) | `tests/predict/picks.test.ts` |
| 4, 4b, 5, 9 | 単体(軸にする選手が2人に分かれる、ピックプールが狭い選手の2体を守る、BAN できない1体の除外、出力の形式) | `tests/predict/protect.test.ts` |
| 6, 6c, 6d, 7, 8, 11 | 単体(確率の和が 1.000・同じ入力で同じ確率、入力の無い項目はデータなし、差し替えた Gemini の実行で入力の制限と失敗時に前回を返す) | `tests/predict/strategy.test.ts` |
| 1, 4, 4b, 4c, 5, 6b, 6d, 8 | 画面の論理の単体と、Chrome での確認 | `tests/app/match-picks.test.ts` |

## スタック構成(依存する変更を積み上げる場合のみ)

| 層 | 対応タスク | ベース | 扱う関心事 |
| --- | --- | --- | --- |
| 1 | Task-1 | main | ピック候補 |
| 2 | Task-2 | 層1 のマージ後の main | プロテクトと BAN、F-005 への出力 |
| 3 | Task-3 | 層2 のマージ後の main | 作戦の予想 |
| 4 | Task-4 | 層3 と F-005 Task-5 のマージ後の main | 画面 |

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
