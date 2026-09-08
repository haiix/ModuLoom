import {
  Connection,
  NodeDefinition,
  NodeInstance,
  GraphEvaluation,
  NodeEvaluationResult,
  CompositeSubgraph,
} from '../types';
import { isPromise, isAsyncIterable, collectStream } from './streamEngine';

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

  // Map external inputs to composite/input-port terminal nodes
  for (const node of internalNodes) {
    if (node.typeId === 'composite/input-port') {
      const portName = node.state?.portName || 'x';
      if (portName in externalInputs && externalInputs[portName] !== undefined) {
        node.state = {
          ...node.state,
          testValue: externalInputs[portName],
        };
      }
    }
  }

  // Evaluate internal subgraph
  const internalEval = evaluateGraph(internalNodes, internalConnections, definitions);

  // Collect outputs from composite/output-port terminal nodes
  const outputs: Record<string, any> = {};
  for (const node of internalNodes) {
    if (node.typeId === 'composite/output-port') {
      const portName = node.state?.portName || 'result';
      const nodeRes = internalEval[node.id];
      const val = nodeRes?.inputs?.in ?? nodeRes?.outputs?.out ?? nodeRes?.outputs?.[portName];
      outputs[portName] = val;
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
): Promise<Record<string, any>> {
  const internalNodes: NodeInstance[] = JSON.parse(JSON.stringify(subgraph.nodes));
  const internalConnections: Connection[] = JSON.parse(JSON.stringify(subgraph.connections));

  for (const node of internalNodes) {
    if (node.typeId === 'composite/input-port') {
      const portName = node.state?.portName || 'x';
      if (portName in externalInputs && externalInputs[portName] !== undefined) {
        node.state = {
          ...node.state,
          testValue: externalInputs[portName],
        };
      }
    }
  }

  const internalEval = await evaluateGraphAsync(internalNodes, internalConnections, definitions);

  const outputs: Record<string, any> = {};
  for (const node of internalNodes) {
    if (node.typeId === 'composite/output-port') {
      const portName = node.state?.portName || 'result';
      const nodeRes = internalEval[node.id];
      const val = nodeRes?.inputs?.in ?? nodeRes?.outputs?.out ?? nodeRes?.outputs?.[portName];
      outputs[portName] = val;
    }
  }

  return outputs;
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
        const res = def.evaluate(inputs, node.state);
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
          outputs = await evaluateCompositeNodeAsync(def.compositeSubgraph, inputs, definitions);
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
        const evalRes = def.evaluate(inputs, node.state);
        if (isPromise(evalRes)) {
          outputs = await evalRes;
        } else {
          outputs = evalRes;
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

/**
 * Generates pure TypeScript code for the entire graph!
 */
export function generateTypeScriptCode(
  nodes: NodeInstance[],
  connections: Connection[],
  definitions: Map<string, NodeDefinition>,
  customTypes?: import('../types').CustomTypeDefinition[],
): string {
  const { order, hasCycle } = getTopologicalOrder(nodes, connections);
  if (hasCycle) {
    return '// Error: Graph contains a cycle (loop). Cannot generate pure function.';
  }

  const incoming = new Map<string, Connection>();
  for (const conn of connections) {
    incoming.set(`${conn.toNodeId}:${conn.toPortId}`, conn);
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Check if any node is async or stream
  const hasAsyncOrStream = nodes.some((n) => {
    const def = definitions.get(n.typeId);
    return (
      def?.isAsync ||
      def?.category === 'Async' ||
      def?.category === 'Stream' ||
      def?.outputs.some((p) => p.type === 'promise' || p.type === 'stream') ||
      def?.inputs.some((p) => p.type === 'promise' || p.type === 'stream')
    );
  });

  const inputNodes = nodes.filter((n) => definitions.get(n.typeId)?.kind === 'input');
  const outputNodes = nodes.filter((n) => definitions.get(n.typeId)?.kind === 'output');

  let ts = `/**\n * Auto-generated Pure Function Pipeline\n * Built with ModuLoom Type-Safe Node Editor\n */\n\n`;

  // Include Stream and Promise helpers if needed
  if (hasAsyncOrStream) {
    ts += `// ==========================================\n// Stream & AsyncIterator Helpers\n// ==========================================\n`;
    ts += `export async function* createIntervalStream(intervalMs = 400, limit = 8): AsyncGenerator<number> {\n`;
    ts += `  for (let i = 0; i < limit; i++) {\n`;
    ts += `    await new Promise(r => setTimeout(r, Math.max(10, intervalMs)));\n`;
    ts += `    yield i;\n`;
    ts += `  }\n`;
    ts += `}\n\n`;

    ts += `export async function* createArrayStream<T>(items: T[], delayMs = 300): AsyncGenerator<T> {\n`;
    ts += `  for (const item of items) {\n`;
    ts += `    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));\n`;
    ts += `    yield item;\n`;
    ts += `  }\n`;
    ts += `}\n\n`;

    ts += `export async function* mapStream<T, R>(source: AsyncIterable<T>, fn: (val: T) => R | Promise<R>): AsyncGenerator<R> {\n`;
    ts += `  for await (const item of source) {\n`;
    ts += `    yield await fn(item);\n`;
    ts += `  }\n`;
    ts += `}\n\n`;

    ts += `export async function* filterStream<T>(source: AsyncIterable<T>, predicate: (val: T) => boolean | Promise<boolean>): AsyncGenerator<T> {\n`;
    ts += `  for await (const item of source) {\n`;
    ts += `    if (await predicate(item)) yield item;\n`;
    ts += `  }\n`;
    ts += `}\n\n`;

    ts += `export async function* takeStream<T>(source: AsyncIterable<T>, count: number): AsyncGenerator<T> {\n`;
    ts += `  let taken = 0;\n`;
    ts += `  for await (const item of source) {\n`;
    ts += `    if (taken++ >= count) break;\n`;
    ts += `    yield item;\n`;
    ts += `  }\n`;
    ts += `}\n\n`;
  }

  // 1. Export Custom Type Interfaces if any exist!
  if (customTypes && customTypes.length > 0) {
    ts += `// ==========================================\n// Custom Type Definitions\n// ==========================================\n`;
    for (const ct of customTypes) {
      ts += `export interface ${ct.name} {\n`;
      for (const field of ct.fields) {
        const tsType = mapDataTypeToTs(field.type, customTypes);
        ts += `  ${field.name}${field.required ? '' : '?'}: ${tsType};\n`;
      }
      ts += `}\n\n`;
    }
  }

  // 2. Define input arguments interface
  ts += `// ==========================================\n// Pipeline Definition\n// ==========================================\n`;
  ts += `export interface PipelineInputs {\n`;
  if (inputNodes.length === 0) {
    ts += `  // No input nodes configured\n`;
  } else {
    for (const inp of inputNodes) {
      const def = definitions.get(inp.typeId);
      const isCompositeInput = inp.typeId === 'composite/input-port';
      const varName = sanitizeVarName(
        String(isCompositeInput ? inp.state?.portName : inp.customLabel || def?.label || inp.id),
      );
      const outType = String(
        isCompositeInput ? inp.state?.portType : def?.outputs[0]?.type || 'any',
      );
      const tsType = mapDataTypeToTs(outType, customTypes);
      const defaultValue = isCompositeInput
        ? inp.state?.testValue
        : (inp.state?.value ?? inp.state);
      ts += `  ${varName}?: ${tsType}; // Default: ${JSON.stringify(defaultValue)}\n`;
    }
  }
  ts += `}\n\n`;

  const asyncKeyword = hasAsyncOrStream ? 'async ' : '';
  ts += `export ${asyncKeyword}function evaluatePipeline(inputs: PipelineInputs = {}) {\n`;

  for (const nodeId of order) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const def = definitions.get(node.typeId);
    if (!def) continue;

    const nodeVar = sanitizeVarName(`node_${node.id}_${def.label}`);

    if (def.kind === 'input') {
      const isCompositeInput = node.typeId === 'composite/input-port';
      const varName = sanitizeVarName(
        String(isCompositeInput ? node.state?.portName : node.customLabel || def.label || node.id),
      );
      const defaultValue = isCompositeInput
        ? (node.state?.testValue ?? def.defaultState?.testValue)
        : (node.state?.value ?? node.state ?? def.defaultState?.value);
      const defaultVal = JSON.stringify(defaultValue);
      const outputPortId = def.outputs[0]?.id || 'value';
      ts += `  // Input: ${def.label}\n`;
      ts += `  const ${nodeVar} = { ${outputPortId}: inputs.${varName} !== undefined ? inputs.${varName} : ${defaultVal} };\n\n`;
    } else if (def.kind === 'output') {
      const port = def.inputs[0];
      const conn = incoming.get(`${nodeId}:${port?.id}`);
      let sourceExpr = 'undefined';
      if (conn) {
        const sourceNode = nodeMap.get(conn.fromNodeId);
        const sourceDef = definitions.get(sourceNode?.typeId || '');
        const sourceVar = sanitizeVarName(`node_${conn.fromNodeId}_${sourceDef?.label}`);
        sourceExpr = `${sourceVar}.${conn.fromPortId}`;
      }
      ts += `  // Output: ${def.label}\n`;
      ts += `  const ${nodeVar} = { value: ${sourceExpr} };\n\n`;
    } else {
      // Pure / Async function node
      ts += `  // ${def.category}: ${def.label}\n`;
      ts += `  const ${nodeVar}_inputs = {\n`;
      for (const p of def.inputs) {
        const conn = incoming.get(`${nodeId}:${p.id}`);
        if (conn) {
          const sourceNode = nodeMap.get(conn.fromNodeId);
          const sourceDef = definitions.get(sourceNode?.typeId || '');
          const sourceVar = sanitizeVarName(`node_${conn.fromNodeId}_${sourceDef?.label}`);
          ts += `    ${p.id}: ${sourceVar}.${conn.fromPortId},\n`;
        } else {
          ts += `    ${p.id}: ${JSON.stringify(p.defaultValue)},\n`;
        }
      }
      ts += `  };\n`;

      // Call implementation
      if (def.customCode) {
        ts += `  const ${nodeVar} = ((inputs) => (${def.customCode}))(${nodeVar}_inputs);\n\n`;
      } else if (def.typeId.startsWith('type/')) {
        // Constructor / Deconstructor for custom type
        if (def.typeId.endsWith('/constructor')) {
          ts += `  const ${nodeVar} = { instance: { ...${nodeVar}_inputs } };\n\n`;
        } else if (def.typeId.endsWith('/deconstruct')) {
          ts += `  const ${nodeVar} = (${nodeVar}_inputs.instance || {});\n\n`;
        } else if (def.typeId.endsWith('/validate')) {
          ts += `  const ${nodeVar} = { isValid: Boolean(${nodeVar}_inputs.data), instance: ${nodeVar}_inputs.data };\n\n`;
        } else {
          ts += `  const ${nodeVar} = { result: ${nodeVar}_inputs };\n\n`;
        }
      } else {
        ts += `  const ${nodeVar} = ${getPureFunctionInlineCode(def.typeId, `${nodeVar}_inputs`)};\n\n`;
      }
    }
  }

  // Return final outputs
  ts += `  return {\n`;
  for (const out of outputNodes) {
    const def = definitions.get(out.typeId);
    const nodeVar = sanitizeVarName(`node_${out.id}_${def?.label}`);
    const key = sanitizeVarName(out.customLabel || def?.label || out.id);
    ts += `    ${key}: ${nodeVar}.value,\n`;
  }
  if (outputNodes.length === 0) {
    ts += `    // Connect output nodes to see return values\n`;
  }
  ts += `  };\n`;
  ts += `}\n`;

  return ts;
}

function sanitizeVarName(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^([0-9])/, '_$1')
    .toLowerCase();
}

function mapDataTypeToTs(
  type: string,
  customTypes?: import('../types').CustomTypeDefinition[],
): string {
  const custom = customTypes?.find((ct) => ct.id === type || ct.name === type);
  if (custom) return custom.name;

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

function getPureFunctionInlineCode(typeId: string, inputsVar: string): string {
  switch (typeId) {
    case 'math/add':
      return `{ result: (${inputsVar}.a ?? 0) + (${inputsVar}.b ?? 0) }`;
    case 'math/subtract':
      return `{ result: (${inputsVar}.a ?? 0) - (${inputsVar}.b ?? 0) }`;
    case 'math/multiply':
      return `{ result: (${inputsVar}.a ?? 0) * (${inputsVar}.b ?? 0) }`;
    case 'math/divide':
      return `{ result: (${inputsVar}.b !== 0 ? (${inputsVar}.a ?? 0) / ${inputsVar}.b : 0) }`;
    case 'math/modulo':
      return `{ result: (${inputsVar}.a ?? 0) % (${inputsVar}.b || 1) }`;
    case 'math/power':
      return `{ result: Math.pow(${inputsVar}.base ?? 0, ${inputsVar}.exponent ?? 1) }`;
    case 'math/round':
      return `{ result: Math.round(${inputsVar}.value ?? 0) }`;
    case 'math/abs':
      return `{ result: Math.abs(${inputsVar}.value ?? 0) }`;
    case 'math/sqrt':
      return `{ result: Math.sqrt(${inputsVar}.value ?? 0) }`;

    case 'string/concat':
      return `{ result: String(${inputsVar}.a ?? '') + String(${inputsVar}.b ?? '') }`;
    case 'string/template':
      return `{ result: String(${inputsVar}.template ?? '').replace(/\\{a\\}/g, String(${inputsVar}.a ?? '')).replace(/\\{b\\}/g, String(${inputsVar}.b ?? '')) }`;
    case 'string/uppercase':
      return `{ result: String(${inputsVar}.text ?? '').toUpperCase() }`;
    case 'string/lowercase':
      return `{ result: String(${inputsVar}.text ?? '').toLowerCase() }`;
    case 'string/split':
      return `{ result: String(${inputsVar}.text ?? '').split(String(${inputsVar}.separator ?? ',')) }`;
    case 'string/length':
      return `{ result: String(${inputsVar}.text ?? '').length }`;

    case 'logic/and':
      return `{ result: Boolean(${inputsVar}.a && ${inputsVar}.b) }`;
    case 'logic/or':
      return `{ result: Boolean(${inputsVar}.a || ${inputsVar}.b) }`;
    case 'logic/not':
      return `{ result: !Boolean(${inputsVar}.value) }`;
    case 'logic/compare':
      return `{ result: Boolean(${inputsVar}.a > ${inputsVar}.b) }`;
    case 'logic/branch':
      return `{ result: ${inputsVar}.condition ? ${inputsVar}.ifTrue : ${inputsVar}.ifFalse }`;

    case 'array/create':
      return `{ result: [${inputsVar}.item1, ${inputsVar}.item2].filter(x => x !== undefined) }`;
    case 'array/length':
      return `{ result: Array.isArray(${inputsVar}.arr) ? ${inputsVar}.arr.length : 0 }`;
    case 'array/join':
      return `{ result: Array.isArray(${inputsVar}.arr) ? ${inputsVar}.arr.join(String(${inputsVar}.separator ?? ',')) : '' }`;
    case 'array/map':
      return `{ result: (Array.isArray(${inputsVar}.arr) ? ${inputsVar}.arr.map(x => typeof x === 'number' ? x * (${inputsVar}.factor ?? 2) : x) : []) }`;
    case 'array/filter':
      return `{ result: (Array.isArray(${inputsVar}.arr) ? ${inputsVar}.arr.filter(x => typeof x === 'number' && x > (${inputsVar}.threshold ?? 0)) : []) }`;
    case 'array/slice':
      return `{ result: (Array.isArray(${inputsVar}.arr) ? ${inputsVar}.arr.slice(${inputsVar}.start ?? 0, ${inputsVar}.end) : []) }`;
    case 'array/reverse':
      return `{ result: (Array.isArray(${inputsVar}.arr) ? [...${inputsVar}.arr].reverse() : []) }`;
    case 'array/sum':
      return `{ result: (Array.isArray(${inputsVar}.arr) ? ${inputsVar}.arr.reduce((acc, c) => acc + (typeof c === 'number' ? c : 0), 0) : 0) }`;

    case 'object/create':
      return `{ result: { [String(${inputsVar}.key ?? 'key')]: ${inputsVar}.value } }`;
    case 'object/get':
      return `{ result: ${inputsVar}.obj ? ${inputsVar}.obj[${inputsVar}.key] : undefined }`;

    // Async / Promise nodes
    case 'async/delay':
      return `await (new Promise(r => setTimeout(r, Math.max(0, ${inputsVar}.delayMs ?? 600))).then(() => ({ result: ${inputsVar}.value, promise: Promise.resolve(${inputsVar}.value) })))`;
    case 'async/resolve':
      return `{ promise: Promise.resolve(${inputsVar}.value) }`;
    case 'async/await':
      return `{ result: (${inputsVar}.promise && typeof ${inputsVar}.promise.then === 'function') ? await ${inputsVar}.promise : ${inputsVar}.promise }`;
    case 'async/all':
      return `{ results: await Promise.all([${inputsVar}.p1, ${inputsVar}.p2]) }`;
    case 'async/fetch':
      return `await (new Promise(r => setTimeout(r, ${inputsVar}.latency ?? 500)).then(() => ({ status: 200, data: { endpoint: ${inputsVar}.endpoint, timestamp: new Date().toLocaleTimeString() }, promise: Promise.resolve({ ok: true }) })))`;

    // Stream / AsyncIterator nodes
    case 'stream/interval':
      return `{ stream: createIntervalStream(${inputsVar}.intervalMs ?? 400, ${inputsVar}.limit ?? 8) }`;
    case 'stream/from_array':
      return `{ stream: createArrayStream(${inputsVar}.items || [], ${inputsVar}.delayMs ?? 300) }`;
    case 'stream/map':
      return `{ stream: mapStream(${inputsVar}.stream, val => typeof val === 'number' ? val * (${inputsVar}.multiplier ?? 2) : val) }`;
    case 'stream/filter':
    case 'stream/filter_even':
      return `{ stream: filterStream(${inputsVar}.stream, val => typeof val === 'number' && val % 2 === 0) }`;
    case 'stream/take':
      return `{ stream: takeStream(${inputsVar}.stream, ${inputsVar}.count ?? 4) }`;
    case 'stream/collect':
      return `await (async () => { const arr: any[] = []; for await (const item of (${inputsVar}.stream || [])) { arr.push(item); if (arr.length >= 50) break; } return { array: arr, count: arr.length }; })()`;

    default:
      return `{ result: ${inputsVar} }`;
  }
}
