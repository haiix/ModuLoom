import { describe, expect, it } from 'vitest';

import { evaluateCustomCodeInVm } from '../src/engine/customCodeVm';

describe('QuickJS custom code VM', () => {
  it('evaluates expressions and QuickJS promises through a JSON boundary', async () => {
    const result = await evaluateCustomCodeInVm('Promise.resolve({ answer: inputs.value * 2 })', {
      value: 21,
    });

    expect(JSON.parse(result)).toEqual({ answer: 42 });
  });

  it('supports async expressions through the bounded sleep bridge', async () => {
    const result = await evaluateCustomCodeInVm(
      '(async () => { await sleep(5); return inputs.value + 1; })()',
      { value: 41 },
    );

    expect(JSON.parse(result)).toBe(42);
  });

  it('rejects sleep durations outside the bounded bridge contract', async () => {
    await expect(evaluateCustomCodeInVm('sleep(1001)', {})).rejects.toThrow(
      'sleepの待機時間は0から1000msで指定してください',
    );
  });

  it.each([
    ['undefined', /戻り値はJSONとしてシリアライズ可能/],
    ['1n', /bigint/i],
    ['(() => { const value = {}; value.self = value; return value; })()', /circular/i],
  ])('defines JSON boundary failures for %s', async (code, expected) => {
    await expect(evaluateCustomCodeInVm(code, {})).rejects.toThrow(expected);
  });

  it('preserves thrown and rejected error messages', async () => {
    await expect(
      evaluateCustomCodeInVm('Promise.reject(new Error("rejected"))', {}),
    ).rejects.toThrow('rejected');
    await expect(evaluateCustomCodeInVm('(() => { throw "thrown"; })()', {})).rejects.toThrow(
      'thrown',
    );
  });

  it('does not expose browser or host module capabilities', async () => {
    const result = await evaluateCustomCodeInVm(
      `({
        document: typeof document,
        fetch: typeof fetch,
        worker: typeof Worker,
        require: typeof require,
        process: typeof process
      })`,
      {},
    );

    expect(JSON.parse(result)).toEqual({
      document: 'undefined',
      fetch: 'undefined',
      worker: 'undefined',
      require: 'undefined',
      process: 'undefined',
    });
  });

  it('creates isolated globals for consecutive evaluations', async () => {
    await evaluateCustomCodeInVm('(() => { globalThis.leaked = 42; return true; })()', {});
    const result = await evaluateCustomCodeInVm('typeof globalThis.leaked', {});

    expect(JSON.parse(result)).toBe('undefined');
  });

  it('releases the runtime after an exception so the next evaluation succeeds', async () => {
    await expect(
      evaluateCustomCodeInVm('(() => { throw new Error("failure"); })()', {}),
    ).rejects.toThrow('failure');

    await expect(evaluateCustomCodeInVm('inputs.value', { value: 'recovered' })).resolves.toBe(
      '"recovered"',
    );
  });
});
