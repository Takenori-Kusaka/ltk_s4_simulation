# 実装計画

対象の機能仕様: `specs/F-004/spec.md`。

記録の読み込みと検証、各機能への変換は `src/results/`(DOM と Node 固有の API に依存しない純粋な TypeScript。読み込みだけ Node の I/O)。F-009 への接続は `src/rating/`、F-005 への接続と書き出しは `src/collect/aggregate-cli.ts`、画面は `src/app/`。当てはまりの確認は `src/results/fit-cli.ts`(出力は `docs/research/results-fit.md`)。

2026-10-14 追記(Task-6〜10): LTKDB の変換は `.claude/skills/input-ltkdb/reference/ltkdb-to-scrims.mjs`(生成 AI を使わないスクリプト)、取り込みのワークフローは `.github/workflows/ltkdb-import.yml`。変換の検証は読み込み(`src/results/load.ts`)と同じ関数を使う。連敗の数 k の受け渡しは `src/winrate/`。

## タスク

| ID | 内容 | 対応する受入基準 | 変更の対象パス | 依存 | 並列可 |
| --- | --- | --- | --- | --- | --- |
| Task-1 | 入力の読み込みと検証: 記録の型、置き場からの読み込み、基準 1〜3 の検証、出典の無い記録・リスナー参加・「未確認」・重複の扱いと出力、チャンピオンの一覧の `keys`(F-003 の収集に数値の key を足す)、最初の記録(2026-10-10 のスクリム 3 試合)の取り込み | 1, 2, 3, 4, 5, 6, 7 | `src/results/types.ts`、`src/results/load.ts`、`src/results/champions.ts`、`src/collect/**`(チャンピオンの一覧の `keys`)、`data/public/champions.json`、`docs/research/grounds/scrims/2026-10-10-lr-core-vs-dd-core.json`、`tests/results/load.test.ts` | — | 可 |
| Task-2 | スクリムを個人の評価へ: 指標の対応表で `GameRecord` を作る、`GameRecord` の重み(`scrimGameWeight`)と F-009 の縮小・確度への反映、調子の係数から除くこと、ピックプールの数え方、軸の説明の「スクリム n 試合を含む」、文字起こしのコール力の根拠の印の検証 | 12, 13, 14, 15, 16, 17 | `src/results/to-games.ts`、`src/rating/types.ts`、`src/rating/engine.ts`、`src/rating/axes.ts`、`src/rating/build.ts`、`src/rating/evidence.ts`、`src/rating/config.json`、`tests/results/to-games.test.ts`、`tests/rating/engine.test.ts`、`tests/rating/build.test.ts` | Task-1 | 可(Task-3 と) |
| Task-3 | 本番の結果を θ・k へ: 試合 ID、F-005 の結果の入力 `games[]`(本番とスクリム)、連敗の数 k と勝敗の並び、予測の凍結(`forecast`)、`results.json` と勝率表の `results` の書き出し、`dayShift` への k の受け渡し、再現性 | 8, 9, 10, 11, 20, 24 | `src/results/official.ts`、`src/results/forecast.ts`、`src/collect/aggregate-cli.ts`、`tests/results/official.test.ts`、`tests/collect/aggregate.test.ts` | Task-1 | 可(Task-2 と) |
| Task-4 | 表示: キーマン(`standouts` と印)、日程のページの予測と実際、順位の表の「結果を反映」と実際の勝ち数、根拠のストーリーの個人の行の印 | 18, 19, 21, 22 | `src/results/standouts.ts`、`src/app/schedule/data.ts`、`src/app/schedule/view.ts`、`src/app/schedule/DayBox.svelte`、`src/app/schedule/StandingsBoard.svelte`、`src/app/story/story.ts`、`src/app/story/MatchStory.svelte`、`src/app/story/data.ts`、`tests/results/standouts.test.ts`、`tests/app/schedule.test.ts`、`tests/app/story.test.ts` | Task-2, Task-3 | 可(Task-5 と) |
| Task-5 | 当てはまりの確認: 予測と実際の対数損失と Brier スコア、`scrimGameWeight` ありと 0 の 2 通りの事前の勝率の比較、`docs/research/results-fit.md` への書き出し(推奨を書かない) | 23 | `src/results/fit.ts`、`src/results/fit-cli.ts`、`tests/results/fit.test.ts` | Task-2, Task-3 | 可(Task-4 と) |
| Task-6 | 結果だけの記録の受け口と同じ試合の扱い: `resultOnly`・`game` の欄の検証、結果だけの記録を F-005 の結果の入力へ渡し個人の評価・ピックプール・キーマンに使わないこと、同じ試合の置き換えと出力、スクリムの試合 ID の n、`cs14`・`cs14Sec` の欄の検証、集計の出力の件数とファイル名 | 25, 28, 29, 30 | `src/results/types.ts`、`src/results/load.ts`、`src/results/to-games.ts`、`tests/results/load.test.ts`、`tests/results/to-games.test.ts` | Task-1 | 可(Task-10 と) |
| Task-7 | LTKDB の変換(本番・結果だけ・写し・要約): 本番の行の日程との突き合わせと `results/` への書き出し、一致しない行の出力、選手の行か試合時間の無い試合を結果だけの記録として書くこと、14 分の CS と試合の番号の写し、JSON の要約と終了コード | 31, 32, 33, 37, 38 | `.claude/skills/input-ltkdb/reference/ltkdb-to-scrims.mjs`、`.claude/skills/input-ltkdb/SKILL.md`、`tests/results/ltkdb-convert.test.ts`、`tests/results/fixtures/**` | Task-6 | 可(Task-10 と) |
| Task-8 | LTKDB の変換(置き換え・訂正の候補・書く前の検証・名前の照合): 結果だけの記録の置き換え、同じ試合を足さないこと、訂正の候補の出力、書く前の検証と反した試合の隔離、チャンピオン名の正規化、名前の一致しない行を「未確認」にすること | 34, 35, 36 | `.claude/skills/input-ltkdb/reference/ltkdb-to-scrims.mjs`、`.claude/skills/input-ltkdb/SKILL.md`、`tests/results/ltkdb-convert.test.ts`、`tests/results/fixtures/**` | Task-7 | 可(Task-9 と) |
| Task-9 | 取り込みのワークフロー: 要約を読んで Draft PR(実行ごとに違う名前のブランチ、`results/` と `scrims/` の両方)と、試合 ID ごとの Issue を作る | 38 | `.github/workflows/ltkdb-import.yml`、`.claude/skills/input-ltkdb/SKILL.md` | Task-7 | 可(Task-8 と) |
| Task-10 | 連敗の数 k を気持ちの補正へ渡す: 集計が本番の結果から数えた k を `dayShift` の `kA`・`kB` へ渡す | 9 | `src/winrate/dynamics.ts`、`src/winrate/core.ts`、`src/collect/aggregate-cli.ts`、`tests/winrate/dynamics.test.ts`、`tests/collect/aggregate.test.ts` | Task-3 | 可(Task-6 と) |

**対応する受入基準のないタスクを作らないでください**。何のための作業か分からないタスクは、完了の判定ができません。

「変更の対象パス」は、実行環境の書き込み範囲の設定に使います。範囲外のファイルを変更する必要が出たら、**計画の誤りとして差し戻します**。エージェントが自分で範囲を広げてはなりません。

2026-10-14 追記:

- **開幕(2026-10-15)までに要る組は Task-6・Task-7**。次が Task-8・Task-9・Task-10
- 基準 38 は、前半(要約と終了コード)を Task-7、後半(ワークフローの Draft PR と Issue)を Task-9 が担う。基準 9 は、`results.json` への書き出しを Task-3、`dayShift` への受け渡しを Task-10 が担う(`src/winrate/dynamics.ts` が Task-3 の変更の対象パスの外だったため)。基準 29 のうち基準 21 の表示(キルと試合時間の「記録なし」)は Task-4 が担う
- Task-7・Task-8・Task-9 は `.claude/**` と `.github/workflows/**` を変えるため、PR に `state:needs-platform` を付けて AI維持管理者の確認を経る。Task-9 がワークフローに足す Issue を作る権限(`issues: write`)は自動化の権限の拡大であり、採否は人が決める
- LTKDB の勝者だけの 2 試合の記録と、既存の記録への `game` の追記は、どのタスクにも含めない(仕様の未確定事項。価値責任者の確定の後、記録だけの別の PR で足す)

## 粒度の確認

| 項目 | 上限 | 見込み |
| --- | --- | --- |
| 変更行数 | 800(構成 `task.maxChangedLines`) | Task-1 約 400 / Task-2 約 450 / Task-3 約 400 / Task-4 約 450 / Task-5 約 250 |
| 変更ファイル数 | 15 | 各 5〜11 |
| レビュー所要時間 | 30分 | 各 20〜30 分 |
| 変更行数(2026-10-14 追記。Task-6〜10) | 800 | Task-6 約 350 / Task-7 約 500 / Task-8 約 400 / Task-9 約 120 / Task-10 約 150 |
| 変更ファイル数(同上) | 15 | Task-6 5 / Task-7 4〜8(固定データを含む)/ Task-8 4〜8 / Task-9 2 / Task-10 5 |
| レビュー所要時間(同上) | 30分 | Task-6・Task-8 各 25〜30 分 / Task-7 30 分 / Task-9・Task-10 各 15 分 |

上限を超える見込みのタスクは分割します。**目安は行数ではなくレビュー可能性です**。行数は実装コードの差分で数え、記録のファイル(`docs/research/grounds/scrims/*.json`)・チャンピオンの一覧(`data/public/champions.json`)・自動生成ファイルは除きます。

2026-10-14 追記: Task-6〜10 の見込みの行数は、実装・テスト・固定データの合計。Task-7・Task-8・Task-9 の変換のスクリプト(`.claude/**`)とワークフロー(`.github/**`)は G-5 の変更規模の算定(製品のコードの差分。`scripts/gate/check-pr.mjs`)の外にあり、レビュー所要時間で判定する。テストと固定データ(`tests/**`)は算定に入るため、固定データ(`tests/results/fixtures/**`。LTKDB の「サイト_予定」の本番 40 行と、結果の行の写し)は 1 行に 1 レコードの JSON で置く。これまでの見込みと実績の比は Task-1 が 1.98(400 → 793 行)、Task-3 が 1.75(400 → 701 行。Draft の PR #149 の時点)。Task-7 が 30 分で読み切れない大きさになる場合は、行数で切らず、「本番の日程との突き合わせ(基準 31・32)」と「結果だけ・写し・要約(基準 33・37・38)」の関心事で分け直し、この計画を直す。

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
| 25, 28, 29, 30(基準 1・3・5・7 の 2026-10-14 の追記を含む) | 単体(固定の記録で、結果だけの記録の受け付けと反する形(選手の行を持つ・`game` が無い・`duration` の形)、本番の結果だけの記録の日程との一致、`games[]` に入り `GameRecord`・ピックプール・キーマンに入らないこと、同じ試合の置き換えの出力と `winner` の食い違いのエラー、`source.ltkdbMatchId` が違えば別の試合になること、試合 ID の n の重なりのエラー、`cs14`・`cs14Sec` の範囲、集計の出力の件数とファイル名) | `tests/results/load.test.ts`、`tests/results/to-games.test.ts` |
| 31, 32, 33, 37, 38(要約と終了コード) | 単体(LTKDB の「サイト_予定」の本番 40 行をそのまま固定データにし、スクリムの結果の行を本番の形に直した合成の行で、Regular Stage・MASTERS CUP の準決勝・3 位決定戦・決勝・Playoffs の対応づけ、`tier` と `stage` の大文字と小文字、`tier` が空の場合、一致しない行を書かずに出力すること、選手の行が 10 行に満たない試合と試合時間が空の試合の結果だけの記録、「計測秒」の境界 779・780・900・901 と空、`game` の写し、要約の欄と終了コード 0・10・1)。書く先はテストごとの一時の置き場 | `tests/results/ltkdb-convert.test.ts`、`tests/results/fixtures/**` |
| 34, 35, 36 | 単体(置き場に結果だけの記録がある場合の置き換え、`winner` が食い違う場合に置き換えないこと、同じ試合を足さないこと、値を変えた写しでの訂正の候補の出力と置き場が変わらないこと、置き場の記録が持たない欄を比べないこと、試合時間の差 1 秒以内の記録、検証に反した 1 試合だけを書かず残りを書くこと、「ジャーヴァンIV」の置き換え、チャンピオンの一覧を読めない場合の失敗、名前を替えた行とロールを入れ替えた行の「未確認」、表記の違う 9 人が「未確認」にならないこと) | `tests/results/ltkdb-convert.test.ts`、`tests/results/fixtures/**` |
| 38(ワークフロー) | 手動の実行(`workflow_dispatch`)の実行記録で、Draft PR のブランチの名前と、Issue の有無・題名を人が確かめる。機械の単体のテストは持たない(`gh` の呼び出しを含むワークフローの定義のため) | — |
| 9(`dayShift` への受け渡し) | 単体(k が 0・1・2・4 のときの気持ちの補正、集計が数えた k が `dayShift` に届くこと、本番の記録が無いとき補正が 0 のままであること) | `tests/winrate/dynamics.test.ts`、`tests/collect/aggregate.test.ts` |

テストは**実装より先に生成します**。実装コードをテスト生成の入力に渡しません。

## スタック構成(依存する変更を積み上げる場合のみ)

| 層 | 対応タスク | ベース | 扱う関心事 |
| --- | --- | --- | --- |
| 1 | Task-1 | main | 記録の読み込みと検証 |
| 2 | Task-2・Task-3 | 層1 のマージ後の main | 個人の評価への接続 / 本番の結果の θ・k への接続(並列) |
| 3 | Task-4・Task-5 | 層2 のマージ後の main | 表示 / 当てはまりの確認(並列) |
| 4(2026-10-14 追記) | Task-6 | main(Task-1 は取り込み済み) | 結果だけの記録の受け口と同じ試合の扱い |
| 5 | Task-7 | 層4 のマージ後の main | LTKDB の変換(本番・結果だけ・写し・要約) |
| 6 | Task-8・Task-9 | 層5 のマージ後の main | 変換の置き換え・訂正の候補・検証・照合 / 取り込みのワークフロー(並列。どちらも `.claude/skills/input-ltkdb/SKILL.md` に触るため、マージは順に) |
| —(層4〜6 と独立) | Task-10 | Task-3 のマージ後の main | 連敗の数 k を気持ちの補正へ |

## AI エージェントへ与える分割の指示

- 1つの変更単位で1つの関心事のみを扱う
- 変更単位ごとに単独でビルドと自動検証が通る状態にする
- 依存の順序は上表の層番号に従う。上限(800 行・15 ファイル)を超えそうなら、行数で切らずに関心事で分け直し、この計画を直す
- 価値責任者が確定する値(`scrimGameWeight`、F-005 の `weights.scrim`、キーマンの印の採否)は、確定の前は仕様の起案の値を評価設定に置き、`_comment` に「価値責任者の確定を要する」と書く。F-005 の `weights.scrim` は変えない
- (2026-10-14 追記)Task-6 は `src/collect/aggregate-cli.ts` に触れない(Task-3 の PR と同じファイルを変えないため。集計の出力の件数とファイル名は `src/results/load.ts` の出力の関数に足す)
- (2026-10-14 追記)Task-7・Task-8 の変換のテストは、変換のスクリプトの関数を読み込んで呼ぶ。テストが LTKDB と Data Dragon へ取りに行かないよう、公開データとチャンピオンの一覧は固定データで渡す
- (2026-10-14 追記)価値責任者が確定する事項(勝者だけの 2 試合を置くか、訂正の候補を自動で書き換えないこと、名前の一致しない行を「未確認」にすること、MASTERS CUP の 3 位決定戦と決勝の決め方)は、確定の前は仕様の起案のとおりに実装する

## 承認(G-4)

| 項目 | 値 |
| --- | --- |
| 判定者 | 価値責任者(takenori-kusaka) |
| 判定日 | |
| 結果 | |

2026-10-14 追記(Task-6〜10): 再判定の記録は `docs/gates/g4-F-004-2026-10-14-rejudge.md`。判定日と結果は判定者が書く。
