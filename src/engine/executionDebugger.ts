import type {
  Connection,
  GraphEvaluation,
  NodeDefinition,
  NodeEvaluationResult,
  NodeInstance,
} from '../types';
import {
  evaluateCompositeNode,
  evaluateCompositeNodeAsync,
  getTopologicalOrder,
  resolveNodeInputs,
} from './dagEngine';
import { collectStream, isAsyncIterable, isPromise } from './streamEngine';
import { isEvaluationCancelled, raceWithEvaluationCancellation } from './evaluationCancellation';

export type DebuggerStatus = 'paused' | 'running' | 'waiting' | 'completed' | 'cancelled';

export interface DebugNodeTrace extends NodeEvaluationResult {
  status: 'cached' | 'waiting' | 'completed' | 'error' | 'cancelled';
  changed: boolean;
  errorPath: string[];
}

export interface ExecutionDebuggerSnapshot {
  order: string[];
  evaluation: GraphEvaluation;
  traces: Record<string, DebugNodeTrace>;
  status: DebuggerStatus;
  nextNodeId?: string;
  lastNodeId?: string;
  breakpoints: string[];
  /** Active graph hierarchy. Empty for the root graph. */
  path?: string[];
  nodes?: NodeInstance[];
  breadcrumbs?: Array<{ path: string[]; label: string }>;
  compositeBoundary?: Array<{
    direction: 'input' | 'output';
    externalPortId: string;
    externalPortName: string;
    internalNodeId: string;
    internalNodeName: string;
  }>;
}

export interface CompositeExecutionContext {
  nodeId: string;
  node: NodeInstance;
  definition: NodeDefinition;
  inputs: Record<string, unknown>;
  mode: 'step' | 'continue';
  signal: AbortSignal;
}

type SnapshotListener = (snapshot: ExecutionDebuggerSnapshot) => void;

export class DagExecutionDebugger {
  private readonly order: string[];
  private readonly nodeMap: Map<string, NodeInstance>;
  private readonly incoming = new Map<string, Connection>();
  private readonly evaluation: GraphEvaluation = {};
  private readonly traces: Record<string, DebugNodeTrace> = {};
  private readonly previousEvaluation: GraphEvaluation;
  private readonly dirtyNodeIds?: Set<string>;
  private breakpoints: Set<string>;
  private index = 0;
  private status: DebuggerStatus = 'paused';
  private lastNodeId?: string;
  private pausedAtBreakpoint?: string;
  private readonly abortController = new AbortController();
  private readonly compositeExecutor?: (
    context: CompositeExecutionContext,
  ) => Promise<Record<string, unknown>>;
  private cancelled = false;

  constructor(
    nodes: NodeInstance[],
    connections: Connection[],
    private readonly definitions: Map<string, NodeDefinition>,
    options: {
      previousEvaluation?: GraphEvaluation;
      dirtyNodeIds?: Set<string>;
      breakpoints?: Iterable<string>;
      signal?: AbortSignal;
      compositeExecutor?: (context: CompositeExecutionContext) => Promise<Record<string, unknown>>;
    } = {},
  ) {
    const topological = getTopologicalOrder(nodes, connections);
    if (topological.hasCycle) throw new Error('循環参照があるグラフはデバッグ実行できません。');
    this.order = topological.order;
    this.nodeMap = new Map(nodes.map((node) => [node.id, node]));
    for (const connection of connections) {
      this.incoming.set(`${connection.toNodeId}:${connection.toPortId}`, connection);
    }
    this.previousEvaluation = options.previousEvaluation ?? {};
    this.dirtyNodeIds = options.dirtyNodeIds;
    this.breakpoints = new Set(options.breakpoints);
    this.compositeExecutor = options.compositeExecutor;
    options.signal?.addEventListener('abort', () => this.cancel(), { once: true });
    if (this.order.length === 0) this.status = 'completed';
  }

  getSnapshot(): ExecutionDebuggerSnapshot {
    return {
      order: [...this.order],
      evaluation: { ...this.evaluation },
      traces: { ...this.traces },
      status: this.status,
      nextNodeId: this.order[this.index],
      lastNodeId: this.lastNodeId,
      breakpoints: [...this.breakpoints],
    };
  }

  setBreakpoints(nodeIds: Iterable<string>) {
    this.breakpoints = new Set(nodeIds);
  }

  async step(listener?: SnapshotListener): Promise<ExecutionDebuggerSnapshot> {
    if (
      this.status === 'running' ||
      this.status === 'waiting' ||
      this.status === 'completed' ||
      this.status === 'cancelled'
    ) {
      return this.getSnapshot();
    }
    const nodeId = this.order[this.index];
    if (!nodeId) {
      this.status = 'completed';
      return this.emit(listener);
    }

    this.status = 'running';
    if (this.pausedAtBreakpoint === nodeId) this.pausedAtBreakpoint = undefined;
    this.emit(listener);
    await this.executeNode(nodeId, listener, 'step');
    this.lastNodeId = nodeId;
    this.index += 1;
    if (!this.cancelled) this.status = this.index >= this.order.length ? 'completed' : 'paused';
    return this.emit(listener);
  }

  async continue(listener?: SnapshotListener): Promise<ExecutionDebuggerSnapshot> {
    if (
      this.status === 'running' ||
      this.status === 'waiting' ||
      this.status === 'completed' ||
      this.status === 'cancelled'
    ) {
      return this.getSnapshot();
    }
    const breakpointToSkip = this.pausedAtBreakpoint;
    this.pausedAtBreakpoint = undefined;
    this.status = 'running';
    this.emit(listener);
    while (this.index < this.order.length && !this.cancelled) {
      const nodeId = this.order[this.index];
      if (this.breakpoints.has(nodeId) && nodeId !== breakpointToSkip) {
        this.pausedAtBreakpoint = nodeId;
        this.status = 'paused';
        return this.emit(listener);
      }
      await this.executeNode(nodeId, listener, 'continue');
      this.lastNodeId = nodeId;
      this.index += 1;
    }
    if (!this.cancelled) this.status = 'completed';
    return this.emit(listener);
  }

  cancel(listener?: SnapshotListener): ExecutionDebuggerSnapshot {
    this.cancelled = true;
    this.status = 'cancelled';
    this.abortController.abort();
    return this.emit(listener);
  }

  private async executeNode(
    nodeId: string,
    listener: SnapshotListener | undefined,
    mode: 'step' | 'continue',
  ) {
    const node = this.nodeMap.get(nodeId);
    const definition = node ? this.definitions.get(node.typeId) : undefined;
    if (!node || !definition) {
      this.record(nodeId, {}, {}, `未登録のノード定義: ${node?.typeId ?? nodeId}`, 0, false);
      return;
    }

    const { inputs, sourceErrorPath, sourceError } = this.resolveInputs(nodeId, definition);
    if (sourceError) {
      this.record(nodeId, inputs, {}, sourceError, 0, false, [...sourceErrorPath, nodeId]);
      return;
    }

    const previous = this.previousEvaluation[nodeId];
    if (this.dirtyNodeIds && !this.dirtyNodeIds.has(nodeId) && previous) {
      const cached = { ...previous, inputs, isCached: true };
      this.evaluation[nodeId] = cached;
      this.traces[nodeId] = {
        ...cached,
        status: 'cached',
        changed: false,
        errorPath: previous.error ? [nodeId] : [],
      };
      this.emit(listener);
      return;
    }

    const isWaiting =
      definition.isAsync || definition.category === 'Async' || definition.category === 'Stream';
    if (isWaiting) {
      this.status = 'waiting';
      const pending: DebugNodeTrace = {
        inputs,
        outputs: {},
        isPending: true,
        isStreaming: definition.category === 'Stream',
        isCached: false,
        status: 'waiting',
        changed: false,
        errorPath: [],
      };
      this.traces[nodeId] = pending;
      this.evaluation[nodeId] = pending;
      this.emit(listener);
    }

    const startedAt = performance.now();
    const signal = this.abortController.signal;
    try {
      let outputs: Record<string, unknown>;
      if (definition.isComposite && definition.compositeSubgraph) {
        if (this.compositeExecutor) {
          outputs = await this.compositeExecutor({
            nodeId,
            node,
            definition,
            inputs,
            mode,
            signal,
          });
        } else {
          const hasAsync = definition.compositeSubgraph.nodes.some((innerNode) => {
            const innerDefinition = this.definitions.get(innerNode.typeId);
            return innerDefinition?.isAsync || innerDefinition?.category === 'Async';
          });
          outputs = hasAsync
            ? await raceWithEvaluationCancellation(
                evaluateCompositeNodeAsync(
                  definition.compositeSubgraph,
                  inputs,
                  this.definitions,
                  signal,
                ),
                signal,
              )
            : evaluateCompositeNode(definition.compositeSubgraph, inputs, this.definitions);
        }
      } else if (definition.typeId === 'stream/collect' && isAsyncIterable(inputs.stream)) {
        outputs = await this.collectStream(
          inputs.stream as AsyncIterable<unknown> & { cancel?: () => void },
          signal,
          nodeId,
          inputs,
          listener,
        );
      } else {
        const value = definition.evaluate(inputs, node.state, { signal });
        outputs = isPromise(value)
          ? await raceWithEvaluationCancellation(
              Promise.resolve(value as Promise<Record<string, unknown>>),
              signal,
            )
          : (value as Record<string, unknown>);
      }
      this.record(nodeId, inputs, outputs ?? {}, undefined, performance.now() - startedAt, false);
    } catch (error) {
      if (this.cancelled || isEvaluationCancelled(error)) {
        this.record(
          nodeId,
          inputs,
          {},
          undefined,
          performance.now() - startedAt,
          false,
          [],
          'cancelled',
        );
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.record(
        nodeId,
        inputs,
        {},
        message,
        performance.now() - startedAt,
        false,
        [nodeId],
        'error',
      );
    }
  }

  private resolveInputs(nodeId: string, definition: NodeDefinition) {
    const resolved = resolveNodeInputs(nodeId, definition, this.incoming, this.evaluation);
    const sourceConnection = definition.inputs
      .map((port) => this.incoming.get(`${nodeId}:${port.id}`))
      .find((connection) => connection && this.evaluation[connection.fromNodeId]?.error);
    return {
      inputs: resolved.inputs,
      sourceError: resolved.error,
      sourceErrorPath: sourceConnection
        ? (this.traces[sourceConnection.fromNodeId]?.errorPath ?? [sourceConnection.fromNodeId])
        : ([] as string[]),
    };
  }

  private async collectStream(
    stream: AsyncIterable<unknown> & { cancel?: () => void },
    signal: AbortSignal,
    nodeId: string,
    inputs: Record<string, unknown>,
    listener?: SnapshotListener,
  ) {
    const values = await collectStream(
      stream,
      (item, currentValues) => {
        if (signal.aborted) return;
        const progress: DebugNodeTrace = {
          inputs,
          outputs: { array: currentValues, count: currentValues.length },
          isStreaming: true,
          streamCount: currentValues.length,
          latestStreamValue: item,
          isCached: false,
          status: 'waiting',
          changed: false,
          errorPath: [],
        };
        this.traces[nodeId] = progress;
        this.evaluation[nodeId] = progress;
        this.emit(listener);
      },
      50,
      signal,
    );
    return { array: values, count: values.length };
  }

  private record(
    nodeId: string,
    inputs: Record<string, unknown>,
    outputs: Record<string, unknown>,
    error: string | undefined,
    durationMs: number,
    isCached: boolean,
    errorPath: string[] = error ? [nodeId] : [],
    status: DebugNodeTrace['status'] = error ? 'error' : 'completed',
  ) {
    const result: NodeEvaluationResult = {
      inputs,
      outputs,
      ...(error ? { error } : {}),
      durationMs: Number(durationMs.toFixed(2)),
      isPending: false,
      isStreaming: false,
      isCached,
      evaluatedAt: Date.now(),
    };
    const previous = this.previousEvaluation[nodeId];
    this.evaluation[nodeId] = result;
    this.traces[nodeId] = {
      ...result,
      status,
      changed:
        !previous ||
        stableSerialize(previous.outputs) !== stableSerialize(outputs) ||
        previous.error !== error,
      errorPath,
    };
  }

  private emit(listener?: SnapshotListener) {
    const snapshot = this.getSnapshot();
    listener?.(snapshot);
    return snapshot;
  }
}

function stableSerialize(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
