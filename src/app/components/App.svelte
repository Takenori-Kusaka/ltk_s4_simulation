<script lang="ts">
  import { tick } from 'svelte';
  import { ROSTER } from '../../data/roster.ts';
  import type { PlayerFile } from '../../data/types.ts';
  import { validatePlayerFile } from '../../data/validate.ts';
  import { parseRoute, pageTitle, TEAM_INFO } from '../lib/index.ts';
  import Home from './Home.svelte';
  import PlayerSheet from './PlayerSheet.svelte';
  import Emblem from './Emblem.svelte';
  import TeamPage from '../team/TeamPage.svelte';
  import ComparePage from '../compare/ComparePage.svelte';
  import MetaPage from '../meta/MetaPage.svelte';
  import SimPage from '../sim/SimPage.svelte';
  import type { RatingsFile } from '../rating/view.ts';

  let { files, ratings, winrates }: { files: Record<string, PlayerFile>; ratings?: RatingsFile; winrates?: unknown } = $props();
  let hash = $state(location.hash);
  let content: HTMLElement | undefined = $state();

  // 画面ごとのスクロール位置を覚え、戻ったときに元の位置へ戻す(QA 指摘 M2)
  const positions = new Map<string, number>();
  $effect(() => {
    const on = async () => {
      positions.set(hash, scrollY);
      hash = location.hash;
      await tick();
      scrollTo({ top: positions.get(hash) ?? 0 });
      // 画面の遷移をスクリーンリーダーへ伝える(QA 指摘 L2)
      content?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  });
  // 基準11: 型に合わない指標ファイルは画面を描く前にエラーを出す
  const errors = $derived(Object.values(files).flatMap((f) => validatePlayerFile(f)));
  const route = $derived(parseRoute(hash));
  const player = $derived(route.page === 'player' ? ROSTER.find((p) => p.id === route.id) : undefined);
  const teamOfPage = $derived(player?.team ?? (route.page === 'team' ? route.team : undefined));
  $effect(() => {
    document.title = pageTitle(route);
  });
</script>

<main>
  <header class="masthead">
    <a class="brand" href="#/">
      <span class="brand-mark"><Emblem petals={14} color="#c9a24a" /></span>
      <span>LTK · SEASON FINALE</span>
    </a>
    {#if teamOfPage}
      <!-- スマホでも戻り道を残す(QA 指摘 M3)。選手のページではチームへ、チームのページでは一覧へ -->
      <nav class="crumb" aria-label="現在の位置">
        <a href="#/">ALL HOUSES</a>
        {#if player}
          <span aria-hidden="true">·</span>
          <a href={`#/team/${player.team}`}>‹ {TEAM_INFO[player.team].name.toUpperCase()}</a>
        {:else}
          <span aria-hidden="true">·</span>
          <span>{TEAM_INFO[teamOfPage].name.toUpperCase()}</span>
        {/if}
      </nav>
    {/if}
  </header>
  <div bind:this={content}>
    {#if errors.length}
      <section class="frame alert" role="alert">
        <p class="eyebrow">Data error</p>
        <h1 tabindex="-1">指標ファイルのエラー</h1>
        <ul>
          {#each errors as e}<li>{e}</li>{/each}
        </ul>
      </section>
    {:else if route.page === 'notfound'}
      <!-- 不正な経路は黙って一覧に戻さず案内する(QA 指摘 M4) -->
      <section class="frame alert notfound">
        <p class="eyebrow">Not found</p>
        <h1 tabindex="-1">この頁は予言の書にありません</h1>
        <p>「{route.hash}」に当たる選手やチームは見つかりませんでした。</p>
        <p><a class="chip" href="#/">四つの王家の一覧へ戻る</a></p>
      </section>
    {:else if route.page === 'meta'}
      <MetaPage {ratings} />
    {:else if route.page === 'sim'}
      <SimPage {winrates} />
    {:else if route.page === 'compare'}
      {#key route.targets.join('/')}
        <ComparePage targets={route.targets} {ratings} />
      {/key}
    {:else if route.page === 'compare-start'}
      <!-- F-008 基準17: 1つ目の対象だけで始め、2つ目以降を選ばせる -->
      {#key route.target}
        <ComparePage targets={[route.target]} {ratings} />
      {/key}
    {:else if route.page === 'team'}
      {#key route.team}
        <TeamPage team={route.team} {ratings} />
      {/key}
    {:else if player}
      {#key player.id}
        <PlayerSheet {player} rating={ratings?.players.find((r) => r.playerId === player.id)} computedAt={ratings?.computedAt} />
      {/key}
    {:else}
      <Home />
    {/if}
  </div>
</main>
