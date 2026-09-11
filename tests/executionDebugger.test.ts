import { describe, expect, it } from 'vitest';
import { DagExecutionDebugger } from '../src/engine/executionDebugger';
import { evaluateGraph } from '../src/engine/dagEngine';
import type { Connection, GraphEvaluation, NodeDefinition, NodeInstance } from '../src/types';

const nodes: NodeInstance[] = [
  { id: 'a', typeId: 'input', x: 0, y: 0, state: { value: 2 } },
  { id: 'b', typeId: 'input', x: 0, y: 100, state: { value: 3 } },
  { id: 'sum', typeId: 'add', x: 200, y: 50 },
];
const connections: Connection[] = [
  { id: 'a-sum', fromNodeId: 'a', fromPortId: 'value', toNodeId: 'sum', toPortId: 'a' },
  { id: 'b-sum', fromNodeId: 'b', fromPortId: 'value', toNodeId: 'sum', toPortId: 'b' },
];
const definitions = new Map<string, NodeDefinition>([
  [
    'input',
    {
      typeId: 'input',
      label: 'Input',
      category: 'Input',
      kind: 'input',
      inputs: [],
      outputs: [{ id: 'value', name: 'value', type: 'number' }],
      evaluate: (_inputs, state) => ({ value: state.value }),
    },
  ],
  [
    'add',
    {
      typeId: 'add',
      label: 'Add',
      category: 'Math',
      kind: 'pure',
      inputs: [
        { id: 'a', name: 'a', type: 'number', defaultValue: 0 },
        { id: 'b', name: 'b', type: 'number', defaultValue: 0 },
      ],
      outputs: [{ id: 'result', name: 'result', type: 'number' }],
      evaluate: (inputs) => ({ result: inputs.a + inputs.b }),
    },
  ],
]);

describe('DAG execution debugger', () => {
  it('通常評価と同様に未接続の必須入力をエラーにする', async () => {
    const requiredNode: NodeDefinition = {
      typeId: 'required',
      label: 'Required',
      category: 'Math',
      kind: 'pure',
      inputs: [{ id: 'value', name: 'value', type: 'number', required: true }],
      outputs: [{ id: 'result', name: 'result', type: 'number' }],
      evaluate: (inputs) => ({ result: inputs.value }),
    };
    const session = new DagExecutionDebugger(
      [{ id: 'required', typeId: requiredNode.typeId, x: 0, y: 0 }],
      [],
      new Map([[requiredNode.typeId, requiredNode]]),
    );

    await session.step();
    expect(session.getSnapshot().traces.required.error).toContain('INPUT_REQUIRED');
  });

  it('starts paused before a node and executes exactly one node per step', async () => {
    const session = new DagExecutionDebugger(nodes, connections, definitions);

    expect(session.getSnapshot()).toMatchObject({ status: 'paused', nextNodeId: 'a' });
    await session.step();
    expect(session.getSnapshot()).toMatchObject({ status: 'paused', nextNodeId: 'b' });
    expect(Object.keys(session.getSnapshot().traces)).toEqual(['a']);
  });

  it('continues until immediately before a breakpoint', async () => {
    const session = new DagExecutionDebugger(nodes, connections, definitions, {
      breakpoints: ['sum'],
    });

    await session.continue();
    const paused = session.getSnapshot();
    expect(paused).toMatchObject({ status: 'paused', nextNodeId: 'sum', lastNodeId: 'b' });
    expect(paused.traces.sum).toBeUndefined();

    await session.step();
    expect(session.getSnapshot()).toMatchObject({ status: 'completed', lastNodeId: 'sum' });
    expect(session.getSnapshot().traces.sum.outputs).toEqual({ result: 5 });
  });

  it('records resolved inputs, outputs, timing, cache use, and previous-evaluation differences', async () => {
    const previousEvaluation: GraphEvaluation = {
      a: { inputs: {}, outputs: { value: 1 } },
      b: { inputs: {}, outputs: { value: 3 } },
    };
    const session = new DagExecutionDebugger(nodes, connections, definitions, {
      previousEvaluation,
      dirtyNodeIds: new Set(['a', 'sum']),
    });

    await session.step();
    await session.step();
    const snapshot = session.getSnapshot();
    expect(snapshot.traces.a).toMatchObject({
      inputs: {},
      outputs: { value: 2 },
      isCached: false,
      changed: true,
      status: 'completed',
    });
    expect(snapshot.traces.a.durationMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.traces.b).toMatchObject({
      outputs: { value: 3 },
      isCached: true,
      changed: false,
      status: 'cached',
    });
  });

  it('records the full downstream error propagation path', async () => {
    const failingDefinitions = new Map(definitions);
    failingDefinitions.set('input', {
      ...definitions.get('input')!,
      evaluate: (_inputs, state) => {
        if (state.value === 2) throw new Error('source failed');
        return { value: state.value };
      },
    });
    const session = new DagExecutionDebugger(nodes, connections, failingDefinitions);

    await session.continue();
    expect(session.getSnapshot().traces.a.errorPath).toEqual(['a']);
    expect(session.getSnapshot().traces.sum.error).toMatch(/入力元ノードでエラー/);
    expect(session.getSnapshot().traces.sum.errorPath).toEqual(['a', 'sum']);
  });

  it('reports async waiting state and cancels the active operation through AbortSignal', async () => {
    const asyncNodes: NodeInstance[] = [{ id: 'async', typeId: 'async', x: 0, y: 0 }];
    const asyncDefinitions = new Map<string, NodeDefinition>([
      [
        'async',
        {
          typeId: 'async',
          label: 'Async',
          category: 'Async',
          kind: 'pure',
          inputs: [],
          outputs: [{ id: 'value', name: 'value', type: 'number' }],
          isAsync: true,
          evaluate: (_inputs, _state, context) =>
            new Promise((_resolve, reject) =>
              context?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
            ),
        },
      ],
    ]);
    const states: string[] = [];
    const session = new DagExecutionDebugger(asyncNodes, [], asyncDefinitions);
    const running = session.step((snapshot) => states.push(snapshot.status));
    await Promise.resolve();
    session.cancel();
    await running;

    expect(states).toContain('waiting');
    expect(session.getSnapshot().status).toBe('cancelled');
    expect(session.getSnapshot().traces.async).toMatchObject({
      status: 'cancelled',
      error: 'デバッグ実行がキャンセルされました。',
    });
  });

  it('calls stream cancellation and iterator return when stopped while collecting', async () => {
    let streamCancelled = false;
    let iteratorReturned = false;
    const stream = {
      cancel: () => {
        streamCancelled = true;
      },
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise<IteratorResult<number>>(() => {}),
          return: async () => {
            iteratorReturned = true;
            return { done: true as const, value: undefined };
          },
        };
      },
    };
    const streamNodes: NodeInstance[] = [
      { id: 'source', typeId: 'stream-source', x: 0, y: 0 },
      { id: 'collect', typeId: 'stream/collect', x: 200, y: 0 },
    ];
    const streamConnections: Connection[] = [
      {
        id: 'source-collect',
        fromNodeId: 'source',
        fromPortId: 'stream',
        toNodeId: 'collect',
        toPortId: 'stream',
      },
    ];
    const streamDefinitions = new Map<string, NodeDefinition>([
      [
        'stream-source',
        {
          typeId: 'stream-source',
          label: 'Source',
          category: 'Stream',
          kind: 'pure',
          inputs: [],
          outputs: [{ id: 'stream', name: 'stream', type: 'stream' }],
          evaluate: () => ({ stream }),
        },
      ],
      [
        'stream/collect',
        {
          typeId: 'stream/collect',
          label: 'Collect',
          category: 'Stream',
          kind: 'pure',
          inputs: [{ id: 'stream', name: 'stream', type: 'stream' }],
          outputs: [{ id: 'array', name: 'array', type: 'array' }],
          evaluate: () => ({}),
        },
      ],
    ]);
    const session = new DagExecutionDebugger(streamNodes, streamConnections, streamDefinitions);
    await session.step();
    const collecting = session.step();
    await Promise.resolve();
    session.cancel();
    await collecting;

    expect(streamCancelled).toBe(true);
    expect(iteratorReturned).toBe(true);
    expect(session.getSnapshot().traces.collect.status).toBe('cancelled');
  });

  it('does not change normal reactive graph evaluation behavior', () => {
    expect(evaluateGraph(nodes, connections, definitions).sum.outputs).toEqual({ result: 5 });
  });
});
