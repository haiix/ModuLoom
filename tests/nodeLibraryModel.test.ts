import { describe, expect, it } from 'vitest';
import { BUILTIN_NODES } from '../src/nodes/definitions';
import {
  getCompatibleDefinitions,
  getProjectDefinitions,
  getUsedDefinitions,
  resolveDefinitions,
} from '../src/components/nodeLibraryModel';
import type { NodeDefinition } from '../src/types';

const legacyProjectNode = {
  typeId: 'custom/project-only',
  label: 'Project only',
  category: 'Custom',
  kind: 'pure',
  inputs: [],
  outputs: [{ id: 'value', name: 'value', type: 'number' }],
  evaluate: () => ({ value: 1 }),
} satisfies NodeDefinition;

describe('node library model', () => {
  it('resolves preference order while dropping definitions that no longer exist', () => {
    expect(
      resolveDefinitions(BUILTIN_NODES, ['math/add', 'missing', 'input/number']).map(
        (d) => d.typeId,
      ),
    ).toEqual(['math/add', 'input/number']);
  });

  it('lists each type used in the current project once', () => {
    expect(
      getUsedDefinitions(BUILTIN_NODES, ['math/add', 'math/add', 'input/number']).map(
        (d) => d.typeId,
      ),
    ).toEqual(['math/add', 'input/number']);
  });

  it('keeps project definitions discoverable without catalog metadata', () => {
    expect(getProjectDefinitions([...BUILTIN_NODES, legacyProjectNode])).toEqual([
      legacyProjectNode,
    ]);
  });

  it('ranks exact compatible inputs before any inputs for an output port', () => {
    const candidates = getCompatibleDefinitions(BUILTIN_NODES, {
      direction: 'output',
      type: 'number',
      name: 'value',
    });
    expect(candidates.some((definition) => definition.typeId === 'math/add')).toBe(true);
    expect(candidates.some((definition) => definition.typeId === 'output/inspector')).toBe(true);
    expect(candidates.findIndex((definition) => definition.typeId === 'math/add')).toBeLessThan(
      candidates.findIndex((definition) => definition.typeId === 'output/inspector'),
    );
  });

  it('finds producers when an input port is selected', () => {
    const candidates = getCompatibleDefinitions(BUILTIN_NODES, {
      direction: 'input',
      type: 'string',
      name: 'text',
    });
    expect(candidates.some((definition) => definition.typeId === 'input/text')).toBe(true);
    expect(candidates.some((definition) => definition.typeId === 'math/add')).toBe(false);
  });

  it('型引数まで一致する候補をany互換候補より先に並べる', () => {
    const exact = {
      ...legacyProjectNode,
      typeId: 'custom/exact-array',
      label: 'Z exact',
      inputs: [{ id: 'items', name: 'items', type: 'array<number>' }],
    } satisfies NodeDefinition;
    const wildcard = {
      ...legacyProjectNode,
      typeId: 'custom/wildcard-array',
      label: 'A wildcard',
      inputs: [{ id: 'items', name: 'items', type: 'array<any>' }],
    } satisfies NodeDefinition;
    const candidates = getCompatibleDefinitions([wildcard, exact], {
      direction: 'output',
      type: 'array<number>',
      name: 'items',
    });

    expect(candidates.map(({ typeId }) => typeId)).toEqual([exact.typeId, wildcard.typeId]);
  });
});
