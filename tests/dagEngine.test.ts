import { describe, expect, it } from 'vitest';

import {
  detectDirtySeedNodeIds,
  evaluateGraph,
  getDownstreamNodeIds,
  getTopologicalOrder,
  wouldCreateCycle,
} from '../src/engine/dagEngine';
import type { Connection, NodeDefinition, NodeInstance } from '../src/types';

const nodes: NodeInstance[] = [
  { id: 'input-a', typeId: 'test/input', x: 0, y: 0, state: { value: 2 } },
  { id: 'input-b', typeId: 'test/input', x: 0, y: 100, state: { value: 3 } },
  { id: 'sum', typeId: 'test/add', x: 200, y: 50 },
];

const connections: Connection[] = [
  {
    id: 'a-to-sum',
    fromNodeId: 'input-a',
    fromPortId: 'value',
    toNodeId: 'sum',
    toPortId: 'a',
  },
  {
    id: 'b-to-sum',
    fromNodeId: 'input-b',
    fromPortId: 'value',
    toNodeId: 'sum',
    toPortId: 'b',
  },
];

const definitions = new Map<string, NodeDefinition>([
  [
    'test/input',
    {
      typeId: 'test/input',
      label: 'Input',
      category: 'Input',
      kind: 'input',
      inputs: [],
      outputs: [{ id: 'value', name: 'value', type: 'number' }],
      evaluate: (_inputs, state) => ({ value: state.value }),
    },
  ],
  [
    'test/add',
    {
      typeId: 'test/add',
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

describe('DAG utilities', () => {
  it('依存関係を満たすトポロジカル順を返す', () => {
    const result = getTopologicalOrder(nodes, connections);

    expect(result.hasCycle).toBe(false);
    expect(result.order.indexOf('input-a')).toBeLessThan(result.order.indexOf('sum'));
    expect(result.order.indexOf('input-b')).toBeLessThan(result.order.indexOf('sum'));
  });

  it('自己接続と閉路を作る接続を検出する', () => {
    expect(wouldCreateCycle(connections, 'sum', 'sum')).toBe(true);
    expect(wouldCreateCycle(connections, 'sum', 'input-a')).toBe(true);
    expect(wouldCreateCycle(connections, 'input-a', 'input-b')).toBe(false);
  });

  it('起点を含む下流ノードを列挙する', () => {
    expect(getDownstreamNodeIds(['input-a'], connections)).toEqual(new Set(['input-a', 'sum']));
  });
});

describe('detectDirtySeedNodeIds', () => {
  it('位置とラベルだけの変更を無視する', () => {
    const moved = nodes.map((node) => ({ ...node, x: node.x + 10, customLabel: '移動済み' }));

    expect(detectDirtySeedNodeIds(nodes, moved, connections, connections)).toEqual(new Set());
  });

  it('状態を変更したノードをdirtyとして返す', () => {
    const changed = nodes.map((node) =>
      node.id === 'input-a' ? { ...node, state: { value: 10 } } : node,
    );

    expect(detectDirtySeedNodeIds(nodes, changed, connections, connections)).toEqual(
      new Set(['input-a']),
    );
  });
});

describe('evaluateGraph', () => {
  it('トポロジカル順に入力を解決して評価する', () => {
    const result = evaluateGraph(nodes, connections, definitions);

    expect(result.sum.inputs).toEqual({ a: 2, b: 3 });
    expect(result.sum.outputs).toEqual({ result: 5 });
    expect(result.sum.error).toBeUndefined();
  });

  it('対象外ノードの前回結果をキャッシュとして再利用する', () => {
    const previous = evaluateGraph(nodes, connections, definitions);
    const dirty = new Set(['input-a', 'sum']);
    const result = evaluateGraph(nodes, connections, definitions, previous, dirty);

    expect(result['input-b'].isCached).toBe(true);
    expect(result['input-a'].isCached).toBe(false);
    expect(result.sum.outputs.result).toBe(5);
  });
});
