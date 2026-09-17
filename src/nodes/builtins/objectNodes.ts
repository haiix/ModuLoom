import type { NodeDefinition } from '../../types';

export const OBJECT_NODES: NodeDefinition[] = [
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
    outputs: [{ id: 'result', name: 'result', type: 'object' }],
    evaluate: (inputs) => {
      const key = inputs.key;
      if (!key || ['__proto__', 'prototype', 'constructor'].includes(key)) {
        throw new Error('INPUT_CONSTRAINT: 使用できないオブジェクトキーです。');
      }
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
    outputs: [{ id: 'result', name: 'result', type: 'any' }],
    evaluate: (inputs) => {
      const obj = inputs.obj;
      if (!Object.prototype.hasOwnProperty.call(obj, inputs.key)) {
        throw new Error(`DOMAIN_ERROR: プロパティ '${inputs.key}' が存在しません。`);
      }
      return { result: obj[inputs.key] };
    },
  },
  {
    typeId: 'object/keys',
    label: 'Object Keys',
    category: 'Object',
    kind: 'pure',
    description: 'オブジェクト自身の列挙可能なキーを配列で取得',
    inputs: [{ id: 'obj', name: 'obj', type: 'object' }],
    outputs: [{ id: 'result', name: 'result', type: 'array<string>' }],
    evaluate: (inputs) => ({ result: Object.keys(inputs.obj) }),
  },
  {
    typeId: 'object/stringify',
    label: 'JSON Stringify',
    category: 'Object',
    kind: 'pure',
    description: 'データをJSON文字列に変換',
    inputs: [{ id: 'data', name: 'data', type: 'any' }],
    outputs: [{ id: 'result', name: 'result', type: 'string' }],
    evaluate: (inputs) => {
      try {
        return { result: JSON.stringify(inputs.data, null, 2) };
      } catch {
        throw new Error('DOMAIN_ERROR: JSONへ直列化できません。');
      }
    },
  },
];
