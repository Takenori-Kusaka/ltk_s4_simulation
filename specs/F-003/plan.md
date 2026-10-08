# 実装計画

対象の機能仕様: `specs/F-003/spec.md`

収集は Node.js で動くコマンド(`src/collect/`)。ブラウザで動く `src/sim/`・`src/score/` とは分け、Node の API(fetch・ファイル・子プロセス)はここでだけ使う。Riot API の生の応答は `data/raw/`(gitignore)に置き、公開してよい集計値だけを `data/public/` に出す(基準6)。テストは fetch と子プロセスを差し替えて、実際の API を呼ばない。

## タスク

| ID | 内容 | 対応する受入基準 | 変更の対象パス | 依存 | 並列可 |
| --- | --- | --- | --- | --- | --- |
| Task-1 | Riot API の呼び出し(キーの読み込み、429 の Retry-After による再試行、404 の扱い)と、ランク・試合の差分の収集、生の応答の保存、二重起動の防止、収集ログ | 1, 3, 4, 5 | `src/collect/riot.ts`、`src/collect/collect.ts`、`src/collect/cli.ts`、`tests/collect/riot.test.ts`、`tests/collect/collect.test.ts`、`.gitignore`、`package.json`(scripts) | — | 可 |
| Task-2 | 選手 × チャンピオンの集計(試合数・勝率・KDA・分あたり CS・分あたり視界・ダメージ割合・キル関与率)と、公開用の集計ファイルの出力、Data Dragon のチャンピオン一覧と版 | 2, 6, 10 | `src/collect/aggregate.ts`、`src/collect/ddragon.ts`、`tests/collect/aggregate.test.ts` | Task-1 | 不可 |
| Task-3 | 静的・定性・メタのスナップショットの読み込みと検証(出典・取得日・確度・主体、根拠の文章、パッチ番号) | 7, 8, 9 | `src/collect/snapshots.ts`、`data/snapshots/README.md`、`tests/collect/snapshots.test.ts` | — | 可 |
| Task-4 | Gemini CLI による定性の評価の下書き(入力は調査資料の該当部分と出典、出力は書いた主体「AI(モデル名)」) | 11 | `src/collect/ai-draft.ts`、`tests/collect/ai-draft.test.ts` | Task-3 | 不可 |

## 粒度の確認

| 項目 | 上限 | 見込み |
| --- | --- | --- |
| 変更行数 | 400 | Task-1 約350 / Task-2 約250 / Task-3 約200 / Task-4 約150 |
| 変更ファイル数 | 15 | 各 3〜7 |
| レビュー所要時間 | 30分 | 各 15〜30 分 |

## テストの方針

| 受入基準 | テストの種類 | どこに置くか |
| --- | --- | --- |
| 1 | 単体(差し替えた fetch で、前回より後の試合だけを要求し、取得日時つきで保存する) | `tests/collect/collect.test.ts` |
| 3 | 単体(429 と Retry-After の後に同じ要求をやり直す。待ちは差し替えた時計で測る) | `tests/collect/riot.test.ts` |
| 4 | 単体(Riot ID が null・404 の選手を「未取得」とし、他の選手を続ける) | `tests/collect/collect.test.ts` |
| 5 | 単体(保存したファイル・ログの全文にキーの文字列が現れない) | `tests/collect/collect.test.ts` |
| 2, 6 | 単体(固定の試合の詳細から集計値を計算し、公開ファイルに生の応答の項目が無い) | `tests/collect/aggregate.test.ts` |
| 10 | 単体(差し替えた fetch で Data Dragon の版と一覧を保存する) | `tests/collect/aggregate.test.ts` |
| 7, 8, 9 | 単体(欠けた項目を拒否し、選手と項目名を出す。パッチ番号と取得日を付ける) | `tests/collect/snapshots.test.ts` |
| 11 | 単体(差し替えた子プロセスへ出典つきの入力を渡し、出力を AI 名義で保存する) | `tests/collect/ai-draft.test.ts` |

## スタック構成(依存する変更を積み上げる場合のみ)

| 層 | 対応タスク | ベース | 扱う関心事 |
| --- | --- | --- | --- |
| 1 | Task-1・Task-3 | main | 取得 / スナップショット(互いに並列) |
| 2 | Task-2・Task-4 | 層1 のマージ後の main | 集計 / AI の下書き |

各層は、前の層が main へマージされた後に main からブランチを切る。

## AI エージェントへ与える分割の指示

- 1つの変更単位で1つの関心事のみを扱う
- 変更単位ごとに単独でビルドと自動検証が通る状態にする
- 目安100行を超えたら、分割の可否を人へ確認する
- 依存の順序は上表の層番号に従う

## 承認(G-4)

| 項目 | 値 |
| --- | --- |
| 判定者 | 価値責任者(takenori-kusaka) |
| 判定日 | |
| 結果 | |
