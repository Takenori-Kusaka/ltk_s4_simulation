# 文字起こしの抜き出し: プロンプトの雛形と出力の形

`<…>` を埋めて使います。サブエージェントは前処理の出力(`data/transcript/structured/<名前>.json`)だけを読みます。雛形の例は形を示すだけで、実在の対戦・結果・選手を入れません。

## 共通の規則(各プロンプトの末尾に、全文を付ける)

```
規則:
- 日本語。自分の言葉で短く要約する(15 文字を超える引用をしない)。
- 次のものを書かない: 本名(ローマ字・漢字・ハングルを含む)、年齢と年齢を推定できる記述(学年・学校段階・始めた年齢)、勤め先と勤め方、私生活、名簿外の一般の人の名前、処分や疑惑の詳細、評価に関係しない雑談の話題。
- 各項目に timestamp(h:mm:ss。1時間未満は m:ss)と出典(YouTube は <動画の URL>&t=<秒>s、Twitch は <動画の URL>?t=<h>h<m>m<s>s)を付ける。区間の t(分:秒。分は 60 を超える)を秒に直して使う。
- 推測で埋めない。誰の発言か・どの試合かが分からなければ、その旨を書く(自動字幕には話者の情報が無い。配信者は <配信者の名前と所属>)。話者の確かさは note に書き、strength を動かさない。
- 生の文字起こし(data/transcript/*.md・*.txt)は読まない。前処理の出力だけを読む。
- リポジトリのファイルは変更しない。
- 価値責任者のメモは確かめる対象の手がかり。前処理の出力で確かめられなければ、確かめられないと書く。
- 人の確認に当たる記録を書かない: kind に owner-confirmation を使わない。collectedBy は ai。
```

## 抜き出し(時間帯ごと)

```
あなたは根拠の抜き出し係です。前処理済みの文字起こし <structured の場所>(JSON。segments の各区間 t=開始、s=関連の点数、p=選手の ID、c=確信の低い候補、k=手がかりの分類と数、cp=コールの言い回しの数、x=本文。「…」は省いた雑談)の、segments の添字 <from> から <to−1> までを読みます。次のコマンドで担当の範囲だけを出して読むこと:
node -e "const j=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(JSON.stringify(j.segments.slice(+process.argv[2],+process.argv[3])))" "<structured の場所>" <from> <to>

配信: <配信者・日付・内容>。出典: <URL>。焦点: <焦点のメモ>
名簿(ID・名前・チーム・階級・ロール): <一覧>

抜き出すもの:
1. matches: 試合ごとに、種類(scrim=大会のチームどうしの練習試合 / custom=それ以外のカスタム / practice=1対1などの練習 / solo=ソロキュー / unknown)、開始と終わり、自チーム(<TEAM-TIER>)、相手(<TEAM-TIER> か「不明」)、結果(win / loss / unknown。勝敗の発言を根拠に)、要点(レーンの優劣・序盤・決め手)、根拠の時刻。
2. shotcalling: 誰が指示を出し、誰が従うか(direction + はコールする側、- は任せる側)、strength(強/中/弱)、kind(player / coach)、話者の確かさ(高/中/低。note に)。
3. playerTraits(trait: laning / pool / mechanics / mental / teamfight / macro / other)、teamStyle(aspect と summary)、teamMacro、coaches(コーチの指導の内容)、overall(全体の見立て)、picks(試合ごとの使用チャンピオン)。
4. unmapped: 名簿の誰かと推定できるが確定できない呼び名だけ(heard・guess・summary・timestamp・source)。名簿外の人は書かない。
5. preprocessingNotes: 前処理の改善点(辞書に無い呼び名、一般語の部分一致の誤検出、落とされていた大事な語)。
```

## まとめ

```
あなたはまとめ係です。時間帯ごとの抜き出しを1つにまとめます。境目をまたぐ試合をつなぎ、通し番号(G1…)を付け、重複を除きます。生の文字起こしは読まない(前処理の出力で確かめられないことは unclear のまま残す)。
```

## 反証の試み(節ごと)

確認係には、点数に効く主張を渡します: 各項目の `summary`・`timestamp`・`source` に加え、`shotcalling` は選手の ID・`direction`・`strength`・`kind`、`matches` は種類・相手・結果。作成側の推論(`opponentBasis`・`resultBasis`・`notes`・`note`)は渡しません。

```
あなたは懐疑的な確認係です。前処理の出力の区間の本文と照らして、次の「<節>」の各主張が支えられているかを確かめます(反証を試みる)。各項目の時刻の前後 ±3 区間を出して読むこと。判定は not-refuted / refuted / unclear。個人情報や 15 文字を超える引用を含む項目は refuted。matches は相手・結果・種類を特に厳しく見る(勝敗の発言が無ければ unclear)。生の文字起こしは読まない。
```

## 書き出しの形

前例: `docs/research/grounds/evidence-transcript-takaya-it-core.json`(kind `evidence-transcript`)。

```json
{
  "kind": "evidence-transcript",
  "file": "<元の文字起こしのファイル名>",
  "description": "<何の配信から、どう作ったか。原文は転載しない。aiCheck は別の AI による反証の試み(人の確認ではない)>",
  "source": { "title": "<…>", "url": "<https://…>", "urlPending": false, "speaker": "<話者(推定)>", "retrievedAt": "<YYYY-MM-DD>", "preprocessed": "data/transcript/structured/<名前>.json", "preprocessedWith": "<前処理のコミット>" },
  "aiCheckBy": "<反証を試みたモデルの名称と版>",
  "caveats": ["<…>"],
  "matches": [
    { "id": "G1", "kind": "<scrim|custom|practice|solo|unknown>", "start": "<h:mm:ss>", "end": "<h:mm:ss>", "ourTeam": "<TEAM-TIER>", "opponent": "<TEAM-TIER か 不明>", "opponentBasis": "<…>", "result": "<win|loss|unknown>", "resultBasis": "<…>", "usableForResults": <true|false>, "aiCheck": "<not-refuted|unclear>", "source": "<URL と時刻>", "lineup": { "<TEAM-TIER>": { "TOP": "<…>" } }, "notes": "<…>" }
  ],
  "picks": { "<playerId>": [{ "champion": "<…>", "game": "<G1>", "timestamp": "<…>", "source": "<…>", "aiCheck": "<…>" }] },
  "shotcalling": { "<playerId>": [{ "summary": "<…>", "source": "<URL と時刻>", "date": "<YYYY-MM-DD>", "type": "<…>", "direction": "<+|->", "strength": "<強|中|弱>", "kind": "<player|coach>", "collectedBy": "ai", "origin": "transcript:<動画の ID>", "timestamp": "<…>", "selfTeam": <true|false>, "note": "<話者の確かさ>", "aiCheck": "<not-refuted|unclear>" }] },
  "playerTraits": { "<playerId>": [{ "trait": "<…>", "summary": "<…>", "source": "<…>", "timestamp": "<…>", "selfTeam": <true|false>, "aiCheck": "<…>" }] },
  "teamMacro": { "<TEAM-TIER>": [{ "text": "<…>", "source": "<…>", "timestamp": "<…>", "selfTeam": <true|false>, "aiCheck": "<…>" }] },
  "teamStyle": { "<TEAM-TIER>": [{ "aspect": "<…>", "summary": "<…>", "source": "<…>", "timestamp": "<…>", "selfTeam": <true|false>, "aiCheck": "<…>" }] },
  "coaches": { "<playerId>": [{ "summary": "<…>", "source": "<…>", "timestamp": "<…>", "aiCheck": "<…>" }] },
  "overall": [{ "summary": "<…>", "source": "<…>", "timestamp": "<…>" }],
  "unmapped": [{ "heard": "<…>", "guess": "<名簿の ID>", "summary": "<…>", "source": "<…>", "timestamp": "<…>" }],
  "preprocessingNotes": ["<…>"]
}
```

- `refuted` の項目は書かない
- `selfTeam`: 配信者の自チームについての項目は true
