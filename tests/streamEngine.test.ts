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

    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  });
});
