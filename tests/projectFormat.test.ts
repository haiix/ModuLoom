import { afterEach, describe, expect, it, vi } from 'vitest';

import { evaluateGraph, evaluateGraphAsync } from '../src/engine/dagEngine';
import {
  CURRENT_PROJECT_VERSION,
  parseFlowProject,
  parseFlowProjectJson,
  ProjectValidationError,
} from '../src/engine/projectFormat';
import { BUILTIN_NODES } from '../src/nodes/definitions';
import type { LoadedFlowProject, NodeDefinition } from '../src/types';

function createProject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: CURRENT_PROJECT_VERSION,
    appName: 'Test Project',
    exportedAt: '2026-09-08T00:00:00.000Z',
    nodes: [],
    connections: [],
    customTypes: [],
    customDefinitions: [],
    viewport: { zoom: 1, pan: { x: 0, y: 0 } },
    ...overrides,
  };
}

describe('project JSON', () => {
  it('破損したJSONをプロジェクト検証前に拒否する', () => {
    expect(() => parseFlowProjectJson('{"version":')).toThrowError(/JSON/);
  });
});

function createRoundTripProject(): LoadedFlowProject {
  const doubleDefinition: NodeDefinition = {
    typeId: 'custom/double',
    label: 'Double',
    category: 'Custom',
    kind: 'pure',
    description: '',
    inputs: [{ id: 'value', name: 'value', type: 'number', defaultValue: 0 }],
    outputs: [{ id: 'result', name: 'result', type: 'number' }],
    customCode: 'inputs.value * 2',
    evaluate: (inputs) => ({ result: inputs.value * 2 }),
  };

  return {
    version: CURRENT_PROJECT_VERSION,
    appName: 'Custom node round trip',
    exportedAt: '2026-09-08T00:00:00.000Z',
    nodes: [
      { id: 'input', typeId: 'input/number', x: 0, y: 0, state: { value: 21 } },
      { id: 'double', typeId: 'custom/double', x: 200, y: 0 },
      { id: 'output', typeId: 'output/inspector', x: 400, y: 0 },
    ],
    connections: [
      {
        id: 'input-double',
        fromNodeId: 'input',
        fromPortId: 'value',
        toNodeId: 'double',
        toPortId: 'value',
      },
      {
        id: 'double-output',
        fromNodeId: 'double',
        fromPortId: 'result',
        toNodeId: 'output',
        toPortId: 'value',
      },
    ],
    customTypes: [],
    customDefinitions: [doubleDefinition],
    viewport: { zoom: 1.25, pan: { x: 10, y: 20 } },
  };
}

function createCompositeRoundTripProject(): LoadedFlowProject {
  const compositeDefinition: NodeDefinition = {
    typeId: 'composite/double',
    label: 'Composite Double',
    category: 'Composite',
    kind: 'pure',
    inputs: [{ id: 'x', name: 'x', type: 'number' }],
    outputs: [{ id: 'result', name: 'result', type: 'number' }],
    isComposite: true,
    compositeSubgraph: {
      nodes: [
        {
          id: 'inner-input',
          typeId: 'composite/input-port',
          x: 0,
          y: 0,
          state: { portName: 'x', portType: 'number', testValue: 0 },
        },
        {
          id: 'inner-two',
          typeId: 'input/number',
          x: 0,
          y: 100,
          state: { value: 2 },
        },
        { id: 'inner-multiply', typeId: 'math/multiply', x: 200, y: 0 },
        {
          id: 'inner-output',
          typeId: 'composite/output-port',
          x: 400,
          y: 0,
          state: { portName: 'result', portType: 'number' },
        },
      ],
      connections: [
        {
          id: 'inner-x-multiply',
          fromNodeId: 'inner-input',
          fromPortId: 'out',
          toNodeId: 'inner-multiply',
          toPortId: 'a',
        },
        {
          id: 'inner-two-multiply',
          fromNodeId: 'inner-two',
          fromPortId: 'value',
          toNodeId: 'inner-multiply',
          toPortId: 'b',
        },
        {
          id: 'inner-multiply-output',
          fromNodeId: 'inner-multiply',
          fromPortId: 'result',
          toNodeId: 'inner-output',
          toPortId: 'in',
        },
      ],
      inputNodeIds: ['inner-input'],
      outputNodeIds: ['inner-output'],
      inputPortMappings: [{ externalPortId: 'x', internalNodeId: 'inner-input' }],
      outputPortMappings: [{ externalPortId: 'result', internalNodeId: 'inner-output' }],
    },
    evaluate: () => ({}),
  };

  return {
    version: CURRENT_PROJECT_VERSION,
    appName: 'Composite round trip',
    exportedAt: '2026-09-08T00:00:00.000Z',
    nodes: [
      { id: 'input', typeId: 'input/number', x: 0, y: 0, state: { value: 5 } },
      { id: 'composite', typeId: 'composite/double', x: 200, y: 0 },
      { id: 'output', typeId: 'output/inspector', x: 400, y: 0 },
    ],
    connections: [
      {
        id: 'input-composite',
        fromNodeId: 'input',
        fromPortId: 'value',
        toNodeId: 'composite',
        toPortId: 'x',
      },
      {
        id: 'composite-output',
        fromNodeId: 'composite',
        fromPortId: 'result',
        toNodeId: 'output',
        toPortId: 'value',
      },
    ],
    customTypes: [],
    customDefinitions: [compositeDefinition],
  };
}

describe('project file round trip', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('自作ノードをJSON保存・再読み込みして同じ結果を得る', async () => {
    vi.stubGlobal('Worker', EvaluatingWorker);
    const original = createRoundTripProject();
    const originalDefinitions = new Map(
      [...BUILTIN_NODES, ...original.customDefinitions!].map((definition) => [
        definition.typeId,
        definition,
      ]),
    );
    const before = evaluateGraph(original.nodes, original.connections, originalDefinitions);

    const loaded = parseFlowProjectJson(JSON.stringify(original));
    const loadedDefinitions = new Map(
      [...BUILTIN_NODES, ...loaded.customDefinitions!].map((definition) => [
        definition.typeId,
        definition,
      ]),
    );
    const after = await evaluateGraphAsync(loaded.nodes, loaded.connections, loadedDefinitions);

    expect(before.output.outputs.displayedValue).toBe(42);
    expect(after.output.outputs.displayedValue).toBe(42);
    expect(loaded.viewport).toEqual(original.viewport);
    expect(loaded.customDefinitions![0].description).toBe('');
    await expect(loaded.customDefinitions![0].evaluate({ value: 5 })).resolves.toEqual({
      result: 10,
    });
  });

  it('複合ノードをJSON保存・再読み込みして同じ結果を得る', () => {
    const loaded = parseFlowProjectJson(JSON.stringify(createCompositeRoundTripProject()));
    const definitions = new Map(
      [...BUILTIN_NODES, ...loaded.customDefinitions!].map((definition) => [
        definition.typeId,
        definition,
      ]),
    );

    const result = evaluateGraph(loaded.nodes, loaded.connections, definitions);

    expect(result.output.outputs.displayedValue).toBe(10);
    expect(loaded.customDefinitions![0].compositeSubgraph?.inputPortMappings).toEqual([
      { externalPortId: 'x', internalNodeId: 'inner-input' },
    ]);
  });
});

class EvaluatingWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(message: { id: number; code: string; inputs: Record<string, unknown> }) {
    Promise.resolve()
      .then(() => new Function('inputs', `return (${message.code});`)(message.inputs))
      .then((value) =>
        this.onmessage?.({ data: { id: message.id, ok: true, value } } as MessageEvent),
      )
      .catch((error) =>
        this.onmessage?.({
          data: { id: message.id, ok: false, error: String(error) },
        } as MessageEvent),
      );
  }

  terminate() {}
}

describe('project schema validation', () => {
  it('未対応バージョンを明確なメッセージで拒否する', () => {
    expect(() => parseFlowProject(createProject({ version: '2.0.0' }))).toThrowError(
      /project\.version: 未対応のバージョン '2\.0\.0'.*1\.1\.0/,
    );
  });

  it('重複するノードIDを適用前に拒否する', () => {
    const duplicateNode = { id: 'same', typeId: 'input/number', x: 0, y: 0 };
    const project = createProject({ nodes: [duplicateNode, duplicateNode] });

    expect(() => parseFlowProject(project)).toThrowError(
      /project\.nodes\[1\]\.id: ID 'same' が重複しています/,
    );
  });

  it('重複する接続IDを適用前に拒否する', () => {
    const project = createProject({
      nodes: [
        { id: 'input', typeId: 'input/number', x: 0, y: 0 },
        { id: 'add', typeId: 'math/add', x: 200, y: 0 },
      ],
      connections: [
        {
          id: 'duplicate',
          fromNodeId: 'input',
          fromPortId: 'value',
          toNodeId: 'add',
          toPortId: 'a',
        },
        {
          id: 'duplicate',
          fromNodeId: 'input',
          fromPortId: 'value',
          toNodeId: 'add',
          toPortId: 'b',
        },
      ],
    });

    expect(() => parseFlowProject(project)).toThrowError(
      /project\.connections\[1\]\.id: ID 'duplicate' が重複しています/,
    );
  });

  it('存在しない接続先ノードを特定して拒否する', () => {
    const project = createProject({
      nodes: [{ id: 'input', typeId: 'input/number', x: 0, y: 0 }],
      connections: [
        {
          id: 'broken',
          fromNodeId: 'input',
          fromPortId: 'value',
          toNodeId: 'missing',
          toPortId: 'value',
        },
      ],
    });

    expect(() => parseFlowProject(project)).toThrowError(
      /project\.connections\[0\]\.toNodeId: ノード 'missing' が存在しません/,
    );
  });

  it('存在しないポートを特定して拒否する', () => {
    const project = createProject({
      nodes: [
        { id: 'input', typeId: 'input/number', x: 0, y: 0 },
        { id: 'output', typeId: 'output/inspector', x: 200, y: 0 },
      ],
      connections: [
        {
          id: 'broken-port',
          fromNodeId: 'input',
          fromPortId: 'missing',
          toNodeId: 'output',
          toPortId: 'value',
        },
      ],
    });

    expect(() => parseFlowProject(project)).toThrowError(
      /project\.connections\[0\]\.fromPortId: 出力ポート 'missing' が存在しません/,
    );
  });

  it('同じ入力ポートへの重複接続を拒否する', () => {
    const project = createProject({
      nodes: [
        { id: 'input-a', typeId: 'input/number', x: 0, y: 0 },
        { id: 'input-b', typeId: 'input/number', x: 0, y: 100 },
        { id: 'output', typeId: 'output/inspector', x: 200, y: 0 },
      ],
      connections: [
        {
          id: 'a-output',
          fromNodeId: 'input-a',
          fromPortId: 'value',
          toNodeId: 'output',
          toPortId: 'value',
        },
        {
          id: 'b-output',
          fromNodeId: 'input-b',
          fromPortId: 'value',
          toNodeId: 'output',
          toPortId: 'value',
        },
      ],
    });

    expect(() => parseFlowProject(project)).toThrowError(/入力 'output:value' に複数の接続/);
  });

  it('互換性のないポート型を拒否する', () => {
    const project = createProject({
      nodes: [
        { id: 'text', typeId: 'input/text', x: 0, y: 0 },
        { id: 'add', typeId: 'math/add', x: 200, y: 0 },
      ],
      connections: [
        {
          id: 'text-add',
          fromNodeId: 'text',
          fromPortId: 'value',
          toNodeId: 'add',
          toPortId: 'a',
        },
      ],
    });

    expect(() => parseFlowProject(project)).toThrowError(
      /型 'string' の出力を型 'number' の入力へ接続できません/,
    );
  });

  it('循環する接続を拒否する', () => {
    const project = createProject({
      nodes: [
        { id: 'add-a', typeId: 'math/add', x: 0, y: 0 },
        { id: 'add-b', typeId: 'math/add', x: 200, y: 0 },
      ],
      connections: [
        {
          id: 'a-b',
          fromNodeId: 'add-a',
          fromPortId: 'result',
          toNodeId: 'add-b',
          toPortId: 'a',
        },
        {
          id: 'b-a',
          fromNodeId: 'add-b',
          fromPortId: 'result',
          toNodeId: 'add-a',
          toPortId: 'a',
        },
      ],
    });

    expect(() => parseFlowProject(project)).toThrowError(/循環参照が検出されました/);
  });

  it('自作ノード式の構文エラー位置を表示する', () => {
    const project = createProject({
      customDefinitions: [
        {
          typeId: 'custom/broken',
          label: 'Broken',
          category: 'Custom',
          kind: 'pure',
          inputs: [],
          outputs: [{ id: 'result', name: 'result', type: 'number' }],
          customCode: 'inputs.',
        },
      ],
    });

    expect(() => parseFlowProject(project)).toThrowError(ProjectValidationError);
    expect(() => parseFlowProject(project)).toThrowError(
      /project\.customDefinitions\[0\]\.customCode: 式の構文エラー/,
    );
  });
});
