import { describe, expect, it } from 'vitest';

import { evaluateCustomCodeInVm } from '../src/engine/customCodeVm';

describe('QuickJS custom code VM', () => {
  it('evaluates expressions and QuickJS promises through a JSON boundary', async () => {
    const result = await evaluateCustomCodeInVm('Promise.resolve({ answer: inputs.value * 2 })', {
      value: 21,
    });

    expect(JSON.parse(result)).toEqual({ answer: 42 });
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
