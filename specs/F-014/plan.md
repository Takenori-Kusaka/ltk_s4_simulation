# 実装計画

対象の機能仕様: `specs/F-014/spec.md`

画面の論理は `src/app/schedule/view.ts`(純粋な関数: 直近の試合日、日程の箱の行、順位表の行、優勝候補の要約)。部品は `src/app/schedule/`(`DayBox.svelte`・`StandingsBoard.svelte`・`ChampionSummary.svelte`)。勝率表のファイルとシミュレーションは F-013 の `src/app/sim/view.ts` の関数を使う。

## タスク

| ID | 内容 | 対応する受入基準 | 変更の対象パス | 依存 | 並列可 |
| --- | --- | --- | --- | --- | --- |
| Task-1 | 共通の論理と部品、ホーム: 直近の試合日の判定、日程の箱(Regular Stage のカード、MASTERS CUP の組み合わせ)の行と勝率の棒、順位表(期待勝ち数・期待 pt・優勝確率、TOTAL の順、1 位の強調、「予想(開幕前)」の印)、勝率のデータが無いときの表示、ホームへの配置(4 王家の一覧の上) | 1〜7, 11, 12, 13 | `src/app/schedule/**`、`src/app/components/Home.svelte`、`src/app/components/App.svelte`、`src/app/app.css`、`tests/app/schedule.test.ts` | F-013 Task-1 | 不可 |
| Task-2 | `#/sim` の作り替え: 優勝候補の要約、順位表、Day 1〜6 の日程の箱、MASTERS CUP の 3 日の組み合わせ、「開幕前の予想」と種・試行・計算日時、「計算の根拠」の折りたたみ(β・S・6 組の表) | 8, 9, 10, 11, 13 | `src/app/sim/**`、`tests/app/sim.test.ts` | Task-1 | 可 |
| Task-3 | 推しチーム・推し選手の視点: チームのページの「勝てるのか」の節(直近の試合の箱・階級チームの試合の一覧・シーズンの見通し)、選手のページの「勝てるのか」の節(直近の試合・対面と比較ページへのリンク・試合の一覧)、ホームの推しチームの選択(localStorage・強調・導線・解除)、データが無いときの表示 | 14, 15, 16, 17, 18 | `src/app/schedule/**`、`src/app/team/**`、`src/app/components/PlayerSheet.svelte`、`src/app/components/Home.svelte`、`src/app/app.css`、`tests/app/favorite.test.ts` | Task-1 | 可 |
| Task-4 | (2026-10-10 追加。再判定)試合の根拠のストーリー: 日程の箱の行を押して開く根拠の節(結論の一文、寄与の内訳の表、出典つきの根拠、入っているもの・入っていないもの、材料が無いときの表示)。評価のファイルとチームの評価のファイルの読み込み | 19, 20, 21, 22, 23, 24, 25 | `src/app/story/**`、`src/app/schedule/DayBox.svelte`、`src/app/app.css`、`tests/app/story.test.ts` | Task-1 | 可 |
| Task-5 | (2026-10-10 追加。再判定 2)順位表を予想の結果(整数の勝ち数・負け数・ポイント)にする: 各試合で勝率の高い側が勝ったとした結果の集計(Regular Stage のポイントの規則、MASTERS CUP の決勝・3 位決定戦とポイント)、TOTAL の並び(同点の扱い)、見出しの文言、MASTERS CUP の M3・M4 の予想の組み合わせの箱(基準 1・8) | 1, 4, 5, 8, 13 |
| Task-6 | (2026-10-10 追加。再判定 3)内容レビューの反映: 順位表の注記、結論の一文の言い回し、大会経験の根拠と「未確認(AI 収集)」の印、言い回しの統一(乱数の種・影響・予想 pt・今後の更新・15%)、英語のチーム名、最後の日より後の見出しと Playoffs の案内 | 26, 27, 28, 29, 30 | `src/app/schedule/view.ts`、`src/app/schedule/StandingsBoard.svelte`、`src/app/schedule/DayBox.svelte`、`src/app/components/Home.svelte`、`src/app/sim/SimPage.svelte`、`tests/app/schedule.test.ts` | Task-1 | 可 |
| (Task-6 の対象パス) | `src/app/schedule/**`、`src/app/story/**`、`src/app/sim/**`、`src/app/team/**`、`src/app/components/Home.svelte`、`src/app/components/PlayerSheet.svelte`、`tests/app/**` | Task-5 | 不可 |

## 粒度の確認

| 項目 | 上限 | 見込み |
| --- | --- | --- |
| 変更行数 | 800 | Task-1 約650 / Task-2 約400 / Task-3 約600 / Task-4 約650 / Task-5 約300 / Task-6 約450 |
| 変更ファイル数 | 15 | Task-1 8 / Task-2 3 / Task-3 7 / Task-4 6 / Task-5 5 |
| レビュー所要時間 | 30分 | 各 25 分 |

## テストの方針

| 受入基準 | テストの種類 | どこに置くか |
| --- | --- | --- |
| 2 | 単体(閲覧日ごとの直近の試合日。開幕前・試合日当日・試合日の間・最終日の後・MASTERS CUP の日) | `tests/app/schedule.test.ts` |
| 1, 3, 12, 13 | 単体(日程の箱の行: カードの並び、ブルーとレッド、NEXT と CORE の勝率が `matches` の値と一致、MASTERS CUP の日の箱) | `tests/app/schedule.test.ts` |
| 4, 5, 13 | 単体(順位表: 期待勝ち数の和と負け数、期待 pt、TOTAL の順、1 位の印、「予想(開幕前)」) | `tests/app/schedule.test.ts` |
| 6, 7 | 単体(勝率のデータが無いときの文、ホームの部品の順序を Home.svelte の文字列で確かめる) | `tests/app/schedule.test.ts` |
| 8, 9, 10 | 単体(要約の順、`#/sim` の論理の出力に β・S の語が無い、折りたたみの初期状態、「開幕前の予想」の文) | `tests/app/sim.test.ts` |
| 14, 15, 18 | 単体(チームの直近の試合の箱の強調、階級チームの試合の一覧と期待勝ち数、見通しの値、選手の直近の試合と対面の選手と比較ページの href、データが無いときの文) | `tests/app/favorite.test.ts` |
| 16, 17 | 単体(推しチームの保存の読み書きを差し替えた storage で検証、強調の対象、解除。外部へ送る呼び出しが無いことはコードの文字列で確かめる) | `tests/app/favorite.test.ts` |
| 19〜25 | 単体(寄与の計算が戦力 S の式の項と一致する、並び、大・中・小の境界、結論の一文と「ほぼ互角」、差が最大の 2 軸、根拠の抜き出しと「見当たらない」、固定の文、β の語が無い、材料が無いときの文。行がボタンで `aria-expanded` を持つことは DayBox.svelte の文字列で確かめる) | `tests/app/story.test.ts` |
| 26〜30(再判定 3) | 単体(注記の文、結論の言い回し、大会経験の根拠と印、言い回し、英語名、最後の日より後の見出し) | `tests/app/schedule.test.ts`・`tests/app/story.test.ts`・`tests/app/favorite.test.ts` |
| 4, 5, 13(再判定 2) | 単体(予想の結果の勝ち数・負け数が整数で各階級 6 試合の和になる、ポイントの規則(1 勝 1pt と同日の +1pt)、MASTERS CUP の決勝と 3 位決定戦の組み合わせとポイント、同率のときの勝者の決め方、TOTAL と同点の並び、小数が表に無い) | `tests/app/schedule.test.ts` |
| 11 | Chrome での確認(幅 360px・1280px) | PR の「検証方法と結果」(人) |

## スタック構成(依存する変更を積み上げる場合のみ)

| 層 | 対応タスク | ベース | 扱う関心事 |
| --- | --- | --- | --- |
| 1 | Task-1 | main | 共通の部品とホーム |
| 2 | Task-2・Task-3・Task-4・Task-5 | 層1 のマージ後の main | `#/sim` の作り替え / 推しチーム・推し選手の視点 / 試合の根拠のストーリー / 順位表の予想の結果(並列) |

## AI エージェントへ与える分割の指示

- 1つの変更単位で1つの関心事のみを扱う
- 変更単位ごとに単独でビルドと自動検証が通る状態にする
- 計算を足さない(期待勝ち数の和だけ。勝率は F-005、シミュレーションは F-001)
- 公式のエンブレムの画像・書体を取り込まない

## 承認(G-4)

| 項目 | 値 |
| --- | --- |
| 判定者 | 価値責任者(takenori-kusaka) |
| 判定日 | 2026-10-10 |
| 結果 | 通過 |
