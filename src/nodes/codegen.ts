import type { NodeCodegenMetadata } from '../types';

const literal = (value: unknown): string => `(${JSON.stringify(value ?? {})} as any)`;

const emitter = (
  build: (inputsVar: string, stateLiteral: string) => string,
): NodeCodegenMetadata => ({
  emit: ({ inputsVar, state }) => build(inputsVar, literal(state)),
});

export const BUILTIN_NODE_CODEGEN: Record<string, NodeCodegenMetadata> = {
  'input/number': emitter(
    (_i, s) =>
      `(() => { const value = Number(${s}.value ?? 0); return { value: Number.isNaN(value) ? 0 : value }; })()`,
  ),
  'input/slider': emitter(
    (_i, s) =>
      `(() => { const value = Number(${s}.value ?? 50); return { value: Number.isNaN(value) ? 50 : value }; })()`,
  ),
  'input/text': emitter((_i, s) => `{ value: String(${s}.value ?? '') }`),
  'input/boolean': emitter((_i, s) => `{ value: Boolean(${s}.value) }`),
  'input/array': emitter(
    (_i, s) =>
      `(() => { const raw = String(${s}.rawText ?? ''); const value = raw.split(',').map(value => value.trim()).filter(Boolean); return { value: ${s}.type === 'string' ? value : value.map(Number).filter(value => !Number.isNaN(value)) }; })()`,
  ),
  'input/json': emitter(
    (_i, s) =>
      `(() => { try { return { value: JSON.parse(${s}.rawJson || '{}') }; } catch { return { value: {} }; } })()`,
  ),

  'math/add': emitter((i) => `{ result: Number(${i}.a ?? 0) + Number(${i}.b ?? 0) }`),
  'math/subtract': emitter((i) => `{ result: Number(${i}.a ?? 0) - Number(${i}.b ?? 0) }`),
  'math/multiply': emitter((i) => `{ result: Number(${i}.a ?? 0) * Number(${i}.b ?? 0) }`),
  'math/divide': emitter(
    (i) =>
      `(() => { const a = Number(${i}.a ?? 0); const b = Number(${i}.b ?? 1); if (b === 0) throw new Error('ゼロ除算エラー (Division by zero)'); return { result: a / b }; })()`,
  ),
  'math/modulo': emitter((i) => `{ result: Number(${i}.a ?? 0) % Number(${i}.b ?? 1) }`),
  'math/round': emitter((i) => `{ result: Math.round(Number(${i}.value ?? 0)) }`),
  'math/abs': emitter((i) => `{ result: Math.abs(Number(${i}.value ?? 0)) }`),
  'math/sqrt': emitter((i) => `{ result: Math.sqrt(Number(${i}.value ?? 0)) }`),

  'string/concat': emitter((i) => `{ result: String(${i}.a ?? '') + String(${i}.b ?? '') }`),
  'string/template': emitter(
    (i) =>
      `{ result: String(${i}.template ?? '').replace(/\\{a\\}/g, String(${i}.a ?? '')).replace(/\\{b\\}/g, String(${i}.b ?? '')) }`,
  ),
  'string/uppercase': emitter((i) => `{ result: String(${i}.text ?? '').toUpperCase() }`),
  'string/split': emitter(
    (i) =>
      `{ result: String(${i}.text ?? '').split(String(${i}.separator ?? ',')).map(value => value.trim()) }`,
  ),
  'string/length': emitter((i) => `{ result: String(${i}.text ?? '').length }`),

  'logic/and': emitter((i) => `{ result: Boolean(${i}.a && ${i}.b) }`),
  'logic/or': emitter((i) => `{ result: Boolean(${i}.a || ${i}.b) }`),
  'logic/not': emitter((i) => `{ result: !${i}.value }`),
  'logic/greater': emitter((i) => `{ result: Number(${i}.a ?? 0) > Number(${i}.b ?? 0) }`),
  'logic/equal': emitter((i) => `{ result: ${i}.a === ${i}.b }`),
  'logic/branch': emitter((i) => `{ result: ${i}.condition ? ${i}.ifTrue : ${i}.ifFalse }`),

  'array/create': emitter(
    (i) => `{ result: [${i}.item1, ${i}.item2].filter(value => value !== undefined) }`,
  ),
  'array/length': emitter((i) => `{ result: Array.isArray(${i}.arr) ? ${i}.arr.length : 0 }`),
  'array/join': emitter(
    (i) =>
      `{ result: (Array.isArray(${i}.arr) ? ${i}.arr : []).join(String(${i}.separator ?? ', ')) }`,
  ),
  'array/map': emitter(
    (i, s) =>
      `(() => { const values = Array.isArray(${i}.arr) ? ${i}.arr : []; const factor = Number(${i}.factor ?? 2); const operator = ${s}.operator || '*'; return { result: values.map(value => { if (typeof value !== 'number') return value; switch (operator) { case '+': return value + factor; case '-': return value - factor; case '/': return factor !== 0 ? value / factor : value; default: return value * factor; } }) }; })()`,
  ),
  'array/filter': emitter(
    (i, s) =>
      `(() => { const values = Array.isArray(${i}.arr) ? ${i}.arr : []; const threshold = Number(${i}.threshold ?? 0); const operator = ${s}.operator || '>'; return { result: values.filter(value => { if (typeof value !== 'number') return false; switch (operator) { case '>=': return value >= threshold; case '<': return value < threshold; case '<=': return value <= threshold; case '==': return value === threshold; case '!=': return value !== threshold; default: return value > threshold; } }) }; })()`,
  ),
  'array/slice': emitter(
    (i) =>
      `{ result: (Array.isArray(${i}.arr) ? ${i}.arr : []).slice(Number(${i}.start ?? 0), ${i}.end !== undefined ? Number(${i}.end) : undefined) }`,
  ),
  'array/reverse': emitter(
    (i) => `{ result: (Array.isArray(${i}.arr) ? [...${i}.arr] : []).reverse() }`,
  ),
  'array/sum': emitter(
    (i) =>
      `{ result: (Array.isArray(${i}.arr) ? ${i}.arr : []).reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0) }`,
  ),

  'object/create': emitter((i) => `{ result: { [String(${i}.key ?? 'key')]: ${i}.value } }`),
  'object/get': emitter(
    (i) =>
      `(() => { const value = ${i}.obj && typeof ${i}.obj === 'object' ? ${i}.obj : {}; return { result: value[${i}.key] }; })()`,
  ),
  'object/stringify': emitter(
    (i) =>
      `(() => { try { return { result: JSON.stringify(${i}.data, null, 2) }; } catch { return { result: '' }; } })()`,
  ),

  'output/inspector': emitter((i) => `{ displayedValue: ${i}.value }`),
  'output/gauge': emitter((i) => `{ displayedValue: ${i}.value }`),
  'output/status': emitter((i) => `{ displayedValue: ${i}.status }`),
  'output/log': emitter((i) => `{ displayedValue: ${i}.message }`),
  'composite/input-port': emitter(
    (i, s) =>
      `(() => { let value = ${i}.in !== undefined ? ${i}.in : ${s}.testValue; if (value === undefined) { if (${s}.portType === 'number') value = 0; else if (${s}.portType === 'string') value = ''; else if (${s}.portType === 'boolean') value = false; else if (${s}.portType === 'array') value = []; else if (${s}.portType === 'object') value = {}; else value = 0; } return { out: value }; })()`,
  ),
  'composite/output-port': emitter(
    (i, s) =>
      `(() => { const value = ${i}.in; const portName = ${s}.portName || 'result'; return { out: value, [portName]: value }; })()`,
  ),

  'async/delay': emitter(
    (i) =>
      `await (async () => { const delay = Math.max(0, Number(${i}.delayMs ?? 600)); await new Promise(resolve => setTimeout(resolve, delay)); return { result: ${i}.value, promise: Promise.resolve(${i}.value) }; })()`,
  ),
  'async/resolve': emitter((i) => `{ promise: Promise.resolve(${i}.value) }`),
  'async/await': emitter(
    (i) =>
      `await (async () => ({ result: ${i}.promise && typeof ${i}.promise.then === 'function' ? await ${i}.promise : ${i}.promise }))()`,
  ),
  'async/all': emitter(
    (i) =>
      `await (async () => { const p1 = isPromise(${i}.p1) ? ${i}.p1 : Promise.resolve(${i}.p1); const p2 = isPromise(${i}.p2) ? ${i}.p2 : Promise.resolve(${i}.p2); return { results: await Promise.all([p1, p2]) }; })()`,
  ),
  'async/fetch': emitter(
    (i) =>
      `await (async () => { const delay = Math.max(30, Number(${i}.latency ?? 500)); await new Promise(resolve => setTimeout(resolve, delay)); const payload = { endpoint: ${i}.endpoint || '/api/v1/metrics', timestamp: new Date().toLocaleTimeString(), metrics: { qps: Math.round(120 + Math.random() * 50), latencyAvg: Math.round(18 + Math.random() * 10), status: 'healthy' } }; return { data: payload, status: 200, promise: Promise.resolve(payload) }; })()`,
  ),

  'stream/interval': emitter(
    (i) =>
      `{ stream: createIntervalStream(Math.max(20, Number(${i}.intervalMs ?? 400)), Math.max(1, Number(${i}.limit ?? 8))) }`,
  ),
  'stream/from_array': emitter(
    (i) =>
      `{ stream: createArrayStream(Array.isArray(${i}.items) ? ${i}.items : [1, 2, 3, 4, 5], Math.max(0, Number(${i}.delayMs ?? 300))) }`,
  ),
  'stream/map': emitter(
    (i) =>
      `({ stream: !${i}.stream || !isAsyncIterable(${i}.stream) ? createIntervalStream(400, 5) : mapStream(${i}.stream, value => typeof value === 'number' ? value * Number(${i}.multiplier ?? 2) : value) })`,
  ),
  'stream/filter': emitter(
    (i, s) =>
      `(() => { if (!${i}.stream || !isAsyncIterable(${i}.stream)) return { stream: createIntervalStream(400, 5) }; const mode = ${s}.mode || 'even'; const threshold = Number(${i}.threshold ?? 0); return { stream: filterStream(${i}.stream, value => { if (typeof value !== 'number') return false; switch (mode) { case 'odd': return Math.abs(value % 2) === 1; case 'positive': return value > 0; case 'greater': return value > threshold; default: return value % 2 === 0; } }) }; })()`,
  ),
  'stream/take': emitter(
    (i) =>
      `({ stream: !${i}.stream || !isAsyncIterable(${i}.stream) ? createIntervalStream(400, 5) : takeStream(${i}.stream, Math.max(1, Number(${i}.count ?? 4))) })`,
  ),
  'stream/collect': emitter(
    (i) =>
      `await (async () => { if (!${i}.stream || !isAsyncIterable(${i}.stream)) return { array: [], count: 0 }; const values = await collectStream(${i}.stream, undefined, 50); return { array: values, count: values.length }; })()`,
  ),
};

export const GENERATED_STREAM_HELPERS = `
function isPromise(value: any): boolean {
  return Boolean(value && typeof value.then === 'function');
}

function isAsyncIterable(value: any): boolean {
  return Boolean(value && typeof value[Symbol.asyncIterator] === 'function');
}

interface StreamInstance<T = any> extends AsyncIterable<T> {
  isStream: true;
  streamName?: string;
  cancel?: () => void;
}

function createIntervalStream(intervalMs = 500, maxLimit = 20): StreamInstance<number> {
  let count = 0;
  let cancelled = false;
  return {
    isStream: true,
    streamName: \`IntervalStream(\${intervalMs}ms, limit=\${maxLimit})\`,
    cancel: () => { cancelled = true; },
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<number>> {
          if (cancelled || count >= maxLimit) return { done: true, value: undefined };
          await new Promise(resolve => setTimeout(resolve, Math.max(20, intervalMs)));
          if (cancelled || count >= maxLimit) return { done: true, value: undefined };
          return { done: false, value: count++ };
        },
      };
    },
  };
}

function createArrayStream<T>(items: T[], delayMs = 300): StreamInstance<T> {
  let index = 0;
  let cancelled = false;
  return {
    isStream: true,
    streamName: \`ArrayStream(\${items.length} items)\`,
    cancel: () => { cancelled = true; },
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<T>> {
          if (cancelled || index >= items.length) return { done: true, value: undefined };
          if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
          if (cancelled || index >= items.length) return { done: true, value: undefined };
          return { done: false, value: items[index++] };
        },
      };
    },
  };
}

function mapStream<T, R>(source: AsyncIterable<T>, transform: (item: T) => R | Promise<R>): StreamInstance<R> {
  return {
    isStream: true,
    streamName: 'MapStream',
    [Symbol.asyncIterator]() {
      const iterator = source[Symbol.asyncIterator]();
      return { async next() { const result = await iterator.next(); if (result.done) return { done: true, value: undefined }; return { done: false, value: await transform(result.value) }; } };
    },
  };
}

function filterStream<T>(source: AsyncIterable<T>, predicate: (item: T) => boolean | Promise<boolean>): StreamInstance<T> {
  return {
    isStream: true,
    streamName: 'FilterStream',
    [Symbol.asyncIterator]() {
      const iterator = source[Symbol.asyncIterator]();
      return { async next() { while (true) { const result = await iterator.next(); if (result.done) return { done: true, value: undefined }; if (await predicate(result.value)) return { done: false, value: result.value }; } } };
    },
  };
}

function takeStream<T>(source: AsyncIterable<T>, count: number): StreamInstance<T> {
  let taken = 0;
  return {
    isStream: true,
    streamName: \`TakeStream(\${count})\`,
    [Symbol.asyncIterator]() {
      const iterator = source[Symbol.asyncIterator]();
      return { async next() { if (taken >= count) return { done: true, value: undefined }; const result = await iterator.next(); if (result.done) return { done: true, value: undefined }; taken++; return result; } };
    },
  };
}

async function collectStream<T>(source: AsyncIterable<T>, onChunk?: (item: T, values: T[]) => void, maxItems = 100): Promise<T[]> {
  const values: T[] = [];
  try {
    for await (const item of source) {
      values.push(item);
      onChunk?.(item, [...values]);
      if (values.length >= maxItems) break;
    }
  } catch (error) {
    console.warn('Stream collection error/interrupted:', error);
  }
  return values;
}
`;
