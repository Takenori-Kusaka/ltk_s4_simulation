# 実装計画

対象の機能仕様: `specs/F-001/spec.md`

言語は TypeScript(ADR-0001)。計算部分は `src/sim/` に置き、DOM と Node 固有の API を使わない(基準14)。テストは Node.js 22 の型の除去(`.ts` を直接実行)と `node --test` で動かす。

## タスク

| ID | 内容 | 対応する受入基準 | 変更の対象パス | 依存 | 並列可 |
| --- | --- | --- | --- | --- | --- |
| Task-1 | 大会の日程・組み合わせの定数と型、Regular Stage の得点、MASTERS CUP の順位点、合計 pt によるシードと同点処理 | 1, 2, 3, 4, 5 | `src/sim/schedule.ts`、`src/sim/types.ts`、`src/sim/standings.ts`、`tests/sim/standings.test.ts` | — | 可 |
| Task-2 | Playoffs の特殊 BO4(GAME 3 が 2pt、GAME 4)、階級の割り当て方針、ダブルエリミネーションの進行 | 6, 7, 8 | `src/sim/playoffs.ts`、`tests/sim/playoffs.test.ts` | Task-1 | 不可 |
| Task-3 | 勝率表と確定済み結果の検証、種つき乱数、ブルーサイド補正、モンテカルロ本体とシード確率・優勝確率の集計 | 9, 10, 11, 12, 13, 14, 15 | `src/sim/validate.ts`、`src/sim/rng.ts`、`src/sim/simulate.ts`、`src/sim/index.ts`、`tests/sim/simulate.test.ts` | Task-1, Task-2 | 不可 |

## 粒度の確認

| 項目 | 上限 | 見込み |
| --- | --- | --- |
| 変更行数 | 400 | Task-1 約250 / Task-2 約200 / Task-3 約300(テスト込み) |
| 変更ファイル数 | 15 | 各 2〜5 |
| レビュー所要時間 | 30分 | 各 15〜25 分 |

## テストの方針

| 受入基準 | テストの種類 | どこに置くか |
| --- | --- | --- |
| 1 | 単体(日程の全12カードとサイドを表と照合) | `tests/sim/standings.test.ts` |
| 2, 3, 4, 5 | 単体(得点・順位点・シード・同点処理の固定例。S3 の CC/LR 同点の例を含む) | `tests/sim/standings.test.ts` |
| 6, 7, 8 | 単体(BO4 の 4-0・3-1・2-2→GAME 4、階級の割り当て、勝者・敗者の進行) | `tests/sim/playoffs.test.ts` |
| 9, 10, 11 | 単体(確定済みの結果の固定、同じ種で同じ出力、確率の合計) | `tests/sim/simulate.test.ts` |
| 12, 13 | 単体(不正な勝率表・日程に無い結果でエラー) | `tests/sim/simulate.test.ts` |
| 14 | 単体(`src/sim/` が `node:` の import と `window`・`document` を参照しないことの静的な検査) | `tests/sim/simulate.test.ts` |
| 15 | 単体(補正 0 と補正ありで RS の勝率が変わり、MC・PO は変わらない) | `tests/sim/simulate.test.ts` |

## スタック構成(依存する変更を積み上げる場合のみ)

| 層 | 対応タスク | ベース | 扱う関心事 |
| --- | --- | --- | --- |
| 1 | Task-1 | main | 得点と順位 |
| 2 | Task-2 | Task-1 のマージ後の main | Playoffs |
| 3 | Task-3 | Task-2 のマージ後の main | 模擬と集計 |

前回の積み上げで取り込み漏れが起きたため(PR #2〜#4)、各層は**前の層が main へマージされた後に main から**ブランチを切る。

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
