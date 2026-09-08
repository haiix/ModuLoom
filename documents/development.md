# 開発ガイド

## セットアップ

```bash
npm install
npm run dev
```

開発サーバーはポート3000、ホスト `0.0.0.0` で起動します。`DISABLE_HMR=true` の場合、Vite の HMR とファイル監視を無効にします。

現行コードは `.env.example` の `GEMINI_API_KEY`、`APP_URL` を参照しません。環境変数ファイルを作らなくてもフロントエンドを起動できます。

TypeScript は `typescript-eslint` の対応範囲に合わせ、6系の最新互換版を使用します。TypeScript 7へ更新する際は、`typescript-eslint` が7系を正式対応してから両方を同時に更新してください。

## 検証コマンド

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`lint` は ESLint、`typecheck` は `tsc --noEmit`、`test` は Vitest を実行します。コミット前には `npm run format:check` も実行してください。

本番ビルドを確認する場合:

```bash
npm run preview
```

## ディレクトリ構成

```text
.
├─ public/                  静的公開ファイル
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
8. TypeScript生成を対応させるなら `getPureFunctionInlineCode` に同じ `typeId` を追加する
9. ノードリファレンスを更新する

非同期ノードは `isAsync: true` を付け、`evaluate` から Promise を返します。ストリームには `AsyncIterable` を返し、既存の `streamEngine` ヘルパーを優先して利用してください。

## ノード状態と差分判定

差分評価は `state` を `JSON.stringify` して前回値と比較します。そのため、状態はJSONとして安定して表現できるプレーンな値にしてください。関数、循環参照、Map、Set、Dateなどを `state` に直接持たせる設計は避けます。

位置と `customLabel` は評価結果に影響しないものとして差分判定から除外されています。評価ロジックに影響する値は必ず `state` に置いてください。

## カスタム型を拡張する

カスタム型由来ノードは `generateNodesForCustomType` が生成します。型検証の現行仕様は必須フィールドの存在確認だけです。型ごとの厳密な実行時検証を追加する場合は、配列、Promise、Stream、`null` の扱いを `typeSystem.detectValueType` と整合させてください。

## 接続ルールを変更する

接続時の型互換性は `src/engine/typeSystem.ts` の `isTypeCompatible`、循環チェックは `src/engine/dagEngine.ts` の `wouldCreateCycle` にあります。

UIだけでなく、外部JSONを読み込む経路も考慮してください。現在の読み込み処理は接続の厳密なバリデーションを行わないため、ルールを強化する場合は読み込み時検証の追加も推奨します。

## 評価エンジンを変更する

同期評価と非同期評価には入力解決、エラー伝播、キャッシュ再利用の重複ロジックがあります。一方だけを変更すると挙動がずれる可能性があります。次を両方確認してください。

- `evaluateGraph`
- `evaluateGraphAsync`

複合ノードには対応する `evaluateCompositeNode` と `evaluateCompositeNodeAsync` もあります。

## TypeScript 生成を変更する

生成処理は `src/engine/dagEngine.ts` 後半にあります。ランタイムの `evaluate` 関数から自動生成しているわけではないため、新しい組み込みノードを追加しただけでは生成コードは対応しません。

最低限、入力の既定値、ノード状態、エラー時の挙動、Promise の解決、Stream の終了条件、出力ポート名をランタイムと比較してください。

## プロジェクト形式を変更する

保存形式の型は `FlowProjectExport`、書き出しは `App.tsx` の `handleExportJson`、読み込みは `LoadGraphModal.tsx` と `handleLoadProject` にあります。

`version` を上げる場合は、旧形式の読み込み方針とマイグレーションを同時に実装してください。現状はバージョン文字列を保存するだけで、分岐には利用していません。

## テスト

`tests/` には型システム、DAG操作・同期評価、AsyncIteratorユーティリティの単体テストがあります。

```bash
npm test
npm run test:watch
```

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

- パスエイリアス `@/*` はリポジトリルートを指します。
- TypeScript は `noEmit`、`isolatedModules`、bundler module resolution を使用します。
- `skipLibCheck` が有効で、`strict` は明示されていません。
- React は `StrictMode` で起動します。副作用は再実行されても安全にしてください。
- UIは Tailwind CSS のユーティリティクラスとダークモードクラスを使用します。

## 依存関係について

ソースコードから直接利用されている主な依存は React、React DOM、Vite、Tailwind CSS、Lucide React です。`@google/genai`、Express、dotenv、Motion、および一部の型パッケージは現行ソースから参照されていません。削除するか将来機能の予定を明記するかは、プロジェクト方針の確認が必要です。
