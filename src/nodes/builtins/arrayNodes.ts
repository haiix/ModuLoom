import type { NodeDefinition } from '../../types';

export const ARRAY_NODES: NodeDefinition[] = [
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
    outputs: [{ id: 'result', name: 'result', type: 'array<any>' }],
    evaluate: (inputs) => {
      return { result: [inputs.item1, inputs.item2] };
    },
  },
  {
    typeId: 'array/length',
    label: 'Array Length',
    category: 'Array',
    kind: 'pure',
    description: '配列の要素数を取得',
    inputs: [{ id: 'arr', name: 'arr', type: 'array<any>', defaultValue: [] }],
    outputs: [{ id: 'result', name: 'result', type: 'number' }],
    evaluate: (inputs) => {
      return { result: Array.isArray(inputs.arr) ? inputs.arr.length : 0 };
    },
  },
  {
    typeId: 'array/get',
    label: 'Get Item',
    category: 'Array',
    kind: 'pure',
    description: '配列からインデックス位置の要素を取得。負数は末尾から数える',
    inputs: [
      { id: 'arr', name: 'arr', type: 'array<any>' },
      { id: 'index', name: 'index', type: 'number', constraints: { integer: true } },
    ],
    outputs: [{ id: 'result', name: 'result', type: 'any' }],
    evaluate: (inputs) => {
      const normalizedIndex = inputs.index < 0 ? inputs.arr.length + inputs.index : inputs.index;
      if (normalizedIndex < 0 || normalizedIndex >= inputs.arr.length) {
        throw new Error('DOMAIN_ERROR: 配列インデックスが範囲外です。');
      }
      return { result: inputs.arr[normalizedIndex] };
    },
  },
  {
    typeId: 'array/join',
    label: 'Array Join',
    category: 'Array',
    kind: 'pure',
    description: '配列を指定の文字で連結して文字列化',
    inputs: [
      { id: 'arr', name: 'arr', type: 'array<any>', defaultValue: [] },
      { id: 'separator', name: 'separator', type: 'string', defaultValue: ', ' },
    ],
    outputs: [{ id: 'result', name: 'result', type: 'string' }],
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
      { id: 'arr', name: 'arr', type: 'array<number>', defaultValue: [] },
      { id: 'factor', name: 'factor (係数)', type: 'number', defaultValue: 2 },
    ],
    outputs: [{ id: 'result', name: 'result', type: 'array<number>' }],
    defaultState: { operator: '*' },
    evaluate: (inputs, state) => {
      const arr = Array.isArray(inputs.arr) ? inputs.arr : [];
      const factor = Number(inputs.factor ?? 2);
      const op = state?.operator || '*';
      return {
        result: arr.map((x) => {
          if (typeof x !== 'number') return x;
          switch (op) {
            case '+':
              return x + factor;
            case '-':
              return x - factor;
            case '/':
              if (factor === 0) throw new Error('DOMAIN_ERROR: Array Mapの除数は0にできません。');
              return x / factor;
            case '*':
            default:
              return x * factor;
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
      { id: 'arr', name: 'arr', type: 'array<number>', defaultValue: [] },
      { id: 'threshold', name: 'threshold (閾値)', type: 'number', defaultValue: 0 },
    ],
    outputs: [{ id: 'result', name: 'result', type: 'array<number>' }],
    defaultState: { operator: '>' },
    evaluate: (inputs, state) => {
      const arr = Array.isArray(inputs.arr) ? inputs.arr : [];
      const thresh = Number(inputs.threshold ?? 0);
      const op = state?.operator || '>';
      return {
        result: arr.filter((x) => {
          if (typeof x !== 'number') return false;
          switch (op) {
            case '>=':
              return x >= thresh;
            case '<':
              return x < thresh;
            case '<=':
              return x <= thresh;
            case '===':
            case '==':
              return x === thresh;
            case '!==':
            case '!=':
              return x !== thresh;
            case '>':
            default:
              return x > thresh;
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
      { id: 'arr', name: 'arr', type: 'array<any>', defaultValue: [] },
      { id: 'start', name: 'start', type: 'number', defaultValue: 0 },
      { id: 'end', name: 'end', type: 'number', defaultValue: 5 },
    ],
    outputs: [{ id: 'result', name: 'result', type: 'array<any>' }],
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
    inputs: [{ id: 'arr', name: 'arr', type: 'array<any>', defaultValue: [] }],
    outputs: [{ id: 'result', name: 'result', type: 'array<any>' }],
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
    inputs: [{ id: 'arr', name: 'arr', type: 'array<number>', defaultValue: [] }],
    outputs: [{ id: 'result', name: 'result', type: 'number' }],
    evaluate: (inputs) => {
      const arr = Array.isArray(inputs.arr) ? inputs.arr : [];
      if (arr.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
        throw new Error('INPUT_TYPE: Array Sumには有限数だけを含む配列が必要です。');
      }
      const sum = arr.reduce((acc, curr) => acc + curr, 0);
      return { result: sum };
    },
  },
];
