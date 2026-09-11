import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  detectDirtySeedNodeIds,
  evaluateGraph,
  generateTypeScriptCode,
  getDownstreamNodeIds,
  getTopologicalOrder,
  unpackCompositeNode,
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

  it('math/sqrtは負数を定義域エラーにする', () => {
    const sqrt = BUILTIN_NODES.find(({ typeId }) => typeId === 'math/sqrt');

    expect(sqrt).toBeDefined();
    expect(() => sqrt!.evaluate({ value: -1 }, {})).toThrow('DOMAIN_ERROR');
  });

  it('必須入力が未接続なら既定値を使わずエラーにする', () => {
    const builtins = new Map(BUILTIN_NODES.map((definition) => [definition.typeId, definition]));
    const result = evaluateGraph([{ id: 'add', typeId: 'math/add', x: 0, y: 0 }], [], builtins);

    expect(result.add.error).toContain('INPUT_REQUIRED');
  });

  it('接続値の実行時型を検証する', () => {
    const source: NodeDefinition = {
      typeId: 'test/string-source',
      label: 'String source',
      category: 'Custom',
      kind: 'input',
      inputs: [],
      outputs: [{ id: 'value', name: 'value', type: 'any' }],
      evaluate: () => ({ value: 'not a number' }),
    };
    const builtins = new Map(BUILTIN_NODES.map((definition) => [definition.typeId, definition]));
    builtins.set(source.typeId, source);
    const result = evaluateGraph(
      [
        { id: 'source', typeId: source.typeId, x: 0, y: 0 },
        { id: 'round', typeId: 'math/round', x: 100, y: 0 },
      ],
      [
        {
          id: 'connection',
          fromNodeId: 'source',
          fromPortId: 'value',
          toNodeId: 'round',
          toPortId: 'value',
        },
      ],
      builtins,
    );

    expect(result.round.error).toContain('INPUT_TYPE');
  });
});

describe('generateTypeScriptCode', () => {
  it('input/jsonの不正JSONを生成コードでもINPUT_TYPEにする', () => {
    const builtins = new Map(BUILTIN_NODES.map((definition) => [definition.typeId, definition]));
    const code = generateTypeScriptCode(
      [
        { id: 'json', typeId: 'input/json', x: 0, y: 0, state: { rawJson: '[]' } },
        { id: 'output', typeId: 'output/inspector', x: 200, y: 0 },
      ],
      [
        {
          id: 'json-output',
          fromNodeId: 'json',
          fromPortId: 'value',
          toNodeId: 'output',
          toPortId: 'value',
        },
      ],
      builtins,
    );

    expect(() => compileGeneratedPipeline(code)()).toThrow('INPUT_TYPE');
  });

  it('2Dベクトル長プリセットと同じ結果を生成コードでも返す', () => {
    const preset = PRESETS.find(({ id }) => id === 'composite-vector-length');
    const builtins = new Map(BUILTIN_NODES.map((definition) => [definition.typeId, definition]));

    expect(preset).toBeDefined();
    const code = generateTypeScriptCode(preset!.nodes, preset!.connections, builtins);
    const evaluatePipeline = compileGeneratedPipeline(code);

    expect(Object.values(evaluatePipeline())).toEqual([5]);
    expect(Object.values(evaluatePipeline({ x: 6, y: 8 }))).toEqual([10]);
  });

  it('math/sqrtの負数入力を定義域エラーとして生成する', () => {
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

    expect(() => evaluatePipeline()).toThrow('DOMAIN_ERROR');
  });
});

describe('unpackCompositeNode', () => {
  const compositeDefinition: NodeDefinition = {
    typeId: 'composite/sum-product',
    label: 'Sum and Product',
    category: 'Composite',
    kind: 'pure',
    inputs: [
      { id: 'a', name: 'a', type: 'number' },
      { id: 'b', name: 'b', type: 'number' },
    ],
    outputs: [
      { id: 'sum', name: 'sum', type: 'number' },
      { id: 'product', name: 'product', type: 'number' },
    ],
    isComposite: true,
    compositeSubgraph: {
      nodes: [
        {
          id: 'in-a',
          typeId: 'composite/input-port',
          x: 0,
          y: 0,
          state: { portName: 'value', portType: 'number', testValue: 0 },
        },
        {
          id: 'in-b',
          typeId: 'composite/input-port',
          x: 0,
          y: 160,
          state: { portName: 'value', portType: 'number', testValue: 0 },
        },
        { id: 'add', typeId: 'math/add', x: 220, y: 0 },
        { id: 'multiply', typeId: 'math/multiply', x: 220, y: 180 },
        {
          id: 'out-sum',
          typeId: 'composite/output-port',
          x: 440,
          y: 0,
          state: { portName: 'value', portType: 'number' },
        },
        {
          id: 'out-product',
          typeId: 'composite/output-port',
          x: 440,
          y: 180,
          state: { portName: 'value', portType: 'number' },
        },
      ],
      connections: [
        { id: 'a-add', fromNodeId: 'in-a', fromPortId: 'out', toNodeId: 'add', toPortId: 'a' },
        { id: 'b-add', fromNodeId: 'in-b', fromPortId: 'out', toNodeId: 'add', toPortId: 'b' },
        {
          id: 'a-multiply',
          fromNodeId: 'in-a',
          fromPortId: 'out',
          toNodeId: 'multiply',
          toPortId: 'a',
        },
        {
          id: 'b-multiply',
          fromNodeId: 'in-b',
          fromPortId: 'out',
          toNodeId: 'multiply',
          toPortId: 'b',
        },
        {
          id: 'add-sum',
          fromNodeId: 'add',
          fromPortId: 'result',
          toNodeId: 'out-sum',
          toPortId: 'in',
        },
        {
          id: 'multiply-product',
          fromNodeId: 'multiply',
          fromPortId: 'result',
          toNodeId: 'out-product',
          toPortId: 'in',
        },
      ],
      inputNodeIds: ['in-a', 'in-b'],
      outputNodeIds: ['out-sum', 'out-product'],
      inputPortMappings: [
        { externalPortId: 'a', internalNodeId: 'in-a' },
        { externalPortId: 'b', internalNodeId: 'in-b' },
      ],
      outputPortMappings: [
        { externalPortId: 'sum', internalNodeId: 'out-sum' },
        { externalPortId: 'product', internalNodeId: 'out-product' },
      ],
    },
    evaluate: () => ({}),
  };

  const outerNodes: NodeInstance[] = [
    { id: 'input-a', typeId: 'input/number', x: 0, y: 0, state: { value: 3 } },
    { id: 'input-b', typeId: 'input/number', x: 0, y: 160, state: { value: 4 } },
    { id: 'composite', typeId: compositeDefinition.typeId, x: 250, y: 80 },
    { id: 'sum-output', typeId: 'output/inspector', x: 550, y: 0 },
    { id: 'product-output', typeId: 'output/inspector', x: 550, y: 180 },
  ];
  const outerConnections: Connection[] = [
    {
      id: 'input-a-comp',
      fromNodeId: 'input-a',
      fromPortId: 'value',
      toNodeId: 'composite',
      toPortId: 'a',
    },
    {
      id: 'input-b-comp',
      fromNodeId: 'input-b',
      fromPortId: 'value',
      toNodeId: 'composite',
      toPortId: 'b',
    },
    {
      id: 'comp-sum',
      fromNodeId: 'composite',
      fromPortId: 'sum',
      toNodeId: 'sum-output',
      toPortId: 'value',
    },
    {
      id: 'comp-product',
      fromNodeId: 'composite',
      fromPortId: 'product',
      toNodeId: 'product-output',
      toPortId: 'value',
    },
  ];

  it('複数の外部入出力を再接続して評価結果を維持する', () => {
    const beforeDefinitions = new Map(
      [...BUILTIN_NODES, compositeDefinition].map((definition) => [definition.typeId, definition]),
    );
    const before = evaluateGraph(outerNodes, outerConnections, beforeDefinitions);
    const unpacked = unpackCompositeNode(
      outerNodes,
      outerConnections,
      'composite',
      compositeDefinition,
    );
    const afterDefinitions = new Map(
      BUILTIN_NODES.map((definition) => [definition.typeId, definition]),
    );
    const after = evaluateGraph(unpacked.nodes, unpacked.connections, afterDefinitions);

    expect(before['sum-output'].outputs.displayedValue).toBe(7);
    expect(before['product-output'].outputs.displayedValue).toBe(12);
    expect(after['sum-output'].outputs.displayedValue).toBe(7);
    expect(after['product-output'].outputs.displayedValue).toBe(12);
    expect(unpacked.warnings).toEqual([]);
    expect(unpacked.nodes.some(({ id }) => id === 'composite')).toBe(false);
    expect(new Set(unpacked.nodes.map(({ id }) => id)).size).toBe(unpacked.nodes.length);
    expect(new Set(unpacked.connections.map(({ id }) => id)).size).toBe(
      unpacked.connections.length,
    );
  });

  it('対応する内部端子がない外部接続を警告する', () => {
    const brokenConnection: Connection = {
      id: 'broken-input',
      fromNodeId: 'input-a',
      fromPortId: 'value',
      toNodeId: 'composite',
      toPortId: 'missing',
    };

    const unpacked = unpackCompositeNode(
      outerNodes,
      [...outerConnections, brokenConnection],
      'composite',
      compositeDefinition,
    );

    expect(unpacked.warnings).toEqual([
      "接続 'broken-input': 入力ポート 'missing' の内部端子が見つかりません。",
    ]);
    expect(unpacked.connections.some(({ id }) => id === 'broken-input')).toBe(false);
  });
});
