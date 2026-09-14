import type { CustomTypeDefinition, DataType, NodeDefinition } from '../types';
import { isTypeCompatible } from '../engine/typeSystem';
import { getNodeCatalogSection } from '../nodes/nodeCatalog';

export interface SelectedPort {
  direction: 'input' | 'output';
  type: DataType;
  name: string;
}

export function resolveDefinitions(
  definitions: NodeDefinition[],
  typeIds: Iterable<string>,
): NodeDefinition[] {
  const byTypeId = new Map(definitions.map((definition) => [definition.typeId, definition]));
  return [...typeIds].flatMap((typeId) => {
    const definition = byTypeId.get(typeId);
    return definition ? [definition] : [];
  });
}

export function getUsedDefinitions(
  definitions: NodeDefinition[],
  nodeTypeIds: Iterable<string>,
): NodeDefinition[] {
  return resolveDefinitions(definitions, new Set(nodeTypeIds));
}

export function getProjectDefinitions(definitions: NodeDefinition[]): NodeDefinition[] {
  return definitions.filter((definition) => getNodeCatalogSection(definition) === 'project');
}

export function getCompatibleDefinitions(
  definitions: NodeDefinition[],
  selectedPort: SelectedPort,
  customTypes: CustomTypeDefinition[] = [],
): NodeDefinition[] {
  return definitions
    .filter((definition) => {
      const candidates =
        selectedPort.direction === 'output' ? definition.inputs : definition.outputs;
      return candidates.some((port) =>
        selectedPort.direction === 'output'
          ? isTypeCompatible(selectedPort.type, port.type, customTypes)
          : isTypeCompatible(port.type, selectedPort.type, customTypes),
      );
    })
    .sort((left, right) => {
      const leftExact = hasExactPort(left, selectedPort);
      const rightExact = hasExactPort(right, selectedPort);
      if (leftExact !== rightExact) return leftExact ? -1 : 1;
      return left.label.localeCompare(right.label);
    });
}

function hasExactPort(definition: NodeDefinition, selectedPort: SelectedPort): boolean {
  const ports = selectedPort.direction === 'output' ? definition.inputs : definition.outputs;
  return ports.some((port) => port.type === selectedPort.type);
}
