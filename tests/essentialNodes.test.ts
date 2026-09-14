import { describe, expect, it } from 'vitest';
import { BUILTIN_NODES } from '../src/nodes/definitions';

const definition = (typeId: string) => BUILTIN_NODES.find((node) => node.typeId === typeId)!;

describe('essential transformation nodes', () => {
  it('clamps values and rejects an inverted range', () => {
    const clamp = definition('math/clamp');
    expect(clamp.evaluate({ value: 12, min: 0, max: 10 })).toEqual({ result: 10 });
    expect(() => clamp.evaluate({ value: 5, min: 10, max: 0 })).toThrow(/DOMAIN_ERROR/);
  });

  it('trims surrounding whitespace without changing inner whitespace', () => {
    expect(definition('string/trim').evaluate({ text: '  hello world\n' })).toEqual({
      result: 'hello world',
    });
  });

  it('gets positive and negative array indices and rejects out-of-range indices', () => {
    const getItem = definition('array/get');
    expect(getItem.evaluate({ arr: ['a', 'b', 'c'], index: 1 })).toEqual({ result: 'b' });
    expect(getItem.evaluate({ arr: ['a', 'b', 'c'], index: -1 })).toEqual({ result: 'c' });
    expect(() => getItem.evaluate({ arr: ['a'], index: 1 })).toThrow(/DOMAIN_ERROR/);
  });

  it('returns only own enumerable object keys', () => {
    const inherited = Object.assign(Object.create({ inherited: true }), { own: 1 });
    expect(definition('object/keys').evaluate({ obj: inherited })).toEqual({ result: ['own'] });
  });

  it('converts numbers and strings with explicit invalid input behavior', () => {
    expect(definition('conversion/to-number').evaluate({ value: '12.5' })).toEqual({
      result: 12.5,
    });
    expect(() => definition('conversion/to-number').evaluate({ value: 'nope' })).toThrow(
      /INPUT_TYPE/,
    );
    expect(definition('conversion/to-string').evaluate({ value: false })).toEqual({
      result: 'false',
    });
  });

  it('parses JSON values and rejects malformed JSON', () => {
    const parseJson = definition('conversion/parse-json');
    expect(parseJson.evaluate({ text: '{"ok":true}' })).toEqual({ result: { ok: true } });
    expect(parseJson.evaluate({ text: '[1,2]' })).toEqual({ result: [1, 2] });
    expect(parseJson.evaluate({ text: 'true' })).toEqual({ result: true });
    expect(() => parseJson.evaluate({ text: '{' })).toThrow(/INPUT_TYPE/);
  });
});
