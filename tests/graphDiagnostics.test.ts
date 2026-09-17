import { describe, expect, it } from 'vitest';

import { analyzeGraph } from '../src/engine/graphDiagnostics';
import type { Connection, NodeDefinition, NodeInstance, Port } from '../src/types';

const codegen = { emit: () => '({ value: undefined })' };

function definition(
  typeId: string,
  kind: NodeDefinition['kind'],
  inputs: Port[] = [],
  outputs: Port[] = [],
  overrides: Partial<NodeDefinition> = {},
): NodeDefinition {
  return {
    typeId,
    label: typeId,
    category: kind === 'output' ? 'Output' : kind === 'input' ? 'Input' : 'Utility',
    kind,
    inputs,
    outputs,
    evaluate: () => ({}),
    codegen,
    execution: { determinism: 'deterministic' },
    ...overrides,
  };
}

function node(id: string, typeId: string): NodeInstance {
  return { id, typeId, x: 0, y: 0 };
}

describe('analyzeGraph', () => {
  it('reports missing required inputs as errors without mutating the graph', () => {
    const nodes = [node('target', 'pure/target')];
    const connections: Connection[] = [];
    const definitions = new Map([
      [
        'pure/target',
        definition('pure/target', 'pure', [
          { id: 'value', name: 'Value', type: 'number', required: true },
        ]),
      ],
    ]);
    const snapshot = JSON.stringify({ nodes, connections });

    const diagnostics = analyzeGraph(nodes, connections, definitions);

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'required-input',
          severity: 'error',
          nodeId: 'target',
        }),
      ]),
    );
    expect(JSON.stringify({ nodes, connections })).toBe(snapshot);
  });

  it('reports unused nodes and any-to-concrete boundaries as warnings', () => {
    const nodes = [
      node('source', 'input/any'),
      node('target', 'output/number'),
      node('unused', 'input/number'),
    ];
    const connections = [
      {
        id: 'c1',
        fromNodeId: 'source',
        fromPortId: 'value',
        toNodeId: 'target',
        toPortId: 'value',
      },
    ];
    const definitions = new Map([
      [
        'input/any',
        definition('input/any', 'input', [], [{ id: 'value', name: 'Value', type: 'any' }]),
      ],
      [
        'input/number',
        definition('input/number', 'input', [], [{ id: 'value', name: 'Value', type: 'number' }]),
      ],
      [
        'output/number',
        definition('output/number', 'output', [
          { id: 'value', name: 'Value', type: 'number', required: true },
        ]),
      ],
    ]);

    const diagnostics = analyzeGraph(nodes, connections, definitions);

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'any-boundary', severity: 'warning', nodeId: 'target' }),
        expect.objectContaining({ code: 'unused-node', severity: 'warning', nodeId: 'unused' }),
      ]),
    );
  });

  it('reports code generation, determinism, and custom-code trust metadata', () => {
    const nodes = [node('custom', 'custom/random')];
    const definitions = new Map([
      [
        'custom/random',
        definition('custom/random', 'pure', [], [], {
          codegen: undefined,
          customCode: 'Math.random()',
          execution: { determinism: 'nondeterministic' },
        }),
      ],
    ]);

    const diagnostics = analyzeGraph(nodes, [], definitions, [], {
      trustedCustomCodeTypeIds: new Set(),
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'nondeterministic', severity: 'info' }),
        expect.objectContaining({ code: 'untrusted-custom-code', severity: 'warning' }),
      ]),
    );
    expect(diagnostics.some(({ code }) => code === 'missing-codegen')).toBe(false);

    const unsupported = definition('pure/unsupported', 'pure', [], [], { codegen: undefined });
    expect(
      analyzeGraph(
        [node('unsupported', unsupported.typeId)],
        [],
        new Map([[unsupported.typeId, unsupported]]),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missing-codegen', severity: 'warning' }),
      ]),
    );
  });

  it('reuses connection type and topological checks for invalid graphs', () => {
    const nodes = [node('a', 'pure/string'), node('b', 'pure/number')];
    const definitions = new Map([
      [
        'pure/string',
        definition(
          'pure/string',
          'pure',
          [{ id: 'in', name: 'In', type: 'string' }],
          [{ id: 'out', name: 'Out', type: 'string' }],
        ),
      ],
      [
        'pure/number',
        definition(
          'pure/number',
          'pure',
          [{ id: 'in', name: 'In', type: 'number' }],
          [{ id: 'out', name: 'Out', type: 'number' }],
        ),
      ],
    ]);
    const connections: Connection[] = [
      { id: 'c1', fromNodeId: 'a', fromPortId: 'out', toNodeId: 'b', toPortId: 'in' },
      { id: 'c2', fromNodeId: 'b', fromPortId: 'out', toNodeId: 'a', toPortId: 'in' },
      { id: 'c3', fromNodeId: 'missing', fromPortId: 'out', toNodeId: 'a', toPortId: 'in' },
    ];

    const diagnostics = analyzeGraph(nodes, connections, definitions);

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'type-mismatch', severity: 'error' }),
        expect.objectContaining({ code: 'invalid-connection', severity: 'error' }),
        expect.objectContaining({ code: 'duplicate-input', severity: 'error' }),
        expect.objectContaining({ code: 'cycle', severity: 'error' }),
      ]),
    );
  });
});
