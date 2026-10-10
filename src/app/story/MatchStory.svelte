<script lang="ts">
  // F-014 Task-4: 試合の根拠の節(基準 20〜25)。日程の箱の行の直下に開く
  import { matchStory, type StoryInput } from './story.ts';
  import { loadRatings, loadTeamEvaluation } from './data.ts';

  let { input }: { input: StoryInput } = $props();
  const story = $derived(matchStory(input, loadRatings(), loadTeamEvaluation()));
</script>

<div class="story" role="region" aria-label="この予想の根拠">
  {#if !story.ok}
    <p class="story-none">根拠を出せる材料がありません({story.reason})</p>
  {:else}
    <p class="headline">{story.headline}</p>
    <div class="scroll">
      <table class="breakdown">
        <thead>
          <tr><th>項目</th><th>{input.a}</th><th>{input.b}</th><th>差</th><th>影響</th><th>差の大きい軸</th><th></th></tr>
        </thead>
        <tbody>
          {#each story.rows as r (r.key)}
            <tr class={`size-${r.size}`}>
              <th scope="row">{r.label}</th>
              <td>{#if r.left.href}<a href={r.left.href}>{r.left.name}</a>{:else}{r.left.name}{/if} <b>{r.left.score}</b></td>
              <td>{#if r.right.href}<a href={r.right.href}>{r.right.name}</a>{:else}{r.right.name}{/if} <b>{r.right.score}</b></td>
              <td class="num">{r.diff}</td>
              <td><span class="size">{r.size}</span></td>
              <td class="axes">{#each r.axes as ax, i}{i ? '、' : ''}{ax.label} {ax.left} vs {ax.right}{/each}</td>
              <td>{#if r.compareHref}<a class="chip small" href={r.compareHref}>比べる ›</a>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="evidence">
      {#each story.evidence as e (e.id)}
        <div class="ev">
          <p class="ev-name"><a href={`#/player/${e.id}`}>{e.name}</a> の出典つきの根拠</p>
          {#if e.items.length}
            <ul>
              {#each e.items as it}
                <li><span class="tag">{it.kind}{it.strength ? `・${it.strength}` : ''}</span> {it.text} <a href={it.source} target="_blank" rel="noopener noreferrer">出典</a>{#if it.marks.length}<span class="unv">未確認({it.marks.join('・')})</span>{/if}</li>
              {/each}
            </ul>
          {:else}
            <p class="muted">出典つきの根拠は見当たらない</p>
          {/if}
        </div>
      {/each}
    </div>
    <div class="scope">
      <p class="scope-title">この予想に入っているもの</p>
      <ul>{#each story.included as t}<li>{t}</li>{/each}</ul>
      <p class="scope-title">まだ入っていないもの</p>
      <ul>{#each story.excluded as x}<li>{x.text}<span class="muted">({x.feature})</span></li>{/each}</ul>
    </div>
  {/if}
</div>

<style>
  .story { margin: 0.5rem 0 0.4rem; padding: 0.7rem 0.8rem; border-left: 2px solid var(--gold-lo); background: rgba(0, 0, 0, 0.22); border-radius: 0 6px 6px 0; font-size: 0.88rem; }
  .headline { margin: 0 0 0.5rem; font-family: var(--serif-jp); font-size: 1rem; color: var(--ivory); }
  .story-none { margin: 0; color: var(--ivory-dim); }
  /* 基準11: 表は横に送れる枠の中。枠の幅は親に合わせ、親を広げない */
  .scroll { overflow-x: auto; max-width: 100%; min-width: 0; }
  .breakdown { border-collapse: collapse; width: 100%; min-width: 34rem; font-size: 0.84rem; }
  .breakdown th, .breakdown td { padding: 0.3rem 0.45rem; text-align: left; border-bottom: 1px solid rgba(255, 255, 255, 0.1); white-space: nowrap; vertical-align: top; }
  .breakdown thead th { color: var(--ivory-dim); font-weight: 600; font-size: 0.72rem; letter-spacing: 0.08em; }
  .breakdown a { color: var(--ivory); text-decoration: none; border-bottom: 1px dotted var(--line); }
  .breakdown b { color: var(--gold-hi); margin-left: 0.2rem; }
  .num { font-variant-numeric: tabular-nums; }
  .size { display: inline-block; min-width: 1.6rem; text-align: center; border-radius: 3px; padding: 0 0.3rem; background: var(--velvet-3); color: var(--ivory-dim); }
  tr.size-大 .size { background: var(--gold-lo); color: var(--ivory); }
  tr.size-中 .size { background: var(--velvet-3); color: var(--gold-hi); }
  .axes { white-space: normal; min-width: 12rem; color: var(--ivory-dim); }
  .chip.small { padding: 0.05rem 0.5rem; font-size: 0.75rem; }
  .evidence { margin-top: 0.6rem; display: grid; gap: 0.4rem; }
  .ev-name { margin: 0 0 0.2rem; font-weight: 600; }
  .ev-name a { color: var(--ivory); text-decoration: none; }
  .ev ul { margin: 0; padding-left: 1.1rem; }
  .ev li { margin: 0.15rem 0; }
  .ev li a { color: var(--gold-hi); margin-left: 0.3rem; }
  .tag { font-size: 0.72rem; color: var(--gold); margin-right: 0.3rem; }
  .unv { font-size: 0.7rem; color: var(--muted); margin-left: 0.3rem; }
  .muted { color: var(--ivory-dim); margin: 0; }
  .scope { margin-top: 0.6rem; display: grid; grid-template-columns: 1fr; gap: 0.2rem 1rem; }
  @media (min-width: 720px) { .scope { grid-template-columns: 1fr 1fr; } .scope .scope-title:nth-of-type(2) { grid-column: 2; grid-row: 1; } }
  .scope-title { margin: 0; font-size: 0.78rem; letter-spacing: 0.06em; color: var(--gold); }
  .scope ul { margin: 0; padding-left: 1.1rem; color: var(--ivory-dim); }
</style>
