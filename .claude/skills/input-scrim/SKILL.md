---
name: input-scrim
description: 配信アーカイブ(YouTube)からスクリムの試合結果(勝敗・試合時間・10 人のスコア)を書き起こし、F-004 の試合結果の記録(`docs/research/grounds/scrims/`)として置く。`/input-scrim <動画の URL> <対戦カード> [対象の試合数] [配信者と配信者のチーム]`。Chrome 拡張で動画を機械的に走査して実戦の区間を列挙し、各試合のクライアントのリザルト画面を読む。記録の形の正本は `src/results/types.ts` と `load.ts`。共通の原則は /data-update。
---

# スクリムの試合結果を書き起こす

共通の原則(生データをリポジトリに入れない、出典を付ける、個人情報を入れない、見立てを書き込まない)と人へ戻す場面は `.claude/skills/data-update/SKILL.md` にあります。先に読んでください。ここには配信アーカイブの走査とリザルト画面の読み取りに固有の部分だけを書きます。

書き起こした結果は結果の入力(F-004)の記録です。集計(`src/collect/aggregate-cli.ts`)が `src/results/load.ts` で読んで検証し、F-009 の個人の評価とキーマンの印に使います。評価の式や常識の一覧へ勝敗を手で書き込みません。

## 引数(入力)

| 引数 | 内容 |
| --- | --- |
| 動画の URL | `https://www.youtube.com/watch?v=<ID>` の形(再生リストの部分は外す)。人から受け取る |
| 対戦カード | 階級チームの組。表記は F-004 の用語のとおり `<チーム> <階級>`。例: `LR CORE vs DD CORE`。名簿(`src/data/roster.ts`)の `team` と `tier` |
| 対象の試合数(任意) | 既定は 3。**実戦の最後から**数える(配信の終端から遡るのではない。下の 2 を参照) |
| 配信者と配信者のチーム | 配信者が名簿のどの選手か(例: `LR-CORE-SUP 千燈ゆうひ`)。クライアントのリザルト画面の「チーム1」は配信者のチームなので、勝敗の読み取りに必須 |

足りないものは人に尋ね、待つ間は Issue に `state:needs-po` を付けます(コメントだけで済ませない)。

## 0. 扱わないもの・してはならないこと

- **リスナー参加のスクリム(視聴者参加型のカスタム)は扱わない**(F-004 決定 D2)。対戦カードの両チームが名簿の階級チームでない試合、名簿外の参加者がいる試合は書き起こさない。見つけても記録を作らず、報告に「対象外の試合が N 件(動画の時刻)」とだけ書く。記録の `listeners` は常に `false`(`true` の記録は集計が中身を検証せず、どの計算にも使わない)
- **人物の容姿や私生活を書かない**。書くのはゲームの画面の情報(名前・チャンピオン・数値・時刻)だけ。顔出しの枠で読めない欄は「隠れて読めない」とだけ書く
- **`data/` をコミットしない**。`data/scrim/` は作業用の置き場(`.gitignore` 済み)。記録は `docs/research/grounds/scrims/` に置く
- **製品のコード(`src/**`・`tests/**`)を変えない**。記録が検証に通らないときは記録を直す。検証の規則を変えたいときは `state:needs-po`(受入基準の変更)
- 動画をダウンロード・録画しない。gif も作らない(`gif_creator` はブラウザ操作の記録用で、動画のフレームの保存には向かない)
- 読めない欄を推測で埋めない(`null` にして `*Note` に理由を書く)。数値は合計で検算する(5 人のキル・デス・アシスト・ゴールドの和 = チームの値。集計も同じ検算で止める)
- ブラウザのダイアログを出す操作(ログイン・購読・通知の許可・コメント)をしない。動画の再生以外のクリックは最小限
- 既存のタブを触らない。終わったら PiP のウィンドウと自分の作ったタブを閉じる
- スクリーンショットは 60 枚を上限に見積もる。同じ画面を何度も撮らない

## 1. 準備(Chrome 拡張)

手順の中身(JavaScript の全文と座標)は `reference/browser.md` にあります。

1. ツールを 1 回で読み込む: `ToolSearch` で `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__find,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__browser_batch,mcp__claude-in-chrome__tabs_close_mcp`
2. `tabs_context_mcp` → `tabs_create_mcp` で新しいタブを作る
3. 動画の長さを取る: watch ページを開き、`find` で「時間表示」を探すか、`javascript_tool` で `document.getElementById('movie_player').getDuration()`
4. **再生できるかを確かめる**(`reference/browser.md` A-1)。`getPlayerState()` が `-1` のまま動かず `document.hidden === true` なら、拡張のタブが最小化されたウィンドウに入っていて、Chrome がメディアの読み込みを保留している。`&t=` で開き直しても `k` キーでも直らない。**Document Picture-in-Picture の回避策**(A-2〜A-5)へ進む
5. 回避策: 同一オリジンの軽いページ(`https://www.youtube.com/robots.txt`)を開く → `computer` の `key`(`shift`)でユーザー操作を発生させる → 直後(5 秒以内)に `documentPictureInPicture.requestWindow()` → PiP の document に watch ページの iframe を足す(embed は拒否される) → `movie_player.mute()`、`setPlaybackQualityRange('hd1080','hd1080')`。PiP は利用者の画面に浮いて見えるので、音は必ず mute にする
6. 元のタブに canvas を置き、ヘルパー(B)を定義する。以後の移動はすべて `movie_player.seekTo(秒, true)`(ページ遷移しない)
7. **全体のフレームを 1 枚だけ見る**(`__show(t)` の既定)。配信者のレイアウト(顔出しの枠の位置、ゲーム画面が全画面か、HUD の位置)を確かめ、`reference/browser.md` C の切り抜きの座標を合わせる

## 2. 全体の走査(実戦の区間を列挙する)

配信の後半は**リプレイの振り返り**であることが多い(試合時間が実時間より速く進む・巻き戻る・数分止まる)。終端から遡ってリザルト画面を探すと、リプレイの試合を実戦と取り違える。先に全体を走査する。

1. 参照画像の時刻を決める(各 1 つ): 自分視点のゲーム中(`ownpov`)、観戦 HUD(`spectator`)、クライアントのリザルト(`postgame`)、クライアントのホーム(`clienthome`)、チャンピオン選択(`champselect`)、ロード画面(`loading`)、黒画面(`black`)。コンタクトシート(`__sheet`。1 枚に 8〜10 時刻)を 2〜3 枚撮れば決まる。画面の見分け方は `reference/browser.md` D
2. `__scan`(サムネイル 64×36 の L1 距離、顔出しの枠を除外)で **0 秒から終端まで 120 秒刻み**に分類する。10 時間で約 300 回のシーク、約 4 分。スクリーンショットは不要。結果を区間(`__runs`)にまとめる
3. `ownpov` の区間が実戦。**最後から対象の試合数ぶん**を取る。各区間の前の `champselect`、後の `postgame` も控える
4. 各実戦の境目(区間の始まりと終わりの ±2 分)を **10 秒刻み**で分類し直す(`__scanW`)。自分視点の最後の時刻と、リザルト画面の最初の時刻が出る
5. 実戦の相手が対戦カードどおりかを、観戦 HUD の左右の列の名前(直後のリプレイ)か、自分視点のチャットログの名前で確かめる。カードと違う試合(別のチームとの試合、リスナー参加)は対象外

## 3. 各試合のリザルト画面を読む

1. リザルト画面の最初の時刻 + 20 秒で、1.2 倍の切り抜きを 3 枚撮る(`__show(t, crops)`。座標は `reference/browser.md` C): ヘッダ + チーム1、チーム2 の左半分(名前・チャンピオン・アイテム・K/D/A)、チーム2 の右半分(K/D/A・ダメージ・ゴールド)
2. 読む順: ヘッダの「勝利/敗北」と試合時間 → チーム1 の 5 行 → チーム2 の 5 行。行の順はロール順(TOP・JG・MID・ADC・SUP)
3. **勝者の根拠**は「配信者(チーム1)の画面の 勝利/敗北」。キル数やゴールドは補助。ゲーム内の VICTORY/DEFEAT の演出は数秒しか出ないので探さない(観戦 HUD・リプレイの VICTORY は勝った側の表示で、配信者の勝敗ではない)
4. 顔出しの枠で隠れた名前・チャンピオン名は、直後のリプレイ(観戦 HUD)の左右の列で補う(`__names`)。それでも読めなければ `champion` は `null`(名前は 5 で決める)
5. チャンピオン名は Data Dragon ja_JP の日本語名(`data/public/champions.json` の `champions` の値。例 `カ・サンテ`、`オレリオン・ソル`)で書く。一覧に無い名前は集計が止める。読めた断片からの推定は `champion` を `null` にし、`championNote` に断片と候補を書く
6. CS はリザルト画面に無い(ダメージとゴールドだけ)。直後のリプレイが試合の終わりまで再生されていれば、観戦 HUD の下中央の表(10 人の K/D/A・CS)から取る。無ければ `null`
7. 試合開始(0:00)の時刻は、自分視点の HUD の試合時間(右上)から逆算する。終了はネクサスの爆発か暗転。幅があれば `*Note` に書く
8. チャンピオン選択の開始は、走査の `champselect` の最初の標本の前後 2 分の幅で書く。ピック・バンの順は読めた場合だけ(`pickBanOrder`)。読まない場合は `null`

## 4. 書き起こす項目と JSON の形

出力: `docs/research/grounds/scrims/<YYYY-MM-DD>-<識別子>.json`。日付は試合日、識別子は小文字の英数字とハイフン(例 `2026-10-10-lr-core-vs-dd-core.json`)。**配列で 1 試合 1 要素**。同じ日・同じ組の試合は 1 ファイルにまとめ、**要素は試合の順(早い順)**に並べる(試合 ID `SC-<YYYYMMDD>-<階級チーム ID>-<階級チーム ID>-G<n>` の n は、ファイル名の辞書順 → 要素の順で振られる)。

形の正本は `specs/F-004/spec.md`「入力の形」と `src/results/types.ts`・`src/results/load.ts`。前例: `docs/research/grounds/scrims/2026-10-10-lr-core-vs-dd-core.json`。**古い形(`kind: scrim-results` のオブジェクトに `matches[]`)のファイルを置くと、集計が「記録の配列でない」で止まる(終了コード 3。評価と勝率表を書かない)**。

```jsonc
[                                            // 配列。1 試合 1 要素
  {
    "kind": "scrim",                         // 必須。置き場 scrims/ の記録は scrim(results/ の本番は official)
    "date": "2026-10-10",                    // 必須。試合日 YYYY-MM-DD。ファイル名の日付と一致
    "listeners": false,                      // 必須。真偽値。この手順では常に false
    "source": {                              // 必須。url の無い記録は受け付けられない
      "url": "https://www.youtube.com/watch?v=<ID>",
      "resultScreenSec": 30135,              // 配信なら結果画面の時刻(秒)
      "title": "<動画の題名>", "streamer": "千燈ゆうひ", "streamerRosterId": "LR-CORE-SUP", "streamerTeam": "LR CORE",
      "streamDate": "2026-10-10", "streamDurationSec": 35432, "retrievedAt": "2026-10-11"   // 読まれない欄(出典の記録として残す)
    },
    "collectedBy": "ai",                     // 読まれない欄。ai に固定(人の確認の記録は人が書く)
    "collectedWith": "<モデルの名称と版>",     // 読まれない欄
    "matchInStream": 6,                      // 読まれない欄。配信内の実戦の通し番号(走査の ownpov 区間の順)
    "matchFromLast": 1,                      // 読まれない欄。実戦の最後から数えた番号(1 が最後)
    "video": {                               // 読まれない欄。動画の時刻(秒。&t= の値)。幅があれば *Note に書く
      "champSelectStartSec": 27700, "champSelectStartNote": "…",
      "gameStartSec": 27865, "gameStartNote": "…",
      "gameEndSec": 30100, "gameEndNote": "…",
      "resultScreenSec": 30135, "resultScreenNote": "…"
    },
    "duration": "37:31",                     // 必須。mm:ss(リザルト画面の試合時間)
    "durationSec": 2251,                     // 読まれない欄
    "winner": "DD CORE",                     // 必須。teams の 2 つの鍵のどちらか
    "winnerBasis": "配信者(チーム1 = LR CORE)のリザルト画面に「敗北」…",   // 読まれない欄
    "sides": { "DD CORE": "ブルー", "LR CORE": "レッド" },   // 任意(分からなければ null)。両チームに「ブルー」「レッド」を 1 つずつ
    "sidesBasis": "…",                       // 読まれない欄
    "teams": {                               // 必須。鍵は階級チーム `<チーム> <階級>`。ちょうど 2 つ(同じチームは不可)
      "LR CORE": {
        "resultScreenLabel": "チーム1",       // 読まれない欄(配信者のチームが チーム1)
        "kills": 16, "deaths": 24, "assists": 26, "gold": 68123,   // 必須。0 以上の整数。5 人の和と一致
        "players": [                         // 必須。ちょうど 5 人。ロールが重複しない
          {
            "role": "TOP",                   // 必須。TOP | JG | MID | ADC | SUP。名簿のロールと一致
            "displayName": "Varvalian",      // 読まれない欄。画面の表示名。隠れていれば読めた断片と「(顔出し枠で隠れる)」
            "rosterId": "LR-CORE-TOP",       // 読まれない欄
            "rosterName": "焼きパン",          // 必須。名簿(src/data/roster.ts)の name。その選手の階級チームが行のチームと一致
            "mappingConfidence": "確信(名簿の Riot ID Varvalian#sfr と一致)",   // 必須。「確信」「推定」「未確認」のどれかで始まり、括弧の中に理由
            "level": 20,                     // 数か null
            "champion": "ヨリック",            // 必須。チャンピオンの一覧の日本語名か null
            "championNote": null,            // 読まれない欄。読めた断片や候補
            "kills": 5, "deaths": 3, "assists": 3, "gold": 17534, "damage": 30410,   // 必須。0 以上の整数
            "cs": null, "goldPerMin": 467,   // 数か null
            "damageNote": null               // 読まれない欄(「試合最多(★)」など)
          }
        ]
      },
      "DD CORE": { "…": "同じ形" }
    },
    "pickBanOrder": null,                    // 読まれない欄。読めた場合だけ { "bans": [...], "picks": [...] }
    "notes": "…"                             // 読まれない欄。試合の経過の事実(リードの逆転など)。見立ては書かない
  }
]
```

集計の検証(`src/results/load.ts`。反した欄はファイル名・要素の番号・欄の名前で出る):

| 検証 | 反したとき |
| --- | --- |
| ファイル名が `<YYYY-MM-DD>-<識別子>.json`、中身が配列 | ファイルのエラー |
| `kind` が置き場と一致(scrims/ は `scrim`)、`date` がファイル名の日付と一致、`listeners` が真偽値、`source.url` がある | 要素のエラー |
| `duration` が `mm:ss`、`teams` が 2 つの階級チーム、`winner` がその一方、`sides` があれば「ブルー」「レッド」が 1 つずつ | 要素のエラー |
| 各チームが 5 人、ロールが重複しない、`kills`・`deaths`・`assists`・`gold` が 5 人の和と一致 | 要素のエラー |
| `rosterName` が名簿の選手名で、その選手の階級チームとロールが行と一致。`mappingConfidence` が 3 語のどれかで始まる。`champion` が一覧の日本語名か null(一覧 `data/public/champions.json` が無ければ省く) | 要素のエラー |
| エラーが 1 件でもあれば | **集計は終了コード 3 で止まり、`ratings.json`・`winrates.json`・`results.json` を書かない**。受け付けた記録も 0 件になる |
| `listeners` が `true` | 中身を検証せず、どの計算にも使わない(「リスナー参加」として出力) |
| 同じ `date`・同じ 2 チーム・同じ `duration` のスクリムが 2 件以上(2 本の配信から同じ試合を書き起こした) | ファイル名の辞書順で最初の 1 件だけ使い、残りを「重複」として出力(エラーにはしない) |
| 本番(`official`)の同じ試合 ID の記録が 2 件以上 | 両方にエラー(どれを残すかは人が決める) |
| `mappingConfidence` が「未確認」 | その選手の試合の記録を作らず、対面の記録も対面無し。「推定」の行は使い、数が出力に示される |

本番の記録(`docs/research/grounds/results/`)はこの手順の対象外だが、同じ形に `stage`(`regular` / `masters` / `playoffs`)・`day`(Regular Stage は 1〜6、MASTERS CUP は回 1〜3、Playoffs は null)・`tier`・`match`・`game` が必須で、公式の日程(`src/sim/schedule.ts`)との一致が検証される。

検算と置き場の規則:

- 数値は半角の整数。読めない欄は `null`。`*Note` に理由(「顔出し枠で隠れる」「先頭の『オレ』だけ読めた」)
- `teams` の鍵は対戦カードの表記(`LR CORE`)。配信者のチームが `チーム1`
- 書き起こしの終わりに、記録の読み込みを**テストで通す**(6 の 3)

## 5. 名簿との対応づけの規則(`mappingConfidence`)

値は「確信」「推定」「未確認」のどれかで始め、括弧の中に根拠を書く(F-004 用語)。

1. **確信(根拠)**: 表示名が名簿(`src/data/roster.ts`)の `riotId` のゲーム名と一致する(例 Varvalian → 焼きパン、チョゴチュジャン → Killin9Hit、Sakayori Soma → 酒寄颯馬、rnea → 神楽めあ)。表示名の一部しか読めなくても、同じ試合の別の画面(観戦 HUD の列、チャットログ)で全文を確かめたら確信
2. **推定(根拠)**: 表示名が名簿と違う、または一部しか読めないが、同じ席(ロール)と別の手がかり(同じ試合のゲーム内の名前、チャンピオン、アイテム)が一致する(例 `推定(リザルト画面の表示名が違う。同じ試合のゲーム内チャットでは moonshine。ADC の席・ベイガーが一致)`)。集計はこの行を使い、「推定」の行の数を出力に示す
3. **未確認(根拠)**: 席と構成からの推測だけで、画面に手がかりが無い(名前もチャンピオンも隠れている)。集計はこの行を使わず、対面の記録も対面無しにする
4. 名簿外の名前(対戦カードに無いチーム、リスナー)は対応づけない。その試合は対象外
5. 同じ人が画面によって違う名前で出ることがある(名前の変更)。`displayName` には画面の表示名を、`rosterName` には名簿の名前を書く
6. 既存の記録 `2026-10-10-lr-core-vs-dd-core.json` では LR CORE ADC(表示名「触るな俺のウェーブに」)を読み取り時の判断で「未確認」にしている。「推定」へ変えるかは価値責任者の判断(`state:needs-po`)

## 6. 出力先・検証・ブランチ・PR

1. 作業用のメモ(見つけた時刻、読めなかった項目)は `data/scrim/`(コミットしない)
2. 記録: `docs/research/grounds/scrims/<ファイル>.json`(4 の形)。同じ場所の `README.md` の表に 1 行(勝敗・試合時間・読めなかった項目)、`docs/research/grounds/README.md` の末尾に 1 行
3. **読み込みをテストで通す**(テストは変えない):

   ```bash
   node --test tests/results/load.test.ts
   ```

   `tests/results/load.test.ts` の「既存の記録」のテストが `docs/research/grounds/` の `results/`・`scrims/` の全ファイルを `loadResults` で読み、エラーが 0 件であることを確かめる。新しいファイルに反した欄があると、この テストが `ファイル名[要素の番号] 欄: 理由` の一覧で失敗する。直すのは記録(JSON)で、テストや `src/results/` ではない
4. `node scripts/gate/g5-local.mjs --no-install` を通す(集計のテストが既存の記録を読む)
5. ブランチ `docs/input-scrim-<YYYYMMDD>-<短い名前>`。コミットは日本語、末尾の段落にトレーラ(`Spec: setup`(記録・文書だけの PR の前例)と `Co-Authored-By: <モデルの名称と版>`)。製品のコード(`src/`・`tests/`)を含めない
6. Draft PR(`state:needs-dev`)、本文は `.github/PULL_REQUEST_TEMPLATE.md` から。CI が全件 success になってから `state:dev-done`。マージと Ready は人

## 7. 報告(短く)

- 試合ごとの勝敗・試合時間・動画の時刻(開始・終了・リザルト)と試合 ID(`SC-…`)
- 10 人の対応づけの確度(「推定」「未確認」の一覧と根拠)
- 読めなかった項目(`null` の一覧)、対象外にした試合(リスナー参加・カード外)
- テスト(6 の 3)の結果と、集計の出力の 1 行(`試合結果の記録: … スクリム n 試合 …`)があればそのまま
- 走査の要点(実戦の区間の数、スクリーンショットの枚数、回避策を使ったか)

## 8. 次の一手

`node scripts/gate/next.mjs`(`/pit`)を実行し、「人の判断待ち」が出たらそこで止める。

## 参照

- ブラウザ側の手順と JavaScript の全文、切り抜きの座標、画面の見分け方、落とし穴: `reference/browser.md`
- 記録の形と検証の正本: `specs/F-004/spec.md`「入力の形」「受入基準 1〜7」、`src/results/types.ts`、`src/results/load.ts`、`tests/results/load.test.ts`
- 共通の原則と人へ戻す場面: `.claude/skills/data-update/SKILL.md`
- 根拠のディレクトリの説明: `docs/research/grounds/README.md`、`docs/research/grounds/scrims/README.md`
