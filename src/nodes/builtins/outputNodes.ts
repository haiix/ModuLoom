import type { NodeDefinition } from '../../types';

export const OUTPUT_NODES: NodeDefinition[] = [
  {
    typeId: 'output/inspector',
    label: 'Value Inspector',
    category: 'Output',
    kind: 'output',
    description: '計算結果を詳細に表示する汎用インスペクタ',
    inputs: [{ id: 'value', name: 'value', type: 'any' }],
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
    inputs: [{ id: 'value', name: 'value', type: 'number', defaultValue: 0 }],
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
    inputs: [{ id: 'status', name: 'status', type: 'boolean', defaultValue: false }],
    outputs: [],
    defaultState: { trueLabel: '合格 (Passed)', falseLabel: '不合格 (Failed)' },
    evaluate: (inputs) => {
      return { displayedValue: inputs.status };
    },
  },
  {
    typeId: 'output/log',
    label: 'Log Viewer',
    category: 'Output',
    kind: 'output',
    description: '現在の値をログ形式で表示',
    inputs: [{ id: 'message', name: 'message', type: 'any' }],
    outputs: [],
    evaluate: (inputs) => {
      return { displayedValue: inputs.message };
    },
  },
];
