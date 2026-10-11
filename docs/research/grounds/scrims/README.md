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
| `2026-10-10-lr-core-vs-dd-core.json` | LR CORE vs DD CORE のスクリム。千燈ゆうひ(LR CORE SUP)の 2026-10-10 の配信アーカイブ(9:50:32、https://www.youtube.com/watch?v=AZbkNH5Z5-I )。実戦は 6 回あり、その最後の 3 試合(4〜6 試合目)を書き起こした(要素の順 = 試合の順)。3 試合とも DD CORE の勝ち: 4 試合目 32:50(キル LR 3 - DD 21)、5 試合目 43:44(13-21)、6 試合目 37:31(16-24)。勝者の根拠は配信者(チーム1 = LR CORE)のリザルト画面の「敗北」 | CS(リザルト画面に無い。5 試合目だけリプレイの終了時点の表から)。DD CORE の JG・SUP のチャンピオン名と 6 試合目の MID(顔出しの枠で隠れる。読めた断片は `championNote`)。ピック・バンの順。LR CORE の ADC の表示名「触るな俺のウェーブに」は名簿の moonshine(大御所にゅん子)と `未確認(…)`(同じ試合のゲーム内では moonshine。読み取り時の判断。「推定」へ変えるかは価値責任者)。4 試合目の DD CORE SUP も `未確認` |

## 2026-10-10 の配信の構造(取り違えの防止)

- 実戦(自分視点の HUD)は 6 回: 0:27〜0:55、1:57〜2:35、3:17〜3:53、4:31〜5:05、5:59〜6:42、7:44〜8:22(120 秒刻みのサムネイル判定)。1〜3 試合目の相手は未確認
- 各実戦のあとに、その試合のリプレイの振り返り(観戦 HUD)が入る
- 8:22 以降、配信の終わりまで実戦はない。6 試合目と 5 試合目のリプレイ、2026/10/09 の別の試合(対戦カードの外のチーム。LR の勝利 39:43)の試合履歴とそのリプレイ
- 動画の時刻(`video.*Sec`・`source.resultScreenSec`)は `&t=<秒>s` で開ける
