<script lang="ts">
  import { compareHref } from '../lib/index.ts';
  import type { RatingsFile } from '../rating/view.ts';
  import { compareView, addTarget, replaceTarget, replaceCandidates, makeBaseTargets } from './view.ts';
  import { legendItems, tableRows, markerPath, candidateTargets, teamComparePending, TEAM_COMPARE_PENDING } from './render.ts';
  import CompareRadar from './CompareRadar.svelte';

  let { targets, ratings }: { targets: string[]; ratings: RatingsFile | undefined } = $props();
  const v = $derived(compareView(targets, ratings));
  // F-008 基準11b: チームの比較は F-010 の評価が出てから(価値責任者の決定 2026-10-09)
  const pending = $derived(teamComparePending(targets));
  const candidates = $derived(candidateTargets(targets));
  let pick = $state('');
  let message = $state('');
  const add = () => {
    if (!pick) return;
    const r = addTarget(targets, pick);
    message = r.message ?? '';
    if (!r.message) location.hash = compareHref(r.targets);
  };
  const removeHref = (id: string) => compareHref(targets.filter((t) => t !== id));
  // F-008 基準23・24: 系列の入れ替えと基準の付け替え(価値責任者の決定 2026-10-09)
  const replace = (index: number, id: string) => {
    if (!id) return;
    const r = replaceTarget(targets, index, id);
    message = r.message ?? '';
    if (!r.message) location.hash = compareHref(r.targets);
  };
  const baseHref = (index: number) => compareHref(makeBaseTargets(targets, index));
</script>

<article class="compare">
  <header class="frame compare-head">
    <p class="eyebrow">Compare</p>
    <h1 tabindex="-1">重ねて比べる</h1>
    {#if v.ok && !pending}
      <!-- F-008 基準5: 凡例(色・点の形・名前) -->
      <ul class="legend-list">
        {#each legendItems(v.series) as it, i}
          <li>
            <svg class="legend-mark" viewBox="0 0 20 20" aria-hidden="true"><path d={markerPath(it.shape, 10, 10, 6)} fill={it.color} /></svg>
            <span class="legend-name" style={`color:${it.color}`}>{it.label}</span>
            {#if i === 0}<span class="legend-base">基準</span>{:else}<a class="legend-tool" href={baseHref(i)}>基準にする</a>{/if}
            <select class="legend-swap" aria-label={`${it.label} を入れ替える`} onchange={(e) => replace(i, (e.currentTarget as HTMLSelectElement).value)}>
              <option value="">入れ替え</option>
              {#each replaceCandidates(targets, i) as c}<option value={c.id}>{c.label}({c.id})</option>{/each}
            </select>
            {#if targets.length > 2}<a class="legend-remove" href={removeHref(it.id)} aria-label={`${it.label} を外す`}>×</a>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </header>

  {#if pending}
    <section class="frame alert" role="status"><p>{TEAM_COMPARE_PENDING}</p></section>
  {:else if !v.ok}
    <section class="frame alert" role="alert"><p>{v.message}</p></section>
  {:else}
    <section class="frame compare-body">
      <div class="radar"><CompareRadar series={v.series} labels={v.axisLabels} /></div>

      <!-- F-008 基準6〜8: 軸ごとの点数・確度・1つ目との差 -->
      <div class="compare-table-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th>軸</th>
              {#each v.series as s, i}
                <th style={`color:${s.color}`}>{s.label}</th>
                {#if i > 0}<th>差</th>{/if}
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each tableRows(v) as r}
              <tr>
                <th scope="row">{r.axis}</th>
                {#each r.cells as c, i}
                  <td class="num">{c.display}<small class="conf" class:low={c.confidence === '低'}>{c.confidence}</small></td>
                  {#if i > 0}<td class="diff">{r.diffs[i]}</td>{/if}
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <!-- F-008 基準1・14: 同じ種類の対象を加える(4つまで) -->
  <section class="frame compare-add">
    {#if candidates.length}
      <label>
        <span class="eyebrow">Add</span>
        <select bind:value={pick}>
          <option value="">加える対象を選ぶ</option>
          {#each candidates as c}<option value={c.id}>{c.label}({c.id})</option>{/each}
        </select>
      </label>
      <button class="chip" onclick={add} disabled={!pick}>重ねる</button>
    {:else}
      <p class="missing-note">重ねられるのは4つまでです</p>
    {/if}
    {#if message}<p class="missing-note" role="status">{message}</p>{/if}
  </section>
</article>
