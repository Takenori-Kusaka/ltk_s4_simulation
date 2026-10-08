# 実装計画

対象の機能仕様: `specs/F-002/spec.md`

TypeScript + Vite + Svelte(ADR-0001)。採点の計算は `src/score/` に置き、DOM に依存させない(F-001 の `src/sim/` と同じ方針)。画面は `src/app/` に置く。

## タスク

| ID | 内容 | 対応する受入基準 | 変更の対象パス | 依存 | 並列可 |
| --- | --- | --- | --- | --- | --- |
| Task-1 | 選手名簿(60名)と指標ファイルの型・検証、採点規則 `scoring.json`、選手の5軸の採点、階級の相対評価とチーム全体の平均 | 2, 4, 6, 7, 11 | `src/data/**`、`src/score/**`、`tests/score/**` | — | 可 |
| Task-2 | SPA の土台(Vite・Svelte・ハッシュによる画面の切り替え、GitHub Pages の配置先のパス)と選手のページ(SVG の五角形レーダー、点数、根拠の表示、代替表示の立ち絵) | 1, 3, 4, 8, 10 | `index.html`、`vite.config.ts`、`svelte.config.js`、`src/app/**`、`tests/app/**`、`package.json` | Task-1 | 不可 |
| Task-3 | チームのページ(チーム全体・NEXT・CORE・MASTERS の4つのレーダー) | 5 | `src/app/team/**`、`tests/app/team.test.ts` | Task-2 | 可 |
| Task-4 | 選手のページの直近戦績と生データの表 | 12, 13 | `src/app/player/history/**`、`tests/app/history.test.ts` | Task-2 | 可 |
| Task-5 | 手元のブラウザだけで使う立ち絵の登録(IndexedDB に保存し、外部へ送らない) | 9 | `src/app/portrait/**`、`tests/app/portrait.test.ts` | Task-2 | 可 |

## 粒度の確認

| 項目 | 上限 | 見込み |
| --- | --- | --- |
| 変更行数 | 400 | Task-1 約350 / Task-2 約380(設定ファイルとロックファイルは算定から除外)/ Task-3〜5 各 約150 |
| 変更ファイル数 | 15 | Task-2 が最大で約12 |
| レビュー所要時間 | 30分 | 各 15〜30 分 |

## テストの方針

| 受入基準 | テストの種類 | どこに置くか |
| --- | --- | --- |
| 2, 4, 6, 7, 11 | 単体(採点・欠損・相対評価の換算式・型の不一致のエラー) | `tests/score/**` |
| 1, 3, 8 | 部品のテスト(Svelte の部品を描画し、点数の小数第一位・根拠の表示・代替表示を確かめる) | `tests/app/**` |
| 4 | 部品のテスト(欠損した軸を 0 と別の描き方で描く) | `tests/app/**` |
| 10 | ブラウザでの確認(幅 360px と 1280px で横スクロールが無い。Playwright を使う) | `tests/app/**` |
| 5 | 部品のテスト | `tests/app/team.test.ts` |
| 12, 13 | 部品のテスト | `tests/app/history.test.ts` |
| 9 | 部品のテスト(保存先がブラウザ内であり、fetch を呼ばない) | `tests/app/portrait.test.ts` |

## スタック構成(依存する変更を積み上げる場合のみ)

| 層 | 対応タスク | ベース | 扱う関心事 |
| --- | --- | --- | --- |
| 1 | Task-1 | main | 採点 |
| 2 | Task-2 | Task-1 のマージ後の main | 選手のページ |
| 3 | Task-3・4・5 | Task-2 のマージ後の main | 各画面(互いに並列) |

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
