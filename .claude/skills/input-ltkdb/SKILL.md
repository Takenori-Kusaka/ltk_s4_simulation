---
name: input-ltkdb
description: 非公式のファンサイト LTKDB(LTK Schedule & Status)の試合結果のまとめから、名簿の階級チーム同士のスクリム(`docs/research/grounds/scrims/`)と、公式の日程と一致した本番(`docs/research/grounds/results/`)を F-004 の試合結果の記録へ機械で取り込む。`/input-ltkdb`。毎日 7:45 JST に GitHub Actions(`.github/workflows/ltkdb-import.yml`)が同じ変換を流す。スコアの無い試合は結果だけの記録として書く。リスナー参加・既存の記録と同じ試合は取り込まない。共通の原則は /data-update。
---

# LTKDB からスクリムの試合結果を取り込む

共通の原則(出典を付ける、個人情報を入れない、見立てを書き込まない)と人へ戻す場面は `.claude/skills/data-update/SKILL.md` にあります。先に読んでください。記録の形の正本は `specs/F-004/spec.md`「入力の形」「受入基準 1〜7・28・31〜38・44〜47」、F-006 の受入基準 12(`draft`)と `src/results/types.ts`・`src/results/load.ts` です。配信から自分で書き起こすときは `/input-scrim` を使います。

## 出典

- LTKDB: https://demo-lab0110.github.io/ltk-schedule-status-site/ (非公式のファンサイト)
- データ: https://raw.githubusercontent.com/demo-lab0110/ltk-schedule-status-site/main/site-data.json の `sheets` の「対戦結果まとめ」(1 試合 1 行)、「リザルト詳細」(1 試合 10 行)、「サイト_予定」(本番の行の「スケジュールID」が指す)、「BP詳細」(BAN・ピック。1 試合 0〜20 行)。「サイト_選手プロフィール」「サイト_チームマスタ」は、予定の `tier` が空の本番の階級を選手の名前から決めるのに使う
- サイトの説明では、一部の値はスクリーンショットの OCR で、後で直されることがある。2026-10-12 の確かめでは、配信から独立に書き起こした LR CORE vs DD CORE の 3 試合と 173 個の値がすべて一致した(`docs/research/grounds/scrims/README.md`)

## 取り込むもの・取り込まないもの

| 試合 | 扱い |
| --- | --- |
| 名簿の階級チーム同士のスクリムで、確認状態が「承認済」、選手の行が 10 件ある | `scrims/` へ書く。階級は試合 ID の 3 つ目(`SCRIM_<日付>_<階級>_…`)、その形でない試合 ID(`LTK4_SCRIM_<日付>_<組>_<階級>_CANDIDATE_…`)は「スケジュールID」の指す予定の行の `tier`。`game` に「試合番号」、「計測秒」が 780〜900 なら `cs14Sec` と各選手の `cs14`(「14分CS」。空は null)を写す |
| 選手の行が 10 件に満たない、または試合時間が空 | 結果だけの記録(`resultOnly: true`・`game`・`winner`。`duration`・`sides`・選手の行なし)として書く(基準 33)。本番は下の日程との一致を満たす場合だけ |
| 本番(「スクリム/本番」が本番)で、確認状態が「承認済」 | 「スケジュールID」が予定の行を指し、階級が決まり(予定の `tier`。空なら選手 10 人の名前が名簿のちょうど 1 つの階級の席と一致)、試合日・階級・2 チームが公式の日程(`src/sim/schedule.ts`、Playoffs は 2026-11-21・22)の試合に一致し、予定の `stage` と食い違わない場合だけ、`stage`・`day`・`match` を日程から取って `results/` へ書く。MASTERS CUP の 3 位決定戦と決勝は予定の `match_no` と同じ回の準決勝 2 試合の勝敗の両方、Playoffs は `match_no` のマッチの日付で `match` を決める(基準 31) |
| 本番で、上の条件を満たさない、`match` が決まらない、同じ試合 ID になる行が 2 件以上ある | 書かない。試合 ID・試合日・2 チーム・勝利チームと理由を出力する(基準 32)。人へ戻す(`state:needs-po`) |
| リスナー参加(試合 ID に LISTENERS、チーム名「リスナー」) | 取り込まない(F-004 決定 D2) |
| 既存の記録と同じ試合(同じ LTKDB の試合 ID。どちらも試合 ID を持てば値だけで決める。試合 ID の無い記録とは、同じ日・同じ 2 チームで本番は同じ試合 ID、スクリムは同じ `game`、または選手の行を持つスクリムで同じ 2 チーム・試合時間 ±1 秒。日付は配信日とずれることがある) | 取り込まない。置き場の記録が結果だけ(1 件)で、LTKDB に選手の行 10 行と試合時間が入り勝者が一致すれば、その要素を選手の行を持つ記録で置き換える(要約の `replaced`)。基準 34 |
| 既存の記録と LTKDB の現在の値が食い違う | 置き場を書き換えない。試合 ID・置き場の位置・欄・両方の値を「訂正の候補」(要約の `corrections`)に出す。比べるのは勝者、LTKDB の試合 ID と選手の行を持つ記録では試合時間(秒。±1 秒は同じ)と選手の行の K・D・A・ゴールド・ダメージ・チャンピオン・14 分の CS のうち置き場の記録が持つ欄だけ。採否は人(`state:needs-po`)。基準 34 |
| 書こうとする記録が、置き場の記録と合わせた読み込みの検証(基準 1〜3・7・25・28)に反する(例: Regular Stage・準決勝の試合番号が 1 でない、サイドが日程と違う、一覧に無いチャンピオン) | その試合だけ書かず、要約の `skipped` に「書く前の検証に反した」と反した欄を出す。残りは書く。基準 35 |
| チャンピオン名が一覧に無く、NFKC で一覧のただ 1 つの名前と一致する(「ジャーヴァンIV」→「ジャーヴァンⅣ」) | 一覧の表記に置き換えて書く。一覧は `--champions <ファイル>`、無ければ `data/public/champions.json`、無ければ Data Dragon ja_JP。読めなければ何も書かず終了コード 1。基準 35 |
| 選手の行の「プレイヤー名」「サモナーネーム」(`#` の前)のどちらも、その席の名簿の名前・Riot ID のゲーム名・「サイト_選手プロフィール」の名前と一致しない(大文字と小文字、NFKC の違いは同じとみなす。代打・ロールの入れ替え) | `mappingConfidence` を「未確認(LTKDB の選手名 <名前> がその席の選手と一致しない)」として書き、要約の `unconfirmed` に試合 ID・席・名前を出す(読み込みの基準 6 でその行は使われない)。基準 36 |
| 書く記録(選手の行を持つ記録・結果だけの記録・置き換え。スクリムと本番)の試合に「BP詳細」の行がある | 1 行 1 要素の `draft` を書く。`team` は「チーム名」+ 階級、`type` は「種別」、`role` は PICK の「ロール」(BAN は null)、`champion` は「チャンピオン名」を基準 35 で正規化した名前(BAN の空と「NOBAN」(空白を除いて大文字)は null)。`order` は全行の「BP順」が 1 以上の整数で重複しなければ「BP順」、そうでなければ全要素 null。並びは `order` の昇順、null なら BAN → PICK、チーム1 → チーム2、PICK は TOP → JG → MID → ADC → SUP、BAN は行の順。サイド・フェーズ・選手の名前・集計用名は写さない。行の無い試合には `draft` の欄を書かない。要約の `draftWritten`。基準 44 |
| BP詳細が (a) どちらかのチームの PICK が 5 行でない・ロールが TOP〜SUP を 1 つずつでない(空のロールを含む)、(b) PICK のチャンピオン名が空か「NOBAN」、(c) 作った `draft` が F-006 基準 12 の検証(選手の行のチャンピオンとの照合を含む)に反する | 記録は `draft` なしで書く。要約の `draftSkipped` に試合 ID と当たった条件((a)〜(c) で始まる理由)を出す。基準 45 |
| 置き場に同じ試合の記録がある(基準 34) | その記録に `draft` を足さない(既存の記録への `draft` は記録だけの PR で足す。決定 D9)。`draft` の無い記録は要約の `withoutDraft`(ファイル名・要素の番号・試合 ID)に、`draft` が LTKDB から作ったものと食い違う記録は欄 `draft` の訂正の候補(`corrections`。両方の値)に出す。照合はその記録の選手の行と行い、反すれば `draftSkipped`。置き換えで書く記録には `draft` を含める。基準 46 |

## 手順

1. ブランチ `docs/input-ltkdb-<YYYYMMDD>` を `origin/main` から切る
2. 変換する(生成 AI を使わない):

   ```bash
   COLLECTED_WITH="<モデルの名称と版>" node .claude/skills/input-ltkdb/reference/ltkdb-to-scrims.mjs
   ```

   終了コード 0 = 新しい試合なし(ここで終える。PR を出さない)、10 = 書いたファイルがある、1 = 失敗(取得できない・形が違う。報告して終える)。`--in <ファイル>` で手元の site-data.json を、`--root <置き場の親>`(既定 `docs/research/grounds`。`scrims/` と `results/` を持つ)で書く先を、`--dry-run` で書かずに試せる。同じ日・同じ組のファイルが既にあれば後ろに足す。出力の最後の行は JSON の要約(`written`(書いたファイルと試合 ID)・`replaced`・`resultOnly`・`skipped.official`・`skipped.scrim`(書かなかった試合と理由)・`corrections`・`unconfirmed`・`draftWritten`(`draft` を書いた試合 ID)・`draftSkipped`(`draft` を書かなかった試合 ID と条件)・`withoutDraft`(draft の無い既存の記録)・`listeners`・`updatedAt`。基準 38・47)
3. 読み込みをテストで通す(テストは変えない): `node --test tests/results/load.test.ts`。反した欄があれば記録を直すのではなく、変換の出力をそのまま残して `state:needs-po` で人へ戻す(LTKDB の値の誤り、名簿の変更、Data Dragon に無いチャンピオン名など)
4. `docs/research/grounds/scrims/README.md` の表に新しいファイルの行(対戦カード・勝敗・試合時間・対応づけの確度・読めなかった項目)を、`docs/research/grounds/README.md` の末尾に 1 行を足す
5. `node scripts/gate/g5-local.mjs --no-install` を通す
6. コミット(Author は指示した人、日本語、末尾の段落に `Spec: setup` と `Co-Authored-By: <モデルの名称と版>`)。公開の前の点検(`.claude/skills/data-update/reference/integrate.md` の 5)を流す
7. push して Draft PR を出す(本文は `.github/PULL_REQUEST_TEMPLATE.md` から。リスク区分は前例の R3 を草案として残し、確定は人)。ラベル `state:needs-dev`。CI が全件 success になってから `state:dev-done`。マージと Ready は人

毎日の取り込みは GitHub Actions のワークフロー `.github/workflows/ltkdb-import.yml` が行う(手順 2・3 と Draft PR。手順 4 の README の行は PR の上で足す)。ワークフローは変換の要約(出力の最後の行)を読み、次を行う(基準 38):

- `skipped.official`(書かなかった本番)と `corrections`(訂正の候補)の試合 ID ごとに、その試合 ID を題名に含む開いた Issue が無ければ、理由と要約の要素を本文に持つ Issue をラベル `state:needs-po` で 1 件作る。終了コード 0(新しい試合なし)でも作る
- 終了コード 10 なら、実行ごとに違う名前のブランチ `docs/input-ltkdb-<YYYYMMDD>-<実行番号>-<試行番号>` へ `scrims/` と `results/` の変更を commit して push し、Draft PR(ラベル `state:needs-dev`)を出す
- Draft PR を作れなかった場合(リポジトリの設定で Actions に PR の作成が許されていない場合など)も Issue は作り、ブランチは push したまま、ジョブを失敗にしてエラーと実行の要約に残す。人がそのブランチから PR を作る

手動で流すときは Actions の画面から workflow_dispatch で実行するか、この手順で流す。Claude の定期実行には頼らない(価値責任者の指示 2026-10-12: git 資産にならない仕組みにしない)。

価値責任者は 2026-10-12 に、LTKDB を毎日集計して勝率へ反映することを求め、この取り込みの Draft PR の push を承認した(「今後もここを1日おきに集計し、勝率へどんどん反映し、より確度をあげていけるようにしましょう」。頻度は毎日と確認)。

## 報告(短く)

- 取り込んだ試合(ファイル・LTKDB の試合 ID・勝敗)と、対応づけが「推定」の行の数
- 結果だけの記録として書いた試合、取り込まなかった試合と理由(本番とスクリムの別。要約の `skipped`)
- テストと G-5 の結果、PR の URL

勝率への反映は、記録のマージの後に価値責任者の手元で集計(`node src/collect/aggregate-cli.ts`)を流したときに起きる(ソロランクの生データ `data/raw` は手元にだけある)。
