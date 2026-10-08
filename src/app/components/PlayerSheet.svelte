<script lang="ts">
  import type { Player } from '../../data/roster.ts';
  import type { PlayerFile } from '../../data/types.ts';
  import { playerView, placeholderAvatar, overallScore, formatScore, TEAM_INFO, METRIC_LABEL } from '../lib/index.ts';
  import Radar from './Radar.svelte';
  import Emblem from './Emblem.svelte';
  import RoleGlyph from './RoleGlyph.svelte';

  let { player, file }: { player: Player; file: PlayerFile } = $props();
  const view = $derived(playerView(player, file));
  const avatar = $derived(placeholderAvatar(player));
  const info = $derived(TEAM_INFO[player.team]);
  const overall = $derived(overallScore(view.axes.map((a) => a.score)));
  // 複数の軸の根拠を同時に開ける(QA 指摘 L3)
  let open = $state<string[]>([]);
  const toggle = (label: string) => (open = open.includes(label) ? open.filter((x) => x !== label) : [...open, label]);
</script>

<article class="sheet" style={`--team:${avatar.color}`}>
  <section class="portrait frame">
    <!-- 基準8: 公開版は画像を使わない代替表示(紋章・頭文字・ロール) -->
    <div class="portrait-art" role="img" aria-label={`${view.name} の代替表示`}>
      <Emblem petals={info.petals} color={avatar.color} />
      <div class="initial">{avatar.initial}</div>
      <div class="badge"><RoleGlyph role={view.role} /> {view.role}</div>
    </div>
    <div class="nameplate">
      <p class="eyebrow">{view.tier}</p>
      <h1 tabindex="-1">{view.name}</h1>
      <div class="house-line"><b>{info.name}</b> · {view.team}</div>
      <hr class="rule" />
      <p class="eyebrow">Overall</p>
      <div class="overall"><span class="num foil">{formatScore(overall)}</span></div>
    </div>
  </section>

  <section class="stats frame">
    <p class="eyebrow">Five Virtues</p>
    <div class="radar">
      <Radar scores={view.axes.map((a) => a.score)} labels={view.axes.map((a) => a.label)} color={avatar.color} />
    </div>
    <ul class="lines">
      {#each view.axes as a, i}
        <li class="line" style={`animation-delay:${200 + i * 70}ms`}>
          <button onclick={() => toggle(a.label)} aria-expanded={open.includes(a.label)}>
            <span class="label-text">{a.label}</span>
            <span class="value" class:na={a.score === null}>{a.display}</span>
            <span class="bar" class:na={a.score === null}>
              {#if a.score !== null}<i style={`width:${a.score * 10}%`}></i>{/if}
            </span>
          </button>
          {#if open.includes(a.label)}
            <!-- 基準3: 計算に使った指標・重み・出典・取得日 -->
            <div class="evidence">
              {#if a.components.length}
                <table>
                  <thead>
                    <tr><th>指標</th><th>値</th><th>点</th><th>重み</th><th>出典・根拠</th><th>取得日</th></tr>
                  </thead>
                  <tbody>
                    {#each a.components as c}
                      <tr>
                        <td class="metric" data-k="指標">{c.label}</td>
                        <td data-k="値">{c.raw}</td>
                        <td class="num" data-k="点">{c.display}</td>
                        <td data-k="重み">{c.weight}</td>
                        <td data-k="出典">{c.source}{#if c.rationale}<span class="why">{c.rationale}</span>{/if}</td>
                        <td data-k="取得日">{c.retrievedAt || '—'}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {/if}
              {#if a.missing.length}
                <p class="missing-note">まだ集まっていない指標: {a.missing.map((m) => METRIC_LABEL[m] ?? m).join(' · ')}</p>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
</article>
