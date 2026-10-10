<script lang="ts">
  // F-013 Task-1: 勝率とシミュレーションの結果のページ
  import { noDataNotice, resultsNotice, runSimulation, simulationView, tierTables, type WinratesFile } from './view.ts';

  let { winrates }: { winrates?: unknown } = $props();
  const notice = noDataNotice(winrates);
  const file = notice ? null : (winrates as WinratesFile);
  const tables = file ? tierTables(file) : [];
  // 基準2: 開いたときに1回だけ実行する
  const sim = file ? simulationView(runSimulation(file), file) : null;
  const when = (iso: string) => new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
</script>

<section class="hero">
  <p class="eyebrow">Win rates · Simulation</p>
  <h1 tabindex="-1"><span class="foil">勝率とシミュレーション</span></h1>
  {#if notice}
    <p class="sub" role="alert">{notice}</p>
  {:else if file}
    <p class="sub">{resultsNotice(file)}</p>
  {/if}
  <p class="hero-links"><a class="chip" href="#/">四つの王家へ戻る ›</a></p>
</section>

{#if file && sim}
  <section class="frame sim-sec">
    <h2>大会の結果の予想</h2>
    <p class="note">F-001 のシミュレーション。種 {sim.seed} · 試行 {sim.trials.toLocaleString('ja-JP')} 回 · 勝率表の計算日時 {when(sim.computedAt)}</p>
    <div class="scroll">
      <table>
        <thead>
          <tr><th>チーム</th><th>優勝</th><th>1位</th><th>2位</th><th>3位</th><th>4位</th><th>RS 期待勝ち点</th><th>MC 期待ポイント</th></tr>
        </thead>
        <tbody>
          {#each sim.rows as r}
            <tr style={`--team:${r.color}`}>
              <th scope="row"><span class="dot"></span>{r.name}<span class="code">{r.team}</span></th>
              <td class="strong">{r.champion}%</td>
              {#each r.seed as s}<td>{s}%</td>{/each}
              <td>{r.expectedRegular}</td>
              <td>{r.expectedMasters}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="note">1位〜4位は Regular Stage と MASTERS CUP を合わせたシードの順位。優勝は Playoffs の勝者。</p>
  </section>

  {#each tables as t}
    <section class="frame sim-sec">
      <h2>{t.tier} の事前の勝率</h2>
      <p class="note">β = {t.beta}({t.betaBasis})。勝率は β × (S<sub>A</sub> − S<sub>B</sub>) から。結果・仕上がり・気持ち・ドラフトの項は未反映</p>
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
{/if}

<style>
  .sim-sec { margin: 1rem auto; max-width: 64rem; padding: 1.2rem 1rem; }
  .sim-sec h2 { margin: 0 0 0.4rem; }
  .note { opacity: 0.8; font-size: 0.9rem; margin: 0.3rem 0 0.8rem; }
  /* 基準8: 表は横に送れる枠の中に置き、ページを横にスクロールさせない */
  .scroll { overflow-x: auto; margin: 0.4rem 0 0.8rem; -webkit-overflow-scrolling: touch; }
  table { border-collapse: collapse; width: 100%; min-width: 28rem; font-size: 0.92rem; }
  th, td { padding: 0.35rem 0.5rem; text-align: right; white-space: nowrap; border-bottom: 1px solid rgba(255, 255, 255, 0.12); }
  th[scope='row'], thead th:first-child { text-align: left; }
  thead th { opacity: 0.75; font-weight: 600; }
  .dot { display: inline-block; width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--team, #999); margin-right: 0.4rem; vertical-align: middle; }
  .code { opacity: 0.6; margin-left: 0.4rem; font-size: 0.8rem; }
  .strong { font-weight: 700; }
  .muted { opacity: 0.7; white-space: normal; min-width: 10rem; }
</style>
