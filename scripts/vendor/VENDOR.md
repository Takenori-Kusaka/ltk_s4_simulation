# 複製したファイル

このディレクトリのファイルは [process-compass](https://github.com/Takenori-Kusaka/process-compass) からの複製です。**正本は複製元にあり、ここを手で編集しません**。

| ファイル | 複製元 |
| --- | --- |
| `tailoring-engine.mjs` | `src/lib/tailoring-engine.mjs` |
| `tailoring-kb.json` | `src/data/tailoring/*.yaml` と `src/data/processes/integrated.yaml` から生成 |

## なぜ複製するのか

テーラリングの判定ロジックを2箇所に書くと、標準の改訂がテンプレートへ伝わらなくなります。規則の追加や閾値の変更が、標準の記述とテンプレートの挙動で食い違う状態を作りません。

`tailoring-kb.json` が JSON なのは、テンプレートのスクリプトを**依存パッケージなしで動かす**ためです。正本の YAML は人が読み書きする形式で、JSON はその符号化です。

## 更新の手順

process-compass 側で実行します。

```bash
node scripts/build-template-kb.mjs
cp src/lib/tailoring-engine.mjs template/scripts/vendor/tailoring-engine.mjs
```

## 乖離の検出

process-compass の `npm run check` が `scripts/check-template-drift.mjs` を実行し、複製元との差分を検出します。差分があれば失敗します。

複製を先に書き換えても、検査は複製元との一致を求めます。**変更は必ず複製元から行ってください**。
