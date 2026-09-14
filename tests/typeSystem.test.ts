import { describe, expect, it } from 'vitest';

import {
  detectValueType,
  formatValue,
  isTypeCompatible,
  isValueCompatibleWithType,
} from '../src/engine/typeSystem';
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
});

describe('formatValue', () => {
  it('プリミティブ値と長い配列を表示用文字列へ変換する', () => {
    expect(formatValue('hello')).toBe('"hello"');
    expect(formatValue(true)).toBe('true');
    expect(formatValue([1, 2, 3, 4], 8)).toBe('[1,2,...');
  });
});
