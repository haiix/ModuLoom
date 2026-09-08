import type { Connection, NodeInstance } from '../types';

export interface GraphClipboard {
  nodes: NodeInstance[];
  connections: Connection[];
}

export type Alignment = 'left' | 'right' | 'top' | 'bottom';
export type Distribution = 'horizontal' | 'vertical';

export function createGraphClipboard(
  nodes: NodeInstance[],
  connections: Connection[],
  selectedNodeIds: ReadonlySet<string>,
): GraphClipboard {
  return {
    nodes: nodes
      .filter((node) => selectedNodeIds.has(node.id))
      .map((node) => ({ ...node, state: cloneValue(node.state) })),
    connections: connections
      .filter(
        (connection) =>
          selectedNodeIds.has(connection.fromNodeId) && selectedNodeIds.has(connection.toNodeId),
      )
      .map((connection) => ({ ...connection })),
  };
}

export function pasteGraphClipboard(
  clipboard: GraphClipboard,
  nodes: NodeInstance[],
  connections: Connection[],
  createId: (kind: 'node' | 'connection', originalId: string) => string,
  offset = { x: 40, y: 40 },
): { nodes: NodeInstance[]; connections: Connection[]; selectedNodeIds: Set<string> } {
  const idMap = new Map<string, string>();
  const pastedNodes = clipboard.nodes.map((node) => {
    const id = createId('node', node.id);
    idMap.set(node.id, id);
    return {
      ...node,
      id,
      x: node.x + offset.x,
      y: node.y + offset.y,
      state: cloneValue(node.state),
    };
  });
  const pastedConnections = clipboard.connections.map((connection) => ({
    ...connection,
    id: createId('connection', connection.id),
    fromNodeId: idMap.get(connection.fromNodeId)!,
    toNodeId: idMap.get(connection.toNodeId)!,
  }));
  return {
    nodes: [...nodes, ...pastedNodes],
    connections: [...connections, ...pastedConnections],
    selectedNodeIds: new Set(pastedNodes.map(({ id }) => id)),
  };
}

export function deleteSelectedGraph(
  nodes: NodeInstance[],
  connections: Connection[],
  selectedNodeIds: ReadonlySet<string>,
): { nodes: NodeInstance[]; connections: Connection[] } {
  return {
    nodes: nodes.filter((node) => !selectedNodeIds.has(node.id)),
    connections: connections.filter(
      (connection) =>
        !selectedNodeIds.has(connection.fromNodeId) && !selectedNodeIds.has(connection.toNodeId),
    ),
  };
}

export function moveSelectedNodes(
  nodes: NodeInstance[],
  selectedNodeIds: ReadonlySet<string>,
  deltaX: number,
  deltaY: number,
): NodeInstance[] {
  return nodes.map((node) =>
    selectedNodeIds.has(node.id)
      ? { ...node, x: Math.round(node.x + deltaX), y: Math.round(node.y + deltaY) }
      : node,
  );
}

export function alignSelectedNodes(
  nodes: NodeInstance[],
  selectedNodeIds: ReadonlySet<string>,
  alignment: Alignment,
): NodeInstance[] {
  const selected = nodes.filter((node) => selectedNodeIds.has(node.id));
  if (selected.length < 2) return nodes;
  const value =
    alignment === 'left'
      ? Math.min(...selected.map(({ x }) => x))
      : alignment === 'right'
        ? Math.max(...selected.map(({ x }) => x))
        : alignment === 'top'
          ? Math.min(...selected.map(({ y }) => y))
          : Math.max(...selected.map(({ y }) => y));
  return nodes.map((node) => {
    if (!selectedNodeIds.has(node.id)) return node;
    return alignment === 'left' || alignment === 'right'
      ? { ...node, x: value }
      : { ...node, y: value };
  });
}

export function distributeSelectedNodes(
  nodes: NodeInstance[],
  selectedNodeIds: ReadonlySet<string>,
  distribution: Distribution,
): NodeInstance[] {
  const coordinate = distribution === 'horizontal' ? 'x' : 'y';
  const selected = nodes
    .filter((node) => selectedNodeIds.has(node.id))
    .sort((a, b) => a[coordinate] - b[coordinate]);
  if (selected.length < 3) return nodes;
  const start = selected[0][coordinate];
  const gap = (selected.at(-1)![coordinate] - start) / (selected.length - 1);
  const values = new Map(selected.map((node, index) => [node.id, Math.round(start + gap * index)]));
  return nodes.map((node) =>
    values.has(node.id) ? { ...node, [coordinate]: values.get(node.id)! } : node,
  );
}

function cloneValue<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}
