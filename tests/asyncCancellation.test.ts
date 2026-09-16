import { afterEach, describe, expect, it, vi } from 'vitest';

import { evaluateGraphAsync } from '../src/engine/dagEngine';
import { EvaluationCancelledError } from '../src/engine/evaluationCancellation';
import { createArrayStream } from '../src/engine/streamEngine';
import { ASYNC_STREAM_NODES } from '../src/nodes/asyncStreamNodes';
import type { NodeDefinition } from '../src/types';

function getNode(typeId: string): NodeDefinition {
  const definition = ASYNC_STREAM_NODES.find((candidate) => candidate.typeId === typeId);
  if (!definition) throw new Error(`Missing test definition: ${typeId}`);
  return definition;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('built-in Promise cancellation', () => {
  it.each([
    ['async/delay', { value: 'late', delayMs: 5_000 }],
    ['async/fetch', { endpoint: '/slow', latency: 5_000 }],
  ])('clears the active %s timer on abort', async (typeId, inputs) => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const evaluation = Promise.resolve(
      getNode(typeId).evaluate(inputs, undefined, { signal: controller.signal }),
    );
    expect(vi.getTimerCount()).toBe(1);

    controller.abort();

    await expect(evaluation).rejects.toBeInstanceOf(EvaluationCancelledError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['async/await', { promise: new Promise(() => undefined) }],
    ['async/all', { p1: new Promise(() => undefined), p2: new Promise(() => undefined) }],
  ])('stops waiting in %s on abort', async (typeId, inputs) => {
    const controller = new AbortController();
    const evaluation = Promise.resolve(
      getNode(typeId).evaluate(inputs, undefined, { signal: controller.signal }),
    );

    controller.abort();

    await expect(evaluation).rejects.toBeInstanceOf(EvaluationCancelledError);
  });

  it('rejects an already-aborted synchronous Promise node', () => {
    const controller = new AbortController();
    controller.abort();

    expect(() =>
      getNode('async/resolve').evaluate({ value: 1 }, undefined, {
        signal: controller.signal,
      }),
    ).toThrow(EvaluationCancelledError);
  });
});

describe('graph cancellation', () => {
  it('does not record abort as a node failure or publish a stale result', async () => {
    let resolveEvaluation!: (value: Record<string, unknown>) => void;
    const definition: NodeDefinition = {
      typeId: 'async/pending-test',
      label: 'Pending test',
      category: 'Async',
      kind: 'pure',
      isAsync: true,
      inputs: [],
      outputs: [{ id: 'value', name: 'value', type: 'number' }],
      evaluate: () =>
        new Promise((resolve) => {
          resolveEvaluation = resolve;
        }),
    };
    const controller = new AbortController();
    const onProgress = vi.fn();
    const running = evaluateGraphAsync(
      [{ id: 'pending', typeId: definition.typeId, x: 0, y: 0 }],
      [],
      new Map([[definition.typeId, definition]]),
      undefined,
      undefined,
      onProgress,
      controller.signal,
    );
    await Promise.resolve();

    controller.abort();

    await expect(running).resolves.toEqual({});
    resolveEvaluation({ value: 42 });
    await Promise.resolve();
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenLastCalledWith(
      'pending',
      expect.objectContaining({ isPending: true }),
    );
  });
});

describe('built-in Stream cancellation', () => {
  it.each([
    ['stream/interval', { intervalMs: 5_000, limit: 2 }],
    ['stream/from_array', { items: [1, 2], delayMs: 5_000 }],
    ['stream/map', { stream: createArrayStream([1], 0), multiplier: 2 }],
    ['stream/filter', { stream: createArrayStream([1], 0), threshold: 0 }],
    ['stream/take', { stream: createArrayStream([1], 0), count: 1 }],
  ])('passes AbortSignal through %s', async (typeId, inputs) => {
    const controller = new AbortController();
    const outputs = await getNode(typeId).evaluate(inputs, undefined, {
      signal: controller.signal,
    });
    const stream = outputs.stream as AsyncIterable<unknown>;
    controller.abort();

    await expect(stream[Symbol.asyncIterator]().next()).rejects.toBeInstanceOf(
      EvaluationCancelledError,
    );
  });

  it('passes AbortSignal into the collect node', async () => {
    const controller = new AbortController();
    const source = {
      [Symbol.asyncIterator]() {
        return { next: () => new Promise<IteratorResult<number>>(() => undefined) };
      },
    };
    const evaluation = Promise.resolve(
      getNode('stream/collect').evaluate({ stream: source }, undefined, {
        signal: controller.signal,
      }),
    );
    await Promise.resolve();

    controller.abort();

    await expect(evaluation).rejects.toBeInstanceOf(EvaluationCancelledError);
  });
});
