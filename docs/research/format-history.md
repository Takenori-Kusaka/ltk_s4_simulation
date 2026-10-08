# LTK Season: Finale 大会形式・日程・過去シーズン ファクトベース

調査日: 2026-10-08(開幕 10-15 の 1週間前)。シミュレーターへ組み込むための事実を集めた。

**表記**
- **確認済み**: 一次情報(公式 X、ZETA DIVISION 公式、PR TIMES、公式スライド画像)、または複数の独立した報道で裏付けがあるもの。根拠の URL を付けた。
- **データ推定**: 公開データから集計して導いたもの。規則の明文は無い。
- **未確認**: 情報源が見つからなかったもの、または情報源どうしが矛盾しているもの。

**主な情報源**(以下、[S1]〜[S12] で引く)
- [S1] ZETA DIVISION 公式「k4senが『LTK Season: Finale』を開催」(2026-10-02)。スライド画像(LTK_S4_Slide1〜9)を含む: https://zetadivision.com/news/2026/10/02/47674
- [S2] PR TIMES(GANYMEDE): https://prtimes.jp/main/html/rd/p/000000229.000041650.html (同文: https://esportsnewsjapan.jp/ltk-season-finale-announced/ )
- [S3] FISTBUMP「スケジュール・フォーマットが公開」(2026-10-02)。公式画像の転載を含む: https://fistbump-news.jp/article/2026/10/02/2976.html
- [S4] FISTBUMP「全4チーム・全出場メンバーまとめ」(2026-10-07): https://fistbump-news.jp/article/2026/10/07/2998.html
- [S5] 公式 X @lolthek4sen「System & Format」: https://x.com/lolthek4sen/status/2105963533406220501
- [S6] KAI-YOU「最終シーズン開催」: https://kai-you.net/article/96737
- [S7] k4sen の発表配信の文字起こし(YouTube「The League The k4sen Finale Begins」): https://www.youtube.com/watch?v=RfJ-6eg-SfA
- [S8] eSports World 大会ページ: https://esports-world.jp/tournament/66636
- [S9] ゲーマーの隠れ家。S1〜S3 の試合ごとの使用チャンピオンと MVP を載せる: https://gamernokakurega.com/ltk-pandemonium/ ・ https://gamernokakurega.com/ltk-tot/ ・ https://gamernokakurega.com/ltk-tot_playoff/ ・ https://gamernokakurega.com/ltk-sbb/ ・ https://gamernokakurega.com/ltk-sbb-playoff/ ・ https://gamernokakurega.com/ltk-season-finale/
- [S10] Leaguepedia(API で wikitext を取得): https://lol.fandom.com/wiki/League_The_k4sen_1st ・ https://lol.fandom.com/wiki/League_The_k4sen_2nd ・ https://lol.fandom.com/wiki/League_The_k4sen_3rd
- [S11] Riot 公式のパッチ予定: https://support.riotgames.com/en-us/league-of-legends/gameplay/patch-schedule-league-of-legends
- [S12] evwk.app(S3 の順位表): https://evwk.app/events/ltk-pandemonium

**作業ファイル**(すべて tmp/research-data/(ローカルのみ。コミットしない))
- `ltk_picks_gamernokakurega.csv`: [S9] を機械で解析した、試合×チーム×ロールの使用チャンピオン。S1 は 37 試合、S2 は 34 試合、S3 は 52 試合。
- `ltk_player_records.csv`: 選手×シーズン×チーム×階級×ロールごとの勝敗と使用チャンピオン。
- `raw/`: 取得したページのテキスト。
- `img/`: 公式スライド画像(Special Rules、Regular Stage の日程とサイドなど)。

---

## 1. Finale 全体像(確認済み)

| 項目 | 内容 | 根拠 |
|---|---|---|
| 正式名 | League The k4sen: League of Legends Streamer's Championship Supported by Riot Games ― LTK Season: Finale(#4、通算4シーズン目で最終シーズン) | [S1][S2][S6] |
| 会期 | 2026-10-15(木)〜11-22(日)。計11日(Regular Stage 6日、MASTERS CUP 3日、Playoffs 2日) | [S1][S2][S3] |
| チーム | Dahlia Diadem(DD)、Camellia Crown(CC)、Iris Tiara(IT)、Laurel Regalia(LR) | [S3][S4] |
| 構成 | 各チーム 15名(NEXT 5名、CORE 5名、MASTERS 5名)。総勢 60名 | [S4][S5] |
| 階級の位置づけ | NEXT は初心者帯、CORE は中〜上級者帯、MASTERS は元プロ・セミプロ | [S6] |
| コーチ | MASTERS 階級の選手から CORE 担当を 1名、NEXT 担当を 1名選ぶ | [S5] |
| 開催形態 | Regular Stage と MASTERS CUP はオンライン。Playoffs は両日オフライン | [S2][S8] |
| Playoffs の会場 | **未確認**。Yahoo のリアルタイム検索の AI 要約に「有明アリーナ」とあるが、一次情報は見つからなかった | — |
| 配信 | LTK 公式 YouTube(@lolthek4sen)と Twitch(lolthek4sen) | [S3] |
| 実況・解説 | Jaeger、リクルート(Recruit)。S1〜S3 と同じ | [S9 finale][S10] |
| 前シーズンからの変更点 | (1) NEXT のプロテクトを「2体、うち1体は BAN 可」へ変更 (2) 無制限練習を 10時間単位で自由に分割可能へ変更 (3) MASTERS CUP のサイド選択を「直前2日分の Regular Stage の結果」で決める | [S1 Slide3][S6][S7][S3] |

### 1.1 Finale のロスター(確認済み。[S4]、公式 X のチーム分け投稿 https://x.com/lolthek4sen 、および依頼者が確認したコーチ)

| チーム | 階級 | TOP | JG | MID | ADC | SUP | コーチ |
|---|---|---|---|---|---|---|---|
| DD | MASTERS | Washidai(わしだい) | しゃるる | たぬき忍者 | Day1 | hetel | — |
| DD | CORE | 酒寄颯馬 | きなこ | スタンミじゃぱん | じゃすぱー | 神楽めあ | わしだい |
| DD | NEXT | SHAKA | MOTHER3(まざー3) | 天ノ川ねる | 夢野あかり | 白波らむね | たぬき忍者 |
| CC | MASTERS | Yutapon | Rainbrain | Ceros | Yuhi | NEMOH | — |
| CC | CORE | ゆきお(YUKIO) | k4sen | 葛葉 | 龍巻ちせ | 昏昏アリア | Ceros |
| CC | NEXT | 叶 | ゆふな | 空澄セナ | 獅子堂あかり | 鷹宮リオン | Yuhi |
| IT | MASTERS | らいじん | Yunika | Eugeo | Zerost | Enty | — |
| IT | CORE | mittiii | AlphaAzur | たかやスペシャル | ごんかね | レグルシュ・ライオンハート | Eugeo |
| IT | NEXT | 橘ひなの | ありけん | まいたけ | 天帝フォルテ | 白那しずく | Enty |
| LR | MASTERS | apaMEN | Nesty(ねすてぃー) | Recap | Haretti(ハレっち) | ThintoN(てぃんとん) | — |
| LR | CORE | 焼きパン | Killin9Hit | 乾伸一郎 | 大御所にゅん子 | 千燈ゆうひ | Recap |
| LR | NEXT | 狐白うる | アステル・レダ | 春茶 | なぎさっち | **No.1005(とおこ)** | Nesty |

- **LR NEXT SUP の表記揺れは解消した(確認済み)**。[S4]・PANORA・[S9] は「とおこ」と書き、依頼者は「No.1005」と確認していた。X のアカウント @No1005_W の表示名は「URS-No.1005👑👾(とおこ)」で、自己紹介は「VTuber『とおこ』です」とある。つまり**同一人物の表記違い**であり、前回分析の「とおこ」も誤りではない(https://x.com/No1005_W )。S3 でも、FISTBUMP の名簿では「No.1005」、[S9] では「とおこ」と表記が分かれていた。
- 補足: 全員の担当ロールは [S4] と [S9 finale] で一致した。

---

## 2. 日程

### 2.1 Regular Stage(確認済み。日付、対戦カード、サイドは公式画像 [S3] の画像 17217 を参照。tmp/research-data の img/17217.jpg に保存済み)

- 画像で**左側がブルーサイド、右側がレッドサイド**と明記されている。各カードは NEXT 戦と CORE 戦の 2試合で、**同じカードでは NEXT も CORE も同じサイド**に割り当てられている。

| Day | 日付 | カード1(ブルー vs レッド) | カード2(ブルー vs レッド) |
|---|---|---|---|
| 1 | 10/15(木) | CC vs DD | IT vs LR |
| 2 | 10/19(月) | CC vs LR | DD vs IT |
| 3 | 10/23(金) | LR vs DD | IT vs CC |
| 4 | 10/27(火) | LR vs IT | DD vs CC |
| 5 | 11/2(月) | IT vs DD | LR vs CC |
| 6 | 11/6(金) | CC vs IT | DD vs LR |

- 確認した点: 同じ相手と 2回当たり、ブルーとレッドを 1回ずつ受け持つ。例: CC vs DD は Day1 で CC がブルー、Day4 で DD がブルー。全 6組で成立している。
- **1日の試合順は未確認**。S3 は「カード1 NEXT → カード1 CORE → カード2 NEXT → カード2 CORE」の順だった(S3 の VOD のチャプター。例 https://www.youtube.com/watch?v=7H724XZLZdw )。Finale も同じ順と見込まれるが、まだ発表は無い。CORE の制限(NEXT で使われたチャンピオンの使用禁止)の都合上、同じカードの NEXT が先に行われることは規則から確定する。
- **開始時刻は未確認**。過去の開始時刻は、S1・S2 が 19:00、S3 が 18:00(S3 の YouTube 概要欄 https://www.youtube.com/watch?v=NZkY17NnAes )。
- 視聴会(Viewing Party)が Day1・Day2 に Red Bull Gaming Sphere Tokyo で開かれる(公式 X、[S8] の検索結果)。

### 2.2 MASTERS CUP(確認済み。組み合わせは公式画像 [S3] の画像 17219。img/17219.jpg)

| Day | 日付 | M1(準決勝, BO1) | M2(準決勝, BO1) | M3 | M4 |
|---|---|---|---|---|---|
| 1 | 10/20(火) | DD vs CC | IT vs LR | 3位決定戦(BO1) | 決勝(BO3) |
| 2 | 10/28(水) | DD vs IT | CC vs LR | 3位決定戦(BO1) | 決勝(BO3) |
| 3 | 11/9(月) | DD vs LR | CC vs IT | 3位決定戦(BO1) | 決勝(BO3) |

- 試合数は 3回 × 4試合で全 12試合。M1・M2・M3 が BO1、M4 が BO3([S3] の画像 17218)。
- 準決勝の組み合わせは事前に固定で、DD は毎回 M1 に入る。**S3 と完全に同じ組み合わせ**だった([S9] の S3 の記録)。
- **開始時刻は未確認**。S3 は 17:00 だった。
- Regular Stage との日程の関係: MC1 は RS Day1・Day2 の後、MC2 は RS Day3・Day4 の後、MC3 は RS Day5・Day6 の後に行われる。サイド選択はこの「直前2日分」で決まる(→ 3.2)。

### 2.3 Playoffs(確認済み。[S1 Slide8]、[S3] の画像 17220)

| 試合 | 日 | 対戦 | 形式 |
|---|---|---|---|
| M1 / UPPER FINALS | Day1 11/21(土) | 1位 vs 2位 | BO4 |
| M2 / LOWER SEMIFINALS | Day1 11/21(土) | 3位 vs 4位 | BO4 |
| M3 / LOWER FINALS | Day2 11/22(日) | M1 の敗者 vs M2 の勝者 | BO4 |
| M4 / GRAND FINALS | Day2 11/22(日) | M1 の勝者 vs M3 の勝者 | BO4 |

- 全 4試合。グランドファイナルにアドバンテージ(1勝分を持って始まる仕組み)は**無い**。S1・S2 にあった勝者側アドバンテージは S3 から廃止された([S3]、[S9 S3])。
- 開始時刻: **未確認**。

### 2.4 使用パッチ(未確認。予定日からの推定)

LTK は過去、その時点のライブパッチで行われていた。S3 の場合、終盤の RS が 26.11、Playoffs が 26.12 だった(note の記事 https://note.com/data_science/n/na5a0dec6b271 。AI が書いた可能性のある記事なので参考程度)。Riot のパッチ予定は [S11] による。

| パッチ | リリース日(PT、日本では翌日) | 該当しうる LTK の日程 |
|---|---|---|
| 26.20 | 10/7 | RS D1(10/15)、D2(10/19)、MC1(10/20) |
| 26.21 | 10/21 | RS D3(10/23)、D4(10/27)、MC2(10/28)、RS D5(11/2) |
| 26.22 | 11/4 | RS D6(11/6)、MC3(11/9) |
| 26.23 | 11/18 | Playoffs(11/21・22) |

- 公式は使用パッチを発表していない。大会でパッチを固定するのか、ライブパッチに追従するのかも**未確認**。

---

## 3. ポイントとシードの算出

### 3.1 Regular Stage(確認済み。[S1 Slide4]、[S2]、[S3])
- NEXT と COREそれぞれのダブルラウンドロビン。全 24試合(各階級 12試合)、すべて BO1。
- **1勝で 1pt。同じ日に NEXT と CORE の両方で勝てばボーナス 1pt**。1日の 1チームの得点は 0、1、3pt のいずれかになる(2pt は起こらない)。同じカードの 2チームの合計は、1-1 なら 1+1、2-0 なら 3+0。
- 1チームの RS 獲得点は最大 18pt(6日 × 3pt)。

### 3.2 MASTERS CUP(確認済み。[S3] の画像 17218、[S2])
- 順位点: 1位 3pt、2位 2pt、3位 1pt、4位 0pt。これを 3回行う(最大 9pt)。
- **サイド選択権: 直前2日分の Regular Stage の結果が優れているチームが持つ**(Finale から明記)。
  - 「優れている」の比較方法(2日分の獲得 pt か、勝数か)と、同点のときの扱いは**未確認**。
  - 選択権が BO1 の各試合ごとか、BO3 決勝の第1戦だけかも**未確認**。S3 では「RS 上位チームが選択権を持つ」とされていた([S9 S3])。

### 3.3 シード(総合順位)
- **RS の獲得 pt と MASTERS CUP の獲得 pt を合算した総合ポイント**でシード 1〜4位を決める(確認済み。S3 の告知 https://zetadivision.com/news/2026/04/28/43610 、[S12]。Finale は [S8]「Regular Stage と Masters Cup で順位を決定」)。
- **同点時の決め方: 未確認**(公式規定は見つからなかった)。
  - S3 の実例: CC と LR が 11pt で並び、**LR が 2位、CC が 3位**になった([S9]、FISTBUMP https://fistbump-news.jp/article/2026/06/10/2543.html )。
  - この結果と矛盾しない基準: (a) RS の獲得 pt が多い方(LR 8 > CC 3) (b) RS での直接対決(LR が 2-0 と 1-1 で上回る)。逆に MASTERS の直接対決は CC が 2勝 0敗なので、(c) 総合の直接対決や MC の成績で決めた可能性は低い。
  - **データ推定**: 同点時は RS の pt を優先して扱うのが無難。シミュレーターでは設定で切り替えられるようにする。
- 補足: FISTBUMP の S3 Playoffs の記事には「試合の対戦順は、レギュラーステージの順位が上のチームに優先権」とある(https://fistbump-news.jp/article/2026/06/20/2573.html )。この記事は総合順位を「レギュラーステージ順位」と呼んでいるとみられる。

### 3.4 Playoffs の特殊 BO4(確認済み。[S1 Slide8])
- GAME 1 の勝利で 1pt、GAME 2 の勝利で 1pt、GAME 3 の勝利で 2pt。GAME 3 の時点で同点(2-2)なら GAME 4 を行い、勝ったチームが 1pt を得てマッチに勝つ。
- GAME 1〜3 には NEXT、CORE、MASTERS が 1試合ずつ出る([S9 S3]「GAME1～3でNEXT、CORE、MASTERが1試合ずつ実施」。S3 の全 4マッチがこの通りだった)。
- **GAME 4 には GAME 3 に出た階級以外**(残る 2階級のどちらか)が出る。どちらを出すかは上位チームが選ぶと解される(未確認だが、下記のアドバンテージから自然に導かれる)。
- **アドバンテージ: トーナメント上位のチームが「各 GAME の対戦階級」と「GAME 1 のサイド」を選ぶ**。GAME 2 以降のサイドの決め方は**未確認**。
- スコアが取りうる値: 4-0、3-1、1-3、0-4、2-2 から GAME 4 で 3-2 または 2-3。GAME 1・2 を連取したチームでも、GAME 3 を落とすと 2-2 になる。

### 3.5 S3 Playoffs で実際に選ばれた階級順(確認済み。FISTBUMP https://fistbump-news.jp/article/2026/06/20/2573.html 、https://fistbump-news.jp/article/2026/06/21/2575.html 、YouTube のチャプター)

| マッチ | 上位シード | G1 | G2 | G3(2pt) | 結果 |
|---|---|---|---|---|---|
| UF DD(1) vs LR(2) | DD | MASTERS(DD) | CORE(DD) | NEXT(DD) | DD 4-0 |
| LS CC(3) vs IT(4) | CC | NEXT(IT) | CORE(CC) | MASTERS(CC) | CC 3-1 |
| LF LR(2) vs CC(3) | LR | MASTERS(CC) | CORE(LR) | NEXT(CC) | CC 3-1 |
| GF DD(1) vs CC(3) | DD | CORE(DD) | MASTERS(DD) | NEXT(DD) | DD 4-0 |

S3 では GAME 4 は一度も行われなかった。

---

## 4. 特殊ルール

### 4.1 Finale(確認済み。[S1 Slide3](img/LTK_S4_Slide3_Special-Rules-1024x576.jpg)、[S3])

| ルール | 対象 | 内容 |
|---|---|---|
| 代打制 | 全階級 | Regular Stage で、各チーム**1名だけ**同じレベル帯の代打を呼べる |
| チーム練習 | NEXT・CORE | 試合当日の試合前に 1試合、**1週間で 3試合まで**。これとは別に、シーズン開幕前、RS 前半、RS 後半、プレイオフ前の**計4回**、無制限練習ができる。「チーム練習」とは同じチームの同じ階級が**3名以上**で練習することを指す。**無制限練習は各期間に 10時間分を自由に使える**(Finale で変更。KAI-YOU によると時間を自由に分割できるようになった) |
| プロテクト制度 | NEXT | ファーストピックフェーズで毎試合 2体をプロテクトできる。**うち 1体は相手が BAN できる** |
| フィアレスドラフト | CORE | Regular Stage では、NEXT の試合で使われたチャンピオンを使用禁止 |
| フィアレスドラフト | MASTERS | マスターズカップでは、各試合で使われたチャンピオンを使用禁止 |

- **MASTERS の練習制限: 未確認**(スライドは対象を NEXT・CORE と書くのみ)。
- **BAN 数: 未確認**(公式に記載が無い)。標準のトーナメントドラフト(各チーム 5BAN)と見込まれる。
- 2名(+コーチ)までの練習は制限外。S1・S2 でこの扱いが明記されていた([S9 sbb]、[S9 tot])。Finale は「3名以上をチーム練習とする」と定義しているので、2名以下は制限外と解される。
- k4sen の説明([S7]): 前シーズンは「プロテクトしたブルーのファーストピックが最強」だった。今季は 2体をプロテクトしても 1体は消されるので、「2体は練習しておけ」という趣旨の変更。

### 4.2 フィアレスの適用範囲(公開データでの検証)
- **CORE(RS)**: [S9] の S3 のピックでは、12カードのうち 11カードで「その日の同じカードの NEXT 戦で**両チームが使った計10体**」が CORE の 20体とまったく重ならなかった。例外は S3 Day6 の CC vs LR で、CC NEXT と CC CORE がともにノクターンを使っている。これは記録の誤りか、例外の可能性がある。
  - S1・S2 を含む RS 全 36カードで見ても、重なりはこの 1件だけ。→ **データ推定**: 禁止されるのは「自チームの NEXT の使用分」だけでなく、**両チームの NEXT での使用分(10体)**。
- **MASTERS(MC)**: S3 のデータでは、同じ日の BO1 の別試合で同じチャンピオンが使われている(例: Day1 のサイオンは CC、IT、LR の 3チームが使用)。**同じチームが同日の準決勝と決勝で同じチャンピオンを使った例もある**(Day2 の DD はヴァルスとノーチラスを M1 と決勝 G1 の両方で使用。CC はユナラとルルを M1 と決勝 G2 の両方で使用)。一方、各日の BO3 決勝の中では、両チームとも同じチャンピオンを一度も再使用していない。
  - → **データ推定**: S3 の運用は「**BO3 シリーズ内のフィアレス(両チームが対象)**」だった可能性が高い。
  - ただし文言は「Masters Cup 内において各試合でピックされたチャンピオンは**以降**使用禁止」([S3 の S3 告知] https://fistbump-news.jp/article/2026/04/28/2374.html )で、日をまたぐ、または同じ日の累積で禁止とも読める。**文言とデータが食い違うため未確認**。シミュレーターでは「シリーズ内」「同日累積」「カップ通算」を切り替えられるようにする。
- **Playoffs**: S3・Finale ともフィアレスの明記は無い。S3 の Playoffs では、同じマッチの中で別の階級が同じチャンピオンを使った例がある(GF で DD MASTERS と CC NEXT がともにセラフィーン等)。→ **データ推定**: Playoffs では階級をまたぐフィアレスは無い。

### 4.3 過去シーズンのルールの変遷(確認済み。各出典)

| 項目 | S1 精霊の花祭り | S2 黄昏の試練 | S3 パンデモニウム | S4 Finale |
|---|---|---|---|---|
| 階級 | NEXT / CORE | NEXT / CORE | NEXT / CORE / MASTERS | 同左 |
| 総人数 | 48名(コーチ込み) | 48名(コーチ込み) | 60名 | 60名 |
| NEXT のプロテクト | 3体、相手はうち 1体だけ BAN 可 | 2体、相手はうち 1体だけ BAN 可 | **1体**(BAN 不可) | 2体、うち 1体 BAN 可 |
| チーム練習(5人・3人以上) | 試合日のみ + 週3試合 | 試合前2・試合後1 + 週3 + 無制限日4回(16〜26時) | 試合前1 + 週3 + 無制限日4回(16〜26時) | 試合前1 + 週3 + 無制限4回(各10時間を自由配分) |
| 特別ルール | 均衡の守人が採点し、トレードの可能性あり | 「ダーキンの力」(Day3 後に、0-3 ならメンバー変更、無制限練習 +2日、CORE のプロテクト 1体のいずれか) | MASTERS CUP の新設 | — |
| Playoffs | 二重敗退。BO3、GF は BO5 + 勝者側 1勝アドバンテージ、Nemesis Match | 同左。Nemesis Match は実施見送り | 特殊 BO4 | 特殊 BO4 |
| コーチ | 外部コーチ(元プロ。各チーム CORE 用 1名・NEXT 用 1名) | 同左 | MASTERS の選手が兼任 | MASTERS の選手が兼任 |

出典: S1 は [S9 sbb]・[S10 1st]・https://zetadivision.com/news/2025/06/18/35373 。S2 は [S9 tot]・[S10 2nd]。S3 は https://fistbump-news.jp/article/2026/04/28/2374.html ・[S9 S3]。

- 補足: KAI-YOU [S6] は「従来は 2体まで BAN 不可のプロテクト」と書くが、S3 の公式の文言は「1体」であり、S2 は「2体、1体 BAN 可」。KAI-YOU の書き方は不正確と判断した。

---

## 5. 過去シーズンの結果

### 5.0 一覧(確認済み)

| # | シーズン名 | 期間 | チーム | 優勝 | 準優勝 | 3位 | 4位 | 根拠 |
|---|---|---|---|---|---|---|---|---|
| S1 | 精霊の花祭り 幽明の境(Spirit Blossom Beyond) | 2025-06-25〜08-27(PO は幕張イベントホール) | Sorcery Tiara(ST)、Resolve Regalia(RR)、Domination Crown(DC)、Precision Diadem(PD) | **ST** | RR | PD | DC | [S10 1st]、[S9 sbb-playoff]、https://esports-world.jp/report/53143 |
| S2 | 黄昏の試練(Trials of Twilight) | 2025-09-17〜12-23(PO は 12/19・12/23) | 同じ4チーム名 | **RR** | DC | PD | ST | [S10 2nd]、[S9 tot_playoff] |
| S3 | パンデモニウム(Pandemonium) | 2026-05-08〜06-21(PO は TOYOTA ARENA TOKYO) | DD、CC、IT、LR | **DD**(PO 全勝) | CC | LR | IT | FISTBUMP 2575、[S10 3rd]、esportsnewsjapan |
| S4 | Finale | 2026-10-15〜11-22 | DD、CC、IT、LR | — | — | — | — | — |

- 補足: S1・S2 のチーム名と S3 以降のチーム名は色で対応している(Diadem=黄、Crown=赤、Tiara=青、Regalia=緑)。ただしメンバーはほぼ入れ替わっている。

### 5.1 S3 パンデモニウム(2026-05-08〜06-21)の詳細

#### ロスター(確認済み。FISTBUMP https://fistbump-news.jp/article/2026/05/02/2386.html )

| チーム | 階級 | TOP | JG | MID | ADC | SUP | コーチ |
|---|---|---|---|---|---|---|---|
| DD | MASTERS | Washidai | Rainbrain | Eugeo | Day1 | Qoo | — |
| DD | CORE | YUKIO | ゆふな | ザクレイ | 大御所にゅん子 | 神楽めあ | わしだい |
| DD | NEXT | アステル・レダ | こく兄 | 天ノ川ねる | SHAKA | 白那しずく | Eugeo |
| CC | MASTERS | Yutapon | しゃるる | Recap | Zerost | hetel | — |
| CC | CORE | 狐白うる | k4sen | AlphaAzur | 龍巻ちせ | 昏昏アリア | しゃるる |
| CC | NEXT | 巫神こん | 樹つつき | 多部杉るう | なぎさっち | No.1005(とおこ) | hetel |
| IT | MASTERS | apaMEN | Yunika | たぬき忍者 | Yuhi | ThintoN | — |
| IT | CORE | 酒寄颯馬 | 天月 | 乾伸一郎 | 焼きパン | たかやスペシャル | Yuhi |
| IT | NEXT | 白熊つらら | ありけん | まいたけ | 天帝フォルテ | 鷹宮リオン | たぬき忍者 |
| LR | MASTERS | らいじん | Nesty | Ceros | Haretti | Enty | — |
| LR | CORE | mittiii | Killin9Hit | アクセル・シリオス | ごんかね | レグルシュ・ライオンハート | Ceros |
| LR | NEXT | ギルくん | 夜よいち | 日向まる | 夢野あかり | 白波らむね | らいじん |

代打(確認済み。[S9]、[S10 3rd]):
- Day1: IT NEXT の白熊つらら → ta1yo(vs LR)
- Day3: DD NEXT のこく兄 → 銀城サイネ(vs IT)

#### Regular Stage の全結果(確認済み。FISTBUMP の各日の記事: Day1 https://fistbump-news.jp/article/2026/05/09/2408.html ・Day2 /2026/05/12/2425.html ・Day3 /2026/05/18/2450.html ・Day4 /2026/05/25/2479.html ・Day5 /2026/06/01/2500.html ・Day6 /2026/06/09/2534.html )

- 開始時刻は 18:00。サイドは [S10 3rd] で左側のチームがブルー。

| Day | 日付 | カード(ブルー vs レッド) | NEXT の勝者(MVP) | CORE の勝者(MVP) | 獲得 pt |
|---|---|---|---|---|---|
| 1 | 5/8 | LR vs IT | LR(夜よいち) | LR(ごんかね) | LR 3 / IT 0 |
| 1 | 5/8 | DD vs CC | CC(なぎさっち) | DD(神楽めあ) | DD 1 / CC 1 |
| 2 | 5/12 | IT vs CC | IT(天帝フォルテ) | IT(たかやスペシャル) | IT 3 / CC 0 |
| 2 | 5/12 | LR vs DD | DD(こく兄) | DD(神楽めあ) | DD 3 / LR 0 |
| 3 | 5/18 | IT vs DD | DD(SHAKA) | IT(焼きパン) | 1 / 1 |
| 3 | 5/18 | LR vs CC | LR(白波らむね) | LR(ごんかね) | LR 3 / CC 0 |
| 4 | 5/25 | CC vs DD | DD(SHAKA) | DD(YUKIO) | DD 3 / CC 0 |
| 4 | 5/25 | IT vs LR | IT(鷹宮リオン) | IT(酒寄颯馬) | IT 3 / LR 0 |
| 5 | 6/1 | DD vs LR | DD(天ノ川ねる) | LR(Killin9Hit) | 1 / 1 |
| 5 | 6/1 | CC vs IT | CC(多部杉るう) | IT(乾伸一郎) | 1 / 1 |
| 6 | 6/9 | CC vs LR | LR(ギルくん) | CC(AlphaAzur) | 1 / 1 |
| 6 | 6/9 | DD vs IT | DD(白那しずく) | IT(天月) | 1 / 1 |

#### 階級別の RS 成績(上の表から集計。FISTBUMP の NEXT 振り返り https://fistbump-news.jp/article/2026/06/17/2563.html と一致)

| チーム | NEXT | CORE | ボーナス回数 | RS 合計 pt |
|---|---|---|---|---|
| DD | 5-1 | 3-3 | 2 | **10** |
| IT | 2-4 | 5-1 | 2 | **9** |
| LR | 3-3 | 3-3 | 2 | **8** |
| CC | 2-4 | 1-5 | 0 | **3** |

#### MASTERS CUP の全結果(確認済み。FISTBUMP: Day1 https://fistbump-news.jp/article/2026/05/13/2429.html ・Day2 /2026/05/26/2484.html ・Day3 /2026/06/10/2543.html )

| Cup | 日付 | M1 | M2 | 3位決定戦 | 決勝(BO3) | 順位(pt) |
|---|---|---|---|---|---|---|
| 1 | 5/13 | CC > DD(MVP Recap) | LR > IT(Enty) | DD > IT(Washidai) | CC 2-0 LR(Zerost) | CC 3、LR 2、DD 1、IT 0 |
| 2 | 5/26 | DD > IT(Washidai) | CC > LR(Yutapon) | IT > LR(Yunika) | DD 2-0 CC(Rainbrain) | DD 3、CC 2、IT 1、LR 0 |
| 3 | 6/10 | DD > LR(Washidai) | CC > IT(Yutapon) | LR > IT(Nesty) | CC 2-1 DD(Yutapon) | CC 3、DD 2、LR 1、IT 0 |

- MC の合計: CC 8、DD 6、LR 3、IT 1。
- MASTERS の試合単位の勝敗([S9] から集計。決勝の各ゲームを含む): CC 7-3、DD 6-3、LR 2-5、IT 1-5。
- 補足: [S9] は MC3 の決勝の見出しを「DD 2-0、MVP Rainbrain」としているが、ゲームごとの記録は CC が 2勝しており、FISTBUMP の「CC 2-1、MVP Yutapon」と一致する。見出しの方の誤りと判断した。

#### 総合順位と Playoffs のシード(確認済み)

| シード | チーム | RS | MC | 合計 |
|---|---|---|---|---|
| 1 | DD | 10 | 6 | 16 |
| 2 | LR | 8 | 3 | 11 |
| 3 | CC | 3 | 8 | 11 |
| 4 | IT | 9 | 1 | 10 |

#### Playoffs(→ 3.5 の表)
- 結果: 優勝 DD、準優勝 CC、3位 LR、4位 IT。
- 個別のエピソード(esportsnewsjapan https://esportsnewsjapan.jp/ltk-season-pandemonium-playoffs-day2/ ): LF の G3 で、なぎさっち(CC NEXT)のスモルダーが勝利を決めた。GF の G2 では Eugeo のベイガー、G3 ではアステル・レダのセトが活躍した。
- シーズンを通じたリーグ MVP の表彰: **未確認**(S3 では見つからなかった)。

### 5.2 S2 黄昏の試練(2025-09-17〜12-23)

#### ロスター(確認済み。[S9 tot_playoff]、[S10 2nd])

| チーム | CORE(TOP/JG/MID/ADC/SUP) | NEXT(TOP/JG/MID/ADC/SUP) | コーチ(CORE / NEXT) |
|---|---|---|---|
| DC | YUKIO / 葛葉 / k4sen / 天帝フォルテ / 昏昏アリア | ta1yo / ゆふな / 空澄セナ / とおこ / 白那しずく | Eugeo / たぬき忍者 |
| RR | 焼きパン / Killin9Hit / 乾伸一郎 / なぎさっち / 千燈ゆうひ | 狐白うる / 夜よいち / 日向まる / 鷹宮リオン / 兎咲ミミ | Ceros / Day1 |
| PD | mittiii / うるか / Kamito / SHAKA / 神楽めあ | MOTHER3 / 天月 / おぼ / 白波らむね / トナカイト | Zerost / らいじん |
| ST | 歌衣メイカ / きなこ / AlphaAzur / 橘ひなの / たかやスペシャル | 胡桃のあ / 天宮こころ / 鈴木ノリアキ / 夢野あかり / 本田翼 | Qoo / しゃるる |

#### RS の全結果(確認済み。[S9 tot]、[S10 2nd]。開始時刻は 19:00)

| Day | 日付 | カード | NEXT の勝者(MVP) | CORE の勝者(MVP) |
|---|---|---|---|---|
| 1 | 9/17 | DC vs RR | DC(ta1yo) | RR(千燈ゆうひ) |
| 1 | 9/17 | ST vs PD | PD(MOTHER3) | PD(神楽めあ) |
| 2 | 9/24 | RR vs ST | ST(鈴木ノリアキ) | RR(Killin9Hit) |
| 2 | 9/24 | DC vs PD | DC(白那しずく) | DC(葛葉) |
| 3 | 9/29 | DC vs ST | DC(白那しずく) | DC(葛葉) |
| 3 | 9/29 | RR vs PD | RR(狐白うる) | RR(乾伸一郎) |
| 4 | 10/8 | PD vs ST | ST(本田翼) | PD(mittiii) |
| 4 | 10/8 | RR vs DC | DC(白那しずく) | DC(k4sen) |
| 5 | 10/13 | PD vs RR | RR(夜よいち) | PD(うるか) |
| 5 | 10/13 | ST vs DC | DC(ta1yo) | DC(YUKIO) |
| 6 | 11/12 | PD vs DC | DC(ta1yo) | DC(YUKIO) |
| 6 | 11/12 | ST vs RR | ST(胡桃のあ) | RR(焼きパン) |

- 階級別の成績: NEXT は DC 6-0、ST 3-3、RR 2-4、PD 1-5。CORE は DC 5-1、RR 4-2、PD 3-3、ST 0-6。
- RS の pt: DC 16、RR 7、PD 5、ST 3([S10])。
- 代打: Day2 で PD NEXT の天月 → ボドカ。Day3 で ST NEXT の本田翼 → 一ノ瀬うるは。

#### Playoffs(確認済み。[S9 tot_playoff])

| マッチ | 日付 | 結果 | ゲームごとの勝者 |
|---|---|---|---|
| UF | 12/19 | RR 2-1 DC | DC NEXT → RR CORE → RR NEXT |
| LS | 12/23 | PD 2-0 ST | PD NEXT → PD CORE |
| LF | 12/23 | DC 2-0 PD | DC CORE → DC NEXT |
| GF(BO5、RR が 1勝分のアドバンテージ) | 12/23 | RR 3-1 DC | (アドバンテージ)→ RR CORE → DC NEXT → RR CORE |

- RS で 6-0 だった DC NEXT が UF の G3 で RR NEXT に敗れ、RS を全勝した DC が優勝を逃した。
- Nemesis Match は実施されなかった。

### 5.3 S1 精霊の花祭り 幽明の境(2025-06-25〜08-27)

#### ロスター(確認済み。公式特設サイト https://league.thek4sen.com/ 、[S9 sbb-playoff])

| チーム | CORE(TOP/JG/MID/ADC/SUP) | NEXT(TOP/JG/MID/ADC/SUP) | コーチ(CORE / NEXT) |
|---|---|---|---|
| ST | mittiii / きなこ / AlphaAzur / なぎさっち / うるか | 胡桃のあ / 天宮こころ / 鈴木ノリアキ / 橘ひなの / トナカイト | たぬき忍者 / Qoo |
| RR | 焼きパン / Killin9Hit / 乾伸一郎 / とおこ / たかやスペシャル | 狐白うる / 夜よいち / アステル・レダ / 白波らむね / 日向まる | しゃるる / Day1 |
| DC | 歌衣メイカ / 葛葉 / k4sen / 鷹宮リオン / 昏昏アリア | ta1yo / ゆふな / 空澄セナ / 天帝フォルテ / 白那しずく | らいじん / Eugeo |
| PD | YUKIO / 千燈ゆうひ / Kamito / SHAKA / 神楽めあ | MOTHER3 / 天月 / 夢野あかり / 兎咲ミミ / しろまんた | Zerost / Ceros |

#### RS(確認済み。[S9 sbb]、[S10 1st]。開始時刻 19:00)
- 日程: 6/25、7/14、7/15、7/23、7/29、8/6。
- RS の pt: ST 13、RR 8、DC 7、PD 3。
- 階級別の成績(集計): NEXT は ST 4-2、DC 4-2、RR 2-4、PD 2-4。CORE は ST 5-1、RR 4-2、DC 2-4、PD 1-5。
- **リーグ MVP**(均衡の守人が選定。[S9 sbb]):
  - NEXT: 1位 鈴木ノリアキ、2位 橘ひなの、3位 天宮こころ、4位 ta1yo
  - CORE: 1位 うるか、2位 乾伸一郎、3位 焼きパン、4位 mittiii

#### Playoffs(確認済み。[S10 1st]、[S9 sbb-playoff]。8/26・27、幕張イベントホール)

| マッチ | 結果 | ゲームごとの勝者 |
|---|---|---|
| UF | ST 2-1 RR | ST CORE → RR NEXT → ST CORE |
| LS | PD 2-1 DC | PD CORE → DC NEXT → PD NEXT |
| Nemesis(BO1) | ST CORE > DC CORE | ST が GF のアドバンテージを維持 |
| LF | RR 2-1 PD | PD CORE → RR NEXT → RR NEXT |
| GF(BO5) | ST 3-1 RR | (アドバンテージ)→ RR NEXT → ST CORE → ST NEXT |

---

## 6. Finale 出場者の過去の LTK 戦績(データ推定)

- [S9] の全ピック表から集計した。RS、MC、PO の合計で、**選手単位の勝敗はチームの勝敗**を意味する。役割の記載は [S9] の並び順(TOP→SUP)から付けた。
- 詳細は `ltk_player_records.csv` にある(使用チャンピオンと回数を含む)。
- [S9] には一部、表を写し間違えたとみられる箇所がある(S1・S2 の PO の一部で、同じシリーズ内に同じピックが重複している)。精度はおおむね良好だが、試合単位のピックは参考値として扱うこと。

| Finale(チーム 階級 ロール) | 選手 | 過去の出場(シーズン チーム 階級 ロール 勝-敗) |
|---|---|---|
| DD MASTERS TOP | Washidai | S3 DD MASTERS TOP 8-3。S3 では DD CORE のコーチ |
| DD MASTERS JG | しゃるる | S3 CC MASTERS JG 9-4。S1・S2 はコーチ(S1 RR CORE、S2 ST) |
| DD MASTERS MID | たぬき忍者 | S3 IT MASTERS MID 1-6。S1 ST CORE・S2 DC NEXT のコーチ |
| DD MASTERS ADC | Day1 | S3 DD MASTERS ADC 8-3。S1・S2 は RR のコーチ |
| DD MASTERS SUP | hetel | S3 CC MASTERS SUP 9-4 |
| DD CORE TOP | 酒寄颯馬 | S3 IT CORE TOP 5-2 |
| DD CORE JG | きなこ | S1 ST CORE JG 9-1(優勝)、S2 ST CORE JG 0-7 |
| DD CORE MID | スタンミじゃぱん | LTK 本戦の出場なし |
| DD CORE ADC | じゃすぱー | 本戦の出場なし(S1 PO のショーマッチのみ) |
| DD CORE SUP | 神楽めあ | S1 PD CORE SUP(下記 ※の注意)、S2 PD CORE SUP 4-4、S3 DD CORE SUP 5-3 |
| DD NEXT TOP | SHAKA | S1 PD CORE ADC 3-5、S2 PD CORE ADC 4-4、S3 DD NEXT ADC 7-1(**今季は TOP に転向**) |
| DD NEXT JG | MOTHER3 | S1 PD NEXT TOP 3-7、S2 PD NEXT TOP 2-6(**今季は JG に転向**) |
| DD NEXT MID | 天ノ川ねる | S3 DD NEXT MID 7-1 |
| DD NEXT ADC | 夢野あかり | S1 PD NEXT MID 3-7、S2 ST NEXT ADC 3-4、S3 LR NEXT ADC 3-5 |
| DD NEXT SUP | 白波らむね | S1 RR NEXT ADC 6-5、S2 PD NEXT ADC 2-6、S3 LR NEXT SUP 3-5 |
| CC MASTERS TOP | Yutapon | S3 CC MASTERS TOP 9-4 |
| CC MASTERS JG | Rainbrain | S3 DD MASTERS JG 8-3 |
| CC MASTERS MID | Ceros | S3 LR MASTERS MID 2-7。S1 PD・S2 RR のコーチ |
| CC MASTERS ADC | Yuhi | S3 IT MASTERS ADC 1-6 |
| CC MASTERS SUP | NEMOH | LTK 本戦の出場なし(S1 では均衡の守人) |
| CC CORE TOP | YUKIO | S1 PD CORE TOP 3-5、S2 DC CORE TOP 6-4、S3 DD CORE TOP 5-3(優勝) |
| CC CORE JG | k4sen | S1 DC CORE MID 2-6、S2 DC CORE MID 6-4、S3 CC CORE JG 2-7 |
| CC CORE MID | 葛葉 | S1 DC CORE JG 2-6、S2 DC CORE JG 6-4(**今季は MID**) |
| CC CORE ADC | 龍巻ちせ | S3 CC CORE ADC 2-7 |
| CC CORE SUP | 昏昏アリア | S1 DC CORE SUP 2-6、S2 DC CORE SUP 6-4、S3 CC CORE SUP 2-7 |
| CC NEXT TOP | 叶 | 出場なし(初参戦) |
| CC NEXT JG | ゆふな | S1 DC NEXT JG 5-3、S2 DC NEXT JG 9-1、S3 DD CORE JG 5-3(優勝。**今季は NEXT に戻る**) |
| CC NEXT MID | 空澄セナ | S1 DC NEXT MID 5-3、S2 DC NEXT MID 9-1 |
| CC NEXT ADC | 獅子堂あかり | 出場なし(初参戦) |
| CC NEXT SUP | 鷹宮リオン | S1 DC CORE ADC 2-6、S2 RR NEXT ADC 3-6、S3 IT NEXT SUP 3-4 |
| IT MASTERS TOP | らいじん | S3 LR MASTERS TOP 2-7。S1 DC・S2 PD のコーチ |
| IT MASTERS JG | Yunika | S3 IT MASTERS JG 1-6 |
| IT MASTERS MID | Eugeo | S3 DD MASTERS MID 8-3。S1・S2 は DC のコーチ |
| IT MASTERS ADC | Zerost | S3 CC MASTERS ADC 9-4。S1・S2 は PD のコーチ |
| IT MASTERS SUP | Enty | S3 LR MASTERS SUP 2-7 |
| IT CORE TOP | mittiii | S1 ST CORE TOP 9-1、S2 PD CORE TOP 4-4、S3 LR CORE TOP 4-4 |
| IT CORE JG | AlphaAzur | S1 ST CORE MID 9-1、S2 ST CORE MID 0-7、S3 CC CORE MID 2-7(**今季は JG**) |
| IT CORE MID | たかやスペシャル | S1 RR CORE SUP 4-6、S2 ST CORE SUP 0-7、S3 IT CORE SUP 5-2(**今季は MID**) |
| IT CORE ADC | ごんかね | S3 LR CORE ADC 4-4 |
| IT CORE SUP | レグルシュ・ライオンハート | S3 LR CORE SUP 4-4 |
| IT NEXT TOP | 橘ひなの | S1 ST NEXT ADC 5-4(優勝)、S2 ST CORE ADC 0-7(**今季は NEXT の TOP**) |
| IT NEXT JG | ありけん | S3 IT NEXT JG 3-4 |
| IT NEXT MID | まいたけ | S3 IT NEXT MID 3-4 |
| IT NEXT ADC | 天帝フォルテ | S1 DC NEXT ADC 5-3、S2 DC CORE ADC 6-4、S3 IT NEXT ADC 3-4 |
| IT NEXT SUP | 白那しずく | S1 DC NEXT SUP 5-3、S2 DC NEXT SUP 9-1、S3 DD NEXT SUP 7-1(優勝) |
| LR MASTERS TOP | apaMEN | S3 IT MASTERS TOP 1-6 |
| LR MASTERS JG | Nesty | S3 LR MASTERS JG 2-7 |
| LR MASTERS MID | Recap | S3 CC MASTERS MID 9-4 |
| LR MASTERS ADC | Haretti | S3 LR MASTERS ADC 2-7 |
| LR MASTERS SUP | ThintoN | S3 IT MASTERS SUP 1-6 |
| LR CORE TOP | 焼きパン | S1 RR CORE TOP 4-6、S2 RR CORE TOP 7-2(優勝)、S3 IT CORE ADC 5-2 |
| LR CORE JG | Killin9Hit | S1 RR CORE JG 4-6、S2 RR CORE JG 7-2(優勝)、S3 LR CORE JG 4-4 |
| LR CORE MID | 乾伸一郎 | S1 RR CORE MID 4-6、S2 RR CORE MID 7-2(優勝)、S3 IT CORE MID 5-2 |
| LR CORE ADC | 大御所にゅん子 | S3 DD CORE ADC 5-3(優勝) |
| LR CORE SUP | 千燈ゆうひ | S1 PD CORE JG 3-5、S2 RR CORE SUP 7-2(優勝) |
| LR NEXT TOP | 狐白うる | S1 RR NEXT TOP 6-5、S2 RR NEXT TOP 3-6、S3 CC CORE TOP 2-7(**今季は NEXT に戻る**) |
| LR NEXT JG | アステル・レダ | S1 RR NEXT MID 6-5、S3 DD NEXT TOP 7-1(優勝。**今季は JG**) |
| LR NEXT MID | 春茶 | 出場なし(初参戦) |
| LR NEXT ADC | なぎさっち | S1 ST CORE ADC 9-1(優勝)、S2 RR CORE ADC 7-2(優勝)、S3 CC NEXT ADC 3-6 |
| LR NEXT SUP | No.1005(とおこ) | S1 RR CORE ADC 4-6、S2 DC NEXT ADC 9-1、S3 CC NEXT SUP 3-6 |

- ※ S1 の PD CORE のロール: [S9] の並び順では千燈ゆうひが JG、神楽めあが SUP。Leaguepedia の S1 の別欄では狐白うるが PD CORE に載っており、記載が不整合。S1 の PD CORE の細部は**未確認**扱いとする。
- LTK 本戦への出場が無い(初参戦)選手: スタンミじゃぱん、じゃすぱー、NEMOH、叶、獅子堂あかり、春茶。

---

## 7. シミュレーターへの組み込み要点(仕様メモ)

| 要素 | 値 | 状態 |
|---|---|---|
| RS の対戦カードとサイド | 2.1 の表(左がブルー、NEXT と CORE は同じサイド) | 確認済み |
| RS の得点 | 勝利 1pt + 同日に両階級で勝てば +1pt | 確認済み |
| MC の組み合わせ | 2.2 の表で固定。M1・M2・M3 は BO1、M4 は BO3。順位点 3/2/1/0 | 確認済み |
| MC のサイド | 直前2日分の RS 成績が上のチーム。比較方法と同点時は不明 | 一部未確認 |
| シード | RS の pt + MC の pt の合計 | 確認済み |
| シードの同点時 | 不明。S3 の実例は RS の pt(または RS の直接対決)の優位と矛盾しない | 未確認 |
| PO | 1位 vs 2位(UF)、3位 vs 4位(LS)は 11/21。LF・GF は 11/22。グランドファイナルのアドバンテージ無し | 確認済み |
| BO4 | G1・G2 は各 1pt、G3 は 2pt。2-2 なら G4(G3 以外の階級)。上位チームが階級順と G1 のサイドを選ぶ | 確認済み |
| NEXT のドラフト | 2体をプロテクト、うち 1体は BAN 可 | 確認済み |
| CORE のドラフト | 同日・同カードの NEXT 戦で(両チームが)使ったチャンピオンを使用禁止 | 文言は確認済み。両チーム分が対象という点はデータ推定 |
| MASTERS のドラフト | MC でフィアレス。範囲(シリーズ内、同日、通算)は不明。S3 のデータはシリーズ内に適合 | 未確認 |
| BAN 数 | 不明(標準 5×2 と想定) | 未確認 |
| 代打 | RS で各チーム 1名 | 確認済み |
| 練習 | 試合前 1試合 + 週3試合 + 無制限 4期間 × 10時間(NEXT・CORE) | 確認済み |
| パッチ | 26.20 → 26.21 → 26.22 →(PO)26.23 の可能性 | 未確認(推定) |
| 配信時刻 | 不明(S3 は RS 18:00、MC 17:00) | 未確認 |

## 8. 主な未確認事項
1. 各日の配信開始時刻と試合順(公式は画像でも未発表)。
2. 使用パッチ(固定かライブ追従か)。
3. シード同点時の順位の決め方(公式規定は見つからず)。
4. MASTERS CUP のサイド選択の比較方法と、同点時の扱い。
5. MASTERS のフィアレスの適用範囲(文言と S3 の実データが食い違う)。
6. BAN 数、PO の GAME 2 以降のサイドの決め方。
7. Playoffs の会場(「有明アリーナ」は SNS の AI 要約のみ)。
8. Leaguepedia の S3 ページは結果欄が「TBD」のまま。Leaguepedia の API は途中でレート制限に達し、S1〜S3 の試合ごとの KDA は取得できなかった。Liquipedia は自動取得を禁止しているため使っていない。試合ごとの KDA は未取得。
