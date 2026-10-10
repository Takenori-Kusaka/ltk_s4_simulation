<script lang="ts">
  // F-014 基準14・15・18: 「<英語のチーム名|選手名> は勝てるのか」の節(チームのページと選手のページで共用)。
  // チーム: 直近の試合日の箱(そのチームの側を強調)・階級チームごとの試合の一覧と期待勝ち数・シーズンの見通し。
  // 選手: 階級チームの直近の試合・対面の選手と比較ページへのリンク・試合の一覧と期待勝ち数。
  // 勝率表が無ければ「勝率のデータがありません」(基準18)。対面の選手(F-008)は勝率表が無くても出す
  import DayBox from './DayBox.svelte';
  import type { DayBoxView } from './view.ts';
  import type { FacingView, TeamMatchRow, TeamOutlookView, TierMatchesView } from './fan.ts';

  let {
    kind,
    title,
    team,
    notice,
    box = null,
    tiers = [],
    outlook = null,
    next = null,
    facing = null,
  }: {
    kind: 'team' | 'player';
    title: string;
    /** チームの略称(DD・CC・IT・LR)。箱の強調と一覧の見出しに使う */
    team: string;
    /** 基準18: 勝率表が無いときの文。問題なければ null */
    notice: string | null;
    /** 基準14(a): 直近の試合日の箱(チーム) */
    box?: DayBoxView | null;
    /** 基準14(b)・15(c): 階級チームごとの試合の一覧 */
    tiers?: TierMatchesView[];
    /** 基準14(c): シーズンの見通し(チーム) */
    outlook?: TeamOutlookView | null;
    /** 基準15(a): 階級チームの直近の試合(選手)。残っていなければ null */
    next?: TeamMatchRow | null;
    /** 基準15(b): 直近の試合の対面の選手(選手。F-008) */
    facing?: FacingView | null;
  } = $props();
</script>

{#snippet facingLine()}
  {#if kind === 'player'}
    {#if facing}
      <p class="facing">
        <span class="eyebrow">対面</span>
        <a class="facing-name" href={`#/player/${facing.id}`}>{facing.name}</a>
        <span class="facing-team">{facing.team}</span>
        <a class="chip compare" href={facing.href}>対面と比較 ›</a>
      </p>
    {:else}
      <p class="none">対面: 残っている試合はありません</p>
    {/if}
  {/if}
{/snippet}

<section class="fan" aria-label={title}>
  <h2 class="fan-title">{title}</h2>
  {#if notice}
    <div class="frame alert body">
      <p class="notice">{notice}</p>
      {@render facingLine()}
    </div>
  {:else}
    {#if kind === 'team' && box}
      <DayBox view={box} highlight={team} />
    {/if}
    <div class="frame body">
      {#if kind === 'player'}
        {#if next}
          <div class="next" style={`--opp:${next.opponentColor}`}>
            <p class="eyebrow">Next match · 直近の試合</p>
            <p class="next-line">
              <b class="day">{next.label}</b>
              <span class="date">{next.dateLabel}</span>
              <span class="vs">vs <b>{next.opponent} {next.tier}</b> <small>{next.opponentName}</small></span>
              {#if next.side}<span class="side" class:red={next.side === 'RED'}>{next.side} SIDE</span>{/if}
            </p>
            <p class="next-p">
              <span class="pct">{next.p}<small>%</small></span>
              <span class="bar" role="img" aria-label={`${team} ${next.tier} の勝率 ${next.p}%`}><i style={`width:${next.pNum}%`}></i></span>
            </p>
            {#if next.dataMissing}<p class="missing">{next.dataMissing}</p>{/if}
          </div>
        {:else}
          <p class="none">残っている試合はありません</p>
        {/if}
        {@render facingLine()}
      {/if}

      <!-- 基準14(b)・15(c): 階級チームの試合の一覧と期待勝ち数(勝率の和) -->
      {#each tiers as t}
        <div class="tier">
          <header class="tier-head">
            <span class="tier-name">{team} {t.tier}</span>
            <span class="exp">期待勝ち数 <b>{t.expected}</b><small> / {t.rows.length}</small></span>
          </header>
          <div class="scroll">
            <table>
              <thead>
                <tr><th class="d">日</th><th class="o">相手</th>{#if t.tier !== 'MASTERS'}<th class="s">サイド</th>{/if}<th class="p">勝率</th></tr>
              </thead>
              <tbody>
                {#each t.rows as r}
                  <tr style={`--opp:${r.opponentColor}`}>
                    <td class="d"><b>{r.label}</b> <span class="date">{r.dateLabel}</span></td>
                    <td class="o"><i class="dot"></i>{r.opponent} <small>{r.opponentName}</small></td>
                    {#if t.tier !== 'MASTERS'}<td class="s" class:red={r.side === 'RED'}>{r.side}</td>{/if}
                    <td class="p">
                      <span class="pct">{r.p}<small>%</small></span>
                      <span class="bar" role="img" aria-label={`${team} ${t.tier} の勝率 ${r.p}%`}><i style={`width:${r.pNum}%`}></i></span>
                      {#if r.dataMissing}<span class="missing">{r.dataMissing}</span>{/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/each}

      <!-- 基準14(c): シーズンの見通し(優勝確率・シード 1〜4 位の確率・順位表での予想の順位) -->
      {#if kind === 'team' && outlook}
        <div class="outlook">
          <p class="eyebrow">Season outlook · シーズンの見通し</p>
          <div class="stats">
            <div class="stat main">
              <span class="k">優勝確率</span>
              <span class="v">{outlook.champion}<small>%</small></span>
              <span class="bar"><i style={`width:${outlook.championNum}%`}></i></span>
            </div>
            <div class="stat main">
              <span class="k">予想順位</span>
              <span class="v">{outlook.rank}<small>位</small></span>
              <span class="n">予想 pt(RS+MASTERS CUP) {outlook.total}</span>
            </div>
            {#each outlook.seeds as s, i}
              <div class="stat">
                <span class="k">シード {i + 1} 位</span>
                <span class="v">{s}<small>%</small></span>
                <span class="bar"><i style={`width:${outlook.seedNums[i]}%`}></i></span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .fan { display: grid; gap: 0.9rem; min-width: 0; }
  .fan-title { margin: 0; font-family: var(--serif-jp); font-size: 1.3rem; font-weight: 700; letter-spacing: 0.04em; color: var(--gold-hi); overflow-wrap: anywhere; }
  .body { padding: 1rem; display: grid; gap: 1rem; min-width: 0; }
  .notice, .none { margin: 0; color: var(--ivory-dim); }
  .missing { margin: 0.2rem 0 0; font-size: 0.76rem; color: var(--ivory-dim); }
  .pct { font-family: var(--serif-latin); font-size: 1.25rem; font-weight: 700; color: var(--ivory); white-space: nowrap; }
  .pct small { font-size: 0.7rem; margin-left: 0.05rem; color: var(--ivory-dim); }
  .bar { display: block; height: 6px; border-radius: 3px; overflow: hidden; background: var(--velvet-3); }
  .bar i { display: block; height: 100%; background: var(--team); opacity: 0.9; }
  /* 基準15(a): 直近の試合 */
  .next { display: grid; gap: 0.3rem; }
  .next-line { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.3rem 0.7rem; }
  .next-line .day { font-family: var(--caps); font-size: 1.1rem; letter-spacing: 0.08em; color: var(--gold-hi); }
  .next-line .date { font-family: var(--caps); letter-spacing: 0.08em; color: var(--ivory-dim); }
  .next-line .vs b { font-family: var(--caps); font-weight: 400; letter-spacing: 0.06em; color: var(--opp); }
  .next-line small, .o small { color: var(--ivory-dim); }
  .side { font-family: var(--caps); font-size: 0.68rem; letter-spacing: 0.14em; padding: 0.05rem 0.4rem; border: 1px solid #4a6fe0; border-radius: 999px; color: #9fb4f0; }
  .side.red { border-color: #c8324a; color: #f09aa8; }
  .next-p { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 0.6rem; }
  /* 基準15(b): 対面 */
  .facing { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.6rem; }
  .facing-name { font-family: var(--serif-jp); font-size: 1.05rem; color: var(--ivory); }
  .facing-name:hover { color: var(--gold-hi); }
  .facing-team { font-family: var(--caps); font-size: 0.78rem; letter-spacing: 0.1em; color: var(--ivory-dim); }
  .compare { display: inline-flex; }
  /* 基準14(b)・15(c): 試合の一覧 */
  .tier { min-width: 0; }
  .tier-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.3rem; }
  .tier-name { font-family: var(--caps); font-size: 1rem; letter-spacing: 0.1em; color: var(--gold-hi); }
  .exp { font-size: 0.82rem; color: var(--ivory-dim); }
  .exp b { font-family: var(--serif-latin); font-size: 1.2rem; color: var(--ivory); }
  /* 基準11 と同じ扱い: 表は横に送れる枠の中に置き、ページを横にスクロールさせない */
  .scroll { overflow-x: auto; }
  table { border-collapse: separate; border-spacing: 0 3px; width: 100%; font-size: 0.84rem; }
  thead th { font-family: var(--caps); font-weight: 400; font-size: 0.66rem; letter-spacing: 0.12em; color: var(--ivory-dim); text-align: left; padding: 0.15rem 0.5rem; }
  tbody td { padding: 0.35rem 0.5rem; background: rgba(0, 0, 0, 0.18); vertical-align: middle; white-space: nowrap; }
  td.d b { font-family: var(--caps); font-weight: 400; letter-spacing: 0.06em; }
  td.d .date { font-family: var(--caps); font-size: 0.74rem; letter-spacing: 0.06em; color: var(--ivory-dim); }
  td.o { font-family: var(--caps); letter-spacing: 0.06em; }
  .dot { display: inline-block; width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--opp); margin-right: 0.4rem; vertical-align: middle; }
  td.s { font-family: var(--caps); font-size: 0.72rem; letter-spacing: 0.1em; color: #9fb4f0; }
  td.s.red { color: #f09aa8; }
  td.p { width: 42%; }
  td.p .pct { font-size: 1.05rem; }
  td.p .bar { margin-top: 0.15rem; }
  td.p .missing { display: block; white-space: normal; }
  /* 基準14(c): 見通し */
  .outlook { display: grid; gap: 0.4rem; }
  .stats { display: grid; gap: 0.6rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stat { display: grid; gap: 0.2rem; padding: 0.5rem 0.6rem; border: 1px solid var(--line); border-radius: 6px; background: rgba(0, 0, 0, 0.18); min-width: 0; }
  .stat .k { font-size: 0.76rem; color: var(--ivory-dim); }
  .stat .v { font-family: var(--serif-latin); font-size: 1.6rem; font-weight: 700; line-height: 1.1; color: var(--ivory); }
  .stat.main .v { font-size: 2.1rem; color: var(--gold-hi); }
  .stat .v small { font-size: 0.75rem; margin-left: 0.15rem; color: var(--ivory-dim); }
  .stat .n { font-size: 0.74rem; color: var(--ivory-dim); }
  @media (min-width: 900px) {
    .stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 420px) {
    .o small { display: none; }
    td.p { width: 36%; }
  }
</style>
