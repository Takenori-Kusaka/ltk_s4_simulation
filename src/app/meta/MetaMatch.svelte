<script lang="ts">
  // F-011 基準7・8: 選手との突き合わせ(メタに強い選手と、チャンピオンごとの選手の一覧)
  import type { MetaGuide } from '../../meta/load.ts';
  import type { RatingsFile } from '../rating/view.ts';
  import { metaMatchView } from './match-view.ts';

  let { guide, ratings }: { guide: MetaGuide; ratings?: RatingsFile } = $props();
  let selectedKey = $state<number | undefined>(undefined);
  const v = $derived(metaMatchView(guide, ratings as Parameters<typeof metaMatchView>[1], selectedKey));
</script>

<section class="frame meta-sec" id="meta-players">
  <h2>メタに強い選手</h2>
  <p class="missing-note">
    段階A を 2 点、段階B を 1 点として、大会のロールで 3 試合以上使ったメタの重要チャンピオンを数えた上位 3 名(同点は名簿の順)。
  </p>
  {#if v.notice}<p class="meta-notice" role="note">{v.notice}</p>{/if}
  <div class="meta-table">
    <table>
      <thead><tr><th>ロール</th><th>1位</th><th>2位</th><th>3位</th></tr></thead>
      <tbody>
        {#each v.roles as r}
          <tr>
            <td class="metric" data-k="ロール">{r.role}</td>
            {#if r.top.length}
              {#each [0, 1, 2] as i}
                {@const p = r.top[i]}
                <td data-k={`${i + 1}位`}>
                  {#if p}
                    <a href={p.href}>{p.name}</a> <span class="meta-sub-note">{p.teamTier} · {p.points} 点</span>
                    <span class="meta-sub-note">{p.championsText}</span>
                  {:else}—{/if}
                </td>
              {/each}
            {:else}
              <td colspan="3" data-k="上位">{r.emptyText}</td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <h3 class="match-title">チャンピオンを選ぶと、得意ピックに持つ選手を出します</h3>
  {#each v.roles as r}
    <p class="meta-chips">
      <b>{r.role}</b>
      {#each r.champions as c}
        <button class="champ" class:on={selectedKey === c.key} aria-pressed={selectedKey === c.key}
          onclick={() => (selectedKey = selectedKey === c.key ? undefined : c.key)}>{c.name}<small>{c.tier}·{c.playerCount}</small></button>
      {/each}
    </p>
  {/each}
  {#if v.selected}
    <div class="meta-table" aria-live="polite">
      <p><b>{v.selected.name}</b>(段階{v.selected.tier}・{v.selected.roleLabel})</p>
      {#if v.selected.players.length}
        <table>
          <thead><tr><th>選手</th><th>チーム</th><th>試合数</th><th>勝率(縮小)</th></tr></thead>
          <tbody>
            {#each v.selected.players as p}
              <tr>
                <td class="metric" data-k="選手"><a href={p.href}>{p.name}</a></td>
                <td data-k="チーム">{p.teamTier}</td>
                <td class="num" data-k="試合数">{p.games}</td>
                <td class="num" data-k="勝率">{p.winRateText}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="missing-note">{v.selected.emptyText}</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .match-title {
    margin: 14px 0 6px;
    font-family: var(--serif-jp);
    font-size: 0.95rem;
    color: var(--gold-hi);
  }
  .meta-sub-note {
    display: block;
    font-size: 0.72rem;
    color: var(--ivory-dim);
    overflow-wrap: anywhere;
  }
  .meta-chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 6px 0;
  }
  .meta-chips button {
    font: inherit;
    cursor: pointer;
  }
  .meta-chips button.on {
    outline: 1px solid var(--gold-hi);
  }
  .meta-chips small {
    margin-left: 4px;
    color: var(--ivory-dim);
  }
</style>
