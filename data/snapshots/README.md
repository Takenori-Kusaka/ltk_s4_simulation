# スナップショットの形式(F-003 基準7・8・9)

調査(人または AI)で集めた静的なデータ・定性の評価・メタを、JSON のファイルとしてこのディレクトリに置きます。形は ADR-0003(`context/decisions/0003-evidence-based-input-data.md`)に従います。読み込みと検証は `src/collect/snapshots.ts` が行います。

| 種別 | `kind` | 読み込む関数 | 拒否する条件 |
| --- | --- | --- | --- |
| 静的(過去) | `static` | `readStaticSnapshot` | 値・出典・取得日・確度・書いた主体のどれかが欠けた値。選手と項目名をエラーに出す |
| 定性の評価 | `qualitative` | `readQualitativeSnapshot` | 0〜10 の点数・根拠の文章・出典・書いた主体のどれかが欠けた評価。選手と項目名をエラーに出す |
| メタ | `meta` | `readMetaSnapshot`・`saveMetaSnapshot` | パッチ番号・取得日・出典・確度・書いた主体のどれかが欠けたファイル全体 |

共通の規則:

- 選手は `src/data/roster.ts` の ID(`DD-CORE-TOP` の形)で書きます。名簿に無い選手は拒否します
- 取得日は `YYYY-MM-DD`、確度は `高`・`中`・`低` のどれかです
- 書いた主体は `{ "kind": "human" }`・`{ "kind": "riot-api" }`・`{ "kind": "ai", "model": "<モデル名>" }` のどれかです。AI の場合はモデル名が要ります
- 静的・定性のファイルは項目ごとに検証し、拒否した項目だけを除いて残りを受け付けます。メタはファイル単位で受け付けるか拒否します
- `loadSnapshotFile(<パス>)` は `kind` を見て、上の関数へ振り分けます

## 静的(`kind: "static"`)

過去の LTK の戦績とピック、最高ランク、得意ピック、調査時点の戦績サイトの数値を、選手 → 項目名 → 値の形で書きます。値は数値か空でない文字列です。一覧(得意ピックなど)は `、` で区切った文字列にします。

```json
{
  "kind": "static",
  "players": {
    "DD-CORE-TOP": {
      "peakRank": {
        "value": "MASTER I 200",
        "source": "docs/research/players-dd-cc.md",
        "retrievedAt": "2026-10-08",
        "confidence": "中",
        "author": { "kind": "ai", "model": "gemini-2.5-pro" }
      },
      "signaturePicks": {
        "value": "Aatrox、Renekton",
        "source": "https://example.invalid/ltk-s3",
        "retrievedAt": "2026-10-08",
        "confidence": "高",
        "author": { "kind": "human" }
      }
    }
  }
}
```

## 定性の評価(`kind: "qualitative"`)

IGL 力・コール力・性格・メンバー相性・コーチ・対面との相性・成長ポテンシャルなどを、選手 → 項目名 → 評価の形で書きます。点数は 0〜10 の数値、根拠の文章は空にできません。

```json
{
  "kind": "qualitative",
  "players": {
    "DD-CORE-JG": {
      "igl": {
        "score": 7,
        "rationale": "LTK S3 で全試合のコールを担当し、終盤の集団戦の判断が安定していた",
        "sources": ["docs/research/players-dd-cc.md"],
        "author": { "kind": "ai", "model": "gemini-2.5-pro" }
      }
    }
  }
}
```

## メタ(`kind: "meta"`)

1つのパッチについて、強化・弱体の一覧(`patchChanges`)、Worlds の使用率と BAN 率(`worldsPickBan`)、ロールごとの Tier(`roleTiers`)、ビルドとマクロの流行(`trends`)を書きます。パッチ番号(`25.19` の形)と取得日はファイルに1つ書き、読み込み時に各データへ付けます。`saveMetaSnapshot(<ディレクトリ>, <データ>)` は、付けた結果を `meta-<パッチ番号>-<取得日>.json` へ保存します。

```json
{
  "kind": "meta",
  "patch": "25.19",
  "retrievedAt": "2026-10-08",
  "source": "https://example.invalid/patch-25-19-notes",
  "confidence": "高",
  "author": { "kind": "human" },
  "patchChanges": [{ "champion": "Ahri", "change": "buff", "summary": "Q のダメージ増加" }],
  "worldsPickBan": [{ "champion": "Azir", "pickRate": 0.4, "banRate": 0.3 }],
  "roleTiers": [{ "role": "MID", "champion": "Azir", "tier": "S" }],
  "trends": [{ "kind": "macro", "summary": "早期のドラゴン争い" }]
}
```

## F-002 の採点への受け渡し

`toPlayerFile(<選手ID>, <静的の一覧>, <定性の一覧>)` は、検証済みの静的・定性のスナップショットを `src/data/types.ts` の `PlayerFile`(`metrics`・`qualitative`)へ統合します。同じ項目が複数あれば、静的は取得日の新しい値を、定性は一覧の後ろのファイルの評価を採ります。`recentMatches` は空で返します(Riot API の集計は F-003 Task-2 が担う)。
