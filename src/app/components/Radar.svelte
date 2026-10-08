<script lang="ts">
  import { radarGeometry, radarLabelAnchor } from '../lib/index.ts';

  let { scores, labels, color = '#c9a24a' }: { scores: (number | null)[]; labels: string[]; color?: string } = $props();
  const size = 150;
  const g = $derived(radarGeometry(scores, size));
  const rings = $derived([2, 4, 6, 8, 10].map((v) => radarGeometry(scores.map(() => v), size).points as { x: number; y: number }[]));
  const gid = `glow-${Math.random().toString(36).slice(2, 8)}`;
</script>

<!-- 基準4: 欠損の軸は破線の軸と「?」で示し、0 点(中心)とは区別する -->
<svg viewBox="-96 -24 492 344" role="img" aria-label="5軸レーダーチャート">
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
    {@const na = g.missing.includes(i)}
    <line x1={size} y1={size} x2={p.x} y2={p.y} stroke="#c9a24a" stroke-opacity={na ? 0.5 : 0.25}
      stroke-dasharray={na ? '3 4' : undefined} />
    <circle cx={p.x} cy={p.y} r="2.2" fill="#c9a24a" />
    <text class="label" class:na x={size + (p.x - size) * 1.1 + Math.sign(Math.round(p.x - size)) * 8} y={size + (p.y - size) * 1.14} text-anchor={radarLabelAnchor(p.x - size)}
      dominant-baseline="middle">{labels[i]}{na ? ' ?' : ''}</text>
  {/each}
  {#if g.polygon}
    <g class="shape">
      <polygon points={g.polygon} fill={`url(#${gid})`} stroke={color} stroke-width="2"
        style={`filter: drop-shadow(0 0 10px ${color})`} />
      {#each g.points as p}
        {#if p}<circle cx={p.x} cy={p.y} r="3.4" fill="#f0d896" stroke={color} stroke-width="1.5" />{/if}
      {/each}
    </g>
  {/if}
</svg>
