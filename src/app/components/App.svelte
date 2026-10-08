<script lang="ts">
  import { ROSTER } from '../../data/roster.ts';
  import type { PlayerFile } from '../../data/types.ts';
  import { validatePlayerFile } from '../../data/validate.ts';
  import { parseRoute, emptyPlayerFile } from '../lib/index.ts';
  import Home from './Home.svelte';
  import PlayerSheet from './PlayerSheet.svelte';

  let { files }: { files: Record<string, PlayerFile> } = $props();
  let hash = $state(location.hash);
  $effect(() => {
    const on = () => (hash = location.hash);
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  });
  // 基準11: 型に合わない指標ファイルは画面を描く前にエラーを出す
  const errors = Object.values(files).flatMap((f) => validatePlayerFile(f));
  const route = $derived(parseRoute(hash));
  const player = $derived(route.page === 'player' ? ROSTER.find((p) => p.id === route.id) : undefined);
</script>

<main>
  <header><a href="#/">LTK Finale シミュレーター</a></header>
  {#if errors.length}
    <section class="card" role="alert">
      <h2>指標ファイルのエラー</h2>
      <ul>{#each errors as e}<li>{e}</li>{/each}</ul>
    </section>
  {:else if player}
    <PlayerSheet {player} file={files[player.id] ?? emptyPlayerFile(player.id)} />
  {:else}
    <Home />
  {/if}
</main>
