import {
  createCompilerHost,
  createProgram,
  createSourceFile,
  getPreEmitDiagnostics,
  ModuleKind,
  ScriptTarget,
  transpileModule,
  type CompilerOptions,
} from 'typescript';
import { describe, expect, it, vi } from 'vitest';

import {
  CodeGenerationError,
  evaluateGraph,
  generateTypeScriptCode,
} from '../src/engine/dagEngine';
import { generateNodesForCustomType, INITIAL_CUSTOM_TYPES } from '../src/nodes/customTypeNodes';
import { BUILTIN_NODES, PRESETS } from '../src/nodes/definitions';
import type { Connection, NodeDefinition, NodeInstance } from '../src/types';

const builtins = new Map(BUILTIN_NODES.map((definition) => [definition.typeId, definition]));

function compilePipeline(code: string): (inputs?: Record<string, unknown>) => unknown {
  const result = transpileModule(code, {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  expect(result.diagnostics ?? []).toEqual([]);
  const generatedModule: { evaluatePipeline?: (inputs?: Record<string, unknown>) => unknown } = {};
  new Function('exports', result.outputText)(generatedModule);
  expect(generatedModule.evaluatePipeline).toBeDefined();
  return generatedModule.evaluatePipeline!;
}

function expectTypechecks(code: string): void {
  const fileName = 'generated-pipeline.ts';
  const options: CompilerOptions = {
    module: ModuleKind.CommonJS,
    target: ScriptTarget.ES2022,
    strict: true,
    skipLibCheck: true,
  };
  const host = createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.fileExists = (candidate) =>
    candidate === fileName || createCompilerHost(options).fileExists(candidate);
  host.readFile = (candidate) =>
    candidate === fileName ? code : createCompilerHost(options).readFile(candidate);
  host.getSourceFile = (candidate, languageVersion, onError, shouldCreateNewSourceFile) =>
    candidate === fileName
      ? createSourceFile(fileName, code, languageVersion, true)
      : originalGetSourceFile(candidate, languageVersion, onError, shouldCreateNewSourceFile);
  const diagnostics = getPreEmitDiagnostics(createProgram([fileName], options, host));
  expect(diagnostics.map((diagnostic) => diagnostic.messageText)).toEqual([]);
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function makeValueSource(id: string, value: unknown, type: 'promise' | 'stream'): NodeDefinition {
  if (type === 'promise') {
    return {
      typeId: id,
      label: id,
      category: 'Custom',
      kind: 'pure',
      inputs: [],
      outputs: [{ id: 'value', name: 'value', type }],
      evaluate: () => ({ value: Promise.resolve(value) }),
      codegen: { emit: () => `{ value: Promise.resolve(${JSON.stringify(value)}) }` },
    };
  }

  return {
    typeId: id,
    label: id,
    category: 'Custom',
    kind: 'pure',
    inputs: [],
    outputs: [{ id: 'value', name: 'value', type }],
    evaluate: () => ({
      value: (async function* () {
        for (const item of value as unknown[]) yield item;
      })(),
    }),
    codegen: { emit: () => `{ value: createArrayStream(${JSON.stringify(value)}, 0) }` },
  };
}

const inputOverrides: Record<string, Record<string, unknown>> = {
  'math/divide': { a: 9, b: 3 },
  'array/map': { arr: [1, 2, 'x'], factor: 3 },
  'array/filter': { arr: [-1, 2, 4], threshold: 2 },
  'async/delay': { value: 'done', delayMs: 0 },
  'async/fetch': { endpoint: '/parity', latency: 0 },
  'stream/interval': { intervalMs: 20, limit: 2 },
  'stream/from_array': { items: [1, 2, 3], delayMs: 0 },
  'stream/map': { multiplier: 3 },
  'stream/filter': { threshold: 1 },
  'stream/take': { count: 2 },
};

const stateOverrides: Record<string, unknown> = {
  'input/array': { rawText: '1, two, 3', type: 'number' },
  'input/json': { rawJson: '{"ok":true}' },
  'array/map': { operator: '+' },
  'array/filter': { operator: '<=' },
  'stream/filter': { mode: 'odd' },
  'composite/input-port': { portName: 'x', portType: 'number', testValue: 7 },
  'composite/output-port': { portName: 'result', portType: 'number' },
};

async function normalize(value: unknown): Promise<unknown> {
  if (value && typeof (value as PromiseLike<unknown>).then === 'function') {
    return normalize(await value);
  }
  if (value && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
    const items: unknown[] = [];
    for await (const item of value as AsyncIterable<unknown>) items.push(await normalize(item));
    return items;
  }
  if (Array.isArray(value)) return Promise.all(value.map(normalize));
  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, item]) => [
        key,
        key === 'timestamp' ? '<timestamp>' : await normalize(item),
      ]),
    );
    return Object.fromEntries(entries);
  }
  return value;
}

async function compareBuiltin(definition: NodeDefinition): Promise<string> {
  const state = clone(stateOverrides[definition.typeId] ?? definition.defaultState);
  const overrides = inputOverrides[definition.typeId] ?? {};
  const runtimeInputs = Object.fromEntries(
    definition.inputs.map((port) => [
      port.id,
      Object.prototype.hasOwnProperty.call(overrides, port.id)
        ? clone(overrides[port.id])
        : clone(port.defaultValue),
    ]),
  );
  const nodes: NodeInstance[] = [{ id: 'target', typeId: definition.typeId, x: 0, y: 0, state }];
  const connections: Connection[] = [];
  const definitions = new Map(builtins);
  definitions.set(definition.typeId, {
    ...definition,
    inputs: definition.inputs.map((port) => ({ ...port, defaultValue: runtimeInputs[port.id] })),
  });

  for (const portId of definition.typeId === 'async/all'
    ? ['p1', 'p2']
    : definition.typeId === 'async/await'
      ? ['promise']
      : []) {
    const source = makeValueSource(`test/promise/${portId}`, `${portId}-value`, 'promise');
    definitions.set(source.typeId, source);
    nodes.unshift({ id: `source-${portId}`, typeId: source.typeId, x: 0, y: 0 });
    connections.push({
      id: `connection-${portId}`,
      fromNodeId: `source-${portId}`,
      fromPortId: 'value',
      toNodeId: 'target',
      toPortId: portId,
    });
    runtimeInputs[portId] = Promise.resolve(`${portId}-value`);
  }

  if (
    ['stream/map', 'stream/filter', 'stream/take', 'stream/collect'].includes(definition.typeId)
  ) {
    const source = makeValueSource('test/stream/source', [-1, 1, 2, 3], 'stream');
    definitions.set(source.typeId, source);
    nodes.unshift({ id: 'stream-source', typeId: source.typeId, x: 0, y: 0 });
    connections.push({
      id: 'stream-connection',
      fromNodeId: 'stream-source',
      fromPortId: 'value',
      toNodeId: 'target',
      toPortId: 'stream',
    });
    runtimeInputs.stream = (source.evaluate({}, {}) as Record<string, unknown>).value;
  }

  if (definition.kind !== 'output') {
    definition.outputs.forEach((output, index) => {
      const sinkId = `sink-${index}`;
      nodes.push({
        id: sinkId,
        typeId: 'output/inspector',
        x: 0,
        y: 0,
        customLabel: sinkId,
      });
      connections.push({
        id: `sink-connection-${index}`,
        fromNodeId: 'target',
        fromPortId: output.id,
        toNodeId: sinkId,
        toPortId: 'value',
      });
    });
  }

  const runtimeResult = await definition.evaluate(runtimeInputs, state);
  const code = generateTypeScriptCode(nodes, connections, definitions);
  const generatedResult = await compilePipeline(code)();
  const expectedValues =
    definition.outputs.length > 0
      ? definition.outputs.map((output) => runtimeResult[output.id])
      : [runtimeResult.displayedValue];

  expect(await normalize(Object.values(generatedResult as Record<string, unknown>))).toEqual(
    await normalize(expectedValues),
  );
  return code;
}

describe('runtime / TypeScript output parity', () => {
  it('すべてのビルトイン定義にコード生成メタデータがある', () => {
    expect(
      Object.keys(Object.fromEntries(BUILTIN_NODES.map((node) => [node.typeId, true]))),
    ).toHaveLength(BUILTIN_NODES.length);
    expect(BUILTIN_NODES.every((node) => node.codegen)).toBe(true);
  });

  it('すべてのビルトインノードでランタイムと生成結果が一致する', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    let representativeAsyncStreamCode = '';
    for (const definition of BUILTIN_NODES) {
      const code = await compareBuiltin(definition);
      if (definition.typeId === 'stream/collect') representativeAsyncStreamCode = code;
    }
    expectTypechecks(representativeAsyncStreamCode);
    vi.restoreAllMocks();
  }, 15_000);

  it('未対応ノードを暗黙の既定値へ変換せず生成前に拒否する', () => {
    const unsupported: NodeDefinition = {
      typeId: 'test/unsupported',
      label: 'Unsupported',
      category: 'Custom',
      kind: 'pure',
      inputs: [],
      outputs: [{ id: 'result', name: 'result', type: 'any' }],
      evaluate: () => ({ result: 1 }),
    };
    expect(() =>
      generateTypeScriptCode(
        [{ id: 'unsupported', typeId: unsupported.typeId, x: 0, y: 0 }],
        [],
        new Map([[unsupported.typeId, unsupported]]),
      ),
    ).toThrow(CodeGenerationError);
  });

  it('ゼロ除算はランタイムと生成コードの両方で失敗する', () => {
    const divide = builtins.get('math/divide')!;
    expect(() => divide.evaluate({ a: 1, b: 0 })).toThrow('ゼロ除算');
    const definitions = new Map(builtins);
    definitions.set('math/divide', {
      ...divide,
      inputs: divide.inputs.map((port) => ({
        ...port,
        defaultValue: port.id === 'a' ? 1 : 0,
      })),
    });
    const code = generateTypeScriptCode(
      [
        { id: 'divide', typeId: 'math/divide', x: 0, y: 0 },
        { id: 'sink', typeId: 'output/inspector', x: 0, y: 0 },
      ],
      [
        {
          id: 'result',
          fromNodeId: 'divide',
          fromPortId: 'result',
          toNodeId: 'sink',
          toPortId: 'value',
        },
      ],
      definitions,
    );
    expect(() => compilePipeline(code)()).toThrow('ゼロ除算');
  });

  it('複合ノードを内部グラフへ展開しランタイムと同じ結果を返す', () => {
    const composite: NodeDefinition = {
      typeId: 'composite/times-ten',
      label: 'Times Ten',
      category: 'Composite',
      kind: 'pure',
      isComposite: true,
      inputs: [{ id: 'x', name: 'x', type: 'number' }],
      outputs: [{ id: 'result', name: 'result', type: 'number' }],
      evaluate: () => ({ result: 0 }),
      compositeSubgraph: {
        nodes: [
          {
            id: 'input',
            typeId: 'composite/input-port',
            x: 0,
            y: 0,
            state: { portName: 'x', portType: 'number', testValue: 1 },
          },
          { id: 'ten', typeId: 'input/number', x: 0, y: 0, state: { value: 10 } },
          { id: 'multiply', typeId: 'math/multiply', x: 0, y: 0 },
          {
            id: 'output',
            typeId: 'composite/output-port',
            x: 0,
            y: 0,
            state: { portName: 'result', portType: 'number' },
          },
        ],
        connections: [
          {
            id: 'input-a',
            fromNodeId: 'input',
            fromPortId: 'out',
            toNodeId: 'multiply',
            toPortId: 'a',
          },
          {
            id: 'ten-b',
            fromNodeId: 'ten',
            fromPortId: 'value',
            toNodeId: 'multiply',
            toPortId: 'b',
          },
          {
            id: 'multiply-output',
            fromNodeId: 'multiply',
            fromPortId: 'result',
            toNodeId: 'output',
            toPortId: 'in',
          },
        ],
        inputNodeIds: ['input'],
        outputNodeIds: ['output'],
        inputPortMappings: [{ externalPortId: 'x', internalNodeId: 'input' }],
        outputPortMappings: [{ externalPortId: 'result', internalNodeId: 'output' }],
      },
    };
    const definitions = new Map(builtins);
    definitions.set(composite.typeId, composite);
    const nodes: NodeInstance[] = [
      { id: 'source', typeId: 'input/number', x: 0, y: 0, state: { value: 6 } },
      { id: 'composite', typeId: composite.typeId, x: 0, y: 0 },
      { id: 'sink', typeId: 'output/inspector', x: 0, y: 0 },
    ];
    const connections: Connection[] = [
      {
        id: 'source-composite',
        fromNodeId: 'source',
        fromPortId: 'value',
        toNodeId: 'composite',
        toPortId: 'x',
      },
      {
        id: 'composite-sink',
        fromNodeId: 'composite',
        fromPortId: 'result',
        toNodeId: 'sink',
        toPortId: 'value',
      },
    ];

    const runtime = evaluateGraph(nodes, connections, definitions);
    const generated = compilePipeline(generateTypeScriptCode(nodes, connections, definitions))();
    expect(Object.values(generated as Record<string, unknown>)).toEqual([
      runtime.sink.outputs.displayedValue,
    ]);
    expect(Object.values(generated as Record<string, unknown>)).toEqual([60]);
  });

  it('カスタム型ノードも生成コードとランタイムで一致し型検査を通る', () => {
    const preset = PRESETS.find(({ id }) => id === 'custom-type-pipeline')!;
    const definitions = new Map(builtins);
    for (const customType of INITIAL_CUSTOM_TYPES) {
      for (const definition of generateNodesForCustomType(customType)) {
        definitions.set(definition.typeId, definition);
      }
    }
    const runtime = evaluateGraph(preset.nodes, preset.connections, definitions);
    const code = generateTypeScriptCode(
      preset.nodes,
      preset.connections,
      definitions,
      INITIAL_CUSTOM_TYPES,
    );
    const generated = compilePipeline(code)() as Record<string, unknown>;
    const expected = preset.nodes
      .filter((node) => definitions.get(node.typeId)?.kind === 'output')
      .map((node) => runtime[node.id].outputs.displayedValue);

    expect(Object.values(generated)).toEqual(expected);
    expectTypechecks(code);
  });
});
