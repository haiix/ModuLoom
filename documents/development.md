# 開発ガイド

## セットアップ

```bash
npm install
npm run dev
```

開発サーバーはポート3000、ホスト `0.0.0.0` で起動します。環境変数ファイルは不要です。

TypeScript は `typescript-eslint` の対応範囲に合わせ、6系の最新互換版を使用します。TypeScript 7へ更新する際は、`typescript-eslint` が7系を正式対応してから両方を同時に更新してください。

## 検証コマンド

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`lint` は ESLint、`typecheck` は `tsc --noEmit`、`test` は Vitest、`test:e2e` は
Playwrightを実行します。コミット前には `npm run format:check` も実行してください。

初回のE2Eテスト実行前にChromiumをインストールします。

```bash
npx playwright install chromium
```

対話的にテストを作成・調査する場合は `npm run test:e2e:ui` を使用してください。

本番ビルドを確認する場合:

```bash
npm run preview
```

## ディレクトリ構成

```text
.
├─ public/                  静的公開ファイル
├─ e2e/                     Playwright E2Eテスト
├─ tests/                   Vitest 単体テスト
├─ .github/workflows/       GitHub Actions CI
├─ src/
│  ├─ components/          React UI コンポーネント
│  ├─ engine/              型、DAG、非同期・ストリーム評価
│  ├─ nodes/               組み込み・動的ノード定義
│  ├─ App.tsx              アプリ状態と機能の統合
│  ├─ main.tsx             React エントリーポイント
│  ├─ index.css            Tailwind CSS 読み込み
│  └─ types.ts             共有型と型カラー
├─ documents/              詳細ドキュメント
├─ index.html              HTML エントリーポイント
├─ package.json            npm 設定
├─ playwright.config.ts    Playwright 設定
├─ tsconfig.json           TypeScript 設定
└─ vite.config.ts          Vite／React／Tailwind 設定
```

## ノードを追加する

同期ノードは原則として `src/nodes/definitions.ts` の `BUILTIN_NODES` へ、非同期・ストリームノードは `src/nodes/asyncStreamNodes.ts` へ追加します。

```ts
{
  typeId: 'math/example',
  label: 'Example',
  category: 'Math',
  kind: 'pure',
  description: '入力を2倍する',
  inputs: [
    { id: 'value', name: 'value', type: 'number', defaultValue: 0 },
  ],
  outputs: [
    { id: 'result', name: 'result', type: 'number' },
  ],
  evaluate: (inputs) => ({
    result: Number(inputs.value ?? 0) * 2,
  }),
}
```

追加時に確認する項目:

1. `typeId` が既存定義と重複しない
2. ポートIDがノード内で一意
3. 宣言した出力型と実際の値が一致する
4. 入力オブジェクトや配列を破壊的に変更しない
5. 未接続入力に妥当な既定値がある
6. 例外メッセージが利用者に理解できる
7. NodeView に専用フォームが必要なら状態編集UIも追加する
8. `evaluate` と同じ挙動の `codegen` メタデータを追加する
9. ノードリファレンスを更新する

非同期ノードは `isAsync: true` を付け、`evaluate` から Promise を返します。ストリームには `AsyncIterable` を返し、既存の `streamEngine` ヘルパーを優先して利用してください。

## ノード状態と差分判定

差分評価は `state` を `JSON.stringify` して前回値と比較します。そのため、状態はJSONとして安定して表現できるプレーンな値にしてください。関数、循環参照、Map、Set、Dateなどを `state` に直接持たせる設計は避けます。

位置と `customLabel` は評価結果に影響しないものとして差分判定から除外されています。評価ロジックに影響する値は必ず `state` に置いてください。

編集操作は `EditorDocument` を `commitEditorDocument` へ渡して履歴化します。複数のstate setterで1つの操作を分割せず、ノードと接続を同時に変える削除・置換は1つのドキュメント更新にまとめてください。マウス移動のような連続更新にはグループ化キーを使い、操作終了時に `finishEditorHistoryGroup` を呼びます。パンとズームなど保存対象外の表示状態は編集履歴へ含めません。

複数ノード操作は `src/engine/graphEditing.ts` に置き、Canvasの座標処理やReact stateから分離します。コピーでは接続の両端が選択済みかを検査し、外部接続をクリップボードへ含めないでください。貼り付けではノードIDと接続IDを再採番し、接続端点も新しいノードIDへ写像します。

## ツールバーを変更する

常に到達可能である必要があるノード追加、保存、読み込み、実行は `Toolbar` の主要操作領域に置きます。それ以外の操作は「その他の操作」へ追加し、アイコンだけのボタンには必ず `aria-label` を付けてください。表示ラベルのブレークポイントは `toolbarLayout.ts` に集約し、変更時は `tests/toolbarLayout.test.ts` の 1280px、1024px、768px ケースを更新します。手動確認では各幅でヘッダーの横スクロールや縦折り返しがないこと、メニューをキーボードで開閉・選択できることも確認してください。

オンボーディングの段階は `onboarding.ts` の純粋関数で判定します。案内文だけで段階を進めず、入力・処理・出力の各 `kind`、入力から処理と処理から出力への接続、エラーのない出力評価を成功条件にしてください。ガイドに追加するプリセットは、全プリセット評価テストを通る固定IDだけを `STARTER_PRESET_ID` として指定します。進行判定と `OnboardingGuide` の表示内容は `tests/onboarding.test.ts` で同時に検証します。

## カスタム型を拡張する

カスタム型由来ノードは `generateNodesForCustomType` が生成します。型検証の現行仕様は必須フィールドの存在確認だけです。型ごとの厳密な実行時検証を追加する場合は、配列、Promise、Stream、`null` の扱いを `typeSystem.detectValueType` と整合させてください。

## 接続ルールを変更する

接続時の型互換性は `src/engine/typeSystem.ts` の `isTypeCompatible`、循環チェックは `src/engine/dagEngine.ts` の `wouldCreateCycle` にあります。

UIだけでなく、`src/engine/projectFormat.ts` の外部JSON検証も同じ接続ルールへ更新してください。

## 評価エンジンを変更する

同期評価と非同期評価には入力解決、エラー伝播、キャッシュ再利用の重複ロジックがあります。一方だけを変更すると挙動がずれる可能性があります。次を両方確認してください。

- `evaluateGraph`
- `evaluateGraphAsync`

複合ノードには対応する `evaluateCompositeNode` と `evaluateCompositeNodeAsync` もあります。

自作ノードの評価は `customCodeRunner.ts` の `createCustomNodeEvaluator` を必ず利用し、UIや読み込み処理で式を直接実行しないでください。禁止APIの変更は `validateCustomCode`、時間・サイズ上限は同ファイルの定数へ集約します。非同期評価のキャンセルは `EvaluationContext.signal` を通じて伝播するため、新しい長時間ノードも可能ならSignalを監視してください。

## TypeScript 生成を変更する

生成処理は `src/engine/dagEngine.ts` 後半、組み込みノードの生成メタデータは `src/nodes/codegen.ts` にあります。ランタイムの `evaluate` 関数から自動生成しているわけではないため、新しい組み込みノードには同じ `typeId` の生成メタデータが必要です。欠落した定義は登録時またはコード生成前にエラーになります。

最低限、入力の既定値、ノード状態、エラー時の挙動、Promise の解決、Stream の終了条件、出力ポート名をランタイムと比較してください。`tests/codegenParity.test.ts` の全組み込みノード一覧と比較ケースも同時に更新し、生成されたTypeScriptの型検査を通してください。

## プロジェクト形式を変更する

保存形式の型は `FlowProjectExport`、書き出しは `App.tsx` の `handleExportJson`、読み込みは `LoadGraphModal.tsx` と `handleLoadProject` にあります。

`version` を上げる場合は、`src/engine/projectFormat.ts` のマイグレーション表へ旧形式からの変換を追加し、往復テストも更新してください。未対応バージョンは適用前に拒否されます。

## テスト

`tests/` には型システム、DAG操作・同期評価、実行デバッガー、AsyncIteratorユーティリティの単体テストがあります。

```bash
npm test
npm run test:watch
```

### E2Eテスト方針

`e2e/` のPlaywrightテストは、ReactコンポーネントとブラウザAPIをまたぐ重要な利用者フローを検証します。評価ロジックの網羅は高速なVitestへ残し、E2Eで同じ入力組み合わせを重複して検証しません。Vitestの対象は `tests/`、Playwrightの対象は `e2e/` に分離します。

初期対象は次のスモークテストです。

- アプリが空のキャンバスと主要操作を表示できる
- サンプルプリセットを選択し、グラフを実行して結果を確認できる
- グラフ編集を元に戻し、やり直せる

今後は不具合リスクと回帰実績に応じて、ポート間のドラッグ接続、JSON保存・読込、カスタムノード作成を追加します。表示文言や細かな見た目だけを固定するテストは避け、利用者が認識できるrole・labelを優先します。キャンバス上の座標操作など、それだけでは安定して特定できない要素に限り `data-testid` または既存の `data-node-id` を使用してください。

CIとローカルの既定ブラウザはChromiumのみです。ブラウザ固有の不具合が判明するまではFirefox・WebKitを常時実行せず、実行時間と保守コストを抑えます。CIで失敗した場合はHTMLレポートとtraceを `playwright-report` 成果物から確認できます。スクリーンショットとtraceは初回の再試行時に保存されます。

今後の推奨テスト範囲:

- `wouldCreateCycle`: 自己辺、直列、分岐、閉路
- `getTopologicalOrder`: 独立ノード、複数の依存、閉路
- `isTypeCompatible`: 組み込み型、`any`、カスタム型から `object`
- `detectDirtySeedNodeIds`: 状態、接続、削除、位置だけの変更
- 同期・非同期評価: 既定値、上流エラー、キャッシュ、キャンセル通知
- Stream: map、filter、take、collect 上限
- 保存・読み込み: 往復、欠落項目、不正ID、旧バージョン
- コード生成: 各組み込みノードのランタイム結果との一致

## コーディング上の注意

- TypeScript は `noEmit`、`isolatedModules`、bundler module resolution を使用します。
- `skipLibCheck` が有効で、`strict` は明示されていません。
- React は `StrictMode` で起動します。副作用は再実行されても安全にしてください。
- UIは Tailwind CSS のユーティリティクラスとダークモードクラスを使用します。
