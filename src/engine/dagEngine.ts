import {
  Connection,
  NodeDefinition,
  NodeInstance,
  GraphEvaluation,
  NodeEvaluationResult,
  CompositeSubgraph,
} from '../types';
import { isPromise, isAsyncIterable, collectStream } from './streamEngine';
import { GENERATED_STREAM_HELPERS } from '../nodes/codegen';

/**
 * Checks if adding a connection from fromNodeId to toNodeId would create a cycle.
 * In a DAG, adding an edge (A -> B) creates a cycle iff there is already a path from B to A.
 */
export function wouldCreateCycle(
  connections: Connection[],
  fromNodeId: string,
  toNodeId: string,
): boolean {
  if (fromNodeId === toNodeId) return true;

  // Build adjacency list of current connections
  const adj = new Map<string, string[]>();
  for (const conn of connections) {
    const list = adj.get(conn.fromNodeId) || [];
    list.push(conn.toNodeId);
    adj.set(conn.fromNodeId, list);
  }

  // Check if toNodeId can reach fromNodeId using BFS
  const visited = new Set<string>();
  const queue: string[] = [toNodeId];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr === fromNodeId) {
      return true; // Path exists, would create cycle!
    }
    if (!visited.has(curr)) {
      visited.add(curr);
      const neighbors = adj.get(curr) || [];
      for (const n of neighbors) {
        if (!visited.has(n)) {
          queue.push(n);
        }
      }
    }
  }

  return false;
}

/**
 * Topological Sort using Kahn's Algorithm.
 * Returns node IDs in an order where every node comes after all of its dependencies.
 */
export function getTopologicalOrder(
  nodes: NodeInstance[],
  connections: Connection[],
): { order: string[]; hasCycle: boolean } {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }

  // Only consider connections between existing nodes
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const conn of connections) {
    if (nodeIds.has(conn.fromNodeId) && nodeIds.has(conn.toNodeId)) {
      const neighbors = adj.get(conn.fromNodeId) || [];
      neighbors.push(conn.toNodeId);
      adj.set(conn.fromNodeId, neighbors);

      inDegree.set(conn.toNodeId, (inDegree.get(conn.toNodeId) || 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      queue.push(id);
    }
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    order.push(curr);

    const neighbors = adj.get(curr) || [];
    for (const next of neighbors) {
      const newDeg = (inDegree.get(next) || 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) {
        queue.push(next);
      }
    }
  }

  return {
    order,
    hasCycle: order.length < nodes.length,
  };
}

/**
 * Finds all downstream node IDs reachable from a given set of seed node IDs along connections.
 * Includes the seed nodes themselves.
 */
export function getDownstreamNodeIds(
  seedNodeIds: Iterable<string>,
  connections: Connection[],
): Set<string> {
  const adj = new Map<string, string[]>();
  for (const conn of connections) {
    const list = adj.get(conn.fromNodeId) || [];
    list.push(conn.toNodeId);
    adj.set(conn.fromNodeId, list);
  }

  const downstream = new Set<string>();
  const queue: string[] = Array.from(seedNodeIds);

  for (const id of queue) {
    downstream.add(id);
  }

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const neighbors = adj.get(curr) || [];
    for (const next of neighbors) {
      if (!downstream.has(next)) {
        downstream.add(next);
        queue.push(next);
      }
    }
  }

  return downstream;
}

/**
 * Detects which nodes changed between previous and current graph states.
 * Returns a Set of dirty seed node IDs, or 'all' if the whole graph must be re-evaluated.
 */
export function detectDirtySeedNodeIds(
  prevNodes: NodeInstance[],
  currNodes: NodeInstance[],
  prevConnections: Connection[],
  currConnections: Connection[],
): Set<string> | 'all' {
  // If previous graph was empty or completely replaced, evaluate all
  if (prevNodes.length === 0 && currNodes.length > 0) return 'all';

  const seeds = new Set<string>();
  const prevNodeMap = new Map(prevNodes.map((n) => [n.id, n]));
  const currNodeMap = new Map(currNodes.map((n) => [n.id, n]));

  // 1. Check modified or added nodes
  for (const curr of currNodes) {
    const prev = prevNodeMap.get(curr.id);
    if (!prev) {
      // New node added
      seeds.add(curr.id);
    } else {
      // Check if functional properties (type or state) changed
      // Note: position changes (x, y) or display labels do not invalidate pure computation!
      if (curr.typeId !== prev.typeId) {
        seeds.add(curr.id);
      } else if (JSON.stringify(curr.state) !== JSON.stringify(prev.state)) {
        seeds.add(curr.id);
      }
    }
  }

  // 2. Check removed nodes
  for (const prev of prevNodes) {
    if (!currNodeMap.has(prev.id)) {
      // Find downstream nodes that were receiving input from this deleted node
      for (const c of prevConnections) {
        if (c.fromNodeId === prev.id && currNodeMap.has(c.toNodeId)) {
          seeds.add(c.toNodeId);
        }
      }
    }
  }

  // 3. Check connection changes
  const prevConnKeys = new Set(
    prevConnections.map((c) => `${c.fromNodeId}:${c.fromPortId}->${c.toNodeId}:${c.toPortId}`),
  );
  const currConnKeys = new Set(
    currConnections.map((c) => `${c.fromNodeId}:${c.fromPortId}->${c.toNodeId}:${c.toPortId}`),
  );

  // Added connections: target node input changed
  for (const c of currConnections) {
    const key = `${c.fromNodeId}:${c.fromPortId}->${c.toNodeId}:${c.toPortId}`;
    if (!prevConnKeys.has(key)) {
      seeds.add(c.toNodeId);
    }
  }

  // Removed connections: target node input disconnected
  for (const c of prevConnections) {
    const key = `${c.fromNodeId}:${c.fromPortId}->${c.toNodeId}:${c.toPortId}`;
    if (!currConnKeys.has(key) && currNodeMap.has(c.toNodeId)) {
      seeds.add(c.toNodeId);
    }
  }

  return seeds;
}

/**
 * Synchronously evaluates a composite node by executing its internal subgraph.
 */
export function evaluateCompositeNode(
  subgraph: CompositeSubgraph,
  externalInputs: Record<string, any>,
  definitions: Map<string, NodeDefinition>,
): Record<string, any> {
  // Deep clone internal nodes and connections
  const internalNodes: NodeInstance[] = JSON.parse(JSON.stringify(subgraph.nodes));
  const internalConnections: Connection[] = JSON.parse(JSON.stringify(subgraph.connections));

  const externalInputPortByNodeId = new Map(
    subgraph.inputPortMappings?.map(({ externalPortId, internalNodeId }) => [
      internalNodeId,
      externalPortId,
    ]),
  );

  // Map external inputs to composite/input-port terminal nodes
  for (const node of internalNodes) {
    if (node.typeId === 'composite/input-port') {
      const externalPortId = externalInputPortByNodeId.get(node.id) ?? node.state?.portName ?? 'x';
      if (externalPortId in externalInputs && externalInputs[externalPortId] !== undefined) {
        node.state = {
          ...node.state,
          testValue: externalInputs[externalPortId],
        };
      }
    }
  }

  // Evaluate internal subgraph
  const internalEval = evaluateGraph(internalNodes, internalConnections, definitions);

  // Collect outputs from composite/output-port terminal nodes
  const outputs: Record<string, any> = {};
  const externalOutputPortByNodeId = new Map(
    subgraph.outputPortMappings?.map(({ externalPortId, internalNodeId }) => [
      internalNodeId,
      externalPortId,
    ]),
  );
  for (const node of internalNodes) {
    if (node.typeId === 'composite/output-port') {
      const portName = node.state?.portName || 'result';
      const externalPortId = externalOutputPortByNodeId.get(node.id) ?? portName;
      const nodeRes = internalEval[node.id];
      const val = nodeRes?.inputs?.in ?? nodeRes?.outputs?.out ?? nodeRes?.outputs?.[portName];
      outputs[externalPortId] = val;
    }
  }

  return outputs;
}

/**
 * Asynchronously evaluates a composite node by executing its internal subgraph.
 */
export async function evaluateCompositeNodeAsync(
  subgraph: CompositeSubgraph,
  externalInputs: Record<string, any>,
  definitions: Map<string, NodeDefinition>,
  isCancelled?: () => boolean,
): Promise<Record<string, any>> {
  const internalNodes: NodeInstance[] = JSON.parse(JSON.stringify(subgraph.nodes));
  const internalConnections: Connection[] = JSON.parse(JSON.stringify(subgraph.connections));

  const externalInputPortByNodeId = new Map(
    subgraph.inputPortMappings?.map(({ externalPortId, internalNodeId }) => [
      internalNodeId,
      externalPortId,
    ]),
  );

  for (const node of internalNodes) {
    if (node.typeId === 'composite/input-port') {
      const externalPortId = externalInputPortByNodeId.get(node.id) ?? node.state?.portName ?? 'x';
      if (externalPortId in externalInputs && externalInputs[externalPortId] !== undefined) {
        node.state = {
          ...node.state,
          testValue: externalInputs[externalPortId],
        };
      }
    }
  }

  const internalEval = await evaluateGraphAsync(
    internalNodes,
    internalConnections,
    definitions,
    undefined,
    undefined,
    undefined,
    isCancelled,
  );

  const outputs: Record<string, any> = {};
  const externalOutputPortByNodeId = new Map(
    subgraph.outputPortMappings?.map(({ externalPortId, internalNodeId }) => [
      internalNodeId,
      externalPortId,
    ]),
  );
  for (const node of internalNodes) {
    if (node.typeId === 'composite/output-port') {
      const portName = node.state?.portName || 'result';
      const externalPortId = externalOutputPortByNodeId.get(node.id) ?? portName;
      const nodeRes = internalEval[node.id];
      const val = nodeRes?.inputs?.in ?? nodeRes?.outputs?.out ?? nodeRes?.outputs?.[portName];
      outputs[externalPortId] = val;
    }
  }

  return outputs;
}

export interface UnpackCompositeResult {
  nodes: NodeInstance[];
  connections: Connection[];
  warnings: string[];
}

function allocateUniqueId(base: string, occupiedIds: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (occupiedIds.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  occupiedIds.add(candidate);
  return candidate;
}

/**
 * Replaces one composite instance with cloned internal nodes while preserving its external edges.
 * Invalid boundary mappings are returned as warnings and their affected edges are omitted.
 */
export function unpackCompositeNode(
  nodes: NodeInstance[],
  connections: Connection[],
  nodeId: string,
  definition: NodeDefinition,
): UnpackCompositeResult {
  const compositeNode = nodes.find(({ id }) => id === nodeId);
  if (!compositeNode || !definition.isComposite || !definition.compositeSubgraph) {
    throw new Error(`複合ノード '${nodeId}' を展開できません。`);
  }

  const subgraph = definition.compositeSubgraph;
  if (subgraph.nodes.length === 0) {
    throw new Error(`複合ノード '${nodeId}' の内部グラフが空です。`);
  }

  const minX = Math.min(...subgraph.nodes.map(({ x }) => x));
  const minY = Math.min(...subgraph.nodes.map(({ y }) => y));
  const occupiedNodeIds = new Set(nodes.map(({ id }) => id));
  occupiedNodeIds.delete(nodeId);
  const idMap = new Map<string, string>();
  const unpackedNodes = subgraph.nodes.map((node) => {
    const newId = allocateUniqueId(`${nodeId}__${node.id}`, occupiedNodeIds);
    idMap.set(node.id, newId);
    return {
      ...JSON.parse(JSON.stringify(node)),
      id: newId,
      x: compositeNode.x + (node.x - minX),
      y: compositeNode.y + (node.y - minY),
    };
  });

  const occupiedConnectionIds = new Set(connections.map(({ id }) => id));
  const unpackedConnections = subgraph.connections.map((connection) => ({
    ...connection,
    id: allocateUniqueId(`${nodeId}__${connection.id}`, occupiedConnectionIds),
    fromNodeId: idMap.get(connection.fromNodeId)!,
    toNodeId: idMap.get(connection.toNodeId)!,
  }));
  const inputMappings =
    subgraph.inputPortMappings ??
    definition.inputs.map((port, index) => ({
      externalPortId: port.id,
      internalNodeId: subgraph.inputNodeIds[index],
    }));
  const outputMappings =
    subgraph.outputPortMappings ??
    definition.outputs.map((port, index) => ({
      externalPortId: port.id,
      internalNodeId: subgraph.outputNodeIds[index],
    }));
  const warnings: string[] = [];
  const externalConnections: Connection[] = [];

  for (const connection of connections) {
    if (connection.fromNodeId !== nodeId && connection.toNodeId !== nodeId) {
      externalConnections.push(connection);
      continue;
    }
    if (connection.fromNodeId === nodeId && connection.toNodeId === nodeId) {
      warnings.push(`接続 '${connection.id}': 複合ノード自身への接続は復元できません。`);
      continue;
    }

    if (connection.toNodeId === nodeId) {
      const mapping = inputMappings.find(
        ({ externalPortId }) => externalPortId === connection.toPortId,
      );
      const internalNode = mapping
        ? subgraph.nodes.find(({ id }) => id === mapping.internalNodeId)
        : undefined;
      const remappedNodeId = mapping ? idMap.get(mapping.internalNodeId) : undefined;
      if (!mapping || !remappedNodeId || internalNode?.typeId !== 'composite/input-port') {
        warnings.push(
          `接続 '${connection.id}': 入力ポート '${connection.toPortId}' の内部端子が見つかりません。`,
        );
        continue;
      }
      externalConnections.push({
        ...connection,
        id: allocateUniqueId(`${nodeId}__external__${connection.id}`, occupiedConnectionIds),
        toNodeId: remappedNodeId,
        toPortId: 'in',
      });
      continue;
    }

    const mapping = outputMappings.find(
      ({ externalPortId }) => externalPortId === connection.fromPortId,
    );
    const internalNode = mapping
      ? subgraph.nodes.find(({ id }) => id === mapping.internalNodeId)
      : undefined;
    const remappedNodeId = mapping ? idMap.get(mapping.internalNodeId) : undefined;
    if (!mapping || !remappedNodeId || internalNode?.typeId !== 'composite/output-port') {
      warnings.push(
        `接続 '${connection.id}': 出力ポート '${connection.fromPortId}' の内部端子が見つかりません。`,
      );
      continue;
    }
    externalConnections.push({
      ...connection,
      id: allocateUniqueId(`${nodeId}__external__${connection.id}`, occupiedConnectionIds),
      fromNodeId: remappedNodeId,
      fromPortId: 'out',
    });
  }

  return {
    nodes: [...nodes.filter(({ id }) => id !== nodeId), ...unpackedNodes],
    connections: [...externalConnections, ...unpackedConnections],
    warnings,
  };
}

/**
 * Reactive Graph Evaluator:
 * Executes each pure function node in topological order.
 * If dirtyNodeIds is provided, ONLY evaluates dirty nodes (seed + downstream dependencies)
 * while seamlessly reusing cached results for untouched upstream and parallel nodes!
 */
export function evaluateGraph(
  nodes: NodeInstance[],
  connections: Connection[],
  definitions: Map<string, NodeDefinition>,
  previousEvaluation?: GraphEvaluation,
  dirtyNodeIds?: Set<string>,
): GraphEvaluation {
  const result: GraphEvaluation = {};
  const { order, hasCycle } = getTopologicalOrder(nodes, connections);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Index connections by destination (toNodeId + toPortId)
  // Constraint: 1 connection per input port
  const incoming = new Map<string, Connection>();
  for (const conn of connections) {
    incoming.set(`${conn.toNodeId}:${conn.toPortId}`, conn);
  }

  if (hasCycle) {
    // Flag cyclic nodes with an error
    for (const node of nodes) {
      result[node.id] = {
        inputs: {},
        outputs: {},
        error: '循環参照（ループ）が検出されました。DAG構造を満たす必要があります。',
      };
    }
    return result;
  }

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    // Incremental evaluation optimization:
    // If dirtyNodeIds is given, and this node is NOT dirty and was already computed, reuse previous output!
    if (
      dirtyNodeIds &&
      !dirtyNodeIds.has(nodeId) &&
      previousEvaluation &&
      previousEvaluation[nodeId]
    ) {
      result[nodeId] = {
        ...previousEvaluation[nodeId],
        isCached: true,
      };
      continue;
    }

    const def = definitions.get(node.typeId);
    if (!def) {
      result[nodeId] = {
        inputs: {},
        outputs: {},
        error: `未登録のノード定義: ${node.typeId}`,
        isCached: false,
      };
      continue;
    }

    // Resolve inputs
    const inputs: Record<string, any> = {};
    let hasInputError = false;
    let inputErrorMessage = '';

    for (const port of def.inputs) {
      const key = `${nodeId}:${port.id}`;
      const conn = incoming.get(key);

      if (conn) {
        // Output from source node
        const sourceResult = result[conn.fromNodeId];
        if (sourceResult?.error) {
          hasInputError = true;
          inputErrorMessage = `入力元ノードでエラーが発生しています: ${sourceResult.error}`;
          break;
        }
        if (sourceResult && conn.fromPortId in sourceResult.outputs) {
          inputs[port.id] = sourceResult.outputs[conn.fromPortId];
        } else {
          inputs[port.id] =
            port.defaultValue !== null && typeof port.defaultValue === 'object'
              ? JSON.parse(JSON.stringify(port.defaultValue))
              : port.defaultValue;
        }
      } else {
        // Unconnected input uses default value (cloned to prevent shared mutations across instances)
        inputs[port.id] =
          port.defaultValue !== null && typeof port.defaultValue === 'object'
            ? JSON.parse(JSON.stringify(port.defaultValue))
            : port.defaultValue;
      }
    }

    if (hasInputError) {
      result[nodeId] = {
        inputs,
        outputs: {},
        error: inputErrorMessage,
        isCached: false,
      };
      continue;
    }

    // Execute pure function with timer
    const startTime = performance.now();
    try {
      // Pass both inputs and internal state (for Input nodes)
      let outputs: Record<string, any> = {};
      if (def.isComposite && def.compositeSubgraph) {
        outputs = evaluateCompositeNode(def.compositeSubgraph, inputs, definitions);
      } else {
        const res = def.isAsync ? {} : def.evaluate(inputs, node.state);
        // In synchronous evaluateGraph, unwrap if non-promise
        outputs = isPromise(res) ? {} : res;
      }
      const durationMs = performance.now() - startTime;

      result[nodeId] = {
        inputs,
        outputs: outputs || {},
        durationMs: Number(durationMs.toFixed(2)),
        isCached: false,
        evaluatedAt: Date.now(),
      };
    } catch (err: any) {
      result[nodeId] = {
        inputs,
        outputs: {},
        error: err?.message || '計算中にエラーが発生しました',
        isCached: false,
        evaluatedAt: Date.now(),
      };
    }
  }

  return result;
}

/**
 * Reactive Asynchronous Graph Evaluator:
 * Executes DAG nodes in topological order with full support for Promises and AsyncIterator streams!
 * Supports incremental dirty evaluation: skips untouched nodes and streams without restarting them!
 */
export async function evaluateGraphAsync(
  nodes: NodeInstance[],
  connections: Connection[],
  definitions: Map<string, NodeDefinition>,
  previousEvaluation?: GraphEvaluation,
  dirtyNodeIds?: Set<string>,
  onNodeProgress?: (nodeId: string, partialEvaluation: NodeEvaluationResult) => void,
  isCancelled?: () => boolean,
): Promise<GraphEvaluation> {
  const result: GraphEvaluation = {};
  const { order, hasCycle } = getTopologicalOrder(nodes, connections);

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map<string, Connection>();
  for (const conn of connections) {
    incoming.set(`${conn.toNodeId}:${conn.toPortId}`, conn);
  }

  if (hasCycle) {
    for (const node of nodes) {
      result[node.id] = {
        inputs: {},
        outputs: {},
        error: '循環参照（ループ）が検出されました。DAG構造を満たす必要があります。',
      };
    }
    return result;
  }

  for (const nodeId of order) {
    if (isCancelled?.()) break;

    const node = nodeMap.get(nodeId);
    if (!node) continue;

    // Incremental evaluation optimization:
    // If not dirty and previously evaluated, preserve cached outputs and do not re-run async operations!
    if (
      dirtyNodeIds &&
      !dirtyNodeIds.has(nodeId) &&
      previousEvaluation &&
      previousEvaluation[nodeId]
    ) {
      result[nodeId] = {
        ...previousEvaluation[nodeId],
        isCached: true,
      };
      continue;
    }

    const def = definitions.get(node.typeId);
    if (!def) {
      result[nodeId] = {
        inputs: {},
        outputs: {},
        error: `未登録のノード定義: ${node.typeId}`,
        isCached: false,
      };
      onNodeProgress?.(nodeId, result[nodeId]);
      continue;
    }

    // Resolve inputs from upstream nodes
    const inputs: Record<string, any> = {};
    let hasInputError = false;
    let inputErrorMessage = '';

    for (const port of def.inputs) {
      const key = `${nodeId}:${port.id}`;
      const conn = incoming.get(key);

      if (conn) {
        const sourceResult = result[conn.fromNodeId];
        if (sourceResult?.error) {
          hasInputError = true;
          inputErrorMessage = `入力元ノードでエラーが発生しています: ${sourceResult.error}`;
          break;
        }
        if (sourceResult && conn.fromPortId in sourceResult.outputs) {
          inputs[port.id] = sourceResult.outputs[conn.fromPortId];
        } else {
          inputs[port.id] =
            port.defaultValue !== null && typeof port.defaultValue === 'object'
              ? JSON.parse(JSON.stringify(port.defaultValue))
              : port.defaultValue;
        }
      } else {
        inputs[port.id] =
          port.defaultValue !== null && typeof port.defaultValue === 'object'
            ? JSON.parse(JSON.stringify(port.defaultValue))
            : port.defaultValue;
      }
    }

    if (hasInputError) {
      result[nodeId] = {
        inputs,
        outputs: {},
        error: inputErrorMessage,
        isCached: false,
      };
      onNodeProgress?.(nodeId, result[nodeId]);
      continue;
    }

    // Indicate pending state for async operations
    if (def.isAsync || def.category === 'Async') {
      onNodeProgress?.(nodeId, {
        inputs,
        outputs: {},
        isPending: true,
        isCached: false,
      });
    }

    const startTime = performance.now();
    try {
      let outputs: Record<string, any> = {};

      if (def.isComposite && def.compositeSubgraph) {
        const hasAsync = def.compositeSubgraph.nodes.some((n) => {
          const d = definitions.get(n.typeId);
          return d?.isAsync || d?.category === 'Async';
        });
        if (hasAsync) {
          outputs = await evaluateCompositeNodeAsync(
            def.compositeSubgraph,
            inputs,
            definitions,
            isCancelled,
          );
        } else {
          outputs = evaluateCompositeNode(def.compositeSubgraph, inputs, definitions);
        }
      } else if (def.typeId === 'stream/collect') {
        const stream = inputs.stream;
        if (stream && isAsyncIterable(stream)) {
          outputs = { array: [], count: 0 };
          onNodeProgress?.(nodeId, {
            inputs,
            outputs,
            isStreaming: true,
            streamCount: 0,
            isCached: false,
          });
          const collected = await collectStream(
            stream,
            (item, currentArray) => {
              if (isCancelled?.()) return;
              outputs = { array: currentArray, count: currentArray.length };
              onNodeProgress?.(nodeId, {
                inputs,
                outputs,
                isStreaming: true,
                streamCount: currentArray.length,
                latestStreamValue: item,
                isCached: false,
              });
            },
            50,
          );
          outputs = { array: collected, count: collected.length };
        } else {
          outputs = { array: [], count: 0 };
        }
      } else {
        const abortController = new AbortController();
        if (isCancelled?.()) abortController.abort();
        const cancellationTimer = isCancelled
          ? globalThis.setInterval(() => {
              if (isCancelled()) abortController.abort();
            }, 10)
          : undefined;
        try {
          const evalRes = def.evaluate(inputs, node.state, { signal: abortController.signal });
          if (isPromise(evalRes)) {
            outputs = await evalRes;
          } else {
            outputs = evalRes;
          }
        } finally {
          if (cancellationTimer !== undefined) globalThis.clearInterval(cancellationTimer);
        }
      }

      const durationMs = performance.now() - startTime;
      result[nodeId] = {
        inputs,
        outputs: outputs || {},
        durationMs: Number(durationMs.toFixed(2)),
        isPending: false,
        isStreaming: false,
        isCached: false,
        evaluatedAt: Date.now(),
      };
      onNodeProgress?.(nodeId, result[nodeId]);
    } catch (err: any) {
      result[nodeId] = {
        inputs,
        outputs: {},
        error: err?.message || '計算中にエラーが発生しました',
        isPending: false,
        isStreaming: false,
        isCached: false,
        evaluatedAt: Date.now(),
      };
      onNodeProgress?.(nodeId, result[nodeId]);
    }
  }

  return result;
}

export class CodeGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodeGenerationError';
  }
}

function expandCompositeNodes(
  nodes: NodeInstance[],
  connections: Connection[],
  definitions: Map<string, NodeDefinition>,
): { nodes: NodeInstance[]; connections: Connection[] } {
  let expandedNodes = nodes.map((node) => ({ ...node }));
  let expandedConnections = connections.map((connection) => ({ ...connection }));
  const expansionLimit = Math.max(100, nodes.length * 20);

  for (let count = 0; count < expansionLimit; count += 1) {
    const composite = expandedNodes.find((node) => definitions.get(node.typeId)?.isComposite);
    if (!composite) return { nodes: expandedNodes, connections: expandedConnections };

    const definition = definitions.get(composite.typeId)!;
    try {
      const result = unpackCompositeNode(
        expandedNodes,
        expandedConnections,
        composite.id,
        definition,
      );
      if (result.warnings.length > 0) {
        throw new CodeGenerationError(result.warnings.join(' '));
      }
      expandedNodes = result.nodes;
      expandedConnections = result.connections;
    } catch (error) {
      if (error instanceof CodeGenerationError) throw error;
      throw new CodeGenerationError(
        `複合ノード '${composite.id}' を展開できません: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new CodeGenerationError('複合ノードが再帰しているため生成を中止しました。');
}

/** Generates TypeScript using the same implementation metadata as runtime node definitions. */
export function generateTypeScriptCode(
  nodes: NodeInstance[],
  connections: Connection[],
  definitions: Map<string, NodeDefinition>,
  customTypes?: import('../types').CustomTypeDefinition[],
): string {
  const expanded = expandCompositeNodes(nodes, connections, definitions);
  const { order, hasCycle } = getTopologicalOrder(expanded.nodes, expanded.connections);
  if (hasCycle) {
    throw new CodeGenerationError('グラフに循環があるためTypeScriptを生成できません。');
  }

  const nodeMap = new Map(expanded.nodes.map((node) => [node.id, node]));
  const definitionMap = new Map<string, NodeDefinition>();
  for (const node of expanded.nodes) {
    const definition = definitions.get(node.typeId);
    if (!definition) {
      throw new CodeGenerationError(`未登録のノード定義: ${node.typeId}`);
    }
    if (!definition.codegen && !definition.customCode) {
      throw new CodeGenerationError(
        `ノード '${definition.label}' (${definition.typeId}) はTypeScript出力に対応していません。`,
      );
    }
    definitionMap.set(node.id, definition);
  }

  const incoming = new Map<string, Connection>();
  const outgoingCount = new Map<string, number>();
  for (const connection of expanded.connections) {
    incoming.set(`${connection.toNodeId}:${connection.toPortId}`, connection);
    outgoingCount.set(connection.fromNodeId, (outgoingCount.get(connection.fromNodeId) ?? 0) + 1);
  }

  const rootInputs = expanded.nodes.filter((node) => {
    const definition = definitionMap.get(node.id)!;
    return (
      definition.kind === 'input' &&
      !definition.inputs.some((port) => incoming.has(`${node.id}:${port.id}`))
    );
  });
  const outputNodes = expanded.nodes.filter(
    (node) => definitionMap.get(node.id)!.kind === 'output' && !outgoingCount.has(node.id),
  );
  const hasAsyncOrStream = expanded.nodes.some((node) => {
    const definition = definitionMap.get(node.id)!;
    return (
      definition.isAsync ||
      definition.category === 'Async' ||
      definition.category === 'Stream' ||
      [...definition.inputs, ...definition.outputs].some(
        (port) => port.type === 'promise' || port.type === 'stream',
      )
    );
  });

  const nodeVariables = new Map(order.map((nodeId, index) => [nodeId, `node_${index}`]));
  const inputNames = new Map<string, string>();
  const usedInputNames = new Set<string>();
  for (const node of rootInputs) {
    const definition = definitionMap.get(node.id)!;
    const base = sanitizeVarName(
      String(
        node.typeId === 'composite/input-port'
          ? node.state?.portName
          : node.customLabel || definition.label || node.id,
      ),
    );
    let name = base || 'input';
    let suffix = 2;
    while (usedInputNames.has(name)) name = `${base}_${suffix++}`;
    usedInputNames.add(name);
    inputNames.set(node.id, name);
  }

  let ts = `/**\n * Auto-generated Pure Function Pipeline\n * Built with ModuLoom Type-Safe Node Editor\n */\n\n`;
  if (hasAsyncOrStream) ts += `${GENERATED_STREAM_HELPERS}\n`;

  if (customTypes?.length) {
    for (const customType of customTypes) {
      ts += `export interface ${sanitizeTypeName(customType.name)} {\n`;
      for (const field of customType.fields) {
        ts += `  ${JSON.stringify(field.name)}${field.required ? '' : '?'}: ${mapDataTypeToTs(field.type, customTypes)};\n`;
      }
      ts += `}\n\n`;
    }
  }

  ts += `export interface PipelineInputs {\n`;
  for (const node of rootInputs) {
    const definition = definitionMap.get(node.id)!;
    const outputType =
      node.typeId === 'composite/input-port'
        ? String(node.state?.portType ?? 'any')
        : String(definition.outputs[0]?.type ?? 'any');
    ts += `  ${JSON.stringify(inputNames.get(node.id)!)}?: ${mapDataTypeToTs(outputType, customTypes)};\n`;
  }
  ts += `}\n\n`;

  ts += `export ${hasAsyncOrStream ? 'async ' : ''}function evaluatePipeline(inputs: PipelineInputs = {}) {\n`;
  for (const nodeId of order) {
    const node = nodeMap.get(nodeId)!;
    const definition = definitionMap.get(nodeId)!;
    const nodeVariable = nodeVariables.get(nodeId)!;
    const inputsVariable = `${nodeVariable}_inputs`;

    ts += `  // ${definition.category}: ${definition.label}\n`;
    ts += `  const ${inputsVariable}: Record<string, any> = {\n`;
    for (const port of definition.inputs) {
      const connection = incoming.get(`${nodeId}:${port.id}`);
      const value = connection
        ? `${nodeVariables.get(connection.fromNodeId)!}[${JSON.stringify(connection.fromPortId)}]`
        : serializeValue(port.defaultValue);
      ts += `    ${JSON.stringify(port.id)}: ${value},\n`;
    }
    ts += `  };\n`;

    const state = node.state ?? definition.defaultState;
    let implementation: string;
    if (definition.codegen) {
      implementation = definition.codegen.emit({ inputsVar: inputsVariable, state });
    } else {
      const outputPortId = definition.outputs[0]?.id;
      if (!outputPortId) {
        throw new CodeGenerationError(
          `カスタムノード '${definition.label}' に出力ポートがありません。`,
        );
      }
      implementation = `{ ${JSON.stringify(outputPortId)}: ((inputs: Record<string, any>) => (${definition.customCode}))(${inputsVariable}) }`;
    }

    if (inputNames.has(nodeId)) {
      const outputPortId = definition.outputs[0]?.id;
      if (!outputPortId) {
        throw new CodeGenerationError(
          `入力ノード '${definition.label}' に出力ポートがありません。`,
        );
      }
      const inputName = inputNames.get(nodeId)!;
      ts += `  const ${nodeVariable}_default = ${implementation};\n`;
      ts += `  const ${nodeVariable} = { ...${nodeVariable}_default, [${JSON.stringify(outputPortId)}]: inputs[${JSON.stringify(inputName)}] !== undefined ? inputs[${JSON.stringify(inputName)}] : ${nodeVariable}_default[${JSON.stringify(outputPortId)}] };\n\n`;
    } else {
      ts += `  const ${nodeVariable} = ${implementation};\n\n`;
    }
  }

  ts += `  return {\n`;
  for (const node of outputNodes) {
    const definition = definitionMap.get(node.id)!;
    const key = node.customLabel || definition.label || node.id;
    if (definition.outputs.length === 0) {
      ts += `    ${JSON.stringify(key)}: ${nodeVariables.get(node.id)!}.displayedValue,\n`;
    } else {
      for (const output of definition.outputs) {
        const outputKey = definition.outputs.length === 1 ? key : `${key}.${output.id}`;
        ts += `    ${JSON.stringify(outputKey)}: ${nodeVariables.get(node.id)!}[${JSON.stringify(output.id)}],\n`;
      }
    }
  }
  ts += `  };\n}\n`;
  return ts;
}

function sanitizeVarName(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^([0-9])/, '_$1')
    .toLowerCase();
}

function sanitizeTypeName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_$]/g, '_').replace(/^([0-9])/, '_$1');
  return sanitized || 'CustomType';
}

function serializeValue(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? 'undefined' : serialized;
}

function mapDataTypeToTs(
  type: string,
  customTypes?: import('../types').CustomTypeDefinition[],
): string {
  const custom = customTypes?.find((ct) => ct.id === type || ct.name === type);
  if (custom) return sanitizeTypeName(custom.name);

  switch (type) {
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'array':
      return 'any[]';
    case 'object':
      return 'Record<string, any>';
    case 'promise':
      return 'Promise<any>';
    case 'stream':
      return 'AsyncIterable<any>';
    default:
      return 'any';
  }
}
