<script lang="ts">
  import { loadMetaGuide } from '../../meta/load.ts';
  import { metaPageView, type ClaimView, type RankedView } from './view.ts';

  const v = metaPageView(loadMetaGuide());
  const ROLE_LABEL: Record<string, string> = { TOP: 'TOP', JG: 'JG', MID: 'MID', ADC: 'ADC', SUP: 'SUP' };
  const markClass = (m: string) => (m === '出典' ? 'ok' : m === '推定' ? 'est' : 'unv');
</script>

{#snippet claim(c: ClaimView)}
  <span class="claim-text">{c.text}</span>
  {#each c.marks as m}
    {#if m === '出典' && c.url}
      <a class="mark ok" href={c.url} target="_blank" rel="noopener noreferrer">出典</a>
    {:else}
      <span class={`mark ${markClass(m)}`}>{m}</span>
    {/if}
  {/each}
{/snippet}

{#snippet ranked(sec: RankedView)}
  <section class="frame meta-sec">
    <h2>{sec.title}{#each sec.marks as m}<span class="mark ai">{m}</span>{/each}</h2>
    <ol class="ranked">
      {#each sec.items as it}
        <li>
          <span class="rank">{it.rank}</span>
          <div>
            <b>{it.name}</b>
            <p>{@render claim(it.reason)}</p>
          </div>
        </li>
      {/each}
    </ol>
  </section>
{/snippet}

<article class="meta-page">
  <header class="frame meta-head">
    <p class="eyebrow">Meta guide</p>
    <h1 tabindex="-1">いまのメタを知る</h1>
    <!-- 基準1: パッチ番号と更新日 -->
    <p class="meta-headline">{v.headline}</p>
    {#if v.notice}
      <!-- 基準11: 原稿が古い可能性 -->
      <p class="meta-notice" role="note">{v.notice}</p>
    {/if}
    <p class="meta-legend">
      根拠の印: <span class="mark ok">出典</span> 出典の URL あり · <span class="mark est">推定</span> 筆者の推定 ·
      <span class="mark unv">未確認</span> 出典で確かめられない · <span class="mark ai">AI 執筆</span> AI が書いた章
    </p>
  </header>

  <!-- 基準2: ロールごとの重要チャンピオン -->
  <section class="frame meta-sec">
    <h2>ロールごとの重要チャンピオン</h2>
    <div class="meta-table">
      <table>
        <thead><tr><th>ロール</th><th>段階A(最重要)</th><th>段階B(重要)</th></tr></thead>
        <tbody>
          {#each v.roles as r}
            <tr>
              <td class="metric" data-k="ロール">{ROLE_LABEL[r.role]}</td>
              <td data-k="段階A">{#each r.A as c}<span class="champ" title={c.reason.text}>{c.name}</span>{/each}</td>
              <td data-k="段階B">{#each r.B as c}<span class="champ" title={c.reason.text}>{c.name}</span>{/each}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <!-- 基準3・4: 重要度の順位と理由 -->
  {@render ranked(v.objectives)}
  {@render ranked(v.supTypes)}
  {@render ranked(v.midRoles)}

  <!-- 基準5・6・10: 章と主張の根拠の印 -->
  {#each v.chapters as ch}
    <section class="frame meta-sec" id={`meta-${ch.id}`}>
      <h2>{ch.title}{#each ch.marks as m}<span class="mark ai">{m}</span>{/each}</h2>
      <ul class="claims">
        {#each ch.claims as c}<li>{@render claim(c)}</li>{/each}
      </ul>
    </section>
  {/each}
</article>
