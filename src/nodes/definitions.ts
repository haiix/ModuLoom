import { NodeDefinition, GraphPreset } from '../types';
import { ASYNC_STREAM_NODES } from './asyncStreamNodes';

export const BUILTIN_NODES: NodeDefinition[] = [
  ...ASYNC_STREAM_NODES,
  // ==========================================
  // INPUT / SOURCE NODES
  // ==========================================
  {
    typeId: 'input/number',
    label: 'Number Input',
    category: 'Input',
    kind: 'input',
    description: '数値を入力するソースノード',
    inputs: [],
    outputs: [
      { id: 'value', name: 'value', type: 'number', defaultValue: 0 },
    ],
    defaultState: { value: 10 },
    evaluate: (_inputs, state) => {
      const val = Number(state?.value ?? 0);
      return { value: isNaN(val) ? 0 : val };
    },
  },
  {
    typeId: 'input/slider',
    label: 'Slider Input',
    category: 'Input',
    kind: 'input',
    description: 'スライダー操作で数値を調整するノード',
    inputs: [],
    outputs: [
      { id: 'value', name: 'value', type: 'number', defaultValue: 50 },
    ],
    defaultState: { value: 50, min: 0, max: 100, step: 1 },
    evaluate: (_inputs, state) => {
      const val = Number(state?.value ?? 50);
      return { value: isNaN(val) ? 50 : val };
    },
  },
  {
    typeId: 'input/text',
    label: 'Text Input',
    category: 'Input',
    kind: 'input',
    description: '文字列を入力するソースノード',
    inputs: [],
    outputs: [
      { id: 'value', name: 'value', type: 'string', defaultValue: 'Hello World' },
    ],
    defaultState: { value: 'Hello NodeFlow' },
    evaluate: (_inputs, state) => {
      return { value: String(state?.value ?? '') };
    },
  },
  {
    typeId: 'input/boolean',
    label: 'Boolean Toggle',
    category: 'Input',
    kind: 'input',
    description: '真偽値（true / false）を切り替えるノード',
    inputs: [],
    outputs: [
      { id: 'value', name: 'value', type: 'boolean', defaultValue: true },
    ],
    defaultState: { value: true },
    evaluate: (_inputs, state) => {
      return { value: Boolean(state?.value) };
    },
  },
  {
    typeId: 'input/array',
    label: 'Array Input',
    category: 'Input',
    kind: 'input',
    description: '数値または文字の配列リテラルを入力するノード',
    inputs: [],
    outputs: [
      { id: 'value', name: 'value', type: 'array', defaultValue: [1, 2, 3, 4, 5] },
    ],
    defaultState: { rawText: '10, 20, 30, 40, 50', type: 'number' },
    evaluate: (_inputs, state) => {
      const raw = String(state?.rawText ?? '');
      if (state?.type === 'string') {
        const arr = raw.split(',').map(s => s.trim()).filter(Boolean);
        return { value: arr };
      }
      const arr = raw.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
      return { value: arr };
    },
  },
  {
    typeId: 'input/json',
    label: 'JSON Object',
    category: 'Input',
    kind: 'input',
    description: 'JSON形式のオブジェクトを入力するノード',
    inputs: [],
    outputs: [
      { id: 'value', name: 'value', type: 'object', defaultValue: { id: 1, name: 'Sample' } },
    ],
    defaultState: { rawJson: '{\n  "name": "NodeFlow",\n  "version": 1.0,\n  "pure": true\n}' },
    evaluate: (_inputs, state) => {
      try {
        const parsed = JSON.parse(state?.rawJson || '{}');
        return { value: parsed };
      } catch {
        return { value: {} };
      }
    },
  },

  // ==========================================
  // PURE FUNCTION NODES: MATH
  // ==========================================
  {
    typeId: 'math/add',
    label: 'Add (加算)',
    category: 'Math',
    kind: 'pure',
    description: '2つの数値を加算 (a + b)',
    inputs: [
      { id: 'a', name: 'a', type: 'number', defaultValue: 0 },
      { id: 'b', name: 'b', type: 'number', defaultValue: 0 },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'number' },
    ],
    evaluate: (inputs) => {
      const a = Number(inputs.a ?? 0);
      const b = Number(inputs.b ?? 0);
      return { result: a + b };
    },
  },
  {
    typeId: 'math/subtract',
    label: 'Subtract (減算)',
    category: 'Math',
    kind: 'pure',
    description: '2つの数値を減算 (a - b)',
    inputs: [
      { id: 'a', name: 'a', type: 'number', defaultValue: 0 },
      { id: 'b', name: 'b', type: 'number', defaultValue: 0 },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'number' },
    ],
    evaluate: (inputs) => {
      const a = Number(inputs.a ?? 0);
      const b = Number(inputs.b ?? 0);
      return { result: a - b };
    },
  },
  {
    typeId: 'math/multiply',
    label: 'Multiply (乗算)',
    category: 'Math',
    kind: 'pure',
    description: '2つの数値を乗算 (a * b)',
    inputs: [
      { id: 'a', name: 'a', type: 'number', defaultValue: 1 },
      { id: 'b', name: 'b', type: 'number', defaultValue: 1 },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'number' },
    ],
    evaluate: (inputs) => {
      const a = Number(inputs.a ?? 0);
      const b = Number(inputs.b ?? 0);
      return { result: a * b };
    },
  },
  {
    typeId: 'math/divide',
    label: 'Divide (除算)',
    category: 'Math',
    kind: 'pure',
    description: '2つの数値を除算 (a / b)',
    inputs: [
      { id: 'a', name: 'a', type: 'number', defaultValue: 0 },
      { id: 'b', name: 'b', type: 'number', defaultValue: 1 },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'number' },
    ],
    evaluate: (inputs) => {
      const a = Number(inputs.a ?? 0);
      const b = Number(inputs.b ?? 1);
      if (b === 0) {
        throw new Error('ゼロ除算エラー (Division by zero)');
      }
      return { result: a / b };
    },
  },
  {
    typeId: 'math/modulo',
    label: 'Modulo (剰余)',
    category: 'Math',
    kind: 'pure',
    description: '割った余りを計算 (a % b)',
    inputs: [
      { id: 'a', name: 'a', type: 'number', defaultValue: 10 },
      { id: 'b', name: 'b', type: 'number', defaultValue: 3 },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'number' },
    ],
    evaluate: (inputs) => {
      const a = Number(inputs.a ?? 0);
      const b = Number(inputs.b ?? 1);
      return { result: a % b };
    },
  },
  {
    typeId: 'math/round',
    label: 'Round (四捨五入)',
    category: 'Math',
    kind: 'pure',
    description: '数値を四捨五入して整数にする',
    inputs: [
      { id: 'value', name: 'value', type: 'number', defaultValue: 0 },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'number' },
    ],
    evaluate: (inputs) => {
      return { result: Math.round(Number(inputs.value ?? 0)) };
    },
  },
  {
    typeId: 'math/abs',
    label: 'Absolute (絶対値)',
    category: 'Math',
    kind: 'pure',
    description: '数値の絶対値を計算',
    inputs: [
      { id: 'value', name: 'value', type: 'number', defaultValue: 0 },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'number' },
    ],
    evaluate: (inputs) => {
      return { result: Math.abs(Number(inputs.value ?? 0)) };
    },
  },

  // ==========================================
  // PURE FUNCTION NODES: STRING
  // ==========================================
  {
    typeId: 'string/concat',
    label: 'Concat (文字列結合)',
    category: 'String',
    kind: 'pure',
    description: '2つの文字列を結合',
    inputs: [
      { id: 'a', name: 'a', type: 'string', defaultValue: 'Hello' },
      { id: 'b', name: 'b', type: 'string', defaultValue: 'World' },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'string' },
    ],
    evaluate: (inputs) => {
      const a = String(inputs.a ?? '');
      const b = String(inputs.b ?? '');
      return { result: a + b };
    },
  },
  {
    typeId: 'string/template',
    label: 'Template Format',
    category: 'String',
    kind: 'pure',
    description: '{a} と {b} を置換するテンプレート',
    inputs: [
      { id: 'template', name: 'template', type: 'string', defaultValue: '{a} さん、{b} へようこそ！' },
      { id: 'a', name: 'a', type: 'string', defaultValue: '山田' },
      { id: 'b', name: 'b', type: 'string', defaultValue: 'NodeFlow' },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'string' },
    ],
    evaluate: (inputs) => {
      let tpl = String(inputs.template ?? '');
      tpl = tpl.replace(/\{a\}/g, String(inputs.a ?? ''));
      tpl = tpl.replace(/\{b\}/g, String(inputs.b ?? ''));
      return { result: tpl };
    },
  },
  {
    typeId: 'string/uppercase',
    label: 'To UpperCase',
    category: 'String',
    kind: 'pure',
    description: '文字列を大文字に変換',
    inputs: [
      { id: 'text', name: 'text', type: 'string', defaultValue: '' },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'string' },
    ],
    evaluate: (inputs) => {
      return { result: String(inputs.text ?? '').toUpperCase() };
    },
  },
  {
    typeId: 'string/split',
    label: 'Split to Array',
    category: 'String',
    kind: 'pure',
    description: '文字列を区切り文字で配列に分割',
    inputs: [
      { id: 'text', name: 'text', type: 'string', defaultValue: 'apple,banana,orange' },
      { id: 'separator', name: 'separator', type: 'string', defaultValue: ',' },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'array' },
    ],
    evaluate: (inputs) => {
      const text = String(inputs.text ?? '');
      const sep = String(inputs.separator ?? ',');
      return { result: text.split(sep).map(s => s.trim()) };
    },
  },
  {
    typeId: 'string/length',
    label: 'String Length',
    category: 'String',
    kind: 'pure',
    description: '文字列の長さを数値で取得',
    inputs: [
      { id: 'text', name: 'text', type: 'string', defaultValue: '' },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'number' },
    ],
    evaluate: (inputs) => {
      return { result: String(inputs.text ?? '').length };
    },
  },

  // ==========================================
  // PURE FUNCTION NODES: LOGIC
  // ==========================================
  {
    typeId: 'logic/and',
    label: 'Logical AND (論理積)',
    category: 'Logic',
    kind: 'pure',
    description: '両方が true の場合に true',
    inputs: [
      { id: 'a', name: 'a', type: 'boolean', defaultValue: true },
      { id: 'b', name: 'b', type: 'boolean', defaultValue: true },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'boolean' },
    ],
    evaluate: (inputs) => {
      return { result: Boolean(inputs.a && inputs.b) };
    },
  },
  {
    typeId: 'logic/or',
    label: 'Logical OR (論理和)',
    category: 'Logic',
    kind: 'pure',
    description: 'いずれかが true の場合に true',
    inputs: [
      { id: 'a', name: 'a', type: 'boolean', defaultValue: false },
      { id: 'b', name: 'b', type: 'boolean', defaultValue: true },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'boolean' },
    ],
    evaluate: (inputs) => {
      return { result: Boolean(inputs.a || inputs.b) };
    },
  },
  {
    typeId: 'logic/not',
    label: 'Logical NOT (論理否定)',
    category: 'Logic',
    kind: 'pure',
    description: '真偽値を反転',
    inputs: [
      { id: 'value', name: 'value', type: 'boolean', defaultValue: false },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'boolean' },
    ],
    evaluate: (inputs) => {
      return { result: !Boolean(inputs.value) };
    },
  },
  {
    typeId: 'logic/greater',
    label: 'Greater Than (a > b)',
    category: 'Logic',
    kind: 'pure',
    description: 'a が b より大きいか判定',
    inputs: [
      { id: 'a', name: 'a', type: 'number', defaultValue: 10 },
      { id: 'b', name: 'b', type: 'number', defaultValue: 5 },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'boolean' },
    ],
    evaluate: (inputs) => {
      return { result: Number(inputs.a ?? 0) > Number(inputs.b ?? 0) };
    },
  },
  {
    typeId: 'logic/equal',
    label: 'Equal (a == b)',
    category: 'Logic',
    kind: 'pure',
    description: '値が等しいか判定',
    inputs: [
      { id: 'a', name: 'a', type: 'any', defaultValue: 10 },
      { id: 'b', name: 'b', type: 'any', defaultValue: 10 },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'boolean' },
    ],
    evaluate: (inputs) => {
      return { result: inputs.a === inputs.b };
    },
  },
  {
    typeId: 'logic/branch',
    label: 'If-Else Branch (三項分岐)',
    category: 'Logic',
    kind: 'pure',
    description: 'condition が true なら ifTrue、false なら ifFalse を出力',
    inputs: [
      { id: 'condition', name: 'condition', type: 'boolean', defaultValue: true },
      { id: 'ifTrue', name: 'ifTrue', type: 'any', defaultValue: 'OK' },
      { id: 'ifFalse', name: 'ifFalse', type: 'any', defaultValue: 'NG' },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'any' },
    ],
    evaluate: (inputs) => {
      return { result: inputs.condition ? inputs.ifTrue : inputs.ifFalse };
    },
  },

  // ==========================================
  // PURE FUNCTION NODES: ARRAY
  // ==========================================
  {
    typeId: 'array/create',
    label: 'Array Combine',
    category: 'Array',
    kind: 'pure',
    description: '2つの要素を結合して新しい配列を作成',
    inputs: [
      { id: 'item1', name: 'item1', type: 'any' },
      { id: 'item2', name: 'item2', type: 'any' },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'array' },
    ],
    evaluate: (inputs) => {
      return { result: [inputs.item1, inputs.item2].filter(x => x !== undefined) };
    },
  },
  {
    typeId: 'array/length',
    label: 'Array Length',
    category: 'Array',
    kind: 'pure',
    description: '配列の要素数を取得',
    inputs: [
      { id: 'arr', name: 'arr', type: 'array', defaultValue: [] },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'number' },
    ],
    evaluate: (inputs) => {
      return { result: Array.isArray(inputs.arr) ? inputs.arr.length : 0 };
    },
  },
  {
    typeId: 'array/join',
    label: 'Array Join',
    category: 'Array',
    kind: 'pure',
    description: '配列を指定の文字で連結して文字列化',
    inputs: [
      { id: 'arr', name: 'arr', type: 'array', defaultValue: [] },
      { id: 'separator', name: 'separator', type: 'string', defaultValue: ', ' },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'string' },
    ],
    evaluate: (inputs) => {
      const arr = Array.isArray(inputs.arr) ? inputs.arr : [];
      return { result: arr.join(String(inputs.separator ?? ', ')) };
    },
  },
  {
    typeId: 'array/map',
    label: 'Array Map (演算変換)',
    category: 'Array',
    kind: 'pure',
    description: '配列の各数値要素に対して演算（*, +, -, /）と係数を適用して新しい配列を生成',
    inputs: [
      { id: 'arr', name: 'arr', type: 'array', defaultValue: [] },
      { id: 'factor', name: 'factor (係数)', type: 'number', defaultValue: 2 },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'array' },
    ],
    defaultState: { operator: '*' },
    evaluate: (inputs, state) => {
      const arr = Array.isArray(inputs.arr) ? inputs.arr : [];
      const factor = Number(inputs.factor ?? 2);
      const op = state?.operator || '*';
      return {
        result: arr.map(x => {
          if (typeof x !== 'number') return x;
          switch (op) {
            case '+': return x + factor;
            case '-': return x - factor;
            case '/': return factor !== 0 ? x / factor : x;
            case '*':
            default: return x * factor;
          }
        }),
      };
    },
  },
  {
    typeId: 'array/filter',
    label: 'Array Filter (条件抽出)',
    category: 'Array',
    kind: 'pure',
    description: '比較条件（>, >=, <, <=, ==, !=）と閾値に基づいて配列の数値をフィルタリング',
    inputs: [
      { id: 'arr', name: 'arr', type: 'array', defaultValue: [] },
      { id: 'threshold', name: 'threshold (閾値)', type: 'number', defaultValue: 0 },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'array' },
    ],
    defaultState: { operator: '>' },
    evaluate: (inputs, state) => {
      const arr = Array.isArray(inputs.arr) ? inputs.arr : [];
      const thresh = Number(inputs.threshold ?? 0);
      const op = state?.operator || '>';
      return {
        result: arr.filter(x => {
          if (typeof x !== 'number') return false;
          switch (op) {
            case '>=': return x >= thresh;
            case '<': return x < thresh;
            case '<=': return x <= thresh;
            case '==': return x === thresh;
            case '!=': return x !== thresh;
            case '>':
            default: return x > thresh;
          }
        }),
      };
    },
  },
  {
    typeId: 'array/slice',
    label: 'Array Slice (範囲抽出)',
    category: 'Array',
    kind: 'pure',
    description: '配列の開始・終了インデックスを指定して部分配列を抽出',
    inputs: [
      { id: 'arr', name: 'arr', type: 'array', defaultValue: [] },
      { id: 'start', name: 'start', type: 'number', defaultValue: 0 },
      { id: 'end', name: 'end', type: 'number', defaultValue: 5 },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'array' },
    ],
    evaluate: (inputs) => {
      const arr = Array.isArray(inputs.arr) ? inputs.arr : [];
      const start = Number(inputs.start ?? 0);
      const end = inputs.end !== undefined ? Number(inputs.end) : undefined;
      return { result: arr.slice(start, end) };
    },
  },
  {
    typeId: 'array/reverse',
    label: 'Array Reverse (反転)',
    category: 'Array',
    kind: 'pure',
    description: '配列の並び順を反転した新しい配列を返す',
    inputs: [
      { id: 'arr', name: 'arr', type: 'array', defaultValue: [] },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'array' },
    ],
    evaluate: (inputs) => {
      const arr = Array.isArray(inputs.arr) ? [...inputs.arr] : [];
      return { result: arr.reverse() };
    },
  },
  {
    typeId: 'array/sum',
    label: 'Array Sum (合計)',
    category: 'Array',
    kind: 'pure',
    description: '数値配列の合計値を算出',
    inputs: [
      { id: 'arr', name: 'arr', type: 'array', defaultValue: [] },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'number' },
    ],
    evaluate: (inputs) => {
      const arr = Array.isArray(inputs.arr) ? inputs.arr : [];
      const sum = arr.reduce((acc, curr) => acc + (typeof curr === 'number' ? curr : 0), 0);
      return { result: sum };
    },
  },

  // ==========================================
  // PURE FUNCTION NODES: OBJECT
  // ==========================================
  {
    typeId: 'object/create',
    label: 'Object Entry',
    category: 'Object',
    kind: 'pure',
    description: 'キーと値からオブジェクトを生成',
    inputs: [
      { id: 'key', name: 'key', type: 'string', defaultValue: 'id' },
      { id: 'value', name: 'value', type: 'any', defaultValue: 100 },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'object' },
    ],
    evaluate: (inputs) => {
      const key = String(inputs.key ?? 'key');
      return { result: { [key]: inputs.value } };
    },
  },
  {
    typeId: 'object/get',
    label: 'Get Property',
    category: 'Object',
    kind: 'pure',
    description: 'オブジェクトから指定キーの値を取り出す',
    inputs: [
      { id: 'obj', name: 'obj', type: 'object', defaultValue: {} },
      { id: 'key', name: 'key', type: 'string', defaultValue: 'name' },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'any' },
    ],
    evaluate: (inputs) => {
      const obj = inputs.obj && typeof inputs.obj === 'object' ? inputs.obj : {};
      return { result: obj[inputs.key] };
    },
  },
  {
    typeId: 'object/stringify',
    label: 'JSON Stringify',
    category: 'Object',
    kind: 'pure',
    description: 'データをJSON文字列に変換',
    inputs: [
      { id: 'data', name: 'data', type: 'any' },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'string' },
    ],
    evaluate: (inputs) => {
      try {
        return { result: JSON.stringify(inputs.data, null, 2) };
      } catch {
        return { result: '' };
      }
    },
  },

  // ==========================================
  // OUTPUT / SINK NODES
  // ==========================================
  {
    typeId: 'output/inspector',
    label: 'Value Inspector',
    category: 'Output',
    kind: 'output',
    description: '計算結果を詳細に表示する汎用インスペクタ',
    inputs: [
      { id: 'value', name: 'value', type: 'any' },
    ],
    outputs: [],
    evaluate: (inputs) => {
      return { displayedValue: inputs.value };
    },
  },
  {
    typeId: 'output/gauge',
    label: 'Progress / Gauge',
    category: 'Output',
    kind: 'output',
    description: '数値をプログレスバー / メーターとして可視化',
    inputs: [
      { id: 'value', name: 'value', type: 'number', defaultValue: 0 },
    ],
    outputs: [],
    defaultState: { min: 0, max: 100 },
    evaluate: (inputs) => {
      return { displayedValue: inputs.value };
    },
  },
  {
    typeId: 'output/status',
    label: 'Boolean Status Pill',
    category: 'Output',
    kind: 'output',
    description: '真偽値（OK/NG, 有効/無効）をカラーバッジで表示',
    inputs: [
      { id: 'status', name: 'status', type: 'boolean', defaultValue: false },
    ],
    outputs: [],
    defaultState: { trueLabel: '合格 (Passed)', falseLabel: '不合格 (Failed)' },
    evaluate: (inputs) => {
      return { displayedValue: inputs.status };
    },
  },
  {
    typeId: 'output/log',
    label: 'Console Log Viewer',
    category: 'Output',
    kind: 'output',
    description: 'テキストや結果の履歴ログを表示',
    inputs: [
      { id: 'message', name: 'message', type: 'any' },
    ],
    outputs: [],
    evaluate: (inputs) => {
      return { displayedValue: inputs.message };
    },
  },
  // ==========================================
  // COMPOSITE / SUBGRAPH TERMINAL NODES
  // ==========================================
  {
    typeId: 'composite/input-port',
    label: 'グループ入力端子 (Input Port)',
    category: 'Composite',
    kind: 'input',
    description: '複合ノード（関数グループ）の入力引数端子。ポート名や型を設定して下流ノードへ値を供給します。',
    inputs: [],
    outputs: [
      { id: 'out', name: 'out', type: 'any', defaultValue: 0 },
    ],
    defaultState: { portName: 'x', portType: 'number', testValue: 10 },
    evaluate: (_inputs, state) => {
      let val = state?.testValue;
      if (val === undefined) {
        if (state?.portType === 'number') val = 0;
        else if (state?.portType === 'string') val = '';
        else if (state?.portType === 'boolean') val = false;
        else if (state?.portType === 'array') val = [];
        else if (state?.portType === 'object') val = {};
        else val = 0;
      }
      return { out: val };
    },
  },
  {
    typeId: 'composite/output-port',
    label: 'グループ出力端子 (Output Port)',
    category: 'Composite',
    kind: 'output',
    description: '複合ノード（関数グループ）の戻り値端子。上流から受け取った計算結果を複合ノードの出力値とします。',
    inputs: [
      { id: 'in', name: 'in', type: 'any', defaultValue: 0 },
    ],
    outputs: [
      { id: 'out', name: 'out', type: 'any', defaultValue: 0 },
    ],
    defaultState: { portName: 'result', portType: 'number' },
    evaluate: (inputs, state) => {
      const val = inputs.in;
      const portName = state?.portName || 'result';
      return { out: val, [portName]: val };
    },
  },
];

// Presets that showcase pure function visual programming
export const PRESETS: GraphPreset[] = [
  {
    id: 'math-calc',
    title: '四則演算パイプライン (A * B + C)',
    description: 'スライダー入力から掛け算・足し算を連鎖させ、メーターとインスペクタで結果を確認',
    nodes: [
      { id: 'n-slider-a', typeId: 'input/slider', x: 80, y: 120, state: { value: 12, min: 0, max: 50, step: 1 }, customLabel: '数値 A (幅)' },
      { id: 'n-slider-b', typeId: 'input/slider', x: 80, y: 320, state: { value: 8, min: 0, max: 50, step: 1 }, customLabel: '数値 B (高さ)' },
      { id: 'n-mul', typeId: 'math/multiply', x: 420, y: 180, customLabel: '面積 (A * B)' },
      { id: 'n-add-c', typeId: 'input/number', x: 420, y: 380, state: { value: 15 }, customLabel: '追加オフセット C' },
      { id: 'n-add', typeId: 'math/add', x: 740, y: 240, customLabel: '合計計算 (Area + C)' },
      { id: 'n-out-inspector', typeId: 'output/inspector', x: 1060, y: 160, customLabel: '最終計算結果' },
      { id: 'n-out-gauge', typeId: 'output/gauge', x: 1060, y: 360, state: { min: 0, max: 200 }, customLabel: 'メーター表示' },
    ],
    connections: [
      { id: 'c1', fromNodeId: 'n-slider-a', fromPortId: 'value', toNodeId: 'n-mul', toPortId: 'a' },
      { id: 'c2', fromNodeId: 'n-slider-b', fromPortId: 'value', toNodeId: 'n-mul', toPortId: 'b' },
      { id: 'c3', fromNodeId: 'n-mul', fromPortId: 'result', toNodeId: 'n-add', toPortId: 'a' },
      { id: 'c4', fromNodeId: 'n-add-c', fromPortId: 'value', toNodeId: 'n-add', toPortId: 'b' },
      { id: 'c5', fromNodeId: 'n-add', fromPortId: 'result', toNodeId: 'n-out-inspector', toPortId: 'value' },
      { id: 'c6', fromNodeId: 'n-add', fromPortId: 'result', toNodeId: 'n-out-gauge', toPortId: 'value' },
    ],
  },
  {
    id: 'string-template',
    title: '動的文字列テンプレート生成',
    description: '入力文字列をテンプレートに流し込み、大文字変換してフォーマット結果を出力',
    nodes: [
      { id: 'n-txt-name', typeId: 'input/text', x: 80, y: 120, state: { value: 'Sato Taro' }, customLabel: 'ユーザー名' },
      { id: 'n-txt-proj', typeId: 'input/text', x: 80, y: 300, state: { value: 'NodeFlow Core' }, customLabel: 'プロジェクト名' },
      { id: 'n-tpl', typeId: 'string/template', x: 420, y: 160, customLabel: 'テンプレート置換' },
      { id: 'n-upper', typeId: 'string/uppercase', x: 740, y: 160, customLabel: '大文字変換' },
      { id: 'n-len', typeId: 'string/length', x: 740, y: 360, customLabel: '文字数カウント' },
      { id: 'n-out-text', typeId: 'output/inspector', x: 1060, y: 160, customLabel: '整形されたメッセージ' },
      { id: 'n-out-count', typeId: 'output/inspector', x: 1060, y: 360, customLabel: 'メッセージ長' },
    ],
    connections: [
      { id: 'cs1', fromNodeId: 'n-txt-name', fromPortId: 'value', toNodeId: 'n-tpl', toPortId: 'a' },
      { id: 'cs2', fromNodeId: 'n-txt-proj', fromPortId: 'value', toNodeId: 'n-tpl', toPortId: 'b' },
      { id: 'cs3', fromNodeId: 'n-tpl', fromPortId: 'result', toNodeId: 'n-upper', toPortId: 'text' },
      { id: 'cs4', fromNodeId: 'n-tpl', fromPortId: 'result', toNodeId: 'n-len', toPortId: 'text' },
      { id: 'cs5', fromNodeId: 'n-upper', fromPortId: 'result', toNodeId: 'n-out-text', toPortId: 'value' },
      { id: 'cs6', fromNodeId: 'n-len', fromPortId: 'result', toNodeId: 'n-out-count', toPortId: 'value' },
    ],
  },
  {
    id: 'logic-validator',
    title: '年齢チェック・条件分岐ロジック',
    description: '入力数値を比較判定し、三項条件分岐でステータスメッセージを切り替え',
    nodes: [
      { id: 'n-age', typeId: 'input/slider', x: 80, y: 160, state: { value: 21, min: 0, max: 100, step: 1 }, customLabel: '入力年齢 (Age)' },
      { id: 'n-threshold', typeId: 'input/number', x: 80, y: 360, state: { value: 18 }, customLabel: '閾値 (Adult Age)' },
      { id: 'n-cmp', typeId: 'logic/greater', x: 420, y: 200, customLabel: '判定 (Age >= 18)' },
      { id: 'n-branch', typeId: 'logic/branch', x: 740, y: 180, customLabel: '分岐処理' },
      { id: 'n-status', typeId: 'output/status', x: 740, y: 400, state: { trueLabel: '成人 (Adult)', falseLabel: '未成年 (Minor)' }, customLabel: '成年判定バッジ' },
      { id: 'n-msg-out', typeId: 'output/inspector', x: 1060, y: 180, customLabel: 'アクセス権限結果' },
    ],
    connections: [
      { id: 'cl1', fromNodeId: 'n-age', fromPortId: 'value', toNodeId: 'n-cmp', toPortId: 'a' },
      { id: 'cl2', fromNodeId: 'n-threshold', fromPortId: 'value', toNodeId: 'n-cmp', toPortId: 'b' },
      { id: 'cl3', fromNodeId: 'n-cmp', fromPortId: 'result', toNodeId: 'n-branch', toPortId: 'condition' },
      { id: 'cl4', fromNodeId: 'n-cmp', fromPortId: 'result', toNodeId: 'n-status', toPortId: 'status' },
      { id: 'cl5', fromNodeId: 'n-branch', fromPortId: 'result', toNodeId: 'n-msg-out', toPortId: 'value' },
    ],
  },
  {
    id: 'array-pipeline',
    title: '配列データ変換パイプライン',
    description: '数値配列から正の数を抽出(Filter)し、2倍に変換(Map)した後に合計(Sum)を算出',
    nodes: [
      { id: 'n-arr-input', typeId: 'input/array', x: 80, y: 220, state: { rawText: '15, -8, 24, -3, 50, -12', type: 'number' }, customLabel: '入力数値リスト' },
      { id: 'n-arr-filter', typeId: 'array/filter', x: 400, y: 220, state: { operator: '>' }, customLabel: '正数フィルタ (> 0)' },
      { id: 'n-arr-map', typeId: 'array/map', x: 700, y: 220, state: { operator: '*' }, customLabel: '2倍変換 (* 2)' },
      { id: 'n-arr-sum', typeId: 'array/sum', x: 1000, y: 120, customLabel: '合計値算出 (Sum)' },
      { id: 'n-arr-join', typeId: 'array/join', x: 1000, y: 320, customLabel: '文字列結合 (CSV)' },
      { id: 'n-out-sum', typeId: 'output/inspector', x: 1300, y: 120, customLabel: '合計結果' },
      { id: 'n-out-csv', typeId: 'output/inspector', x: 1300, y: 320, customLabel: '変換後CSV' },
    ],
    connections: [
      { id: 'ca1', fromNodeId: 'n-arr-input', fromPortId: 'value', toNodeId: 'n-arr-filter', toPortId: 'arr' },
      { id: 'ca2', fromNodeId: 'n-arr-filter', fromPortId: 'result', toNodeId: 'n-arr-map', toPortId: 'arr' },
      { id: 'ca3', fromNodeId: 'n-arr-map', fromPortId: 'result', toNodeId: 'n-arr-sum', toPortId: 'arr' },
      { id: 'ca4', fromNodeId: 'n-arr-map', fromPortId: 'result', toNodeId: 'n-arr-join', toPortId: 'arr' },
      { id: 'ca5', fromNodeId: 'n-arr-sum', fromPortId: 'result', toNodeId: 'n-out-sum', toPortId: 'value' },
      { id: 'ca6', fromNodeId: 'n-arr-join', fromPortId: 'result', toNodeId: 'n-out-csv', toPortId: 'value' },
    ],
  },
  {
    id: 'custom-type-pipeline',
    title: 'カスタム型 (User) 生成・検証・分解パイプライン',
    description: 'プリミティブ入力値から User 型オブジェクトを生成(Constructor)し、分解(Deconstruct)して個別取得',
    nodes: [
      { id: 'n-uid', typeId: 'input/number', x: 60, y: 120, state: { value: 2026 }, customLabel: 'ユーザーID' },
      { id: 'n-uname', typeId: 'input/text', x: 60, y: 260, state: { value: 'Yamada Kenji' }, customLabel: '氏名' },
      { id: 'n-uemail', typeId: 'input/text', x: 60, y: 400, state: { value: 'kenji@example.com' }, customLabel: 'メールアドレス' },
      { id: 'n-uactive', typeId: 'input/boolean', x: 60, y: 540, state: { value: true }, customLabel: '有効フラグ' },
      // Constructor node
      { id: 'n-user-ctor', typeId: 'type/User/constructor', x: 400, y: 240, customLabel: 'User Constructor (生成)' },
      // Validator node
      { id: 'n-user-val', typeId: 'type/User/validate', x: 740, y: 160, customLabel: 'User スキーマ検証' },
      // Deconstructor node
      { id: 'n-user-dcon', typeId: 'type/User/deconstruct', x: 1060, y: 240, customLabel: 'User Deconstruct (分解)' },
      // Inspector outputs
      { id: 'n-out-user-obj', typeId: 'output/inspector', x: 740, y: 420, customLabel: 'User オブジェクト全体' },
      { id: 'n-out-val-status', typeId: 'output/status', x: 1060, y: 100, state: { trueLabel: 'User型 準拠', falseLabel: 'スキーマ不正' }, customLabel: '検証ステータス' },
      { id: 'n-out-name', typeId: 'output/inspector', x: 1380, y: 200, customLabel: '分解された氏名' },
      { id: 'n-out-email', typeId: 'output/inspector', x: 1380, y: 360, customLabel: '分解されたメール' },
    ],
    connections: [
      { id: 'cu1', fromNodeId: 'n-uid', fromPortId: 'value', toNodeId: 'n-user-ctor', toPortId: 'id' },
      { id: 'cu2', fromNodeId: 'n-uname', fromPortId: 'value', toNodeId: 'n-user-ctor', toPortId: 'name' },
      { id: 'cu3', fromNodeId: 'n-uemail', fromPortId: 'value', toNodeId: 'n-user-ctor', toPortId: 'email' },
      { id: 'cu4', fromNodeId: 'n-uactive', fromPortId: 'value', toNodeId: 'n-user-ctor', toPortId: 'isActive' },
      { id: 'cu5', fromNodeId: 'n-user-ctor', fromPortId: 'instance', toNodeId: 'n-user-val', toPortId: 'data' },
      { id: 'cu6', fromNodeId: 'n-user-ctor', fromPortId: 'instance', toNodeId: 'n-out-user-obj', toPortId: 'value' },
      { id: 'cu7', fromNodeId: 'n-user-val', fromPortId: 'isValid', toNodeId: 'n-out-val-status', toPortId: 'status' },
      { id: 'cu8', fromNodeId: 'n-user-ctor', fromPortId: 'instance', toNodeId: 'n-user-dcon', toPortId: 'instance' },
      { id: 'cu9', fromNodeId: 'n-user-dcon', fromPortId: 'name', toNodeId: 'n-out-name', toPortId: 'value' },
      { id: 'cu10', fromNodeId: 'n-user-dcon', fromPortId: 'email', toNodeId: 'n-out-email', toPortId: 'value' },
    ],
  },
  {
    id: 'async-promise-pipeline',
    title: '非同期Promise & API取得パイプライン',
    description: '非同期APIリクエスト(Simulated Fetch)を行い、Promiseを待機(Await)してデータを分解・表示',
    nodes: [
      { id: 'np-fetch', typeId: 'async/fetch', x: 80, y: 160, state: { endpoint: '/api/v1/telemetry', latency: 400 }, customLabel: '非同期APIフェッチ' },
      { id: 'np-await', typeId: 'async/await', x: 440, y: 160, customLabel: 'Promise 待機 (Await)' },
      { id: 'np-get-metrics', typeId: 'object/get', x: 760, y: 160, state: { key: 'metrics' }, customLabel: 'メトリクス抽出' },
      { id: 'np-out-raw', typeId: 'output/inspector', x: 760, y: 360, customLabel: '全レスポンス' },
      { id: 'np-out-metrics', typeId: 'output/inspector', x: 1080, y: 160, customLabel: '抽出メトリクス' },
    ],
    connections: [
      { id: 'cp1', fromNodeId: 'np-fetch', fromPortId: 'promise', toNodeId: 'np-await', toPortId: 'promise' },
      { id: 'cp2', fromNodeId: 'np-await', fromPortId: 'result', toNodeId: 'np-get-metrics', toPortId: 'obj' },
      { id: 'cp3', fromNodeId: 'np-await', fromPortId: 'result', toNodeId: 'np-out-raw', toPortId: 'value' },
      { id: 'cp4', fromNodeId: 'np-get-metrics', fromPortId: 'value', toNodeId: 'np-out-metrics', toPortId: 'value' },
    ],
  },
  {
    id: 'stream-iterator-pipeline',
    title: 'AsyncIterator リアルタイムストリーム処理',
    description: 'Intervalストリーム(0,1,2..)から流れるデータを偶数フィルタし、2倍変換して配列にリアルタイム集約',
    nodes: [
      { id: 'ns-interval', typeId: 'stream/interval', x: 80, y: 200, state: { intervalMs: 300, limit: 10 }, customLabel: 'タイマーストリーム (0..9)' },
      { id: 'ns-filter', typeId: 'stream/filter', x: 420, y: 200, state: { mode: 'even' }, customLabel: '偶数フィルタ (Even)' },
      { id: 'ns-map', typeId: 'stream/map', x: 740, y: 200, state: { multiplier: 10 }, customLabel: '10倍変換 (* 10)' },
      { id: 'ns-collect', typeId: 'stream/collect', x: 1060, y: 200, customLabel: 'ストリーム集約 (Collect)' },
      { id: 'ns-out-arr', typeId: 'output/inspector', x: 1380, y: 140, customLabel: '集約配列結果' },
      { id: 'ns-out-count', typeId: 'output/inspector', x: 1380, y: 320, customLabel: '受信件数' },
    ],
    connections: [
      { id: 'cs1', fromNodeId: 'ns-interval', fromPortId: 'stream', toNodeId: 'ns-filter', toPortId: 'stream' },
      { id: 'cs2', fromNodeId: 'ns-filter', fromPortId: 'stream', toNodeId: 'ns-map', toPortId: 'stream' },
      { id: 'cs3', fromNodeId: 'ns-map', fromPortId: 'stream', toNodeId: 'ns-collect', toPortId: 'stream' },
      { id: 'cs4', fromNodeId: 'ns-collect', fromPortId: 'array', toNodeId: 'ns-out-arr', toPortId: 'value' },
      { id: 'cs5', fromNodeId: 'ns-collect', fromPortId: 'count', toNodeId: 'ns-out-count', toPortId: 'value' },
    ],
  },
  {
    id: 'composite-vector-length',
    title: '複合ノード作成サンプル: 2Dベクトル長 (sqrt(x^2 + y^2))',
    description: '2つの「グループ入力端子(x, y)」から乗算・加算・平方根を経て「グループ出力端子(length)」へ繋ぐ回路。「複合ノード化」ですぐに1つの関数にまとめられます！',
    nodes: [
      { id: 'nc-in-x', typeId: 'composite/input-port', x: 80, y: 140, state: { portName: 'x', portType: 'number', testValue: 3 }, customLabel: '入力端子: x' },
      { id: 'nc-in-y', typeId: 'composite/input-port', x: 80, y: 340, state: { portName: 'y', portType: 'number', testValue: 4 }, customLabel: '入力端子: y' },
      { id: 'nc-sq-x', typeId: 'math/multiply', x: 400, y: 140, customLabel: 'x^2' },
      { id: 'nc-sq-y', typeId: 'math/multiply', x: 400, y: 340, customLabel: 'y^2' },
      { id: 'nc-add', typeId: 'math/add', x: 700, y: 240, customLabel: 'x^2 + y^2' },
      { id: 'nc-sqrt', typeId: 'math/sqrt', x: 960, y: 240, customLabel: 'sqrt(x^2 + y^2)' },
      { id: 'nc-out', typeId: 'composite/output-port', x: 1240, y: 240, state: { portName: 'length', portType: 'number' }, customLabel: '出力端子: length' },
    ],
    connections: [
      { id: 'cc1', fromNodeId: 'nc-in-x', fromPortId: 'out', toNodeId: 'nc-sq-x', toPortId: 'a' },
      { id: 'cc2', fromNodeId: 'nc-in-x', fromPortId: 'out', toNodeId: 'nc-sq-x', toPortId: 'b' },
      { id: 'cc3', fromNodeId: 'nc-in-y', fromPortId: 'out', toNodeId: 'nc-sq-y', toPortId: 'a' },
      { id: 'cc4', fromNodeId: 'nc-in-y', fromPortId: 'out', toNodeId: 'nc-sq-y', toPortId: 'b' },
      { id: 'cc5', fromNodeId: 'nc-sq-x', fromPortId: 'result', toNodeId: 'nc-add', toPortId: 'a' },
      { id: 'cc6', fromNodeId: 'nc-sq-y', fromPortId: 'result', toNodeId: 'nc-add', toPortId: 'b' },
      { id: 'cc7', fromNodeId: 'nc-add', fromPortId: 'result', toNodeId: 'nc-sqrt', toPortId: 'value' },
      { id: 'cc8', fromNodeId: 'nc-sqrt', fromPortId: 'result', toNodeId: 'nc-out', toPortId: 'in' },
    ],
  },
  {
    id: 'composite-partial-application',
    title: '部分適用サンプル: 10倍カスタム関数 (Partial Application)',
    description: 'グループ入力端子(x)と固定値10のNumber Inputを乗算ノードへ接続。「複合ノード化」を行うとフォーム値10が内部に固定（部分適用）され、引数xを10倍するカスタム関数が生成されます。',
    nodes: [
      { id: 'np-in-x', typeId: 'composite/input-port', x: 80, y: 140, state: { portName: 'x', portType: 'number', testValue: 5 }, customLabel: 'グループ入力端子 (x)' },
      { id: 'np-fixed-num', typeId: 'input/number', x: 80, y: 340, state: { value: 10 }, customLabel: 'Number Input (固定値: 10)' },
      { id: 'np-mul', typeId: 'math/multiply', x: 420, y: 220, customLabel: '乗算 (x * 10)' },
      { id: 'np-out-res', typeId: 'composite/output-port', x: 740, y: 220, state: { portName: 'result', portType: 'number' }, customLabel: 'グループ出力端子 (result)' },
    ],
    connections: [
      { id: 'cpa1', fromNodeId: 'np-in-x', fromPortId: 'out', toNodeId: 'np-mul', toPortId: 'a' },
      { id: 'cpa2', fromNodeId: 'np-fixed-num', fromPortId: 'value', toNodeId: 'np-mul', toPortId: 'b' },
      { id: 'cpa3', fromNodeId: 'np-mul', fromPortId: 'result', toNodeId: 'np-out-res', toPortId: 'in' },
    ],
  },
];
