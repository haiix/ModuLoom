import type { CompositePortMapping, Connection, NodeDefinition, NodeInstance } from '../types';
import {
  DagExecutionDebugger,
  type CompositeExecutionContext,
  type ExecutionDebuggerSnapshot,
} from './executionDebugger';
import { EvaluationCancelledError } from './evaluationCancellation';

type SnapshotListener = (snapshot: ExecutionDebuggerSnapshot) => void;

interface DebugFrame {
  path: string[];
  label: string;
  nodes: NodeInstance[];
  connections: Connection[];
  session: DagExecutionDebugger;
  parent?: DebugFrame;
  definition?: NodeDefinition;
  pending?: {
    resolve: (outputs: Record<string, unknown>) => void;
    reject: (error: unknown) => void;
  };
}

function frameKey(path: string[]): string {
  return JSON.stringify(path);
}

function breakpointKey(path: string[], nodeId: string): string {
  return path.length === 0 ? nodeId : `${path.join(' > ')} > ${nodeId}`;
}

/** Coordinates nested DAG debugger sessions without touching normal reactive evaluation state. */
export class HierarchicalExecutionDebugger {
  private readonly frames = new Map<string, DebugFrame>();
  private readonly breakpoints: Set<string>;
  private readonly root: DebugFrame;
  private active: DebugFrame;
  private listener?: SnapshotListener;

  constructor(
    nodes: NodeInstance[],
    connections: Connection[],
    private readonly definitions: Map<string, NodeDefinition>,
    options: ConstructorParameters<typeof DagExecutionDebugger>[3] = {},
  ) {
    this.breakpoints = new Set(options.breakpoints);
    const rootOptions = options.dirtyNodeIds
      ? {
          ...options,
          dirtyNodeIds: new Set([
            ...options.dirtyNodeIds,
            ...nodes
              .filter((node) => this.definitions.get(node.typeId)?.isComposite)
              .map(({ id }) => id),
          ]),
        }
      : options;
    this.root = this.createFrame(
      [],
      '親グラフ',
      nodes,
      connections,
      undefined,
      undefined,
      rootOptions,
    );
    this.active = this.root;
  }

  getSnapshot(): ExecutionDebuggerSnapshot {
    const snapshot = this.active.session.getSnapshot();
    return {
      ...snapshot,
      nodes: this.active.nodes,
      path: [...this.active.path],
      breadcrumbs: this.getBreadcrumbs(this.active),
      breakpoints: snapshot.order.filter((nodeId) =>
        this.breakpoints.has(breakpointKey(this.active.path, nodeId)),
      ),
      compositeBoundary: this.active.definition
        ? this.getBoundary(this.active.definition, this.active.nodes)
        : undefined,
    };
  }

  getBreakpointKey(nodeId: string): string {
    return breakpointKey(this.active.path, nodeId);
  }

  setBreakpoints(keys: Iterable<string>): void {
    this.breakpoints.clear();
    for (const key of keys) this.breakpoints.add(key);
    for (const frame of this.frames.values()) {
      frame.session.setBreakpoints(
        frame.session
          .getSnapshot()
          .order.filter((nodeId) => this.breakpoints.has(breakpointKey(frame.path, nodeId))),
      );
    }
    this.notify();
  }

  enterComposite(nodeId: string): ExecutionDebuggerSnapshot {
    const child = this.frames.get(frameKey([...this.active.path, nodeId]));
    if (child) this.active = child;
    return this.notify();
  }

  leaveComposite(): ExecutionDebuggerSnapshot {
    if (this.active.parent) this.active = this.active.parent;
    return this.notify();
  }

  navigateTo(path: string[]): ExecutionDebuggerSnapshot {
    const frame = this.frames.get(frameKey(path));
    if (frame) this.active = frame;
    return this.notify();
  }

  async step(listener?: SnapshotListener): Promise<ExecutionDebuggerSnapshot> {
    if (listener) this.listener = listener;
    const frame = this.active;
    const snapshot = await frame.session.step(() => this.notify());
    this.finishFrameIfNeeded(frame, snapshot);
    return this.notify();
  }

  async continue(listener?: SnapshotListener): Promise<ExecutionDebuggerSnapshot> {
    if (listener) this.listener = listener;
    const frame = this.active;
    const snapshot = await frame.session.continue(() => this.notify());
    this.finishFrameIfNeeded(frame, snapshot);
    return this.notify();
  }

  cancel(listener?: SnapshotListener): ExecutionDebuggerSnapshot {
    if (listener) this.listener = listener;
    for (const frame of [...this.frames.values()].reverse()) {
      frame.session.cancel();
      frame.pending?.reject(new EvaluationCancelledError());
      frame.pending = undefined;
    }
    this.active = this.root;
    return this.notify();
  }

  private createFrame(
    path: string[],
    label: string,
    nodes: NodeInstance[],
    connections: Connection[],
    parent?: DebugFrame,
    definition?: NodeDefinition,
    rootOptions: ConstructorParameters<typeof DagExecutionDebugger>[3] = {},
    signal?: AbortSignal,
  ): DebugFrame {
    const frame = {} as DebugFrame;
    const session = new DagExecutionDebugger(nodes, connections, this.definitions, {
      ...(path.length === 0 ? rootOptions : {}),
      signal,
      breakpoints: nodes
        .map(({ id }) => id)
        .filter((nodeId) => this.breakpoints.has(breakpointKey(path, nodeId))),
      compositeExecutor: (context) => this.executeComposite(frame, context),
    });
    Object.assign(frame, { path, label, nodes, connections, session, parent, definition });
    this.frames.set(frameKey(path), frame);
    return frame;
  }

  private executeComposite(
    parent: DebugFrame,
    context: CompositeExecutionContext,
  ): Promise<Record<string, unknown>> {
    const subgraph = context.definition.compositeSubgraph!;
    const path = [...parent.path, context.nodeId];
    this.removeFrameAndDescendants(path);
    const nodes = this.injectCompositeInputs(
      subgraph.nodes,
      subgraph.inputPortMappings,
      context.inputs,
    );
    const child = this.createFrame(
      path,
      context.node.customLabel || context.definition.label,
      nodes,
      subgraph.connections.map((connection) => ({ ...connection })),
      parent,
      context.definition,
      {},
      context.signal,
    );
    this.active = child;
    this.notify();

    const completion = new Promise<Record<string, unknown>>((resolve, reject) => {
      child.pending = { resolve, reject };
    });
    if (child.session.getSnapshot().status === 'completed') {
      this.finishFrameIfNeeded(child, child.session.getSnapshot());
    } else if (context.mode === 'continue') {
      void child.session
        .continue(() => this.notify())
        .then((snapshot) => this.finishFrameIfNeeded(child, snapshot))
        .catch((error) => child.pending?.reject(error));
    }
    return completion;
  }

  private finishFrameIfNeeded(frame: DebugFrame, snapshot: ExecutionDebuggerSnapshot): void {
    if (!frame.pending || snapshot.status !== 'completed') return;
    const pending = frame.pending;
    try {
      const outputs = this.collectCompositeOutputs(frame, snapshot);
      frame.pending = undefined;
      this.active = frame.parent ?? this.root;
      pending.resolve(outputs);
    } catch (error) {
      frame.pending = undefined;
      this.active = frame.parent ?? this.root;
      pending.reject(error);
    }
    this.notify();
  }

  private collectCompositeOutputs(
    frame: DebugFrame,
    snapshot: ExecutionDebuggerSnapshot,
  ): Record<string, unknown> {
    const definition = frame.definition!;
    const subgraph = definition.compositeSubgraph!;
    const outputPortByNode = new Map(
      subgraph.outputPortMappings?.map(({ externalPortId, internalNodeId }) => [
        internalNodeId,
        externalPortId,
      ]),
    );
    const outputs: Record<string, unknown> = {};
    for (const nodeId of subgraph.outputNodeIds) {
      const node = frame.nodes.find(({ id }) => id === nodeId);
      const trace = snapshot.traces[nodeId];
      if (trace?.error) throw new Error(`${frame.path.join(' → ')} → ${nodeId}: ${trace.error}`);
      const portName = String(node?.state?.portName ?? 'result');
      const externalPortId = outputPortByNode.get(nodeId) ?? portName;
      outputs[externalPortId] =
        trace?.inputs?.in ?? trace?.outputs?.out ?? trace?.outputs?.[portName];
    }
    return outputs;
  }

  private injectCompositeInputs(
    sourceNodes: NodeInstance[],
    mappings: CompositePortMapping[] | undefined,
    inputs: Record<string, unknown>,
  ): NodeInstance[] {
    const externalPortByNode = new Map(
      mappings?.map(({ externalPortId, internalNodeId }) => [internalNodeId, externalPortId]),
    );
    return sourceNodes.map((source) => {
      const node = structuredClone(source);
      if (node.typeId === 'composite/input-port') {
        const externalPortId =
          externalPortByNode.get(node.id) ?? String(node.state?.portName ?? 'x');
        if (externalPortId in inputs)
          node.state = { ...node.state, testValue: inputs[externalPortId] };
      }
      return node;
    });
  }

  private getBreadcrumbs(frame: DebugFrame): Array<{ path: string[]; label: string }> {
    const breadcrumbs: Array<{ path: string[]; label: string }> = [];
    let current: DebugFrame | undefined = frame;
    while (current) {
      breadcrumbs.unshift({ path: [...current.path], label: current.label });
      current = current.parent;
    }
    return breadcrumbs;
  }

  private getBoundary(definition: NodeDefinition, nodes: NodeInstance[]) {
    const subgraph = definition.compositeSubgraph!;
    const describe = (direction: 'input' | 'output') => {
      const ports = direction === 'input' ? definition.inputs : definition.outputs;
      const nodeIds = direction === 'input' ? subgraph.inputNodeIds : subgraph.outputNodeIds;
      const mappings =
        direction === 'input' ? subgraph.inputPortMappings : subgraph.outputPortMappings;
      return ports.map((port, index) => {
        const internalNodeId =
          mappings?.find(({ externalPortId }) => externalPortId === port.id)?.internalNodeId ??
          nodeIds[index];
        const node = nodes.find(({ id }) => id === internalNodeId);
        const terminalName = direction === 'input' ? 'Group Input' : 'Group Output';
        return {
          direction,
          externalPortId: port.id,
          externalPortName: port.name,
          internalNodeId,
          internalNodeName: `${terminalName} ${String(node?.state?.portName ?? internalNodeId)} (${internalNodeId})`,
        };
      });
    };
    return [...describe('input'), ...describe('output')];
  }

  private removeFrameAndDescendants(path: string[]): void {
    for (const [key, frame] of this.frames) {
      if (
        frame.path.length >= path.length &&
        path.every((part, index) => frame.path[index] === part)
      ) {
        frame.session.cancel();
        this.frames.delete(key);
      }
    }
  }

  private notify(): ExecutionDebuggerSnapshot {
    const snapshot = this.getSnapshot();
    this.listener?.(snapshot);
    return snapshot;
  }
}
