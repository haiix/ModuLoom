# アーキテクチャ

## 全体像

ModuLoom は、React の状態としてグラフを保持し、ブラウザ内の評価エンジンで実行する単一ページアプリケーションです。バックエンド、永続データベース、外部APIへの実リクエストはありません。

```text
React UI
  ├─ App: グラフ・評価結果・表示状態の統合
  ├─ Canvas / NodeView: 編集と結果表示
  ├─ NodeLibrary / 各種モーダル: 定義の作成
  └─ Toolbar / TopologicalVisualizer: 操作と実行順表示
          │
          ▼
Graph model (NodeInstance + Connection + NodeDefinition)
          │
          ├─ typeSystem: 接続時の型互換性
          ├─ dagEngine: 循環検出、実行順、評価、コード生成
          └─ streamEngine: Promise / AsyncIterator 補助処理
```

## データモデル

### NodeDefinition

ノード種類の静的または動的な定義です。主な要素は次のとおりです。

- `typeId`: ノード種類を一意に識別する文字列
- `label`、`description`、`category`: ライブラリとノードUIの表示情報
- `kind`: `input`、`pure`、`output` のいずれか
- `inputs`、`outputs`: 型付きポート定義
- `evaluate(inputs, state)`: ノードの処理本体
- `defaultState`: 新規インスタンスの初期状態
- `customCode`: 自作ノードの JavaScript 式
- `isAsync`: 非同期評価が必要であることを示すフラグ
- `isComposite`、`compositeSubgraph`: 複合ノードの情報

### NodeInstance

キャンバスに置かれたノードです。`id`、`typeId`、座標 `x`／`y`、フォーム値などの `state`、任意の `customLabel` を持ちます。処理本体とポート定義は `typeId` から `NodeDefinition` を引いて取得します。

### Connection

`fromNodeId`／`fromPortId` から `toNodeId`／`toPortId` への有向辺です。入力ポートごとに最大1接続という制約はUIで保証されます。

### GraphEvaluation

ノードIDをキーとして、解決済み入力、出力、エラー、実行時間、保留中・ストリーム中・キャッシュ利用などの実行メタデータを保持します。

## ノード定義の組み立て

実行時の定義一覧は次の順で結合され、`typeId` をキーに Map 化されます。

1. `BUILTIN_NODES`
2. カスタム型ごとに生成した Constructor／Deconstruct／Validate
3. ユーザー作成ノードと複合ノード

同じ `typeId` が複数ある場合は後の定義が Map 上で優先されます。通常のUI操作ではカスタム定義に時刻と乱数を含むIDを生成するため、衝突しにくい設計です。

## 型システム

組み込み型は以下です。

```ts
type BuiltinDataType =
  'number' | 'string' | 'boolean' | 'array' | 'object' | 'promise' | 'stream' | 'any';
```

接続互換性は宣言型だけで判定し、実行値の変換は行いません。同型、片側が `any`、またはカスタム型から `object` への接続を許可します。`any` は双方向に互換なので、型安全性を弱めることに注意してください。

未接続入力はポートの `defaultValue` を利用します。配列とオブジェクトの既定値は JSON でディープコピーし、ノード間での参照共有を避けます。

## DAG の構築と循環検出

接続追加前には、送信先から送信元へ既存経路があるか幅優先探索します。経路があれば新しい辺は循環を作るため拒否します。自己接続も拒否します。

実行順は Kahn 法で求めます。

1. 既存ノード間の接続から入次数と隣接リストを作る
2. 入次数0のノードをキューへ入れる
3. ノードを取り出し、下流の入次数を減らす
4. 入次数0になった下流をキューへ追加する
5. 処理数がノード総数未満なら循環ありと判断する

読み込んだJSONなどに循環が含まれていても、評価時に再検出されます。

## 同期評価

`evaluateGraph` はトポロジカル順にノードを処理します。各入力は上流の評価結果、または入力ポートの既定値から解決されます。上流エラーは下流へ伝播します。

通常ノードでは `evaluate` を呼び、同期結果だけを採用します。Promise を返した場合、同期パスでは一旦空の出力になります。複合ノードは内部グラフを再帰的に評価します。

## 非同期・ストリーム評価

グラフに変更対象の Async または Stream ノードが含まれる場合、同期の高速パスの後で `evaluateGraphAsync` が走ります。

- Promise を返す処理は `await` する
- 非同期ノードは `isPending` を通知する
- `stream/collect` は要素受信ごとに配列、件数、最新値をUIへ通知する
- ストリームは安全上の上限として最大50件を収集する
- React effect の後始末でキャンセルフラグを立て、古い評価のUI反映を抑制する

キャンセルは協調的です。進行中の Promise や AsyncIterator 自体を `AbortController` で停止する設計ではなく、古い結果を反映しないための仕組みです。

## 差分再評価

前回と現在のノード・接続を比較し、変更の起点を求めます。

- ノード追加、`typeId` 変更、`state` 変更: そのノード
- ノード削除: 削除ノードから入力を受けていたノード
- 接続追加・削除: 対象の入力側ノード
- 座標・表示名だけの変更: 再評価なし

変更起点から接続を下流へ探索し、対象集合を作ります。集合外に前回結果があれば `isCached: true` として再利用します。

初回評価とプロジェクト全置換では全ノードを評価します。

## 複合ノード

グループ出力端子から逆向き幅優先探索し、到達できる全ノードと内部接続を `CompositeSubgraph` に保存します。グループ入力端子が外部入力、グループ出力端子が外部出力になります。

通常の入力ノードはサブグラフに状態ごと保存されるため、定数を閉じ込めた部分適用として動作します。評価時にはサブグラフを複製し、外部入力を対応する入力端子の状態へ注入してから内部グラフを評価します。

## TypeScript 生成

`generateTypeScriptCode` はトポロジカル順に処理を直列化し、`evaluatePipeline` を生成します。

- 入力ノードを `PipelineInputs` の任意プロパティへ変換
- カスタム型を `interface` として出力
- 自作ノードの式をインライン化
- Promise／Stream を含む場合は非同期関数とヘルパーを生成
- 出力ノードを戻り値オブジェクトへ変換

生成器はノードの `evaluate` 実装そのものを解析せず、`typeId` ごとのテンプレートを利用します。そのためランタイムと生成コードの差異が生じ得ます。生成物はレビューとテストが必要です。

## 状態管理と永続化

グラフとUI状態は `App` の React state にあります。状態管理ライブラリは使っていません。ブラウザ更新で作業状態は失われます。

永続化はダウンロードする JSON のみです。関数はJSON化できないため、自作ノードは `customCode`、複合ノードは `compositeSubgraph` を保存します。複合ノードは評価エンジンがサブグラフを直接扱えますが、現行の読み込み処理は自作ノードの `customCode` から `evaluate` 関数を再構成しません。

## 主要ファイル

| ファイル                        | 責務                                         |
| ------------------------------- | -------------------------------------------- |
| `src/App.tsx`                   | 状態統合、差分評価、操作ハンドラー、画面構成 |
| `src/types.ts`                  | グラフ、型、評価結果、保存形式の型定義       |
| `src/engine/dagEngine.ts`       | DAG 操作、同期・非同期評価、複合評価、TS生成 |
| `src/engine/typeSystem.ts`      | 型互換性、値型判定、表示整形                 |
| `src/engine/streamEngine.ts`    | Promise／AsyncIterator ヘルパー              |
| `src/nodes/definitions.ts`      | 同期組み込みノードとプリセット               |
| `src/nodes/asyncStreamNodes.ts` | 非同期・ストリームノード                     |
| `src/nodes/customTypeNodes.ts`  | カスタム型由来ノードの生成                   |
| `src/components/Canvas.tsx`     | キャンバス操作、接続検証、ワイヤー描画       |
| `src/components/NodeView.tsx`   | ノードフォーム、ポート、状態・結果表示       |
