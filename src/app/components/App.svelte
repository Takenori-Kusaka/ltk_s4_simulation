<script lang="ts">
  import { ROSTER } from '../../data/roster.ts';
  import type { PlayerFile } from '../../data/types.ts';
  import { validatePlayerFile } from '../../data/validate.ts';
  import { parseRoute, emptyPlayerFile, TEAM_INFO } from '../lib/index.ts';
  import Home from './Home.svelte';
  import PlayerSheet from './PlayerSheet.svelte';
  import Emblem from './Emblem.svelte';
  import TeamPage from '../team/TeamPage.svelte';

  let { files }: { files: Record<string, PlayerFile> } = $props();
  let hash = $state(location.hash);
  $effect(() => {
    const on = () => {
      hash = location.hash;
      scrollTo({ top: 0 });
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  });
  // 基準11: 型に合わない指標ファイルは画面を描く前にエラーを出す
  const errors = $derived(Object.values(files).flatMap((f) => validatePlayerFile(f)));
  const route = $derived(parseRoute(hash));
  const player = $derived(route.page === 'player' ? ROSTER.find((p) => p.id === route.id) : undefined);
</script>

<main>
  <header class="masthead">
    <a class="brand" href="#/">
      <span class="brand-mark"><Emblem petals={14} color="#c9a24a" /></span>
      LTK · SEASON FINALE
    </a>
    {#if player}
      <nav class="crumb">
        <a href="#/">ALL HOUSES</a> · <a href={`#/team/${player.team}`}>{TEAM_INFO[player.team].name.toUpperCase()}</a>
      </nav>
    {:else if route.page === 'team'}
      <nav class="crumb"><a href="#/">ALL HOUSES</a> · {TEAM_INFO[route.team].name.toUpperCase()}</nav>
    {/if}
  </header>
  {#if errors.length}
    <section class="frame alert" role="alert">
      <p class="eyebrow">Data error</p>
      <h2>指標ファイルのエラー</h2>
      <ul>
        {#each errors as e}<li>{e}</li>{/each}
      </ul>
    </section>
  {:else if route.page === 'team'}
    {#key route.team}
      <TeamPage team={route.team} {files} />
    {/key}
  {:else if player}
    {#key player.id}
      <PlayerSheet {player} file={files[player.id] ?? emptyPlayerFile(player.id)} />
    {/key}
  {:else}
    <Home />
  {/if}
</main>
