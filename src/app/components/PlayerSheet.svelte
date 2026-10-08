<script lang="ts">
  import type { Player } from '../../data/roster.ts';
  import type { PlayerFile } from '../../data/types.ts';
  import { playerView, placeholderAvatar } from '../lib/index.ts';
  import Radar from './Radar.svelte';

  let { player, file }: { player: Player; file: PlayerFile } = $props();
  const view = $derived(playerView(player, file));
  const avatar = $derived(placeholderAvatar(player));
  let open = $state<string | null>(null);
</script>

<article class="sheet">
  <div class="card">
    <!-- 基準8: 公開版は画像を使わない代替表示 -->
    <div class="avatar" style={`background:${avatar.color}`} aria-label={`${view.name} の代替表示`}>
      <div>{avatar.initial}<br /><small>{avatar.roleIcon} {view.role}</small></div>
    </div>
    <h1>{view.name}</h1>
    <p>{view.team} / {view.tier} / {view.role}</p>
  </div>
  <div class="card">
    <div class="radar">
      <Radar scores={view.axes.map((a) => a.score)} labels={view.axes.map((a) => a.label)} color={avatar.color} />
    </div>
    <ul class="axes">
      {#each view.axes as a}
        <li>
          <button onclick={() => (open = open === a.label ? null : a.label)} aria-expanded={open === a.label}>
            <span>{a.label}</span>
            <span class="score" class:missing={a.score === null}>{a.display}</span>
          </button>
          {#if open === a.label}
            <!-- 基準3: 計算に使った指標・重み・出典・取得日 -->
            <div class="evidence">
              <table>
                <thead><tr><th>指標</th><th>値</th><th>点</th><th>重み</th><th>出典</th><th>取得日</th></tr></thead>
                <tbody>
                  {#each a.components as c}
                    <tr>
                      <td>{c.metric}</td><td>{c.raw}</td><td>{c.display}</td><td>{c.weight}</td>
                      <td>{c.source}{#if c.rationale}<br /><small>{c.rationale}</small>{/if}</td><td>{c.retrievedAt}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
              {#if a.missing.length}<p class="missing">欠けている指標: {a.missing.join(', ')}</p>{/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
</article>
