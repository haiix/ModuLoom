import { describe, expect, it, vi } from 'vitest';
import {
  CustomCodeExecutionError,
  executeCustomCode,
  validateCustomCode,
} from '../src/engine/customCodeRunner';
import { evaluateGraphAsync } from '../src/engine/dagEngine';
import type { NodeDefinition } from '../src/types';

class FakeWorker {
  onmessage:
    ((event: MessageEvent<{ ok: boolean; value?: unknown; error?: string }>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;

  constructor(private readonly respond?: (worker: FakeWorker, value: unknown) => void) {}

  postMessage(value: unknown) {
    this.respond?.(this, value);
  }

  terminate() {
    this.terminated = true;
  }
}

describe('custom code runner', () => {
  it('allows expressions and Promise results', async () => {
    validateCustomCode('Promise.resolve(inputs.value * 2)');
    const worker = new FakeWorker((target) =>
      queueMicrotask(() =>
        target.onmessage?.({ data: { ok: true, value: { answer: 4 } } } as MessageEvent),
      ),
    );
    await expect(
      executeCustomCode(
        'Promise.resolve(inputs.value * 2)',
        { value: 2 },
        {
          workerFactory: () => worker,
        },
      ),
    ).resolves.toEqual({ answer: 4 });
    expect(worker.terminated).toBe(true);
  });

  it.each(['document.body', 'fetch("/api")', 'inputs.constructor'])(
    'rejects forbidden access: %s',
    (code) => expect(() => validateCustomCode(code)).toThrowError(/禁止されたAPIまたは構文/),
  );

  it('terminates an unresponsive worker at the time limit', async () => {
    const worker = new FakeWorker();
    await expect(
      executeCustomCode(
        '(() => { while (true) {} })()',
        {},
        {
          timeoutMs: 5,
          workerFactory: () => worker,
        },
      ),
    ).rejects.toThrowError(/実行時間が5msを超えたため停止/);
    expect(worker.terminated).toBe(true);
  });

  it('terminates the worker when aborted', async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const execution = executeCustomCode(
      'new Promise(() => {})',
      {},
      {
        signal: controller.signal,
        workerFactory: () => worker,
      },
    );
    controller.abort();
    await expect(execution).rejects.toThrowError(/実行がキャンセルされました/);
    expect(worker.terminated).toBe(true);
  });

  it('revokes the worker URL when worker creation fails', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    await expect(
      executeCustomCode(
        'inputs.value',
        { value: 1 },
        {
          workerFactory: () => {
            throw new Error('unavailable');
          },
        },
      ),
    ).rejects.toThrowError(/Workerを開始できませんでした: unavailable/);
    expect(revokeSpy).toHaveBeenCalledOnce();
    revokeSpy.mockRestore();
  });

  it('rejects a result-size error reported by the worker', async () => {
    const worker = new FakeWorker((target) =>
      queueMicrotask(() =>
        target.onmessage?.({
          data: { ok: false, error: '返却データが上限 10 bytes を超えました。' },
        } as MessageEvent),
      ),
    );
    await expect(
      executeCustomCode(
        'inputs.value',
        { value: 'large' },
        {
          maxResultBytes: 10,
          workerFactory: () => worker,
        },
      ),
    ).rejects.toThrowError(/返却データが上限 10 bytes を超えました/);
  });

  it('surfaces isolated execution errors on the target node', async () => {
    const definition: NodeDefinition = {
      typeId: 'custom/failing',
      label: 'Failing',
      category: 'Custom',
      kind: 'pure',
      inputs: [],
      outputs: [{ id: 'result', name: 'result', type: 'number' }],
      isAsync: true,
      evaluate: async () => {
        throw new CustomCodeExecutionError('禁止された操作です。');
      },
    };
    const result = await evaluateGraphAsync(
      [{ id: 'node', typeId: definition.typeId, x: 0, y: 0 }],
      [],
      new Map([[definition.typeId, definition]]),
    );
    expect(result.node.error).toBe('カスタム関数エラー: 禁止された操作です。');
  });

  it('passes graph cancellation into an executing node', async () => {
    let cancelled = false;
    const definition: NodeDefinition = {
      typeId: 'custom/pending',
      label: 'Pending',
      category: 'Custom',
      kind: 'pure',
      inputs: [],
      outputs: [{ id: 'result', name: 'result', type: 'number' }],
      isAsync: true,
      evaluate: (_inputs, _state, context) =>
        new Promise((_resolve, reject) =>
          context?.signal?.addEventListener('abort', () => reject(new Error('cancelled'))),
        ),
    };
    globalThis.setTimeout(() => {
      cancelled = true;
    }, 0);
    const result = await evaluateGraphAsync(
      [{ id: 'node', typeId: definition.typeId, x: 0, y: 0 }],
      [],
      new Map([[definition.typeId, definition]]),
      undefined,
      undefined,
      undefined,
      () => cancelled,
    );
    expect(result.node.error).toBe('cancelled');
  });
});
