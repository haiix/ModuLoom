# アーキテクチャ

## 全体像

ModuLoom は、React の状態としてグラフを保持し、ブラウザ内の評価エンジンで実行する単一ページアプリケーションです。バックエンド、永続データベース、外部APIへの実リクエストはありません。

```text
React UI
  ├─ App: グラフ・評価結果・表示状態の統合
  ├─ Canvas / NodeView: 編集と結果表示
  ├─ NodeLibrary / 各種モーダル: 定義の作成
  └─ Toolbar / CanvasControls / TopologicalVisualizer: 操作と実行順表示
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

評価エンジンは各非同期ノードへ `AbortSignal` を渡します。React effectの破棄を検知するとSignalを中断し、自作式のWorkerは即時終了します。既存の組み込みPromiseやAsyncIteratorはSignalを利用しないため、これらは引き続き古い結果の反映を抑制する協調的キャンセルです。

## 自作コードの隔離実行

`customCodeRunner.ts` はViteがビルドするModule Workerを1つ再利用し、自作式を直列キューで実行します。Worker起動時にrelease-sync版QuickJS-Emscripten WASM moduleを1回初期化し、評価ごとに独立したRuntimeとContextを作成・破棄します。`inputs` はJSONからQuickJS内へ再構築し、結果もQuickJS内でJSON文字列へ正規化してからページへ返します。guestにはmodule loaderやブラウザAPIを登録しません。

QuickJSのPromiseは `resolvePromise` と `executePendingJobs` で進行します。ホスト非同期APIは `newPromise` で実装した0〜1,000msの `sleep(ms)` だけを公開し、解決時にpending jobを再開します。汎用タイマーは公開しません。

各RuntimeはCPU実行750ms、QuickJS heap 16MiB、stack 512KiBに制限します。親スレッドのwall-clock watchdogは1秒です。式はUTF-8で64KiB、入力・返却JSONはそれぞれ1MiBが上限です。通常完了後はWorkerとWASM moduleを次の評価に再利用しますが、Runtime制限超過、親タイムアウト、AbortSignal中断、Worker異常では外側のWorkerを強制終了し、次のキュー項目から新しいWorkerを起動します。古いWorkerの応答IDは現在の評価と一致しないため破棄されます。

事前検証はAcornによる同期式構文検査に加え、DOM、通信、ストレージ、モジュール読込、Worker生成、動的コード生成、プロトタイプ操作に関係する識別子を拒否します。禁止トークン検査は製品ポリシーの補助であり、計算プロパティを含む隔離の境界はguestとホストの間にあるQuickJS VMとJSONデータ境界です。QuickJS-Emscriptenが1.0未満で未監査であること、生成TypeScriptは隔離されないことは残存リスクです。

### 性能基準（2026-09-10）

Node.js 24.20.0／npm 11.19.0 とChromiumで計測しました。移行前は `18932f5`、移行後は本制限を含むQuickJS実装です。数値は機能比較用の単発測定で、CIの固定性能テストにはしません。

| 指標                             |     移行前 |  QuickJS |  許容基準 |
| -------------------------------- | ---------: | -------: | --------: |
| 評価器cold start（Node）         |     0.45ms |  31.52ms | 100ms以下 |
| warm 1評価平均（Node）           | 0.01ms未満 |   1.42ms |  10ms以下 |
| ブラウザWorker cold start        |          - | 539.70ms | 750ms以下 |
| ブラウザWorker warm 1評価平均    |          - |   3.02ms |  10ms以下 |
| カスタムノード10件（直列キュー） |          - |  16.00ms | 100ms以下 |
| Abort後のWorker再生成と次評価    |          - | 202.50ms | 500ms以下 |
| main JS（gzip）                  |   120.51kB | 158.52kB | 175kB以下 |
| Worker JS + WASM（raw）          |          0 | 557.54kB | 600kB以下 |

QuickJS移行によりmain JSはrawで436.08kBから556.96kBへ増加し、別chunkとしてWorker 54.41kBとWASM 503.13kBが追加されます。QuickJSまたはAcornを更新するときは、この表と同じ項目を再計測し、基準超過時は遅延読込やchunk分割を検討します。

## 差分再評価

前回と現在のノード・接続を比較し、変更の起点を求めます。

- ノード追加、`typeId` 変更、`state` 変更: そのノード
- ノード削除: 削除ノードから入力を受けていたノード
- 接続追加・削除: 対象の入力側ノード
- 座標・表示名だけの変更: 再評価なし

変更起点から接続を下流へ探索し、対象集合を作ります。集合外に前回結果があれば `isCached: true` として再利用します。

初回評価とプロジェクト全置換では全ノードを評価します。

## 実行デバッガー

`DagExecutionDebugger` は通常のリアクティブ評価と状態を共有せず、開始時点のグラフ、定義、前回評価を固定したセッションとして動作します。トポロジカル順の次ノードを実行前に公開し、`step` は1ノードだけ、`continue` は次のブレークポイント直前または末尾まで進めます。グラフ編集時はセッションをキャンセルして破棄するため、古い接続に対するデバッグ結果は残りません。

各トレースには解決済み入力、出力、時間、キャッシュ利用、前回結果との差分、エラー伝播元からのノードID列を保存します。Promise待機中とStream収集中は待機状態を通知します。停止時は評価関数の `AbortSignal` を中断し、対応するStreamの `cancel`／Iteratorの `return` を呼びます。通常評価の結果は別に維持され、デバッグ画面を閉じると即座に通常表示へ戻ります。

## 複合ノード

グループ出力端子から逆向き幅優先探索し、到達できる全ノードと内部接続を `CompositeSubgraph` に保存します。探索はグループ入力端子で止まり、それより上流の外部ノードは複合化しません。グループ入力端子が外部入力、グループ出力端子が外部出力になります。

通常の入力ノードはサブグラフに状態ごと保存されるため、定数を閉じ込めた部分適用として動作します。外部ポートと内部端子の対応は `inputPortMappings`／`outputPortMappings` に保存します。評価時にはサブグラフを複製し、この対応に従って外部入力を端子の状態へ注入してから内部グラフを評価します。

展開時は内部ノードと接続を一意なIDへ再採番し、外部入力を Group Input の `in`、外部出力を Group Output の `out` へ再接続します。旧形式の複合定義に明示的な対応情報がない場合は、外部ポートと `inputNodeIds`／`outputNodeIds` の配列順を利用します。対応端子が見つからない接続は警告し、ユーザーが続行を選ぶまでグラフへ適用しません。

## TypeScript 生成

`generateTypeScriptCode` はトポロジカル順に処理を直列化し、`evaluatePipeline` を生成します。

- 入力ノードを `PipelineInputs` の任意プロパティへ変換
- カスタム型を `interface` として出力
- 自作ノードの式をインライン化
- Promise／Stream を含む場合は非同期関数とヘルパーを生成
- 複合ノードを内部グラフへ再帰的に展開
- 出力ノードを戻り値オブジェクトへ変換

各ノード定義は `evaluate` と対になる `codegen` メタデータを持ちます。組み込みノードのメタデータは `src/nodes/codegen.ts` に集約し、定義の登録時に欠落を検出します。生成器は暗黙の既定処理を持たず、未対応ノード、循環、不正な複合境界を `CodeGenerationError` として生成前に拒否します。

ランタイムと生成コードの一致は、全組み込みノードに対するデータ駆動テストに加え、Promise、Stream、複合ノード、生成TypeScriptの型検査で確認します。

## 状態管理と永続化

グラフ、接続、カスタム定義、カスタム型は `EditorDocument` としてまとめ、`EditorHistory` が過去・現在・未来のスナップショットを管理します。各編集はドキュメント全体へ原子的に適用されるため、ノード削除、全消去、プリセット適用、読み込みも1回のUndoで戻せます。ドラッグ中の座標更新はグループ化キーで1操作にまとめます。パンとズームはUI状態として履歴および未保存判定から除外します。

複数ノードのコピー、貼り付け、削除、移動、整列は `graphEditing.ts` の純粋関数で処理します。コピー対象は選択ノードと、その両端が選択範囲内にある接続だけです。貼り付け時はノードと内部接続を一意なIDへ再採番し、外部接続は複製しません。一括操作の結果は1つの `EditorDocument` 更新として履歴へ積みます。

保存時のドキュメント指紋と現在値を比較して未保存状態を判定します。未保存中は `beforeunload` でページ離脱を警告します。状態管理ライブラリは使っていません。ブラウザ更新で作業状態は失われます。

`projectSerialization.ts` の純粋な共通シリアライザーが `EditorDocument` とviewportから
ダウンロード用・ブラウザ復元用で共通のプロジェクト内容を生成します。`evaluate` と
`codegen` は明示的に除外し、自作ノードは `customCode`、複合ノードは
`compositeSubgraph` を保存します。読み込み時は `projectFormat.ts` が形式とグラフ整合性を
検証し、自作ノードの `customCode` から `evaluate` 関数を再構成します。複合ノードは評価
エンジンがサブグラフを直接扱います。

ブラウザ復元用の `RecoverySnapshot` はプロジェクト形式の `version` とは独立した
`storageVersion` を持ち、復元時はコンテナ検証後に同じ `parseFlowProject` を通します。
編集内容とviewportは400msのデバウンスと2秒の最大待機時間でIndexedDBへ保存し、ページが
hiddenになる場合とpagehideでも未反映分の保存を開始します。起動時は復元判定が終わるまで
エディターをmountしないため、空グラフの評価や描画が先行しません。Undo／Redo、評価結果、
選択、モーダル、クリップボードは保存対象外です。

ノードライブラリ開閉とオンボーディングは軽量な端末別UI preferenceとしてLocal Storageに
残し、プロジェクトおよび復元スナップショットへ含めません。IndexedDBの読み書き失敗は
エディターを停止させず警告し、不正スナップショットは自動削除・部分適用しません。

## レスポンシブ操作UI

`Toolbar` はノード追加、保存、読み込み、実行を常設し、補助操作を単一のオーバーフローメニューへまとめます。`toolbarLayout.ts` が画面幅からブランド名と操作ラベルの表示密度を決め、ヘッダー自体は折り返しません。評価方式と表示倍率は `CanvasControls` としてキャンバス右下へ分離しています。アイコンだけになる操作も `aria-label` を持ち、オーバーフローメニューは開閉、フォーカス移動、選択をキーボードで実行できます。

## オンボーディング

`OnboardingGuide` はモーダルではなくキャンバス左下の非遮蔽パネルとして表示します。`onboarding.ts` の純粋な進行判定がノード定義の `kind`、接続、出力ノードの評価結果から入力配置、処理配置、出力配置、接続、実行、成功の段階を決めます。スキップまたは完了は `moduloom:onboarding-status` として Local Storage に保存し、ツールバーからの再表示は保存済み状態を変更せず現在のセッションだけで行います。完成サンプルへの導線は、公式プリセットの安定したID `math-calc` に限定しています。

## 主要ファイル

| ファイル                             | 責務                                         |
| ------------------------------------ | -------------------------------------------- |
| `src/App.tsx`                        | 状態統合、差分評価、操作ハンドラー、画面構成 |
| `src/types.ts`                       | グラフ、型、評価結果、保存形式の型定義       |
| `src/engine/dagEngine.ts`            | DAG 操作、同期・非同期評価、複合評価、TS生成 |
| `src/engine/typeSystem.ts`           | 型互換性、値型判定、表示整形                 |
| `src/engine/streamEngine.ts`         | Promise／AsyncIterator ヘルパー              |
| `src/engine/editorHistory.ts`        | 編集履歴、Undo／Redo、未保存判定             |
| `src/engine/graphEditing.ts`         | 複数選択のコピー、移動、削除、整列           |
| `src/engine/customCodeRunner.ts`     | 自作式のWorkerキュー、時間制限、キャンセル   |
| `src/engine/customCodePolicy.ts`     | 自作式の時間・サイズ・sleep制限定数          |
| `src/engine/customCodeWorker.ts`     | Module Worker内のQuickJS評価要求処理         |
| `src/engine/customCodeVm.ts`         | QuickJS moduleと評価別Runtime/Context管理    |
| `src/engine/projectTrust.ts`         | 読み込み時の実行コード信頼判定               |
| `src/engine/executionDebugger.ts`    | 逐次実行、停止、トレース、エラー経路         |
| `src/nodes/definitions.ts`           | 同期組み込みノードとプリセット               |
| `src/nodes/asyncStreamNodes.ts`      | 非同期・ストリームノード                     |
| `src/nodes/customTypeNodes.ts`       | カスタム型由来ノードとコード生成定義         |
| `src/nodes/codegen.ts`               | 組み込みノードのコード生成メタデータ         |
| `src/components/Canvas.tsx`          | キャンバス操作、接続検証、ワイヤー描画       |
| `src/components/NodeView.tsx`        | ノードフォーム、ポート、状態・結果表示       |
| `src/components/Toolbar.tsx`         | 常設操作とレスポンシブな補助操作メニュー     |
| `src/components/CanvasControls.tsx`  | 評価方式、実行、ズームなどのキャンバス操作   |
| `src/components/toolbarLayout.ts`    | 画面幅に応じたツールバー表示密度             |
| `src/components/OnboardingGuide.tsx` | 初回ガイドの表示と操作                       |
| `src/components/onboarding.ts`       | ガイドの進行判定、保存キー、安定プリセット   |
