<script lang="ts">
  import { ROSTER } from '../../data/roster.ts';
  import { TEAMS, TIERS } from '../../sim/types.ts';
  import { placeholderAvatar } from '../lib/index.ts';
</script>

{#each TEAMS as team}
  <section>
    <h2>{team}</h2>
    {#each TIERS as tier}
      <h3>{tier}</h3>
      <div class="roster">
        {#each ROSTER.filter((p) => p.team === team && p.tier === tier) as p}
          {@const a = placeholderAvatar(p)}
          <a class="card" href={`#/player/${p.id}`}>
            <span aria-hidden="true">{a.roleIcon}</span> {p.role}<br /><strong>{p.name}</strong>
          </a>
        {/each}
      </div>
    {/each}
  </section>
{/each}
