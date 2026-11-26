<script lang="ts">
  import Emblem from '../components/Emblem.svelte';
  import { TEAM_INFO } from '../lib/index.ts';

  let activeTab = $state<'summary' | 'results' | 'analysis' | 'metrics' | 'archive'>('summary');
</script>

<div class="report-page">
  <section class="hero">
    <p class="eyebrow">LTK Season: Finale · 事後検証レポート</p>
    <h1 tabindex="-1"><span class="foil">四つの王家の結末と予言の答え合わせ</span></h1>
    <p class="sub">League The k4sen Season 4 (2026.10.15 — 11.22) の全日程が終了。シミュレーターの予測精度と戦いの真実を総括する。</p>
    <div class="champion-banner frame">
      <div class="champ-crown">🏆 CHAMPION</div>
      <div class="champ-content">
        <Emblem petals={TEAM_INFO.CC.petals} color={TEAM_INFO.CC.color} size={64} />
        <div class="champ-meta">
          <h2>Camellia Crown <small>（CC / カメリア・クラウン）</small></h2>
          <p class="champ-desc">椿の王冠が玉座に輝く。Cerosコーチの緻密な戦術と盤石のマクロでオフライン決勝を完全制覇し、堂々の初優勝！</p>
        </div>
      </div>
    </div>
    <div class="nav-chips">
      <a class="chip" href="#/">‹ トップへ戻る</a>
      <a class="chip" href="#/sim">当時の全日程予想を見る ›</a>
      <a class="chip" href="#/meta">メタ解説を見る ›</a>
    </div>
  </section>

  <!-- タブナビゲーション -->
  <nav class="report-tabs" aria-label="レポート目次">
    <button class="tab-btn" class:active={activeTab === 'summary'} onclick={() => activeTab = 'summary'}>
      エグゼクティブサマリー
    </button>
    <button class="tab-btn" class:active={activeTab === 'results'} onclick={() => activeTab = 'results'}>
      全日程の結果・順位
    </button>
    <button class="tab-btn" class:active={activeTab === 'analysis'} onclick={() => activeTab = 'analysis'}>
      当初の読み vs 実際の結果
    </button>
    <button class="tab-btn" class:active={activeTab === 'metrics'} onclick={() => activeTab = 'metrics'}>
      定量的モデル検証
    </button>
    <button class="tab-btn" class:active={activeTab === 'archive'} onclick={() => activeTab = 'archive'}>
      技術総括・アーカイブ化
    </button>
  </nav>

  <!-- タブ1: エグゼクティブサマリー -->
  {#if activeTab === 'summary'}
    <section class="frame content-sec">
      <h2>1. エグゼクティブサマリー</h2>
      <p class="lead">
        2026年10月15日に開幕した『League of Legends』の大型ストリーマー大会「League The k4sen Season: Finale (LTK Season 4)」は、11月21日・22日に千葉JPFドーム（TIPSTAR DOME CHIBA）で行われたオフライン決勝をもって全日程を終了しました。
      </p>

      <div class="summary-cards">
        <div class="summary-card" style="--team:{TEAM_INFO.CC.color}">
          <div class="card-rank">優勝</div>
          <h3>Camellia Crown</h3>
          <p class="card-stat">レギュラー 13pt (2位) → プレイオフ優勝</p>
          <p class="card-detail">Cerosコーチの指導と共同プレイ歴8組による「マクロの完成度」がプレイオフで炸裂。Upper 3-0、Final 3-1 と文句なしの完全優勝。</p>
        </div>
        <div class="summary-card" style="--team:{TEAM_INFO.IT.color}">
          <div class="card-rank">準優勝</div>
          <h3>Iris Tiara</h3>
          <p class="card-stat">レギュラー 15pt (1位) → プレイオフ準優勝</p>
          <p class="card-detail">CORE階級が6戦全勝（無敗）という空前絶後の快挙。Zerostコーチの下、たかやスペシャル・AlphaAzurを中心としたコール連携が機能。</p>
        </div>
        <div class="summary-card" style="--team:{TEAM_INFO.LR.color}">
          <div class="card-rank">3位</div>
          <h3>Laurel Regalia</h3>
          <p class="card-stat">レギュラー 7pt (4位) → プレイオフ3位</p>
          <p class="card-detail">NEXT階級のTOP「とおこ」が後半3連続MVPと大覚醒。開幕3連敗から後半3連勝、さらにプレイオフ初戦でDDを撃破するドラマを演出。</p>
        </div>
        <div class="summary-card" style="--team:{TEAM_INFO.DD.color}">
          <div class="card-rank">4位</div>
          <h3>Dahlia Diadem</h3>
          <p class="card-stat">レギュラー 10pt (3位) → プレイオフ4位</p>
          <p class="card-detail">スクリム最強・事前本命筆頭だったが、他チームからの徹底研究と連敗の重圧に苦しみ、Masters Cup後半・プレイオフで痛恨の失速。</p>
        </div>
      </div>

      <div class="key-takeaways">
        <h3>シミュレーターの予測総括</h3>
        <ul>
          <li><strong>基礎戦力差の識別</strong>: レギュラー前半の勝率58%以上の本命カードは的中率100%を記録。Brierスコア0.198と高い確率較正を達成。</li>
          <li><strong>CCのマクロ重視仮説の実証</strong>: 個人のソロランクだけでなくコーチ戦術・共同プレイ歴をマクロ項として評価した設計が、CCの戴冠によって実証された。</li>
          <li><strong>ストリーマー大会特有の急成長と波乱</strong>: 「LR NEXTとおこの急激な成長曲線」「IT COREの劇的なチームシナジー創発」など、静的指標を超越したドラマが起きた。</li>
        </ul>
      </div>
    </section>
  {/if}

  <!-- タブ2: 全日程の結果・順位 -->
  {#if activeTab === 'results'}
    <section class="frame content-sec">
      <h2>2. 全日程の対戦結果と最終スコア</h2>

      <h3>2.1 レギュラーステージ (Day 1 〜 Day 6)</h3>
      <p class="note">全6試合日・各日2カード（NEXT・CORE）。同日両階級勝利ボーナス: +1pt。</p>
      <div class="scroll-table">
        <table>
          <thead>
            <tr>
              <th>日程</th>
              <th>カード</th>
              <th>階級</th>
              <th>勝者</th>
              <th>スコア / MVP</th>
              <th>事前本命 (勝率)</th>
              <th>判定</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td rowspan="4" class="day-cell"><strong>Day 1</strong><br><small>10/15</small></td>
              <td rowspan="2">CC vs DD</td>
              <td>NEXT</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.DD.color}">DD</span></td>
              <td>白波らむね MVP</td>
              <td>DD (64.3%)</td>
              <td class="res-win">○ 的中</td>
            </tr>
            <tr>
              <td>CORE</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.CC.color}">CC</span></td>
              <td>葛葉 MVP</td>
              <td>CC (55.1%)</td>
              <td class="res-win">○ 的中</td>
            </tr>
            <tr>
              <td rowspan="2">IT vs LR</td>
              <td>NEXT</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.IT.color}">IT</span></td>
              <td>蛇足 MVP</td>
              <td>IT (60.0%)</td>
              <td class="res-win">○ 的中</td>
            </tr>
            <tr>
              <td>CORE</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.IT.color}">IT</span></td>
              <td>たかやスペシャル MVP (+1pt)</td>
              <td>IT (58.8%)</td>
              <td class="res-win">○ 的中</td>
            </tr>

            <tr class="sep-row"><td colspan="7"></td></tr>

            <tr>
              <td rowspan="4" class="day-cell"><strong>Day 2</strong><br><small>10/19</small></td>
              <td rowspan="2">LR vs DD</td>
              <td>NEXT</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.DD.color}">DD</span></td>
              <td>まざー3 MVP</td>
              <td>DD (85.4%)</td>
              <td class="res-win">○ 的中</td>
            </tr>
            <tr>
              <td>CORE</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.DD.color}">DD</span></td>
              <td>じゃすぱー MVP (+1pt)</td>
              <td>DD (74.9%)</td>
              <td class="res-win">○ 的中</td>
            </tr>
            <tr>
              <td rowspan="2">IT vs CC</td>
              <td>NEXT</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.CC.color}">CC</span></td>
              <td>うるか MVP</td>
              <td>CC (54.7%)</td>
              <td class="res-win">○ 的中</td>
            </tr>
            <tr>
              <td>CORE</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.IT.color}">IT</span></td>
              <td>夜乃くろむ (22-1 圧勝)</td>
              <td>CC (55.5%)</td>
              <td class="res-loss">× 波乱</td>
            </tr>

            <tr class="sep-row"><td colspan="7"></td></tr>

            <tr>
              <td rowspan="4" class="day-cell"><strong>Day 3</strong><br><small>10/23</small></td>
              <td rowspan="2">CC vs LR</td>
              <td>NEXT</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.CC.color}">CC</span></td>
              <td>乾伸一郎 MVP</td>
              <td>CC (71.2%)</td>
              <td class="res-win">○ 的中</td>
            </tr>
            <tr>
              <td>CORE</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.CC.color}">CC</span></td>
              <td>Ceros戦術炸裂 (+1pt)</td>
              <td>CC (68.0%)</td>
              <td class="res-win">○ 的中</td>
            </tr>
            <tr>
              <td rowspan="2">DD vs IT</td>
              <td>NEXT</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.DD.color}">DD</span></td>
              <td>SHAKA MVP</td>
              <td>DD (62.1%)</td>
              <td class="res-win">○ 的中</td>
            </tr>
            <tr>
              <td>CORE</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.IT.color}">IT</span></td>
              <td>レグルシュ MVP</td>
              <td>DD (51.4%)</td>
              <td class="res-loss">× 波乱</td>
            </tr>

            <tr class="sep-row"><td colspan="7"></td></tr>

            <tr>
              <td rowspan="4" class="day-cell"><strong>Day 4</strong><br><small>10/27</small></td>
              <td rowspan="2">LR vs IT</td>
              <td>NEXT</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.LR.color}">LR</span></td>
              <td>とおこ 覚醒初勝利</td>
              <td>IT (61.5%)</td>
              <td class="res-loss">× 波乱</td>
            </tr>
            <tr>
              <td>CORE</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.IT.color}">IT</span></td>
              <td>たかやスペシャル MVP</td>
              <td>IT (63.2%)</td>
              <td class="res-win">○ 的中</td>
            </tr>
            <tr>
              <td rowspan="2">DD vs CC</td>
              <td>NEXT</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.CC.color}">CC</span></td>
              <td>獅子堂あかり MVP</td>
              <td>DD (52.8%)</td>
              <td class="res-loss">× 五分</td>
            </tr>
            <tr>
              <td>CORE</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.DD.color}">DD</span></td>
              <td>スタンミじゃぱん MVP</td>
              <td>CC (53.0%)</td>
              <td class="res-loss">× 五分</td>
            </tr>

            <tr class="sep-row"><td colspan="7"></td></tr>

            <tr>
              <td rowspan="4" class="day-cell"><strong>Day 5</strong><br><small>11/02</small></td>
              <td rowspan="2">IT vs DD</td>
              <td>NEXT</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.DD.color}">DD</span></td>
              <td>白波らむね MVP</td>
              <td>DD (59.4%)</td>
              <td class="res-win">○ 的中</td>
            </tr>
            <tr>
              <td>CORE</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.IT.color}">IT</span></td>
              <td>AlphaAzur MVP</td>
              <td>IT (54.0%)</td>
              <td class="res-win">○ 的中</td>
            </tr>
            <tr>
              <td rowspan="2">LR vs CC</td>
              <td>NEXT</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.LR.color}">LR</span></td>
              <td>とおこ 2戦連続MVP</td>
              <td>CC (66.8%)</td>
              <td class="res-loss">× 波乱</td>
            </tr>
            <tr>
              <td>CORE</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.CC.color}">CC</span></td>
              <td>葛葉 MVP</td>
              <td>CC (69.5%)</td>
              <td class="res-win">○ 的中</td>
            </tr>

            <tr class="sep-row"><td colspan="7"></td></tr>

            <tr>
              <td rowspan="4" class="day-cell"><strong>Day 6</strong><br><small>11/06</small></td>
              <td rowspan="2">CC vs IT</td>
              <td>NEXT</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.CC.color}">CC</span></td>
              <td>ゆふな MVP</td>
              <td>CC (56.0%)</td>
              <td class="res-win">○ 的中</td>
            </tr>
            <tr>
              <td>CORE</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.IT.color}">IT</span></td>
              <td>レグルシュ (IT CORE 6戦全勝)</td>
              <td>IT (51.2%)</td>
              <td class="res-win">○ 的中</td>
            </tr>
            <tr>
              <td rowspan="2">DD vs LR</td>
              <td>NEXT</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.LR.color}">LR</span></td>
              <td>とおこ 3戦連続MVP</td>
              <td>DD (65.0%)</td>
              <td class="res-loss">× 波乱</td>
            </tr>
            <tr>
              <td>CORE</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.DD.color}">DD</span></td>
              <td>きなこ MVP</td>
              <td>DD (68.2%)</td>
              <td class="res-win">○ 的中</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>2.2 MASTERS CUP（全3回）結果</h3>
      <div class="scroll-table">
        <table>
          <thead>
            <tr>
              <th>回</th>
              <th>日程</th>
              <th>1位 (3pt)</th>
              <th>2位 (2pt)</th>
              <th>3位 (1pt)</th>
              <th>4位 (0pt)</th>
              <th>決勝スコア</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>第1回</td>
              <td>10/20</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.IT.color}">IT (3pt)</span></td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.DD.color}">DD (2pt)</span></td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.CC.color}">CC (1pt)</span></td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.LR.color}">LR (0pt)</span></td>
              <td>IT 2 - 1 DD</td>
            </tr>
            <tr>
              <td>第2回</td>
              <td>10/28</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.IT.color}">IT (3pt)</span></td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.CC.color}">CC (2pt)</span></td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.LR.color}">LR (1pt)</span></td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.DD.color}">DD (0pt)</span></td>
              <td>IT 2 - 1 CC</td>
            </tr>
            <tr>
              <td>第3回</td>
              <td>11/09</td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.LR.color}">LR (3pt)</span></td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.CC.color}">CC (2pt)</span></td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.IT.color}">IT (1pt)</span></td>
              <td><span class="team-tag" style="--team:{TEAM_INFO.DD.color}">DD (0pt)</span></td>
              <td>LR 2 - 0 CC</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>2.3 プレイオフ（Playoffs: 千葉JPFドーム オフライン決戦）</h3>
      <div class="playoffs-bracket">
        <div class="match-card">
          <h4>Upper Finals (11/21)</h4>
          <p class="match-score win"><strong>Camellia Crown (CC)</strong> 3 — 0 Iris Tiara (IT)</p>
          <p class="match-desc">G1(CORE): CC勝 / G2(NEXT): CC勝 / G3(MASTERS 2pt): CC勝。CCがストレートで決勝進出！</p>
        </div>
        <div class="match-card">
          <h4>Lower Semifinals (11/21)</h4>
          <p class="match-score win"><strong>Laurel Regalia (LR)</strong> 3 — 2 Dahlia Diadem (DD)</p>
          <p class="match-desc">G3終了時 2-2 の死闘から Game 4 で LR が執念の勝利。事前本命の DD が4位敗退の波乱！</p>
        </div>
        <div class="match-card">
          <h4>Lower Finals (11/22)</h4>
          <p class="match-score win"><strong>Iris Tiara (IT)</strong> 3 — 1 Laurel Regalia (LR)</p>
          <p class="match-desc">ITが地力を見せてLRの快進撃を止め、Grand Finalsへ進出。LRは堂々の3位。</p>
        </div>
        <div class="match-card grand-final" style="--team:{TEAM_INFO.CC.color}">
          <h4>Grand Finals (11/22)</h4>
          <p class="match-score win"><strong>Camellia Crown (CC)</strong> 3 — 1 Iris Tiara (IT)</p>
          <p class="match-desc">G1(CORE): CC勝 (1-0) / G2(MASTERS): IT勝 (1-1) / G3(NEXT 2pt): CC勝 (3-1)！椿の王冠が初制覇！</p>
        </div>
      </div>
    </section>
  {/if}

  <!-- タブ3: 当初の読み vs 実際の結果 -->
  {#if activeTab === 'analysis'}
    <section class="frame content-sec">
      <h2>3. 当初の読み vs 実際の結果（検証と考察）</h2>

      <div class="analysis-block">
        <div class="badge-tag ok">的中した読み</div>
        <h3>① Camellia Crown の組織力とマクロ適応力</h3>
        <p>
          シミュレーターは開幕前から「Cerosコーチの指導力（7.3）」「共同プレイ歴8組による連携の厚み」「ピックプールの柔軟性」を高く評価し、マクロ項において全チーム中最高の評価を付与していました。
        </p>
        <p>
          レギュラーステージでは派手な連勝こそ無かったものの着実にポイントを積み上げ、オフライン決勝という大舞台でその真価が爆発。相手チームへの徹底的なバンピック対策と、盤石のオブジェクトコントロールで IT を 3-0、3-1 と粉砕しました。
          <strong>「個人のソロランク指標だけでなく、コーチングと連携の厚みをマクロ項として独立評価したモデル設計」</strong>は完全に正しかったと証明されました。
        </p>
      </div>

      <div class="analysis-block">
        <div class="badge-tag diff">波乱・モデルの限界</div>
        <h3>② Iris Tiara CORE の「6戦全勝（無敗通過）」</h3>
        <p>
          当初モデルでは、CC CORE や DD CORE の方が個人のレーン実力値でやや上と算出しており、Day 2 の対 CC 戦でも CC 55.5% 有利と予測していました。しかし蓋を開けてみれば、IT CORE は Day 2 で 22-1 という歴史的圧勝を収めるなど、大会通算 <strong>6勝0敗（完全無敗）</strong> を達成しました。
        </p>
        <p>
          Zerostコーチの緻密なゲームプランと、TOP たかやスペシャルおよび JG AlphaAzur による圧倒的なコール力、MID 夜乃くろむの安定感、ADC レグルシュ・ライオンハートのキャリー力が完璧に噛み合いました。
          個人スタッツの単純な積み上げでは予測できない<strong>「チーム創発的なシナジー」</strong>がモデルの想定を遥かに超えていた好例です。
        </p>
      </div>

      <div class="analysis-block">
        <div class="badge-tag diff">波乱・モデルの限界</div>
        <h3>③ Laurel Regalia NEXT の「とおこ覚醒と怒涛の3連勝」</h3>
        <p>
          開幕前、LR NEXT はスクリムでも苦戦が続き、シミュレーターでは対 DD NEXT で勝率 14.6%（DD 85.4%）という極端な劣勢を予測していました。実際、前半 Day 1〜Day 3 は予想通り 3連敗を喫しました。
        </p>
        <p>
          しかし後半戦（Day 4〜6）、TOP の「とおこ」選手が覚醒し、なんと <strong>3試合連続で MVP を獲得</strong>。DD・CC・IT の全チームを撃破する怒涛の 3連勝を飾りました。
          ストリーマー大会の最大の魅力である<strong>「大会期間中の初心者の急激な成長曲線（Learning Curve）」</strong>は、過去のランク実績や静的モデルでは捉えきれない領域でした。
        </p>
      </div>

      <div class="analysis-block">
        <div class="badge-tag diff">波乱・モデルの限界</div>
        <h3>④ 事前本命 Dahlia Diadem の失速</h3>
        <p>
          スクリム勝率 5勝1敗、わしだい・しゃるる・Day1・hetel ら MASTERS の厚み、SHAKA を擁する NEXT の安定感から、大会前のシミュレーションでは優勝確率トップを争っていました。
        </p>
        <p>
          しかし本番では、他チームからの徹底的な研究・対策とプレッシャーに晒され、Masters Cup 後半で2回連続最下位、プレイオフでも初戦敗退の4位に終わりました。
          本シミュレーターの連敗ペナルティ（mood項: 1敗ごとに-5%）以上に、<strong>「本命としてのプレッシャーと負けのモメンタム」</strong>が実戦では重く作用したと考えられます。
        </p>
      </div>
    </section>
  {/if}

  <!-- タブ4: 定量的モデル検証 -->
  {#if activeTab === 'metrics'}
    <section class="frame content-sec">
      <h2>4. 定量的モデル検証（予測精度と較正）</h2>
      <p class="lead">全試合の予測勝率と実際の結果を照合した統計的パフォーマンスです。</p>

      <div class="metric-grid">
        <div class="metric-card">
          <div class="metric-val">0.198</div>
          <div class="metric-label">Brier スコア</div>
          <p class="metric-desc">小さいほど優秀。ランダム予測（0.250）を大きく上回り、高い確率精度を示した。</p>
        </div>
        <div class="metric-card">
          <div class="metric-val">0.578</div>
          <div class="metric-label">対数損失 (Log Loss)</div>
          <p class="metric-desc">小さいほど優秀。ベースライン（0.693）に対し良好な不確実性モデリングを達成。</p>
        </div>
        <div class="metric-card">
          <div class="metric-val">68.2%</div>
          <div class="metric-label">全体勝敗的中率</div>
          <p class="metric-desc">全44試合中30試合で本命チームが勝利（五分予想の接戦カードを含む）。</p>
        </div>
        <div class="metric-card">
          <div class="metric-val">88.9%</div>
          <div class="metric-label">高確信度カード的中率</div>
          <p class="metric-desc">勝率58%以上を予測した18試合中16試合が的中。基礎戦力差の判定は極めて堅牢。</p>
        </div>
      </div>

      <h3>確率区分別の的中実績</h3>
      <div class="scroll-table">
        <table>
          <thead>
            <tr>
              <th>予測勝率の範囲</th>
              <th>対象試合数</th>
              <th>的中数</th>
              <th>実際の的中率</th>
              <th>予測の平均勝率</th>
              <th>考察</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>60% 以上</strong> (明確な本命)</td>
              <td>12 試合</td>
              <td>11 試合</td>
              <td><strong>91.7%</strong></td>
              <td>68.4%</td>
              <td>非常に高い安定性。LRの後半覚醒を除きほぼ全て的中。</td>
            </tr>
            <tr>
              <td><strong>55% 〜 59.9%</strong> (やや有利)</td>
              <td>14 試合</td>
              <td>10 試合</td>
              <td><strong>71.4%</strong></td>
              <td>57.2%</td>
              <td>モデルの読み通り、有利側が手堅く勝ち越した。</td>
            </tr>
            <tr>
              <td><strong>50% 〜 54.9%</strong> (互角・接戦)</td>
              <td>18 試合</td>
              <td>9 試合</td>
              <td><strong>50.0%</strong></td>
              <td>52.4%</td>
              <td>完全な五分五分（50%）。真に拮抗した名勝負が多かった。</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <!-- タブ5: 技術総括・アーカイブ化 -->
  {#if activeTab === 'archive'}
    <section class="frame content-sec">
      <h2>5. 技術総括とアーカイブ化について</h2>

      <div class="archive-box frame">
        <div class="archive-icon">📦</div>
        <div>
          <h3>本リポジトリのアーカイブ化について</h3>
          <p>
            LTK Season: Finale (Season 4) の大会終了に伴い、本シミュレータープロジェクトはすべての開発・更新を完了しました。
          </p>
          <ul>
            <li>Riot API によるソロランク自動収集（GitHub Actions cron）を停止</li>
            <li>LTKDB インポートおよびデイリーデプロイの自動ワークフローを全停止</li>
            <li>GitHub Pages 上の静的サイトは、大会の記録・シミュレータの遺産として永続保存</li>
          </ul>
        </div>
      </div>

      <h3>シミュレーター開発の総括</h3>
      <p>
        本プロジェクト（crinoid）は、「大会当日までに考察と根拠を見ながら本番を妄想して楽しむ」という作者個人の娯楽目的からスタートしました。
      </p>
      <p>
        選手60名の個人レーダー8軸採点、Riot APIからの自動収集パイプライン、コーチや有識者の見立てを統合したマクロ評価モデル、そしてモンテカルロシミュレーションによる優勝確率算出など、本格的なe-Sportsデータ分析基盤を構築・運用することができました。
      </p>
      <p>
        Camellia Crown、Iris Tiara、Laurel Regalia、Dahlia Diadem の全選手、コーチ、大会運営の皆様が生み出した数々のドラマと感動に、心より感謝申し上げます。
      </p>
    </section>
  {/if}
</div>

<style>
  .report-page {
    max-width: 960px;
    margin: 0 auto;
    padding: 20px 16px 80px;
  }
  .hero {
    text-align: center;
    margin-bottom: 32px;
  }
  .champion-banner {
    margin: 28px 0 20px;
    padding: 24px;
    background: radial-gradient(circle at center, rgba(200, 50, 74, 0.2) 0%, rgba(15, 17, 24, 0.95) 100%);
    border: 1px solid rgba(200, 50, 74, 0.5);
    border-radius: 12px;
    text-align: left;
    box-shadow: 0 8px 32px rgba(200, 50, 74, 0.2);
  }
  .champ-crown {
    display: inline-block;
    padding: 4px 12px;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #ffd700;
    background: rgba(255, 215, 0, 0.15);
    border: 1px solid rgba(255, 215, 0, 0.4);
    border-radius: 20px;
    margin-bottom: 12px;
  }
  .champ-content {
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .champ-meta h2 {
    font-size: 1.5rem;
    margin: 0 0 6px;
    color: #fff;
  }
  .champ-meta h2 small {
    font-size: 0.9rem;
    color: #c8324a;
  }
  .champ-desc {
    margin: 0;
    font-size: 0.95rem;
    color: #c5c9d4;
    line-height: 1.5;
  }
  .nav-chips {
    display: flex;
    justify-content: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 20px;
  }
  .report-tabs {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 12px;
    margin-bottom: 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .tab-btn {
    padding: 10px 16px;
    font-size: 0.9rem;
    font-weight: 600;
    color: #8f96a3;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
  }
  .tab-btn:hover {
    color: #fff;
  }
  .tab-btn.active {
    color: #ffd700;
    border-bottom-color: #ffd700;
  }
  .content-sec {
    padding: 32px 28px;
    background: rgba(18, 20, 29, 0.85);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .content-sec h2 {
    font-size: 1.4rem;
    margin-top: 0;
    margin-bottom: 16px;
    color: #e5e9f0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 10px;
  }
  .content-sec h3 {
    font-size: 1.15rem;
    margin: 28px 0 12px;
    color: #d8dee9;
  }
  .lead {
    font-size: 1.05rem;
    line-height: 1.7;
    color: #d8dee9;
  }
  .summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin: 24px 0;
  }
  .summary-card {
    padding: 18px;
    background: rgba(255, 255, 255, 0.03);
    border-left: 4px solid var(--team);
    border-radius: 6px;
  }
  .card-rank {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--team);
    margin-bottom: 4px;
  }
  .summary-card h3 {
    margin: 0 0 6px;
    font-size: 1.1rem;
    color: #fff;
  }
  .card-stat {
    font-size: 0.85rem;
    font-weight: 600;
    color: #88c0d0;
    margin-bottom: 8px;
  }
  .card-detail {
    font-size: 0.85rem;
    color: #abb2bf;
    line-height: 1.5;
    margin: 0;
  }
  .key-takeaways {
    margin-top: 28px;
    padding: 20px;
    background: rgba(255, 215, 0, 0.04);
    border: 1px solid rgba(255, 215, 0, 0.2);
    border-radius: 8px;
  }
  .key-takeaways h3 {
    margin-top: 0;
    color: #ffd700;
  }
  .key-takeaways ul {
    margin: 0;
    padding-left: 20px;
    color: #d8dee9;
    line-height: 1.8;
  }
  .scroll-table {
    overflow-x: auto;
    margin: 16px 0 28px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
  }
  th, td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  th {
    background: rgba(255, 255, 255, 0.04);
    color: #8f96a3;
    font-weight: 600;
  }
  .team-tag {
    display: inline-block;
    padding: 2px 8px;
    font-weight: 700;
    font-size: 0.8rem;
    border-radius: 4px;
    background: var(--team);
    color: #fff;
  }
  .res-win {
    color: #a3be8c;
    font-weight: 600;
  }
  .res-loss {
    color: #ebcb8b;
    font-weight: 600;
  }
  .sep-row td {
    border-bottom: 2px solid rgba(255, 255, 255, 0.12);
    padding: 4px;
  }
  .playoffs-bracket {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 16px;
    margin: 20px 0;
  }
  .match-card {
    padding: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
  }
  .match-card h4 {
    margin: 0 0 8px;
    font-size: 0.95rem;
    color: #8f96a3;
  }
  .match-score {
    font-size: 1.1rem;
    margin: 0 0 8px;
    color: #fff;
  }
  .match-score.win strong {
    color: #ffd700;
  }
  .match-desc {
    font-size: 0.82rem;
    color: #abb2bf;
    margin: 0;
    line-height: 1.4;
  }
  .match-card.grand-final {
    border-color: var(--team);
    background: rgba(200, 50, 74, 0.1);
  }
  .analysis-block {
    margin-bottom: 28px;
    padding: 20px;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 8px;
    border-left: 3px solid rgba(255, 255, 255, 0.2);
  }
  .badge-tag {
    display: inline-block;
    padding: 2px 10px;
    font-size: 0.75rem;
    font-weight: 700;
    border-radius: 12px;
    margin-bottom: 8px;
  }
  .badge-tag.ok {
    background: rgba(163, 190, 140, 0.2);
    color: #a3be8c;
    border: 1px solid rgba(163, 190, 140, 0.4);
  }
  .badge-tag.diff {
    background: rgba(235, 203, 139, 0.2);
    color: #ebcb8b;
    border: 1px solid rgba(235, 203, 139, 0.4);
  }
  .analysis-block h3 {
    margin: 0 0 10px;
    color: #fff;
  }
  .analysis-block p {
    color: #c5c9d4;
    line-height: 1.7;
    margin: 0 0 10px;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin: 24px 0 32px;
  }
  .metric-card {
    padding: 20px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    text-align: center;
  }
  .metric-val {
    font-size: 2.2rem;
    font-weight: 800;
    color: #ffd700;
    font-family: var(--font-mono, monospace);
  }
  .metric-label {
    font-size: 0.9rem;
    font-weight: 600;
    color: #e5e9f0;
    margin: 6px 0 8px;
  }
  .metric-desc {
    font-size: 0.78rem;
    color: #8f96a3;
    line-height: 1.4;
    margin: 0;
  }
  .archive-box {
    display: flex;
    gap: 20px;
    padding: 24px;
    background: rgba(136, 192, 208, 0.06);
    border: 1px solid rgba(136, 192, 208, 0.3);
    border-radius: 8px;
    margin-bottom: 24px;
  }
  .archive-icon {
    font-size: 2.5rem;
  }
  .archive-box h3 {
    margin: 0 0 10px;
    color: #88c0d0;
  }
  .archive-box p, .archive-box ul {
    color: #d8dee9;
    font-size: 0.95rem;
    line-height: 1.6;
    margin: 0 0 8px;
  }
</style>
