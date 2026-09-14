import { describe, expect, it } from 'vitest';
import { generateNodesForCustomType } from '../src/nodes/customTypeNodes';
import type { CustomTypeDefinition } from '../src/types';

const customType: CustomTypeDefinition = {
  id: 'Record',
  name: 'Record',
  color: '#000000',
  fields: [
    { name: 'count', type: 'number', required: true },
    { name: 'title', type: 'string', required: true },
    { name: 'tags', type: 'array', required: false },
    { name: 'metadata', type: 'object', required: false },
  ],
};

describe('custom type nodes', () => {
  const validator = generateNodesForCustomType(customType).find(({ typeId }) =>
    typeId.endsWith('/validate'),
  )!;

  it('validates required fields and their declared runtime types', () => {
    expect(validator.evaluate({ data: { count: 2, title: 'ok' } })).toEqual({
      isValid: true,
      instance: { count: 2, title: 'ok' },
    });
    expect(validator.evaluate({ data: { count: '2', title: 'wrong' } })).toEqual({
      isValid: false,
      instance: null,
    });
    expect(validator.evaluate({ data: { count: Number.NaN, title: 'wrong' } })).toEqual({
      isValid: false,
      instance: null,
    });
  });

  it('allows absent optional fields but validates them when present', () => {
    expect(validator.evaluate({ data: { count: 1, title: 'ok', tags: ['a'] } })).toMatchObject({
      isValid: true,
    });
    expect(validator.evaluate({ data: { count: 1, title: 'ok', tags: 'a' } })).toEqual({
      isValid: false,
      instance: null,
    });
    expect(validator.evaluate({ data: { count: 1, title: 'ok', metadata: [] } })).toEqual({
      isValid: false,
      instance: null,
    });
  });

  it.each([[null], [[]], ['value'], [1]])('rejects non-object input: %j', (data) => {
    expect(validator.evaluate({ data })).toEqual({ isValid: false, instance: null });
  });
});
