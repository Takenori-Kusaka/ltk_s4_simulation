# 統合・検証・公開の前の点検(基盤データの更新の共通部分)

コマンドは、本体の作業ツリー(`data/raw/`・`data/transcript/` がある所。例: `E:/Github/ltk_s4_simulation`)で流します。git の worktree には実データが無いので、worktree で流すときは `rawDir` と前処理の `--in` に本体のパスを渡します。

## 1. 統合の前の点数を取る

```bash
node -e "import('./src/collect/aggregate-cli.ts').then(async m=>{const lines=[];const code=await m.main({publicDir:process.argv[1],out:l=>lines.push(l)});console.log('code',code);console.log(lines.filter(l=>/集計のファイル|Data Dragon|K-0|違反|エラー|反したため/.test(l)).join('\n'))})" <一時>/before
```

- 「集計のファイル 0 件」なら、実データの無い場所で流している。失敗として扱う
- 終了コード 1 の理由が Data Dragon の取得だけなら、評価の検証には響かない

## 2. コール力の根拠を正規化の記録へ足す

`docs/research/grounds/normalized/shotcalling.json` は、選手ごとに1行1件の書式で持っています。次の手順の補助スクリプトで足します(置き場は技術の判断を待っている。`state:needs-tech`)。

```bash
node .claude/skills/data-update/reference/merge-shotcalling.mjs <根拠のファイル> --dry-run
node .claude/skills/data-update/reference/merge-shotcalling.mjs <根拠のファイル> [--origin <由来>]
```

足すもの・足さないもの(スクリプトの冒頭の規則と同じ):

- 足す: 反証の試みを通った項目(`aiCheck: not-refuted`。以前の形の `verification: confirmed` も同じ扱い)
- 足さない: `refuted`・`unclear`(`unclear` は根拠のファイルには印つきで残る)、反証の試みの記録が無い項目(以前の根拠のファイルを流し直すときだけ `--allow-unverified`)、`kind: owner-confirmation`、`collectedBy` が `ai` でない項目、出典が `https://` でない項目、根拠のファイルの `source.urlPending` が true のもの、必要な項目の欠け、出典と要約が同じ重複
- `origin` は、項目に無いときだけ `--origin` の値が入る。抜き出しの雛形では、各項目に `origin: "transcript:<動画の ID>"` を書かせる

足した後、評価のコードが読めることを確かめる:

```bash
node -e "import('./src/rating/evidence.ts').then(m=>{const r=m.readShotcallingSnapshot(JSON.parse(require('fs').readFileSync('docs/research/grounds/normalized/shotcalling.json','utf8')));console.log('errors',r.errors)})"
```

## 3. そのほかの節の扱い

| 節 | 今の扱い |
| --- | --- |
| `matches`(試合の記録) | 根拠のファイルに残す。`usableForResults: true` は、相手と結果の両方が反証の試みを通ったものだけ。F-004 の結果の入力ができたら取り込む |
| `playerTraits`・`teamStyle`・`teamMacro`・`overall`・`picks`・`unmapped` | 根拠のファイルに残す。**今はどの評価のコードも読まない**(材料として残すだけ)。読む機能を作るときは、`unclear` の項目を除く条件を仕様に入れる |
| `coaches` | 根拠のファイルに残す。F-010 のコーチの評価が読むのは `data/snapshots/evidence-coach.json`。そこへ足すのは `data/**` の変更(製品のコード)なので、機能仕様のタスクとして行う |

## 4. 検証

```bash
# 統合の後の点数
node -e "import('./src/collect/aggregate-cli.ts').then(async m=>{const lines=[];const code=await m.main({publicDir:process.argv[1],out:l=>lines.push(l)});console.log('code',code);console.log(lines.filter(l=>/集計のファイル|Data Dragon|K-0|違反|エラー|反したため/.test(l)).join('\n'))})" <一時>/after

# 点数が動いた選手
node -e "const path=require('path');const [a,b]=process.argv.slice(1).map(p=>require(path.resolve(p,'ratings.json')));for(const p of b.players){const q=a.players.find(x=>x.playerId===p.playerId);for(const ax of p.axes){const o=q.axes.find(x=>x.key===ax.key);if(Math.abs(o.base-ax.base)>=0.01)console.log(p.playerId,ax.label,o.base,'->',ax.base)}}" <一時>/before <一時>/after

# G-5 と同じ範囲の検査(個々の検査を選んで流さない)
node scripts/gate/g5-local.mjs --no-install
```

- `src/rating/known-facts.json` の常識のうち、保留以外がすべて合格であること(K-04 が価値責任者の確認を検査する)
- データに依存する既存のテストが落ちたら、テストを変えずに `state:needs-po` で戻す(`SKILL.md` の「人へ戻す場面」)

## 5. 公開の前の点検

公開のリポジトリなので、push の前に差分を機械で点検し、結果を依頼者へ示します。先にコミットし、`git status --porcelain` が空であることを確かめます(未コミットの変更は下の点検に入らない)。

```bash
git status --porcelain            # 空であること
# 差分のファイルにテストが含まれていないこと
git diff --name-only origin/main...HEAD
# 個人情報の手がかりになる語(当たった行を人が見る)
LC_ALL=C.UTF-8 git diff origin/main...HEAD -U0 | grep -nE '本名|歳|才|学年|小学|中学|高校|大学|学生|勤め|会社員|社員|兼業|逮捕|処分|契約解除|出場停止|疑惑|住所|namu\.wiki|esportsearnings\.com/players' || echo '当たり無し'
# 長い引用の手がかり(「」の中が 15 文字を超える)
LC_ALL=C.UTF-8 git diff origin/main...HEAD -U0 | grep -nE '「[^」]{16,}」' || echo '当たり無し'
```

- 名簿外の人の名前は機械では見分けられない。`unmapped` と `note` を人が目で確かめる
- 当たりがあれば、該当の箇所を直すか、依頼者に確かめてから push する
