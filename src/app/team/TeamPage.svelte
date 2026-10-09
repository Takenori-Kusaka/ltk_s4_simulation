<script lang="ts">
  import type { TeamId } from '../../sim/types.ts';
  import { TEAM_INFO, overallScore, formatScore } from '../lib/index.ts';
  import { ROSTER } from '../../data/roster.ts';
  import { teamRatingView, type RatingsFile } from '../rating/view.ts';
  import Radar from '../components/Radar.svelte';
  import Emblem from '../components/Emblem.svelte';
  import RoleGlyph from '../components/RoleGlyph.svelte';
  import type { Role } from '../../data/roster.ts';
  import { teamCompareEntries, tierAllHref } from '../compare/opponent.ts';
  import { TIERS } from '../../sim/types.ts';

  let { team, ratings }: { team: TeamId; ratings: RatingsFile | undefined } = $props();
  const info = $derived(TEAM_INFO[team]);
  const v = $derived(teamRatingView(team, ratings));
  const members = $derived(ROSTER.filter((p) => p.team === team));
  const nameOf = (id: string) => ROSTER.find((p) => p.id === id)?.name ?? id;
  const whole = $derived(v.radars[0]);
  const tiers = $derived(v.radars.slice(1).reverse());
</script>

<article class="court" style={`--team:${info.color}`}>
  <header class="court-head frame">
    <div class="court-emblem"><Emblem petals={info.petals} color={info.color} /></div>
    <div>
      <p class="eyebrow">House of {info.flower}</p>
      <h1 class="court-name" tabindex="-1">{info.name}</h1>
      <p class="house-motto">{info.flower}の{info.regalia} · {team} · 同じ階級の4チームの中での相対評価(5.0 が平均)</p>
    </div>
    <div class="court-overall">
      <span class="eyebrow">Overall</span>
      <span class="num foil">{formatScore(overallScore(whole.scores))}</span>
    </div>
    <!-- F-008 基準17: このチームを1つ目の系列にして比較を始める -->
    <nav class="compare-entries" aria-label="比較">
      <span class="eyebrow">Compare</span>
      {#each teamCompareEntries(team) as e}<a class="chip" href={e.href}>{e.label}を比較</a>{/each}
      <!-- F-008 基準17c: 同じ階級の4チームを一度に比べる -->
      {#each TIERS as t}<a class="chip" href={tierAllHref(t)}>{t} の4チームと比較</a>{/each}
    </nav>
  </header>

  <section class="frame court-whole">
    <p class="eyebrow">チーム全体 · 3階級の平均</p>
    {#if whole.excluded > 0}
      <p class="excluded-note">データの無い {whole.excluded} 名を除いて計算しています</p>
    {/if}
    <div class="court-whole-body">
      <div class="radar"><Radar scores={whole.scores} labels={v.axisLabels} color={info.color} /></div>
      <ul class="lines static">
        {#each v.axisLabels as label, i}
          {@const s = whole.scores[i]}
          <li class="line" style={`animation-delay:${200 + i * 70}ms`}>
            <div class="line-body">
              <span class="label-text">{label}</span>
              <span class="value" class:na={s === null}>{whole.displays[i]}</span>
              <span class="delta" class:up={s !== null && s >= 5} class:down={s !== null && s < 5}>
                {s === null ? '' : `平均比 ${s >= 5 ? '+' : '−'}${Math.abs(s - 5).toFixed(1)}`}
              </span>
              <span class="bar" class:na={s === null}>
                {#if s !== null}<i style={`width:${s * 10}%`}></i>{/if}
              </span>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <div class="court-tiers">
    {#each tiers as r, i}
      <section class="frame court-tier" style={`animation-delay:${120 + i * 90}ms`}>
        <div class="court-tier-head">
          <span class="eyebrow">{r.label}</span>
          <span class="num">{formatScore(overallScore(r.scores))}</span>
        </div>
        <div class="radar"><Radar scores={r.scores} labels={v.axisLabels} color={info.color} /></div>
        {#if r.excluded > 0}
          <p class="excluded-note">データの無い {r.excluded} 名を除いて計算しています</p>
        {/if}
        <ul class="court-members">
          {#each members.filter((m) => m.tier === r.label) as m}
            <li>
              <a class="chip" href={`#/player/${m.id}`}>
                <span class="role"><RoleGlyph role={m.role as Role} /></span>
                <span>{m.name}</span>
              </a>
            </li>
          {/each}
        </ul>
        <!-- F-009 基準25: チームの指標(視界・オブジェクト・マクロ) -->
        {#each v.indicators.filter((x) => x.tier === r.label) as ind}
          <div class="indicators">
            <p class="eyebrow">Team indicators</p>
            {#each ind.items as it}
              <details class="indicator">
                <summary>
                  <span class="label-text">{it.label}</span>
                  <span class="value" class:na={it.score === null}>
                    {it.display}
                    {#if it.confidence}<small class="conf" class:low={it.confidence === '低'}>確度 {it.confidence}</small>{/if}
                  </span>
                </summary>
                <p class="missing-note">{it.reason}</p>
                {#if it.players.length}
                  <ul class="ind-players">
                    {#each it.players as pl}<li>{nameOf(pl.playerId)} <b>{pl.score.toFixed(1)}</b> <span>({pl.gamesUsed} 試合・確度 {pl.confidence})</span></li>{/each}
                  </ul>
                {/if}
                {#if it.evidence.length}
                  <ul class="grounds">
                    {#each it.evidence as e}<li><span class="ground-text">{e.text}</span> <span class="ground-meta">{e.source}</span></li>{/each}
                  </ul>
                {/if}
              </details>
            {/each}
          </div>
        {/each}
      </section>
    {/each}
  </div>
</article>
