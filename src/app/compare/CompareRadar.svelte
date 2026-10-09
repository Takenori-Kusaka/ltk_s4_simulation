<script lang="ts">
  import { radarLabelAnchor } from '../lib/index.ts';
  import { overlayGeometry, axisLabel, markerPath, SERIES_FILL_OPACITY, RADAR_SIZE } from './render.ts';
  import type { CompareSeries } from './view.ts';

  let { series, labels }: { series: CompareSeries[]; labels: string[] } = $props();
  const size = RADAR_SIZE;
  const g = $derived(overlayGeometry(series));
  const rings = [0.2, 0.4, 0.6, 0.8, 1];
</script>

<!-- F-008 基準1〜5: 系列を重ねる。塗りは半透明、光彩なし。確度「低」は点線、データなしの頂点は飛ばす -->
<svg viewBox="-104 -24 508 344" role="img" aria-label={`${series.length}つの対象を重ねた${labels.length}軸レーダーチャート`}>
  {#each rings as k, i}
    <polygon points={g.outline.map((p) => `${size + (p.x - size) * k},${size + (p.y - size) * k}`).join(' ')}
      fill="none" stroke="#c9a24a" stroke-opacity={i === 4 ? 0.7 : 0.18} stroke-width={i === 4 ? 1.2 : 0.8} />
  {/each}
  {#each g.outline as p, i}
    <line x1={size} y1={size} x2={p.x} y2={p.y} stroke="#c9a24a" stroke-opacity={g.axisMissing[i] ? 0.5 : 0.25}
      stroke-dasharray={g.axisMissing[i] ? '3 4' : undefined} />
    <text class="label" class:na={g.axisMissing[i]}
      x={size + (p.x - size) * 1.1 + Math.sign(Math.round(p.x - size)) * 8} y={size + (p.y - size) * 1.14}
      text-anchor={radarLabelAnchor(p.x - size)} dominant-baseline="middle">{axisLabel(labels[i], g.axisMissing[i])}</text>
  {/each}
  {#each g.series as s}
    <g class="series">
      {#if s.polygon}
        <polygon points={s.polygon} fill={s.color} fill-opacity={SERIES_FILL_OPACITY} stroke="none" />
      {/if}
      {#each s.edges as e}
        <line x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} stroke={s.color} stroke-width="2" stroke-linecap="round"
          stroke-dasharray={e.dotted ? '2 5' : undefined} />
      {/each}
      {#each s.points as p, i}
        {#if p}
          <path d={markerPath(s.shape, p.x, p.y, 4.2)} fill={s.lines[i] === 'dotted' ? '#0d0a12' : s.color} stroke={s.color} stroke-width="1.5" />
        {/if}
      {/each}
    </g>
  {/each}
</svg>
