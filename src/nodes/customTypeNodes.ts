import { CustomTypeDefinition, NodeDefinition } from '../types';
import { isValueCompatibleWithType } from '../engine/typeSystem';
import { getTypeRefBaseName } from '../typeRef';

/**
 * Generates Constructor, Deconstructor, and Validator pure function nodes for a given custom type definition.
 */
export function generateNodesForCustomType(customType: CustomTypeDefinition): NodeDefinition[] {
  const { id, name } = customType;
  const catalog = {
    level: 'advanced' as const,
    source: customType.catalogSource ?? ('project' as const),
    searchTags: ['type', 'schema', name],
  };

  // Deep clone fields to guarantee isolation across custom types and node definitions
  const fields = customType.fields.map((f) => ({
    name: f.name,
    type: f.type,
    required: f.required ?? true,
    defaultValue:
      f.defaultValue !== undefined
        ? JSON.parse(JSON.stringify(f.defaultValue))
        : getTypeRefBaseName(f.type) === 'number'
          ? 0
          : getTypeRefBaseName(f.type) === 'string'
            ? ''
            : getTypeRefBaseName(f.type) === 'boolean'
              ? false
              : getTypeRefBaseName(f.type) === 'array'
                ? []
                : getTypeRefBaseName(f.type) === 'object' ||
                    !['promise', 'stream', 'unknown'].includes(getTypeRefBaseName(f.type))
                  ? {}
                  : undefined,
  }));

  // 1. Constructor Node: takes each field as input -> outputs the custom object
  const constructorNode: NodeDefinition = {
    typeId: `type/${id}/constructor`,
    label: `${name} 生成 (Constructor)`,
    category: 'Object',
    kind: 'pure',
    description: `各フィールド値から ${name} 型のオブジェクトを構築する純粋関数`,
    catalog,
    inputs: fields.map((f) => ({
      id: f.name,
      name: f.name,
      type: f.type,
      ...(f.defaultValue === undefined
        ? { required: true }
        : { defaultValue: JSON.parse(JSON.stringify(f.defaultValue)) }),
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
    catalog,
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
    catalog,
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
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { isValid: false, instance: null };
      }
      const isValid = fields.every((field) => {
        const value = data[field.name];
        if (value === undefined || value === null) return !field.required;
        return isValueCompatibleWithType(value, field.type);
      });
      return {
        isValid,
        instance: isValid ? JSON.parse(JSON.stringify(data)) : null,
      };
    },
    codegen: {
      emit: ({ inputsVar }) =>
        `(() => { const data = ${inputsVar}.data; if (!data || typeof data !== 'object' || Array.isArray(data)) return { isValid: false, instance: null }; const matchesType = (value: any, type: string): boolean => { const match = /^\\s*([^<\\s]+)(?:\\s*<(.+)>)?\\s*$/.exec(type); const name = (match?.[1] || 'unknown').toLowerCase(); const argument = match?.[2] || 'any'; if (name === 'any') return value !== undefined; if (name === 'unknown') return true; if (name === 'number') return typeof value === 'number' && Number.isFinite(value); if (name === 'string') return typeof value === 'string'; if (name === 'boolean') return typeof value === 'boolean'; if (name === 'array') return Array.isArray(value) && value.every(item => matchesType(item, argument)); if (name === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value); if (name === 'promise') return Boolean(value && typeof value.then === 'function'); if (name === 'stream') return Boolean(value && typeof value[Symbol.asyncIterator] === 'function'); return value !== null && typeof value === 'object' && !Array.isArray(value); }; const isValid = ${JSON.stringify(fields)}.every(field => { const value = data[field.name]; return value === undefined || value === null ? !field.required : matchesType(value, field.type); }); return { isValid, instance: isValid ? JSON.parse(JSON.stringify(data)) : null }; })()`,
    },
  };

  return [constructorNode, deconstructorNode, validatorNode];
}

/**
 * Custom types bundled as dependencies of educational samples.
 */
export const EXAMPLE_CUSTOM_TYPES: CustomTypeDefinition[] = [
  {
    id: 'User',
    name: 'User',
    color: '#ec4899', // pink-500
    description: 'ユーザーアカウント情報（ID・氏名・メール・アクティブ状態）',
    catalogSource: 'example',
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
    catalogSource: 'example',
    fields: [
      { name: 'x', type: 'number', required: true, defaultValue: 25 },
      { name: 'y', type: 'number', required: true, defaultValue: 50 },
    ],
  },
];
