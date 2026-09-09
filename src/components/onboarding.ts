import type { Connection, GraphEvaluation, NodeDefinition, NodeInstance } from '../types';

export const ONBOARDING_STORAGE_KEY = 'moduloom:onboarding-status';
export const STARTER_PRESET_ID = 'math-calc';

export type OnboardingStage = 'input' | 'process' | 'output' | 'connect' | 'run' | 'success';

export interface OnboardingProgress {
  stage: OnboardingStage;
  step: number;
  result?: unknown;
}

export function getOnboardingProgress(
  nodes: NodeInstance[],
  connections: Connection[],
  definitions: Map<string, NodeDefinition>,
  evaluation: GraphEvaluation,
): OnboardingProgress {
  const kindByNodeId = new Map(
    nodes.map((node) => [node.id, definitions.get(node.typeId)?.kind] as const),
  );
  const hasInput = [...kindByNodeId.values()].includes('input');
  if (!hasInput) return { stage: 'input', step: 1 };

  const hasProcess = [...kindByNodeId.values()].includes('pure');
  if (!hasProcess) return { stage: 'process', step: 2 };

  const outputNodeIds = nodes
    .filter((node) => kindByNodeId.get(node.id) === 'output')
    .map((node) => node.id);
  if (outputNodeIds.length === 0) return { stage: 'output', step: 3 };

  const connectedOutputNodeIds = findConnectedOutputNodeIds(nodes, connections, kindByNodeId);
  if (connectedOutputNodeIds.length === 0) return { stage: 'connect', step: 4 };

  const successfulOutput = connectedOutputNodeIds
    .map((nodeId) => evaluation[nodeId])
    .find((result) => result?.evaluatedAt !== undefined && !result.error);
  if (!successfulOutput) return { stage: 'run', step: 5 };

  return {
    stage: 'success',
    step: 5,
    result: successfulOutput.outputs.displayedValue ?? Object.values(successfulOutput.outputs)[0],
  };
}

function findConnectedOutputNodeIds(
  nodes: NodeInstance[],
  connections: Connection[],
  kindByNodeId: Map<string, NodeDefinition['kind'] | undefined>,
) {
  const outgoing = new Map<string, string[]>();
  for (const connection of connections) {
    const targets = outgoing.get(connection.fromNodeId) ?? [];
    targets.push(connection.toNodeId);
    outgoing.set(connection.fromNodeId, targets);
  }

  const queue = nodes
    .filter((node) => kindByNodeId.get(node.id) === 'input')
    .map((node) => ({ nodeId: node.id, passedProcess: false }));
  const visited = new Set<string>();
  const outputNodeIds = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const visitKey = `${current.nodeId}:${current.passedProcess}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    for (const targetNodeId of outgoing.get(current.nodeId) ?? []) {
      const targetKind = kindByNodeId.get(targetNodeId);
      const passedProcess = current.passedProcess || targetKind === 'pure';
      if (targetKind === 'output' && passedProcess) outputNodeIds.add(targetNodeId);
      queue.push({ nodeId: targetNodeId, passedProcess });
    }
  }

  return [...outputNodeIds];
}

export function shouldShowOnboarding(storage: Pick<Storage, 'getItem'>): boolean {
  return storage.getItem(ONBOARDING_STORAGE_KEY) === null;
}
