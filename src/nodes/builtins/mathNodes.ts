import type { NodeDefinition } from '../../types';

export const MATH_NODES: NodeDefinition[] = [
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
    outputs: [{ id: 'result', name: 'result', type: 'number' }],
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
    outputs: [{ id: 'result', name: 'result', type: 'number' }],
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
    outputs: [{ id: 'result', name: 'result', type: 'number' }],
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
    outputs: [{ id: 'result', name: 'result', type: 'number' }],
    evaluate: (inputs) => {
      const a = inputs.a;
      const b = inputs.b;
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
    outputs: [{ id: 'result', name: 'result', type: 'number' }],
    evaluate: (inputs) => {
      const a = inputs.a;
      const b = inputs.b;
      if (b === 0) throw new Error('DOMAIN_ERROR: ゼロ除算エラー (Modulo by zero)');
      return { result: a % b };
    },
  },
  {
    typeId: 'math/round',
    label: 'Round (四捨五入)',
    category: 'Math',
    kind: 'pure',
    description: '数値を四捨五入して整数にする',
    inputs: [{ id: 'value', name: 'value', type: 'number', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'result', type: 'number' }],
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
    inputs: [{ id: 'value', name: 'value', type: 'number', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'result', type: 'number' }],
    evaluate: (inputs) => {
      return { result: Math.abs(Number(inputs.value ?? 0)) };
    },
  },
  {
    typeId: 'math/sqrt',
    label: 'Square Root (平方根)',
    category: 'Math',
    kind: 'pure',
    description: '数値の平方根を計算。負数は NaN を返す',
    inputs: [{ id: 'value', name: 'value', type: 'number', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'result', type: 'number' }],
    evaluate: (inputs) => {
      if (inputs.value < 0) throw new Error('DOMAIN_ERROR: 負数の平方根は計算できません。');
      return { result: Math.sqrt(inputs.value) };
    },
  },
  {
    typeId: 'math/clamp',
    label: 'Clamp',
    category: 'Math',
    kind: 'pure',
    description: '数値を最小値と最大値の範囲内に制限',
    inputs: [
      { id: 'value', name: 'value', type: 'number' },
      { id: 'min', name: 'min', type: 'number' },
      { id: 'max', name: 'max', type: 'number' },
    ],
    outputs: [{ id: 'result', name: 'result', type: 'number' }],
    evaluate: (inputs) => {
      if (inputs.min > inputs.max) {
        throw new Error('DOMAIN_ERROR: Clampのminはmax以下である必要があります。');
      }
      return { result: Math.min(inputs.max, Math.max(inputs.min, inputs.value)) };
    },
  },
];
