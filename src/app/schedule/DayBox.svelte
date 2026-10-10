<script lang="ts">
  // F-014 基準1・3・11・12: 公式の Regular Stage の画像と同じ形の日程の箱(左がブルーサイド、右がレッドサイド)に勝率と棒を付ける
  import Emblem from '../components/Emblem.svelte';
  import type { DayBoxView } from './view.ts';

  let { view, highlight }: { view: DayBoxView; highlight?: string } = $props();
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
        <div class="row">
          <div class="sides">
            <div class="side blue" class:hl={highlight === r.blue.team} style={`--team:${r.blue.color}`}>
              <span class="emb"><Emblem petals={r.blue.petals} color={r.blue.color} /></span>
              <span class="label">{r.blue.team} {r.tier}</span>
              <span class="pct">{r.blue.p}<small>%</small></span>
            </div>
            <div class="side red" class:hl={highlight === r.red.team} style={`--team:${r.red.color}`}>
              <span class="pct">{r.red.p}<small>%</small></span>
              <span class="label">{r.red.team} {r.tier}</span>
              <span class="emb"><Emblem petals={r.red.petals} color={r.red.color} /></span>
            </div>
          </div>
          <div class="bar" role="img" aria-label={`${r.blue.team} ${r.blue.p}% / ${r.red.team} ${r.red.p}%`}>
            <span class="fill" style={`width:${r.blue.pNum}%; background:${r.blue.color}`}></span>
            <span class="fill" style={`width:${r.red.pNum}%; background:${r.red.color}`}></span>
          </div>
          {#if r.dataMissing}<p class="missing">{r.dataMissing}</p>{/if}
        </div>
      {/each}
    </div>
  {/each}
  {#each view.placeholders as ph}
    <div class="card ph"><span class="ph-label">{ph.label}</span><span class="ph-text">{ph.text}</span></div>
  {/each}
</section>

<style>
  .daybox { padding: 1rem; }
  .day-head { display: flex; justify-content: space-between; align-items: baseline; font-family: var(--caps); letter-spacing: 0.08em; margin-bottom: 0.6rem; }
  .day-title { font-size: 1.15rem; color: var(--gold-hi); }
  .day-date { color: var(--ivory-dim); }
  .card { border: 1px solid var(--line); border-radius: 6px; padding: 0.5rem 0.6rem 0.6rem; margin-top: 0.6rem; background: rgba(0, 0, 0, 0.18); }
  .side-labels { display: flex; justify-content: space-between; font-family: var(--caps); font-size: 0.62rem; letter-spacing: 0.14em; color: var(--muted); }
  .side-labels .vs { color: var(--ivory-dim); }
  .row { margin-top: 0.45rem; }
  .sides { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .side { display: flex; align-items: center; gap: 0.4rem; min-width: 0; padding: 0.15rem 0.3rem; border-radius: 4px; }
  .side.red { flex-direction: row; }
  .side.hl { background: color-mix(in srgb, var(--team) 22%, transparent); outline: 1px solid var(--team); }
  .emb { width: 1.5rem; height: 1.5rem; flex: none; display: inline-flex; }
  .emb :global(svg) { width: 100%; height: 100%; }
  .label { font-family: var(--caps); font-size: 0.82rem; letter-spacing: 0.06em; white-space: nowrap; }
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
</style>
