<script lang="ts">
  // F-014 基準1・3・11・12: 公式の Regular Stage の画像と同じ形の日程の箱(左がブルーサイド、右がレッドサイド)に勝率と棒を付ける
  import Emblem from '../components/Emblem.svelte';
  import type { DayBoxView } from './view.ts';
  // F-014 基準19: 行を押すと、その直下に根拠の節を開く(Task-4)
  import MatchStory from '../story/MatchStory.svelte';

  let { view, highlight }: { view: DayBoxView; highlight?: string } = $props();
  let open = $state<string | null>(null);
  const toggle = (key: string) => (open = open === key ? null : key);
</script>

<section class="daybox frame">
  <header class="day-head">
    <span class="day-title">{view.title}</span>
    <span class="day-date">{view.dateLabel}</span>
  </header>
  {#each view.boxes as box}
    <div class="card">
      <div class="side-labels" aria-hidden="true"><span>BLUE SIDE</span><span class="vs">VS</span><span>RED SIDE</span></div>
      {#each box.rows as r}
        {@const key = `${box.label}-${r.tier}`}
        <div class="row">
          <button type="button" class="row-btn" aria-expanded={open === key} aria-controls={`story-${view.title}-${key}`} onclick={() => toggle(key)} title="押すと、この試合の予想の根拠が開きます">
          <div class="sides">
            <div class="side blue" class:hl={highlight === r.blue.team} style={`--team:${r.blue.color}`}>
              <span class="emb"><Emblem petals={r.blue.petals} color={r.blue.color} /></span>
              <span class="label">{r.blue.team} {r.tier}<small class="full">{r.blue.name}</small></span>
              <span class="pct">{r.blue.p}<small>%</small></span>
            </div>
            <div class="side red" class:hl={highlight === r.red.team} style={`--team:${r.red.color}`}>
              <span class="pct">{r.red.p}<small>%</small></span>
              <span class="label">{r.red.team} {r.tier}<small class="full">{r.red.name}</small></span>
              <span class="emb"><Emblem petals={r.red.petals} color={r.red.color} /></span>
            </div>
          </div>
          <div class="bar" role="img" aria-label={`${r.blue.team} ${r.blue.p}% / ${r.red.team} ${r.red.p}%`}>
            <span class="fill" style={`width:${r.blue.pNum}%; background:${r.blue.color}`}></span>
            <span class="fill" style={`width:${r.red.pNum}%; background:${r.red.color}`}></span>
          </div>
          <span class="hint" aria-hidden="true">{open === key ? '根拠を閉じる ▴' : '根拠を見る ▾'}</span>
          </button>
          {#if r.dataMissing}<p class="missing">{r.dataMissing}</p>{/if}
          {#if open === key}
            <div id={`story-${view.title}-${key}`}>
              <MatchStory input={{ tier: r.tier, a: r.blue.team, b: r.red.team, pA: r.blue.pNum, pB: r.red.pNum, pLane: r.pLane, pMacro: r.pMacro, pExt: r.pExt, teamA: r.blue.layer, teamB: r.red.layer }} />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
  {#each view.placeholders as ph}
    <div class="card ph"><span class="ph-label">{ph.label}</span><span class="ph-text">{ph.text}</span></div>
  {/each}
</section>

<style>
  /* 基準11: 根拠の表の幅がグリッドの列を広げないよう、箱の最小幅を 0 にする */
  .daybox { padding: 1rem; min-width: 0; }
  .day-head { display: flex; justify-content: space-between; align-items: baseline; font-family: var(--caps); letter-spacing: 0.08em; margin-bottom: 0.6rem; }
  .day-title { font-size: 1.15rem; color: var(--gold-hi); }
  .day-date { color: var(--ivory-dim); }
  .card { border: 1px solid var(--line); border-radius: 6px; padding: 0.5rem 0.6rem 0.6rem; margin-top: 0.6rem; background: rgba(0, 0, 0, 0.18); min-width: 0; overflow: hidden; }
  .side-labels { display: flex; justify-content: space-between; font-family: var(--caps); font-size: 0.62rem; letter-spacing: 0.14em; color: var(--muted); }
  .side-labels .vs { color: var(--ivory-dim); }
  .row { margin-top: 0.45rem; }
  /* 基準19: 行全体が押せるボタン。見た目は行のまま */
  .row-btn { display: block; box-sizing: border-box; width: 100%; padding: 0.2rem 0.2rem 0.25rem; margin: 0; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; text-align: inherit; cursor: pointer; }
  .row-btn:hover, .row-btn:focus-visible { background: rgba(255, 255, 255, 0.05); outline: 1px solid var(--line); }
  .row-btn[aria-expanded='true'] { background: rgba(201, 162, 74, 0.08); }
  .hint { display: block; text-align: center; font-size: 0.7rem; letter-spacing: 0.08em; color: var(--muted); margin-top: 0.25rem; }
  /* 基準11: 左右の側の中身が収まるかを、画面幅ではなく行の幅(コンテナ)で判定する */
  .sides { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; container: daybox-sides / inline-size; }
  .side { display: flex; align-items: center; gap: 0.4rem; min-width: 0; padding: 0.15rem 0.3rem; border-radius: 4px; }
  .side.red { flex-direction: row; }
  .side.hl { background: color-mix(in srgb, var(--team) 22%, transparent); outline: 1px solid var(--team); }
  .emb { width: 1.5rem; height: 1.5rem; flex: none; display: inline-flex; }
  .emb :global(svg) { width: 100%; height: 100%; }
  .label { font-family: var(--caps); font-size: 0.82rem; letter-spacing: 0.06em; white-space: nowrap; display: inline-flex; flex-direction: column; line-height: 1.1; }
  .label .full { font-family: var(--serif-latin); font-size: 0.62rem; letter-spacing: 0.04em; color: var(--ivory-dim); text-transform: uppercase; }
  .pct { font-family: var(--serif-latin); font-size: 1.25rem; font-weight: 700; color: var(--ivory); white-space: nowrap; }
  .pct small { font-size: 0.7rem; margin-left: 0.05rem; color: var(--ivory-dim); }
  .bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 0.3rem; background: var(--velvet-3); }
  .fill { display: block; height: 100%; opacity: 0.9; }
  .missing { margin: 0.25rem 0 0; font-size: 0.78rem; color: var(--ivory-dim); }
  .ph { display: flex; gap: 0.6rem; align-items: baseline; color: var(--ivory-dim); font-size: 0.85rem; }
  .ph-label { font-family: var(--caps); color: var(--gold); }
  @media (max-width: 420px) {
    .pct { font-size: 1.05rem; }
    .label { font-size: 0.72rem; }
  }
  /* 基準11: 行の幅が 400px 未満(幅 360px のスマホ)では、左右の側を「紋章+名前」の段と勝率の段の 2 段に組み、
     中身が側の箱からはみ出して左右で重なったり、右側の紋章が切れたりしないようにする。チームの正式名は折り返す */
  @container daybox-sides (max-width: 400px) {
    .side { flex: 1 1 0; display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: 'emb label' 'pct pct'; gap: 0.1rem 0.4rem; }
    .side.red { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'label emb' 'pct pct'; text-align: right; }
    .emb { grid-area: emb; }
    .label { grid-area: label; white-space: normal; }
    .side.red .label { align-items: flex-end; }
    .pct { grid-area: pct; }
  }
</style>
