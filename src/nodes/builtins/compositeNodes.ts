import type { NodeDefinition } from '../../types';

export const COMPOSITE_NODES: NodeDefinition[] = [
  {
    typeId: 'composite/input-port',
    label: 'グループ入力端子 (Input Port)',
    category: 'Composite',
    kind: 'input',
    description:
      '複合ノード（関数グループ）の入力引数端子。ポート名や型を設定して下流ノードへ値を供給します。',
    inputs: [{ id: 'in', name: 'in', type: 'any' }],
    outputs: [{ id: 'out', name: 'out', type: 'any', defaultValue: 0 }],
    defaultState: { portName: 'x', portType: 'number', testValue: 0 },
    evaluate: (inputs, state) => {
      let val = inputs.in !== undefined ? inputs.in : state?.testValue;
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
    description:
      '複合ノード（関数グループ）の戻り値端子。上流から受け取った計算結果を複合ノードの出力値とします。',
    inputs: [{ id: 'in', name: 'in', type: 'any', defaultValue: 0 }],
    outputs: [{ id: 'out', name: 'out', type: 'any', defaultValue: 0 }],
    defaultState: { portName: 'result', portType: 'number' },
    evaluate: (inputs, state) => {
      const val = inputs.in;
      const portName = state?.portName || 'result';
      return { out: val, [portName]: val };
    },
  },
];
