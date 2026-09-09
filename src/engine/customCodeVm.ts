import releaseSyncVariant from '@jitl/quickjs-wasmfile-release-sync';
import {
  newQuickJSWASMModuleFromVariant,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSRuntime,
} from 'quickjs-emscripten-core';

let modulePromise: ReturnType<typeof newQuickJSWASMModuleFromVariant> | undefined;

function getQuickJsModule() {
  return (modulePromise ??= newQuickJSWASMModuleFromVariant(releaseSyncVariant));
}

export async function initializeCustomCodeVm(): Promise<void> {
  await getQuickJsModule();
}

function formatVmError(context: QuickJSContext, handle: QuickJSHandle): string {
  const error = context.dump(handle) as unknown;
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
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

async function resolveEvaluation(
  context: QuickJSContext,
  runtime: QuickJSRuntime,
  result: QuickJSHandle,
): Promise<string> {
  const promise = context.resolvePromise(result);
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

  const settled = await promise;
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
  const serializedInputs = JSON.stringify(inputs);
  if (serializedInputs === undefined) {
    throw new Error('入力はJSONとしてシリアライズ可能である必要があります。');
  }

  const quickJs = await getQuickJsModule();
  const runtime = quickJs.newRuntime();
  const context = runtime.newContext();
  try {
    installInputs(context, serializedInputs);
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
      return await resolveEvaluation(context, runtime, result);
    } finally {
      result.dispose();
    }
  } finally {
    context.dispose();
    runtime.dispose();
  }
}
