<script lang="ts">
  // チームの花を幾何学的に描く紋章(画像は使わない)。petals: ダリア 14 / 椿 5 / アイリス 3 / 月桂樹 8
  let { petals, color }: { petals: number; color: string } = $props();
  const laurel = $derived(petals === 8);
  const rings = $derived(
    petals >= 10
      ? [
          { n: petals, rx: 9, ry: 30, r: 22 },
          { n: petals, rx: 7, ry: 22, r: 14, offset: 180 / petals },
        ]
      : [{ n: petals, rx: petals === 3 ? 15 : 17, ry: petals === 3 ? 36 : 26, r: petals === 3 ? 20 : 18 }],
  );
</script>

<svg class="emblem" viewBox="-60 -60 120 120" aria-hidden="true">
  <circle r="56" fill="none" stroke="#c9a24a" stroke-width="0.8" opacity="0.7" />
  <circle r="51" fill="none" stroke="#c9a24a" stroke-width="0.4" stroke-dasharray="1 3" opacity="0.7" />
  {#if laurel}
    {#each Array(9) as _, i}
      <ellipse cx="-30" cy="0" rx="10" ry="4.2" fill={color} opacity="0.9"
        transform={`rotate(${-70 + i * 17.5}) translate(0 ${-6 + (i % 2) * 2})`} />
      <ellipse cx="30" cy="0" rx="10" ry="4.2" fill={color} opacity="0.9"
        transform={`rotate(${70 - i * 17.5}) translate(0 ${-6 + (i % 2) * 2})`} />
    {/each}
  {:else}
    {#each rings as ring}
      {#each Array(ring.n) as _, i}
        <ellipse cx="0" cy={-ring.r} rx={ring.rx} ry={ring.ry} fill={color} fill-opacity="0.82"
          stroke="#f0d896" stroke-width="0.6" stroke-opacity="0.6"
          transform={`rotate(${(360 / ring.n) * i + (ring.offset ?? 0)})`} />
      {/each}
    {/each}
  {/if}
  <circle r="6" fill="#f0d896" />
  <circle r="2.4" fill="#7d6123" />
</svg>
