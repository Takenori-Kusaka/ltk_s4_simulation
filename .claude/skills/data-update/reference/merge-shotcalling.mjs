// 基盤データの更新: 根拠のファイルの shotcalling を、正規化の記録(1行1件の書式)へ足す(手順の補助スクリプト)
//
//   node .claude/skills/data-update/reference/merge-shotcalling.mjs <根拠のファイル>
//        [--target <shotcalling.json>] [--origin <由来>] [--dry-run] [--allow-unverified]
//
// 規則(.claude/skills/data-update/reference/integrate.md と同じ):
//   - 反証の試みを通った項目だけを足す: aiCheck が "not-refuted"(新しい形)、または aiCheck が無く以前の形の verification が "confirmed"(文字列か {status})。
//     aiCheck / verification は正規化の記録へ写さない。selfTeam は真偽値のときだけ写す。
//     どちらも無い項目は、--allow-unverified を付けたときだけ足す(以前の根拠のファイルを流し直すとき)
//   - AI の取り込みでは、kind が owner-confirmation の項目と、collectedBy が ai でない項目を足さない(人の確認に当たる記録は人が書く)
//   - 出典が https:// で始まらない項目と、根拠のファイルの source.urlPending が true のときは足さない
//   - summary・source は空白だけでない文字列、direction は + か -、strength は 強/中/弱、kind は player/coach/other-game/other
//   - 出典と要約が同じ項目は足さない(同じファイルを2回流しても増えない)
//   - origin は、項目に無いときだけ --origin の値を入れる
//   - 書式は「選手ごとに evidence の配列、1行に1件」を保つ
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      target: { type: 'string', default: 'docs/research/grounds/normalized/shotcalling.json' },
      origin: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'allow-unverified': { type: 'boolean', default: false },
    },
  });
} catch (e) {
  console.error(`引数の誤り: ${e.message}`);
  process.exit(1);
}
const { values, positionals } = parsed;
if (positionals.length !== 1) {
  console.error('使い方: node merge-shotcalling.mjs <根拠のファイル> [--target <shotcalling.json>] [--origin <由来>] [--dry-run] [--allow-unverified]');
  process.exit(1);
}
for (const k of ['target', 'origin']) {
  if (typeof values[k] === 'string' && (values[k].trim() === '' || values[k].startsWith('--'))) {
    console.error(`引数の誤り: --${k} の値が無い`);
    process.exit(1);
  }
}

const KINDS = ['player', 'coach', 'other-game', 'other'];
const STRENGTHS = ['強', '中', '弱'];
const str = (v) => typeof v === 'string' && v.trim().length > 0;
const DIRECTION = { '+': '+', '＋': '+', '-': '-', '−': '-', '－': '-' };

const ev = JSON.parse(readFileSync(positionals[0], 'utf8'));
const snap = JSON.parse(readFileSync(values.target, 'utf8'));
const pending = ev.source?.urlPending === true;

let added = 0;
const skipped = [];
const skip = (playerId, index, reason) => skipped.push({ playerId, index, reason });

for (const [playerId, items] of Object.entries(ev.shotcalling ?? {})) {
  const player = snap.players[playerId];
  items.forEach((raw, index) => {
    if (!player) return skip(playerId, index, '名簿外');
    if (pending) return skip(playerId, index, 'URL が未確定(source.urlPending)');
    // 新しい形は aiCheck(not-refuted だけが通る)。以前の形は verification(confirmed だけが通る)
    const legacy = typeof raw.verification === 'string' ? raw.verification : raw.verification?.status;
    const check = raw.aiCheck ?? legacy;
    const passed = raw.aiCheck !== undefined ? raw.aiCheck === 'not-refuted' : legacy === 'confirmed';
    if (check !== undefined && !passed) return skip(playerId, index, `反証の試みが ${check}`);
    if (check === undefined && !values['allow-unverified']) return skip(playerId, index, '反証の試みの記録が無い');
    if (raw.kind === 'owner-confirmation') return skip(playerId, index, 'owner-confirmation は人が書く');
    if (raw.collectedBy !== 'ai') return skip(playerId, index, 'collectedBy が ai でない');
    const direction = DIRECTION[raw.direction];
    if (!str(raw.summary) || !str(raw.source) || !direction || !STRENGTHS.includes(raw.strength) || !KINDS.includes(raw.kind)) {
      return skip(playerId, index, '必要な項目の欠け');
    }
    if (!raw.source.startsWith('https://')) return skip(playerId, index, '出典が https:// でない');
    if (player.evidence.some((x) => x.source === raw.source && x.summary === raw.summary)) return skip(playerId, index, '重複');
    const { verification, aiCheck, selfTeam, ...rest } = raw;
    player.evidence.push({
      ...rest,
      direction,
      ...(typeof selfTeam === 'boolean' ? { selfTeam } : {}),
      ...(values.origin && !rest.origin ? { origin: values.origin } : {}),
    });
    added++;
  });
}

const lines = ['{', `  "kind": ${JSON.stringify(snap.kind)},`, `  "retrievedAt": ${JSON.stringify(snap.retrievedAt)},`, `  "description": ${JSON.stringify(snap.description)},`, '  "players": {'];
const ids = Object.keys(snap.players);
ids.forEach((id, i) => {
  const p = snap.players[id];
  lines.push(`    ${JSON.stringify(id)}: {`, `      "name": ${JSON.stringify(p.name)},`, '      "evidence": [');
  p.evidence.forEach((e, j) => lines.push(`        ${JSON.stringify(e)}${j < p.evidence.length - 1 ? ',' : ''}`));
  lines.push('      ]', `    }${i < ids.length - 1 ? ',' : ''}`);
});
lines.push('  }', '}', '');

if (!values['dry-run']) writeFileSync(values.target, lines.join('\n'));
const byReason = {};
for (const s of skipped) byReason[s.reason] = (byReason[s.reason] ?? 0) + 1;
console.log(JSON.stringify({ target: values.target, dryRun: values['dry-run'], added, skipped: byReason }, null, 1));
if (values['dry-run'] && skipped.length) console.log(skipped.map((s) => `  足さない: ${s.playerId}[${s.index}] ${s.reason}`).join('\n'));
