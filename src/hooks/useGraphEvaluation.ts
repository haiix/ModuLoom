import { useCallback, useEffect, useRef, useState } from 'react';

import {
  detectDirtySeedNodeIds,
  evaluateGraph,
  evaluateGraphAsync,
  getDownstreamNodeIds,
} from '../engine/dagEngine';
import type { Connection, GraphEvaluation, NodeDefinition, NodeInstance } from '../types';

export interface EvaluationStats {
  dirtyCount: number;
  totalCount: number;
  lastDirtyNodeIds: string[];
}

const EMPTY_STATS: EvaluationStats = {
  dirtyCount: 0,
  totalCount: 0,
  lastDirtyNodeIds: [],
};

export function useGraphEvaluation(
  nodes: NodeInstance[],
  connections: Connection[],
  definitions: Map<string, NodeDefinition>,
) {
  const [isLiveReactive, setIsLiveReactive] = useState(true);
  const [manualEvalTrigger, setManualEvalTrigger] = useState(0);
  const [evaluation, setEvaluation] = useState<GraphEvaluation>({});
  const [evalStats, setEvalStats] = useState<EvaluationStats>(EMPTY_STATS);
  const lastManualEvalTriggerRef = useRef(0);
  const previousGraphRef = useRef<{ nodes: NodeInstance[]; connections: Connection[] }>({
    nodes: [],
    connections: [],
  });
  const evaluationRef = useRef<GraphEvaluation>({});
  const activeEvaluationAbortRef = useRef<AbortController | null>(null);
  evaluationRef.current = evaluation;

  const abortActiveEvaluation = useCallback(() => {
    activeEvaluationAbortRef.current?.abort();
    activeEvaluationAbortRef.current = null;
  }, []);

  useEffect(() => abortActiveEvaluation, [abortActiveEvaluation]);

  const runEvaluation = useCallback(
    (dirtyNodeIds: Set<string> | undefined, previousEvaluation: GraphEvaluation) => {
      abortActiveEvaluation();
      const dirtyList = dirtyNodeIds ? Array.from(dirtyNodeIds) : nodes.map((node) => node.id);
      setEvalStats({
        dirtyCount: dirtyList.length,
        totalCount: nodes.length,
        lastDirtyNodeIds: dirtyList,
      });

      const syncEvaluation = evaluateGraph(
        nodes,
        connections,
        definitions,
        previousEvaluation,
        dirtyNodeIds,
      );
      setEvaluation(syncEvaluation);

      const hasDirtyAsyncOrStream = nodes.some((node) => {
        if (dirtyNodeIds && !dirtyNodeIds.has(node.id)) return false;
        const definition = definitions.get(node.typeId);
        return (
          definition?.isAsync ||
          definition?.category === 'Async' ||
          definition?.category === 'Stream'
        );
      });
      if (!hasDirtyAsyncOrStream) return;

      const controller = new AbortController();
      activeEvaluationAbortRef.current = controller;
      void evaluateGraphAsync(
        nodes,
        connections,
        definitions,
        syncEvaluation,
        dirtyNodeIds,
        (nodeId, partial) => {
          if (controller.signal.aborted) return;
          setEvaluation((current) => ({
            ...current,
            [nodeId]: { ...(current[nodeId] || {}), ...partial },
          }));
        },
        controller.signal,
      ).then((finalEvaluation) => {
        if (!controller.signal.aborted) setEvaluation(finalEvaluation);
      });
    },
    [abortActiveEvaluation, connections, definitions, nodes],
  );

  useEffect(() => {
    const manualEvaluationRequested = manualEvalTrigger !== lastManualEvalTriggerRef.current;
    lastManualEvalTriggerRef.current = manualEvalTrigger;
    if (!isLiveReactive && !manualEvaluationRequested) {
      abortActiveEvaluation();
      if (manualEvalTrigger === 0) setEvaluation({});
      return;
    }

    const previousGraph = previousGraphRef.current;
    const dirtySeeds = manualEvaluationRequested
      ? ('all' as const)
      : detectDirtySeedNodeIds(previousGraph.nodes, nodes, previousGraph.connections, connections);
    previousGraphRef.current = {
      nodes: nodes.map((node) => ({ ...node })),
      connections: [...connections],
    };
    if (dirtySeeds !== 'all' && dirtySeeds.size === 0) return;

    const dirtyNodeIds =
      dirtySeeds === 'all' ? undefined : getDownstreamNodeIds(dirtySeeds, connections);
    runEvaluation(dirtyNodeIds, evaluationRef.current);
  }, [abortActiveEvaluation, connections, isLiveReactive, manualEvalTrigger, nodes, runEvaluation]);

  const reevaluateNode = useCallback(
    (nodeId: string) => {
      const dirtyNodeIds = getDownstreamNodeIds(new Set([nodeId]), connections);
      const previousEvaluation = { ...evaluationRef.current };
      for (const dirtyNodeId of dirtyNodeIds) delete previousEvaluation[dirtyNodeId];
      runEvaluation(dirtyNodeIds, previousEvaluation);
    },
    [connections, runEvaluation],
  );

  const resetEvaluationState = useCallback(() => {
    abortActiveEvaluation();
    previousGraphRef.current = { nodes: [], connections: [] };
    evaluationRef.current = {};
    setEvaluation({});
    setEvalStats(EMPTY_STATS);
  }, [abortActiveEvaluation]);

  const requestManualEvaluation = useCallback(() => {
    setManualEvalTrigger((trigger) => trigger + 1);
  }, []);

  const getCurrentEvaluation = useCallback(() => evaluationRef.current, []);

  return {
    evaluation,
    evalStats,
    isLiveReactive,
    setIsLiveReactive,
    requestManualEvaluation,
    reevaluateNode,
    resetEvaluationState,
    getCurrentEvaluation,
  };
}
