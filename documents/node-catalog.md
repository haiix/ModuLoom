# ノードカタログ分類

## 情報モデル

`NodeDefinition.category` は Math / Array のような機能分類として維持し、カタログ表示用の
`catalog` を別軸で持ちます。

| フィールド   | 値                                | 用途                           |
| ------------ | --------------------------------- | ------------------------------ |
| `level`      | `core` / `advanced`               | 習熟度と初期表示を決める       |
| `source`     | `builtin` / `example` / `project` | 提供元と配置セクションを決める |
| `searchTags` | 文字列配列                        | 表示名や説明にない検索語を補う |

表示セクションは提供元を優先し、`example` は Examples、`project` は Project、それ以外は
`level` に応じて Core または Advanced とします。分類情報を持たない既存の自作ノードと複合
ノードは `advanced` / `project` として扱います。

初期状態では Core と Project を展開し、Advanced と Examples を折りたたみます。これは表示上の
整理だけであり、ノード定義は登録されたままです。検索中は全セクションと機能カテゴリを展開し、
折りたたまれたノードも検索対象にします。

## 全組み込みノードの分類

機能カテゴリは各定義の `category` と同じです。以下の53件を分類対象とします。

| セクション | 機能カテゴリ | `typeId`                                                                                                          |
| ---------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Core       | Input        | `input/number`, `input/slider`, `input/text`, `input/boolean`, `input/array`, `input/json`                        |
| Core       | Math         | `math/add`, `math/subtract`, `math/multiply`, `math/divide`, `math/modulo`, `math/round`, `math/abs`, `math/sqrt` |
| Core       | String       | `string/concat`, `string/uppercase`, `string/length`                                                              |
| Core       | Logic        | `logic/and`, `logic/or`, `logic/not`, `logic/greater`, `logic/equal`, `logic/branch`                              |
| Core       | Array        | `array/create`, `array/length`, `array/join`, `array/sum`                                                         |
| Core       | Object       | `object/create`, `object/get`, `object/stringify`                                                                 |
| Core       | Output       | `output/inspector`                                                                                                |
| Advanced   | String       | `string/template`, `string/split`                                                                                 |
| Advanced   | Array        | `array/map`, `array/filter`, `array/slice`, `array/reverse`                                                       |
| Advanced   | Async        | `async/delay`, `async/resolve`, `async/await`, `async/all`                                                        |
| Advanced   | Stream       | `stream/interval`, `stream/from_array`, `stream/map`, `stream/filter`, `stream/take`, `stream/collect`            |
| Advanced   | Output       | `output/gauge`, `output/status`, `output/log`                                                                     |
| Advanced   | Composite    | `composite/input-port`, `composite/output-port`                                                                   |
| Examples   | Async        | `async/fetch`                                                                                                     |

User / Point2D を含むサンプルを開く・挿入したときに生成される Constructor、Deconstruct、
Validate は Examples に配置します。新規プロジェクトへ教材型は自動投入しません。ユーザーが
新しく作るカスタム型由来ノード、自作ノード、作成済み複合ノードは Project に配置します。

## Node Library の情報設計

```text
[検索: 名前・説明・機能カテゴリ・検索タグ]
▼ Core (31)        最初に使う基本ノード
  ▼ Input (6)
  ▼ Math (8)
  ...
▶ Advanced (21)    必要に応じて使う高度なノード
▶ Examples (1+n)   学習用の定義とシミュレーション
▼ Project (n)      このプロジェクト固有のノード
```

各セクション内は従来の機能カテゴリでまとめます。セクションとカテゴリの見出しはボタンとして
キーボード操作でき、展開状態を `aria-expanded` で支援技術へ伝えます。ノード自体もボタンなので、
ポインター操作なしでキャンバスへ追加できます。

## 互換性方針

- `typeId`、ポート、評価処理、保存済みノードインスタンスは変更しません。
- 折りたたみは登録や評価からの除外ではないため、Advanced / Examples の既存ノードも復元できます。
- 旧プロジェクトのカタログ情報がない自作定義は Project にフォールバックします。
- カスタム型の `catalogSource` は任意項目です。旧データは Project として扱い、現行バージョンの
  読み込み互換性を保ちます。
