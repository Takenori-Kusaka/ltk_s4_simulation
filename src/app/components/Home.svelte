<script lang="ts">
  import { ROSTER } from '../../data/roster.ts';
  import { TEAMS, TIERS } from '../../sim/types.ts';
  import { TEAM_INFO, daysUntilOpening } from '../lib/index.ts';
  import Emblem from './Emblem.svelte';
  import RoleGlyph from './RoleGlyph.svelte';

  const days = daysUntilOpening(new Date());
  const tiersTopDown = [...TIERS].reverse();
</script>

<section class="hero">
  <p class="eyebrow">League The k4sen · 2026.10.15 — 11.22</p>
  <h1><span class="foil">Season Finale</span></h1>
  <p class="sub">四つの花の王家、六十の名。最後の玉座を占う予言の書。</p>
  {#if days > 0}
    <p class="countdown">開幕まで <strong>{days}</strong> 日</p>
  {:else}
    <p class="countdown">大会 開催中</p>
  {/if}
</section>

<div class="houses">
  {#each TEAMS as team, i}
    {@const info = TEAM_INFO[team]}
    <section class="house frame" style={`--team:${info.color}; animation-delay:${i * 90}ms`}>
      <div class="house-head">
        <Emblem petals={info.petals} color={info.color} />
        <div>
          <h2 class="house-name">{info.name}</h2>
          <div class="house-motto">{info.flower}の{info.regalia} · {team}</div>
        </div>
      </div>
      <hr class="rule" />
      {#each tiersTopDown as tier}
        <div class="tier-row">
          <span class="eyebrow">{tier}</span>
          <div class="chips">
            {#each ROSTER.filter((p) => p.team === team && p.tier === tier) as p}
              <a class="chip" href={`#/player/${p.id}`} title={`${p.name} / ${p.role}`}>
                <span class="role"><RoleGlyph role={p.role} /></span>
                <span>{p.name}</span>
              </a>
            {/each}
          </div>
        </div>
      {/each}
    </section>
  {/each}
</div>
