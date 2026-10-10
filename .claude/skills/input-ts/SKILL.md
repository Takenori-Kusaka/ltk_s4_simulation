---
name: input-ts
description: 配信・動画の文字起こし(YouTube・Twitch)を、評価の根拠として取り込む。`/input-ts <data/transcript/ のファイル> <動画の URL> [焦点のメモ]`。生成 AI を使わない前処理をかけ、前処理の出力だけをサブエージェントが読んで根拠を抜き出し、別のサブエージェントが反証を試みてから、docs/research/grounds/ の根拠のファイルとコール力の正規化の記録へ統合する。共通の手順は /data-update。
---

# 文字起こしを取り込む

共通の原則・流れ・人へ戻す場面は `.claude/skills/data-update/SKILL.md` にあります。先に読んでください。ここには文字起こしに固有の部分だけを書きます。

## 引数

| 引数 | 内容 |
| --- | --- |
| ファイル | `data/transcript/` に置かれた文字起こし(`.md` か `.txt`)。複数でもよい。置く前に `git check-ignore -v <ファイル>` で無視されることを確かめる |
| 動画の URL | 出典。人から受け取るのを基本にする。再生リストの部分(`list=`・`index=`・`pp=`)は外し、`https://www.youtube.com/watch?v=<ID>` の形にする。Twitch は `https://www.twitch.tv/videos/<ID>` |
| 焦点のメモ(任意) | 例: 「<チーム> 対 <チーム> のスクリム」「コール役」。抜き出しの重みづけに使う。価値責任者の観察は確かめる対象の手がかりとして扱い、結果として書かない |

URL を人から受け取れないときは、ファイルから機械で拾う(生の文字起こしを AI が読まない):

```bash
grep -m1 -oE 'https://(www\.youtube\.com/watch\?v=|youtu\.be/|www\.twitch\.tv/videos/)[A-Za-z0-9_-]+' "data/transcript/<ファイル>"
```

見つからなければ価値責任者に尋ね、待つ間は Issue に `state:needs-po`。URL が分かるまでは:

- 根拠のファイルの `source.url` を空、`source.urlPending: true` にし、各項目の `source` を `transcript:<ファイル名>#t=<秒>`、`origin` を `transcript:<ファイル名>` で仮置きする
- 正規化の記録へは統合しない(統合のスクリプトも `urlPending` と `https://` でない出典を足さない)
- URL が届いたら、根拠のファイルの `source.url` を埋めて `urlPending: false` にし、各項目の `source` を `<URL>&t=<秒>s`、`origin` を `transcript:<動画の ID>` に置き換えてから、統合を `--dry-run` から流す

## 1. 前処理(機械)

```bash
node src/transcript/cli.ts
```

- 置き場の `.md` と `.txt` を**すべて**読み直し、`data/transcript/structured/<名前>.json` を書き直す(どちらも `.gitignore`)。出力に、残した区間と文字数の割合が出る
- 形: `segments` の各区間に `t`(開始。分:秒。分は 60 を超える)・`s`(関連の点数)・`p`(選手の ID)・`c`(確信の低い候補)・`k`(手がかりの分類と数)・`cp`(コールの言い回しの数)・`x`(本文。手がかりの無い断片は「…」)。ほかに `perPlayer`・`topKeywords`
- 自動字幕には話者の情報が無い。`perPlayer` の数は「名前が出た区間の数」で、本人の発言量ではない
- 使った前処理の版(`git rev-parse --short HEAD`)を、根拠のファイルの `source.preprocessedWith` に残す

便利なコマンド(ファイル名に空白や `[ ]` が入るので引用符で囲む):

```bash
# 区間の数
node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(j.segments.length)" "data/transcript/structured/<名前>.json"
# 添字 from〜to−1 の区間だけを出す
node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(JSON.stringify(j.segments.slice(+process.argv[2],+process.argv[3])))" "data/transcript/structured/<名前>.json" <from> <to>
# 名簿(ID・名前・チーム・階級・ロール)
node -e "import('./src/data/roster.ts').then(m=>console.log(m.ROSTER.map(p=>[p.id,p.name,p.team,p.tier,p.role].join(' ')).join('\n')))"
# 区間の t(分:秒)を秒に直す
node -e "const [m,s]=process.argv[1].split(':').map(Number);console.log(m*60+s)" 249:05
```

## 2. 抜き出し(並列のサブエージェント)

- **生の文字起こし(`data/transcript/*.md`・`*.txt`)を読まない**。前処理の出力だけを読む。前処理の出力で確かめられないことは `unclear` にし、前処理の改善点(4)として報告する
- 区間が 200 を超えるときは、`segments` の添字で約 150 区間ずつに分け、並列のサブエージェントに渡す(8 時間の配信で 4 つ)
- プロンプトの雛形と出力の形: `reference/extract.md`
- まとめ役のサブエージェントが1つにする(境目をまたぐ試合をつなぐ、重複を除く)。まとめ役も生の文字起こしを読まない

## 3. 反証の試み(別のサブエージェント)

- 節ごと(`matches`・`shotcalling`・`playerTraits`・`teamStyle`・`teamMacro`・`coaches`・`picks`)に、別のサブエージェントが各項目の時刻の前後 ±3 区間と照らして反証を試みる。`overall` は反証しないので、記録に `aiCheck` を付けない
- 確認係には点数に効く主張(要約・時刻・出典に加え、`shotcalling` は選手の ID・向き・強さ・種類、`matches` は種類・相手・結果)を渡し、作成側の推論(`opponentBasis`・`resultBasis`・`notes`・`note`)を渡さない
- `unclear` の項目は根拠のファイルに印つきで残すが、正規化の記録へは統合しない
- 判定: `not-refuted` / `refuted`(入れない)/ `unclear`(入れるが印を付ける)。個人情報や 15 文字を超える引用を含む項目は `refuted`
- 試合の結果は特に厳しく見る。勝敗の発言が前処理の出力に無ければ `unclear`。相手と結果の両方が通った試合だけ `usableForResults: true`

## 4. 前処理の改善点

抜き出しのサブエージェントに、前処理の改善点を `preprocessingNotes` として報告させる(辞書に無い呼び名、一般語の部分一致による誤検出、残すべきだった語。例: 勝敗の発言が落ちて試合の結果が `unclear` になった)。

辞書(`src/transcript/aliases.json`・`dictionaries.json`)は製品のコードで、直すとテストの期待値に響きうる。改善点は報告に載せ、`state:needs-po` で渡す。価値責任者が実装計画へタスクを足してから `/implement` で直す。直した辞書がマージされた後に、前処理と抜き出しを流し直す。

## 5. 根拠のファイル

`docs/research/grounds/evidence-transcript-<配信者や内容の短い名前>-<YYYYMMDD>.json`。形は `reference/extract.md` の「書き出しの形」(前例: `evidence-transcript-takaya-it-core.json`)。`docs/research/grounds/README.md` の表に1行足す(件数、試合の数、確かめられなかったこと)。

## 6. 統合・検証・PR

`/data-update` の流れの 6〜12(`.claude/skills/data-update/reference/integrate.md`)。コール力は:

```bash
node .claude/skills/data-update/reference/merge-shotcalling.mjs <根拠のファイル> --dry-run
node .claude/skills/data-update/reference/merge-shotcalling.mjs <根拠のファイル>
```

ブランチは `docs/input-ts-<YYYYMMDD>-<短い名前>`。

## 7. 報告

- 前処理の縮小(文字数と区間の割合)
- 試合の一覧(種類・相手・結果・結果に使えるか)
- コール力が動いた選手(前 → 後)と、根拠の要点
- 確かめられなかったこと(`unclear`・`unmapped`)と前処理の改善点
- 人の判断が要ること(ラベルを付けて渡したもの)
