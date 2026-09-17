import type {
  Connection,
  CustomTypeDefinition,
  DataType,
  NodeDefinition,
  NodeInstance,
  Port,
} from '../types';
import { getTopologicalOrder, hasNodeCodeGenerationImplementation } from './dagEngine';
import { isTypeCompatible } from './typeSystem';

export type GraphDiagnosticSeverity = 'error' | 'warning' | 'info';

export interface GraphDiagnostic {
  id: string;
  code:
    | 'missing-definition'
    | 'required-input'
    | 'invalid-connection'
    | 'duplicate-input'
    | 'type-mismatch'
    | 'cycle'
    | 'unused-node'
    | 'any-boundary'
    | 'missing-codegen'
    | 'nondeterministic'
    | 'untrusted-custom-code';
  severity: GraphDiagnosticSeverity;
  message: string;
  detail?: string;
  nodeId?: string;
  connectionId?: string;
}

export interface GraphDiagnosticOptions {
  trustedCustomCodeTypeIds?: ReadonlySet<string>;
}

const SEVERITY_ORDER: Record<GraphDiagnosticSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

function effectivePortType(node: NodeInstance, port: Port, isOutput: boolean): DataType {
  if (node.typeId === 'composite/input-port' && isOutput) {
    return node.state?.portType || port.type;
  }
  if (node.typeId === 'composite/output-port' && !isOutput) {
    return node.state?.portType || port.type;
  }
  return port.type;
}

export function analyzeGraph(
  nodes: NodeInstance[],
  connections: Connection[],
  definitions: Map<string, NodeDefinition>,
  customTypes: CustomTypeDefinition[] = [],
  options: GraphDiagnosticOptions = {},
): GraphDiagnostic[] {
  const diagnostics: GraphDiagnostic[] = [];
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const incomingByTarget = new Map<string, Connection[]>();

  for (const connection of connections) {
    const key = `${connection.toNodeId}:${connection.toPortId}`;
    const incoming = incomingByTarget.get(key) ?? [];
    incoming.push(connection);
    incomingByTarget.set(key, incoming);

    const fromNode = nodesById.get(connection.fromNodeId);
    const toNode = nodesById.get(connection.toNodeId);
    const fromDefinition = fromNode ? definitions.get(fromNode.typeId) : undefined;
    const toDefinition = toNode ? definitions.get(toNode.typeId) : undefined;
    const fromPort = fromDefinition?.outputs.find((port) => port.id === connection.fromPortId);
    const toPort = toDefinition?.inputs.find((port) => port.id === connection.toPortId);
    if (!fromNode || !toNode || !fromDefinition || !toDefinition || !fromPort || !toPort) {
      diagnostics.push({
        id: `invalid-connection:${connection.id}`,
        code: 'invalid-connection',
        severity: 'error',
        message: '接続先またはポートが見つかりません。',
        detail: `${connection.fromNodeId}:${connection.fromPortId} → ${connection.toNodeId}:${connection.toPortId}`,
        nodeId: toNode?.id ?? fromNode?.id,
        connectionId: connection.id,
      });
      continue;
    }

    const fromType = effectivePortType(fromNode, fromPort, true);
    const toType = effectivePortType(toNode, toPort, false);
    if (!isTypeCompatible(fromType, toType, customTypes)) {
      diagnostics.push({
        id: `type-mismatch:${connection.id}`,
        code: 'type-mismatch',
        severity: 'error',
        message: `互換性のない型が接続されています: ${fromType} → ${toType}`,
        nodeId: toNode.id,
        connectionId: connection.id,
      });
    } else if (fromType === 'any' && toType !== 'any') {
      diagnostics.push({
        id: `any-boundary:${connection.id}`,
        code: 'any-boundary',
        severity: 'warning',
        message: `any から ${toType} へ値が流入します。`,
        detail: '実行時の値が入力型を満たすことを確認してください。',
        nodeId: toNode.id,
        connectionId: connection.id,
      });
    }
  }

  for (const [target, incoming] of incomingByTarget) {
    if (incoming.length <= 1) continue;
    diagnostics.push({
      id: `duplicate-input:${target}`,
      code: 'duplicate-input',
      severity: 'error',
      message: '1つの入力ポートに複数の接続があります。',
      nodeId: incoming[0].toNodeId,
      connectionId: incoming[1].id,
    });
  }

  for (const node of nodes) {
    const definition = definitions.get(node.typeId);
    if (!definition) {
      diagnostics.push({
        id: `missing-definition:${node.id}`,
        code: 'missing-definition',
        severity: 'error',
        message: `未登録のノード定義です: ${node.typeId}`,
        nodeId: node.id,
      });
      continue;
    }

    for (const port of definition.inputs) {
      if (!port.required) continue;
      if (incomingByTarget.has(`${node.id}:${port.id}`)) continue;
      diagnostics.push({
        id: `required-input:${node.id}:${port.id}`,
        code: 'required-input',
        severity: 'error',
        message: `必須入力「${port.name}」が接続されていません。`,
        nodeId: node.id,
      });
    }

    if (!hasNodeCodeGenerationImplementation(definition) && !definition.isComposite) {
      diagnostics.push({
        id: `missing-codegen:${node.id}`,
        code: 'missing-codegen',
        severity: 'warning',
        message: 'TypeScriptコード生成に対応していません。',
        detail: definition.label,
        nodeId: node.id,
      });
    }

    if (definition.execution?.determinism !== 'deterministic') {
      diagnostics.push({
        id: `nondeterministic:${node.id}`,
        code: 'nondeterministic',
        severity: 'info',
        message:
          definition.execution?.determinism === 'time-dependent'
            ? '時間経過に依存するノードです。'
            : '再評価ごとに結果が変わる可能性があります。',
        detail: definition.label,
        nodeId: node.id,
      });
    }

    if (definition.customCode && !options.trustedCustomCodeTypeIds?.has(definition.typeId)) {
      diagnostics.push({
        id: `untrusted-custom-code:${node.id}`,
        code: 'untrusted-custom-code',
        severity: 'warning',
        message: '信頼が確認されていない自作コードを含みます。',
        detail: definition.label,
        nodeId: node.id,
      });
    }
  }

  const { order, hasCycle } = getTopologicalOrder(nodes, connections);
  if (hasCycle) {
    const ordered = new Set(order);
    const targetNode = nodes.find((node) => !ordered.has(node.id)) ?? nodes[0];
    diagnostics.push({
      id: 'cycle:graph',
      code: 'cycle',
      severity: 'error',
      message: 'グラフに循環があるため実行できません。',
      nodeId: targetNode?.id,
    });
  }

  const contributingNodeIds = new Set<string>();
  const incomingNodes = new Map<string, string[]>();
  for (const connection of connections) {
    if (!nodesById.has(connection.fromNodeId) || !nodesById.has(connection.toNodeId)) continue;
    const upstream = incomingNodes.get(connection.toNodeId) ?? [];
    upstream.push(connection.fromNodeId);
    incomingNodes.set(connection.toNodeId, upstream);
  }
  const queue = nodes
    .filter((node) => definitions.get(node.typeId)?.kind === 'output')
    .map((node) => node.id);
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (contributingNodeIds.has(nodeId)) continue;
    contributingNodeIds.add(nodeId);
    queue.push(...(incomingNodes.get(nodeId) ?? []));
  }
  for (const node of nodes) {
    if (!definitions.has(node.typeId) || contributingNodeIds.has(node.id)) continue;
    diagnostics.push({
      id: `unused-node:${node.id}`,
      code: 'unused-node',
      severity: 'warning',
      message: 'このノードは出力結果に寄与していません。',
      nodeId: node.id,
    });
  }

  return diagnostics.sort((left, right) => {
    const severity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (severity !== 0) return severity;
    return left.id.localeCompare(right.id);
  });
}
