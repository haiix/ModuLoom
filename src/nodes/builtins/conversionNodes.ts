import type { NodeDefinition } from '../../types';

export const CONVERSION_NODES: NodeDefinition[] = [
  {
    typeId: 'conversion/to-number',
    label: 'To Number',
    category: 'Utility',
    kind: 'pure',
    description: '値を有限数へ変換',
    inputs: [{ id: 'value', name: 'value', type: 'any' }],
    outputs: [{ id: 'result', name: 'result', type: 'number' }],
    evaluate: (inputs) => {
      try {
        const result = Number(inputs.value);
        if (Number.isFinite(result)) return { result };
      } catch {
        // Normalize conversion failures to the node contract below.
      }
      throw new Error('INPUT_TYPE: 有限数へ変換できません。');
    },
  },
  {
    typeId: 'conversion/to-string',
    label: 'To String',
    category: 'Utility',
    kind: 'pure',
    description: '値を文字列へ変換',
    inputs: [{ id: 'value', name: 'value', type: 'any' }],
    outputs: [{ id: 'result', name: 'result', type: 'string' }],
    evaluate: (inputs) => ({ result: String(inputs.value) }),
  },
  {
    typeId: 'conversion/parse-json',
    label: 'Parse JSON',
    category: 'Utility',
    kind: 'pure',
    description: 'JSON文字列を値へ変換',
    inputs: [{ id: 'text', name: 'text', type: 'string' }],
    outputs: [{ id: 'result', name: 'result', type: 'any' }],
    evaluate: (inputs) => {
      try {
        return { result: JSON.parse(inputs.text) };
      } catch {
        throw new Error('INPUT_TYPE: JSON文字列が不正です。');
      }
    },
  },
];
