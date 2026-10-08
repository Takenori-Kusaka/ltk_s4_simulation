<script lang="ts">
  import type { Role } from '../../data/roster.ts';
  let { role }: { role: Role } = $props();
  // ロールの記号(線画)。TOP 盾 / JG 牙 / MID 星 / ADC 弓 / SUP 守りの手
  const PATHS: Record<Role, string> = {
    TOP: 'M12 2 20 5v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z',
    JG: 'M12 3c4.5 4 5.5 9.5 0 18-5.5-8.5-4.5-14 0-18zM12 8v9M9 12l3 2 3-2',
    MID: 'M12 2l2.6 6.6L21 9.3l-5 4.4 1.6 6.8L12 17l-5.6 3.5L8 13.7 3 9.3l6.4-.7z',
    ADC: 'M4 20 20 4M14 4h6v6M5 9c3-4 7-5 10-5M15 19c4-3 5-7 5-10',
    SUP: 'M12 21s-8-5-8-11a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 6-8 11-8 11z',
  };
</script>

<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">
  <path d={PATHS[role]} />
</svg>
