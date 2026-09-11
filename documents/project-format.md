# プロジェクトファイル仕様

## 概要

プロジェクトは UTF-8 の JSON ファイルとして保存されます。現行バージョンは `1.1.0` です。保存ファイル名は `moduloom-graph-YYYY-MM-DD.json` です。

## トップレベル構造

```ts
interface FlowProjectExport {
  version: '1.0.0' | '1.1.0';
  appName: string;
  exportedAt: string;
  nodes: NodeInstance[];
  connections: Connection[];
  customTypes?: CustomTypeDefinition[];
  customDefinitions?: SerializedNodeDefinition[];
  viewport?: {
    zoom: number;
    pan: { x: number; y: number };
  };
}

type SerializedNodeDefinition = Omit<NodeDefinition, 'evaluate' | 'codegen'>;
```

例:

```json
{
  "version": "1.1.0",
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
  catalogSource?: 'example' | 'project';
  fields: Array<{
    name: string;
    type: BuiltinDataType;
    required?: boolean;
    defaultValue?: unknown;
  }>;
}
```

読み込み後、各カスタム型から Constructor／Deconstruct／Validate の3ノードが動的に生成されます。
`catalogSource` はノードライブラリの Examples / Project 分類を保持する任意項目です。省略された
旧ファイルのカスタム型は Project として扱います。

## customDefinitions

自作ノードと複合ノードを格納します。保存時は共通シリアライザーが
`NodeDefinition` の `evaluate` と `codegen` を明示的に除外します。

任意の `catalog`（`level`、`source`、`searchTags`）は保存・復元します。分類情報のない既存の
自作・複合ノードはノードライブラリで Project に分類されます。

- 自作ノード: `customCode` の構文をAcornで、禁止APIを製品ポリシーとして同期検証し、Web Worker内で実行して先頭の出力ポートへ結果を返す非同期評価関数を復元する
- 複合ノード: `compositeSubgraph` を評価エンジンが直接実行するため、JSON読み込み後も評価可能

複合ノードの `compositeSubgraph` は内部の `nodes`、`connections`、`inputNodeIds`、`outputNodeIds` に加え、次の境界対応を保存します。

```ts
interface CompositePortMapping {
  externalPortId: string;
  internalNodeId: string;
}

interface CompositeSubgraph {
  // nodes, connections, inputNodeIds, outputNodeIds ...
  inputPortMappings?: CompositePortMapping[];
  outputPortMappings?: CompositePortMapping[];
}
```

対応情報は複数の入出力や同名端子を一意に扱い、展開時に外部接続を Group Input／Group Output へ復元するために使います。対応情報がない旧ファイルは、外部ポートと端子ID配列の順序で復元します。

保存JSONを直接編集する場合、`customCode` は実行可能な JavaScript として扱われることに注意してください。自作式を含むファイルは、解析後に表示される信頼確認へチェックしない限り適用できません。式はページ本体とは別のWeb Workerで実行され、1秒の実行時間と1MiBのJSON返却サイズに制限されます。

`parseFlowProject` と `parseFlowProjectJson` は同期APIのままです。読み込み時は式を実行せず、Acornによる式構文と禁止トークンだけを同期検証します。復元されたノードの `evaluate` は非同期で、実際のQuickJS評価エラーはDAG評価または式のテスト実行時に通知されます。

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

## ブラウザ復元スナップショット

ブラウザ内の復元データはプロジェクト形式を内包する別の形式です。プロジェクトの
`version` と保存コンテナの `storageVersion` は独立して更新します。

```ts
interface RecoverySnapshot {
  storageVersion: 2;
  project: FlowProjectExport;
  updatedAt: string;
  revision: number;
  writerId: string;
  wasDirty: boolean;
  trustedCodeFingerprint?: string;
}
```

復元時は `storageVersion` とメタデータを検証し、内包する `project` をファイル読込と同じ
`parseFlowProject` の検証・マイグレーション経路へ渡します。ノードライブラリ開閉状態と
オンボーディング状態は端末別UI preferenceのため、このスナップショットにも含めません。
現在の保存先はIndexedDBです。編集とviewport変更は継続的に保存され、復元時のUndo／Redo
履歴、評価結果、選択状態などの実行時UI状態は引き継ぎません。不正または未対応のスナップ
ショットは適用・自動削除せず、画面上の操作で明示的に破棄できます。

`trustedCodeFingerprint` は自作定義の `typeId` と `customCode` を安定順に並べた内容に対する
SHA-256です。復元時に現在内容から再計算した値と一致する場合だけ信頼状態を継続します。
値が欠落・不正・不一致の場合はエディターを開始せず、利用者の明示的な信頼確認を要求します。
スキーマ、式の構文、禁止APIの検査はfingerprintの有無にかかわらず毎回実行します。

`revision` は保存ごとに単調増加し、`writerId` はタブごとに生成します。保存はIndexedDBの
単一readwriteトランザクション内で現在のrevisionと直前に読み込んだrevisionを比較してから
行います。異なる場合は他タブの内容を上書きせず、自動保存を停止します。旧
`storageVersion: 1` は読み込み時に現行形式へ移行します。

ブラウザ保存は同一オリジン内の障害復旧用であり、ファイル形式の代替ではありません。
サイトデータの削除、プライベートブラウズ終了、ブラウザによるストレージ消去、または
protocol・host・portのいずれかが変わるオリジン変更では参照できなくなります。永続保管や
端末間共有には、同じ`FlowProjectExport`を使うJSON書き出しを利用します。

Local Storageの`moduloom:node-library-open`と`moduloom:onboarding-status`は、同期読込が
必要なプロジェクト非依存のUI preferenceです。これらはプロジェクトJSONにも
`RecoverySnapshot`にも含まれず、IndexedDBからの復元で変更されません。評価結果、
Undo／Redo履歴、選択、開いているモーダルなども保存形式外で、復元後に必要な状態を再計算・
再初期化します。

## セキュリティ

プロジェクトJSONには実行対象となる `customCode` が含まれ得ます。式はWorker内のQuickJS VMで実行され、DOMとアプリ状態をguestへ公開しません。構文・禁止トークン検査は早期エラーのための製品ポリシーであり、セキュリティ境界ではありません。信頼できる作成元のファイルだけを読み込んでください。詳細はルートの `SECURITY.md` を参照してください。
