<script lang="ts">
  import type { PlayerFile } from '../../data/types.ts';
  import type { TeamId } from '../../sim/types.ts';
  import { TEAM_INFO, overallScore, formatScore } from '../lib/index.ts';
  import { teamView } from './view.ts';
  import Radar from '../components/Radar.svelte';
  import Emblem from '../components/Emblem.svelte';
  import RoleGlyph from '../components/RoleGlyph.svelte';
  import type { Role } from '../../data/roster.ts';

  let { team, files }: { team: TeamId; files: Record<string, PlayerFile> } = $props();
  const info = $derived(TEAM_INFO[team]);
  const v = $derived(teamView(team, files));
  const whole = $derived(v.radars[0]);
  const tiers = $derived(v.radars.slice(1).reverse());
</script>

<article class="court" style={`--team:${info.color}`}>
  <header class="court-head frame">
    <div class="court-emblem"><Emblem petals={info.petals} color={info.color} /></div>
    <div>
      <p class="eyebrow">House of {info.flower}</p>
      <h1 class="court-name">{info.name}</h1>
      <p class="house-motto">{info.flower}の{info.regalia} · {team} · 同じ階級の4チームの中での相対評価(5.0 が平均)</p>
    </div>
    <div class="court-overall">
      <span class="eyebrow">Overall</span>
      <span class="num foil">{formatScore(overallScore(whole.scores))}</span>
    </div>
  </header>

  <section class="frame court-whole">
    <p class="eyebrow">チーム全体 · 3階級の平均</p>
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
        <ul class="court-members">
          {#each v.members.filter((m) => m.tier === r.label) as m}
            <li>
              <a class="chip" href={m.href}>
                <span class="role"><RoleGlyph role={m.role as Role} /></span>
                <span>{m.name}</span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
</article>
