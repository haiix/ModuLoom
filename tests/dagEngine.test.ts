import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  detectDirtySeedNodeIds,
  evaluateGraph,
  generateTypeScriptCode,
  getDownstreamNodeIds,
  getTopologicalOrder,
  wouldCreateCycle,
} from '../src/engine/dagEngine';
import { BUILTIN_NODES, PRESETS } from '../src/nodes/definitions';
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

function compileGeneratedPipeline(
  code: string,
): (inputs?: Record<string, unknown>) => Record<string, unknown> {
  const compiled = transpileModule(code, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText;
  const generatedModule: {
    evaluatePipeline?: (inputs?: Record<string, unknown>) => Record<string, unknown>;
  } = {};
  new Function('exports', compiled)(generatedModule);

  expect(generatedModule.evaluatePipeline).toBeDefined();
  return generatedModule.evaluatePipeline!;
}

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

  it('2Dベクトル長プリセットで3と4から5を計算する', () => {
    const preset = PRESETS.find(({ id }) => id === 'composite-vector-length');
    const builtins = new Map(BUILTIN_NODES.map((definition) => [definition.typeId, definition]));

    expect(preset).toBeDefined();
    const result = evaluateGraph(preset!.nodes, preset!.connections, builtins);

    expect(result['nc-sqrt'].outputs.result).toBe(5);
    expect(result['nc-out'].outputs.length).toBe(5);
  });

  it('math/sqrtは負数に対してNaNを返す', () => {
    const sqrt = BUILTIN_NODES.find(({ typeId }) => typeId === 'math/sqrt');

    expect(sqrt).toBeDefined();
    expect(sqrt!.evaluate({ value: -1 }, {})).toEqual({ result: NaN });
  });
});

describe('generateTypeScriptCode', () => {
  it('2Dベクトル長プリセットと同じ結果を生成コードでも返す', () => {
    const preset = PRESETS.find(({ id }) => id === 'composite-vector-length');
    const builtins = new Map(BUILTIN_NODES.map((definition) => [definition.typeId, definition]));

    expect(preset).toBeDefined();
    const code = generateTypeScriptCode(preset!.nodes, preset!.connections, builtins);
    const evaluatePipeline = compileGeneratedPipeline(code);

    expect(Object.values(evaluatePipeline())).toEqual([5]);
    expect(Object.values(evaluatePipeline({ x: 6, y: 8 }))).toEqual([10]);
  });

  it('math/sqrtの負数入力をNaNとして生成する', () => {
    const builtins = new Map(BUILTIN_NODES.map((definition) => [definition.typeId, definition]));
    const sqrtNodes: NodeInstance[] = [
      {
        id: 'negative-input',
        typeId: 'input/number',
        x: 0,
        y: 0,
        state: { value: -1 },
        customLabel: 'value',
      },
      { id: 'sqrt', typeId: 'math/sqrt', x: 200, y: 0 },
      { id: 'output', typeId: 'output/inspector', x: 400, y: 0 },
    ];
    const sqrtConnections: Connection[] = [
      {
        id: 'input-to-sqrt',
        fromNodeId: 'negative-input',
        fromPortId: 'value',
        toNodeId: 'sqrt',
        toPortId: 'value',
      },
      {
        id: 'sqrt-to-output',
        fromNodeId: 'sqrt',
        fromPortId: 'result',
        toNodeId: 'output',
        toPortId: 'value',
      },
    ];
    const code = generateTypeScriptCode(sqrtNodes, sqrtConnections, builtins);
    const evaluatePipeline = compileGeneratedPipeline(code);

    expect(Object.values(evaluatePipeline())).toEqual([NaN]);
  });
});
