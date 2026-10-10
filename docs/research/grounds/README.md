# コール力・チームプレイ・LoL 歴の根拠(2026-10-08 収集)

F-009(コール力の軸)と F-010(司令塔・指導・一体感)の材料。AI の調査エージェント2名が、LTK と他の大会での役割、本人・チームメイトの発言、記事、視聴者の声(X・ブログ・note・YouTube の説明・自動字幕・切り抜き)から集めた。**すべて「AI 収集(未確認)」であり、価値責任者の確認を要する**(ADR-0004 決定5)。

| ファイル | 内容 |
| --- | --- |
| `evidence-dd-cc.json` / `.md` | DD・CC の30名(根拠 205 件) |
| `evidence-it-lr.json` / `.md` | IT・LR の30名(根拠 182 件) |
| `evidence-hetel.json` | hetel のチーム分析配信(https://www.youtube.com/watch?v=xdsbfDbaqRU 、価値責任者が 2026-10-09 に共有)から AI が要約した根拠。コール力 40 件(normalized/shotcalling.json へ統合済み)、選手の特性 52 件、階級チームのマクロ 12 件と戦い方 43 件、コーチ 9 件。原文は転載せず、時刻つきの URL を付ける。selfTeam=true は hetel 自身のチーム(DD)についての発言 |
| `evidence-transcript-analysis-eugeo-1-20261010.json` | Eugeo(推定。確かさ 中)の Finale 各チーム考察配信の CC の部分(2026-10-10 に `/input-ts` で取り込み。前処理 9,170 字 → 2,520 字)。全体の見立て 14 件、選手の特性 14 件、戦い方 9 件、コーチ 2 件、unmapped 8 件(『カナカナ』『あーちゃん』『アカリン』など名簿との対応が未確定)。コール力 0 件、試合 0 件。反証の試み(Claude Opus 5.5)は not-refuted 22 / unclear 3。URL は価値責任者が 2026-10-10 に示した(https://www.youtube.com/watch?v=6PPbH29d8EM )。外部の見立てへ 8 件 |
| `evidence-transcript-analysis-eugeo-2-20261010.json` | 同じ配信の LR・IT CORE・DD の部分(前処理 13,738 字 → 4,115 字)。全体の見立て 17 件、コール力 7 件(not-refuted 6、unclear 1 = Recap の呼び名の対応)、選手の特性 29 件、戦い方 12 件、マクロ 1 件、コーチ 1 件、unmapped 4 件。試合 0 件。反証の試みは not-refuted 46 / unclear 4。URL: https://www.youtube.com/watch?v=qsrVbjq2KMM 。コール力 6 件を normalized/shotcalling.json へ統合済み(unclear 1 件は未統合)。外部の見立てへ 7 件 |
| `evidence-transcript-analysis-tanuki-20261010.json` | たぬき忍者(推定。確かさ 高)のチーム分け考察配信(前処理 11,669 字 → 2,860 字)。全体の見立て 13 件(DD は selfTeam)、選手の特性 10 件、戦い方 7 件、マクロ 1 件、コーチ 2 件、unmapped 1 件。コール力 0 件、試合 0 件。反証の試みは not-refuted 20 / unclear 0。URL: https://www.youtube.com/watch?v=5LgfqfmCRcQ 。外部の見立てへ 7 件(unclear 1 件は入れていない) |
| `evidence-transcript-analysis-enty-20261010.json` | Enty(自称。IT NEXT 全体コーチ)の全チームのメンバー紹介配信(72 分。前処理 39,377 字 → 10,954 字)。全体の見立て 10 件、コール力 7 件(not-refuted 6、unclear 1 = Recap の発言が途中で切れている)、選手の特性 68 件、戦い方 9 件、マクロ 1 件、コーチ 8 件、unmapped 2 件。試合 0 件。反証の試みは not-refuted 82 / unclear 11(紹介の順序だけで人物を推定した項目など)。初回に refuted 3 件(人物の付け違い 1、15 文字を超える一致 2)を言い直して再確認した。URL: https://www.youtube.com/watch?v=zcWe0BfA49k 。コール力 6 件を normalized/shotcalling.json へ統合済み(unclear 1 件は未統合)。外部の見立てへ 6 件 |
| `normalized/external-views.json` | LoL に詳しい第三者(元プロ・解説・選手)の、階級チーム(TEAM-TIER)についての見立て 61 件(2026-10-10 作成・同日追記)。`evidence-hetel.json`(32 件)と `evidence-transcript-takaya-it-core.json`(1 件)の `overall`・`teamStyle`・`teamMacro` から、向き(+/−)と強さ(強/中/弱)を要約から機械的に付け、時刻つきの URL を持つ。同日に文字起こし 4 本の `overall` から 28 件を追記(Eugeo 15 件、たぬき忍者 7 件、Enty 6 件。中立・同じ話者の同じ趣旨の重複・選手個人の評価は入れず、別の AI(Claude Opus 5.5)の反証を通った not-refuted だけを `aiCheck` 付きで入れた。unclear 2 件は入れていない)。選手個人の評価は含めない。話者が自チームについて言ったものは selfTeam=true(13 件)。`evidence-dd-cc` / `evidence-it-lr` にはチーム単位の節が無く、`evidence-transcript-yuhi-yutapon` は中立の項目だけで 0 件。hetel・たかやスペシャルの項目は元のファイルに `aiCheck` が無いため付けていない。**AI 収集(未確認)** |

各根拠: `summary`(自分の言葉の要約)、`url`(出典)、`date`、`type`(記事/本人の発言/チームメイトの発言/視聴者の声/大会での役割)、`direction`(+ コールする / − 任せる)、`strength`(強/中/弱)。DD・CC には `category`(LoL・コーチ・他ゲーム等。機械的に付与し一部を手で修正)。

## 収集の結果の要点

- LoL の選手としてのコールの肯定の根拠が0件の選手が 16 名(DD・CC 8名、IT・LR 8名)。価値責任者の見立て「LTK 出場者には出典があるはず」に反する
  - コーチとしての指示だけ: わしだい・しゃるる・たぬき忍者・Day1
  - 否定の根拠だけ(指示を受ける側・声出しが課題など): 龍巻ちせ・空澄セナ・mittiii・レグルシュ・まいたけ・天帝フォルテ・apaMEN・ハレっち・No.1005
  - 何も見つからない: 叶・春茶
  - 他ゲーム(FPS)の根拠だけ: 獅子堂あかり
- 調査メモとの食い違い: しゃるるは元プロではない(記事に「プロ経験のない」)。たぬき忍者は LJL CS(2部)の出場で1部ではない。乾伸一郎の所属は REJECT と出た
- 限界: X の投稿は検索のスニペット経由が多い。Leaguepedia・Liquipedia は本文を取得できなかった。YouTube の自動字幕から話者を推定した根拠がある(要約に明記)

## 配信の文字起こしの取り込み(2026-10-09 から)

価値責任者は、参考になる配信(YouTube・Twitch)の文字起こしを `data/transcript/` に置く(リポジトリの外。`.gitignore`)。生の文字起こしは自動字幕の重なりと雑談が多く、そのまま読むとトークンを浪費するため、先に生成 AI を使わない前処理をかける。

1. 前処理: `node src/transcript/cli.ts`(既定で `data/transcript/*.md` を読み、`data/transcript/structured/<名前>.json` を書く。チャンピオン名は `data/meta/*.json` と、あれば `data/public/champions.json` から)
2. 根拠の抜き出し(AI): 生の文字起こしではなく、`structured/<名前>.json` を読む。`perPlayer`(選手の名前が出た区間の数・手がかりの分類・時刻)と `topKeywords` で当たりを付け、`segments` の本文(`x`。手がかりの無い字幕の断片は「…」に省略)を読む
3. 出力は `evidence-*.json`(本ディレクトリ)へ、自分の言葉の要約と時刻つきの URL で記録する。原文は転載しない

前処理の中身(`src/transcript/structure.ts`):

- 自動字幕の転がる重なり(前の行の文が次の行の先頭に繰り返される)を除く
- 約 20〜30 秒の区間にまとめ、LoL の語(1点)・LTK の語とチャンピオン名(2点)・選手(3点)・確信の低い別名(1点)で点数を付け、2点未満の区間を落とす
- 選手の名前と別名(`src/transcript/aliases.json`。聞き違いを見つけたら足す)を名簿の ID に対応づける。1文字の名前(叶・乾)は語の区切りでだけ一致させる
- 手がかりの分類(コール・プレイスタンス・評価の正負・気持ち・連携)とコールの言い回し(行こう・下がって・寄って など)を数える(`src/transcript/dictionaries.json`)

限界: 自動字幕には話者の情報が無い。`perPlayer` は「名前が出た区間」の集計で、本人の発話量ではない。分類の数は語の部分一致で、否定や文脈は区別しない。

- 2026-10-10 分類の訂正(規則): 口調・味方への当たりの強さについての記述は、コール力の否定の根拠(任せる側・コールしない)に数えない。該当した DD-CORE-SUP の 2 件を `normalized/shotcalling.json` から外した(全 60 名を検索し、他に該当なし)。

- 2026-10-10 分類の訂正(監査。規則): コール力の否定の根拠のうち、口調・態度・性格・雑談・冗談・評価者の願望・切り抜きの題名・チーム全体の記述(13 名 13 件)と、内容が否定・中立・冗談の肯定の根拠(3 名 4 件)を `normalized/shotcalling.json` から外した。経歴の記録で注記に LP のある ハレっち の allTime の lp を 276 に補った。

- 2026-10-10 分類の訂正(規則): 感情の発露・味方への文句・「言うようになった」という記述は、コール力の肯定の根拠に当たらない。該当した DD-NEXT-MID の肯定 1 件と、切り抜きの題名だけを根拠にした同じ選手の否定 1 件(監査の規則 1 の漏れ)を `normalized/shotcalling.json` から外した(全 60 名を検索し、同じ型の肯定は他に無し)。

- 2026-10-10 分類の訂正(横展開。規則): 否定のうち言語・滑舌・結果の記述(2 名 3 件)、肯定のうち励まし・発言力・告知・リーダーだが IGL か未確認・本人個人への言及でない・指導運営で IGL ではない・適性の評価・状況の把握(5 名 11 件)を `normalized/shotcalling.json` から外した。全 60 名を語の一致で検索し、該当しなかった 1 件(Enty の否定)は本文を確認のうえ残した。
