# ブラウザ側の手順(Chrome 拡張)

`/input-scrim` の手順 1〜3 で使う JavaScript の全文と座標です。2026-10-11 に https://www.youtube.com/watch?v=AZbkNH5Z5-I(9:50:32)で実際に効いた手順を、そのまま再現できる形にしています。`javascript_tool` は top-level `await` が使え、最後の式の値が返ります。`Runtime.evaluate` は 45 秒で切れるので、長い処理は `window.__job` に結果を書く非同期の関数にして、あとで `done` を見ます。

## A. 再生できる状態を作る

### A-1. 確かめる

watch ページを `&t=<秒>s` 付きで開き、4〜8 秒待ってから:

```js
const p = document.getElementById('movie_player'); const v = document.querySelector('video');
({state: p.getPlayerState(), loaded: p.getVideoLoadedFraction(), ready: v.readyState, hidden: document.hidden, outer: [outerWidth, outerHeight]})
```

- `state` が `1`(再生中)か `2`(一時停止)で `ready >= 2` なら、そのまま B へ(iframe は不要。`window.__f` の代わりに自分の document を使う)
- `state: -1`、`loaded: 0`、`hidden: true`、`outer: [0, 0]` が続くなら、拡張のタブが**最小化されたウィンドウ**に入っている。Chrome がメディアの読み込みを保留し、YouTube は再生を始めない(googlevideo への要求がゼロ)。`&t=` で開き直す・`k` キー・`playVideo()`・`document.hidden` の上書き・`resize_window`・全画面ボタンのクリック、いずれも効かなかった。A-2 へ

### A-2. ユーザー操作を発生させ、Document Picture-in-Picture を開く

同一オリジンの軽いページへ移動する(watch ページの重いスクリプトを避ける):

```
navigate: https://www.youtube.com/robots.txt
```

`computer` の `key` で `shift` を押す(**`left_click` では `navigator.userActivation.isActive` が true にならなかった。キー入力なら true になった**)。直後(5 秒以内)に:

```js
const out = {active: navigator.userActivation.isActive};
try { const pip = await documentPictureInPicture.requestWindow({width: 1280, height: 720}); window.__pip = pip; out.pip = 'opened'; }
catch (e) { out.pip = e.message; }
out
```

`NotAllowedError: ... requires user activation` なら、キー入力と同じ `browser_batch` の中で呼び直す。

### A-3. PiP に watch ページを iframe で読み込む

embed(`/embed/<ID>`)は「この動画は再生できません」で拒否されることがある。watch ページは同一オリジンなので iframe の中に触れる。

```js
const pip = window.__pip; pip.document.body.style.cssText = 'margin:0;background:#000';
const f = pip.document.createElement('iframe');
f.src = 'https://www.youtube.com/watch?v=<ID>&t=<秒>s';
f.width = String(pip.innerWidth); f.height = String(pip.innerHeight); f.style.border = '0'; f.setAttribute('allow', 'autoplay');
pip.document.body.appendChild(f); window.__f = f; 'added'
```

10 秒待ってから:

```js
const d = window.__f.contentDocument; const mp = d.getElementById('movie_player'); const v = d.querySelector('video');
mp.mute(); ({state: mp.getPlayerState(), cur: mp.getCurrentTime(), ready: v.readyState, dims: [v.videoWidth, v.videoHeight], q: mp.getPlaybackQuality(), avail: mp.getAvailableQualityLevels(), err: (d.querySelector('.ytp-error') || {}).textContent})
```

`state: 1`、`ready: 4`、`dims: [1280, 720]` などが出れば再生できている。**音は必ず mute**(PiP は利用者の画面に浮いて見え、音も出る)。

### A-4. 画質を 1080p にする

```js
window.__f.contentDocument.getElementById('movie_player').setPlaybackQualityRange('hd1080', 'hd1080'); 'ok'
```

画質の変更で一度 0 秒へ戻ることがある。4 秒待って `getPlaybackQuality()` が `hd1080`、`videoWidth` が `1920` になったことを見てから、改めてシークする。

### A-5. 終わったら閉じる

```js
try { window.__pip && window.__pip.close(); } catch (e) {} 'closed'
```

そのあと `tabs_close_mcp` で自分のタブを閉じる。

## B. ヘルパー(元のタブで定義する)

元のタブ(robots.txt のページ)に canvas を置き、PiP の `video` を `drawImage` で写す。hidden のタブでもスクリーンショットは撮れる。canvas は 1920×610(表示は幅 100%)にすると、1568×502 のスクリーンショットにちょうど収まる(縦 610 を超えると下が切れる)。

```js
document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:#222;overflow:hidden';
const c = document.createElement('canvas'); c.width = 1920; c.height = 610; c.style.cssText = 'display:block;width:100%;height:auto';
document.body.appendChild(c); window.__c = c; window.__ctx = c.getContext('2d');
window.__doc = () => window.__f ? window.__f.contentDocument : document;   // iframe を使わない場合は自分の document
window.__mp = () => window.__doc().getElementById('movie_player');
window.__v = () => window.__doc().querySelector('video');
window.__sleep = ms => new Promise(r => setTimeout(r, ms));
window.__fmt = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); };
// シーク。再生したままでよい(止めなくてもフレームは読める)。10 時刻で 5〜7 秒
window.__seek = async (t, timeout = 20000) => { const mp = window.__mp(), v = window.__v(); mp.seekTo(t, true); const t0 = Date.now(); await window.__sleep(250); while (Date.now() - t0 < timeout) { if (!v.seeking && v.readyState >= 2 && Math.abs(v.currentTime - t) < 4) break; await window.__sleep(150); } await window.__sleep(200); return v.currentTime; };
// 描画。crop = [sx, sy, sw, sh](1080p の座標)
window.__draw = (dx, dy, dw, dh, crop) => { const v = window.__v(); if (crop) window.__ctx.drawImage(v, crop[0], crop[1], crop[2], crop[3], dx, dy, dw, dh); else window.__ctx.drawImage(v, dx, dy, dw, dh); };
window.__label = (txt, x, y, size = 36) => { const ctx = window.__ctx; ctx.font = 'bold ' + size + 'px sans-serif'; ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x, y, ctx.measureText(txt).width + 20, size + 10); ctx.fillStyle = '#ff0'; ctx.fillText(txt, x + 10, y + size); };
// コンタクトシート: 5 列 × 2 行 = 10 時刻。各セルは縮小したフレーム + 上部中央の帯(キル・ゴールド・試合時間)の等倍の切り抜き
window.__sheet = async (times) => { const job = window.__job = {done: false, results: [], err: null, started: Date.now()}; try { const ctx = window.__ctx; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 610); for (let i = 0; i < times.length; i++) { const actual = await window.__seek(times[i]); const x = (i % 5) * 384, y = Math.floor(i / 5) * 305; window.__draw(x, y, 380, 214); window.__draw(x, y + 216, 380, 86, [700, 10, 360, 85]); window.__label(window.__fmt(actual) + ' ' + Math.round(actual) + 's', x + 2, y + 2); job.results.push({req: times[i], actual: Math.round(actual)}); } } catch (e) { job.err = String(e); } job.done = true; job.ms = Date.now() - job.started; };
// 1 時刻の表示。crops が無ければ全体(左)と上半分・下半分の拡大(右)。crops = [[sx, sy, sw, sh, dx, dy, dw, dh], ...]
window.__show = async (t, crops) => { const job = window.__job = {done: false, started: Date.now()}; const actual = await window.__seek(t); const ctx = window.__ctx; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 610); if (!crops) { window.__draw(0, 0, 1084, 610); window.__draw(1090, 0, 830, 300, [0, 0, 1000, 360]); window.__draw(1090, 305, 830, 300, [0, 360, 1000, 360]); } else { for (const cr of crops) window.__draw(cr[4], cr[5], cr[6], cr[7], [cr[0], cr[1], cr[2], cr[3]]); } window.__label(window.__fmt(actual) + ' ' + Math.round(actual) + 's', 4, 4); job.actual = actual; job.done = true; job.ms = Date.now() - job.started; };
// 観戦 HUD の左右の列(名前)と下中央の表(K/D/A・CS)と上部の帯。10 時刻
window.__names = async (times) => { const job = window.__job = {done: false, results: [], err: null, started: Date.now()}; try { const ctx = window.__ctx; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 610); for (let i = 0; i < times.length; i++) { const actual = await window.__seek(times[i]); const x = (i % 5) * 384, y = Math.floor(i / 5) * 305; window.__draw(x, y + 22, 104, 200, [0, 120, 130, 250]); window.__draw(x + 106, y + 22, 104, 200, [1790, 120, 130, 250]); window.__draw(x + 212, y + 22, 168, 200, [560, 850, 800, 230]); window.__draw(x, y + 224, 380, 78, [700, 10, 380, 78]); ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#ff0'; ctx.fillText(window.__fmt(actual) + ' ' + Math.round(actual) + 's', x + 2, y + 18); job.results.push({req: times[i], actual: Math.round(actual)}); } } catch (e) { job.err = String(e); } job.done = true; job.ms = Date.now() - job.started; };
// サムネイル(64×36)による画面の種類の判定。顔出しの枠(左下)は除外
window.__thumb = () => { const v = window.__v(); const oc = window.__oc || (window.__oc = document.createElement('canvas')); oc.width = 64; oc.height = 36; const c2 = oc.getContext('2d', {willReadFrequently: true}); c2.drawImage(v, 0, 0, 64, 36); return Array.from(c2.getImageData(0, 0, 64, 36).data); };
window.__dist = (a, b) => { let d = 0; for (let i = 0; i < a.length; i += 4) { const y = Math.floor(i / 4 / 64), x = (i / 4) % 64; if (x < 18 && y > 20) continue; d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); } return d; };
window.__cls = () => { const th = window.__thumb(); return Object.entries(window.__refs).map(([n, r]) => [n, window.__dist(r, th)]).sort((a, b) => a[1] - b[1])[0][0]; };
window.__makeRefs = async (refTimes) => { const refs = {}; for (const [k, t] of Object.entries(refTimes)) { await window.__seek(t); refs[k] = window.__thumb(); } window.__refs = refs; return Object.keys(refs); };
// 全体の走査(非同期。window.__job.out に [秒, 種類] が溜まる)
window.__scan = async (t0, t1, step) => { const job = window.__job = {done: false, out: [], err: null, started: Date.now()}; try { for (let t = t0; t <= t1; t += step) { const a = await window.__seek(t, 12000); job.out.push([Math.round(a), window.__cls()]); } } catch (e) { job.err = String(e); } job.done = true; job.ms = Date.now() - job.started; };
window.__runs = () => { const runs = []; let cur = null; for (const [t, cls] of window.__job.out) { if (cur && cur.cls === cls) { cur.end = t; cur.n++; } else { if (cur) runs.push(cur); cur = {cls, start: t, end: t, n: 1}; } } if (cur) runs.push(cur); return runs.map(r => window.__fmt(r.start) + '-' + window.__fmt(r.end) + ' ' + r.cls + ' x' + r.n).join('\n'); };
// 境目の走査(10 秒刻み)。windows = [[名前, t0, t1, step], ...]
window.__scanW = async (windows) => { const job = window.__job = {done: false, out: {}, err: null, started: Date.now()}; try { for (const [name, t0, t1, step] of windows) { const rows = []; for (let t = t0; t <= t1; t += step) { const a = await window.__seek(t, 12000); rows.push(Math.round(a) + ' ' + window.__cls()); } job.out[name] = rows.join(' | '); } } catch (e) { job.err = String(e); } job.done = true; job.ms = Date.now() - job.started; };
'helpers ready'
```

使い方(`browser_batch` で `javascript_tool` → `wait` → `screenshot` を 1 回で):

```js
window.__sheet([35300, 34580, 33860, 33140, 32420, 31700, 30980, 30260]); 'started'   // 8〜10 時刻。待ち 10 秒 → screenshot
window.__makeRefs({ownpov: 28480, spectator: 33320, postgame: 35000, clienthome: 31940, champselect: 26800, loading: 34080, black: 34965}); // 参照画像
window.__scan(60, 35420, 120); 'started'      // 120 秒刻み。10 時間で約 4 分。待ってから window.__job.done と window.__runs()
window.__scanW([['g6end', 30040, 30160, 10], ['g6start', 27780, 27900, 10]]); 'started'   // 境目を 10 秒刻み
window.__show(30135, [[40, 10, 1100, 540, 0, 0, 1210, 594], [1140, 10, 640, 540, 1215, 0, 700, 590]]); 'started'   // リザルトのヘッダ + チーム1
```

`browser_batch` の中の `wait` の合計が 100 秒を超えると応答が切れることがある。走査の待ちは 60 秒ずつに分け、`window.__job.done` を見る。

## C. 切り抜きの座標(1080p。配信者のレイアウトで変わるので、最初の 1 枚で確かめる)

| 用途 | `[sx, sy, sw, sh]` | 描画の倍率 |
| --- | --- | --- |
| 上部中央の帯(キル数・ゴールド・試合時間) | `[700, 10, 380, 78]` | 等倍 |
| 観戦 HUD の左の列(ブルー側 5 人の名前) | `[0, 120, 130, 250]`(最初の 2〜3 人。5 人なら高さ 460) | 等倍 |
| 観戦 HUD の右の列(レッド側) | `[1790, 120, 130, 250]` | 等倍 |
| 観戦 HUD の下中央の表(10 人の K/D/A・CS) | `[560, 850, 800, 230]` | 等倍〜1.1 倍 |
| リザルトのヘッダ + チーム1 | `[40, 10, 1100, 540]` → `(0, 0, 1210, 594)` | 1.1 倍 |
| リザルトのチーム1 のダメージ・ゴールド | `[1140, 10, 640, 540]` → `(1215, 0, 700, 590)` | 1.1 倍 |
| リザルトのチーム2 の左(名前・チャンピオン・アイテム・K/D/A) | `[40, 560, 1100, 360]` → `(0, 0, 1320, 432)` | 1.2 倍 |
| リザルトのチーム2 の右(K/D/A・ダメージ・ゴールド) | `[700, 560, 600, 360]` → `(0, 0, 960, 576)` | 1.6 倍 |
| 試合履歴の詳細(日付つき)のヘッダ + チーム1 | `[40, 150, 1180, 400]` → `(0, 0, 1416, 480)` | 1.2 倍 |

顔出しの枠はこの配信者では 1080p で x < 540、y > 640。チーム2 の 2〜5 行目の名前とチャンピオン名を隠す。

## D. 画面の見分け方

| 画面 | 特徴 | 走査の種類 |
| --- | --- | --- |
| 自分視点のゲーム中 | 下中央にスキル欄、右下にミニマップ、左にチャットログ(味方のチャンピオン名が出る)、右上に自分の K/D/A・CS・試合時間 | `ownpov`(= 実戦) |
| 観戦 HUD(リプレイ・観戦) | 左右の端に 5 人ずつの名前と肖像、下中央に 10 人の K/D/A・CS の表、上中央にキル数・ゴールド・試合時間。**試合時間が巻き戻る・4 倍速で進む・数分止まる**ならリプレイ | `spectator` / `paused` |
| クライアントのリザルト | 左上に「勝利/敗北」、「カスタム・勝:0-敗:0・37:31・ゲームID」、チーム1/2 の表(名前・チャンピオン名・K/D/A・KDA・ダメージ・ゴールド・分あたりゴールド)、下に「もう一度プレイ」 | `postgame` |
| 試合履歴の詳細 | リザルトと似ているが「サモナーズリフト・カスタム・39:43・2026/10/09・ゲームID」のように**日付が出る**。リプレイを閉じると直前の詳細画面に戻るので、リザルトと混同しない | `postgame`(日付で区別) |
| クライアントのホーム | 「プレイ」のボタン、プロモーション、右に社交の欄(「カスタムゲーム作成中」= 次の試合のロビー) | `clienthome` |
| チャンピオン選択 | 「味方チームがピック中 29」「敵チームがピック中 25」「ロードアウトを準備して 28」などの大きな文字 | `champselect` |
| ロード画面 | 10 枚のチャンピオンのカード | `loading` |

## E. 落とし穴

- 配信の後半はリプレイの振り返りが長い(この配信では 8:22〜9:50 に実戦が無く、6 試合目・5 試合目のリプレイと、前日の別の試合の試合履歴とリプレイだった)。終端から遡るとリプレイの試合を実戦と取り違える
- 観戦 HUD の左(ブルー)は常にチーム1(青)。リザルト画面の「チーム1」は**配信者のチーム**で、青とは限らない。側(ブルー/レッド)はリプレイの列の名前で決める
- 同じ人がゲーム内の名前(moonshine)とリザルトの名前(触るな俺のウェーブに)で違って見えることがある(名前の変更)。同じ席のチャンピオンが一致することで対応づけ、`mapping` は `未確認`
- リザルトのレベル・名前・チャンピオン名は顔出しの枠に隠れる。K/D/A・ダメージ・ゴールドの列は枠の右なので読める
- `left_click` した直後の `javascript_tool` ではユーザー操作が有効にならない。キー入力なら有効になる
- `await v.play()` は再生が始まらないと解決せず、`javascript_tool` が 45 秒で切れる。使わない
- `__seek` は `currentTime` が目標に近づき `readyState >= 2` になったら戻る。フレームが前の位置のままのことは無かったが、コンタクトシートで隣のセルと同じ絵が続いたら待ちを増やす
