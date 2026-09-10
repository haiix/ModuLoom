import debugSyncVariant from '@jitl/quickjs-wasmfile-debug-sync';
import { newQuickJSWASMModuleFromVariant, TestQuickJSWASMModule } from 'quickjs-emscripten-core';
import { describe, expect, it } from 'vitest';

import {
  evaluateCustomCodeInVm,
  evaluateCustomCodeWithModule,
  isFatalVmError,
} from '../src/engine/customCodeVm';

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

  it('does not expose browser capabilities through computed property access', async () => {
    const result = await evaluateCustomCodeInVm(
      `({
        direct: typeof document,
        computedDocument: typeof globalThis['doc' + 'ument'],
        computedFetch: typeof globalThis['fe' + 'tch'],
        computedStorage: typeof globalThis['local' + 'Storage']
      })`,
      {},
    );

    expect(JSON.parse(result)).toEqual({
      direct: 'undefined',
      computedDocument: 'undefined',
      computedFetch: 'undefined',
      computedStorage: 'undefined',
    });
  });

  it('interrupts synchronous infinite loops at the runtime CPU deadline', async () => {
    await expect(evaluateCustomCodeInVm('(() => { while (true) {} })()', {})).rejects.toThrow(
      /CPU実行時間が750msを超えたため停止/,
    );
  });

  it('propagates the runtime deadline after sleep resumes guest code', async () => {
    await expect(
      evaluateCustomCodeInVm('(async () => { await sleep(1); while (true) {} })()', {}),
    ).rejects.toThrow(/CPU実行時間が750msを超えたため停止/);
  });

  it.each([
    [
      'deep recursion',
      '(() => { const recurse = () => recurse(); return recurse(); })()',
      /stack上限 524288 bytes/,
    ],
    ['heap exhaustion', 'Array(20_000_000).fill("xxxxxxxxxxxxxxxx")', /out of memory/i],
  ])('converts %s into a fatal evaluation error', async (_case, code, expected) => {
    let failure: unknown;
    try {
      await evaluateCustomCodeInVm(code, {});
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(expected);
    expect(isFatalVmError(failure)).toBe(true);
  });

  it('creates isolated globals and prototypes for consecutive evaluations', async () => {
    await evaluateCustomCodeInVm(
      '(() => { globalThis.leaked = 42; Array.prototype.leaked = 42; return true; })()',
      {},
    );
    const result = await evaluateCustomCodeInVm(
      '({ global: typeof globalThis.leaked, prototype: typeof Array.prototype.leaked })',
      {},
    );

    expect(JSON.parse(result)).toEqual({ global: 'undefined', prototype: 'undefined' });
  });

  it('releases the runtime after an exception so the next evaluation succeeds', async () => {
    await expect(
      evaluateCustomCodeInVm('(() => { throw new Error("failure"); })()', {}),
    ).rejects.toThrow('failure');

    await expect(evaluateCustomCodeInVm('inputs.value', { value: 'recovered' })).resolves.toBe(
      '"recovered"',
    );
  });

  it('releases debug VM resources across more than 100 successes and failures', async () => {
    const module = new TestQuickJSWASMModule(
      await newQuickJSWASMModuleFromVariant(debugSyncVariant),
    );
    await evaluateCustomCodeWithModule(module, 'true', {});
    const warmedMemoryBytes = module.getWasmMemory().buffer.byteLength;
    for (let index = 0; index < 101; index += 1) {
      await expect(
        evaluateCustomCodeWithModule(module, 'inputs.value + 1', { value: index }),
      ).resolves.toBe(String(index + 1));
      await expect(
        evaluateCustomCodeWithModule(module, '(() => { throw new Error("expected"); })()', {}),
      ).rejects.toThrow('expected');
    }

    // quickjs-emscripten-core 0.32 retains disposed newRuntime() entries in this
    // wrapper's bookkeeping set, so verify their lifetime directly before asking
    // the debug build's recoverable leak sanitizer to inspect WASM allocations.
    expect([...module.runtimes].every((runtime) => !runtime.alive)).toBe(true);
    expect(module.getWasmMemory().buffer.byteLength).toBeLessThanOrEqual(warmedMemoryBytes);
    module.runtimes.clear();
    module.assertNoMemoryAllocated();
  }, 60_000);
});
