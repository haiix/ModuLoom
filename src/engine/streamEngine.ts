/**
 * Stream & AsyncIterator Utilities for ModuLoom
 * Provides AsyncIterable primitives, stream transformations, and stream consumers.
 */

export function isPromise(val: any): boolean {
  return Boolean(val && typeof val.then === 'function');
}

export function isAsyncIterable(val: any): boolean {
  return Boolean(val && typeof val[Symbol.asyncIterator] === 'function');
}

export interface StreamInstance<T = any> extends AsyncIterable<T> {
  isStream: true;
  streamName?: string;
  cancel?: () => void;
  [Symbol.asyncIterator](): AsyncIterator<T>;
}

/**
 * Creates an AsyncIterator that emits incrementing numbers [0, 1, 2, ...] at specified intervals.
 */
export function createIntervalStream(
  intervalMs: number = 500,
  maxLimit: number = 20
): StreamInstance<number> {
  let count = 0;
  let cancelled = false;

  return {
    isStream: true,
    streamName: `IntervalStream(${intervalMs}ms, limit=${maxLimit})`,
    cancel: () => {
      cancelled = true;
    },
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<number>> {
          if (cancelled || count >= maxLimit) {
            return { done: true, value: undefined };
          }
          await new Promise((r) => setTimeout(r, Math.max(20, intervalMs)));
          if (cancelled || count >= maxLimit) {
            return { done: true, value: undefined };
          }
          const val = count++;
          return { done: false, value: val };
        },
      };
    },
  };
}

/**
 * Creates an AsyncIterator from an array, emitting each item with delayMs between items.
 */
export function createArrayStream<T>(
  items: T[],
  delayMs: number = 300
): StreamInstance<T> {
  let index = 0;
  let cancelled = false;

  return {
    isStream: true,
    streamName: `ArrayStream(${items.length} items)`,
    cancel: () => {
      cancelled = true;
    },
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<T>> {
          if (cancelled || index >= items.length) {
            return { done: true, value: undefined };
          }
          if (delayMs > 0) {
            await new Promise((r) => setTimeout(r, delayMs));
          }
          if (cancelled || index >= items.length) {
            return { done: true, value: undefined };
          }
          const val = items[index++];
          return { done: false, value: val };
        },
      };
    },
  };
}

/**
 * Transforms an async iterable using a mapping function.
 */
export function mapStream<T, R>(
  source: AsyncIterable<T>,
  transform: (item: T) => R | Promise<R>
): StreamInstance<R> {
  return {
    isStream: true,
    streamName: 'MapStream',
    [Symbol.asyncIterator]() {
      const iterator = source[Symbol.asyncIterator]();
      return {
        async next(): Promise<IteratorResult<R>> {
          const res = await iterator.next();
          if (res.done) return { done: true, value: undefined };
          const mapped = await transform(res.value);
          return { done: false, value: mapped };
        },
      };
    },
  };
}

/**
 * Filters an async iterable using a predicate.
 */
export function filterStream<T>(
  source: AsyncIterable<T>,
  predicate: (item: T) => boolean | Promise<boolean>
): StreamInstance<T> {
  return {
    isStream: true,
    streamName: 'FilterStream',
    [Symbol.asyncIterator]() {
      const iterator = source[Symbol.asyncIterator]();
      return {
        async next(): Promise<IteratorResult<T>> {
          while (true) {
            const res = await iterator.next();
            if (res.done) return { done: true, value: undefined };
            const ok = await predicate(res.value);
            if (ok) {
              return { done: false, value: res.value };
            }
          }
        },
      };
    },
  };
}

/**
 * Limits an async iterable to the first count items.
 */
export function takeStream<T>(
  source: AsyncIterable<T>,
  count: number
): StreamInstance<T> {
  let taken = 0;
  return {
    isStream: true,
    streamName: `TakeStream(${count})`,
    [Symbol.asyncIterator]() {
      const iterator = source[Symbol.asyncIterator]();
      return {
        async next(): Promise<IteratorResult<T>> {
          if (taken >= count) {
            return { done: true, value: undefined };
          }
          const res = await iterator.next();
          if (res.done) return { done: true, value: undefined };
          taken++;
          return res;
        },
      };
    },
  };
}

/**
 * Consumes an AsyncIterable into an array, triggering onChunk on every emission.
 */
export async function collectStream<T>(
  source: AsyncIterable<T>,
  onChunk?: (item: T, currentArray: T[]) => void,
  maxItems: number = 100
): Promise<T[]> {
  const results: T[] = [];
  try {
    for await (const item of source) {
      results.push(item);
      onChunk?.(item, [...results]);
      if (results.length >= maxItems) break;
    }
  } catch (err) {
    console.warn('Stream collection error/interrupted:', err);
  }
  return results;
}
