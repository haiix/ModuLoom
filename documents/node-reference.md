# ノードリファレンス

## 共通仕様

入力ポートに接続がない場合は、ポート定義の既定値が使われます。`state` を持つノードでは、ノード内フォームで設定した値や演算モードが評価に渡されます。

`kind` は次の意味を持ちます。

- `input`: キャンバスまたは生成コードの入力元
- `pure`: 入力から出力を計算する処理
- `output`: 表示またはストリーム収集を担う終端

## Input

| typeId          | 表示名         | 出力             | 概要                                                             |
| --------------- | -------------- | ---------------- | ---------------------------------------------------------------- |
| `input/number`  | Number Input   | `value: number`  | 数値フォームの値を出力                                           |
| `input/slider`  | Slider Input   | `value: number`  | 最小値・最大値・刻み幅を持つスライダー                           |
| `input/text`    | Text Input     | `value: string`  | 文字列を出力                                                     |
| `input/boolean` | Boolean Toggle | `value: boolean` | `true`／`false` を切り替え                                       |
| `input/array`   | Array Input    | `value: array`   | 数値または文字列のリストを入力                                   |
| `input/json`    | JSON Object    | `value: object`  | JSON文字列を解析してオブジェクトを出力。解析失敗時はノードエラー |

## Math

| typeId          | 入力             | 出力             | 処理                        |
| --------------- | ---------------- | ---------------- | --------------------------- |
| `math/add`      | `a`, `b`: number | `result: number` | `a + b`                     |
| `math/subtract` | `a`, `b`: number | `result: number` | `a - b`                     |
| `math/multiply` | `a`, `b`: number | `result: number` | `a * b`                     |
| `math/divide`   | `a`, `b`: number | `result: number` | `a / b`。`b === 0` はエラー |
| `math/modulo`   | `a`, `b`: number | `result: number` | `a % b`                     |
| `math/round`    | `value: number`  | `result: number` | `Math.round` で整数化       |
| `math/abs`      | `value: number`  | `result: number` | 絶対値                      |
| `math/sqrt`     | `value: number`  | `result: number` | 平方根。負数は `NaN`        |

## String

| typeId             | 入力                         | 出力             | 処理                        |
| ------------------ | ---------------------------- | ---------------- | --------------------------- |
| `string/concat`    | `a`, `b`: string             | `result: string` | 2文字列を連結               |
| `string/template`  | `template`, `a`, `b`: string | `result: string` | `{a}` と `{b}` をすべて置換 |
| `string/uppercase` | `text: string`               | `result: string` | 大文字へ変換                |
| `string/split`     | `text`, `separator`: string  | `result: array`  | 区切り文字で配列化          |
| `string/length`    | `text: string`               | `result: number` | JavaScript の文字列長を返す |

## Logic

| typeId          | 入力                                           | 出力              | 処理                 |
| --------------- | ---------------------------------------------- | ----------------- | -------------------- |
| `logic/and`     | `a`, `b`: boolean                              | `result: boolean` | 論理積               |
| `logic/or`      | `a`, `b`: boolean                              | `result: boolean` | 論理和               |
| `logic/not`     | `value: boolean`                               | `result: boolean` | 論理否定             |
| `logic/greater` | `a`, `b`: number                               | `result: boolean` | `a > b`              |
| `logic/equal`   | `a`, `b`: any                                  | `result: boolean` | 厳密等価 `a === b`   |
| `logic/branch`  | `condition: boolean`, `ifTrue`, `ifFalse`: any | `result: any`     | 条件に応じて値を選択 |

## Array

| typeId          | 入力                                 | 出力             | 処理／状態                                                           |
| --------------- | ------------------------------------ | ---------------- | -------------------------------------------------------------------- |
| `array/create`  | `item1`, `item2`: any                | `result: array`  | `undefined` でない要素から配列を作る                                 |
| `array/length`  | `arr: array`                         | `result: number` | 要素数                                                               |
| `array/join`    | `arr: array`, `separator: string`    | `result: string` | 配列を文字列へ結合                                                   |
| `array/map`     | `arr: array`, `factor: number`       | `result: array`  | 数値要素に `*`、`+`、`-`、`/` のいずれかを適用。非数値要素は維持     |
| `array/filter`  | `arr: array`, `threshold: number`    | `result: array`  | 数値要素を `>`、`>=`、`<`、`<=`、`==`、`!=` で抽出。非数値要素は除外 |
| `array/slice`   | `arr: array`, `start`, `end`: number | `result: array`  | `Array.prototype.slice` 相当                                         |
| `array/reverse` | `arr: array`                         | `result: array`  | コピーを反転し、入力配列を変更しない                                 |
| `array/sum`     | `arr: array`                         | `result: number` | 数値要素だけを合計                                                   |

`array/map` の除算では係数が0の場合、その要素を変更しません。

## Object

| typeId             | 入力                         | 出力             | 処理                                   |
| ------------------ | ---------------------------- | ---------------- | -------------------------------------- |
| `object/create`    | `key: string`, `value: any`  | `result: object` | 1つのキーと値からオブジェクトを生成    |
| `object/get`       | `obj: object`, `key: string` | `result: any`    | 指定プロパティを取得                   |
| `object/stringify` | `data: any`                  | `result: string` | `JSON.stringify(data, null, 2)` で整形 |

## Output

| typeId             | 入力              | 概要                                         |
| ------------------ | ----------------- | -------------------------------------------- |
| `output/inspector` | `value: any`      | 値と型を詳細表示し、コピーできる             |
| `output/gauge`     | `value: number`   | 最小値・最大値の範囲でゲージ表示             |
| `output/status`    | `status: boolean` | 真偽値を設定可能なラベルの色付きバッジで表示 |
| `output/log`       | `message: any`    | 結果をログ風に表示                           |

Output ノードの `evaluate` は表示用値を返しますが、通常はグラフの終端として使います。

## Async

| typeId          | 入力                                  | 出力                                                 | 処理                                      |
| --------------- | ------------------------------------- | ---------------------------------------------------- | ----------------------------------------- |
| `async/delay`   | `value: any`, `delayMs: number`       | `result: any`, `promise: promise`                    | 指定時間待って値と解決済み Promise を返す |
| `async/resolve` | `value: any`                          | `promise: promise`                                   | `Promise.resolve` でラップ                |
| `async/await`   | `promise: promise`                    | `result: any`                                        | Promise の解決値を取り出す                |
| `async/all`     | `p1`, `p2`: promise                   | `results: array`                                     | 2つを `Promise.all` で待つ                |
| `async/fetch`   | `endpoint: string`, `latency: number` | `data: object`, `status: number`, `promise: promise` | API応答をローカルで疑似生成               |

`async/fetch` は実際のHTTP通信を行いません。最低30ミリ秒待った後、指定 endpoint、時刻、ランダムなメトリクス、ステータス200を返します。

## Stream

| typeId              | 入力                                  | 出力                            | 処理                                              |
| ------------------- | ------------------------------------- | ------------------------------- | ------------------------------------------------- |
| `stream/interval`   | `intervalMs: number`, `limit: number` | `stream`                        | 0から順に指定件数を送出。間隔は最低20ミリ秒       |
| `stream/from_array` | `items: array`, `delayMs: number`     | `stream`                        | 配列要素を順番に送出                              |
| `stream/map`        | `stream`, `multiplier: number`        | `stream`                        | 数値要素を倍率変換                                |
| `stream/filter`     | `stream`, `threshold: number`         | `stream`                        | `even`、`odd`、`positive`、`greater` モードで抽出 |
| `stream/take`       | `stream`, `count: number`             | `stream`                        | 先頭N件に制限                                     |
| `stream/collect`    | `stream`                              | `array: array`, `count: number` | 最後まで消費し、最大50件を配列化                  |

Map、Filter、Take に有効な入力ストリームがない場合、現行実装はエラーではなく既定の Interval Stream を生成します。

## Composite

| typeId                  | 役割                                                       |
| ----------------------- | ---------------------------------------------------------- |
| `composite/input-port`  | 複合ノードの外部入力を定義。キャンバス上ではテスト値を出力 |
| `composite/output-port` | 複合ノードの戻り値を定義                                   |

ユーザーが作った複合ノードは `composite/custom_...` 形式の一意な `typeId` を持ちます。

## カスタム型から生成されるノード

型IDを `<TypeId>` とすると、次の定義が生成されます。

| typeId                      | 役割                                              |
| --------------------------- | ------------------------------------------------- |
| `type/<TypeId>/constructor` | 全フィールドを入力として型付きオブジェクトを生成  |
| `type/<TypeId>/deconstruct` | 型付きオブジェクトを各フィールドへ分解            |
| `type/<TypeId>/validate`    | 必須フィールドが `null`／`undefined` でないか検証 |

Validate はフィールド値の JavaScript 型までは照合しません。成功時は入力オブジェクトのコピー、失敗時は `null` を `instance` から返します。

初期カスタム型:

- `User`: `id`、`name`、`email`、任意の `isActive`
- `Point2D`: `x`、`y`

## プリセット

| ID                              | 内容                                                     |
| ------------------------------- | -------------------------------------------------------- |
| `math-calc`                     | スライダー入力を乗算・加算し、インスペクタとゲージへ出力 |
| `string-template`               | 文字列テンプレート、大文字変換、長さ取得                 |
| `logic-validator`               | 年齢比較、条件分岐、ステータス表示                       |
| `array-pipeline`                | 数値配列の抽出、倍率変換、合計、CSV化                    |
| `custom-type-pipeline`          | `User` の生成、検証、分解                                |
| `async-promise-pipeline`        | 疑似API、Promise待機、オブジェクト抽出                   |
| `stream-iterator-pipeline`      | Interval、偶数抽出、倍率変換、収集                       |
| `composite-vector-length`       | 2Dベクトル長を複合ノード化する素材                       |
| `composite-partial-application` | 固定値10を閉じ込める部分適用の素材                       |

`composite-vector-length` はテスト値3と4を入力し、`math/sqrt` を使って長さ5を計算します。
