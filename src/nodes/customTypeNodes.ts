import { CustomTypeDefinition, NodeDefinition } from '../types';

/**
 * Generates Constructor, Deconstructor, and Validator pure function nodes for a given custom type definition.
 */
export function generateNodesForCustomType(customType: CustomTypeDefinition): NodeDefinition[] {
  const { id, name } = customType;

  // Deep clone fields to guarantee isolation across custom types and node definitions
  const fields = customType.fields.map((f) => ({
    name: f.name,
    type: f.type,
    required: f.required ?? true,
    defaultValue:
      f.defaultValue !== undefined
        ? JSON.parse(JSON.stringify(f.defaultValue))
        : f.type === 'number'
          ? 0
          : f.type === 'string'
            ? ''
            : f.type === 'boolean'
              ? false
              : f.type === 'array'
                ? []
                : {},
  }));

  // 1. Constructor Node: takes each field as input -> outputs the custom object
  const constructorNode: NodeDefinition = {
    typeId: `type/${id}/constructor`,
    label: `${name} 生成 (Constructor)`,
    category: 'Object',
    kind: 'pure',
    description: `各フィールド値から ${name} 型のオブジェクトを構築する純粋関数`,
    inputs: fields.map((f) => ({
      id: f.name,
      name: f.name,
      type: f.type,
      defaultValue: JSON.parse(JSON.stringify(f.defaultValue)),
    })),
    outputs: [
      {
        id: 'instance',
        name: name.toLowerCase(),
        type: id,
      },
    ],
    evaluate: (inputs) => {
      const obj: Record<string, any> = {};
      for (const field of fields) {
        const val = inputs[field.name] !== undefined ? inputs[field.name] : field.defaultValue;
        obj[field.name] =
          val !== null && typeof val === 'object' ? JSON.parse(JSON.stringify(val)) : val;
      }
      return { instance: obj };
    },
    codegen: {
      emit: ({ inputsVar }) =>
        `(() => { const result: Record<string, any> = {}; for (const field of ${JSON.stringify(fields)}) { const value = ${inputsVar}[field.name] !== undefined ? ${inputsVar}[field.name] : field.defaultValue; result[field.name] = value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value; } return { instance: result }; })()`,
    },
  };

  // 2. Deconstructor Node: takes custom object -> outputs each field
  const deconstructorNode: NodeDefinition = {
    typeId: `type/${id}/deconstruct`,
    label: `${name} 分解 (Deconstruct)`,
    category: 'Object',
    kind: 'pure',
    description: `${name} 型のオブジェクトからプロパティを分解・抽出する純粋関数`,
    inputs: [
      {
        id: 'instance',
        name: name.toLowerCase(),
        type: id,
      },
    ],
    outputs: fields.map((f) => ({
      id: f.name,
      name: f.name,
      type: f.type,
    })),
    evaluate: (inputs) => {
      const obj = inputs.instance || {};
      const res: Record<string, any> = {};
      for (const field of fields) {
        const val = obj[field.name];
        res[field.name] =
          val !== null && typeof val === 'object' ? JSON.parse(JSON.stringify(val)) : val;
      }
      return res;
    },
    codegen: {
      emit: ({ inputsVar }) =>
        `(() => { const source = ${inputsVar}.instance || {}; const result: Record<string, any> = {}; for (const field of ${JSON.stringify(fields)}) { const value = source[field.name]; result[field.name] = value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value; } return result; })()`,
    },
  };

  // 3. Validator Node: checks if object matches type schema
  const validatorNode: NodeDefinition = {
    typeId: `type/${id}/validate`,
    label: `${name} 検証 (Validate)`,
    category: 'Logic',
    kind: 'pure',
    description: `データが ${name} 型のスキーマ要件を満たしているか検証する純粋関数`,
    inputs: [
      {
        id: 'data',
        name: 'data',
        type: 'any',
      },
    ],
    outputs: [
      { id: 'isValid', name: 'isValid', type: 'boolean' },
      { id: 'instance', name: 'validated', type: id },
    ],
    evaluate: (inputs) => {
      const data = inputs.data;
      if (!data || typeof data !== 'object') {
        return { isValid: false, instance: null };
      }
      let isValid = true;
      for (const field of fields) {
        if (field.required && (data[field.name] === undefined || data[field.name] === null)) {
          isValid = false;
          break;
        }
      }
      return {
        isValid,
        instance: isValid ? JSON.parse(JSON.stringify(data)) : null,
      };
    },
    codegen: {
      emit: ({ inputsVar }) =>
        `(() => { const data = ${inputsVar}.data; if (!data || typeof data !== 'object') return { isValid: false, instance: null }; const isValid = ${JSON.stringify(fields)}.every(field => !field.required || (data[field.name] !== undefined && data[field.name] !== null)); return { isValid, instance: isValid ? JSON.parse(JSON.stringify(data)) : null }; })()`,
    },
  };

  return [constructorNode, deconstructorNode, validatorNode];
}

/**
 * Initial sample custom types
 */
export const INITIAL_CUSTOM_TYPES: CustomTypeDefinition[] = [
  {
    id: 'User',
    name: 'User',
    color: '#ec4899', // pink-500
    description: 'ユーザーアカウント情報（ID・氏名・メール・アクティブ状態）',
    fields: [
      { name: 'id', type: 'number', required: true, defaultValue: 2026 },
      { name: 'name', type: 'string', required: true, defaultValue: 'Yamada Kenji' },
      { name: 'email', type: 'string', required: true, defaultValue: 'kenji@example.com' },
      { name: 'isActive', type: 'boolean', required: false, defaultValue: true },
    ],
  },
  {
    id: 'Point2D',
    name: 'Point2D',
    color: '#06b6d4', // cyan-500
    description: '2次元座標 (x, y)',
    fields: [
      { name: 'x', type: 'number', required: true, defaultValue: 25 },
      { name: 'y', type: 'number', required: true, defaultValue: 50 },
    ],
  },
];
