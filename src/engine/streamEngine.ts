import {
  abortableDelay,
  isEvaluationCancelled,
  raceWithEvaluationCancellation,
  throwIfEvaluationCancelled,
} from './evaluationCancellation';

/** Stream & AsyncIterator utilities with cooperative cancellation and deterministic cleanup. */

export function isPromise(val: any): boolean {
  return Boolean(val && typeof val.then === 'function');
}

export function isAsyncIterable(val: any): boolean {
  return Boolean(val && typeof val[Symbol.asyncIterator] === 'function');
}

export interface StreamInstance<T = any> extends AsyncIterable<T> {
  isStream: true;
  streamName?: string;
  cancel?: () => void | Promise<void>;
  [Symbol.asyncIterator](): AsyncIterator<T>;
}

type CancelableAsyncIterable<T> = AsyncIterable<T> & {
  cancel?: () => void | Promise<void>;
};

function createStreamCloser<T>(
  source: CancelableAsyncIterable<T>,
  iterator: AsyncIterator<T>,
  signal?: AbortSignal,
): () => Promise<void> {
  let closing: Promise<void> | undefined;
  const abort = () => void close();
  function close(): Promise<void> {
    if (!closing) {
      signal?.removeEventListener('abort', abort);
      closing = Promise.allSettled([
        Promise.resolve().then(() => source.cancel?.()),
        Promise.resolve().then(() => iterator.return?.()),
      ]).then(() => undefined);
    }
    return closing;
  }
  if (signal?.aborted) void close();
  else signal?.addEventListener('abort', abort, { once: true });
  return close;
}

function createStreamAbortController(signal?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  let finished = false;
  return {
    signal: controller.signal,
    cancel() {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', abort);
      controller.abort();
    },
    finish() {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', abort);
    },
  };
}

/**
 * Creates an AsyncIterator that emits incrementing numbers [0, 1, 2, ...] at specified intervals.
 */
export function createIntervalStream(
  intervalMs: number = 500,
  maxLimit: number = 20,
  signal?: AbortSignal,
): StreamInstance<number> {
  let count = 0;
  const cancellation = createStreamAbortController(signal);

  return {
    isStream: true,
    streamName: `IntervalStream(${intervalMs}ms, limit=${maxLimit})`,
    cancel: () => cancellation.cancel(),
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<number>> {
          throwIfEvaluationCancelled(cancellation.signal);
          if (count >= maxLimit) {
            cancellation.finish();
            return { done: true, value: undefined };
          }
          await abortableDelay(Math.max(20, intervalMs), cancellation.signal);
          throwIfEvaluationCancelled(cancellation.signal);
          const val = count++;
          return { done: false, value: val };
        },
        async return() {
          cancellation.cancel();
          return { done: true, value: undefined };
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
  delayMs: number = 300,
  signal?: AbortSignal,
): StreamInstance<T> {
  let index = 0;
  const cancellation = createStreamAbortController(signal);

  return {
    isStream: true,
    streamName: `ArrayStream(${items.length} items)`,
    cancel: () => cancellation.cancel(),
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<T>> {
          throwIfEvaluationCancelled(cancellation.signal);
          if (index >= items.length) {
            cancellation.finish();
            return { done: true, value: undefined };
          }
          if (delayMs > 0) {
            await abortableDelay(delayMs, cancellation.signal);
          }
          throwIfEvaluationCancelled(cancellation.signal);
          const val = items[index++];
          return { done: false, value: val };
        },
        async return() {
          cancellation.cancel();
          return { done: true, value: undefined };
        },
      };
    },
  };
}

/**
 * Transforms an async iterable using a mapping function.
 */
export function mapStream<T, R>(
  source: CancelableAsyncIterable<T>,
  transform: (item: T) => R | Promise<R>,
  signal?: AbortSignal,
): StreamInstance<R> {
  const iterator = source[Symbol.asyncIterator]();
  const close = createStreamCloser(source, iterator, signal);
  return {
    isStream: true,
    streamName: 'MapStream',
    cancel: () => close(),
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<R>> {
          try {
            throwIfEvaluationCancelled(signal);
            const res = await raceWithEvaluationCancellation(iterator.next(), signal);
            if (res.done) return { done: true, value: undefined };
            const mapped = await raceWithEvaluationCancellation(
              Promise.resolve(transform(res.value)),
              signal,
            );
            return { done: false, value: mapped };
          } catch (error) {
            const cleanup = close();
            if (!signal?.aborted && !isEvaluationCancelled(error)) await cleanup;
            throw error;
          }
        },
        async return() {
          await close();
          return { done: true, value: undefined };
        },
      };
    },
  };
}

/**
 * Filters an async iterable using a predicate.
 */
export function filterStream<T>(
  source: CancelableAsyncIterable<T>,
  predicate: (item: T) => boolean | Promise<boolean>,
  signal?: AbortSignal,
): StreamInstance<T> {
  const iterator = source[Symbol.asyncIterator]();
  const close = createStreamCloser(source, iterator, signal);
  return {
    isStream: true,
    streamName: 'FilterStream',
    cancel: () => close(),
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<T>> {
          try {
            while (true) {
              throwIfEvaluationCancelled(signal);
              const res = await raceWithEvaluationCancellation(iterator.next(), signal);
              if (res.done) return { done: true, value: undefined };
              const ok = await raceWithEvaluationCancellation(
                Promise.resolve(predicate(res.value)),
                signal,
              );
              if (ok) return { done: false, value: res.value };
            }
          } catch (error) {
            const cleanup = close();
            if (!signal?.aborted && !isEvaluationCancelled(error)) await cleanup;
            throw error;
          }
        },
        async return() {
          await close();
          return { done: true, value: undefined };
        },
      };
    },
  };
}

/**
 * Limits an async iterable to the first count items.
 */
export function takeStream<T>(
  source: CancelableAsyncIterable<T>,
  count: number,
  signal?: AbortSignal,
): StreamInstance<T> {
  let taken = 0;
  const iterator = source[Symbol.asyncIterator]();
  const close = createStreamCloser(source, iterator, signal);
  return {
    isStream: true,
    streamName: `TakeStream(${count})`,
    cancel: () => close(),
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<T>> {
          try {
            throwIfEvaluationCancelled(signal);
            if (taken >= count) {
              await close();
              return { done: true, value: undefined };
            }
            const res = await raceWithEvaluationCancellation(iterator.next(), signal);
            if (res.done) return { done: true, value: undefined };
            taken++;
            return res;
          } catch (error) {
            const cleanup = close();
            if (!signal?.aborted && !isEvaluationCancelled(error)) await cleanup;
            throw error;
          }
        },
        async return() {
          await close();
          return { done: true, value: undefined };
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
  maxItems: number = 100,
  signal?: AbortSignal,
): Promise<T[]> {
  const results: T[] = [];
  const cancelableSource = source as CancelableAsyncIterable<T>;
  const iterator = source[Symbol.asyncIterator]();
  const close = createStreamCloser(cancelableSource, iterator, signal);
  let cancelled = false;
  try {
    while (results.length < maxItems) {
      throwIfEvaluationCancelled(signal);
      const item = await raceWithEvaluationCancellation(iterator.next(), signal);
      if (item.done) break;
      throwIfEvaluationCancelled(signal);
      results.push(item.value);
      onChunk?.(item.value, [...results]);
    }
  } catch (error) {
    cancelled = signal?.aborted === true || isEvaluationCancelled(error);
    throw error;
  } finally {
    const cleanup = close();
    if (!cancelled && !signal?.aborted) await cleanup;
  }
  return results;
}
