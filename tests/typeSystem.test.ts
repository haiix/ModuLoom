import { describe, expect, it } from 'vitest';

import {
  detectValueType,
  formatValue,
  findCustomTypeCycle,
  getCustomTypeDependents,
  isTypeCompatible,
  isValueCompatibleWithType,
  mapDataTypeToTypeScript,
} from '../src/engine/typeSystem';
import { formatTypeRef, normalizeTypeRef, serializeTypeRef } from '../src/typeRef';
import type { CustomTypeDefinition } from '../src/types';

const customTypes: CustomTypeDefinition[] = [
  {
    id: 'User',
    name: 'User',
    color: '#ec4899',
    fields: [{ name: 'id', type: 'number', required: true }],
  },
];

describe('isTypeCompatible', () => {
  it('同じ型とanyを互換として扱う', () => {
    expect(isTypeCompatible('number', 'number')).toBe(true);
    expect(isTypeCompatible('number', 'any')).toBe(true);
    expect(isTypeCompatible('any', 'string')).toBe(true);
  });

  it('異なる組み込み型を拒否する', () => {
    expect(isTypeCompatible('number', 'string')).toBe(false);
  });

  it('カスタム型からobjectへの接続を許可する', () => {
    expect(isTypeCompatible('User', 'object', customTypes)).toBe(true);
    expect(isTypeCompatible('Unknown', 'object', customTypes)).toBe(false);
  });

  it('ジェネリック引数を再帰的に照合しlegacyコンテナをanyとして扱う', () => {
    expect(isTypeCompatible('array<number>', 'array<number>')).toBe(true);
    expect(isTypeCompatible('array<number>', 'array<string>')).toBe(false);
    expect(isTypeCompatible('array<number>', 'array')).toBe(true);
    expect(isTypeCompatible('promise<array<string>>', 'promise<array<string>>')).toBe(true);
  });

  it('unknownは受け口では安全だが送出元ではunknown/any以外へ流さない', () => {
    expect(isTypeCompatible('number', 'unknown')).toBe(true);
    expect(isTypeCompatible('unknown', 'number')).toBe(false);
    expect(isTypeCompatible('unknown', 'any')).toBe(true);
  });
});

describe('TypeRef', () => {
  it('旧コンテナ型を正規化し、ネスト型を安定して表示・直列化する', () => {
    expect(normalizeTypeRef('array')).toEqual({
      name: 'array',
      arguments: [{ name: 'any', arguments: [] }],
    });
    expect(serializeTypeRef(' Promise < Array<string> > ')).toBe('promise<array<string>>');
    expect(formatTypeRef('stream<array<number>>')).toBe('Stream<Array<number>>');
  });
});

describe('detectValueType', () => {
  it.each([
    [42, 'number'],
    ['hello', 'string'],
    [true, 'boolean'],
    [[1, 2], 'array'],
    [{ id: 1 }, 'object'],
    [null, 'any'],
  ])('%jを%sとして検出する', (value, expected) => {
    expect(detectValueType(value)).toBe(expected);
  });

  it('PromiseとAsyncIterableを検出する', () => {
    expect(detectValueType(Promise.resolve(1))).toBe('promise');
    expect(
      detectValueType({
        async *[Symbol.asyncIterator]() {
          yield 1;
        },
      }),
    ).toBe('stream');
  });
});

describe('isValueCompatibleWithType', () => {
  it('uses the same flat type semantics as input validation', () => {
    expect(isValueCompatibleWithType(1, 'number')).toBe(true);
    expect(isValueCompatibleWithType(Number.NaN, 'number')).toBe(false);
    expect(isValueCompatibleWithType([], 'array')).toBe(true);
    expect(isValueCompatibleWithType([], 'object')).toBe(false);
    expect(isValueCompatibleWithType({}, 'User')).toBe(true);
    expect(isValueCompatibleWithType(undefined, 'any')).toBe(false);
  });

  it('配列要素型を再帰的に検証する', () => {
    expect(isValueCompatibleWithType([1, 2], 'array<number>')).toBe(true);
    expect(isValueCompatibleWithType([1, '2'], 'array<number>')).toBe(false);
    expect(isValueCompatibleWithType([['a']], 'array<array<string>>')).toBe(true);
  });
});

describe('custom type references', () => {
  const nestedTypes: CustomTypeDefinition[] = [
    { id: 'Address', name: 'Address', color: '#000', fields: [] },
    {
      id: 'UserList',
      name: 'UserList',
      color: '#111',
      fields: [{ name: 'addresses', type: 'array<Address>' }],
    },
  ];

  it('ネスト参照を依存関係として扱い、削除対象の参照元を返す', () => {
    expect(getCustomTypeDependents('Address', nestedTypes).map(({ id }) => id)).toEqual([
      'UserList',
    ]);
  });

  it('直接・間接の循環を検出する', () => {
    const cyclic = nestedTypes.map((type) =>
      type.id === 'Address' ? { ...type, fields: [{ name: 'owner', type: 'UserList' }] } : type,
    );
    expect(findCustomTypeCycle(cyclic)).toEqual(['Address', 'UserList', 'Address']);
  });

  it('生成TypeScriptでも要素型を保持する', () => {
    expect(mapDataTypeToTypeScript('array<Address>', nestedTypes)).toBe('Array<Address>');
    expect(mapDataTypeToTypeScript('promise<array<string>>')).toBe('Promise<Array<string>>');
  });
});

describe('formatValue', () => {
  it('プリミティブ値と長い配列を表示用文字列へ変換する', () => {
    expect(formatValue('hello')).toBe('"hello"');
    expect(formatValue(true)).toBe('true');
    expect(formatValue([1, 2, 3, 4], 8)).toBe('[1,2,...');
  });
});
