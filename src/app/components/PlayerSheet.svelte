<script lang="ts">
  import type { Player } from '../../data/roster.ts';
  import type { PlayerRating } from '../../rating/build.ts';
  import { placeholderAvatar, overallScore, formatScore, TEAM_INFO } from '../lib/index.ts';
  import { ratingAxesView, formView } from '../rating/view.ts';
  import Radar from './Radar.svelte';
  import Emblem from './Emblem.svelte';
  import RoleGlyph from './RoleGlyph.svelte';
  import { jstDate, nextOpponent, opponentCompareHref } from '../compare/opponent.ts';

  let { player, rating, computedAt }: { player: Player; rating: PlayerRating | undefined; computedAt?: string } = $props();
  const axes = $derived(ratingAxesView(rating));
  const form = $derived(formView(rating));
  const opponent = $derived.by(() => {
    const now = new Date();
    const o = nextOpponent(player.id, jstDate(now));
    const href = opponentCompareHref(player.id, now);
    return o && href ? { ...o, href } : null;
  });
  const avatar = $derived(placeholderAvatar(player));
  const info = $derived(TEAM_INFO[player.team]);
  const overall = $derived(overallScore(axes.map((a) => a.score)));
  // 複数の軸の説明を同時に開ける(QA 指摘 L3)
  let open = $state<string[]>([]);
  const toggle = (key: string) => (open = open.includes(key) ? open.filter((x) => x !== key) : [...open, key]);
</script>

<article class="sheet" style={`--team:${avatar.color}`}>
  <section class="portrait frame">
    <!-- 基準8: 公開版は画像を使わない代替表示(紋章・頭文字・ロール) -->
    <div class="portrait-art" role="img" aria-label={`${player.name} の代替表示`}>
      <Emblem petals={info.petals} color={avatar.color} />
      <div class="initial">{avatar.initial}</div>
      <div class="badge"><RoleGlyph role={player.role} /> {player.role}</div>
    </div>
    <div class="nameplate">
      <p class="eyebrow">{player.tier}</p>
      <h1 tabindex="-1">{player.name}</h1>
      <div class="house-line"><b>{info.name}</b> · {player.team}</div>
      <hr class="rule" />
      <p class="eyebrow">Overall</p>
      <div class="overall"><span class="num foil">{formatScore(overall)}</span></div>
      <!-- F-009 基準24: 調子の係数 -->
      <div class="form-badge" class:none={!form || form.label === '調子: 判断材料なし'}>
        <span class="eyebrow">Form</span>
        {#if form}
          <span class="form-label">{form.label}</span>
          <span class="form-coef">×{form.coefficient} · {form.effect}</span>
          <span class="form-why">{form.reason}</span>
        {:else}
          <span class="form-label">調子: 判断材料なし</span>
          <span class="form-why">評価のファイルにこの選手の評価が無い</span>
        {/if}
      </div>
      <!-- F-008 基準15・16: 次に当たる対面と比較(試合日が残っていなければ出さない) -->
      {#if opponent}
        <a class="chip compare-entry" href={opponent.href}>対面と比較 · {opponent.date.slice(5).replace('-', '/')} vs {opponent.team}</a>
      {/if}
    </div>
  </section>

  <section class="stats frame">
    <p class="eyebrow">Eight Virtues{computedAt ? ` · ${computedAt.slice(0, 10)} 時点` : ''}</p>
    <div class="radar">
      <Radar scores={axes.map((a) => a.score)} labels={axes.map((a) => a.label)} color={avatar.color}
        lines={axes.map((a) => a.line)} estimated={axes.map((a) => a.estimated)} />
    </div>
    <p class="legend">
      <span><i class="lg solid"></i>確度 高・中</span>
      <span><i class="lg dotted"></i>確度 低</span>
      <span><i class="lg missing"></i>データなし(?)</span>
      <span>* 事前値だけで推定</span>
    </p>
    <ul class="lines">
      {#each axes as a, i}
        <li class="line" style={`animation-delay:${200 + i * 70}ms`}>
          <button onclick={() => toggle(a.key)} aria-expanded={open.includes(a.key)}>
            <span class="label-text">{a.label}{a.estimated ? '*' : ''}</span>
            <span class="value" class:na={a.score === null}>
              {a.display}
              {#if a.confidence}<small class="conf" class:low={a.confidence === '低'}>確度 {a.confidence}</small>{/if}
            </span>
            <span class="bar" class:na={a.score === null} class:low={a.line === 'dotted'}>
              {#if a.score !== null}<i style={`width:${a.score * 10}%`}></i>{/if}
            </span>
          </button>
          {#if open.includes(a.key)}
            <!-- F-009 基準20: 基準・補正・縮小・LTK の項・試合数・指標の位置・根拠・確度の理由 -->
            <div class="evidence">
              {#if a.marks.length}<p class="marks">{#each a.marks as m}<span class="mark">{m}</span>{/each}</p>{/if}
              {#if a.details.length}
                <dl class="details">
                  {#each a.details as d}<dt>{d.label}</dt><dd>{d.value}</dd>{/each}
                </dl>
              {/if}
              {#if a.metrics.length}
                <table>
                  <thead><tr><th>指標</th><th>値</th><th>母集団の中での位置</th></tr></thead>
                  <tbody>
                    {#each a.metrics as m}
                      <tr>
                        <td class="metric" data-k="指標">{m.label}</td>
                        <td data-k="値">{m.value}</td>
                        <td class="num" data-k="位置">{m.position}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {/if}
              {#if a.evidence.length}
                <ul class="grounds">
                  {#each a.evidence as e}
                    <li class:unused={!e.used}>
                      <span class="ground-text">{e.text}</span>
                      <span class="ground-meta">
                        <span class="mark" class:ok={e.confirmed}>{e.confirmed ? '確認済み' : '未確認(AI 収集)'}</span>
                        {#if e.href}<a href={e.href} target="_blank" rel="noopener noreferrer">出典</a>{:else}<span>{e.source}</span>{/if}
                        {#if !e.used}<span>点数には使わない</span>{/if}
                      </span>
                    </li>
                  {/each}
                </ul>
              {/if}
              <p class="missing-note">確度{a.confidence ? ` ${a.confidence}` : ': データなし'} — {a.confidenceReason}</p>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
</article>
