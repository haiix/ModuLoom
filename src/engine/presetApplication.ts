import type {
  Connection,
  CustomTypeDefinition,
  GraphPreset,
  NodeDefinition,
  NodeInstance,
} from '../types';
import type { EditorDocument } from './editorHistory';

export class PresetDependencyConflictError extends Error {
  constructor(public readonly dependencyName: string) {
    super(`同名の依存物「${dependencyName}」が現在のプロジェクトに異なる内容で存在します。`);
    this.name = 'PresetDependencyConflictError';
  }
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function serializableDefinition(definition: NodeDefinition) {
  const { evaluate: _evaluate, codegen: _codegen, ...serializable } = definition;
  return serializable;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeDependencies<T>(
  current: T[],
  required: T[],
  getId: (value: T) => string,
  serializable: (value: T) => unknown = (value) => value,
): T[] {
  const merged = [...current];
  for (const dependency of required) {
    const id = getId(dependency);
    const existing = merged.find((value) => getId(value) === id);
    if (!existing) {
      merged.push(dependency);
    } else if (!sameValue(serializable(existing), serializable(dependency))) {
      throw new PresetDependencyConflictError(id);
    }
  }
  return merged;
}

function presetDependencies(preset: GraphPreset) {
  return {
    customTypes: preset.dependencies?.customTypes?.map(cloneValue) ?? [],
    customDefinitions: preset.dependencies?.customDefinitions ?? [],
  };
}

export function openPresetAsNew(document: EditorDocument, preset: GraphPreset): EditorDocument {
  const dependencies = presetDependencies(preset);
  return {
    ...document,
    nodes: cloneValue(preset.nodes),
    connections: cloneValue(preset.connections),
    customTypes: dependencies.customTypes,
    customDefinitions: dependencies.customDefinitions,
  };
}

export interface InsertPresetOptions {
  idPrefix: string;
  x: number;
  y: number;
}

function translateNodes(
  nodes: NodeInstance[],
  idMap: Map<string, string>,
  x: number,
  y: number,
): NodeInstance[] {
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  return nodes.map((node) => ({
    ...cloneValue(node),
    id: idMap.get(node.id)!,
    x: Math.round(node.x - minX + x),
    y: Math.round(node.y - minY + y),
  }));
}

function remapConnections(
  connections: Connection[],
  idMap: Map<string, string>,
  idPrefix: string,
): Connection[] {
  return connections.map((connection, index) => ({
    ...cloneValue(connection),
    id: `${idPrefix}-connection-${index + 1}`,
    fromNodeId: idMap.get(connection.fromNodeId)!,
    toNodeId: idMap.get(connection.toNodeId)!,
  }));
}

export function insertPreset(
  document: EditorDocument,
  preset: GraphPreset,
  options: InsertPresetOptions,
): EditorDocument {
  const dependencies = presetDependencies(preset);
  const customTypes = mergeDependencies(
    document.customTypes,
    dependencies.customTypes,
    (type: CustomTypeDefinition) => type.id,
  );
  const customDefinitions = mergeDependencies(
    document.customDefinitions,
    dependencies.customDefinitions,
    (definition: NodeDefinition) => definition.typeId,
    serializableDefinition,
  );
  const idMap = new Map(
    preset.nodes.map((node, index) => [node.id, `${options.idPrefix}-node-${index + 1}`]),
  );

  return {
    ...document,
    nodes: [...document.nodes, ...translateNodes(preset.nodes, idMap, options.x, options.y)],
    connections: [
      ...document.connections,
      ...remapConnections(preset.connections, idMap, options.idPrefix),
    ],
    customTypes,
    customDefinitions,
  };
}
