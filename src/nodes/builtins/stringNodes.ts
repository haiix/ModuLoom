import type { NodeDefinition } from '../../types';

export const STRING_NODES: NodeDefinition[] = [
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
    outputs: [{ id: 'result', name: 'result', type: 'string' }],
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
      {
        id: 'template',
        name: 'template',
        type: 'string',
        defaultValue: '{a} さん、{b} へようこそ！',
      },
      { id: 'a', name: 'a', type: 'string', defaultValue: '山田' },
      { id: 'b', name: 'b', type: 'string', defaultValue: 'ModuLoom' },
    ],
    outputs: [{ id: 'result', name: 'result', type: 'string' }],
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
    inputs: [{ id: 'text', name: 'text', type: 'string', defaultValue: '' }],
    outputs: [{ id: 'result', name: 'result', type: 'string' }],
    evaluate: (inputs) => {
      return { result: String(inputs.text ?? '').toUpperCase() };
    },
  },
  {
    typeId: 'string/trim',
    label: 'Trim',
    category: 'String',
    kind: 'pure',
    description: '文字列の先頭と末尾の空白を除去',
    inputs: [{ id: 'text', name: 'text', type: 'string' }],
    outputs: [{ id: 'result', name: 'result', type: 'string' }],
    evaluate: (inputs) => ({ result: inputs.text.trim() }),
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
    outputs: [{ id: 'result', name: 'result', type: 'array' }],
    evaluate: (inputs) => {
      const text = String(inputs.text ?? '');
      const sep = String(inputs.separator ?? ',');
      return { result: text.split(sep).map((s) => s.trim()) };
    },
  },
  {
    typeId: 'string/length',
    label: 'String Length',
    category: 'String',
    kind: 'pure',
    description: '文字列の長さを数値で取得',
    inputs: [{ id: 'text', name: 'text', type: 'string', defaultValue: '' }],
    outputs: [{ id: 'result', name: 'result', type: 'number' }],
    evaluate: (inputs) => {
      return { result: String(inputs.text ?? '').length };
    },
  },
];
