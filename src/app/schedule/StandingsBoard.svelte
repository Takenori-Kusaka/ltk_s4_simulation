<script lang="ts">
  // F-014 基準4・5・11: 公式のシーズン3の STANDINGS と同じ列構成の順位表(NO. / TEAM / CORE W-L / NEXT W-L / MASTERS / TOTAL)+ 優勝確率
  import Emblem from '../components/Emblem.svelte';
  import type { StandingsView } from './view.ts';

  let { view, sub, highlight }: { view: StandingsView; sub: string; highlight?: string } = $props();
</script>

<section class="standings frame">
  <header class="st-head">
    <span class="st-title">STANDINGS</span>
    <span class="st-sub">{sub}</span>
    <span class="st-label">{view.label}</span>
  </header>
  <div class="scroll">
    <table>
      <thead>
        <tr><th class="no">NO.</th><th class="team">TEAM</th><th>CORE W-L</th><th>NEXT W-L</th><th>MASTERS</th><th>TOTAL</th><th>優勝</th></tr>
      </thead>
      <tbody>
        {#each view.rows as r}
          <tr class:first={r.first} class:hl={highlight === r.team} style={`--team:${r.color}`}>
            <td class="no"><span>{r.no}</span></td>
            <td class="team"><span class="emb"><Emblem petals={r.petals} color={r.color} /></span><a href={`#/team/${r.team}`}>{r.name.toUpperCase()}</a></td>
            <td>{r.coreWL}</td>
            <td>{r.nextWL}</td>
            <td>{r.masters}</td>
            <td class="total">{r.total}</td>
            <td>{r.champion}%</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="st-note">{view.note}</p>
</section>

<style>
  .standings { padding: 1rem; }
  .st-head { display: flex; align-items: baseline; gap: 0.8rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
  .st-title { font-family: var(--caps); font-size: 1.4rem; letter-spacing: 0.1em; color: var(--gold-hi); }
  .st-sub { font-family: ui-monospace, 'Courier New', monospace; font-size: 0.72rem; letter-spacing: 0.12em; color: var(--ivory-dim); }
  .st-label { margin-left: auto; font-size: 0.75rem; padding: 0.1rem 0.5rem; border: 1px solid var(--line); border-radius: 999px; color: var(--ivory-dim); }
  /* 基準11: 表は横に送れる枠の中に置き、ページを横にスクロールさせない */
  .scroll { overflow-x: auto; }
  table { border-collapse: separate; border-spacing: 0 4px; width: 100%; min-width: 30rem; font-family: ui-monospace, 'Courier New', monospace; font-size: 0.85rem; }
  thead th { font-weight: 600; font-size: 0.68rem; letter-spacing: 0.12em; color: var(--ivory-dim); padding: 0.2rem 0.6rem; text-align: center; background: var(--velvet-3); white-space: nowrap; }
  thead th.team { text-align: left; }
  tbody td { padding: 0.5rem 0.6rem; text-align: center; background: var(--velvet-2); white-space: nowrap; }
  tbody tr.hl td { background: color-mix(in srgb, var(--team) 18%, var(--velvet-2)); }
  td.no { width: 2.6rem; font-weight: 700; background: var(--velvet-3); }
  tr.first td.no { background: #d7263d; color: #fff; }
  td.team { text-align: left; }
  td.team a { color: var(--ivory); text-decoration: none; letter-spacing: 0.06em; }
  td.team a:hover { color: var(--gold-hi); }
  .emb { display: inline-flex; width: 1.4rem; height: 1.4rem; vertical-align: middle; margin-right: 0.5rem; }
  .emb :global(svg) { width: 100%; height: 100%; }
  td.total { font-weight: 700; color: var(--gold-hi); }
  .st-note { margin: 0.5rem 0 0; font-size: 0.78rem; color: var(--ivory-dim); }
</style>
