import releaseSyncVariant from '@jitl/quickjs-wasmfile-release-sync';
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSContext,
  type QuickJSDeferredPromise,
  type QuickJSHandle,
  type QuickJSRuntime,
  type QuickJSWASMModule,
} from 'quickjs-emscripten-core';

import {
  CUSTOM_CODE_CPU_TIMEOUT_MS,
  CUSTOM_CODE_MAX_HEAP_BYTES,
  CUSTOM_CODE_MAX_SLEEP_MS,
  CUSTOM_CODE_MAX_STACK_BYTES,
} from './customCodePolicy';

let modulePromise: ReturnType<typeof newQuickJSWASMModuleFromVariant> | undefined;

function getQuickJsModule() {
  return (modulePromise ??= newQuickJSWASMModuleFromVariant(releaseSyncVariant));
}

export async function initializeCustomCodeVm(): Promise<void> {
  await getQuickJsModule();
}

export function isFatalVmError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /CPU実行時間|out of memory|memory limit|stack上限|stack overflow|Maximum call stack|Aborted\(Assertion failed/i.test(
    message,
  );
}

function normalizeVmError(error: unknown): unknown {
  const message = error instanceof Error ? error.message : String(error);
  if (/stack overflow|Maximum call stack/i.test(message)) {
    return new Error(`QuickJSのstack上限 ${CUSTOM_CODE_MAX_STACK_BYTES} bytes を超えました。`);
  }
  return error;
}

function formatVmError(context: QuickJSContext, handle: QuickJSHandle): string {
  const error = context.dump(handle) as unknown;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String(error.message);
    if (/interrupted/i.test(message)) {
      return `CPU実行時間が${CUSTOM_CODE_CPU_TIMEOUT_MS}msを超えたため停止しました。`;
    }
    return message;
  }
  return String(error);
}

function unwrapHandle(
  context: QuickJSContext,
  result: ReturnType<QuickJSContext['evalCode']>,
): QuickJSHandle {
  if (result.error) {
    try {
      throw new Error(formatVmError(context, result.error));
    } finally {
      result.error.dispose();
    }
  }
  return result.value;
}

function installInputs(context: QuickJSContext, serializedInputs: string): void {
  const json = context.getProp(context.global, 'JSON');
  const parse = context.getProp(json, 'parse');
  const source = context.newString(serializedInputs);
  try {
    const inputs = unwrapHandle(context, context.callFunction(parse, json, source));
    try {
      context.setProp(context.global, 'inputs', inputs);
    } finally {
      inputs.dispose();
    }
  } finally {
    source.dispose();
    parse.dispose();
    json.dispose();
  }
}

interface SleepBridge {
  failure: Promise<never>;
  dispose(): void;
}

function installSleep(
  context: QuickJSContext,
  runtime: QuickJSRuntime,
  armCpuDeadline: () => void,
): SleepBridge {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const promises = new Set<QuickJSDeferredPromise>();
  let rejectFailure!: (error: Error) => void;
  const failure = new Promise<never>((_resolve, reject) => {
    rejectFailure = reject;
  });
  const sleep = context.newFunction('sleep', (durationHandle) => {
    if (!durationHandle) {
      throw new Error(`sleepの待機時間は0から${CUSTOM_CODE_MAX_SLEEP_MS}msで指定してください。`);
    }
    const duration = context.getNumber(durationHandle);
    if (!Number.isFinite(duration) || duration < 0 || duration > CUSTOM_CODE_MAX_SLEEP_MS) {
      throw new Error(`sleepの待機時間は0から${CUSTOM_CODE_MAX_SLEEP_MS}msで指定してください。`);
    }

    const deferred = context.newPromise();
    promises.add(deferred);
    const timer = globalThis.setTimeout(() => {
      timers.delete(timer);
      if (!deferred.alive) return;
      deferred.resolve();
      armCpuDeadline();
      const pendingResult = runtime.executePendingJobs();
      if (pendingResult.error) {
        try {
          rejectFailure(new Error(formatVmError(pendingResult.error.context, pendingResult.error)));
        } finally {
          pendingResult.error.dispose();
        }
      }
    }, duration);
    timers.add(timer);
    return deferred.handle;
  });
  try {
    context.setProp(context.global, 'sleep', sleep);
  } finally {
    sleep.dispose();
  }

  return {
    failure,
    dispose() {
      for (const timer of timers) globalThis.clearTimeout(timer);
      for (const deferred of promises) {
        if (deferred.alive) deferred.dispose();
      }
    },
  };
}

async function resolveEvaluation(
  context: QuickJSContext,
  runtime: QuickJSRuntime,
  result: QuickJSHandle,
  armCpuDeadline: () => void,
  sleepFailure: Promise<never>,
): Promise<string> {
  const promise = context.resolvePromise(result);
  armCpuDeadline();
  while (runtime.hasPendingJob()) {
    const pendingResult = runtime.executePendingJobs();
    if (pendingResult.error) {
      try {
        throw new Error(formatVmError(pendingResult.error.context, pendingResult.error));
      } finally {
        pendingResult.error.dispose();
      }
    }
  }

  const settled = await Promise.race([promise, sleepFailure]);
  if (settled.error) {
    try {
      throw new Error(formatVmError(context, settled.error));
    } finally {
      settled.error.dispose();
    }
  }
  try {
    return context.getString(settled.value);
  } finally {
    settled.value.dispose();
  }
}

export async function evaluateCustomCodeInVm(
  code: string,
  inputs: Record<string, unknown>,
): Promise<string> {
  const quickJs = await getQuickJsModule();
  return evaluateCustomCodeWithModule(quickJs, code, inputs);
}

export async function evaluateCustomCodeWithModule(
  quickJs: Pick<QuickJSWASMModule, 'newRuntime'>,
  code: string,
  inputs: Record<string, unknown>,
): Promise<string> {
  const serializedInputs = JSON.stringify(inputs);
  if (serializedInputs === undefined) {
    throw new Error('入力はJSONとしてシリアライズ可能である必要があります。');
  }

  const runtime = quickJs.newRuntime();
  runtime.setMemoryLimit(CUSTOM_CODE_MAX_HEAP_BYTES);
  runtime.setMaxStackSize(CUSTOM_CODE_MAX_STACK_BYTES);
  let cpuDeadline = 0;
  const armCpuDeadline = () => {
    cpuDeadline = Date.now() + CUSTOM_CODE_CPU_TIMEOUT_MS;
  };
  armCpuDeadline();
  runtime.setInterruptHandler(() => Date.now() > cpuDeadline);
  const context = runtime.newContext();
  let sleepBridge: SleepBridge | undefined;
  let evaluationError: unknown;
  let serializedResult: string | undefined;
  try {
    sleepBridge = installSleep(context, runtime, armCpuDeadline);
    installInputs(context, serializedInputs);
    armCpuDeadline();
    const result = unwrapHandle(
      context,
      context.evalCode(`
        Promise.resolve((${code})).then((value) => {
          const serialized = JSON.stringify(value);
          if (serialized === undefined) {
            throw new Error('戻り値はJSONとしてシリアライズ可能である必要があります。');
          }
          return serialized;
        })
      `),
    );
    try {
      serializedResult = await resolveEvaluation(
        context,
        runtime,
        result,
        armCpuDeadline,
        sleepBridge.failure,
      );
    } finally {
      result.dispose();
    }
  } catch (error) {
    evaluationError = normalizeVmError(error);
  } finally {
    for (const dispose of [
      () => sleepBridge?.dispose(),
      () => context.dispose(),
      () => runtime.dispose(),
    ]) {
      try {
        dispose();
      } catch (error) {
        evaluationError ??= error;
      }
    }
  }
  if (evaluationError !== undefined) throw evaluationError;
  return serializedResult!;
}
