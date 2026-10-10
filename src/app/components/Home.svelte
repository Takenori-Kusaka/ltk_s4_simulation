<script lang="ts">
  import { ROSTER } from '../../data/roster.ts';
  import { TEAMS, TIERS } from '../../sim/types.ts';
  import { TEAM_INFO, daysUntilOpening } from '../lib/index.ts';
  import Emblem from './Emblem.svelte';
  import RoleGlyph from './RoleGlyph.svelte';
  // F-014 Task-1: 直近の試合日の予想と順位表(4 王家の一覧の上)
  import DayBox from '../schedule/DayBox.svelte';
  import StandingsBoard from '../schedule/StandingsBoard.svelte';
  import { dayBox, nearestDay, standings } from '../schedule/view.ts';
  import { noDataNotice, runSimulation, type WinratesFile } from '../sim/view.ts';

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
  const sub = ref.kind === 'regular' ? `REGULAR STAGE / DAY - ${ref.day}` : `MASTERS CUP - ${ref.cup}`;
</script>

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
  <p class="eyebrow">Next match day · 次の試合日の予想</p>
  {#if notice}
    <section class="frame alert"><p>{notice}</p></section>
  {:else if box && table}
    <DayBox view={box} />
    <StandingsBoard view={table} {sub} />
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
