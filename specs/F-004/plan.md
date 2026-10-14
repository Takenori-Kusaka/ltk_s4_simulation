# 実装計画

対象の機能仕様: `specs/F-004/spec.md`。

記録の読み込みと検証、各機能への変換は `src/results/`(DOM と Node 固有の API に依存しない純粋な TypeScript。読み込みだけ Node の I/O)。F-009 への接続は `src/rating/`、F-005 への接続と書き出しは `src/collect/aggregate-cli.ts`、画面は `src/app/`。当てはまりの確認は `src/results/fit-cli.ts`(出力は `docs/research/results-fit.md`)。

## タスク

| ID | 内容 | 対応する受入基準 | 変更の対象パス | 依存 | 並列可 |
| --- | --- | --- | --- | --- | --- |
| Task-1 | 入力の読み込みと検証: 記録の型、置き場からの読み込み、基準 1〜3 の検証、出典の無い記録・リスナー参加・「未確認」・重複の扱いと出力、チャンピオンの一覧の `keys`(F-003 の収集に数値の key を足す)、最初の記録(2026-10-10 のスクリム 3 試合)の取り込み | 1, 2, 3, 4, 5, 6, 7 | `src/results/types.ts`、`src/results/load.ts`、`src/results/champions.ts`、`src/collect/**`(チャンピオンの一覧の `keys`)、`data/public/champions.json`、`docs/research/grounds/scrims/2026-10-10-lr-core-vs-dd-core.json`、`tests/results/load.test.ts` | — | 可 |
| Task-2 | スクリムを個人の評価へ: 指標の対応表で `GameRecord` を作る、`GameRecord` の重み(`scrimGameWeight`)と F-009 の縮小・確度への反映、調子の係数から除くこと、ピックプールの数え方、軸の説明の「スクリム n 試合を含む」、文字起こしのコール力の根拠の印の検証 | 12, 13, 14, 15, 16, 17 | `src/results/to-games.ts`、`src/rating/types.ts`、`src/rating/engine.ts`、`src/rating/axes.ts`、`src/rating/build.ts`、`src/rating/evidence.ts`、`src/rating/config.json`、`tests/results/to-games.test.ts`、`tests/rating/engine.test.ts`、`tests/rating/build.test.ts` | Task-1 | 可(Task-3 と) |
| Task-3 | 本番の結果を θ・k へ: 試合 ID、F-005 の結果の入力 `games[]`(本番とスクリム)、連敗の数 k と勝敗の並び、予測の凍結(`forecast`)、`results.json` と勝率表の `results` の書き出し、`dayShift` への k の受け渡し、再現性 | 8, 9, 10, 11, 20, 24 | `src/results/official.ts`、`src/results/forecast.ts`、`src/collect/aggregate-cli.ts`、`tests/results/official.test.ts`、`tests/collect/aggregate.test.ts` | Task-1 | 可(Task-2 と) |
| Task-4 | 表示: キーマン(`standouts` と印)、日程のページの予測と実際、順位の表の「結果を反映」と実際の勝ち数、根拠のストーリーの個人の行の印 | 18, 19, 21, 22 | `src/results/standouts.ts`、`src/app/schedule/data.ts`、`src/app/schedule/view.ts`、`src/app/schedule/DayBox.svelte`、`src/app/schedule/StandingsBoard.svelte`、`src/app/story/story.ts`、`src/app/story/MatchStory.svelte`、`src/app/story/data.ts`、`tests/results/standouts.test.ts`、`tests/app/schedule.test.ts`、`tests/app/story.test.ts` | Task-2, Task-3 | 可(Task-5 と) |
| Task-5 | 当てはまりの確認: 予測と実際の対数損失と Brier スコア、`scrimGameWeight` ありと 0 の 2 通りの事前の勝率の比較、`docs/research/results-fit.md` への書き出し(推奨を書かない) | 23 | `src/results/fit.ts`、`src/results/fit-cli.ts`、`tests/results/fit.test.ts` | Task-2, Task-3 | 可(Task-4 と) |
| Task-11 | (2026-10-14 追加)14 分の CS をレーン戦へ: 記録の `cs14` から指標 `csAt14` を作る(TOP・JG・MID・ADC)、レーン戦の軸の定義への指標の追加、名簿の階級チーム同士の試合の同じロールの差の分布での標準化と組の数の下限 `cs14MinPairs`、説明の「n 試合を含む」の数え方 | 26, 27, 39, 40 | `src/results/to-games.ts`、`src/rating/axes.json`、`src/rating/engine.ts`、`src/rating/axes.ts`、`src/rating/types.ts`、`src/rating/config.json`、`tests/results/to-games.test.ts`、`tests/rating/engine.test.ts`、`tests/rating/axes.test.ts` | Task-2、Task-6(`cs14` の欄の検証) | 可(Task-12 と。`src/rating/types.ts`・`config.json` に触るため、マージは順に) |
| Task-12 | (2026-10-14 追加)本番の試合を個人の評価へ: 本番の記録の選手の行から `kind: official` の試合の記録を作ること(結果だけの記録は除く)、`officialGameWeight` の重み、調子の係数とピックプールの数え方、説明の「本番 n 試合(重み w)を含む」 | 41, 42 | `src/results/to-games.ts`、`src/rating/types.ts`、`src/rating/engine.ts`、`src/rating/axes.ts`、`src/rating/build.ts`、`src/rating/config.json`、`tests/results/to-games.test.ts`、`tests/rating/engine.test.ts`、`tests/rating/build.test.ts` | Task-2、Task-6(結果だけの記録の受け口) | 可(Task-11 と。同上) |
| Task-13 | (2026-10-14 追加)当てはまりの確認に `officialGameWeight` の 3 通り(設定の値・`scrimGameWeight` と同じ値・0)の比較を足す | 43 | `src/results/fit.ts`、`src/results/fit-cli.ts`、`tests/results/fit.test.ts` | Task-5、Task-12 | 可 |

**対応する受入基準のないタスクを作らないでください**。何のための作業か分からないタスクは、完了の判定ができません。

「変更の対象パス」は、実行環境の書き込み範囲の設定に使います。範囲外のファイルを変更する必要が出たら、**計画の誤りとして差し戻します**。エージェントが自分で範囲を広げてはなりません。

## 粒度の確認

| 項目 | 上限 | 見込み |
| --- | --- | --- |
| 変更行数 | 800(構成 `task.maxChangedLines`) | Task-1 約 400 / Task-2 約 450 / Task-3 約 400 / Task-4 約 450 / Task-5 約 250 |
| 変更行数(2026-10-14 追記。Task-11〜13) | 800 | Task-11 約 350 / Task-12 約 300 / Task-13 約 120(実装とテストの合計) |
| 変更ファイル数 | 15 | 各 5〜11。Task-11 9、Task-12 9、Task-13 3 |
| レビュー所要時間 | 30分 | 各 20〜30 分 |

上限を超える見込みのタスクは分割します。**目安は行数ではなくレビュー可能性です**。行数は実装コードの差分で数え、記録のファイル(`docs/research/grounds/scrims/*.json`)・チャンピオンの一覧(`data/public/champions.json`)・自動生成ファイルは除きます。

## テストの方針

| 受入基準 | テストの種類 | どこに置くか |
| --- | --- | --- |
| 1, 2, 3, 4, 5, 6, 7 | 単体(固定の記録で、欄の検証、日程との突き合わせ、出典なし・リスナー参加・未確認・重複の扱いと出力、失敗の終了コード) | `tests/results/load.test.ts` |
| 12, 13, 14, 16, 17 | 単体(対応表どおりの `GameRecord`、対面の有無、重み 2.0 での n・縮小・確度、調子の係数に入らないこと、ピックプールの数え方、`speakerIdentified` の無い根拠を読まないこと) | `tests/results/to-games.test.ts`、`tests/rating/engine.test.ts`、`tests/rating/build.test.ts` |
| 15 | 単体(軸の説明の文の有無) | `tests/rating/build.test.ts` |
| 8, 9, 10, 11, 20, 24 | 単体(試合 ID、並び、k と勝敗の並び、`forecast` の凍結と null の理由、`winrates.json` の `results`、スクリムの `kind`、同じ入力で同じ出力) | `tests/results/official.test.ts`、`tests/collect/aggregate.test.ts` |
| 18, 19 | 単体(ダメージ最多・キル関与最多の同値、印の規則の境界: 1 試合・2 試合・半分の端数) | `tests/results/standouts.test.ts`、`tests/app/story.test.ts` |
| 21, 22 | 画面の論理の単体と、Chrome での確認 | `tests/app/schedule.test.ts` |
| 23 | 単体(固定の予測と結果で対数損失・Brier、2 通りの比較、推奨の文が無いこと) | `tests/results/fit.test.ts` |
| 26, 27, 39, 40(2026-10-14) | 単体(TOP・JG・MID・ADC の `csAt14`、SUP と `cs14` が null の試合に持たせないこと、`maxCsAdvantageOnLaneOpponent` を作らないこと、平均 0・二乗平均平方根の分布、リスナー参加と結果だけの記録とソロランクの試合を分布に入れないこと、組の数が 7 と 8 の境界、説明の n) | `tests/results/to-games.test.ts`、`tests/rating/engine.test.ts`、`tests/rating/axes.test.ts` |
| 41, 42(2026-10-14) | 単体(本番の行から `official` の記録ができ結果だけの記録からはできないこと、重み 4.0 での n・縮小・確度、調子の係数に入らないこと、ピックプールで 1 試合、説明の文の有無) | `tests/results/to-games.test.ts`、`tests/rating/engine.test.ts`、`tests/rating/build.test.ts` |
| 43(2026-10-14) | 単体(固定の予測と結果で 3 通りの比較、推奨の文が無いこと) | `tests/results/fit.test.ts` |

テストは**実装より先に生成します**。実装コードをテスト生成の入力に渡しません。

## スタック構成(依存する変更を積み上げる場合のみ)

| 層 | 対応タスク | ベース | 扱う関心事 |
| --- | --- | --- | --- |
| 1 | Task-1 | main | 記録の読み込みと検証 |
| 2 | Task-2・Task-3 | 層1 のマージ後の main | 個人の評価への接続 / 本番の結果の θ・k への接続(並列) |
| 3 | Task-4・Task-5 | 層2 のマージ後の main | 表示 / 当てはまりの確認(並列) |

## AI エージェントへ与える分割の指示

- 1つの変更単位で1つの関心事のみを扱う
- 変更単位ごとに単独でビルドと自動検証が通る状態にする
- 依存の順序は上表の層番号に従う。上限(800 行・15 ファイル)を超えそうなら、行数で切らずに関心事で分け直し、この計画を直す
- 価値責任者が確定する値(`scrimGameWeight`、F-005 の `weights.scrim`、キーマンの印の採否)は、確定の前は仕様の起案の値を評価設定に置き、`_comment` に「価値責任者の確定を要する」と書く。F-005 の `weights.scrim` は変えない

- (2026-10-14 追記)Task-11・Task-12 は、F-009 の Task-16〜18(安定感・レーン戦の確度・相手の強さ)と同じ `src/rating/` のファイルに触る。マージは Task-11 → Task-12 → F-009 Task-16〜18 の順にする
- (2026-10-14 追記)価値責任者が確定する値(`officialGameWeight`、`cs14MinPairs`、JG に 14 分の CS を使うか)は、確定の前は仕様の起案の値を評価設定に置き、`_comment` に「価値責任者の確定を要する」と書く

2026-10-14 追記(Task-11〜13): 再判定の記録は `docs/gates/g4-F-004-2026-10-14-rejudge2.md`。判定日と結果は判定者が書く。

## 承認(G-4)

| 項目 | 値 |
| --- | --- |
| 判定者 | 価値責任者(takenori-kusaka) |
| 判定日 | |
| 結果 | |
