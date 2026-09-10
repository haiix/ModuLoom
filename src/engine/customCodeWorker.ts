/// <reference lib="webworker" />

import { evaluateCustomCodeInVm, initializeCustomCodeVm, isFatalVmError } from './customCodeVm';

interface EvaluationRequest {
  id: number;
  code: string;
  inputs: Record<string, unknown>;
  maxResultBytes: number;
}

const workerScope = self as DedicatedWorkerGlobalScope;
const initialization = initializeCustomCodeVm();

workerScope.onmessage = async (event: MessageEvent<EvaluationRequest>) => {
  const { id, code, inputs, maxResultBytes } = event.data;
  try {
    await initialization;
  } catch (error) {
    workerScope.postMessage({
      id,
      ok: false,
      fatal: true,
      error: `QuickJSを初期化できませんでした: ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }
  try {
    const serialized = await evaluateCustomCodeInVm(code, inputs);
    const size = new TextEncoder().encode(serialized).byteLength;
    if (size > maxResultBytes) {
      throw new Error(`返却データが上限 ${maxResultBytes} bytes を超えました。`);
    }
    workerScope.postMessage({ id, ok: true, value: JSON.parse(serialized) });
  } catch (error) {
    workerScope.postMessage({
      id,
      ok: false,
      fatal: isFatalVmError(error),
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};
