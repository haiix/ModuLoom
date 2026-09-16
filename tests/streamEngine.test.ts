import { describe, expect, it, vi } from 'vitest';

import {
  collectStream,
  createArrayStream,
  createIntervalStream,
  filterStream,
  isAsyncIterable,
  isPromise,
  mapStream,
  takeStream,
} from '../src/engine/streamEngine';
import { EvaluationCancelledError } from '../src/engine/evaluationCancellation';

describe('stream type guards', () => {
  it('PromiseとAsyncIterableを判定する', () => {
    expect(isPromise(Promise.resolve('ok'))).toBe(true);
    expect(isPromise('ok')).toBe(false);
    expect(isAsyncIterable(createArrayStream([], 0))).toBe(true);
  });
});

describe('stream transformations', () => {
  it('map、filter、takeを順に適用する', async () => {
    const source = createArrayStream([1, 2, 3, 4, 5], 0);
    const mapped = mapStream(source, (value) => value * 10);
    const filtered = filterStream(mapped, (value) => value >= 20);
    const limited = takeStream(filtered, 3);

    await expect(collectStream(limited)).resolves.toEqual([20, 30, 40]);
  });

  it('最大収集件数とチャンク通知を尊重する', async () => {
    const onChunk = vi.fn();
    const result = await collectStream(createArrayStream([1, 2, 3, 4], 0), onChunk, 2);

    expect(result).toEqual([1, 2]);
    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk).toHaveBeenLastCalledWith(2, [1, 2]);
  });

  it('Interval Streamをキャンセルできる', async () => {
    const stream = createIntervalStream(0, 3);
    const iterator = stream[Symbol.asyncIterator]();

    stream.cancel?.();

    await expect(iterator.next()).rejects.toBeInstanceOf(EvaluationCancelledError);
  });

  it('abort時に古いチャンクを通知せずcancelとiterator.returnを一度だけ呼ぶ', async () => {
    const cancel = vi.fn();
    const returnIterator = vi.fn(async () => ({ done: true as const, value: undefined }));
    let resolveNext!: (result: IteratorResult<number>) => void;
    const source = {
      cancel,
      [Symbol.asyncIterator]() {
        return {
          next: () =>
            new Promise<IteratorResult<number>>((resolve) => {
              resolveNext = resolve;
            }),
          return: returnIterator,
        };
      },
    };
    const controller = new AbortController();
    const onChunk = vi.fn();
    const collecting = collectStream(source, onChunk, 10, controller.signal);
    await Promise.resolve();

    controller.abort();

    await expect(collecting).rejects.toBeInstanceOf(EvaluationCancelledError);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(returnIterator).toHaveBeenCalledTimes(1);
    resolveNext({ done: false, value: 99 });
    await Promise.resolve();
    expect(onChunk).not.toHaveBeenCalled();
  });

  it('変換Streamのabortを上流へ一度だけ伝播する', async () => {
    const cancel = vi.fn();
    const returnIterator = vi.fn(async () => ({ done: true as const, value: undefined }));
    const source = {
      cancel,
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise<IteratorResult<number>>(() => undefined),
          return: returnIterator,
        };
      },
    };
    const controller = new AbortController();
    const pipeline = takeStream(
      filterStream(
        mapStream(
          source as AsyncIterable<number> & { cancel: () => void },
          (value) => value * 2,
          controller.signal,
        ),
        (value) => value > 0,
        controller.signal,
      ),
      2,
      controller.signal,
    );
    const collecting = collectStream(pipeline, undefined, 10, controller.signal);
    await Promise.resolve();

    controller.abort();

    await expect(collecting).rejects.toBeInstanceOf(EvaluationCancelledError);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(returnIterator).toHaveBeenCalledTimes(1);
  });
});
