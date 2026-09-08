# プロジェクトファイル仕様

## 概要

プロジェクトは UTF-8 の JSON ファイルとして保存されます。現行バージョンは `1.0.0` です。保存ファイル名は `moduloom-graph-YYYY-MM-DD.json` です。

## トップレベル構造

```ts
interface FlowProjectExport {
  version: '1.0.0';
  appName: string;
  exportedAt: string;
  nodes: NodeInstance[];
  connections: Connection[];
  customTypes?: CustomTypeDefinition[];
  customDefinitions?: NodeDefinition[];
  viewport?: {
    zoom: number;
    pan: { x: number; y: number };
  };
}
```

例:

```json
{
  "version": "1.0.0",
  "appName": "ModuLoom Project",
  "exportedAt": "2026-09-07T08:00:00.000Z",
  "nodes": [
    {
      "id": "n_input_1",
      "typeId": "input/number",
      "x": 100,
      "y": 120,
      "state": { "value": 10 },
      "customLabel": "入力値"
    }
  ],
  "connections": [],
  "customTypes": [],
  "customDefinitions": [],
  "viewport": {
    "zoom": 1,
    "pan": { "x": 60, "y": 80 }
  }
}
```

## nodes

```ts
interface NodeInstance {
  id: string;
  typeId: string;
  x: number;
  y: number;
  state?: unknown;
  customLabel?: string;
}
```

`typeId` は組み込み定義、カスタム型由来定義、または `customDefinitions` のいずれかに存在する必要があります。未知の `typeId` を持つノードはキャンバスに描画されず、評価時には「未登録のノード定義」エラーになります。

`state` の形はノード種類ごとに異なります。たとえば Number Input は `{ "value": 10 }`、Slider Input は `{ "value": 50, "min": 0, "max": 100, "step": 1 }` を利用します。

## connections

```ts
interface Connection {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
}
```

UIで作る接続には次の制約があります。

- 送信元は出力ポート、送信先は入力ポート
- 型が互換
- 循環を作らない
- 1入力ポートにつき最大1接続

読み込み時は `nodes` と `connections` が配列であることだけを検査します。各ID、型互換性、重複入力、循環、参照整合性の厳密なスキーマ検証は行いません。外部で生成・編集したJSONは、読み込み前に検証してください。

## customTypes

```ts
interface CustomTypeDefinition {
  id: string;
  name: string;
  color: string;
  description?: string;
  fields: Array<{
    name: string;
    type: BuiltinDataType;
    required?: boolean;
    defaultValue?: unknown;
  }>;
}
```

読み込み後、各カスタム型から Constructor／Deconstruct／Validate の3ノードが動的に生成されます。

## customDefinitions

自作ノードと複合ノードを格納します。`NodeDefinition` には本来 `evaluate` 関数がありますが、関数は JSON に保存できません。

- 自作ノード: `customCode` の文字列は保存されるが、現行の読み込み処理は評価関数を自動復元しない
- 複合ノード: `compositeSubgraph` を評価エンジンが直接実行するため、JSON読み込み後も評価可能

読み込んだ自作ノードを利用するには、自作ノードマネージャーで対象定義を編集し、保存し直して評価関数を再作成する必要があります。将来的には、読み込み時に検証済み `customCode` から関数を復元する処理が必要です。

保存JSONを直接編集する場合、`customCode` は実行可能な JavaScript として扱われることに注意してください。

## viewport

`zoom` と `pan` を保持します。省略時は読み込み画面で `zoom: 1.0`、`pan: { x: 60, y: 80 }` が補われます。

## 読み込み時の既定値

省略された項目には次の値が補われます。

| 項目                | 既定値                                       |
| ------------------- | -------------------------------------------- |
| `version`           | `1.0.0`                                      |
| `appName`           | `ModuLoom Project`                           |
| `exportedAt`        | 読み込み時刻                                 |
| `customTypes`       | `[]`                                         |
| `customDefinitions` | `[]`                                         |
| `viewport`          | `{ "zoom": 1, "pan": { "x": 60, "y": 80 } }` |

`nodes` または `connections` が配列でない場合は読み込みを拒否します。

## バージョン互換性

現行の読み込み処理は `version` の値によるマイグレーションや拒否を行いません。将来形式を変更する場合は、次を追加することを推奨します。

1. JSON Schema または同等の実行時検証
2. バージョンごとのマイグレーター
3. 未知バージョンの拒否または読み取り専用プレビュー
4. 読み込み前のバックアップ導線

## セキュリティ

プロジェクトJSONには実行対象となる `customCode` が含まれ得ます。信頼できる作成元のファイルだけを読み込んでください。現在のアプリは自作式を権限制限された iframe や Worker に隔離していません。
