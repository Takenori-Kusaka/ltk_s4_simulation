# LoL 選手評価アルゴリズム設計のための調査(2026-10-08)

目的: LTK 予測シミュレーターの 60 選手のレーダー(0〜10、小数第一位)で、一目でおかしい数字が出ないようにする。
表記:
- **[確認済]**: 出典の本文で確かめた事項
- **[出典の要約]**: 検索結果の抜粋や二次資料による事項
- **[未確認]**: 裏付けが取れていない事項
- **[設計提案]**: 調査から導いた、本調査者の提案

---

## 1. 既存の評価システム

### 1.1 Mobalytics GPI(Gamer Performance Index)
- **[確認済]** 8 つの領域を 0〜100 で採点する。0 に近いほど「その技能で Bronze の選手に近い」、100 は「最上位の Challenger に近い」。つまり絶対値ではなく、**ランク帯の分布の中での位置(パーセンタイルに近い尺度)**である。機械学習を使うとしているが、式と重みは公開していない。公式ページには「Doublelift のようにファームできても、彼のようにプレイできるとは限らない」という注意書きがある。
- **[確認済]** 8 領域と下位指標(公式ページの記載):

| 領域 | 下位指標(公式の説明) | 主な生データ |
| --- | --- | --- |
| Fighting | Duels(1v1)、Picks(孤立した敵を味方と狩る)、Skirmishes(2v2〜2v5)、Teamfights(各3人以上)、Stat Contribution(ロールとチャンピオン種別に照らした役割の遂行) | K/A、与ダメ・被ダメ、戦闘頻度、位置取り |
| Farming | General Income、Farm Efficiency(死亡中・帰還中を除いた CS 効率)、Early(〜15分)/Mid(15〜30分)/Late(30分〜)の CS・GPM・XPM | CS、ゴールド、経験値(時間帯別) |
| Vision | Placement、Denial(相手の設置量に対する除去)、Efficiency(トリンケットの使い方)、Vision Impact | ward の設置・除去 |
| Aggression | KP、Ganking(15分までの、対面以外へのキル/アシスト)、Solo Play、Initiative(序盤のキル・タワーの早さを同ロールと比較)、Forward Kills(敵陣の深さを考慮)、Snowballing | KP、時間帯別キル、位置 |
| Toughness | Lane Defense、Discernment(意味のある犠牲か無駄死にか)、Defensive Build、Damage Taken、Deaths、Gank Susceptibility | 被ダメ、デス、ビルド |
| Teamplay | Ward Participation、Assist Participation、Team Fight Participation、Objective Play、Utility(回復・シールド)、Kill Stealing | アシスト、オブジェクト参加 |
| Consistency | Laning の安定性、Performance の安定性、Comeback、Throw、Tilt(負けの後の劣化) | 試合間の分散、劣勢時/優勢時の成績 |
| Versatility | Item Builds、Phase Play(序盤・中盤・終盤)、Steadiness(勝ち試合と負け試合)、Play Style | 試合間・局面間の比較 |

- 示唆:
  - GPI には「コール」「マクロ」の軸が**無い**。Objective Play は Teamplay の下位指標で、マクロ判断そのものは採点していない。
  - Consistency と Versatility は単試合の値ではなく、**試合間の分布**から作っている。
- 出典:
  - https://mobalytics.gg/gpi (公式ページ。WebFetch では 403 だったため、Tavily extract で本文を取得)
  - https://esportsinsider.com/2017/08/great-really-mobalytics-releases-gamer-performer-index (2017年の初期8領域: Aggression, Consistency, Farming, Fighting, Teamplay, Toughness, Versatility, Vision)
  - https://mobalytics.gg/blog/dev-blog-mobalytics-challenges (後年は Objectives・Survivability という名称も使用)
- **[未確認]** 現行版で Teamplay が Objectives に、Toughness が Survivability に置き換わったか。資料によって名称が違い、確定できない。

### 1.2 OP.GG OP Score
- **[確認済]**
  - 試合ごとに 0〜10 で評価する。
  - 公式はベータ版としており、「試合の特性によっては不正確な結果が出ることがある」と注記している。
  - Summoner's Rift では 5 分ごとにタイムラインの OP Score を計算し、試合終了時の値を正式な OP Score とする。
  - 勝利チームで 10 人中最高の選手が MVP、敗北チームで最高の選手が ACE になる。
- **[出典の要約]** 要素は「レーン戦、ダメージ、アシスト、キルなど」で、それぞれに重みを付けている(Reddit での OP.GG 側の説明)。重みは非公開。学術論文(Springer, 2023)も「OP Score はほとんど説明されていない」と指摘している。
- 示唆: 試合単位の総合点で、多軸ではない。**同じ試合の 10 人の中での相対順位**(MVP/ACE)を出す設計は、試合ごとの難しさや試合時間の影響を打ち消す。
- 出典:
  - https://help.op.gg/hc/en-us/articles/31088715328665-OP-Score-explained
  - https://www.reddit.com/r/leagueoflegends/comments/9sdk8v/op_score_in_opgg
  - https://link.springer.com/article/10.1007/s42979-022-01660-6

### 1.3 DEEPLOL AI Score
- **[出典の要約]**
  - 独自の AI 分析モデルで、試合ごとの AI Score とティア予測を出す。
  - DEEPLOL 代表への取材(韓国の YouTube ショート、2025-11)によると、点はイベントごとに上下する。評価の仕方は「そのキルが勝利に何点ぶん効いたか」を結果から付けるもので、勝率寄与(Win Probability Added)型に当たる。
  - 代表自身が、この性質のためにキルに直結しない仕事をするサポートは AI Score が低めに出ると認めている。
- 示唆: 勝率寄与型は「勝ちに効いたか」を測れるが、**ロールによって系統的に偏る**。ロール内での正規化が欠かせない。
- 出典:
  - https://www.deeplol.gg?hl=en
  - https://www.youtube.com/shorts/e5FIRg9Czsc
  - https://ai.dherald.com/business/sub4000
- **[未確認]** モデルの入力と式(非公開)。

### 1.4 U.GG / League of Graphs
- **[出典の要約]**
  - U.GG は試合後に「Carry Score」を出す。運営の Reddit 投稿では「ハードキャリーとチームプレイの指標の一群」で比較すると説明している。別の記事では「チームのゴールド優位のうちどれだけを自分が担ったか」を測るとしている。
  - League of Graphs は KDA、CS/分、ダメージシェア、ランク分布などの集計が中心で、合成スコアの算出方法は公開されていない(見つからなかった)。
- 出典:
  - https://www.reddit.com/r/leagueoflegends/comments/lybp2p/ugg_has_lp_per_game_on_their_profiles
  - https://blogoflegends.com/2020/01/10/league-of-legends-stats-carry/4
- **[未確認]** U.GG Carry Score の式。
- 参考: Gamercraft Score は**固定の閾値を使わず、同じ試合の他者と比較する**と明記している(配点は KDA 25点、Vision 10点、サポートの Vision は20点、など)。 https://help.gamercraft.com/hc/help-center/articles/1742824034-gamercraft-scoring-system-faq

### 1.5 プロの分析指標(Oracle's Elixir、gol.gg、LoL Esports)

**Oracle's Elixir の定義一覧 [確認済]**
- 対面との差: GD@10/15、CSD、XPD
- 与ダメ: DPM、Dmg%(チームの与ダメに占める割合)
- ゴールド: EGPM(初期ゴールドと自然増加を除いた獲得ゴールド/分)、Gold%、GSPD(消費ゴールドの割合差)
- 占有: LNE%(レーン CS の占有率)、JNG%
- 視界: WPM、CWPM、WCPM、WC%
- 序盤: FB%、FBP、K+A@15、D@15
- 評価値: **EGR(Early-Game Rating)と MLR(Mid/Late Rating)**
- TWL/TWD: ゴールド 52%以上(TWL)/48%未満(TWD)で過ごした時間の割合。league-analytics.com 由来。
- 出典:
  - https://lol.timsevenhuysen.com/statistics/lms/lms-2018-regionals-player-statistics (Oracle's Elixir 旧サイトの定義表)
  - https://oracleselixir.com/definitions (JS で描画されるため本文は取得できず)

**集計方法 [確認済]**
- Oracle's Elixir は WPM や Dmg% を**試合ごとに計算してから平均する**。長い試合の影響を下げるため。
- LCS の放送は全試合の合計を割るので、数値がずれる。サイトは、どちらも「正しい」「誤り」とは言えないと明記している。
- → 本プロジェクトでも**集計方法を1つに固定し、明記**するべき。
- 出典: https://oracleselixir.com/faq

**EGR と MLR [出典の要約]**
- EGR は 15:00 時点のゲーム状態から勝率を推定し、それを評価値として示す。目安は「15分時点の 320 ゴールド ≒ 勝率 4.0 ポイント」。
- MLR は 15 分以降の成績。
- 出典:
  - https://oracleselixir.com/blog/post/10689/early-game-rating-2-0
  - https://oracleselixir.com/blog/search/early-game%20rating/1
- **[未確認]** モデルの詳細(本文を取得できなかった)。

**gol.gg [出典の要約]**
- 選手ページを次の区分で表示する: Early game(15分時点で CS 先行の割合、CSD@15、GD@15、XPD@15、FB 参加・FB 被害)、Aggression(DPM、Dmg%、K+A/分、ソロキル)、Vision(VSPM、WPM、Control WPM、WCPM)、チャンピオンプール。
- 出典: https://gol.gg/players/player-stats/2662/season-ALL/split-ALL/tournament-ALL/champion-ALL

**LoL Esports の勝率予測(AWS)[確認済]**
- 入力: ゲーム時間、Gold%、チーム XP、生存人数、タワー、ドラゴン・ソウル、ヘラルド、インヒビター・バロン・エルダーのタイマーなど。
- 2020年以降のプロの試合で学習している。今後の課題として WPA(勝率寄与)を挙げている。
- 出典: https://lolesports.com/en-GB/news/dev-diary-win-probability-powered-by-aws-at-worlds

**LoL Esports Global Power Rankings(チーム単位)[確認済]**
- チーム Elo 80% とリーグ Elo 20% の加重平均を Power Score とする。地域をまたぐ試合が少ない問題を、リーグ Elo で補っている。
- 予測精度は約 65%(二次資料の数値)。
- 出典:
  - https://lolesports.com/en-SG/news/dev-diary-unveiling-the-global-power-rankings
  - https://www.gamespress.com/en-US/Introducing-LoL-Esports-Global-Power-Rankings-Powered-by-AWS
  - https://boostroyal.com/blog/global-power-rankings-in-esports-the-rating-system-explained

### 1.6 個人へのレーティング適用(Elo / Glicko / TrueSkill / 学術モデル)

**PandaSkill(arXiv 2501.10049)[確認済]**
- データ: プロの 37,388 試合、4,927 選手。
- 特徴量: 選手ごとに 15 個。
  - KLA = (K+A)/(D+1)
  - GPM、XPM、CSPM、WPM
  - キル総数で正規化した与ダメ・被ダメ、ゴールドあたりの与ダメ
  - 最大マルチキル
  - **worthless death 比**: 死んでから1分以内に、味方が敵を倒さず、オブジェクトも取らなかった死の割合
  - free kill 比
  - オブジェクト争奪の勝率と敗率
  - **チーム単位の指標とチーム内シェアでの正規化は使っていない。**
- 算出: **ロールごとに別のモデル**(XGBoost、単調性制約つき)で勝率を予測し、それを**ロール内のパーセンタイル(0〜100)に変換**する。これで全ロールが共通の尺度になる。
- レーティング: OpenSkill(μ の初期値 25、σ の初期値 25/3)。更新には試合の勝敗ではなく PScore の順位を使うので、負けた試合でも上がり得る。
- 表示: **保守的な下限 μ−3σ** を表示する。試合数が少ないと σ が大きく、表示値は低くなる。地域を移ると σ を初期値に戻す。
- 検証: 専門家(オッズトレーダー)の判断との一致率は 80.6%。専門家が全員一致した組では 89.0%。
- 出典: https://arxiv.org/html/2501.10049v1

**SIDO モデル(arXiv 2403.04873)[確認済]**
- データ: **ソロキュー**。NA/EUW/KR の GM・Challenger のうち LP 上位1,000、パッチ 13.14〜13.18。
- 考え方: ゴールドと与ダメを、本人の分(Self)、味方への波及(Indirect)、敵の抑制(Denial)の3つに分ける。
- 推定: **ベイズ階層回帰**で、選手のランダム効果とチャンピオンのランダム効果を推定する。ロール・地域ごとに別モデルを作り、7/15/25分の時点の値を使う。
- 少数サンプル: **1 ロールあたり 50 試合以上**を条件にし、試合数の少ない選手は階層ベイズで平均の側へ縮小する。
- 検証: プロのアカウントは、全ロールで非プロより高く出た。差は 0〜15分で大きく、15〜25分では小さい。比較対象の Plus-Minus では区別できなかった。
- 限界:
  - 味方・敵への効果はノイズが大きく、中位の選手どうしの順位付けが難しい。→ 論文は**連続値ではなく「高い正の影響」のようなカテゴリで示す**ことを推奨している。
  - 2 つの期間で共通するアカウントは 17〜22% と少ない。
  - ソロキューは大会ほど協調しないので、味方への効果が小さく出る可能性がある。
- ソロキューを使う利点として論文は2点を挙げる: 試合数が多いこと。味方の組み合わせが半ばランダムなので、成果を個人に帰属させやすいこと。大会では JG が bot に頻繁に通うとボットの GD が上がり、誰の成果かを分けにくい。
- 出典: https://arxiv.org/html/2403.04873v2

**TrueSkill [確認済]**
- 選手ごとに μ と σ を持ち、チーム戦に対応する。表示値は μ−3σ(下位1%点)。
- Elo と Glicko はもともと 2 者の対戦向けで、チーム戦では個人を区別できない。
- TrueSkill2 は撃破数などの個人指標も使う(PandaSkill 論文による説明)。
- 出典:
  - http://papers.neurips.cc/paper/3079-trueskilltm-a-bayesian-skill-rating-system.pdf
  - https://en.wikipedia.org/wiki/TrueSkill

**その他 [出典の要約]**
- チームの技能を個人からまとめる方法(SUM/MAX/MIN)を比べた研究では、LoL を含めて MAX(最強の1人で代表させる)が最もよく予測した。強い1人が勝敗を左右しやすいことを示す。 https://ieee-cog.org/2021/assets/papers/paper_158.pdf
- 講演(YouTube)では、勝敗だけを使う TrueSkill だと、5v5 で良い推定を得るのに約 50 試合かかると述べている。 https://www.youtube.com/watch?v=VnOVLBbYlU0
  - **[未確認]** 一次資料ではない。
- Vantage Sports(Maymin)は smart kills と worthless deaths を定義した。一人の寄与だけから作った評価が勝利と強く相関したと報告している。 https://nessis.org/nessis17/Maymin.pdf

### 1.7 ランク(MMR)
- **[確認済]** Riot 公式の説明:
  - MMR は非公開。
  - MMR が総合的な技能を表し、ランクはその潜在力へ向かう途中の位置を表す。
  - LP は、MMR とランクの関係が表に出たもの。
  - 出典: https://support.riotgames.com/en-us/league-of-legends/gameplay/mmr-rank-and-lp
- **[出典の要約]** 二次資料による説明:
  - MMR はアカウント単位で、ロール別・チャンピオン別には持たない。ソロとフレックスは別。
  - API では取得できない。
  - スプリットごとに圧縮される。
  - 出典: https://boostingmarket.com/blogs/lol-mmr-vs-lp-explained
  - **[未確認]** これらの詳細。

---

## 2. 候補軸ごとの代理指標と限界

前提 **[確認済]**: match-v5 の `challenges` の多くは、公式の説明が無い。
- `laningPhaseGoldExpAdvantage`、`earlyLaningPhaseGoldExpAdvantage`、`maxCsAdvantageOnLaneOpponent`、`maxLevelLeadLaneOpponent`、`visionScoreAdvantageLaneOpponent` など 27 項目は、ドキュメントに記載が無い。
- `killParticipation`、`teamDamagePercentage`、`damagePerMinute` など 12 項目は、型が int と書かれているが実際は float。
- この問題は Riot 側で「escalated」のまま解決していない。
- 出典:
  - https://github.com/RiotGames/developer-relations/issues/928
  - https://github.com/RiotGames/developer-relations/issues/754
- **[未確認]**
  - `laningPhaseGoldExpAdvantage` が 0/1 の真偽値か連続値か。
  - 「レーン戦の終わり」が何分の時点か。
  - 「対面」をどう判定しているか(`teamPosition` に依存するか)。
- **[設計提案]** 手元のデータで値の分布(ユニーク値と範囲)を確かめてから使う。意味が確定しない項目は、重みを下げるか使わない。

| 軸 | 妥当な代理指標(challenges/participant) | なぜ妥当か | 測れないこと・過大解釈の危険 |
| --- | --- | --- | --- |
| メカニクス | `soloKills`、`outnumberedKills`、`skillshotsHit`/`skillshotsDodged`、`damagePerMinute`(ロール内で比較)、`kda` の一部、`enemyChampionImmobilizations` | 1v1 や人数不利での撃破は個人技の色が強い。GPI も Duels と Skirmishes を分けている | スキルショット数はチャンピオン依存が極端で、スキルショットの無いチャンピオンでは 0 になる。ソロキルは対面の弱さやランク差にも左右される。**チャンピオン別・ロール別に正規化しないと「ヨネ使いはメカが高い」という結果になる** |
| レーン戦 | `laningPhaseGoldExpAdvantage`、`earlyLaningPhaseGoldExpAdvantage`、`maxCsAdvantageOnLaneOpponent`、`maxLevelLeadLaneOpponent`、`laneMinionsFirst10Minutes`、`turretPlatesTaken`、`soloKills`、`visionScoreAdvantageLaneOpponent` | プロ分析の中核は GD/CSD/XPD@15(対面との差)。対面との差は**同じ試合・同じ MMR 帯の相手との比較**なので、試合の難しさが自動で揃う | JG の介入で歪む(SIDO 論文が明記)。`max〜` 系は**最大値**なので一瞬の優位を拾い、最終的な状態を表さない。サポートと JG では「対面」の意味が違う。カウンターピックの影響を受ける |
| 集団戦 | `killParticipation`、`teamDamagePercentage`、`damageTakenOnTeamPercentage`、`effectiveHealAndShielding`、`enemyChampionImmobilizations`、`saveAllyFromDeath`、`pickKillWithAlly` | GPI の Teamfights・Picks や、PandaSkill のキル数で正規化した与ダメに相当する | 試合のまとめの値だけでは集団戦と小競り合いを区別できない(timeline の位置と時刻が要る)。タンクやエンチャンターの価値は与ダメに出ない。与ダメは安全な位置からのポークでも増える |
| 視界 | `visionScorePerMinute`、`visionScoreAdvantageLaneOpponent`、`controlWardsPlaced`、`wardTakedowns`、`wardsPlaced` | Vision score は自分の ward が生きていた時間と、相手の ward を除去して奪った時間から計算される(Wiki)。プロも VSPM、WPM、WCPM を使う | **量は測れるが、質(置き場所やタイミング)は測れない**。サポートは構造的に高く出る。ロール内で比べないと、サポート全員の視界が 9 点になる |
| オブジェクト/マクロ | `dragonTakedowns`、`baronTakedowns`、`riftHeraldTakedowns`、`turretTakedowns`、`epicMonsterSteals`、`scuttleCrabKills`、`enemyJungleMonsterKills`(JG)、`takedownsFirstXMinutes`、TP 関連 | オブジェクトへの**参加**は記録される | **判断の良し悪しは測れない**。参加数はチームの強さ、試合時間、勝敗に強く左右される(勝った試合ほど多く取る)。誰が呼んだか、ローテーションの意図は記録に無い。DEEPLOL への取材の通り、結果から付ける評価は表に出ない仕事を過小評価する |
| チャンピオンプールとメタ適合 | 直近 N 試合のチャンピオンの種類数と偏り、`championMastery`(別の API)、チャンピオン別勝率(縮小推定つき) | チャンピオンの熟練度が勝率の強い予測因子だとする分析がある(YouTube。一次資料は未確認) | ソロキューで強いピックと大会のメタは別物(Katarina の例)。使ったチャンピオンが多いことは上手さを意味しない(試しに使っただけの場合がある) |
| 安定性/一貫性 | 試合間の分散(ロール内 z 値の標準偏差)、下位四分位、負けた試合での指標 | GPI の Consistency も試合間の分布から作っている | 試合数が少ないと、分散の推定そのものが不安定になる(**分散は平均より多くのサンプルを要する**)。対戦相手の幅によっても変わる |
| 調子/成長 | 直近 K 試合と過去との差、LP の推移、ランク履歴(シーズン別) | 時系列の差を見る | 偶然のばらつきと区別しにくい。数十試合程度の差は、多くが偶然の範囲に収まる。パッチの変更の影響と混同しやすい |
| 大会経験 | 過去の大会の戦績(出場回数、成績、役割)、Clash など | 5人固定のチームでの実績で、ソロキューとは性質の違うデータ | 大会(カスタムゲーム)の試合は match-v5 で取れないことが多い。経験年数は強さを意味しない |
| コール/リーダーシップ | **match-v5 に直接の指標は無い** | — | ping 系のフィールド(`allInPings` など)はあるが、ping の量は指示の質を表さない。煽りの ping も数に入る。KP やオブジェクト参加から推すのは**誤り**(コールしない上手な JG でも高く出る) |

### 2.1 「マクロ」「コール」をデータでどこまで言えるか
- **[確認済の根拠]**
  - Clemson の研究によると、チームワークでは言葉による指示より**暗黙の協調(tacit coordination)**の役割が大きい。
  - 同研究では、リーダー(shot caller、コーチ、複数のリーダー)の役割を2つ挙げている: 決定を速く伝えること。チームが戦略をどう考えるかを形づくること。
  - どちらもログの数値には現れない。
  - 出典:
    - https://guof.people.clemson.edu/papers/esports21.pdf
    - https://joseph.seering.org/papers/Lee_et_al_2025_League_Team_Trust.pdf (CHI '25。ソロキューでのコミュニケーション)
- **[確認済]** Mobalytics GPI も、学術の SIDO と PandaSkill も、**マクロ判断とコールを数値の軸にしていない**。SIDO は、味方への効果はノイズが大きく連続値には向かないと結論している。
- **[設計提案]**
  1. **コールは定性の根拠を必須にする。**
     - 根拠の例: 配信での発言、大会の公式紹介、本人やチームの発言、調査資料。URL と日付を付ける。
     - 根拠の無い選手は**「不明」と表示**する(数値を出さないか、グレーの点線にする)。
     - 根拠が無いのに中央値の 5.0 を入れると、「コールできないのに 5」という違和感が出る。
  2. **根拠がある場合も段階で持つ。**
     - 段階の例: 主コール/サブ/コールしない/不明。
     - 数値はその段階から決め、データによる微調整は段階の中だけで行う。
  3. **マクロは、データによる部分と定性による部分を分ける。**
     - データの部分は2つに留める:
       - オブジェクト参加を、チームが取った数で割った**参加率**にする(取った数ではなく、チームが取ったうち何割に居合わせたか)。
       - JG なら `enemyJungleMonsterKills`、スカトル、`takedownsFirstXMinutes`。
     - **データだけで出せる値に上限を設ける**(例: データだけでは 8 以上にしない)。
     - 上位の帯(例: 7.5 以上)は、定性の根拠がある場合だけ許す。
  4. **表示**
     - データ由来の軸と定性由来の軸を、色や線種で区別する。
     - 各値に「根拠: データ n 試合 / 定性 資料名」を付ける。
  5. **位置情報を使う場合**
     - match-v5 の **timeline** を使う。1分ごとの participantFrames の position とイベントから、ローテーションやオブジェクト前の集合を測れる。
     - **[未確認]** ストリーマーの少ない試合数で有意な差が出るかは不明。
     - 研究例: https://www.sciencedirect.com/science/article/pii/S2451958825001332 (rotation score。本文は未確認)

---

## 3. ソロキュー統計を大会(5人固定)へ写すときの注意

**資料の知見**
- **[確認済]** SIDO 論文:
  - ソロキューは試合数が多く、味方の組み合わせが半ばランダムなので、成果を個人に帰属させやすい。
  - 大会では決まった連携(JG が bot に通うなど)があり、個人の数値に他人の成果が混ざる。
  - ソロキューは大会ほど協調しないので、味方への効果が小さく出る可能性がある。
  - 出典: https://arxiv.org/html/2403.04873v2
- **[出典の要約]** iTero:
  - 多くのチャンピオンで、ソロキューの勝率とプロの勝率に明確な相関が無い。例: パッチ12.8の Gwen はソロキューで 50%、MSI で 67%。
  - ただし、一貫した倍率を持つチャンピオンもある。
  - **レートが高いほど、ソロキューの試合はプロに近い。**
  - 出典:
    - https://www.itero.gg/articles/sq-data
    - https://medium.com/the-esports-analyst-club-by-itero-gaming/can-solo-queue-data-be-used-for-professional-play-esports-8731ede07fb7
- **[出典の要約]** ソロキュー向けのチャンピオン(Katarina など)は、連携で潰されやすいので大会では使われにくい。 https://dignitas.gg/articles/the-difference-between-pro-play-and-solo-queue
- **[出典の要約]** チームの強さは MAX 集約(最強の1人)がよく予測した(ソロキューでの結果)。 https://ieee-cog.org/2021/assets/papers/paper_158.pdf
  - **[設計提案]**(推論): 大会ではロールの補完やコールが効くので、この性質はそのまま当てはまらない可能性がある。

**注意点のまとめ [設計提案]**
1. **ロールの違い**: 本番のロールと直近の試合のロールが違う選手は、本番のロールの試合だけで計算する。試合数が足りなければ縮小を強める。別のロールの値で埋めない。
2. **サンプル数**: SIDO は 1 ロール 50 試合以上を条件にした。ストリーマーは 20〜30 試合も珍しくないので、縮小推定と「信頼度」の表示が必須。
3. **古い試合**: パッチやシーズンで状況が変わるので、時間減衰を掛ける(例: 半減期 60〜90 日)。対象期間より古い試合しか無い選手には「データが古い」と表示する。
4. **キューの種類**: ソロ、フレックス、ノーマルを混ぜない。フレックスは固定メンバーの影響を受ける。
5. **ランク帯の違い**: Iron の 10 ソロキルと Master の 10 ソロキルは別物。指標は**同じ試合の対面や、同じ MMR 帯との差**で取り、ランクでアンカーする(次章)。
6. **大会でのチームとしての効果**: シミュレーションのチームの強さは、個人の評価の単純な合計にしない。ロールの補完やコール役の有無は別の項目で扱う。

---

## 4. 信頼性を担保する設計の原則

**1. 少数サンプルの縮小(empirical Bayes)**
- **[確認済]** 母集団から事前分布を推定し、各選手の観測値をそこへ寄せる手法。
  - 打率の例: 1000 打数 300 安打 → 0.29 と推定。10 打数 4 安打 → 0.264 と推定。
  - 4/10 は 300/1000 より高いが、後者の打者のほうが上と推定する。
- 出典:
  - http://varianceexplained.org/r/empirical_bayes_baseball
  - https://kiwidamien.github.io/shrinkage-and-empirical-bayes-to-improve-inference.html
- **[設計提案]**
  - 推定値 = (n × 観測平均 + k × 事前平均) / (n + k)
  - k は指標ごとの「値が安定するのに要る試合数」。
  - 事前平均は**同じランク帯・同じロールの平均**にする(ランクによるアンカー)。
  - SIDO と PandaSkill も、階層ベイズや σ で同じことをしている。

**2. ランク(MMR)によるアンカー**
- **[確認済]** Riot は、MMR が総合的な技能を表し、ランクはその途中の位置を表すと説明している。 https://support.riotgames.com/en-us/league-of-legends/gameplay/mmr-rank-and-lp
- **[設計提案]**
  - 各軸の事前平均と上限をランクで決める。例: ランクごとに「軸の期待値の帯」を作り、試合データはその帯の中での位置だけを動かす。
  - これで次のような結果を防げる: ランクの高い選手が試合データの偶然で全軸 3 点台になる。ランクの低い選手が 9 点台になる。
  - ランクは「現在」と「シーズン最高」の両方を見る。休止明けで現在のランクが低い選手に引きずられないようにするため。

**3. 同じ試合の対面との比較で相対化する**
- **[確認済]**
  - プロの指標の中心は対面との差(GD/CSD/XPD@15)。
  - OP.GG の MVP/ACE と Gamercraft は、同じ試合の他者と比べている。
- **[設計提案]**
  - challenges の `〜LaneOpponent` 系と `laningPhaseGoldExpAdvantage` 系を優先して使う。
  - 絶対量(DPM など)は、同じ試合で敵の同じロールとの比をとるか、チーム内シェアで扱う。

**4. ロール内での正規化**
- **[確認済]**
  - PandaSkill はロール別のモデルとロール内パーセンタイルを使う。
  - DEEPLOL はサポートが低く出ると認めている。
- **[設計提案]**
  - すべての軸を、同じロール(必要ならチャンピオンの類型)の参照分布に対するパーセンタイルに直し、0〜10 に変換する。
  - 参照分布は、自前で集めた同じランク帯の試合から作る。
  - 60 選手どうしの相対だけで決めてはいけない。全員が弱くても誰かが 10 になってしまう。

**5. 外れ値の扱い**
- **[設計提案]**
  - 試合ごとの値をロール内の z 値にしてから、**ウィンザー化**(例: ±2.5σ で切る)するか、中央値やトリム平均を使う。
  - 次の試合は除外する:
    - リメイク、早期降参、AFK のあった試合(challenges の `gameEndedInEarlySurrender` と `hadAfkTeammate` で判別できる。ただしフィールドの意味の公式説明は足りない: https://github.com/RiotGames/developer-relations/issues/818 )
    - 試合時間で割る指標では、15 分未満の試合

**6. 集計方法の固定**
- **[確認済]** Oracle's Elixir は試合ごとの値の平均、放送は総和の比を使い、数値に差が出る。
- → どちらかに固定し、明記する。

**7. 不確かさの表示**
- **[確認済]**
  - TrueSkill と PandaSkill は、保守的な値 μ−3σ を表示する。
  - SIDO は、ノイズの大きい指標はカテゴリで示すことを推奨している。
- **[設計提案]**
  - レーダーに信頼度(試合数、データの新しさ、定性の根拠の有無)を併記する。
  - 信頼度の低い軸は「−」と表示するか、中央に寄せた値を点線で描く。

**8. 妥当性検査(既知の事実との突き合わせ)**
- **[確認済]**
  - SIDO は、プロのアカウントが高く出るかどうかで検証した。
  - PandaSkill は、専門家の判断との一致率で検証した。
- **[設計提案]**
  - (a) ランクの順位と総合値の順位の相関を確かめる。大きく外れる選手は個別に点検する。
  - (b) 「周知の事実」のリストを作る。例: 大会でコール役と言われる選手、JG のローテーションが上手いと評判の選手、メカニクスが売りの選手。結果が事実と逆なら、式を疑う。
  - (c) 各軸の値ごとに「最も効いた生データの上位3つ」を出し、なぜその値になったかを説明できるようにする。
  - (d) **ガードレール**を置く。例: 定性の資料で「コールしない」とされた選手は、コール軸に上限を設ける。データの試合数が閾値に満たない軸は、中央へ寄せる。
  - (e) 公開前に、人が 60 人全員の表を目で確認する工程を必須にする(作者による確認)。

**9. 軸どうしの二重計上を避ける**
- **[設計提案]**
  - KP、オブジェクト参加、与ダメは、どれも勝敗と強く相関する。そのため勝率の高い選手は全軸で高く出やすい(ハロー効果)。
  - 対策の例:
    - 勝ち試合と負け試合で別々に平均してから合わせる。
    - 勝敗で説明できる部分を除いた残差を使う。

---

## 5. 未確認事項の一覧
- Mobalytics GPI の現行の領域名(Teamplay と Objectives、Toughness と Survivability のどちらか)と、式・重み。
- OP Score、DEEPLOL AI Score、U.GG Carry Score の式と重み(いずれも非公開)。
- Oracle's Elixir EGR 2.0 のモデルの詳細(本文を取得できなかった)。
- match-v5 challenges の各項目の意味(公式ドキュメントに記載が無い)。とくに `laningPhaseGoldExpAdvantage` の値域と基準時刻、「対面」の判定方法。
- 勝敗だけを使う TrueSkill が 5v5 で約 50 試合で収束するという数値(講演での発言のみ)。
- ソロキューの個人指標が大会の成績をどの程度予測するかの定量研究。個人単位の研究は見つけられず、見つかったのはチャンピオン勝率の比較だけ。
