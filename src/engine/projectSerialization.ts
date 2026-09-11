import type {
  Connection,
  CustomTypeDefinition,
  FlowProjectExport,
  LoadedFlowProject,
  NodeDefinition,
  NodeInstance,
  Port,
  SerializedNodeDefinition,
} from '../types';
import type { EditorDocument } from './editorHistory';
import { CURRENT_PROJECT_VERSION, parseFlowProject, ProjectValidationError } from './projectFormat';

export const CURRENT_RECOVERY_STORAGE_VERSION = 2 as const;

export interface ProjectViewport {
  zoom: number;
  pan: { x: number; y: number };
}

export interface RecoverySnapshot {
  storageVersion: typeof CURRENT_RECOVERY_STORAGE_VERSION;
  project: FlowProjectExport;
  updatedAt: string;
  revision: number;
  writerId: string;
  wasDirty: boolean;
  trustedCodeFingerprint?: string;
}

export type ParsedRecoverySnapshot = Omit<RecoverySnapshot, 'project'> & {
  project: LoadedFlowProject;
};

interface SerializeFlowProjectOptions {
  document: EditorDocument;
  viewport: ProjectViewport;
  exportedAt: string;
}

function serializePort(port: Port): Port {
  return {
    id: port.id,
    name: port.name,
    type: port.type,
    ...(port.description !== undefined ? { description: port.description } : {}),
    ...(port.required !== undefined ? { required: port.required } : {}),
    ...(port.defaultValue !== undefined ? { defaultValue: port.defaultValue } : {}),
    ...(port.exampleValue !== undefined ? { exampleValue: port.exampleValue } : {}),
    ...(port.constraints !== undefined ? { constraints: port.constraints } : {}),
  };
}

function serializeNode(node: NodeInstance): NodeInstance {
  return {
    id: node.id,
    typeId: node.typeId,
    x: node.x,
    y: node.y,
    ...(node.state !== undefined ? { state: node.state } : {}),
    ...(node.customLabel !== undefined ? { customLabel: node.customLabel } : {}),
  };
}

function serializeConnection(connection: Connection): Connection {
  return {
    id: connection.id,
    fromNodeId: connection.fromNodeId,
    fromPortId: connection.fromPortId,
    toNodeId: connection.toNodeId,
    toPortId: connection.toPortId,
  };
}

function serializeCustomType(customType: CustomTypeDefinition): CustomTypeDefinition {
  return {
    id: customType.id,
    name: customType.name,
    color: customType.color,
    ...(customType.description !== undefined ? { description: customType.description } : {}),
    fields: customType.fields.map((field) => ({
      name: field.name,
      type: field.type,
      ...(field.required !== undefined ? { required: field.required } : {}),
      ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}),
    })),
  };
}

function serializeDefinition(definition: NodeDefinition): SerializedNodeDefinition {
  return {
    typeId: definition.typeId,
    label: definition.label,
    category: definition.category,
    kind: definition.kind,
    ...(definition.description !== undefined ? { description: definition.description } : {}),
    ...(definition.shortDescription !== undefined
      ? { shortDescription: definition.shortDescription }
      : {}),
    ...(definition.details !== undefined ? { details: definition.details } : {}),
    inputs: definition.inputs.map(serializePort),
    outputs: definition.outputs.map(serializePort),
    ...(definition.defaultState !== undefined ? { defaultState: definition.defaultState } : {}),
    ...(definition.initialState !== undefined ? { initialState: definition.initialState } : {}),
    ...(definition.execution !== undefined ? { execution: definition.execution } : {}),
    ...(definition.customCode !== undefined ? { customCode: definition.customCode } : {}),
    ...(definition.isAsync !== undefined ? { isAsync: definition.isAsync } : {}),
    ...(definition.isComposite !== undefined ? { isComposite: definition.isComposite } : {}),
    ...(definition.compositeSubgraph
      ? {
          compositeSubgraph: {
            nodes: definition.compositeSubgraph.nodes.map(serializeNode),
            connections: definition.compositeSubgraph.connections.map(serializeConnection),
            inputNodeIds: [...definition.compositeSubgraph.inputNodeIds],
            outputNodeIds: [...definition.compositeSubgraph.outputNodeIds],
            ...(definition.compositeSubgraph.inputPortMappings
              ? {
                  inputPortMappings: definition.compositeSubgraph.inputPortMappings.map(
                    (mapping) => ({ ...mapping }),
                  ),
                }
              : {}),
            ...(definition.compositeSubgraph.outputPortMappings
              ? {
                  outputPortMappings: definition.compositeSubgraph.outputPortMappings.map(
                    (mapping) => ({ ...mapping }),
                  ),
                }
              : {}),
          },
        }
      : {}),
  };
}

export function serializeFlowProject({
  document,
  viewport,
  exportedAt,
}: SerializeFlowProjectOptions): FlowProjectExport {
  return {
    version: CURRENT_PROJECT_VERSION,
    appName: 'ModuLoom Project',
    exportedAt,
    nodes: document.nodes.map(serializeNode),
    connections: document.connections.map(serializeConnection),
    customTypes: document.customTypes.map(serializeCustomType),
    customDefinitions: document.customDefinitions.map(serializeDefinition),
    viewport: {
      zoom: viewport.zoom,
      pan: { x: viewport.pan.x, y: viewport.pan.y },
    },
  };
}

export function createRecoverySnapshot(
  project: FlowProjectExport,
  metadata: Omit<RecoverySnapshot, 'storageVersion' | 'project'>,
): RecoverySnapshot {
  return {
    storageVersion: CURRENT_RECOVERY_STORAGE_VERSION,
    project,
    ...metadata,
  };
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProjectValidationError(`${path}: オブジェクトである必要があります。`);
  }
  return value as Record<string, unknown>;
}

export function parseRecoverySnapshot(input: unknown): ParsedRecoverySnapshot {
  const snapshot = expectRecord(input, 'snapshot');
  if (
    snapshot.storageVersion !== 1 &&
    snapshot.storageVersion !== CURRENT_RECOVERY_STORAGE_VERSION
  ) {
    throw new ProjectValidationError(
      `snapshot.storageVersion: 未対応のバージョン '${String(snapshot.storageVersion)}' です。` +
        ` 対応バージョンは '${CURRENT_RECOVERY_STORAGE_VERSION}' です。`,
    );
  }
  if (typeof snapshot.updatedAt !== 'string' || snapshot.updatedAt.trim() === '') {
    throw new ProjectValidationError('snapshot.updatedAt: 空でない文字列である必要があります。');
  }
  if (!Number.isSafeInteger(snapshot.revision) || (snapshot.revision as number) < 0) {
    throw new ProjectValidationError('snapshot.revision: 0以上の安全な整数である必要があります。');
  }
  if (
    snapshot.storageVersion === CURRENT_RECOVERY_STORAGE_VERSION &&
    (typeof snapshot.writerId !== 'string' || snapshot.writerId.trim() === '')
  ) {
    throw new ProjectValidationError('snapshot.writerId: 空でない文字列である必要があります。');
  }
  if (typeof snapshot.wasDirty !== 'boolean') {
    throw new ProjectValidationError('snapshot.wasDirty: boolean である必要があります。');
  }
  if (
    snapshot.trustedCodeFingerprint !== undefined &&
    (typeof snapshot.trustedCodeFingerprint !== 'string' ||
      snapshot.trustedCodeFingerprint.trim() === '')
  ) {
    throw new ProjectValidationError(
      'snapshot.trustedCodeFingerprint: 空でない文字列である必要があります。',
    );
  }

  return {
    storageVersion: CURRENT_RECOVERY_STORAGE_VERSION,
    project: parseFlowProject(snapshot.project),
    updatedAt: snapshot.updatedAt,
    revision: snapshot.revision as number,
    writerId:
      snapshot.storageVersion === 1 ? 'legacy-recovery-snapshot' : (snapshot.writerId as string),
    wasDirty: snapshot.wasDirty,
    ...(snapshot.trustedCodeFingerprint !== undefined
      ? { trustedCodeFingerprint: snapshot.trustedCodeFingerprint as string }
      : {}),
  };
}
