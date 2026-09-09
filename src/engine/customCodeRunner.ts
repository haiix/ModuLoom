import type { NodeDefinition } from '../types';

export const CUSTOM_CODE_TIMEOUT_MS = 1_000;
export const CUSTOM_CODE_MAX_RESULT_BYTES = 1_048_576;

const FORBIDDEN_TOKENS = [
  'document',
  'window',
  'globalThis',
  'self',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'importScripts',
  'indexedDB',
  'localStorage',
  'sessionStorage',
  'caches',
  'navigator',
  'location',
  'postMessage',
  'Worker',
  'SharedWorker',
  'Function',
  'eval',
  'constructor',
  '__proto__',
  'prototype',
  'Atomics',
  'SharedArrayBuffer',
] as const;

export class CustomCodeExecutionError extends Error {
  constructor(message: string) {
    super(`カスタム関数エラー: ${message}`);
    this.name = 'CustomCodeExecutionError';
  }
}

export function validateCustomCode(code: string): void {
  if (/\\(?:u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2})/.test(code)) {
    throw new CustomCodeExecutionError('識別子を隠すUnicode/16進エスケープは使用できません。');
  }
  if (/\b(?:import|require)\s*\(/.test(code)) {
    throw new CustomCodeExecutionError('モジュールの読み込みは禁止されています。');
  }
  for (const token of FORBIDDEN_TOKENS) {
    const pattern = new RegExp(`(?<![\\w$.])${token}\\b`);
    if (
      pattern.test(code) ||
      ['constructor', '__proto__', 'prototype'].some((key) => key === token && code.includes(token))
    ) {
      throw new CustomCodeExecutionError(`禁止されたAPIまたは構文 '${token}' は使用できません。`);
    }
  }
  try {
    new Function('inputs', `return (${code});`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CustomCodeExecutionError(`式の構文エラー: ${message}`);
  }
}

interface WorkerMessage {
  ok: boolean;
  value?: unknown;
  error?: string;
}

interface WorkerLike {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(value: unknown): void;
  terminate(): void;
}

interface ExecuteOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxResultBytes?: number;
  workerFactory?: (url: string) => WorkerLike;
}

export function executeCustomCode(
  code: string,
  inputs: Record<string, unknown>,
  options: ExecuteOptions = {},
): Promise<unknown> {
  validateCustomCode(code);
  const timeoutMs = options.timeoutMs ?? CUSTOM_CODE_TIMEOUT_MS;
  const maxResultBytes = options.maxResultBytes ?? CUSTOM_CODE_MAX_RESULT_BYTES;
  if (options.signal?.aborted) {
    return Promise.reject(new CustomCodeExecutionError('実行がキャンセルされました。'));
  }

  const workerSource = createWorkerSource();
  const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  let worker: WorkerLike;
  try {
    worker = options.workerFactory
      ? options.workerFactory(workerUrl)
      : (new Worker(workerUrl) as WorkerLike);
  } catch (error) {
    URL.revokeObjectURL(workerUrl);
    const message = error instanceof Error ? error.message : String(error);
    return Promise.reject(new CustomCodeExecutionError(`Workerを開始できませんでした: ${message}`));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      options.signal?.removeEventListener('abort', handleAbort);
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      callback();
    };
    const handleAbort = () =>
      finish(() => reject(new CustomCodeExecutionError('実行がキャンセルされました。')));
    const timeoutId = globalThis.setTimeout(
      () =>
        finish(() =>
          reject(
            new CustomCodeExecutionError(`実行時間が${timeoutMs}msを超えたため停止しました。`),
          ),
        ),
      timeoutMs,
    );
    options.signal?.addEventListener('abort', handleAbort, { once: true });
    worker.onmessage = (event) => {
      if (event.data.ok) finish(() => resolve(event.data.value));
      else
        finish(() =>
          reject(new CustomCodeExecutionError(event.data.error ?? '式の実行に失敗しました。')),
        );
    };
    worker.onerror = (event) =>
      finish(() =>
        reject(new CustomCodeExecutionError(event.message || 'Workerでエラーが発生しました。')),
      );
    try {
      worker.postMessage({ code, inputs, maxResultBytes });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finish(() =>
        reject(new CustomCodeExecutionError(`入力をWorkerへ送信できません: ${message}`)),
      );
    }
  });
}

export function createCustomNodeEvaluator(
  code: string,
  outputPortId: string,
): NodeDefinition['evaluate'] {
  return async (inputs, _state, context) => ({
    [outputPortId]: await executeCustomCode(code, inputs, { signal: context?.signal }),
  });
}

function createWorkerSource() {
  return `
self.onmessage = async (event) => {
  const { code, inputs, maxResultBytes } = event.data;
  try {
    const run = new Function('inputs', '"use strict"; return (' + code + ');');
    const value = await run(inputs);
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new Error('戻り値はJSONとしてシリアライズ可能である必要があります。');
    const size = new TextEncoder().encode(serialized).byteLength;
    if (size > maxResultBytes) throw new Error('返却データが上限 ' + maxResultBytes + ' bytes を超えました。');
    self.postMessage({ ok: true, value: JSON.parse(serialized) });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};`;
}
