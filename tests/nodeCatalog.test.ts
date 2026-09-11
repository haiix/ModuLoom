import { describe, expect, it } from 'vitest';
import { BUILTIN_NODES } from '../src/nodes/definitions';
import { EXAMPLE_CUSTOM_TYPES, generateNodesForCustomType } from '../src/nodes/customTypeNodes';
import {
  getNodeCatalogMetadata,
  getNodeCatalogSection,
  matchesNodeCatalogSearch,
} from '../src/nodes/nodeCatalog';
import type { NodeDefinition } from '../src/types';

describe('node catalog', () => {
  it('classifies every built-in node into the agreed catalog sections', () => {
    expect(BUILTIN_NODES).toHaveLength(53);
    expect(BUILTIN_NODES.every((definition) => definition.catalog)).toBe(true);

    const counts = Object.fromEntries(
      ['core', 'advanced', 'examples', 'project'].map((section) => [
        section,
        BUILTIN_NODES.filter((definition) => getNodeCatalogSection(definition) === section).length,
      ]),
    );
    expect(counts).toEqual({ core: 31, advanced: 21, examples: 1, project: 0 });
  });

  it('keeps bundled custom types in Examples and new types in Project', () => {
    const exampleNodes = EXAMPLE_CUSTOM_TYPES.flatMap(generateNodesForCustomType);
    expect(exampleNodes).toHaveLength(6);
    expect(
      exampleNodes.every((definition) => getNodeCatalogSection(definition) === 'examples'),
    ).toBe(true);

    const projectNodes = generateNodesForCustomType({
      id: 'Order',
      name: 'Order',
      color: '#000000',
      fields: [{ name: 'id', type: 'number' }],
    });
    expect(
      projectNodes.every((definition) => getNodeCatalogSection(definition) === 'project'),
    ).toBe(true);
  });

  it('falls back to Project for definitions loaded without catalog metadata', () => {
    const legacyDefinition = {
      typeId: 'custom/legacy',
      label: 'Legacy Node',
      category: 'Custom',
      kind: 'pure',
      inputs: [],
      outputs: [],
      evaluate: () => ({}),
    } satisfies NodeDefinition;

    expect(getNodeCatalogMetadata(legacyDefinition)).toEqual({
      level: 'advanced',
      source: 'project',
      searchTags: [],
    });
    expect(getNodeCatalogSection(legacyDefinition)).toBe('project');
  });

  it('searches hidden sections and supplemental tags', () => {
    const simulatedFetch = BUILTIN_NODES.find((definition) => definition.typeId === 'async/fetch')!;
    expect(matchesNodeCatalogSearch(simulatedFetch, 'HTTP')).toBe(true);
    expect(matchesNodeCatalogSearch(simulatedFetch, 'Async')).toBe(true);
    expect(matchesNodeCatalogSearch(simulatedFetch, 'missing')).toBe(false);
  });
});
