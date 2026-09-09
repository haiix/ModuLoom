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
} from './dagEngine';
import { isAsyncIterable, isPromise } from './streamEngine';

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
  private activeAbortController?: AbortController;
  private activeStream?: AsyncIterable<unknown> & { cancel?: () => void };
  private cancelled = false;

  constructor(
    nodes: NodeInstance[],
    connections: Connection[],
    private readonly definitions: Map<string, NodeDefinition>,
    options: {
      previousEvaluation?: GraphEvaluation;
      dirtyNodeIds?: Set<string>;
      breakpoints?: Iterable<string>;
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
    this.emit(listener);
    await this.executeNode(nodeId, listener);
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
    const breakpointToSkip = this.order[this.index];
    this.status = 'running';
    this.emit(listener);
    while (this.index < this.order.length && !this.cancelled) {
      const nodeId = this.order[this.index];
      if (this.breakpoints.has(nodeId) && nodeId !== breakpointToSkip) {
        this.status = 'paused';
        return this.emit(listener);
      }
      await this.executeNode(nodeId, listener);
      this.lastNodeId = nodeId;
      this.index += 1;
    }
    if (!this.cancelled) this.status = 'completed';
    return this.emit(listener);
  }

  cancel(listener?: SnapshotListener): ExecutionDebuggerSnapshot {
    this.cancelled = true;
    this.status = 'cancelled';
    this.activeAbortController?.abort();
    this.activeStream?.cancel?.();
    return this.emit(listener);
  }

  private async executeNode(nodeId: string, listener?: SnapshotListener) {
    const node = this.nodeMap.get(nodeId);
    const definition = node ? this.definitions.get(node.typeId) : undefined;
    if (!node || !definition) {
      this.record(nodeId, {}, {}, `未登録のノード定義: ${node?.typeId ?? nodeId}`, 0, false);
      return;
    }

    const { inputs, sourceErrorPath, sourceError } = this.resolveInputs(nodeId, definition);
    if (sourceError) {
      this.record(
        nodeId,
        inputs,
        {},
        `入力元ノードでエラーが発生しています: ${sourceError}`,
        0,
        false,
        [...sourceErrorPath, nodeId],
      );
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
    const controller = new AbortController();
    this.activeAbortController = controller;
    try {
      let outputs: Record<string, unknown>;
      if (definition.isComposite && definition.compositeSubgraph) {
        const hasAsync = definition.compositeSubgraph.nodes.some((innerNode) => {
          const innerDefinition = this.definitions.get(innerNode.typeId);
          return innerDefinition?.isAsync || innerDefinition?.category === 'Async';
        });
        outputs = hasAsync
          ? await raceWithAbort(
              evaluateCompositeNodeAsync(
                definition.compositeSubgraph,
                inputs,
                this.definitions,
                () => controller.signal.aborted,
              ),
              controller.signal,
            )
          : evaluateCompositeNode(definition.compositeSubgraph, inputs, this.definitions);
      } else if (definition.typeId === 'stream/collect' && isAsyncIterable(inputs.stream)) {
        outputs = await this.collectStream(
          inputs.stream as AsyncIterable<unknown> & { cancel?: () => void },
          controller.signal,
          nodeId,
          inputs,
          listener,
        );
      } else {
        const value = definition.evaluate(inputs, node.state, { signal: controller.signal });
        outputs = isPromise(value)
          ? await raceWithAbort(
              Promise.resolve(value as Promise<Record<string, unknown>>),
              controller.signal,
            )
          : (value as Record<string, unknown>);
      }
      this.record(nodeId, inputs, outputs ?? {}, undefined, performance.now() - startedAt, false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.record(
        nodeId,
        inputs,
        {},
        this.cancelled ? 'デバッグ実行がキャンセルされました。' : message,
        performance.now() - startedAt,
        false,
        [nodeId],
        this.cancelled ? 'cancelled' : 'error',
      );
    } finally {
      this.activeAbortController = undefined;
      this.activeStream = undefined;
    }
  }

  private resolveInputs(nodeId: string, definition: NodeDefinition) {
    const inputs: Record<string, unknown> = {};
    for (const port of definition.inputs) {
      const connection = this.incoming.get(`${nodeId}:${port.id}`);
      if (!connection) {
        inputs[port.id] = cloneValue(port.defaultValue);
        continue;
      }
      const source = this.evaluation[connection.fromNodeId];
      if (source?.error) {
        return {
          inputs,
          sourceError: source.error,
          sourceErrorPath: this.traces[connection.fromNodeId]?.errorPath ?? [connection.fromNodeId],
        };
      }
      inputs[port.id] =
        source && connection.fromPortId in source.outputs
          ? source.outputs[connection.fromPortId]
          : cloneValue(port.defaultValue);
    }
    return { inputs, sourceErrorPath: [] as string[], sourceError: undefined };
  }

  private async collectStream(
    stream: AsyncIterable<unknown> & { cancel?: () => void },
    signal: AbortSignal,
    nodeId: string,
    inputs: Record<string, unknown>,
    listener?: SnapshotListener,
  ) {
    this.activeStream = stream;
    const iterator = stream[Symbol.asyncIterator]();
    const values: unknown[] = [];
    try {
      while (values.length < 50) {
        const item = await raceWithAbort(iterator.next(), signal);
        if (item.done) break;
        values.push(item.value);
        const progress: DebugNodeTrace = {
          inputs,
          outputs: { array: [...values], count: values.length },
          isStreaming: true,
          streamCount: values.length,
          latestStreamValue: item.value,
          isCached: false,
          status: 'waiting',
          changed: false,
          errorPath: [],
        };
        this.traces[nodeId] = progress;
        this.evaluation[nodeId] = progress;
        this.emit(listener);
      }
    } finally {
      if (signal.aborted) {
        stream.cancel?.();
        void Promise.resolve(iterator.return?.()).catch(() => undefined);
      }
    }
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

function cloneValue(value: unknown) {
  return value !== null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function stableSerialize(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('デバッグ実行がキャンセルされました。'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error('デバッグ実行がキャンセルされました。'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}
