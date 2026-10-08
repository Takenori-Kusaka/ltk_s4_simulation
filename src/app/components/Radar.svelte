<script lang="ts">
  import { radarGeometry } from '../lib/index.ts';

  let { scores, labels, color = '#6c4ad6' }: { scores: (number | null)[]; labels: string[]; color?: string } = $props();
  const size = 150;
  const g = $derived(radarGeometry(scores, size));
  const rings = [2, 4, 6, 8, 10].map((v) => radarGeometry(scores.map(() => v), size).points as { x: number; y: number }[]);
</script>

<!-- 基準4: 欠損の軸は破線の軸と「?」で示し、0 点(中心)とは区別する -->
<svg viewBox="-60 -20 420 340" role="img" aria-label="5軸レーダーチャート">
  {#each rings as ring}
    <polygon points={ring.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="currentColor" stroke-opacity="0.15" />
  {/each}
  {#each g.outline as p, i}
    <line x1={size} y1={size} x2={p.x} y2={p.y} stroke="currentColor" stroke-opacity="0.3"
      stroke-dasharray={g.missing.includes(i) ? '4 4' : undefined} />
    <text x={size + (p.x - size) * 1.17} y={size + (p.y - size) * 1.17} font-size="15" text-anchor="middle"
      dominant-baseline="middle" fill="currentColor">{labels[i]}{g.missing.includes(i) ? ' ?' : ''}</text>
  {/each}
  {#if g.polygon}
    <polygon points={g.polygon} fill={color} fill-opacity="0.35" stroke={color} stroke-width="2" />
  {/if}
</svg>
