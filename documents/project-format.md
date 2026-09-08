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

`typeId` は組み込み定義、カスタム型由来定義、または `customDefinitions` のいずれかに存在する必要があります。未知の `typeId` を持つプロジェクトは、キャンバスへ適用する前に読み込みを拒否します。

`state` の形はノード種類ごとに異なります。たとえば Number Input は `{ "value": 10 }`、Slider Input は `{ "value": 50, "min": 0, "max": 100, "step": 1 }` を利用します。

ノードの `id` はプロジェクト内で一意である必要があります。重複IDや未登録の `typeId` は読み込み時に拒否します。

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

読み込み時は、接続ID、参照先ノード、送受信ポート、型互換性、1入力への重複接続、循環を検証します。不正な箇所は `project.connections[0].toNodeId` のようなパスを含むメッセージで示され、プロジェクト全体をキャンバスへ適用しません。

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

- 自作ノード: `customCode` の構文を検証し、先頭の出力ポートへ結果を返す評価関数を復元する
- 複合ノード: `compositeSubgraph` を評価エンジンが直接実行するため、JSON読み込み後も評価可能

保存JSONを直接編集する場合、`customCode` は実行可能な JavaScript として扱われることに注意してください。構文検証は行いますがサンドボックス化はされないため、信頼できるファイルだけを読み込んでください。

## viewport

`zoom` と `pan` を保持します。省略時は読み込み画面で `zoom: 1.0`、`pan: { x: 60, y: 80 }` が補われます。

## 読み込み時の既定値

省略された項目には次の値が補われます。

| 項目                | 既定値                                       |
| ------------------- | -------------------------------------------- |
| `appName`           | `ModuLoom Project`                           |
| `exportedAt`        | 読み込み時刻                                 |
| `customTypes`       | `[]`                                         |
| `customDefinitions` | `[]`                                         |
| `viewport`          | `{ "zoom": 1, "pan": { "x": 60, "y": 80 } }` |

`version`、`nodes`、`connections` は必須です。それ以外の省略可能な項目には上記の値を補います。

## バージョン互換性

読み込み処理は `version` をマイグレーション表で解決してからスキーマ検証します。現在の対応バージョンは `1.0.0` のみです。未対応バージョンは、対応バージョンを示すメッセージとともに拒否します。形式を更新するときは、旧バージョンから現行バージョンへの変換をマイグレーション表へ追加します。

## セキュリティ

プロジェクトJSONには実行対象となる `customCode` が含まれ得ます。信頼できる作成元のファイルだけを読み込んでください。現在のアプリは自作式を権限制限された iframe や Worker に隔離していません。
