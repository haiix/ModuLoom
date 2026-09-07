import { NodeDefinition } from '../types';
import {
  isPromise,
  isAsyncIterable,
  createIntervalStream,
  createArrayStream,
  mapStream,
  filterStream,
  takeStream,
  collectStream,
} from '../engine/streamEngine';

export const ASYNC_STREAM_NODES: NodeDefinition[] = [
  // ==========================================
  // ASYNC (PROMISE) OPERATORS
  // ==========================================
  {
    typeId: 'async/delay',
    label: 'Promise Delay',
    category: 'Async',
    kind: 'pure',
    isAsync: true,
    description: '指定ミリ秒後に値を解決する非同期Promiseを生成',
    inputs: [
      { id: 'value', name: 'value', type: 'any', defaultValue: 'Async Result' },
      { id: 'delayMs', name: 'delayMs', type: 'number', defaultValue: 600 },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'any' },
      { id: 'promise', name: 'promise', type: 'promise' },
    ],
    evaluate: async (inputs) => {
      const delay = Math.max(0, Number(inputs.delayMs ?? 600));
      await new Promise((r) => setTimeout(r, delay));
      return {
        result: inputs.value,
        promise: Promise.resolve(inputs.value),
      };
    },
  },
  {
    typeId: 'async/resolve',
    label: 'Promise.resolve',
    category: 'Async',
    kind: 'pure',
    description: '値を即座に解決されるPromiseオブジェクトにラップ',
    inputs: [
      { id: 'value', name: 'value', type: 'any', defaultValue: 100 },
    ],
    outputs: [
      { id: 'promise', name: 'promise', type: 'promise' },
    ],
    evaluate: (inputs) => {
      return {
        promise: Promise.resolve(inputs.value),
      };
    },
  },
  {
    typeId: 'async/await',
    label: 'Await Promise',
    category: 'Async',
    kind: 'pure',
    isAsync: true,
    description: 'Promiseを受け取り、解決されるまで待機して値を取り出し',
    inputs: [
      { id: 'promise', name: 'promise', type: 'promise' },
    ],
    outputs: [
      { id: 'result', name: 'result', type: 'any' },
    ],
    evaluate: async (inputs) => {
      if (inputs.promise && typeof inputs.promise.then === 'function') {
        const resolved = await inputs.promise;
        return { result: resolved };
      }
      return { result: inputs.promise };
    },
  },
  {
    typeId: 'async/all',
    label: 'Promise.all',
    category: 'Async',
    kind: 'pure',
    isAsync: true,
    description: '2つのPromiseがすべて解決されるのを待機して配列化',
    inputs: [
      { id: 'p1', name: 'p1', type: 'promise' },
      { id: 'p2', name: 'p2', type: 'promise' },
    ],
    outputs: [
      { id: 'results', name: 'results', type: 'array' },
    ],
    evaluate: async (inputs) => {
      const p1 = isPromise(inputs.p1) ? inputs.p1 : Promise.resolve(inputs.p1);
      const p2 = isPromise(inputs.p2) ? inputs.p2 : Promise.resolve(inputs.p2);
      const results = await Promise.all([p1, p2]);
      return { results };
    },
  },
  {
    typeId: 'async/fetch',
    label: 'Simulated API Fetch',
    category: 'Async',
    kind: 'pure',
    isAsync: true,
    description: '非同期HTTPリクエストをシミュレーションしてJSONデータを取得',
    inputs: [
      { id: 'endpoint', name: 'endpoint', type: 'string', defaultValue: '/api/v1/metrics' },
      { id: 'latency', name: 'latency (ms)', type: 'number', defaultValue: 500 },
    ],
    outputs: [
      { id: 'data', name: 'data', type: 'object' },
      { id: 'status', name: 'status', type: 'number' },
      { id: 'promise', name: 'promise', type: 'promise' },
    ],
    evaluate: async (inputs) => {
      const ms = Math.max(30, Number(inputs.latency ?? 500));
      await new Promise((r) => setTimeout(r, ms));
      const payload = {
        endpoint: inputs.endpoint || '/api/v1/metrics',
        timestamp: new Date().toLocaleTimeString(),
        metrics: {
          qps: Math.round(120 + Math.random() * 50),
          latencyAvg: Math.round(18 + Math.random() * 10),
          status: 'healthy',
        },
      };
      return {
        data: payload,
        status: 200,
        promise: Promise.resolve(payload),
      };
    },
  },

  // ==========================================
  // STREAM (ASYNC ITERATOR) OPERATORS
  // ==========================================
  {
    typeId: 'stream/interval',
    label: 'Interval Stream',
    category: 'Stream',
    kind: 'pure',
    description: '一定間隔(ms)ごとに数値を0からインクリメント送出するAsyncIterator',
    inputs: [
      { id: 'intervalMs', name: 'intervalMs', type: 'number', defaultValue: 400 },
      { id: 'limit', name: 'limit', type: 'number', defaultValue: 8 },
    ],
    outputs: [
      { id: 'stream', name: 'stream', type: 'stream' },
    ],
    evaluate: (inputs) => {
      const ms = Math.max(20, Number(inputs.intervalMs ?? 400));
      const limit = Math.max(1, Number(inputs.limit ?? 8));
      return {
        stream: createIntervalStream(ms, limit),
      };
    },
  },
  {
    typeId: 'stream/from_array',
    label: 'Stream from Array',
    category: 'Stream',
    kind: 'pure',
    description: '配列の要素を一定間隔で1つずつストリーム送出',
    inputs: [
      { id: 'items', name: 'items', type: 'array', defaultValue: [10, 20, 30, 40, 50] },
      { id: 'delayMs', name: 'delayMs', type: 'number', defaultValue: 300 },
    ],
    outputs: [
      { id: 'stream', name: 'stream', type: 'stream' },
    ],
    evaluate: (inputs) => {
      const arr = Array.isArray(inputs.items) ? inputs.items : [1, 2, 3, 4, 5];
      const delay = Math.max(0, Number(inputs.delayMs ?? 300));
      return {
        stream: createArrayStream(arr, delay),
      };
    },
  },
  {
    typeId: 'stream/map',
    label: 'Stream Map (Scale)',
    category: 'Stream',
    kind: 'pure',
    description: '流れてくる各数値を係数(multiplier)でスケーリング変換して次へ送出',
    inputs: [
      { id: 'stream', name: 'stream', type: 'stream' },
      { id: 'multiplier', name: 'multiplier', type: 'number', defaultValue: 2 },
    ],
    outputs: [
      { id: 'stream', name: 'stream', type: 'stream' },
    ],
    evaluate: (inputs) => {
      if (!inputs.stream || !isAsyncIterable(inputs.stream)) {
        return { stream: createIntervalStream(400, 5) };
      }
      const mult = Number(inputs.multiplier ?? 2);
      return {
        stream: mapStream(inputs.stream, (val) => (typeof val === 'number' ? val * mult : val)),
      };
    },
  },
  {
    typeId: 'stream/filter',
    label: 'Stream Filter (条件抽出)',
    category: 'Stream',
    kind: 'pure',
    description: '条件（偶数、奇数、正数、または閾値判定）に基づいてストリーム要素をフィルタリング送出',
    inputs: [
      { id: 'stream', name: 'stream', type: 'stream' },
      { id: 'threshold', name: 'threshold (閾値)', type: 'number', defaultValue: 0 },
    ],
    outputs: [
      { id: 'stream', name: 'stream', type: 'stream' },
    ],
    defaultState: { mode: 'even' },
    evaluate: (inputs, state) => {
      if (!inputs.stream || !isAsyncIterable(inputs.stream)) {
        return { stream: createIntervalStream(400, 5) };
      }
      const mode = state?.mode || 'even';
      const thresh = Number(inputs.threshold ?? 0);
      return {
        stream: filterStream(inputs.stream, (val) => {
          if (typeof val !== 'number') return false;
          switch (mode) {
            case 'odd': return Math.abs(val % 2) === 1;
            case 'positive': return val > 0;
            case 'greater': return val > thresh;
            case 'even':
            default: return val % 2 === 0;
          }
        }),
      };
    },
  },
  {
    typeId: 'stream/take',
    label: 'Stream Take (N件)',
    category: 'Stream',
    kind: 'pure',
    description: 'ストリームの先頭N個の要素のみを流して完了',
    inputs: [
      { id: 'stream', name: 'stream', type: 'stream' },
      { id: 'count', name: 'count', type: 'number', defaultValue: 4 },
    ],
    outputs: [
      { id: 'stream', name: 'stream', type: 'stream' },
    ],
    evaluate: (inputs) => {
      if (!inputs.stream || !isAsyncIterable(inputs.stream)) {
        return { stream: createIntervalStream(400, 5) };
      }
      const count = Math.max(1, Number(inputs.count ?? 4));
      return {
        stream: takeStream(inputs.stream, count),
      };
    },
  },
  {
    typeId: 'stream/collect',
    label: 'Collect Stream (配列化)',
    category: 'Stream',
    kind: 'output',
    isAsync: true,
    description: 'AsyncIteratorを最後まで非同期消費し、配列として集約',
    inputs: [
      { id: 'stream', name: 'stream', type: 'stream' },
    ],
    outputs: [
      { id: 'array', name: 'array', type: 'array' },
      { id: 'count', name: 'count', type: 'number' },
    ],
    evaluate: async (inputs) => {
      if (!inputs.stream || !isAsyncIterable(inputs.stream)) {
        return { array: [], count: 0 };
      }
      const collected = await collectStream(inputs.stream, undefined, 50);
      return {
        array: collected,
        count: collected.length,
      };
    },
  },
];
