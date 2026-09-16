import type { NodeDefinition } from '../../types';

export const LOGIC_NODES: NodeDefinition[] = [
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
    outputs: [{ id: 'result', name: 'result', type: 'boolean' }],
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
    outputs: [{ id: 'result', name: 'result', type: 'boolean' }],
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
    inputs: [{ id: 'value', name: 'value', type: 'boolean', defaultValue: false }],
    outputs: [{ id: 'result', name: 'result', type: 'boolean' }],
    evaluate: (inputs) => {
      return { result: !inputs.value };
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
    outputs: [{ id: 'result', name: 'result', type: 'boolean' }],
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
    outputs: [{ id: 'result', name: 'result', type: 'boolean' }],
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
    outputs: [{ id: 'result', name: 'result', type: 'any' }],
    evaluate: (inputs) => {
      return { result: inputs.condition ? inputs.ifTrue : inputs.ifFalse };
    },
  },
];
