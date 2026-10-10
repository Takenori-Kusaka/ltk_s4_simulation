---
name: input-scrim
description: 配信アーカイブ(YouTube)からスクリムの試合結果(勝敗・試合時間・10 人のスコア)を書き起こし、出典つきの根拠として docs/research/grounds/scrims/ へ置く。`/input-scrim <動画の URL> <対戦カード> [対象の試合数] [配信者と配信者のチーム]`。Chrome 拡張で動画を機械的に走査して実戦の区間を列挙し、各試合のクライアントのリザルト画面を読む。共通の原則は /data-update。
---

# スクリムの試合結果を書き起こす

共通の原則(生データをリポジトリに入れない、出典を付ける、個人情報を入れない、見立てを書き込まない)と人へ戻す場面は `.claude/skills/data-update/SKILL.md` にあります。先に読んでください。ここには配信アーカイブの走査とリザルト画面の読み取りに固有の部分だけを書きます。

書き起こした結果は結果の入力(F-004)の材料です。評価の式や常識の一覧へ勝敗を手で書き込みません。

## 引数(入力)

| 引数 | 内容 |
| --- | --- |
| 動画の URL | `https://www.youtube.com/watch?v=<ID>` の形(再生リストの部分は外す)。人から受け取る |
| 対戦カード | 階級チームの ID の組。例: `LR-CORE vs DD-CORE`。名簿(`src/data/roster.ts`)のチームと階級で表す |
| 対象の試合数(任意) | 既定は 3。**実戦の最後から**数える(配信の終端から遡るのではない。下の 2 を参照) |
| 配信者と配信者のチーム | 配信者が名簿のどの選手か(例: `LR-CORE-SUP 千燈ゆうひ`)。クライアントのリザルト画面の「チーム1」は配信者のチームなので、勝敗の読み取りに必須 |

足りないものは人に尋ね、待つ間は Issue に `state:needs-po` を付けます(コメントだけで済ませない)。

## 0. 扱わないもの・してはならないこと

- **リスナー参加のスクリム(視聴者参加型のカスタム)は扱わない**。対戦カードの両チームが名簿の階級チームでない試合は対象外。見つけても書き起こさず、報告に「対象外の試合が N 件」とだけ書く
- **人物の容姿や私生活を書かない**。書くのはゲームの画面の情報(名前・チャンピオン・数値・時刻)だけ。顔出しの枠で読めない欄は「隠れて読めない」とだけ書く
- **`data/` をコミットしない**。`data/scrim/` は作業用の置き場(`.gitignore` 済み)。根拠は `docs/research/grounds/scrims/` に置く
- 動画をダウンロード・録画しない。gif も作らない(`gif_creator` はブラウザ操作の記録用で、動画のフレームの保存には向かない)
- 読めない欄を推測で埋めない(`null` にして `*Note` に理由を書く)。数値は合計で検算する(5 人のキルの和 = チームのキル、5 人のゴールドの和 = チームのゴールド)
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
2. `__scan2`(サムネイル 64×36 の L1 距離、顔出しの枠を除外)で **0 秒から終端まで 120 秒刻み**に分類する。10 時間で約 300 回のシーク、約 4 分。スクリーンショットは不要。結果を区間(`__runs`)にまとめる
3. `ownpov` の区間が実戦。**最後から対象の試合数ぶん**を取る。各区間の前の `champselect`、後の `postgame` も控える
4. 各実戦の境目(区間の始まりと終わりの ±2 分)を **10 秒刻み**で分類し直す(`__scanW`)。自分視点の最後の時刻と、リザルト画面の最初の時刻が出る
5. 実戦の相手が対戦カードどおりかを、観戦 HUD の左右の列の名前(直後のリプレイ)か、自分視点のチャットログの名前で確かめる。カードと違う試合(別のチームとの試合、リスナー参加)は対象外

## 3. 各試合のリザルト画面を読む

1. リザルト画面の最初の時刻 + 20 秒で、1.2 倍の切り抜きを 3 枚撮る(`__show(t, crops)`。座標は `reference/browser.md` C): ヘッダ + チーム1、チーム2 の左半分(名前・チャンピオン・アイテム・K/D/A)、チーム2 の右半分(K/D/A・ダメージ・ゴールド)
2. 読む順: ヘッダの「勝利/敗北」と試合時間 → チーム1 の 5 行 → チーム2 の 5 行。行の順はロール順(TOP・JG・MID・ADC・SUP)
3. **勝者の根拠**は「配信者(チーム1)の画面の 勝利/敗北」。キル数やゴールドは補助。ゲーム内の VICTORY/DEFEAT の演出は数秒しか出ないので探さない(観戦 HUD・リプレイの VICTORY は勝った側の表示で、配信者の勝敗ではない)
4. 顔出しの枠で隠れた名前・チャンピオン名は、直後のリプレイ(観戦 HUD)の左右の列で補う(`__names`)。それでも読めなければ `null`
5. CS はリザルト画面に無い(ダメージとゴールドだけ)。直後のリプレイが試合の終わりまで再生されていれば、観戦 HUD の下中央の表(10 人の K/D/A・CS)から取る。無ければ `null`
6. 試合開始(0:00)の時刻は、自分視点の HUD の試合時間(右上)から逆算する。終了はネクサスの爆発か暗転。幅があれば `*Note` に書く
7. チャンピオン選択の開始は、走査の `champselect` の最初の標本の前後 2 分の幅で書く。ピック・バンの順は読めた場合だけ(`pickBanOrder`)。読まない場合は `null`

## 4. 書き起こす項目と JSON の形

出力: `docs/research/grounds/scrims/<YYYY-MM-DD>-<teamA>-vs-<teamB>.json`(配信日、チーム ID は小文字。例: `2026-10-10-lr-core-vs-dd-core.json`)。前例: 同じ場所の同名のファイル。

```jsonc
{
  "kind": "scrim-results",
  "source": {
    "url": "https://www.youtube.com/watch?v=<ID>",
    "title": "<動画の題名>",
    "streamer": "<配信者の名簿上の名前>",
    "streamerRosterId": "<名簿の ID。例 LR-CORE-SUP>",
    "streamerTeam": "<階級チームの ID。例 LR-CORE>",
    "streamDate": "<YYYY-MM-DD>",
    "durationSec": 35432,
    "retrievedAt": "<YYYY-MM-DD。読んだ日>"
  },
  "card": { "teamA": "LR-CORE", "teamB": "DD-CORE" },
  "collectedBy": "ai",                      // 固定。人の確認の記録は人が書く
  "collectedWith": "<モデルの名称と版>",
  "matches": [
    {
      "matchFromLast": 1,                   // 実戦の最後から数えた番号(1 が最後)
      "matchInStream": 6,                   // 配信内の実戦の通し番号(走査の ownpov 区間の順)
      "video": {                            // 動画の時刻(秒。&t= の値)。幅があれば *Note に書く
        "champSelectStartSec": 27700, "champSelectStartNote": "…",
        "gameStartSec": 27865, "gameStartNote": "…",
        "gameEndSec": 30100, "gameEndNote": "…",
        "resultScreenSec": 30135, "resultScreenNote": "…"
      },
      "duration": "37:31", "durationSec": 2251,   // リザルト画面の試合時間
      "winner": "DD-CORE",                  // 階級チームの ID
      "winnerBasis": "配信者(チーム1 = LR-CORE)のリザルト画面に「敗北」…",
      "sides": { "blue": "DD-CORE", "red": "LR-CORE", "basis": "…" },   // 不明なら null
      "teams": {
        "LR-CORE": {
          "resultScreenLabel": "チーム1",
          "kills": 16, "deaths": 24, "assists": 26, "gold": 68123,
          "players": [
            {
              "role": "TOP",                // TOP | JG | MID | ADC | SUP(リザルト画面の行の順)
              "displayName": "Varvalian",   // 画面の表示名。隠れていれば読めた断片と「(顔出し枠で隠れる)」
              "rosterId": "LR-CORE-TOP", "rosterName": "焼きパン",
              "mapping": "確信",            // 確信 | 未確認
              "mappingBasis": "名簿の Riot ID Varvalian#sfr と一致",
              "level": 20,
              "champion": "ヨリック",        // 画面のカタカナ表記。読めなければ null
              "championNote": null,         // 読めた断片や推定の理由(任意)
              "kills": 5, "deaths": 3, "assists": 3,
              "cs": null,                   // リザルト画面に無い。リプレイの表から取れた場合だけ
              "gold": 17534, "goldPerMin": 467,
              "damage": 30410, "damageNote": null   // 「試合最多(★)」など(任意)
            }
          ]
        },
        "DD-CORE": { "resultScreenLabel": "チーム2", "...": "同じ形" }
      },
      "pickBanOrder": null,                 // 読めた場合だけ。{ "bans": [...], "picks": [...] }
      "notes": "…"                          // 試合の経過の事実(リードの逆転など)。見立ては書かない
    }
  ]
}
```

- 数値は半角の整数。読めない欄は `null`。`*Note` に理由(「顔出し枠で隠れる」「先頭の『オレ』だけ読めた」)
- `teams` の鍵は対戦カードの階級チームの ID。配信者のチームが `チーム1`
- 検算: 各チームの 5 人のキル・デス・アシスト・ゴールドの和が、チームの行の値と一致すること。一致しなければ読み直す

## 5. 名簿との対応づけの規則

1. 表示名が名簿(`src/data/roster.ts`)の `riotId` のゲーム名と一致すれば `確信`(例: Varvalian → 焼きパン、チョゴチュジャン → Killin9Hit、Sakayori Soma → 酒寄颯馬、rnea → 神楽めあ)
2. 表示名の一部だけが読め、同じ席(ロール)の名簿の選手と矛盾がなければ `確信` にしてよいのは、同じ試合の別の画面(観戦 HUD の列、チャットログ)で全文を確かめた場合だけ
3. それ以外(表示名が名簿と違う、隠れて読めない、構成からの推定)は **`未確認`**。`mappingBasis` に根拠(「同じ試合のゲーム内チャットでは moonshine。ADC の席とチャンピオンが一致」)を書く。同じ人が画面によって違う名前で出ることがある(名前の変更)
4. 名簿外の名前(対戦カードに無いチーム、リスナー)は対応づけない。その試合は対象外

## 6. 出力先・ブランチ・PR

1. 作業用のメモ(見つけた時刻、読めなかった項目)は `data/scrim/`(コミットしない)
2. 根拠: `docs/research/grounds/scrims/<ファイル>.json`。同じ場所の `README.md` の表に 1 行(勝敗・試合時間・読めなかった項目)、`docs/research/grounds/README.md` の末尾に 1 行
3. ブランチ `docs/input-scrim-<YYYYMMDD>-<短い名前>`。コミットは日本語、末尾の段落にトレーラ(`Spec: setup`(根拠・文書だけの PR の前例)と `Co-Authored-By: <モデルの名称と版>`)。製品のコード(`src/`・`tests/`)を含めない
4. `node scripts/gate/g5-local.mjs --no-install` を通す。Draft PR(`state:needs-dev`)、本文は `.github/PULL_REQUEST_TEMPLATE.md` から。CI が全件 success になってから `state:dev-done`。マージと Ready は人

## 7. 報告(短く)

- 試合ごとの勝敗・試合時間・動画の時刻(開始・終了・リザルト)
- 10 人の対応づけの確度(`未確認` の一覧と根拠)
- 読めなかった項目(`null` の一覧)、対象外にした試合
- 走査の要点(実戦の区間の数、スクリーンショットの枚数、回避策を使ったか)

## 8. 次の一手

`node scripts/gate/next.mjs`(`/pit`)を実行し、「人の判断待ち」が出たらそこで止める。

## 参照

- ブラウザ側の手順と JavaScript の全文、切り抜きの座標、画面の見分け方、落とし穴: `reference/browser.md`
- 共通の原則と人へ戻す場面: `.claude/skills/data-update/SKILL.md`
- 根拠のディレクトリの説明: `docs/research/grounds/README.md`
