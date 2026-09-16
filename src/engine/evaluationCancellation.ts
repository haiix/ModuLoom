export class EvaluationCancelledError extends Error {
  constructor(message = '評価がキャンセルされました。') {
    super(message);
    this.name = 'EvaluationCancelledError';
  }
}

export function isEvaluationCancelled(error: unknown): boolean {
  return (
    error instanceof EvaluationCancelledError ||
    (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')
  );
}

export function throwIfEvaluationCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new EvaluationCancelledError();
}

export function raceWithEvaluationCancellation<T>(
  value: PromiseLike<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return Promise.resolve(value);
  if (signal.aborted) return Promise.reject(new EvaluationCancelledError());

  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(new EvaluationCancelledError());
    };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(value).then(
      (result) => {
        cleanup();
        resolve(result);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  throwIfEvaluationCancelled(signal);
  return new Promise((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    const abort = () => {
      globalThis.clearTimeout(timeoutId);
      cleanup();
      reject(new EvaluationCancelledError());
    };
    const cleanup = () => signal?.removeEventListener('abort', abort);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
