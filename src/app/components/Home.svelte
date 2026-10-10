<script lang="ts">
  import { ROSTER } from '../../data/roster.ts';
  import { TEAMS, TIERS } from '../../sim/types.ts';
  import { TEAM_INFO, daysUntilOpening } from '../lib/index.ts';
  import Emblem from './Emblem.svelte';
  import RoleGlyph from './RoleGlyph.svelte';
  // F-014 Task-1: 直近の試合日の予想と順位表(4 王家の一覧の上)
  import DayBox from '../schedule/DayBox.svelte';
  import StandingsBoard from '../schedule/StandingsBoard.svelte';
  import { dayBox, forecastHeading, nearestDay, standings } from '../schedule/view.ts';
  import { noDataNotice, runSimulation, type WinratesFile } from '../sim/view.ts';
  // F-014 Task-3 基準16・17: 推しチーム(そのブラウザの localStorage にだけ保存し、外部へ送らない)
  import { readFavorite, writeFavorite } from '../schedule/fan.ts';
  import type { TeamId } from '../../sim/types.ts';

  let { winrates }: { winrates?: unknown } = $props();
  const now = new Date();
  const days = daysUntilOpening(now);
  const tiersTopDown = [...TIERS].reverse();
  const notice = noDataNotice(winrates);
  const file = notice ? null : (winrates as WinratesFile);
  const ref = nearestDay(now);
  const box = file ? dayBox(file, ref) : null;
  // 基準2(非機能): シミュレーションは 1 回だけ
  const table = file ? standings(file, runSimulation(file)) : null;
  // 基準26・30(再判定 3): 順位表は全日程の予想。最後の日より後は見出しを替える
  const sub = 'SEASON FORECAST · 全日程の予想';
  const heading = forecastHeading(now);
  // 基準16: localStorage が無効(プライベートモード等)なら保存先を null にし、選択は画面の中だけで有効
  const storage = (() => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  })();
  let favorite = $state<TeamId | null>(readFavorite(storage));
  const choose = (team: TeamId | null) => {
    favorite = team;
    writeFavorite(storage, team);
  };
</script>

{#snippet favLink()}
  <!-- 基準16: 「<英語のチーム名> は勝てるのか」への導線(推しチームを選んでいる間だけ、箱の近く) -->
  {#if favorite}
    <p class="forecast-links"><a class="chip fav-go" href={`#/team/${favorite}`} style={`--team:${TEAM_INFO[favorite].color}`}>{TEAM_INFO[favorite].name} は勝てるのか ›</a></p>
  {/if}
{/snippet}

<section class="hero">
  <p class="eyebrow">League The k4sen · 2026.10.15 — 11.22</p>
  <h1 tabindex="-1"><span class="foil">Season Finale</span></h1>
  <p class="sub">四つの花の王家、六十の名。最後の玉座を占う予言の書。</p>
  {#if days > 0}
    <p class="countdown">開幕まで <strong>{days}</strong> 日</p>
  {:else}
    <p class="countdown">大会 開催中</p>
  {/if}
  <p class="hero-links"><a class="chip" href="#/sim">全試合の予想 ›</a> <a class="chip" href="#/meta">いまのメタを知る ›</a></p>
</section>

<div class="forecast">
  <p class="eyebrow">{heading.past ? 'Last match day' : 'Next match day'} · {heading.title}</p>
  {#if heading.note}<p class="forecast-note">{heading.note}</p>{/if}
  <!-- F-014 基準16: 推しチームの選択と解除(保存はこのブラウザの中だけ。選んでいる間は箱の側と順位表の行を強調) -->
  <div class="fav-picker" role="group" aria-label="推しチーム">
    <span class="fav-label">推しチーム</span>
    {#each TEAMS as team}
      <button type="button" class="chip fav" class:on={favorite === team} aria-pressed={favorite === team} style={`--team:${TEAM_INFO[team].color}`} onclick={() => choose(team)}>{team} · {TEAM_INFO[team].name}</button>
    {/each}
    {#if favorite}
      <button type="button" class="chip fav clear" onclick={() => choose(null)}>解除</button>
    {/if}
  </div>
  {#if notice}
    <section class="frame alert"><p>{notice}</p></section>
    {@render favLink()}
  {:else if box && table}
    <DayBox view={box} highlight={favorite ?? undefined} />
    {@render favLink()}
    <StandingsBoard view={table} {sub} highlight={favorite ?? undefined} />
    <p class="forecast-links"><a class="chip" href="#/sim">全試合の予想と優勝確率 ›</a></p>
  {/if}
</div>

<div class="houses">
  {#each TEAMS as team, i}
    {@const info = TEAM_INFO[team]}
    <section class="house frame" style={`--team:${info.color}; animation-delay:${i * 90}ms`}>
      <div class="house-head">
        <Emblem petals={info.petals} color={info.color} />
        <div>
          <h2 class="house-name"><a href={`#/team/${team}`}>{info.name} <span class="go">›</span></a></h2>
          <div class="house-motto">{info.flower}の{info.regalia} · {team}</div>
        </div>
      </div>
      <hr class="rule" />
      {#each tiersTopDown as tier}
        <div class="tier-row">
          <span class="eyebrow">{tier}</span>
          <div class="chips">
            {#each ROSTER.filter((p) => p.team === team && p.tier === tier) as p}
              <a class="chip" href={`#/player/${p.id}`} title={`${p.name} / ${p.role}`}>
                <span class="role"><RoleGlyph role={p.role} /></span>
                <span>{p.name}</span>
              </a>
            {/each}
          </div>
        </div>
      {/each}
    </section>
  {/each}
</div>
