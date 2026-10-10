<script lang="ts">
  // F-014 Task-4: 試合の根拠の節(基準 20〜25)。日程の箱の行の直下に開く
  // F-014 Task-7: 結論の直後に 3 行の勝率(基準31。勝率表のファイルに無ければ出さない)と p_ext の添え書き(基準33)、
  // 内訳は「レーン(個人)」「マクロ(チーム)」の 2 層(基準32)。マクロの層に外部の見立ての小節(基準33)
  import { matchStory, type StoryInput } from './story.ts';
  import { loadExternalViews, loadRatings, loadTeamEvaluation } from './data.ts';

  let { input }: { input: StoryInput } = $props();
  const story = $derived(matchStory(input, loadRatings(), loadTeamEvaluation(), loadExternalViews()));
  const external = $derived(story.ok ? [{ team: input.a, ex: story.layers.macro.external.a }, { team: input.b, ex: story.layers.macro.external.b }] : []);
</script>

<div class="story" role="region" aria-label="この予想の根拠">
  {#if !story.ok}
    <p class="story-none">根拠を出せる材料がありません({story.reason})</p>
  {:else}
    <p class="headline">{story.headline}</p>
    {#if story.layers.teamSentence}<p class="team-sentence">{story.layers.teamSentence}</p>{/if}
    {#if story.layers.lane.p !== null && story.layers.macro.p !== null}
      <div class="layers">
        <p class="layers-cap">{input.a} の勝率の 2 層</p>
        <ul>
          <li>レーン(個人)の相対勝率 <b>{story.layers.lane.p}%</b></li>
          <li>
            マクロ(チーム)の相対勝率 <b>{story.layers.macro.p}%</b>
            {#if story.layers.macro.pExt !== null}<small class="sub">うち外部の見立てだけなら {story.layers.macro.pExt}%</small>{/if}
          </li>
          <li>掛け合わせた試合の勝率 <b>{story.layers.combined.p}%</b></li>
        </ul>
      </div>
    {/if}
    <h4 class="layer-title">レーン(個人)</h4>
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
    <h4 class="layer-title">マクロ(チーム)</h4>
    <div class="scroll">
      <table class="breakdown macro">
        <thead>
          <tr><th>項目</th><th>{input.a}</th><th>{input.b}</th></tr>
        </thead>
        <tbody>
          <tr class="m-total">
            <th scope="row">マクロの点数 M</th>
            <td><b>{story.layers.macro.M.a}</b></td>
            <td><b>{story.layers.macro.M.b}</b></td>
          </tr>
          {#each story.layers.macro.parts as pt (pt.key)}
            <tr>
              <th scope="row">{pt.label}</th>
              <td><b>{pt.a}</b>{#if pt.reasonA}<span class="reason">{pt.reasonA}</span>{/if}</td>
              <td><b>{pt.b}</b>{#if pt.reasonB}<span class="reason">{pt.reasonB}</span>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="note">M は連携の厚み・司令塔の素点の平均。素点はチームの評価の相対評価の前の値</p>
    <p class="ext-title">外部の見立て(元プロ・解説)</p>
    <div class="ext">
      {#each external as { team, ex } (team)}
        <div class="ext-side">
          <p class="ext-head">{team} <span class="ext-e">E <b>{ex.E}</b></span><span class="ext-count">({ex.count} 件)</span></p>
          {#if ex.items.length}
            <ul>
              {#each ex.items as it}
                <li>
                  <span class="tag">{it.direction}{it.strength ? `・${it.strength}` : ''}</span>
                  {it.speakerKind ? `${it.speakerKind} ` : ''}{it.speaker}{#if it.self}<span class="unv">(自チーム)</span>{/if}: {it.summary}
                  {#if it.url}<a href={it.url} target="_blank" rel="noopener noreferrer">出典</a>{:else if it.source}<span class="unv">({it.source})</span>{/if}
                  {#if it.date}<span class="unv">{it.date}</span>{/if}
                </li>
              {/each}
            </ul>
          {:else}
            <p class="muted">外部の見立ては記録なし</p>
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
  /* 結論の直下のチームの層の一文 */
  .team-sentence { margin: -0.2rem 0 0.5rem; font-family: var(--serif-jp); font-size: 0.92rem; color: var(--ivory); }
  .story-none { margin: 0; color: var(--ivory-dim); }
  /* 基準31: 結論の直後の 3 行 */
  .layers { margin: 0 0 0.5rem; padding: 0.45rem 0.6rem; border: 1px solid var(--line); border-radius: 6px; background: rgba(0, 0, 0, 0.16); }
  .layers-cap { margin: 0 0 0.2rem; font-size: 0.72rem; letter-spacing: 0.06em; color: var(--gold); }
  .layers ul { margin: 0; padding-left: 1.1rem; }
  .layers li { margin: 0.1rem 0; }
  .layers b { color: var(--gold-hi); font-variant-numeric: tabular-nums; margin-left: 0.2rem; }
  /* 基準32: 2 層の見出し。マクロの表は理由を折り返す */
  .layer-title { margin: 0.6rem 0 0.3rem; font-family: var(--caps); font-size: 0.8rem; font-weight: 600; letter-spacing: 0.1em; color: var(--gold); }
  .breakdown.macro { min-width: 0; }
  .breakdown.macro td { white-space: normal; }
  .breakdown.macro th[scope='row'] { white-space: nowrap; }
  .m-total th, .m-total td { border-bottom: 1px solid rgba(255, 255, 255, 0.2); }
  .reason { display: block; margin-top: 0.1rem; font-size: 0.74rem; color: var(--ivory-dim); }
  .note { margin: 0.3rem 0 0; font-size: 0.74rem; color: var(--ivory-dim); }
  /* 基準33: p_ext の添え書きと、外部の見立ての小節 */
  .sub { display: block; font-size: 0.74rem; color: var(--ivory-dim); }
  .ext-title { margin: 0.6rem 0 0.3rem; font-size: 0.78rem; letter-spacing: 0.06em; color: var(--gold); }
  .ext { display: grid; grid-template-columns: 1fr; gap: 0.4rem 1rem; }
  @media (min-width: 720px) { .ext { grid-template-columns: 1fr 1fr; } }
  .ext-head { margin: 0 0 0.2rem; font-weight: 600; }
  .ext-e { margin-left: 0.4rem; font-weight: 400; color: var(--ivory-dim); }
  .ext-e b { color: var(--gold-hi); margin-left: 0.2rem; font-variant-numeric: tabular-nums; }
  .ext-count { margin-left: 0.3rem; font-weight: 400; font-size: 0.74rem; color: var(--ivory-dim); }
  .ext ul { margin: 0; padding-left: 1.1rem; }
  .ext li { margin: 0.15rem 0; }
  .ext li a { color: var(--gold-hi); margin-left: 0.3rem; }
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
