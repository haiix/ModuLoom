import { parse } from 'acorn';

import type { NodeDefinition } from '../types';
import { CUSTOM_CODE_MAX_RESULT_BYTES, CUSTOM_CODE_TIMEOUT_MS } from './customCodePolicy';

export { CUSTOM_CODE_MAX_RESULT_BYTES, CUSTOM_CODE_TIMEOUT_MS } from './customCodePolicy';

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
  'setTimeout',
  'setInterval',
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
    parse(`(${code}\n)`, { ecmaVersion: 'latest' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CustomCodeExecutionError(`式の構文エラー: ${message}`);
  }
}

interface WorkerMessage {
  id: number;
  ok: boolean;
  fatal?: boolean;
  value?: unknown;
  error?: string;
}

interface WorkerLike {
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(value: unknown): void;
  terminate(): void;
}

type WorkerFactory = (url: URL, options: WorkerOptions) => WorkerLike;

interface ExecuteOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxResultBytes?: number;
  workerFactory?: WorkerFactory;
}

interface QueuedEvaluation {
  id: number;
  code: string;
  inputs: Record<string, unknown>;
  timeoutMs: number;
  maxResultBytes: number;
  signal?: AbortSignal;
  resolve(value: unknown): void;
  reject(error: CustomCodeExecutionError): void;
  handleAbort?: () => void;
  timeoutId?: ReturnType<typeof setTimeout>;
}

class CustomCodeWorkerQueue {
  private worker: WorkerLike | undefined;
  private active: QueuedEvaluation | undefined;
  private readonly pending: QueuedEvaluation[] = [];
  private nextId = 1;

  constructor(private readonly workerFactory?: WorkerFactory) {}

  execute(
    code: string,
    inputs: Record<string, unknown>,
    options: Omit<ExecuteOptions, 'workerFactory'>,
  ): Promise<unknown> {
    if (options.signal?.aborted) {
      return Promise.reject(new CustomCodeExecutionError('実行がキャンセルされました。'));
    }
    return new Promise((resolve, reject) => {
      this.pending.push({
        id: this.nextId++,
        code,
        inputs,
        timeoutMs: options.timeoutMs ?? CUSTOM_CODE_TIMEOUT_MS,
        maxResultBytes: options.maxResultBytes ?? CUSTOM_CODE_MAX_RESULT_BYTES,
        signal: options.signal,
        resolve,
        reject,
      });
      this.pump();
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = undefined;
  }

  private createWorker(): WorkerLike {
    const worker = this.workerFactory
      ? this.workerFactory(new URL('./customCodeWorker.ts', import.meta.url), { type: 'module' })
      : new Worker(new URL('./customCodeWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => this.handleMessage(event.data);
    worker.onerror = (event) =>
      this.finish(
        new CustomCodeExecutionError(event.message || 'Workerでエラーが発生しました。'),
        undefined,
        true,
      );
    return worker;
  }

  private pump(): void {
    if (this.active) return;
    const evaluation = this.pending.shift();
    if (!evaluation) return;
    this.active = evaluation;
    if (evaluation.signal?.aborted) {
      this.finish(new CustomCodeExecutionError('実行がキャンセルされました。'));
      return;
    }
    try {
      this.worker ??= this.createWorker();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finish(new CustomCodeExecutionError(`Workerを開始できませんでした: ${message}`));
      return;
    }

    evaluation.handleAbort = () =>
      this.finish(new CustomCodeExecutionError('実行がキャンセルされました。'), undefined, true);
    evaluation.signal?.addEventListener('abort', evaluation.handleAbort, { once: true });
    evaluation.timeoutId = globalThis.setTimeout(
      () =>
        this.finish(
          new CustomCodeExecutionError(
            `実行時間が${evaluation.timeoutMs}msを超えたため停止しました。`,
          ),
          undefined,
          true,
        ),
      evaluation.timeoutMs,
    );

    try {
      this.worker.postMessage({
        id: evaluation.id,
        code: evaluation.code,
        inputs: evaluation.inputs,
        maxResultBytes: evaluation.maxResultBytes,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.finish(
        new CustomCodeExecutionError(`入力をWorkerへ送信できません: ${message}`),
        undefined,
        true,
      );
    }
  }

  private handleMessage(message: WorkerMessage): void {
    if (!this.active || message.id !== this.active.id) return;
    if (message.ok) this.finish(undefined, message.value);
    else
      this.finish(
        new CustomCodeExecutionError(message.error ?? '式の実行に失敗しました。'),
        undefined,
        message.fatal,
      );
  }

  private finish(error?: CustomCodeExecutionError, value?: unknown, resetWorker = false): void {
    const evaluation = this.active;
    if (!evaluation) return;
    this.active = undefined;
    if (evaluation.timeoutId !== undefined) globalThis.clearTimeout(evaluation.timeoutId);
    if (evaluation.handleAbort)
      evaluation.signal?.removeEventListener('abort', evaluation.handleAbort);
    if (resetWorker) this.dispose();
    if (error) evaluation.reject(error);
    else evaluation.resolve(value);
    queueMicrotask(() => this.pump());
  }
}

const sharedWorkerQueue = new CustomCodeWorkerQueue();

export function executeCustomCode(
  code: string,
  inputs: Record<string, unknown>,
  options: ExecuteOptions = {},
): Promise<unknown> {
  validateCustomCode(code);
  if (options.workerFactory) {
    const queue = new CustomCodeWorkerQueue(options.workerFactory);
    return queue.execute(code, inputs, options).finally(() => queue.dispose());
  }
  return sharedWorkerQueue.execute(code, inputs, options);
}

export function disposeCustomCodeWorker(): void {
  sharedWorkerQueue.dispose();
}

export function createCustomNodeEvaluator(
  code: string,
  outputPortId: string,
): NodeDefinition['evaluate'] {
  return async (inputs, _state, context) => ({
    [outputPortId]: await executeCustomCode(code, inputs, { signal: context?.signal }),
  });
}
