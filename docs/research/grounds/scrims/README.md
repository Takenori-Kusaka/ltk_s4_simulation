# スクリムの試合結果(配信アーカイブからの書き起こし)

`/input-scrim`(`.claude/skills/input-scrim/SKILL.md`)で、配信アーカイブのクライアントのリザルト画面から書き起こした試合結果です。F-004(試合結果の入力)のスクリムの記録で、集計(`src/collect/aggregate-cli.ts`)が `src/results/load.ts` で読んで検証し、F-009 の個人の評価とキーマンの印に使います。評価の式へ手で書き込みません。**AI 収集(未確認)**。別の AI による反証の試みは行っていません(画面の数値の読み取りで、合計の検算だけを通しています)。

## 記録の形

- 正本: `specs/F-004/spec.md`「入力の形」「受入基準 1〜7」、`src/results/types.ts`、`src/results/load.ts`。書き起こす側の説明は `.claude/skills/input-scrim/SKILL.md` の 4
- ファイル名は `<YYYY-MM-DD>-<識別子>.json`(試合日。識別子は小文字の英数字とハイフン)。**配列で 1 試合 1 要素**。同じ日・同じ組の試合は 1 ファイルにまとめ、要素は試合の順(早い順)。試合 ID `SC-<YYYYMMDD>-<階級チーム ID>-<階級チーム ID>-G<n>` の n はこの順で振られる
- 必須の欄: `kind: "scrim"`、`date`、`listeners`(この置き場では常に false)、`source.url`(配信なら `resultScreenSec` も)、`duration`(mm:ss)、`winner`、`sides`(任意)、`teams`(鍵は `<チーム> <階級>`。各チームに `kills`・`deaths`・`assists`・`gold` と 5 人の `players`。各行に `role`・`rosterName`・`mappingConfidence`・`champion`・`kills`・`deaths`・`assists`・`gold`・`damage`。`cs`・`level`・`goldPerMin` は数か null)
- 読まれない欄(出典と読み取りの記録として残す): `source` の `title`・`streamer`・`streamerRosterId`・`streamerTeam`・`streamDate`・`streamDurationSec`・`retrievedAt`、`collectedBy`・`collectedWith`、`matchInStream`・`matchFromLast`、`video`、`durationSec`、`winnerBasis`・`sidesBasis`、`resultScreenLabel`、`displayName`・`rosterId`・`championNote`・`damageNote`、`pickBanOrder`・`notes`
- `mappingConfidence` は「確信」「推定」「未確認」のどれかで始まり、括弧の中に根拠。「未確認」の行は使われない(対面の記録も対面無し)。「推定」の行は使われ、数が集計の出力に示される
- **古い形(`kind: scrim-results` のオブジェクトに `matches[]`)のファイルを置くと、集計が「記録の配列でない」で止まる(終了コード 3。`ratings.json`・`winrates.json`・`results.json` を書かない)**。反した欄が 1 つでもあれば同じ
- `listeners` が true の記録は中身を検証されず、どの計算にも使われない(「リスナー参加」)。同じ日・同じ組・同じ試合時間の記録が 2 件以上なら、ファイル名の辞書順で最初の 1 件だけが使われ、残りは「重複」
- 置いたあとは `node --test tests/results/load.test.ts` で読み込みを通す(「既存の記録」のテストがこの置き場の全ファイルを読み、エラー 0 件を確かめる)

| ファイル | 内容 | 読めなかった項目 |
| --- | --- | --- |
| `2026-10-09-lr-core-vs-dd-core.json` | LR CORE vs DD CORE のスクリム(試合日 2026-10-09)。千燈ゆうひ(LR CORE SUP)の 2026-10-10 の配信アーカイブ(9:50:32、https://www.youtube.com/watch?v=AZbkNH5Z5-I )。実戦は 6 回あり、その最後の 3 試合(4〜6 試合目)を書き起こした(要素の順 = 試合の順)。3 試合とも DD CORE の勝ち: 4 試合目 32:50(キル LR 3 - DD 21)、5 試合目 43:44(13-21)、6 試合目 37:31(16-24)。勝者の根拠は配信者(チーム1 = LR CORE)のリザルト画面の「敗北」 | CS(リザルト画面に無い。5 試合目だけリプレイの終了時点の表から)。DD CORE の JG・SUP のチャンピオン名と 6 試合目の MID は顔出しの枠で隠れたため、2026-10-12 に LTKDB の値で補った(読めた断片と元の注記は `championNote`)。ピック・バンの順。LR CORE の ADC の表示名「触るな俺のウェーブに」は名簿の moonshine(大御所にゅん子)と `未確認(…)`(同じ試合のゲーム内では moonshine。読み取り時の判断。「推定」へ変えるかは価値責任者)。4 試合目の DD CORE SUP も `未確認` |
| `2026-10-10-dd-next-vs-it-next.json` | DD NEXT vs IT NEXT のスクリム 4 試合。出典は LTKDB(下の「LTKDB からの取り込み」)の `SCRIM_20261010_NEXT_IT_DD_001`〜`004`。4 試合とも DD NEXT の勝ち: 1 試合目 36:40(キル DD 20 - IT 13)、2 試合目 25:30(10-1)、3 試合目 35:11(20-13)、4 試合目 32:36(24-8)。対応づけは 20 人分とも「確信」(LTKDB のサモナーネームが名簿の Riot ID と一致) | CS、ピック・バンの順、結果画面の時刻。1 試合目のレベル(LTKDB に無い) |
| `2026-10-11-dd-core-vs-it-core.json` | DD CORE vs IT CORE のスクリム 3 試合。出典は LTKDB の `SCRIM_20261011_CORE_DD_IT_001`〜`003`。DD CORE の 2 勝 1 敗: 1 試合目 24:01 IT CORE の勝ち(キル IT 19 - DD 5)、2 試合目 28:33 DD CORE(31-13)、3 試合目 41:57 DD CORE(33-24)。対応づけは全員「推定」(LTKDB にサモナーネームの記載が無く、選手名と階級チーム・ロールで対応づけた) | CS、ピック・バンの順、結果画面の時刻、サモナーネーム |
| `2026-10-11-cc-masters-vs-lr-masters.json` | CC MASTERS vs LR MASTERS のスクリム。LTKDB には 3 試合(1 試合目 LR、2 試合目 CC、3 試合目 LR。LR MASTERS の 2 勝 1 敗)があるが、1 試合目は勝者だけでスコアが無いため記録しない。記録は 2・3 試合目: 30:58 CC MASTERS の勝ち(キル CC 23 - LR 10)、30:01 LR MASTERS の勝ち(22-7)。対応づけは全員「推定」(同上) | 1 試合目のすべて(勝者 LR MASTERS だけ分かる)。CS、ピック・バンの順、結果画面の時刻、サモナーネーム |
| `2026-10-13-cc-masters-vs-it-masters.json` | CC MASTERS vs IT MASTERS のスクリム。LTKDB には 4 試合(1 試合目 IT、2〜4 試合目 CC。CC MASTERS の 3 勝 1 敗)があるが、1 試合目は勝者だけでスコアが無いため記録しない。記録は 2〜4 試合目で、3 試合とも CC MASTERS の勝ち: 31:58(キル CC 22 - IT 13)、32:35(26-22)、22:30(23-16)。出典は LTKDB の `SCRIM_20261013_MASTERS_IT_CC_002`〜`004`(`updatedAt` 2026-10-13T23:16:51Z、確認状態は「承認済」)。対応づけは全員「推定」(LTKDB にサモナーネームの記載が無く、選手名と階級チーム・ロールで対応づけた) | 1 試合目のすべて(勝者 IT MASTERS だけ分かる)。CS、ピック・バンの順、結果画面の時刻、サモナーネーム |

## LTKDB からの取り込み(2026-10-12)

- 出典: 非公式のファンサイト LTKDB(LTK Schedule & Status、https://demo-lab0110.github.io/ltk-schedule-status-site/ )。データは同サイトのリポジトリの `site-data.json`(https://raw.githubusercontent.com/demo-lab0110/ltk-schedule-status-site/main/site-data.json 、`updatedAt` 2026-10-12T13:56:51Z)の「対戦結果まとめ」「リザルト詳細」。サイトの説明では一部の値はスクリーンショットの OCR で、後で直されることがある。取り込んだ試合の確認状態はすべて「承認済」
- 信頼性の確かめ: LTKDB の LR CORE vs DD CORE の 3 試合(`SCRIM_20261009_CORE_LR_DD_*`)と、配信から独立に書き起こした `2026-10-09-lr-core-vs-dd-core.json` を突き合わせ、読めた 173 個の値(10 人 × 3 試合の K/D/A・ゴールド・ダメージ・チャンピオン)がすべて一致した
- 取り込んだのは名簿の階級チーム同士の試合だけ。LTKDB にあるリスナー参加のスクリム(LR CORE・CC CORE・IT CORE・DD NEXT の対リスナー、計 20 試合)は F-004 決定 D2 により取り込んでいない
- 記録の `source.url` は LTKDB のページ、`source.ltkdbMatchId` が LTKDB の試合 ID。`goldPerMin` は 5 人のゴールド ÷ 試合時間(分)で計算した。チームの K/D/A は 5 人の和で、LTKDB のチームの KDA と一致することを確かめた
- 日付の食い違い(解消): LTKDB と同サイトの予定では LR CORE vs DD CORE は 2026-10-09 20:00、配信アーカイブの日付は 2026-10-10 だった。価値責任者の確認(2026-10-12)で LTKDB を正とし、記録を `2026-10-09-lr-core-vs-dd-core.json`(試合 ID SC-20261009-…)へ改めた。`source.streamDate` は配信の日付 2026-10-10 のまま

## 2026-10-10 の配信の構造(取り違えの防止)

- 実戦(自分視点の HUD)は 6 回: 0:27〜0:55、1:57〜2:35、3:17〜3:53、4:31〜5:05、5:59〜6:42、7:44〜8:22(120 秒刻みのサムネイル判定)。1〜3 試合目の相手は未確認
- 各実戦のあとに、その試合のリプレイの振り返り(観戦 HUD)が入る
- 8:22 以降、配信の終わりまで実戦はない。6 試合目と 5 試合目のリプレイ、2026/10/09 の別の試合(対戦カードの外のチーム。LR の勝利 39:43)の試合履歴とそのリプレイ
- 動画の時刻(`video.*Sec`・`source.resultScreenSec`)は `&t=<秒>s` で開ける
