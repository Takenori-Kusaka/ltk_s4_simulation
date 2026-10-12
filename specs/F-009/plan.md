# 実装計画

対象の機能仕様: `specs/F-009/spec.md`。式と初期値は `docs/design/rating-model.md`。

評価の計算は `src/rating/`(DOM と Node 固有の API に依存しない純粋な TypeScript)。収集の追加は `src/collect/`。画面は `src/app/`。

## タスク

| ID | 内容 | 対応する受入基準 | 変更の対象パス | 依存 | 並列可 |
| --- | --- | --- | --- | --- | --- |
| Task-1 | 評価の土台: 評価設定の型と読み込み、評価の試合の選び方(期間・長さ・ロール)、新しさの重み、ランクの基準、対面との差の標準化(母集団の分布)、縮小、確度、事前値への置き換え | 1, 2, 3, 4, 5, 6, 7, 8, 9, 23 | `src/rating/engine.ts`、`src/rating/types.ts`、`src/rating/config.json`、`tests/rating/engine.test.ts` | — | 可 |
| Task-2 | 6つのデータの軸(地力・レーン戦・集団戦・連携・安定感・ピックプール)の定義(指標・重み・ロール別の指標)、LTK の経験の項、ピックプールの計算 | 10, 11 | `src/rating/axes.ts`、`src/rating/config.json`、`tests/rating/axes.test.ts` | Task-1 | 不可 |
| Task-3 | 根拠の軸(コール力・大会経験)、AI 収集の印、否定の根拠の扱い、根拠のスナップショット(LTK 戦績・プロ経歴・他の大会・コールの根拠)の初版 | 12, 13, 14, 15, 16 | `src/rating/evidence.ts`、`data/snapshots/evidence-*.json`、`tests/rating/evidence.test.ts` | Task-1 | 可 |
| Task-4 | 調子の係数(直近14日の勝率・LP の増減・練習量)と表示の点数 | 17, 18, 19 | `src/rating/form.ts`、`tests/rating/form.test.ts` | Task-1 | 可 |
| Task-7 | (旧 Task-4b。トレーラの形式 Task-N に合わせて 2026-10-09 に改番)常識の一覧の検査と、集計のコマンドへの組み込み(反したら公開用のファイルを書かずに失敗)、計算ごとの記録 | 21, 22 | `src/rating/known-facts.ts`、`src/rating/known-facts.json`、`src/collect/aggregate-cli.ts`、`tests/rating/known-facts.test.ts` | Task-2, Task-3 | 不可 |
| Task-5 | 収集の追加: サモナーレベル・熟練度、直近 120 日の試合を最大 60 件 | 26, 27 | `src/collect/riot.ts`、`src/collect/collect.ts`、`tests/collect/collect.test.ts` | — | 可 |
| Task-6 | 画面(選手のページ): 全軸のレーダー(確度で線を変える、推定の印)と調子、軸の説明(基準・補正・縮小・LTK の項・試合数・指標の位置・根拠・確度の理由) | 20, 24 | `src/app/**`、`tests/app/**` | Task-7 | 不可 |
| Task-8 | (2026-10-09 に旧 Task-6 から分割。変更行数が上限 800 を超えたため関心事で分けた)チームの指標(視界・オブジェクト・マクロ)の計算と、評価のファイルへの書き出し | 25 | `src/rating/team-indicators.ts`、`src/rating/axes.json`、`src/collect/aggregate-cli.ts`、`tests/rating/team-indicators.test.ts` | Task-7 | 可 |
| Task-9 | (2026-10-09 に旧 Task-6 から分割)画面(チームのページ): 全軸の相対評価のレーダーとチームの指標の表示 | 25 | `src/app/team/**`、`src/app/**`、`tests/app/**` | Task-6, Task-8 | 不可 |
| Task-11 | (2026-10-10 追加。再判定 2)経歴の反映: 経歴の記録の読み込み(最高ランク・プロの経歴)、ランクの基準 = ソロランクと最高ランクの高い方、元プロの下限(Challenger 0 LP = 8.0)、基準の出どころの表示 | 6, 28, 29, 30 | `src/rating/engine.ts`、`src/rating/build.ts`、`src/rating/types.ts`、`src/rating/evidence.ts`、`tests/rating/engine.test.ts`、`tests/rating/build.test.ts` | Task-7 | 可 |
| Task-10 | (2026-10-09 追加。価値責任者の依頼)根拠の収集の道具: 配信の文字起こしの前処理(生成 AI を使わない。自動字幕の重なりの除去、区間、LoL・LTK と無関係の区間の除去、選手の対応付け、コール・プレイスタンスの手がかりの数)。根拠の抜き出しは前処理の出力を読む | 12〜16 | `src/transcript/**`、`tests/transcript/**`、`docs/research/grounds/README.md` | — | 可 |
| Task-12 | (2026-10-11 追加。再判定 4)大会経験の改訂: プロの経歴の加点の上限 `proMax` 3.0、国際大会の記録(経歴の記録の `lol.internationalEvents`。出典は `lol.statusSource`)の読み込みと加点(`internationalPer`・`internationalMax`)、他の大会との重複の除外(別名の表 `internationalAliases`。同じ大会名と年)、軸の説明と根拠の一覧への追加 | 12, 32 | `src/rating/evidence.ts`、`src/rating/build.ts`、`src/rating/config.json`、`tests/rating/evidence.test.ts`、`tests/rating/build.test.ts` | Task-11 | 可(Task-13 と同じファイルに触るため、マージは順に) |
| Task-13 | (2026-10-11 追加。再判定 4)到達点からのブランク: 到達の時点の読み方(`peak.allTime.when` の自由記述から最も遅い日付。年だけなら 7 月 1 日)と最終出場年(`lol.lastCompetitiveYear`)の読み込み、歴代の最高ランクと元プロの下限のブランクの減衰(`blankDecayPerYear`・`blankGraceYears`。下限は 8.0 を下回らない、現役の記録より下げない)、不明時の印と確度の 1 段下げ、ランクの基準の説明(到達・ブランク・減衰) | 6, 33, 34, 35, 36 | `src/rating/engine.ts`、`src/rating/types.ts`、`src/rating/evidence.ts`、`src/rating/build.ts`、`src/rating/config.json`、`tests/rating/engine.test.ts`、`tests/rating/build.test.ts` | Task-11 | 可(Task-12 と同じファイルに触るため、マージは順に) |
| Task-14 | (2026-10-12 追加)価値責任者の見立て: 見立ての記録 `owner-views.json` の読み込みと検査(選手を対象とする項目。チーム・コーチの項目は F-010 へ渡す)、データの軸の基礎の点数への加点(ロール転向の割引の後・調子の前)、選手のページの「価値責任者の見立て」の表示、2026-10-12 の見立ての記録の初版 | 37, 38, 39 | `src/rating/owner-views.ts`、`src/rating/build.ts`、`src/rating/config.json`、`src/app/rating/view.ts`、`src/app/components/PlayerSheet.svelte`、`docs/research/grounds/normalized/owner-views.json`、`tests/rating/owner-views.test.ts` | Task-11 | 可 |
| Task-15 | (2026-10-12 追加)見立ての重みの比較: 当てはまりの確認の命令(F-004 基準23)に、見立ての重みを 1・0.5・0 倍にした 3 通りの対数損失と Brier スコアを足す | 40 | F-004 基準23 の命令の置き場、`tests/rating/owner-views.test.ts` | Task-14、F-004 基準23 の実装 | 可 |

## 粒度の確認

| 項目 | 上限 | 見込み |
| --- | --- | --- |
| 変更行数 | 800 | Task-1 約600 / Task-2 約400 / Task-3 約400(データの初版を除く)/ Task-4 約300 / Task-5 約300 / Task-6 約600 / Task-12 約250 / Task-13 約400(到達の時点の読み方のテストに実データの `when` 59 件を含む) |
| 変更ファイル数 | 15 | 各 3〜10 |
| レビュー所要時間 | 30分 | 各 20〜30 分 |

## テストの方針

| 受入基準 | テストの種類 | どこに置くか |
| --- | --- | --- |
| 1〜9, 23 | 単体(固定の試合の組で、期間外・短い試合の除外、ロールの絞り込み、重み、基準、標準化、縮小、確度、事前値) | `tests/rating/engine.test.ts` |
| 10, 11 | 単体(LTK の経験の項と上限、ピックプールの計算がチャンピオンの総数に依らない) | `tests/rating/axes.test.ts` |
| 12〜16 | 単体(根拠の無いコール力はデータなし、AI 収集の印と確度、否定の根拠は下げる向き) | `tests/rating/evidence.test.ts` |
| 12, 32(2026-10-11 の改訂) | 単体(プロの加点の上限 3.0、国際大会の加点と上限、出典の無い国際大会の記録は数えない、他の大会との重複の除外(別名・年の一致と不一致)、説明の文) | `tests/rating/evidence.test.ts`・`tests/rating/build.test.ts` |
| 33〜36 | 単体(到達の時点の読み方を経歴の記録の `when` 59 件の全数で、減衰と猶予、下限 8.0 を下回らない、ソロランク・今季の最高より下げない、不明時の印と確度の 1 段下げ、同値なら不明でない候補、説明の形) | `tests/rating/engine.test.ts`・`tests/rating/build.test.ts` |
| 17〜19 | 単体(係数の範囲、判断材料なし、表示の点数) | `tests/rating/form.test.ts` |
| 21, 22 | 単体(条件に反するとファイルを書かずに失敗) | `tests/rating/known-facts.test.ts` |
| 26, 27 | 単体(差し替えた fetch) | `tests/collect/collect.test.ts` |
| 20, 24, 25 | 画面の論理の単体と、Chrome・Playwright での確認 | `tests/app/**` |

## スタック構成(依存する変更を積み上げる場合のみ)

| 層 | 対応タスク | ベース | 扱う関心事 |
| --- | --- | --- | --- |
| 1 | Task-1・Task-5 | main | 評価の土台 / 収集の追加(並列) |
| 2 | Task-2・Task-3・Task-4 | 層1 のマージ後の main | データの軸 / 根拠の軸 / 調子(並列) |
| 3 | Task-7 | 層2 のマージ後の main | 常識の検査 |
| 4 | Task-6・Task-8 | 層3 のマージ後の main | 選手のページ / チームの指標の計算(並列) |
| 5 | Task-9 | 層4 のマージ後の main | チームのページ |
| 6 | Task-12・Task-13 | Task-11 のマージ後の main | 大会経験の改訂 / 到達点からのブランク(別の関心事。同じファイルに触るため、マージは順に) |

## AI エージェントへ与える分割の指示

- 1つの変更単位で1つの関心事のみを扱う
- 変更単位ごとに単独でビルドと自動検証が通る状態にする
- 依存の順序は上表の層番号に従う

## 承認(G-4)

| 項目 | 値 |
| --- | --- |
| 判定者 | 価値責任者(takenori-kusaka) |
| 判定日 | |
| 結果 | |
