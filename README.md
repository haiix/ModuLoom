# ModuLoom

ModuLoom は、純粋関数をノードとして組み合わせ、型付きのデータ処理をブラウザ上で設計・実行できるビジュアルプログラミングエディターです。

数値・文字列・論理・配列・オブジェクト処理に加え、Promise、AsyncIterator ストリーム、カスタム型、JavaScript 式による自作ノード、複合ノードを扱えます。グラフは DAG（有向非巡回グラフ）として検証され、変更したノードとその下流だけが差分再評価されます。

## 主な機能

- 型付きポートによる接続可否の検証
- 接続時の循環参照検出と、トポロジカル順での評価
- 変更箇所と下流ノードだけを実行する差分再評価とキャッシュ再利用
- Promise と AsyncIterator を使った非同期・ストリーム処理
- 独自インターフェースと Constructor／Deconstruct／Validate ノードの自動生成
- JavaScript 式を使ったカスタム純粋関数ノード
- サブグラフの複合ノード化、固定入力値を閉じ込める部分適用
- サンプルプリセット、実行順序表示、ステップ表示
- プロジェクトの JSON 保存・復元
- グラフから TypeScript コードを生成

## 必要環境

- Node.js 20 または 22 を推奨
- npm
- モダンブラウザ（Chrome、Edge、Firefox、Safari の現行版を想定）

`package.json` に Node.js の `engines` 指定はありません。Vite 6 と TypeScript 5.8 を利用するため、古い Node.js は避けてください。

## セットアップ

```bash
npm install
npm run dev
```

開発サーバーは `http://localhost:3000` で起動します。外部ホストからも接続できるよう、Vite は `0.0.0.0` をリッスンします。

本アプリの現行機能はクライアント内で完結しており、起動に環境変数は不要です。`.env.example` の `GEMINI_API_KEY` と `APP_URL` は現在のソースコードから参照されていません。

## 基本的な使い方

1. 「ノードを追加」を開き、入力ノード、処理ノード、出力ノードをキャンバスに配置します。
2. 出力ポートから互換性のある入力ポートへドラッグして接続します。
3. 入力値を変更し、出力ノードで結果を確認します。初期状態ではリアクティブ評価が有効です。
4. 「DAG実行順序」で評価順やステップ表示を確認します。
5. 「保存」でプロジェクト JSON をダウンロードします。`Ctrl+S`／`Cmd+S` も利用できます。

まず試す場合は「サンプルプリセット」から「四則演算パイプライン」または「配列データ変換パイプライン」を選ぶと、代表的な操作を確認できます。

## npm スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | Vite 開発サーバーをポート 3000 で起動 |
| `npm run build` | 本番用ファイルを `dist/` に生成 |
| `npm run preview` | ビルド済みファイルをローカルで確認 |
| `npm run lint` | `tsc --noEmit` で型チェック |
| `npm run clean` | `dist` と `server.js` を削除 |

`clean` は Unix 系の `rm` を使用しているため、標準の Windows PowerShell ではそのまま動作しない場合があります。

## ドキュメント

- [利用ガイド](documents/user-guide.md) — 画面操作、カスタム型・自作ノード・複合ノードの作り方
- [アーキテクチャ](documents/architecture.md) — データモデル、型検査、DAG評価、非同期評価の設計
- [ノードリファレンス](documents/node-reference.md) — 組み込みノードとプリセットの一覧
- [プロジェクトファイル仕様](documents/project-format.md) — JSON 保存形式と互換性上の注意
- [開発ガイド](documents/development.md) — ディレクトリ構成、変更時の要点、検証方法
- [既知の制約と確認事項](documents/known-limitations.md) — 現行実装で注意すべき点と未確定事項

## 技術スタック

- React 19
- TypeScript 5.8
- Vite 6
- Tailwind CSS 4
- Lucide React

評価処理、保存、コード生成はブラウザ内で行われます。現時点でバックエンドやデータベースはありません。

## セキュリティ上の注意

自作ノードは入力された JavaScript 式を `new Function` でブラウザ内実行します。信頼できない式や、第三者が作成した未確認のプロジェクト JSON を読み込まないでください。自作ノードは隔離されたサンドボックスではありません。

## ライセンス

このプロジェクトは [MIT License](LICENSE) の下で公開されています。
