import type {
  Connection,
  CustomTypeDefinition,
  FlowProjectExport,
  NodeDefinition,
  NodeInstance,
  Port,
} from '../types';
import { BUILTIN_NODES } from '../nodes/definitions';
import { generateNodesForCustomType } from '../nodes/customTypeNodes';
import { getTopologicalOrder } from './dagEngine';
import { isTypeCompatible } from './typeSystem';

export const CURRENT_PROJECT_VERSION = '1.0.0' as const;

const DEFAULT_VIEWPORT = { zoom: 1, pan: { x: 60, y: 80 } };
const BUILTIN_DATA_TYPES = new Set([
  'number',
  'string',
  'boolean',
  'array',
  'object',
  'promise',
  'stream',
  'any',
]);
const NODE_CATEGORIES = new Set([
  'Math',
  'String',
  'Logic',
  'Array',
  'Object',
  'Async',
  'Stream',
  'Input',
  'Output',
  'Utility',
  'Custom',
  'Composite',
]);
const NODE_KINDS = new Set(['pure', 'input', 'output']);

export class ProjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectValidationError';
  }
}

function fail(path: string, message: string): never {
  throw new ProjectValidationError(`${path}: ${message}`);
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'オブジェクトである必要があります。');
  }
  return value as Record<string, unknown>;
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, '配列である必要があります。');
  return value;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(path, '空でない文字列である必要があります。');
  }
  return value;
}

function expectFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, '有限の数値である必要があります。');
  }
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return expectString(value, path);
}

function optionalText(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') fail(path, '文字列である必要があります。');
  return value;
}

function optionalBoolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') fail(path, 'boolean である必要があります。');
  return value;
}

function parsePort(value: unknown, path: string): Port {
  const port = expectRecord(value, path);
  return {
    id: expectString(port.id, `${path}.id`),
    name: expectString(port.name, `${path}.name`),
    type: expectString(port.type, `${path}.type`),
    description: optionalText(port.description, `${path}.description`),
    ...(port.defaultValue !== undefined ? { defaultValue: port.defaultValue } : {}),
  };
}

function assertUniqueIds(items: Array<{ id: string }>, path: string): void {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.id)) fail(`${path}[${index}].id`, `ID '${item.id}' が重複しています。`);
    seen.add(item.id);
  }
}

function parseNode(value: unknown, path: string): NodeInstance {
  const node = expectRecord(value, path);
  return {
    id: expectString(node.id, `${path}.id`),
    typeId: expectString(node.typeId, `${path}.typeId`),
    x: expectFiniteNumber(node.x, `${path}.x`),
    y: expectFiniteNumber(node.y, `${path}.y`),
    ...(node.state !== undefined ? { state: node.state } : {}),
    ...(node.customLabel !== undefined
      ? { customLabel: expectString(node.customLabel, `${path}.customLabel`) }
      : {}),
  };
}

function parseConnection(value: unknown, path: string): Connection {
  const connection = expectRecord(value, path);
  return {
    id: expectString(connection.id, `${path}.id`),
    fromNodeId: expectString(connection.fromNodeId, `${path}.fromNodeId`),
    fromPortId: expectString(connection.fromPortId, `${path}.fromPortId`),
    toNodeId: expectString(connection.toNodeId, `${path}.toNodeId`),
    toPortId: expectString(connection.toPortId, `${path}.toPortId`),
  };
}

function parseCustomType(value: unknown, path: string): CustomTypeDefinition {
  const customType = expectRecord(value, path);
  const fields = expectArray(customType.fields, `${path}.fields`).map((fieldValue, index) => {
    const fieldPath = `${path}.fields[${index}]`;
    const field = expectRecord(fieldValue, fieldPath);
    const type = expectString(field.type, `${fieldPath}.type`);
    if (!BUILTIN_DATA_TYPES.has(type)) {
      fail(`${fieldPath}.type`, `未対応の組み込み型 '${type}' です。`);
    }
    if (field.required !== undefined && typeof field.required !== 'boolean') {
      fail(`${fieldPath}.required`, 'boolean である必要があります。');
    }
    return {
      name: expectString(field.name, `${fieldPath}.name`),
      type: type as CustomTypeDefinition['fields'][number]['type'],
      ...(field.required !== undefined ? { required: field.required } : {}),
      ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}),
    };
  });
  const fieldNames = new Set<string>();
  for (const [index, field] of fields.entries()) {
    if (fieldNames.has(field.name)) {
      fail(`${path}.fields[${index}].name`, `フィールド名 '${field.name}' が重複しています。`);
    }
    fieldNames.add(field.name);
  }

  return {
    id: expectString(customType.id, `${path}.id`),
    name: expectString(customType.name, `${path}.name`),
    color: expectString(customType.color, `${path}.color`),
    description: optionalText(customType.description, `${path}.description`),
    fields,
  };
}

function parseCustomDefinition(value: unknown, path: string): NodeDefinition {
  const definition = expectRecord(value, path);
  const typeId = expectString(definition.typeId, `${path}.typeId`);
  const category = expectString(definition.category, `${path}.category`);
  const kind = expectString(definition.kind, `${path}.kind`);
  if (!NODE_CATEGORIES.has(category))
    fail(`${path}.category`, `未対応のカテゴリ '${category}' です。`);
  if (!NODE_KINDS.has(kind)) fail(`${path}.kind`, `未対応の kind '${kind}' です。`);

  const inputs = expectArray(definition.inputs, `${path}.inputs`).map((port, index) =>
    parsePort(port, `${path}.inputs[${index}]`),
  );
  const outputs = expectArray(definition.outputs, `${path}.outputs`).map((port, index) =>
    parsePort(port, `${path}.outputs[${index}]`),
  );
  assertUniqueIds(inputs, `${path}.inputs`);
  assertUniqueIds(outputs, `${path}.outputs`);
  if (outputs.length === 0) fail(`${path}.outputs`, '1件以上の出力ポートが必要です。');

  const isComposite = optionalBoolean(definition.isComposite, `${path}.isComposite`) === true;
  const isAsync = optionalBoolean(definition.isAsync, `${path}.isAsync`) === true;
  let compositeSubgraph: NodeDefinition['compositeSubgraph'];
  if (isComposite) {
    const subgraph = expectRecord(definition.compositeSubgraph, `${path}.compositeSubgraph`);
    compositeSubgraph = {
      nodes: expectArray(subgraph.nodes, `${path}.compositeSubgraph.nodes`).map((node, index) =>
        parseNode(node, `${path}.compositeSubgraph.nodes[${index}]`),
      ),
      connections: expectArray(subgraph.connections, `${path}.compositeSubgraph.connections`).map(
        (connection, index) =>
          parseConnection(connection, `${path}.compositeSubgraph.connections[${index}]`),
      ),
      inputNodeIds: expectArray(
        subgraph.inputNodeIds,
        `${path}.compositeSubgraph.inputNodeIds`,
      ).map((id, index) => expectString(id, `${path}.compositeSubgraph.inputNodeIds[${index}]`)),
      outputNodeIds: expectArray(
        subgraph.outputNodeIds,
        `${path}.compositeSubgraph.outputNodeIds`,
      ).map((id, index) => expectString(id, `${path}.compositeSubgraph.outputNodeIds[${index}]`)),
    };
  }

  const customCode = optionalString(definition.customCode, `${path}.customCode`);
  if (!isComposite && !customCode) {
    fail(`${path}.customCode`, '自作ノードには実行する式が必要です。');
  }

  const primaryOutputId = outputs[0].id;
  let evaluate: NodeDefinition['evaluate'] = () => ({});
  if (customCode) {
    let compiled: (inputs: Record<string, unknown>) => unknown;
    try {
      compiled = new Function('inputs', `return (${customCode});`) as typeof compiled;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(`${path}.customCode`, `式の構文エラー: ${message}`);
    }
    evaluate = (inputs) => {
      try {
        return { [primaryOutputId]: compiled(inputs) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`カスタム関数エラー: ${message}`, { cause: error });
      }
    };
  }

  return {
    typeId,
    label: expectString(definition.label, `${path}.label`),
    category: category as NodeDefinition['category'],
    kind: kind as NodeDefinition['kind'],
    description: optionalText(definition.description, `${path}.description`),
    inputs,
    outputs,
    evaluate,
    ...(definition.defaultState !== undefined ? { defaultState: definition.defaultState } : {}),
    ...(customCode ? { customCode } : {}),
    ...(isAsync ? { isAsync: true } : {}),
    ...(isComposite ? { isComposite: true, compositeSubgraph } : {}),
  };
}

function validateGraph(
  nodes: NodeInstance[],
  connections: Connection[],
  definitions: Map<string, NodeDefinition>,
  customTypes: CustomTypeDefinition[],
  path: string,
): void {
  assertUniqueIds(nodes, `${path}.nodes`);
  assertUniqueIds(connections, `${path}.connections`);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const occupiedInputs = new Set<string>();

  for (const [index, node] of nodes.entries()) {
    if (!definitions.has(node.typeId)) {
      fail(`${path}.nodes[${index}].typeId`, `未登録のノード定義 '${node.typeId}' です。`);
    }
  }

  for (const [index, connection] of connections.entries()) {
    const connectionPath = `${path}.connections[${index}]`;
    const fromNode = nodeMap.get(connection.fromNodeId);
    const toNode = nodeMap.get(connection.toNodeId);
    if (!fromNode)
      fail(`${connectionPath}.fromNodeId`, `ノード '${connection.fromNodeId}' が存在しません。`);
    if (!toNode)
      fail(`${connectionPath}.toNodeId`, `ノード '${connection.toNodeId}' が存在しません。`);

    const fromDefinition = definitions.get(fromNode.typeId)!;
    const toDefinition = definitions.get(toNode.typeId)!;
    const fromPort = fromDefinition.outputs.find(({ id }) => id === connection.fromPortId);
    const toPort = toDefinition.inputs.find(({ id }) => id === connection.toPortId);
    if (!fromPort) {
      fail(
        `${connectionPath}.fromPortId`,
        `出力ポート '${connection.fromPortId}' が存在しません。`,
      );
    }
    if (!toPort) {
      fail(`${connectionPath}.toPortId`, `入力ポート '${connection.toPortId}' が存在しません。`);
    }

    const inputKey = `${connection.toNodeId}:${connection.toPortId}`;
    if (occupiedInputs.has(inputKey)) {
      fail(connectionPath, `入力 '${inputKey}' に複数の接続があります。`);
    }
    occupiedInputs.add(inputKey);

    if (!isTypeCompatible(fromPort.type, toPort.type, customTypes)) {
      fail(
        connectionPath,
        `型 '${fromPort.type}' の出力を型 '${toPort.type}' の入力へ接続できません。`,
      );
    }
  }

  if (getTopologicalOrder(nodes, connections).hasCycle) {
    fail(`${path}.connections`, '循環参照が検出されました。DAG構造が必要です。');
  }
}

type ProjectMigration = (project: Record<string, unknown>) => Record<string, unknown>;

const PROJECT_MIGRATIONS: Record<string, ProjectMigration> = {
  [CURRENT_PROJECT_VERSION]: (project) => project,
};

export function migrateFlowProject(input: unknown): Record<string, unknown> {
  const project = expectRecord(input, 'project');
  const version = expectString(project.version, 'project.version');
  const migrate = PROJECT_MIGRATIONS[version];
  if (!migrate) {
    fail(
      'project.version',
      `未対応のバージョン '${version}' です。対応バージョンは ${CURRENT_PROJECT_VERSION} です。`,
    );
  }
  return migrate(project);
}

export function parseFlowProject(input: unknown): FlowProjectExport {
  const project = migrateFlowProject(input);
  const customTypes = (
    project.customTypes === undefined ? [] : expectArray(project.customTypes, 'project.customTypes')
  ).map((customType, index) => parseCustomType(customType, `project.customTypes[${index}]`));
  assertUniqueIds(customTypes, 'project.customTypes');
  const customTypeNames = new Set<string>();
  for (const [index, customType] of customTypes.entries()) {
    if (customTypeNames.has(customType.name)) {
      fail(
        `project.customTypes[${index}].name`,
        `カスタム型名 '${customType.name}' が重複しています。`,
      );
    }
    customTypeNames.add(customType.name);
  }

  const customDefinitions = (
    project.customDefinitions === undefined
      ? []
      : expectArray(project.customDefinitions, 'project.customDefinitions')
  ).map((definition, index) =>
    parseCustomDefinition(definition, `project.customDefinitions[${index}]`),
  );
  const customDefinitionTypeIds = new Set<string>();
  for (const [index, definition] of customDefinitions.entries()) {
    if (customDefinitionTypeIds.has(definition.typeId)) {
      fail(
        `project.customDefinitions[${index}].typeId`,
        `typeId '${definition.typeId}' が重複しています。`,
      );
    }
    customDefinitionTypeIds.add(definition.typeId);
  }
  const validDataTypes = new Set([
    ...BUILTIN_DATA_TYPES,
    ...customTypes.flatMap(({ id, name }) => [id, name]),
  ]);
  for (const [definitionIndex, definition] of customDefinitions.entries()) {
    for (const [portIndex, port] of definition.inputs.entries()) {
      if (!validDataTypes.has(port.type)) {
        fail(
          `project.customDefinitions[${definitionIndex}].inputs[${portIndex}].type`,
          `未登録のデータ型 '${port.type}' です。`,
        );
      }
    }
    for (const [portIndex, port] of definition.outputs.entries()) {
      if (!validDataTypes.has(port.type)) {
        fail(
          `project.customDefinitions[${definitionIndex}].outputs[${portIndex}].type`,
          `未登録のデータ型 '${port.type}' です。`,
        );
      }
    }
  }

  const generatedDefinitions = customTypes.flatMap(generateNodesForCustomType);
  const definitions = new Map<string, NodeDefinition>();
  for (const definition of [...BUILTIN_NODES, ...generatedDefinitions]) {
    definitions.set(definition.typeId, definition);
  }
  for (const [index, definition] of customDefinitions.entries()) {
    if (definitions.has(definition.typeId)) {
      fail(
        `project.customDefinitions[${index}].typeId`,
        `組み込みまたはカスタム型由来の定義 '${definition.typeId}' と重複しています。`,
      );
    }
    definitions.set(definition.typeId, definition);
  }

  const nodes = expectArray(project.nodes, 'project.nodes').map((node, index) =>
    parseNode(node, `project.nodes[${index}]`),
  );
  const connections = expectArray(project.connections, 'project.connections').map(
    (connection, index) => parseConnection(connection, `project.connections[${index}]`),
  );
  validateGraph(nodes, connections, definitions, customTypes, 'project');

  for (const [index, definition] of customDefinitions.entries()) {
    const subgraph = definition.compositeSubgraph;
    if (!subgraph) continue;
    const subgraphPath = `project.customDefinitions[${index}].compositeSubgraph`;
    validateGraph(subgraph.nodes, subgraph.connections, definitions, customTypes, subgraphPath);
    const subgraphNodeIds = new Set(subgraph.nodes.map(({ id }) => id));
    const inputNodeIds = new Set<string>();
    for (const [inputIndex, nodeId] of subgraph.inputNodeIds.entries()) {
      if (!subgraphNodeIds.has(nodeId)) {
        fail(`${subgraphPath}.inputNodeIds[${inputIndex}]`, `ノード '${nodeId}' が存在しません。`);
      }
      if (inputNodeIds.has(nodeId)) {
        fail(
          `${subgraphPath}.inputNodeIds[${inputIndex}]`,
          `ノード '${nodeId}' が重複しています。`,
        );
      }
      inputNodeIds.add(nodeId);
      const inputNode = subgraph.nodes.find(({ id }) => id === nodeId)!;
      if (inputNode.typeId !== 'composite/input-port') {
        fail(
          `${subgraphPath}.inputNodeIds[${inputIndex}]`,
          `ノード '${nodeId}' は composite/input-port ではありません。`,
        );
      }
    }
    const outputNodeIds = new Set<string>();
    for (const [outputIndex, nodeId] of subgraph.outputNodeIds.entries()) {
      if (!subgraphNodeIds.has(nodeId)) {
        fail(
          `${subgraphPath}.outputNodeIds[${outputIndex}]`,
          `ノード '${nodeId}' が存在しません。`,
        );
      }
      if (outputNodeIds.has(nodeId)) {
        fail(
          `${subgraphPath}.outputNodeIds[${outputIndex}]`,
          `ノード '${nodeId}' が重複しています。`,
        );
      }
      outputNodeIds.add(nodeId);
      const outputNode = subgraph.nodes.find(({ id }) => id === nodeId)!;
      if (outputNode.typeId !== 'composite/output-port') {
        fail(
          `${subgraphPath}.outputNodeIds[${outputIndex}]`,
          `ノード '${nodeId}' は composite/output-port ではありません。`,
        );
      }
    }
  }

  let viewport = DEFAULT_VIEWPORT;
  if (project.viewport !== undefined) {
    const rawViewport = expectRecord(project.viewport, 'project.viewport');
    const rawPan = expectRecord(rawViewport.pan, 'project.viewport.pan');
    viewport = {
      zoom: expectFiniteNumber(rawViewport.zoom, 'project.viewport.zoom'),
      pan: {
        x: expectFiniteNumber(rawPan.x, 'project.viewport.pan.x'),
        y: expectFiniteNumber(rawPan.y, 'project.viewport.pan.y'),
      },
    };
    if (viewport.zoom <= 0) fail('project.viewport.zoom', '0より大きい必要があります。');
  }

  return {
    version: CURRENT_PROJECT_VERSION,
    appName:
      project.appName === undefined
        ? 'ModuLoom Project'
        : expectString(project.appName, 'project.appName'),
    exportedAt:
      project.exportedAt === undefined
        ? new Date().toISOString()
        : expectString(project.exportedAt, 'project.exportedAt'),
    nodes,
    connections,
    customTypes,
    customDefinitions,
    viewport,
  };
}

export function parseFlowProjectJson(text: string): FlowProjectExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProjectValidationError(`JSONの構文エラー: ${message}`);
  }
  return parseFlowProject(parsed);
}
