import type { NodeCatalogMetadata, NodeDefinition } from '../types';

export type NodeCatalogSection = 'core' | 'advanced' | 'examples' | 'project';

const ADVANCED_BUILTIN_IDS = new Set([
  'string/template',
  'string/split',
  'array/map',
  'array/filter',
  'array/slice',
  'array/reverse',
  'output/gauge',
  'output/status',
  'output/log',
  'composite/input-port',
  'composite/output-port',
  'async/delay',
  'async/resolve',
  'async/await',
  'async/all',
  'stream/interval',
  'stream/from_array',
  'stream/map',
  'stream/filter',
  'stream/take',
  'stream/collect',
]);

const EXAMPLE_BUILTIN_IDS = new Set(['async/fetch']);

const EXTRA_SEARCH_TAGS: Record<string, string[]> = {
  'input/json': ['JSON', 'object'],
  'logic/branch': ['if', 'conditional'],
  'logic/equal': ['equals', 'comparison'],
  'output/inspector': ['preview', 'debug'],
  'async/fetch': ['API', 'HTTP', 'mock', 'simulation'],
  'composite/input-port': ['group', 'boundary'],
  'composite/output-port': ['group', 'boundary'],
};

export function getBuiltinCatalogMetadata(typeId: string): NodeCatalogMetadata {
  return {
    level:
      ADVANCED_BUILTIN_IDS.has(typeId) || EXAMPLE_BUILTIN_IDS.has(typeId) ? 'advanced' : 'core',
    source: EXAMPLE_BUILTIN_IDS.has(typeId) ? 'example' : 'builtin',
    searchTags: EXTRA_SEARCH_TAGS[typeId] ?? [],
  };
}

export function getNodeCatalogMetadata(definition: NodeDefinition): NodeCatalogMetadata {
  return (
    definition.catalog ?? {
      level: 'advanced',
      source: 'project',
      searchTags: [],
    }
  );
}

export function getNodeCatalogSection(definition: NodeDefinition): NodeCatalogSection {
  const catalog = getNodeCatalogMetadata(definition);
  if (catalog.source === 'example') return 'examples';
  if (catalog.source === 'project') return 'project';
  return catalog.level;
}

export function matchesNodeCatalogSearch(definition: NodeDefinition, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return [
    definition.label,
    definition.category,
    definition.description ?? '',
    ...getNodeCatalogMetadata(definition).searchTags,
  ].some((value) => value.toLowerCase().includes(query));
}
