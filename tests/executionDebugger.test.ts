import { describe, expect, it, vi } from 'vitest';
import { DagExecutionDebugger } from '../src/engine/executionDebugger';
import { HierarchicalExecutionDebugger } from '../src/engine/hierarchicalExecutionDebugger';
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

  it('honors a breakpoint on the first node and skips it only when resuming', async () => {
    const session = new DagExecutionDebugger(nodes, connections, definitions, {
      breakpoints: ['a'],
    });

    await session.continue();
    expect(session.getSnapshot()).toMatchObject({ status: 'paused', nextNodeId: 'a' });
    await session.continue();
    expect(session.getSnapshot()).toMatchObject({ status: 'completed', lastNodeId: 'sum' });
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
    });
    expect(session.getSnapshot().traces.async.error).toBeUndefined();
  });

  it('calls stream cancellation and iterator return when stopped while collecting', async () => {
    const streamCancelled = vi.fn();
    const iteratorReturned = vi.fn(async () => ({ done: true as const, value: undefined }));
    const stream = {
      cancel: streamCancelled,
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise<IteratorResult<number>>(() => {}),
          return: iteratorReturned,
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

    expect(streamCancelled).toHaveBeenCalledTimes(1);
    expect(iteratorReturned).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().traces.collect.status).toBe('cancelled');
    expect(session.getSnapshot().traces.collect.error).toBeUndefined();
  });

  it('does not change normal reactive graph evaluation behavior', () => {
    expect(evaluateGraph(nodes, connections, definitions).sum.outputs).toEqual({ result: 5 });
  });
});

const groupInput: NodeDefinition = {
  typeId: 'composite/input-port',
  label: 'Group Input',
  category: 'Composite',
  kind: 'input',
  inputs: [{ id: 'in', name: 'in', type: 'any' }],
  outputs: [{ id: 'out', name: 'out', type: 'any' }],
  evaluate: (inputs, state) => ({ out: inputs.in ?? state.testValue }),
};

const groupOutput: NodeDefinition = {
  typeId: 'composite/output-port',
  label: 'Group Output',
  category: 'Composite',
  kind: 'output',
  inputs: [{ id: 'in', name: 'in', type: 'any' }],
  outputs: [{ id: 'out', name: 'out', type: 'any' }],
  evaluate: (inputs) => ({ out: inputs.in }),
};

function createDoubleComposite(typeId = 'composite/double'): NodeDefinition {
  return {
    typeId,
    label: 'Double',
    category: 'Composite',
    kind: 'pure',
    isComposite: true,
    inputs: [{ id: 'value', name: 'value', type: 'number' }],
    outputs: [{ id: 'result', name: 'result', type: 'number' }],
    evaluate: () => ({}),
    compositeSubgraph: {
      nodes: [
        {
          id: 'input',
          typeId: groupInput.typeId,
          x: 0,
          y: 0,
          state: { portName: 'value', portType: 'number' },
        },
        { id: 'sum', typeId: 'add', x: 100, y: 0 },
        {
          id: 'output',
          typeId: groupOutput.typeId,
          x: 200,
          y: 0,
          state: { portName: 'result', portType: 'number' },
        },
      ],
      connections: [
        { id: 'input-a', fromNodeId: 'input', fromPortId: 'out', toNodeId: 'sum', toPortId: 'a' },
        { id: 'input-b', fromNodeId: 'input', fromPortId: 'out', toNodeId: 'sum', toPortId: 'b' },
        {
          id: 'sum-output',
          fromNodeId: 'sum',
          fromPortId: 'result',
          toNodeId: 'output',
          toPortId: 'in',
        },
      ],
      inputNodeIds: ['input'],
      outputNodeIds: ['output'],
      inputPortMappings: [{ externalPortId: 'value', internalNodeId: 'input' }],
      outputPortMappings: [{ externalPortId: 'result', internalNodeId: 'output' }],
    },
  };
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) return;
    await Promise.resolve();
  }
  throw new Error('debugger state did not settle');
}

describe('hierarchical execution debugger', () => {
  it('records composite internals and exposes boundary mappings without changing the result', async () => {
    const composite = createDoubleComposite();
    const nestedDefinitions = new Map(definitions);
    for (const definition of [groupInput, groupOutput, composite]) {
      nestedDefinitions.set(definition.typeId, definition);
    }
    const session = new HierarchicalExecutionDebugger(
      [
        { id: 'source', typeId: 'input', x: 0, y: 0, state: { value: 4 } },
        { id: 'double', typeId: composite.typeId, x: 200, y: 0 },
      ],
      [
        {
          id: 'source-double',
          fromNodeId: 'source',
          fromPortId: 'value',
          toNodeId: 'double',
          toPortId: 'value',
        },
      ],
      nestedDefinitions,
      {
        previousEvaluation: {
          double: { inputs: { value: 4 }, outputs: { result: 999 } },
        },
        dirtyNodeIds: new Set(['source']),
      },
    );

    await session.continue();
    expect(session.getSnapshot().traces.double.outputs).toEqual({ result: 8 });

    const child = session.enterComposite('double');
    expect(child.path).toEqual(['double']);
    expect(child.traces.sum).toMatchObject({ outputs: { result: 8 }, status: 'completed' });
    expect(child.compositeBoundary).toEqual([
      expect.objectContaining({ direction: 'input', externalPortName: 'value' }),
      expect.objectContaining({ direction: 'output', externalPortName: 'result' }),
    ]);
    expect(session.leaveComposite().path).toEqual([]);
  });

  it('pauses at a path-qualified internal breakpoint and steps inside the composite', async () => {
    const composite = createDoubleComposite();
    const nestedDefinitions = new Map(definitions);
    for (const definition of [groupInput, groupOutput, composite]) {
      nestedDefinitions.set(definition.typeId, definition);
    }
    const session = new HierarchicalExecutionDebugger(
      [
        { id: 'source', typeId: 'input', x: 0, y: 0, state: { value: 3 } },
        { id: 'double', typeId: composite.typeId, x: 200, y: 0 },
      ],
      [
        {
          id: 'source-double',
          fromNodeId: 'source',
          fromPortId: 'value',
          toNodeId: 'double',
          toPortId: 'value',
        },
      ],
      nestedDefinitions,
      { breakpoints: ['double > sum'] },
    );

    const running = session.continue();
    await waitFor(() => session.getSnapshot().nextNodeId === 'sum');
    expect(session.getSnapshot()).toMatchObject({ path: ['double'], status: 'paused' });
    await session.step();
    expect(session.getSnapshot().traces.sum.outputs).toEqual({ result: 6 });
    await session.continue();
    await running;
    expect(session.getSnapshot().traces.double.outputs).toEqual({ result: 6 });
  });

  it('supports nested composites and cancels an async operation across every level', async () => {
    const asyncDefinition: NodeDefinition = {
      typeId: 'async-child',
      label: 'Async Child',
      category: 'Async',
      kind: 'pure',
      isAsync: true,
      inputs: [{ id: 'value', name: 'value', type: 'number' }],
      outputs: [{ id: 'result', name: 'result', type: 'number' }],
      evaluate: (inputs, _state, context) =>
        new Promise((_resolve, reject) =>
          context?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    };
    const inner: NodeDefinition = {
      ...createDoubleComposite('composite/inner'),
      label: 'Inner',
    };
    inner.compositeSubgraph = {
      ...inner.compositeSubgraph!,
      nodes: [
        inner.compositeSubgraph!.nodes[0],
        { id: 'async', typeId: asyncDefinition.typeId, x: 100, y: 0 },
        inner.compositeSubgraph!.nodes[2],
      ],
      connections: [
        {
          id: 'input-async',
          fromNodeId: 'input',
          fromPortId: 'out',
          toNodeId: 'async',
          toPortId: 'value',
        },
        {
          id: 'async-output',
          fromNodeId: 'async',
          fromPortId: 'result',
          toNodeId: 'output',
          toPortId: 'in',
        },
      ],
    };
    const outer: NodeDefinition = {
      ...createDoubleComposite('composite/outer'),
      label: 'Outer',
    };
    outer.compositeSubgraph = {
      ...outer.compositeSubgraph!,
      nodes: [
        outer.compositeSubgraph!.nodes[0],
        { id: 'inner', typeId: inner.typeId, x: 100, y: 0 },
        outer.compositeSubgraph!.nodes[2],
      ],
      connections: [
        {
          id: 'input-inner',
          fromNodeId: 'input',
          fromPortId: 'out',
          toNodeId: 'inner',
          toPortId: 'value',
        },
        {
          id: 'inner-output',
          fromNodeId: 'inner',
          fromPortId: 'result',
          toNodeId: 'output',
          toPortId: 'in',
        },
      ],
    };
    const nestedDefinitions = new Map(definitions);
    for (const definition of [groupInput, groupOutput, asyncDefinition, inner, outer]) {
      nestedDefinitions.set(definition.typeId, definition);
    }
    const session = new HierarchicalExecutionDebugger(
      [
        { id: 'source', typeId: 'input', x: 0, y: 0, state: { value: 2 } },
        { id: 'outer', typeId: outer.typeId, x: 200, y: 0 },
      ],
      [
        {
          id: 'source-outer',
          fromNodeId: 'source',
          fromPortId: 'value',
          toNodeId: 'outer',
          toPortId: 'value',
        },
      ],
      nestedDefinitions,
    );

    const running = session.continue();
    await waitFor(() => session.getSnapshot().path?.join('/') === 'outer/inner');
    await waitFor(() => session.getSnapshot().status === 'waiting');
    expect(session.getSnapshot().breadcrumbs?.map(({ label }) => label)).toEqual([
      '親グラフ',
      'Outer',
      'Inner',
    ]);
    session.cancel();
    await running;
    expect(session.getSnapshot().status).toBe('cancelled');
  });

  it('records a completed Promise node inside a composite', async () => {
    const promiseNode: NodeDefinition = {
      typeId: 'promise-double',
      label: 'Promise Double',
      category: 'Async',
      kind: 'pure',
      isAsync: true,
      inputs: [{ id: 'value', name: 'value', type: 'number' }],
      outputs: [{ id: 'result', name: 'result', type: 'number' }],
      evaluate: async (inputs) => ({ result: inputs.value * 2 }),
    };
    const composite = createDoubleComposite('composite/promise');
    composite.compositeSubgraph = {
      ...composite.compositeSubgraph!,
      nodes: [
        composite.compositeSubgraph!.nodes[0],
        { id: 'promise', typeId: promiseNode.typeId, x: 100, y: 0 },
        composite.compositeSubgraph!.nodes[2],
      ],
      connections: [
        {
          id: 'input-promise',
          fromNodeId: 'input',
          fromPortId: 'out',
          toNodeId: 'promise',
          toPortId: 'value',
        },
        {
          id: 'promise-output',
          fromNodeId: 'promise',
          fromPortId: 'result',
          toNodeId: 'output',
          toPortId: 'in',
        },
      ],
    };
    const nestedDefinitions = new Map(definitions);
    for (const definition of [groupInput, groupOutput, promiseNode, composite]) {
      nestedDefinitions.set(definition.typeId, definition);
    }
    const session = new HierarchicalExecutionDebugger(
      [
        { id: 'source', typeId: 'input', x: 0, y: 0, state: { value: 5 } },
        { id: 'promise-composite', typeId: composite.typeId, x: 200, y: 0 },
      ],
      [
        {
          id: 'source-composite',
          fromNodeId: 'source',
          fromPortId: 'value',
          toNodeId: 'promise-composite',
          toPortId: 'value',
        },
      ],
      nestedDefinitions,
    );

    await session.continue();
    expect(session.getSnapshot().traces['promise-composite'].outputs).toEqual({ result: 10 });
    expect(session.enterComposite('promise-composite').traces.promise).toMatchObject({
      status: 'completed',
      outputs: { result: 10 },
    });
  });

  it('records Stream progress and output inside a composite', async () => {
    const streamSource: NodeDefinition = {
      typeId: 'stream-source-composite',
      label: 'Stream Source',
      category: 'Stream',
      kind: 'pure',
      inputs: [],
      outputs: [{ id: 'stream', name: 'stream', type: 'stream<number>' }],
      evaluate: () => ({
        stream: {
          async *[Symbol.asyncIterator]() {
            yield 1;
            yield 2;
            yield 3;
          },
        },
      }),
    };
    const collectNode: NodeDefinition = {
      typeId: 'stream/collect',
      label: 'Collect',
      category: 'Stream',
      kind: 'output',
      isAsync: true,
      inputs: [{ id: 'stream', name: 'stream', type: 'stream<number>' }],
      outputs: [
        { id: 'array', name: 'array', type: 'array<number>' },
        { id: 'count', name: 'count', type: 'number' },
      ],
      evaluate: () => ({}),
    };
    const composite: NodeDefinition = {
      typeId: 'composite/stream',
      label: 'Stream Composite',
      category: 'Composite',
      kind: 'pure',
      isComposite: true,
      inputs: [],
      outputs: [{ id: 'result', name: 'result', type: 'array<number>' }],
      evaluate: () => ({}),
      compositeSubgraph: {
        nodes: [
          { id: 'source', typeId: streamSource.typeId, x: 0, y: 0 },
          { id: 'collect', typeId: collectNode.typeId, x: 100, y: 0 },
          {
            id: 'output',
            typeId: groupOutput.typeId,
            x: 200,
            y: 0,
            state: { portName: 'result', portType: 'array<number>' },
          },
        ],
        connections: [
          {
            id: 'source-collect',
            fromNodeId: 'source',
            fromPortId: 'stream',
            toNodeId: 'collect',
            toPortId: 'stream',
          },
          {
            id: 'collect-output',
            fromNodeId: 'collect',
            fromPortId: 'array',
            toNodeId: 'output',
            toPortId: 'in',
          },
        ],
        inputNodeIds: [],
        outputNodeIds: ['output'],
        outputPortMappings: [{ externalPortId: 'result', internalNodeId: 'output' }],
      },
    };
    const nestedDefinitions = new Map(definitions);
    for (const definition of [groupOutput, streamSource, collectNode, composite]) {
      nestedDefinitions.set(definition.typeId, definition);
    }
    const session = new HierarchicalExecutionDebugger(
      [{ id: 'stream-composite', typeId: composite.typeId, x: 0, y: 0 }],
      [],
      nestedDefinitions,
    );

    const progressCounts: number[] = [];
    await session.continue((snapshot) => {
      const count = snapshot.traces.collect?.streamCount;
      if (count !== undefined) progressCounts.push(count);
    });
    expect(session.getSnapshot().traces['stream-composite'].outputs).toEqual({ result: [1, 2, 3] });
    expect(session.enterComposite('stream-composite').traces.collect).toMatchObject({
      status: 'completed',
      outputs: { array: [1, 2, 3], count: 3 },
    });
    expect(progressCounts).toEqual([1, 2, 3]);
  });

  it('shows an internal error and propagates its hierarchical path to the parent trace', async () => {
    const failingNode: NodeDefinition = {
      typeId: 'failing-child',
      label: 'Failing Child',
      category: 'Math',
      kind: 'pure',
      inputs: [{ id: 'value', name: 'value', type: 'number' }],
      outputs: [{ id: 'result', name: 'result', type: 'number' }],
      evaluate: () => {
        throw new Error('inner failed');
      },
    };
    const composite = createDoubleComposite('composite/failing');
    composite.compositeSubgraph = {
      ...composite.compositeSubgraph!,
      nodes: [
        composite.compositeSubgraph!.nodes[0],
        { id: 'failure', typeId: failingNode.typeId, x: 100, y: 0 },
        composite.compositeSubgraph!.nodes[2],
      ],
      connections: [
        {
          id: 'input-failure',
          fromNodeId: 'input',
          fromPortId: 'out',
          toNodeId: 'failure',
          toPortId: 'value',
        },
        {
          id: 'failure-output',
          fromNodeId: 'failure',
          fromPortId: 'result',
          toNodeId: 'output',
          toPortId: 'in',
        },
      ],
    };
    const nestedDefinitions = new Map(definitions);
    for (const definition of [groupInput, groupOutput, failingNode, composite]) {
      nestedDefinitions.set(definition.typeId, definition);
    }
    const session = new HierarchicalExecutionDebugger(
      [
        { id: 'source', typeId: 'input', x: 0, y: 0, state: { value: 1 } },
        { id: 'failing-composite', typeId: composite.typeId, x: 200, y: 0 },
      ],
      [
        {
          id: 'source-composite',
          fromNodeId: 'source',
          fromPortId: 'value',
          toNodeId: 'failing-composite',
          toPortId: 'value',
        },
      ],
      nestedDefinitions,
    );

    await session.continue();
    expect(session.getSnapshot().traces['failing-composite'].error).toMatch(
      /failing-composite.*output.*入力元ノード.*inner failed/,
    );
    expect(session.enterComposite('failing-composite').traces.failure).toMatchObject({
      status: 'error',
      error: 'inner failed',
    });
  });
});
