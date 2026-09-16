import type { NodeDefinition } from '../../types';

export const INPUT_NODES: NodeDefinition[] = [
  {
    typeId: 'input/number',
    label: 'Number Input',
    category: 'Input',
    kind: 'input',
    description: '数値を入力するソースノード',
    inputs: [],
    outputs: [{ id: 'value', name: 'value', type: 'number', defaultValue: 0 }],
    defaultState: { value: 0 },
    evaluate: (_inputs, state) => {
      if (typeof state?.value !== 'number' || !Number.isFinite(state.value)) {
        throw new Error('INPUT_TYPE: 数値を入力してください。');
      }
      return { value: state.value };
    },
  },
  {
    typeId: 'input/slider',
    label: 'Slider Input',
    category: 'Input',
    kind: 'input',
    description: 'スライダー操作で数値を調整するノード',
    inputs: [],
    outputs: [{ id: 'value', name: 'value', type: 'number', defaultValue: 50 }],
    defaultState: { value: 50, min: 0, max: 100, step: 1 },
    evaluate: (_inputs, state) => {
      const { value, min, max, step } = state ?? {};
      if (
        ![value, min, max, step].every(
          (item) => typeof item === 'number' && Number.isFinite(item),
        ) ||
        min > max ||
        step <= 0 ||
        value < min ||
        value > max
      ) {
        throw new Error('INPUT_CONSTRAINT: スライダーの範囲または値が不正です。');
      }
      return { value };
    },
  },
  {
    typeId: 'input/text',
    label: 'Text Input',
    category: 'Input',
    kind: 'input',
    description: '文字列を入力するソースノード',
    inputs: [],
    outputs: [{ id: 'value', name: 'value', type: 'string', defaultValue: 'Hello World' }],
    defaultState: { value: '' },
    evaluate: (_inputs, state) => {
      if (typeof state?.value !== 'string')
        throw new Error('INPUT_TYPE: 文字列を入力してください。');
      return { value: state.value };
    },
  },
  {
    typeId: 'input/boolean',
    label: 'Boolean Toggle',
    category: 'Input',
    kind: 'input',
    description: '真偽値（true / false）を切り替えるノード',
    inputs: [],
    outputs: [{ id: 'value', name: 'value', type: 'boolean', defaultValue: true }],
    defaultState: { value: false },
    evaluate: (_inputs, state) => {
      if (typeof state?.value !== 'boolean')
        throw new Error('INPUT_TYPE: booleanを入力してください。');
      return { value: state.value };
    },
  },
  {
    typeId: 'input/array',
    label: 'Array Input',
    category: 'Input',
    kind: 'input',
    description: '数値または文字の配列リテラルを入力するノード',
    inputs: [],
    outputs: [{ id: 'value', name: 'value', type: 'array', defaultValue: [1, 2, 3, 4, 5] }],
    defaultState: { rawText: '', type: 'number' },
    evaluate: (_inputs, state) => {
      const raw = String(state?.rawText ?? '');
      if (state?.type === 'string') {
        const arr = raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        return { value: arr };
      }
      const arr = raw
        .split(',')
        .filter((s) => s.trim() !== '')
        .map((s) => Number(s.trim()));
      if (arr.some((n) => !Number.isFinite(n))) {
        throw new Error('INPUT_TYPE: 数値CSVに変換できない要素があります。');
      }
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
    defaultState: { rawJson: '{}' },
    evaluate: (_inputs, state) => {
      try {
        const parsed = JSON.parse(state?.rawJson || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('JSONオブジェクトを入力してください。');
        }
        return { value: parsed };
      } catch (error) {
        throw new Error(
          `INPUT_TYPE: ${error instanceof Error ? error.message : 'JSONが不正です。'}`,
          { cause: error },
        );
      }
    },
  },
];
