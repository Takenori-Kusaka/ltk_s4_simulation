# LTK Season: Finale 出場60名の Riot ID(JP)

- 作成日: 2026-10-08
- 対象: DD・CC・IT・LR の MASTERS / CORE / NEXT 各5名(計60名)
- 機械可読版: [riot-ids.json](riot-ids.json)

## 方法

1. 調査メモ([players-dd-cc.md](players-dd-cc.md)、[players-it-lr.md](players-it-lr.md))の op.gg URL と Riot ID の記載から候補を取り出した(URL はデコードして gameName#tagLine にした)。
2. srtr.site のストリーマーランクボード(https://srtr.site/lol/solo/rank/ 、2026-10-08 取得)にある各配信者の op.gg リンクと突き合わせた。一致したものは「srtr 登録」と書いた。
3. 候補が無い選手と、候補が存在しない選手は、Web(srtr の詳細ページ、LoL情報まとめ Wiki、にじさんじ Wiki、X、op.gg の検索結果)で探した。
4. Riot API(公式)で確かめた。`account-v1 /riot/account/v1/accounts/by-riot-id`(asia)が 200 なら存在、404 なら不存在。200 のものは `league-v4 /lol/league/v4/entries/by-puuid`(jp1)で RANKED_SOLO_5x5 のランクを取った。表の「現在ソロランク」はこの値(2026-10-08 取得)。jp1 で取得できたことで JP サーバーのアカウントであることも確かめた。puuid は保存していない。

## 確度の基準

- **高**: 調査の op.gg と srtr の登録が一致し、API で存在を確認した。ランクも調査の値と整合する。
- **中**: API で存在は確認したが、本人と結び付ける出典が1つだけ(またはメインかどうかに疑問が残る)。
- **低**: 特定できなかった(Riot ID は null)。

## 結果の要約

- 特定: 57/60 名(API で存在を確認: 57 名、確度 高: 56 名)
- 特定できなかった: 鷹宮リオン(CC NEXT SUP)、AlphaAzur(IT CORE JG)、大御所にゅん子(LR CORE ADC)
- 確度 中: レグルシュ・ライオンハート
- 採用したIDに、サブアカウント(スマーフ)と判明したものは無い。API で存在した候補でも、本人のものと確かめられないものは採用していない(備考に記載)。
- 調査時のランクとの差は、いずれも数 LP〜1 ディビジョン程度で、取得時刻の違いによるものと考えられる(備考に記載)。

## Dahlia Diadem (DD)

| 階級 | ロール | 選手 | Riot ID(gameName#tagLine) | 特定方法 | API 確認 | 現在ソロランク(API, 2026-10-08) | 確度 | 備考 |
|---|---|---|---|---|---|---|---|---|
| MASTERS | TOP | わしだい | `鉄砲玉#JP1` | 調査の op.gg https://op.gg/lol/summoners/jp/%E9%89%84%E7%A0%B2%E7%8E%89-JP1 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Challenger 1518LP(508勝483敗) | 高 |  |
| MASTERS | JG | しゃるる | `syaruru#0323` | 調査の op.gg https://op.gg/lol/summoners/jp/syaruru-0323 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Master 221LP(200勝190敗) | 高 |  |
| MASTERS | MID | たぬき忍者 | `Ninja of Ninjas#JP1` | 調査の op.gg https://op.gg/lol/summoners/jp/Ninja%20of%20Ninjas-JP1 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Grandmaster 1438LP(277勝231敗) | 高 |  |
| MASTERS | ADC | Day1 | `Day1week#Day1` | 調査の op.gg https://op.gg/lol/summoners/jp/Day1week-Day1 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Master 306LP(200勝192敗) | 高 | 調査時(op.gg)M285LP → API M306LP |
| MASTERS | SUP | hetel | `hetel#JP1` | 調査の op.gg https://op.gg/lol/summoners/jp/hetel-JP1 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Master 783LP(213勝203敗) | 高 | 調査時 op.gg M779LP / srtr M783LP。API は 783LP |
| CORE | TOP | 酒寄颯馬 | `Sakayori Soma#003` | 調査の op.gg https://op.gg/lol/summoners/jp/Sakayori%20Soma-003 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Emerald 2 7LP(104勝93敗) | 高 |  |
| CORE | JG | きなこ | `kinako#hmm` | 調査の op.gg https://op.gg/lol/summoners/jp/kinako-hmm / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Emerald 4 73LP(115勝139敗) | 高 | 調査時 E3 2LP → API E4 73LP(降格) |
| CORE | MID | スタンミじゃぱん | `スタンミジャパン#JP1` | 調査の op.gg https://op.gg/lol/summoners/jp/%E3%82%B9%E3%82%BF%E3%83%B3%E3%83%9F%E3%82%B8%E3%83%A3%E3%83%91%E3%83%B3-JP1 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Diamond 4 87LP(359勝367敗) | 高 |  |
| CORE | ADC | じゃすぱー | `Jasper7se#CR1` | 調査の op.gg https://op.gg/lol/summoners/jp/Jasper7se-CR1 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Diamond 2 75LP(429勝419敗) | 高 | LoL情報まとめ Wiki 記載の別ID「Jasper7se#JSP」は API 404(旧IDとみられる) |
| CORE | SUP | 神楽めあ | `rnea#JP1` | 調査の op.gg https://op.gg/lol/summoners/jp/rnea-JP1 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Master 65LP(139勝151敗) | 高 |  |
| NEXT | TOP | SHAKA | `shakach#JP1` | 調査の op.gg https://op.gg/lol/summoners/jp/shakach-JP1 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Emerald 4 82LP(125勝105敗) | 高 | ソロの直近は ADC 中心(調査)。TOP はロール変更 |
| NEXT | JG | まざー3 | `Toy Story2#JP2` | 調査の op.gg https://op.gg/lol/summoners/jp/Toy%20Story2-JP2 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Emerald 3 32LP(169勝153敗) | 高 |  |
| NEXT | MID | 天ノ川ねる | `neringojp#666` | 調査の op.gg https://op.gg/lol/summoners/jp/neringojp-666 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Platinum 2 78LP(312勝315敗) | 高 |  |
| NEXT | ADC | 夢野あかり | `Akaringgg#555` | 調査の op.gg https://op.gg/lol/summoners/jp/Akaringgg-555 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Platinum 3 19LP(641勝629敗) | 高 |  |
| NEXT | SUP | 白波らむね | `ramuchi#えぐち` | 調査の op.gg https://op.gg/lol/summoners/jp/ramuchi-%E3%81%88%E3%81%90%E3%81%A1 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Gold 1 70LP(207勝197敗) | 高 |  |

## Camellia Crown (CC)

| 階級 | ロール | 選手 | Riot ID(gameName#tagLine) | 特定方法 | API 確認 | 現在ソロランク(API, 2026-10-08) | 確度 | 備考 |
|---|---|---|---|---|---|---|---|---|
| MASTERS | TOP | Yutapon | `ytzz#2426` | 調査の op.gg https://op.gg/lol/summoners/jp/ytzz-2426 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Challenger 1993LP(328勝281敗) | 高 |  |
| MASTERS | JG | Rainbrain | `Rainbrain#JP1` | 調査の op.gg https://op.gg/lol/summoners/jp/Rainbrain-JP1 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Diamond 2 75LP(291勝301敗) | 高 |  |
| MASTERS | MID | Ceros | `Ceros#111` | 調査の op.gg https://op.gg/lol/summoners/jp/Ceros-111 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Master 300LP(523勝553敗) | 高 |  |
| MASTERS | ADC | Yuhi | `Yuhi#045` | 調査の op.gg https://op.gg/lol/summoners/jp/Yuhi-045 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Master 75LP(300勝285敗) | 高 | 調査時 M105LP → API M75LP |
| MASTERS | SUP | Nemoh | `弱者ネ申#Nemoh` | 調査の op.gg https://op.gg/lol/summoners/jp/%E5%BC%B1%E8%80%85%E3%83%8D%E7%94%B3-Nemoh / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Master 314LP(104勝94敗) | 高 |  |
| CORE | TOP | YUKIO | `岡野やうじ#5567` | 調査の op.gg https://op.gg/lol/summoners/jp/%E5%B2%A1%E9%87%8E%E3%82%84%E3%81%86%E3%81%98-5567 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Emerald 3 91LP(378勝394敗) | 高 |  |
| CORE | JG | k4sen | `若干ワース#k4sen` | 調査の op.gg https://op.gg/lol/summoners/jp/%E8%8B%A5%E5%B9%B2%E3%83%AF%E3%83%BC%E3%82%B9-k4sen / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Emerald 3 87LP(76勝74敗) | 高 |  |
| CORE | MID | 葛葉 | `Lagusa#JP1` | 調査の op.gg https://op.gg/lol/summoners/jp/Lagusa-JP1 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Diamond 3 37LP(63勝59敗) | 高 |  |
| CORE | ADC | 龍巻ちせ | `tornado3#JP0` | 調査の op.gg https://op.gg/lol/summoners/jp/tornado3-JP0 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Master 446LP(350勝331敗) | 高 |  |
| CORE | SUP | 昏昏アリア | `教 祖#666` | 調査の op.gg https://op.gg/lol/summoners/jp/%E6%95%99%20%E7%A5%96-666 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Diamond 1 61LP(217勝205敗) | 高 |  |
| NEXT | TOP | 叶 | `とうもろこし#かなえ` | 調査の op.gg https://op.gg/lol/summoners/jp/%E3%81%A8%E3%81%86%E3%82%82%E3%82%8D%E3%81%93%E3%81%97-%E3%81%8B%E3%81%AA%E3%81%88 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Emerald 4 5LP(136勝122敗) | 高 |  |
| NEXT | JG | ゆふな | `YufuNa#DDwin` | 調査の op.gg https://op.gg/lol/summoners/jp/YufuNa-DDwin / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Emerald 3 14LP(186勝167敗) | 高 |  |
| NEXT | MID | 空澄セナ | `あしゅ公#0118` | 調査の op.gg https://op.gg/lol/summoners/jp/%E3%81%82%E3%81%97%E3%82%85%E5%85%AC-0118 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Gold 2 65LP(167勝170敗) | 高 | 調査時 G1 9LP → API G2 65LP(降格) |
| NEXT | ADC | 獅子堂あかり | `uouo#4410` | 調査の op.gg https://op.gg/lol/summoners/jp/uouo-4410 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Gold 3 64LP(56勝54敗) | 高 | 調査時 G3 78LP → API G3 64LP |
| NEXT | SUP | 鷹宮リオン | 未特定 | 調査の op.gg https://op.gg/ja/lol/summoners/jp/%E9%B7%B9%E5%AE%AELee%20Ornn-JP1 / LoL情報まとめ Wiki https://wikiwiki.jp/loljpdata/%E4%B8%80%E8%A6%A7%E8%A1%A8 / サブ垢 X https://x.com/takamiyarion_2/status/2033443938460369232 | 未確認(候補は404または本人未確認) | — | 低 | 候補「鷹宮Lee Ornn#JP1」は API 200(Platinum 3 61LP、56勝50敗)だが本人のものか未確認(本人のサブ垢 X が 2026-03 に投稿した「プラチナ1昇格(41勝27敗)」と戦績・最高ランクが合わない)。Wiki 記載の「ewqwqew#eee3」「名誉0の人#JP1」は API 200 だが今季ソロ未ランク。srtr 未登録(srtr の「rion」は CR rion で別人)。メインは特定できず |

## Iris Tiara (IT)

| 階級 | ロール | 選手 | Riot ID(gameName#tagLine) | 特定方法 | API 確認 | 現在ソロランク(API, 2026-10-08) | 確度 | 備考 |
|---|---|---|---|---|---|---|---|---|
| MASTERS | TOP | らいじん | `らいじん#JP1` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E3%82%89%E3%81%84%E3%81%98%E3%82%93-JP1 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Diamond 2 84LP(108勝118敗) | 高 |  |
| MASTERS | JG | ゆにか | `ゆにか#1122` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E3%82%86%E3%81%AB%E3%81%8B-1122 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Master 644LP(187勝184敗) | 高 | 調査時 op.gg M574LP / srtr 598LP → API M644LP |
| MASTERS | MID | Eugeo | `Eugeo#DDWIN` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/Eugeo-DDWIN / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Master 0LP(151勝112敗) | 高 |  |
| MASTERS | ADC | Zerost | `Zeroyusi#zzz` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/Zeroyusi-zzz / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Diamond 2 80LP(80勝85敗) | 高 |  |
| MASTERS | SUP | Enty | `えんてぃ#ENTP` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E3%81%88%E3%82%93%E3%81%A6%E3%81%83-ENTP / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Diamond 2 65LP(21勝9敗) | 高 | 今季のソロは30戦のみ |
| CORE | TOP | mittiii | `SBJ mittiii#000` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/SBJ%20mittiii-000 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Diamond 4 0LP(360勝361敗) | 高 | 調査時 D4 30LP → API D4 0LP |
| CORE | JG | AlphaAzur | 未特定 | srtr 詳細 https://srtr.site/streamer/Alpha%20Azur/ / LoL情報まとめ Wiki https://wikiwiki.jp/loljpdata/%E4%B8%80%E8%A6%A7%E8%A1%A8 | 未確認(候補は404または本人未確認) | — | 低 | srtr 登録の「ギリしゃるるの味方#アくん」と Wiki 記載の「AlphaAzur#ジェイ男」はどちらも API 404(改名とみられる)。srtr 上の表示はソロ Platinum I 55LP。検索で見つかった「AlphaAzur母のMango#yummy」は名前から本人のメインと判断できず不採用。現在のIDは特定できず |
| CORE | MID | たかやスペシャル | `たかスペ#JP2` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E3%81%9F%E3%81%8B%E3%82%B9%E3%83%9A-JP2 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Master 347LP(321勝318敗) | 高 | 調査時 M388LP → API M347LP |
| CORE | ADC | ごんかね | `豚トロ#umai` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E8%B1%9A%E3%83%88%E3%83%AD-umai / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Master 376LP(228勝217敗) | 高 |  |
| CORE | SUP | レグルシュ・ライオンハート | `ReglushLionheart#JP1` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/ReglushLionheart-JP1 / LoL情報まとめ Wiki https://wikiwiki.jp/loljpdata/%E4%B8%80%E8%A6%A7%E8%A1%A8 | 200 | ソロ未ランク(Flex Platinum 3 53LP) | 中 | 今季ソロ未ランク。srtr 未登録で、出典は Wiki の1件だけ。別アカウントの有無は未確認 |
| NEXT | TOP | 橘ひなの | `hinano#4777` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/hinano-4777 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Gold 4 75LP(249勝261敗) | 高 |  |
| NEXT | JG | ありけん | `米炊き小坊主#ツツツ` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E7%B1%B3%E7%82%8A%E3%81%8D%E5%B0%8F%E5%9D%8A%E4%B8%BB-%E3%83%84%E3%83%84%E3%83%84 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Silver 1 38LP(360勝353敗) | 高 | 調査時 S1 42LP → API S1 38LP |
| NEXT | MID | まいたけ | `まいちゃけ#きのこ` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E3%81%BE%E3%81%84%E3%81%A1%E3%82%83%E3%81%91-%E3%81%8D%E3%81%AE%E3%81%93 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Platinum 4 21LP(293勝278敗) | 高 |  |
| NEXT | ADC | 天帝フォルテ | `100000tap#4002` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/100000tap-4002 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Platinum 2 47LP(74勝67敗) | 高 |  |
| NEXT | SUP | 白那しずく | `467#429` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/467-429 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Platinum 4 69LP(246勝239敗) | 高 | 調査時 P4 71LP → API P4 69LP |

## Laurel Regalia (LR)

| 階級 | ロール | 選手 | Riot ID(gameName#tagLine) | 特定方法 | API 確認 | 現在ソロランク(API, 2026-10-08) | 確度 | 備考 |
|---|---|---|---|---|---|---|---|---|
| MASTERS | TOP | apaMEN | `もちあき#イルボン` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E3%82%82%E3%81%A1%E3%81%82%E3%81%8D-%E3%82%A4%E3%83%AB%E3%83%9C%E3%83%B3 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Master 233LP(171勝148敗) | 高 |  |
| MASTERS | JG | ねすてぃー | `ねすてぃー#7777` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E3%81%AD%E3%81%99%E3%81%A6%E3%81%83%E3%83%BC-7777 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Master 831LP(416勝416敗) | 高 | 調査時 op.gg M872LP / srtr 831LP。API は 831LP |
| MASTERS | MID | Recap | `Recap#125` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/Recap-125 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Challenger 1761LP(686勝631敗) | 高 |  |
| MASTERS | ADC | ハレっち | `Haretti#hare` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/Haretti-hare / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Diamond 2 75LP(23勝14敗) | 高 | 今季のソロは37戦のみ |
| MASTERS | SUP | てぃんとん | `てぃんとん#1017` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E3%81%A6%E3%81%83%E3%82%93%E3%81%A8%E3%82%93-1017 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Master 1006LP(341勝333敗) | 高 |  |
| CORE | TOP | 焼きパン | `Varvalian#sfr` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/Varvalian-sfr / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Diamond 1 72LP(70勝60敗) | 高 |  |
| CORE | JG | Killin9Hit | `チョゴチュジャン#7777` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E3%83%81%E3%83%A7%E3%82%B4%E3%83%81%E3%83%A5%E3%82%B8%E3%83%A3%E3%83%B3-7777 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Emerald 4 64LP(47勝53敗) | 高 | LoL情報まとめ Wiki 記載の「Killin7Hit#5547」は API 404(旧IDとみられる)。srtr の登録は本ID |
| CORE | MID | 乾伸一郎 | `乾伸一郎#JP1` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E4%B9%BE%E4%BC%B8%E4%B8%80%E9%83%8E-JP1 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Platinum 3 97LP(7勝0敗) | 高 | 今季のソロは7戦のみ |
| CORE | ADC | 大御所にゅん子 | 未特定 | srtr 詳細 https://srtr.site/streamer/%E5%A4%A7%E5%BE%A1%E6%89%80%E3%81%AB%E3%82%85%E3%82%93%E5%AD%90/ / LoLランクボード X https://x.com/lol_rank_s/status/2091450651742294024 | 未確認(候補は404または本人未確認) | — | 低 | srtr 登録の「触るな俺のウェーブに#どっかいけ」は API 404(改名とみられる)。srtr 上の表示はソロ Diamond I。2026-08 に Master 1 到達(LoLランクボード)。「大御所にゅん子#JP1」は推測で照会して 200 だったが、今季ソロ未ランクで本人と結び付ける出典が無く不採用。現在のIDは特定できず |
| CORE | SUP | 千燈ゆうひ | `千 燈#1010` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E5%8D%83%20%E7%87%88-1010 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Diamond 2 23LP(85勝98敗) | 高 | 調査時 D2 20LP → API D2 23LP。ソロは JG 中心(調査) |
| NEXT | TOP | 狐白うる | `狐白うる#6122` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E7%8B%90%E7%99%BD%E3%81%86%E3%82%8B-6122 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Gold 1 50LP(30勝44敗) | 高 |  |
| NEXT | JG | アステル・レダ | `横揺れしテルレダ#ODORE` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E6%A8%AA%E6%8F%BA%E3%82%8C%E3%81%97%E3%83%86%E3%83%AB%E3%83%AC%E3%83%80-ODORE / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Gold 2 62LP(45勝44敗) | 高 |  |
| NEXT | MID | 春茶 | `BBIBBI#010` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/BBIBBI-010 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Gold 2 22LP(216勝215敗) | 高 | LoL情報まとめ Wiki には別ID「I stan U#3646」もある(API 200・今季ソロ未ランク)。srtr 登録・今季ソロ431戦の本IDをメインと判断 |
| NEXT | ADC | なぎさっち | `なぎさっち#JP1` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E3%81%AA%E3%81%8E%E3%81%95%E3%81%A3%E3%81%A1-JP1 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Platinum 3 44LP(375勝366敗) | 高 |  |
| NEXT | SUP | No.1005 | `とおこ#JP1` | 調査(op.gg 取得) https://op.gg/lol/summoners/jp/%E3%81%A8%E3%81%8A%E3%81%93-JP1 / srtr 登録 https://srtr.site/lol/solo/rank/ | 200 | Emerald 4 17LP(117勝116敗) | 高 | とおこ(URS-No.1005)と同一人物 |

## 未解決の事項

- **AlphaAzur・大御所にゅん子**: srtr は改名前のIDを持ったまま(ランクは更新されている)。本人の配信画面、X のプロフィール、op.gg で現在のIDを確かめる必要がある。
- **鷹宮リオン**: 配信外のサブアカウント(本人の X @takamiyarion_2 で言及)を主に使っているとみられるが、そのIDは公開情報で確認できなかった。
- **レグルシュ・ライオンハート**: 今季のソロのランクが無い。別アカウントでソロをしているかは未確認。

## 追記(2026-10-08): 未特定だった3名

価値責任者が op.gg・DEEPLOL で特定し、Riot API(account-v1・league-v4)で実在とランクを確認した。`riot-ids.json` と `src/data/roster.ts` に反映済み。

| チーム | 階級 | ロール | 選手 | Riot ID | API のランク(2026-10-08) | 確度 | 根拠 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| IT | CORE | JG | AlphaAzur | Alpha Azur#アくん | ソロ Platinum I 55LP | 高 | op.gg(https://op.gg/ja/lol/summoners/jp/Alpha%20Azur-%E3%82%A2%E3%81%8F%E3%82%93)。srtr の追跡値(ソロ 55LP)と一致。旧名「ギリしゃるるの味方#アくん」から改名 |
| LR | CORE | ADC | 大御所にゅん子 | moonshine#密造酒 | ソロ Diamond I 28LP / フレックス Emerald I / 5v5 Master | 高 | op.gg(https://op.gg/ja/lol/summoners/jp/moonshine-%E5%AF%86%E9%80%A0%E9%85%92)。srtr の追跡値(フレックス Emerald I・5v5 Master)と一致。旧名「触るな俺のウェーブに#どっかいけ」から改名 |
| CC | NEXT | SUP | 鷹宮リオン | 名誉0の人#JP1 | 今季ソロ未ランク | 低 | DEEPLOL の掲載(鷹宮リオンと紐付け)と本人のサブ X の言及。ランクの照合ができないため確度は低 |
