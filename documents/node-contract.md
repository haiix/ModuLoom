# 組み込みノード実行契約

## 共通契約

- 入力ポートは `required`、`defaultValue`、`exampleValue`、`constraints` を持てます。
- 必須入力が未接続、または接続元に出力値がない場合は `INPUT_REQUIRED` です。接続元の
  エラーは既定値で補わず下流へ伝播します。
- 任意入力が未接続の場合は `defaultValue` を使います。オブジェクトと配列は複製します。
- `initialState` は新規配置時に複製する状態です。`false`、`0`、空文字列も有効です。
- `exampleValue` は表示・文書・テスト用であり、評価には使いません。出力ポートには既定値を
  設定しません。
- 評価器と実行デバッガーは同じ入力解決・検証を使用します。生成TypeScriptも未接続の必須入力を
  `INPUT_REQUIRED` にします。

| コード             | 発生条件                                           |
| ------------------ | -------------------------------------------------- |
| `INPUT_REQUIRED`   | 必須入力が未接続、または接続元に出力値がない       |
| `INPUT_TYPE`       | 解決値が宣言型と一致しない。numberは有限数に限る   |
| `INPUT_CONSTRAINT` | `integer`、`min`、`max`、`nonEmpty` 制約に違反した |
| `DOMAIN_ERROR`     | ノード固有の定義域外。ゼロ除算や負数の平方根など   |

`object` は `null` と配列以外のオブジェクト、`promise` は `then` を持つ値、`stream` は
`Symbol.asyncIterator` を持つ値です。`any` は `undefined` を除く任意の値を受理します。

カスタム定義を含むプロジェクトは `1.1.0` で保存します。`1.0.0` は読み込み時に移行します。
旧定義で `defaultValue` がある入力は任意、ない入力は必須として扱います。

## 表示と実行特性

- `typeId`、ポートID、接続形式は互換性のため変更しません。
- 表示名は英語、説明とエラーは日本語です。`logic/equal` は `Strict Equal (===)` と表示します。
- `stream/interval` と `stream/from_array` は時間依存、`async/fetch` は非決定的なローカル
  シミュレーションです。該当ノードにはUIバッジを表示します。

## 組み込みノード一覧

「必須」は接続が必要な入力、「任意」は未接続時の既定値です。

### Input

| `typeId`        | 表示名        | 初期state                                  | 契約                                                  |
| --------------- | ------------- | ------------------------------------------ | ----------------------------------------------------- |
| `input/number`  | Number Input  | `{ value: 0 }`                             | 有限数を出力。数値以外は `INPUT_TYPE`                 |
| `input/slider`  | Slider Input  | `{ value: 50, min: 0, max: 100, step: 1 }` | 範囲と刻み幅を検証。不正stateは `INPUT_CONSTRAINT`    |
| `input/text`    | Text Input    | `{ value: '' }`                            | 文字列以外は `INPUT_TYPE`                             |
| `input/boolean` | Boolean Input | `{ value: false }`                         | boolean以外は `INPUT_TYPE`                            |
| `input/array`   | Array Input   | `{ rawText: '', type: 'number' }`          | 数値CSVの不正要素は `INPUT_TYPE`                      |
| `input/json`    | JSON Object   | `{ rawJson: '{}' }`                        | 構文エラー、配列、`null`、プリミティブは `INPUT_TYPE` |

### Math / String / Logic

| `typeId`           | 表示名             | 必須                             | 任意            | 固有契約                        |
| ------------------ | ------------------ | -------------------------------- | --------------- | ------------------------------- |
| `math/add`         | Add                | `a`, `b`                         | —               | 加算                            |
| `math/subtract`    | Subtract           | `a`, `b`                         | —               | 減算                            |
| `math/multiply`    | Multiply           | `a`, `b`                         | —               | 乗算                            |
| `math/divide`      | Divide             | `a`, `b`                         | —               | `b === 0` はエラー              |
| `math/modulo`      | Modulo             | `a`, `b`                         | —               | `b === 0` は `DOMAIN_ERROR`     |
| `math/round`       | Round              | `value`                          | —               | `Math.round`                    |
| `math/abs`         | Absolute           | `value`                          | —               | 絶対値                          |
| `math/sqrt`        | Square Root        | `value`                          | —               | 負数は `DOMAIN_ERROR`           |
| `string/concat`    | Concat             | `a`, `b`                         | —               | 文字列連結                      |
| `string/template`  | Template Format    | `template`, `a`, `b`             | —               | `{a}` と `{b}` を置換           |
| `string/uppercase` | To UpperCase       | `text`                           | —               | 大文字化                        |
| `string/split`     | Split to Array     | `text`                           | `separator=","` | 前後空白を除去                  |
| `string/length`    | String Length      | `text`                           | —               | UTF-16コード単位の長さ          |
| `logic/and`        | Logical AND        | `a`, `b`                         | —               | 論理積                          |
| `logic/or`         | Logical OR         | `a`, `b`                         | —               | 論理和                          |
| `logic/not`        | Logical NOT        | `value`                          | —               | 論理否定                        |
| `logic/greater`    | Greater Than       | `a`, `b`                         | —               | `a > b`                         |
| `logic/equal`      | Strict Equal (===) | `a`, `b`                         | —               | JavaScriptの厳密等価            |
| `logic/branch`     | If-Else Branch     | `condition`, `ifTrue`, `ifFalse` | —               | `condition` がtrueなら `ifTrue` |

### Array / Object / Output

| `typeId`           | 表示名              | 必須             | 任意             | 固有契約                                            |
| ------------------ | ------------------- | ---------------- | ---------------- | --------------------------------------------------- |
| `array/create`     | Combine Items       | `item1`, `item2` | —                | 2要素の配列を返す                                   |
| `array/length`     | Array Length        | `arr`            | —                | 要素数                                              |
| `array/join`       | Array Join          | `arr`            | `separator=", "` | `Array.join`                                        |
| `array/map`        | Map Numbers         | `arr`            | `factor=2`       | 非数値要素は維持。除算の係数0は `DOMAIN_ERROR`      |
| `array/filter`     | Filter Numbers      | `arr`            | `threshold=0`    | 非数値要素を除外。厳密比較記号も受理                |
| `array/slice`      | Array Slice         | `arr`, `end`     | `start=0`        | `Array.slice`                                       |
| `array/reverse`    | Array Reverse       | `arr`            | —                | 入力を変更せず反転                                  |
| `array/sum`        | Sum Numbers         | `arr`            | —                | 非有限数または非数値要素は `INPUT_TYPE`             |
| `object/create`    | Object Entry        | `key`, `value`   | —                | 空文字列・危険なキーは `INPUT_CONSTRAINT`           |
| `object/get`       | Get Property        | `obj`, `key`     | —                | 自身のプロパティだけを取得。欠落は `DOMAIN_ERROR`   |
| `object/stringify` | JSON Stringify      | `data`           | —                | 直列化不能な値は `DOMAIN_ERROR`                     |
| `output/inspector` | Value Inspector     | `value`          | —                | 現在値と型を表示                                    |
| `output/gauge`     | Progress / Gauge    | `value`          | —                | 数値をゲージ表示                                    |
| `output/status`    | Boolean Status Pill | `status`         | —                | booleanをバッジ表示                                 |
| `output/log`       | Log Viewer          | `message`        | —                | 現在値をログ形式で表示。履歴やconsole出力は持たない |

### Async / Stream / Composite

| `typeId`                | 表示名                 | 必須       | 任意                        | 固有契約                                            |
| ----------------------- | ---------------------- | ---------- | --------------------------- | --------------------------------------------------- |
| `async/delay`           | Delay                  | `value`    | `delayMs=600`               | 指定時間待機して値を返す                            |
| `async/resolve`         | Resolve Promise        | `value`    | —                           | `Promise.resolve`                                   |
| `async/await`           | Await Promise          | `promise`  | —                           | Promise以外は `INPUT_TYPE`                          |
| `async/all`             | Wait for All           | `p1`, `p2` | —                           | 非Promiseは `INPUT_TYPE`                            |
| `async/fetch`           | Simulated API Response | `endpoint` | `latency=500`               | ネットワーク通信をせず応答を生成                    |
| `stream/interval`       | Interval Stream        | —          | `intervalMs=400`, `limit=8` | 0から連番を送出。間隔は20ms以上、limitは1以上へ補正 |
| `stream/from_array`     | Array Stream           | `items`    | `delayMs=300`               | 配列要素を順に送出                                  |
| `stream/map`            | Map Stream             | `stream`   | `multiplier=2`              | Stream以外は `INPUT_TYPE`。非数値要素は維持         |
| `stream/filter`         | Filter Stream          | `stream`   | `threshold=0`               | Stream以外は `INPUT_TYPE`。非数値要素は除外         |
| `stream/take`           | Take Stream            | `stream`   | `count=4`                   | Stream以外は `INPUT_TYPE`。countは1以上へ補正       |
| `stream/collect`        | Collect Stream         | `stream`   | —                           | Stream以外は `INPUT_TYPE`。最大50件を収集           |
| `composite/input-port`  | Group Input            | `in`       | —                           | 通常グラフでは `testValue` を試験値として使える     |
| `composite/output-port` | Group Output           | `in`       | —                           | 内部値を複合ノードの出力へ渡す                      |

## カスタム型由来ノード

`type/<TypeId>/constructor`、`deconstruct`、`validate` を生成します。Validateは必須フィールドが
`null` または `undefined` でないことを検査し、失敗時は `isValid: false` と `instance: null` を返します。
