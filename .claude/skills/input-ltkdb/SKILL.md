---
name: input-ltkdb
description: 非公式のファンサイト LTKDB(LTK Schedule & Status)の試合結果のまとめから、名簿の階級チーム同士のスクリムを F-004 の試合結果の記録(`docs/research/grounds/scrims/`)へ機械で取り込む。`/input-ltkdb`。毎日の定期実行から呼ばれる。リスナー参加・スコアの無い試合・既存の記録と同じ試合は取り込まない。共通の原則は /data-update。
---

# LTKDB からスクリムの試合結果を取り込む

共通の原則(出典を付ける、個人情報を入れない、見立てを書き込まない)と人へ戻す場面は `.claude/skills/data-update/SKILL.md` にあります。先に読んでください。記録の形の正本は `specs/F-004/spec.md`「入力の形」「受入基準 1〜7」と `src/results/types.ts`・`src/results/load.ts` です。配信から自分で書き起こすときは `/input-scrim` を使います。

## 出典

- LTKDB: https://demo-lab0110.github.io/ltk-schedule-status-site/ (非公式のファンサイト)
- データ: https://raw.githubusercontent.com/demo-lab0110/ltk-schedule-status-site/main/site-data.json の `sheets` の「対戦結果まとめ」(1 試合 1 行)と「リザルト詳細」(1 試合 10 行)
- サイトの説明では、一部の値はスクリーンショットの OCR で、後で直されることがある。2026-10-12 の確かめでは、配信から独立に書き起こした LR CORE vs DD CORE の 3 試合と 173 個の値がすべて一致した(`docs/research/grounds/scrims/README.md`)

## 取り込むもの・取り込まないもの

| 試合 | 扱い |
| --- | --- |
| 名簿の階級チーム同士のスクリムで、確認状態が「承認済」、選手の行が 10 件ある | 取り込む |
| リスナー参加(試合 ID に LISTENERS、チーム名「リスナー」) | 取り込まない(F-004 決定 D2) |
| スコアが無い(選手の行が無い、試合時間が空) | 取り込まない。勝者だけ分かることを報告に書く |
| 既存の記録と同じ試合(同じ LTKDB の試合 ID、または同じ 2 チーム・同じ試合時間 ±1 秒。日付は配信日とずれることがある) | 取り込まない |
| 本番の試合(「スクリム/本番」が本番) | この変換の対象外。件数と試合 ID を報告し、`state:needs-po` で人へ戻す(本番の記録は `stage`・`day`・`match`・`game` と日程との一致が要る。手順を足すまで手で書かない) |

## 手順

1. ブランチ `docs/input-ltkdb-<YYYYMMDD>` を `origin/main` から切る
2. 変換する(生成 AI を使わない):

   ```bash
   COLLECTED_WITH="<モデルの名称と版>" node .claude/skills/input-ltkdb/reference/ltkdb-to-scrims.mjs
   ```

   終了コード 0 = 新しい試合なし(ここで終える。PR を出さない)、10 = 書いたファイルがある、1 = 失敗(取得できない・形が違う。報告して終える)。`--in <ファイル>` で手元の site-data.json を、`--dry-run` で書かずに試せる。同じ日・同じ組のファイルが既にあれば後ろに足す
3. 読み込みをテストで通す(テストは変えない): `node --test tests/results/load.test.ts`。反した欄があれば記録を直すのではなく、変換の出力をそのまま残して `state:needs-po` で人へ戻す(LTKDB の値の誤り、名簿の変更、Data Dragon に無いチャンピオン名など)
4. `docs/research/grounds/scrims/README.md` の表に新しいファイルの行(対戦カード・勝敗・試合時間・対応づけの確度・読めなかった項目)を、`docs/research/grounds/README.md` の末尾に 1 行を足す
5. `node scripts/gate/g5-local.mjs --no-install` を通す
6. コミット(Author は指示した人、日本語、末尾の段落に `Spec: setup` と `Co-Authored-By: <モデルの名称と版>`)。公開の前の点検(`.claude/skills/data-update/reference/integrate.md` の 5)を流す
7. push して Draft PR を出す(本文は `.github/PULL_REQUEST_TEMPLATE.md` から。リスク区分は前例の R3 を草案として残し、確定は人)。ラベル `state:needs-dev`。CI が全件 success になってから `state:dev-done`。マージと Ready は人

価値責任者は 2026-10-12 に、LTKDB を毎日集計して勝率へ反映することを求め、この取り込みの Draft PR の push を承認した(「今後もここを1日おきに集計し、勝率へどんどん反映し、より確度をあげていけるようにしましょう」。頻度は毎日と確認)。

## 報告(短く)

- 取り込んだ試合(ファイル・LTKDB の試合 ID・勝敗)と、対応づけが「推定」の行の数
- 取り込まなかった試合と理由(スコアなし・確認状態・名簿外)、本番の試合の件数
- テストと G-5 の結果、PR の URL

勝率への反映は、記録のマージの後に価値責任者の手元で集計(`node src/collect/aggregate-cli.ts`)を流したときに起きる(ソロランクの生データ `data/raw` は手元にだけある)。
