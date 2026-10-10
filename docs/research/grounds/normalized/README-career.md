# 経歴の正規化の記録(career.json)の規則

- 版: `rulesVersion` 2026-10-10
- 入力: `../career/*.json`(kind `evidence-career`、60 名。2026-10-10 収集・手直し済み)、`../../riot-ids.md`(Riot API の現在値、2026-10-08)、`../../format-history.md` 節6
- 出力: `career.json`(kind `evidence-career-normalized`)。選手 ID ごとに `peak`・`lol`・`otherGame`・`activities`・`ltk`・`selfReportedOnly`・`unverifiedHints`・`refutedIgnored`
- 下の規則を AI が書いたスクリプトで機械的に当てた(スクリプトはリポジトリに入れていない)。材料はすべて AI が集め AI が確かめたもので、**人の確認ではない**。表示は「AI 収集」のまま(ADR-0004 決定5)

## 共通

- 使う行は `verification.status` が confirmed の行だけ。unverifiable は `unverifiedHints` に件数だけを書く。refuted は使わず、`refutedIgnored` に件数を書く
- `ref` は元の JSON の項目(例: `lolPro[2]`)。数の元を辿るために付ける
- 出典は、行の `source` と `verification.url` の URL(重複を除く)
- 文は転載しない。名簿外の人物の名前は書かない

### 年の数え方(在籍・役割・他ゲームの年数)

1. `from`・`to` の最初の年月日を読む。年だけなら始まりは 1-1、終わりは 12-31。年月だけなら始まりは 1日、終わりは 15日。「現在」は 2026-10-10。「未確認」「—」などで始まる値は読まない
2. 行ごとに、期間が 60 日以上かかる暦年を数える。どの暦年も 60 日に届かない行は、日数の最も多い暦年を 1 年とする
3. 同じ暦年を2回数えない。`lol.years` では、その年に在籍した区分のうち最も高い区分にだけ数える(年と区分は `lol.yearMap`)
4. 期間を読めない行は年に数えない(`yearsNote` を付ける)

## peak(最高ランク)

- 値は `tier`・`division`(1〜4。Master 以上は null)・`lp`(欄の先頭の数。「最高 371」「2,063」も読む。読めなければ null)・`when`(元の記述)・`isLowerBound`・`source`
- 記録の値: `peakRank.allTime`・`peakRank.thisSeason` が confirmed でティアを読めるとき。ティア・LP・時期の欄に「下限」か「以上」があれば `isLowerBound: true`
- riot-ids.md の現在値(本表と末尾の追記。ソロ未ランクは使わない)を、今季と歴代の最高の下限に使う
  - thisSeason: 記録の値が現在値以上なら記録の値。記録が無いか現在値より低ければ現在値(`isLowerBound: true`)
  - allTime: 記録の値が thisSeason と現在値の高い方以上なら記録の値。そうでなければその高い方(`isLowerBound: true`)
- 比べ方: ティア → ディビジョン → LP。LP が不明な値は、同じティア・ディビジョンの中で最も低いとみなす

## lol(LoL のプロ歴)

| `lolPro` の type | level | 区分 |
| --- | --- | --- |
| player-starter | LJL | LJL-starter |
| player-sub | LJL | LJL-sub |
| player-starter | LJL CS | LJL CS-starter |
| player-sub | LJL CS | LJL CS-sub |
| player-starter・player-sub | overseas-major・overseas-minor | 同じ名前 |
| academy | (問わない) | academy |
| player-starter・player-sub | other(JCG 期・代表戦など) | 区分なし。internationals と lastCompetitiveYear にだけ使う |
| coach・caster | — | `roles` に年数 |
| amateur・qualifier | — | 使わない |

- `highestLevel`: overseas-major > LJL-starter > LJL-sub > overseas-minor > LJL CS-starter > LJL CS-sub > academy > none。区分のある行が無ければ none。行の level で数え、LJL の行の期間に LJL 発足前(JCG 期)の年が含まれても分けない
- `years`: 区分ごとの年数(年の数え方)
- `internationals`: 選手の行(player-starter・player-sub・academy。level other を含む)の league と achievements、競技活動の公式(国際)・公式大会・代表戦・国際大会の行の what から次の大会名を拾い、(大会名, 年) の組を数える。組は `internationalEvents`
  - Worlds、MSI、IWCI・IWCT・IWCQ・IWCA、Rift Rivals、アジア競技大会(東アジア予選を含む。杭州大会は 2022)、KeSPA Cup、Asia Masters、ASCI、AESF e-Masters、Esports Championships East Asia、PCS の Spring・Summer Playoffs、LCP P&R(年は試合の年)
  - 「控え」「載らない」「出場なし」を含む文は数えない。PCS の Playoffs と LCP P&R は、調査の分類(公式(国際))に合わせて数えた
- `lastCompetitiveYear`: 選手として公式戦に出た最後の年。区分のある行と level other の選手の行の年(「出場なし」「出場記録なし」と書かれた控えの行を除く)、競技活動の公式の行(公式・公式(国際)・公式大会・代表戦・国際大会。トライアウトとスカウトは除く)の年、internationals の年のうち最も遅い年。highestLevel が none なら null
- `status`: highestLevel が none なら none(行が無いことによる。無いことの証明ではない)。そうでなければ `lolProStatus`(confirmed)の status の書き出しで、「引退」→ retired、「休止」「選手活動を休止」「無所属」「所属なし」「FA」→ inactive、「現役」を含む → active、どれでもない → inactive。lolProStatus が confirmed でなければ null
- `roles`: coach・caster の行の年数と ref

## otherGame(他ゲームの競技歴)

- `otherGamePro` の type が pro-player と national-team の行だけ。rank-only・amateur・streamer-division・coach の行は使わない
- (game, type) ごとに1件。`years` は年の数え方の暦年の数。`igl` は true の行があれば true、すべて false なら false、ほかは null。`achievements` は行の achievements を短く言い換えた要約(大会名と最高成績)。`source`・`teams`・`refs` は元の行から

## activities(LTK 以外の競技活動の数)

`competitiveActivity` の行を次の順に分ける。1行を1件と数える(複数の大会をまとめた行も1件)。

1. LTK のシーズン(S1〜S3・Finale、「LTK の CORE」など)の行は数えない(`ltk` で扱う)。LTK に付随するショーマッチ・Dash Ladder・Show Match は数える
2. kind にコーチ・監督・担任 → 数えない
3. kind に解説・キャスター・実況・審査・評価役・ウォッチパーティ・公式配信・運営、または本人の主催(「主催(…)」「(主催)」「大会の主催」「主催・」)→ 数えない。「Riot 主催」など他者の主催は数える
4. 検定・クイズ → 数えない
5. ゲーム: kind に LoL があれば LoL。kind に他ゲームの語(他ゲーム・VALORANT・Apex・TFT・osu!・ポケモンなど)があれば他ゲーム。kind で決まらなければ what で同じ判定。どちらにも無ければ LoL
6. kind にランク・練習・合宿・同行・指導・海外トライアウト・企画・イベントがあり、kind に大会・ショーマッチなどの語が無く、what に大会名(The k4sen・しゃるる杯・CR Cup・RGO など)も無い → 数えない
7. 他ゲーム → `otherGameTournaments`
8. LoL の ARAM・アリーナ(Arena)・近江牛LoL杯(ARAM 中心の大会と記録された大会)→ 数えない(5v5 の通常の対戦でない)。会場名の「横浜アリーナ」などは除いて判定する
9. Scouting Grounds・選考大会・公式(トライアウト)→ `lolTournaments`
10. 公式(国際)・公式大会・代表戦・国際大会 → 数えない(`lol.internationals`)。公式・公式(アカデミー)・公式(LJL)→ 数えない(プロ歴)
11. kind にスクリム・カスタムがあり大会が無い → kind か what に「現役」「LJL」「プロカスタム」「プロ選手」「レジェンド」があれば `lolProScrims`。無ければ数えない
12. ほか → `lolTournaments`

- 勝ち(`lolTournamentWins`・`otherGameWins`): result に「優勝」(準優勝を除く)か「1位」(ラダー・キル・ポイント・ダメージ・予選の1位を除く)がある行。「優勝は○○」「○○が優勝」のように他者の優勝を書いた部分は除く。ショーマッチの「勝利」だけでは数えない
- `basis`: 各数の元の行(ref・when・出典)

## ltk(LTK の過去の出場)

- 正本は format-history.md 節6。「S<n> <チーム> <階級> <ロール> <勝>-<敗>」を `appearances` に、「…のコーチ」の文を `coach` に読む(選手と兼ねたシーズンも含む)。`seasons` は選手として出たシーズンの数
- 勝敗はデータ推定。点数には使わない

## selfReportedOnly(本人の申告だけが出典の項目)

- 対象は使った値(peak の記録の値、lol の区分のある行、otherGame の行、activities で数えた行)。次のどちらかに当たる項目を挙げ、`marker` に理由を書く
  - (a) 出典の URL がすべて本人が発信できる場所(X・YouTube・Twitch など)で、note に「本人」がある
  - (b) note に「自己申告」「本人申告」「本人の申告」「本人インタビュー」「本人の回想」「本人の説明で確認」があり、本人以外の出典(op.gg・Leaguepedia・Riot API・公式など)で確かめた記述が無い
- 限界: 語で判定するため、媒体の記事が本人の申告を伝えているだけの項目を拾えないことがある。逆に、別の部分を op.gg などで確かめた記述があると挙がらない

## unverifiedHints・refutedIgnored

- `unverifiedHints`: peakRank(allTime・thisSeason)・lolPro・lolProStatus・otherGamePro・competitiveActivity・shotcallingIgl の unverifiable の件数と合計
- `refutedIgnored`: 同じ項目の refuted の件数の合計

## shotcalling.json への追加(2026-10-10)

- `shotcallingIgl` の confirmed の行のうち、出典の URL(source と verification.url。YouTube は動画 ID で比べ、時刻の引数は無視)が同じ選手の既存の根拠と重ならない行を、その選手の evidence の末尾に足した(origin `career-research-2026-10-10`、collectedBy `ai`)。足した行どうしは比べない
- direction(+ / -。− は - に直す)・strength(強・中・弱)・kind(player・coach・other-game・other)のどれかが決まらない行は足さない
- kind は調査の分類(kindBy `調査の分類`)。type は要約の語から機械で推定した(typeBy `機械で推定`): 「本人」→ 本人の発言、ファン・視聴者・切り抜きの題名など → 視聴者の声、名簿の選手・コーチ・チームメイトなどの発言 → チームメイトの発言、発言の動詞 → 本人の発言、リーダー・コーチとして・担当など → 大会での役割、ほか → 記事
- selfTeam: 話し手が名簿の選手1名と分かる「チームメイトの発言」の行だけに付ける。話し手と対象が Finale で同じチームなら true、違えば false
- 要約は元の行のまま。名簿外の人物の名前を役割の言葉に置き換えた行(4 行)と、前の行を指す「同大会」を大会名に直した行(2 行)だけ書き換えた
