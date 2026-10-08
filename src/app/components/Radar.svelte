<script lang="ts">
  import { radarGeometry, radarLabelAnchor, radarEdges } from '../lib/index.ts';

  type Line = 'solid' | 'dotted' | 'missing';
  let {
    scores,
    labels,
    color = '#c9a24a',
    lines,
    estimated,
  }: { scores: (number | null)[]; labels: string[]; color?: string; lines?: Line[]; estimated?: boolean[] } = $props();
  const size = 150;
  const g = $derived(radarGeometry(scores, size));
  const rings = $derived([2, 4, 6, 8, 10].map((v) => radarGeometry(scores.map(() => v), size).points as { x: number; y: number }[]));
  // F-009 基準24: 確度ごとの線。lines が無ければ従来どおり(欠損だけを区別)
  const lineOf = (i: number): Line => lines?.[i] ?? (g.missing.includes(i) ? 'missing' : 'solid');
  const edges = $derived(radarEdges(g.points, scores.map((_, i) => lineOf(i))));
  const gid = `glow-${Math.random().toString(36).slice(2, 8)}`;
</script>

<!-- 基準4・F-009 基準24: 欠損の軸は破線の軸と「?」、確度「低」の軸は点線と白抜きの点、推定の軸は「*」 -->
<svg viewBox="-104 -24 508 344" role="img" aria-label={`${scores.length}軸レーダーチャート`}>
  <defs>
    <radialGradient id={gid}>
      <stop offset="0%" stop-color={color} stop-opacity="0.75" />
      <stop offset="100%" stop-color={color} stop-opacity="0.25" />
    </radialGradient>
  </defs>
  {#each rings as ring, i}
    <polygon points={ring.map((p) => `${p.x},${p.y}`).join(' ')} fill={i === 4 ? 'rgba(201,162,74,0.04)' : 'none'}
      stroke="#c9a24a" stroke-opacity={i === 4 ? 0.7 : 0.18} stroke-width={i === 4 ? 1.2 : 0.8} />
  {/each}
  {#each g.outline as p, i}
    {@const kind = lineOf(i)}
    <line x1={size} y1={size} x2={p.x} y2={p.y} stroke="#c9a24a" stroke-opacity={kind === 'solid' ? 0.25 : 0.5}
      stroke-dasharray={kind === 'missing' ? '3 4' : kind === 'dotted' ? '1 3' : undefined} />
    <circle cx={p.x} cy={p.y} r="2.2" fill="#c9a24a" />
    <text class="label" class:na={kind === 'missing'} class:low={kind === 'dotted'}
      x={size + (p.x - size) * 1.1 + Math.sign(Math.round(p.x - size)) * 8} y={size + (p.y - size) * 1.14}
      text-anchor={radarLabelAnchor(p.x - size)} dominant-baseline="middle"
      >{labels[i]}{kind === 'missing' ? ' ?' : estimated?.[i] ? '*' : ''}</text>
  {/each}
  {#if g.polygon}
    <g class="shape">
      <polygon points={g.polygon} fill={`url(#${gid})`} stroke="none" style={`filter: drop-shadow(0 0 10px ${color})`} />
      {#each edges as e}
        <line x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} stroke={color} stroke-width="2" stroke-linecap="round"
          stroke-dasharray={e.dotted ? '2 5' : undefined} />
      {/each}
      {#each g.points as p, i}
        {#if p}
          <circle cx={p.x} cy={p.y} r="3.4" fill={lineOf(i) === 'dotted' ? '#0d0a12' : '#f0d896'} stroke={color} stroke-width="1.5" />
        {/if}
      {/each}
    </g>
  {/if}
</svg>
