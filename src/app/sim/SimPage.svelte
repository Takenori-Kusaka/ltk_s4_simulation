<script lang="ts">
  // F-013 Task-1 / F-014 Task-2: 全試合の予想のページ(優勝候補の要約 → 順位表 → Day 1〜6 の箱 → MASTERS CUP → 計算の根拠の折りたたみ)
  import { championSummary, noDataNotice, runSimulation, simulationView, stageNotice, tierTables, type WinratesFile } from './view.ts';
  import { allDays, dayBox, standings } from '../schedule/view.ts';
  import DayBox from '../schedule/DayBox.svelte';
  import StandingsBoard from '../schedule/StandingsBoard.svelte';
  import Emblem from '../components/Emblem.svelte';

  let { winrates }: { winrates?: unknown } = $props();
  const notice = noDataNotice(winrates);
  const file = notice ? null : (winrates as WinratesFile);
  // 基準2(F-013): 開いたときに 1 回だけ実行する
  const simOut = file ? runSimulation(file) : null;
  const sim = file && simOut ? simulationView(simOut, file) : null;
  const champions = simOut ? championSummary(simOut) : [];
  const table = file && simOut ? standings(file, simOut) : null;
  const days = allDays();
  const regular = file ? days.filter((d) => d.kind === 'regular').map((d) => dayBox(file, d)) : [];
  const masters = file ? days.filter((d) => d.kind === 'masters').map((d) => dayBox(file, d)) : [];
  const tables = file ? tierTables(file) : [];
  const when = (iso: string) => new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
</script>

<section class="hero">
  <p class="eyebrow">Forecast · 全試合の予想</p>
  <h1 tabindex="-1"><span class="foil">誰が玉座を取るのか</span></h1>
  {#if notice}
    <p class="sub" role="alert">{notice}</p>
  {:else if file && sim}
    <p class="sub">{stageNotice(file)} · 10,000 回のシミュレーションから</p>
    <p class="meta">種 {sim.seed} · 試行 {sim.trials.toLocaleString('ja-JP')} 回 · 勝率表の計算日時 {when(sim.computedAt)}</p>
  {/if}
  <p class="hero-links"><a class="chip" href="#/">四つの王家へ戻る ›</a></p>
</section>

{#if file && sim && table}
  <section class="champions frame">
    <h2>優勝候補</h2>
    <ol class="champ-list">
      {#each champions as c, i}
        <li style={`--team:${c.color}`}>
          <span class="rank">{i + 1}</span>
          <span class="emb"><Emblem petals={c.petals} color={c.color} /></span>
          <span class="name"><a href={`#/team/${c.team}`}>{c.name}</a><small>{c.team}</small></span>
          <span class="champ-bar"><span class="champ-fill" style={`width:${c.championNum}%; background:${c.color}`}></span></span>
          <span class="pct">{c.champion}<small>%</small></span>
        </li>
      {/each}
    </ol>
    <p class="note">優勝 = Playoffs の勝者。全試合の勝率から 10,000 回の大会を試行した割合</p>
  </section>

  <div class="forecast">
    <StandingsBoard view={table} sub="全ステージ · 期待値" />
  </div>

  <section class="days">
    <h2 class="sec-title">Regular Stage</h2>
    <div class="day-grid">
      {#each regular as box}
        <DayBox view={box} />
      {/each}
    </div>
    <h2 class="sec-title">MASTERS CUP</h2>
    <div class="day-grid">
      {#each masters as box}
        <DayBox view={box} />
      {/each}
    </div>
  </section>

  <details class="frame basis">
    <summary>計算の根拠を見る(数字の出どころ。階級ごとの 6 組の表)</summary>
    <p class="note">勝率は β × (戦力 S の差)の対数オッズから。結果・仕上がり・気持ち・ドラフトの項は未反映</p>
    {#each tables as t}
      <section class="basis-sec">
        <h3>{t.tier}</h3>
        <p class="note">β = {t.beta}({t.betaBasis})</p>
        <div class="scroll">
          <table>
            <thead><tr><th>チーム</th><th>戦力 S</th><th>備考</th></tr></thead>
            <tbody>
              {#each t.teams as r}
                <tr style={`--team:${r.color}`}>
                  <th scope="row"><span class="dot"></span>{r.name}<span class="code">{r.team}</span></th>
                  <td>{r.S}</td>
                  <td class="muted">{r.reason ?? ''}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="scroll">
          <table>
            <thead><tr><th>組</th><th>左の勝率</th><th>右の勝率</th><th>備考</th></tr></thead>
            <tbody>
              {#each t.pairs as p}
                <tr>
                  <th scope="row">{p.a} vs {p.b}</th>
                  <td class:strong={Number(p.pA) > 50}>{p.pA}%</td>
                  <td class:strong={Number(p.pB) > 50}>{p.pB}%</td>
                  <td class="muted">{p.dataMissing ?? ''}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/each}
  </details>
{/if}

<style>
  .meta { opacity: 0.7; font-size: 0.82rem; margin: 0.2rem 0 0; }
  .champions { margin: 1rem auto; max-width: 64rem; padding: 1.2rem 1rem; }
  .champions h2, .basis h3 { margin: 0 0 0.6rem; font-family: var(--caps); letter-spacing: 0.08em; color: var(--gold-hi); }
  .champ-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
  .champ-list li { display: grid; grid-template-columns: 1.6rem 2rem minmax(7rem, 1fr) minmax(4rem, 3fr) 5.5rem; align-items: center; gap: 0.6rem; }
  .rank { font-family: var(--caps); color: var(--gold); text-align: center; }
  .emb { width: 2rem; height: 2rem; display: inline-flex; }
  .emb :global(svg) { width: 100%; height: 100%; }
  .name a { color: var(--ivory); text-decoration: none; font-family: var(--caps); letter-spacing: 0.04em; }
  .name small { margin-left: 0.4rem; opacity: 0.6; }
  /* app.css の .bar(選手のページの棒)と衝突しない名前にする */
  .champ-bar { display: block; width: 100%; height: 10px; border-radius: 5px; background: var(--velvet-3); overflow: hidden; }
  .champ-fill { display: block; height: 100%; }
  .pct { font-family: var(--serif-latin); font-size: 1.6rem; font-weight: 700; text-align: right; color: var(--ivory); }
  .pct small { font-size: 0.8rem; color: var(--ivory-dim); margin-left: 0.1rem; }
  .note { opacity: 0.75; font-size: 0.85rem; margin: 0.5rem 0 0; }
  .forecast { max-width: 64rem; margin: 0 auto; padding: 0 1rem; }
  .days { max-width: 64rem; margin: 1rem auto; padding: 0 1rem; }
  .sec-title { font-family: var(--caps); letter-spacing: 0.12em; color: var(--gold-hi); margin: 1.2rem 0 0.4rem; text-align: center; }
  /* 基準11: 幅 360px では箱を縦に並べる */
  .day-grid { display: grid; grid-template-columns: 1fr; gap: 0.8rem; }
  @media (min-width: 900px) { .day-grid { grid-template-columns: 1fr 1fr; } }
  .basis { max-width: 64rem; margin: 1rem auto 2rem; padding: 0.8rem 1rem; }
  .basis summary { cursor: pointer; font-family: var(--caps); letter-spacing: 0.06em; color: var(--ivory-dim); }
  .basis-sec { margin-top: 0.8rem; }
  .scroll { overflow-x: auto; margin: 0.4rem 0 0.8rem; }
  table { border-collapse: collapse; width: 100%; min-width: 28rem; font-size: 0.9rem; }
  th, td { padding: 0.3rem 0.5rem; text-align: right; white-space: nowrap; border-bottom: 1px solid rgba(255, 255, 255, 0.12); }
  th[scope='row'], thead th:first-child { text-align: left; }
  .dot { display: inline-block; width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--team, #999); margin-right: 0.4rem; vertical-align: middle; }
  .code { opacity: 0.6; margin-left: 0.4rem; font-size: 0.8rem; }
  .strong { font-weight: 700; }
  .muted { opacity: 0.7; white-space: normal; min-width: 10rem; }
  @media (max-width: 420px) {
    .champ-list li { grid-template-columns: 1.2rem 1.6rem minmax(5rem, 1fr) minmax(3rem, 2fr) 4.4rem; gap: 0.4rem; }
    .pct { font-size: 1.2rem; }
  }
</style>
