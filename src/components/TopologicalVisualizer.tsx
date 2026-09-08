import React from 'react';
import {
  NodeDefinition,
  NodeInstance,
  GraphEvaluation,
  CustomTypeDefinition,
  getTypeStyle,
} from '../types';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';

interface TopologicalVisualizerProps {
  order: string[];
  hasCycle: boolean;
  nodes: NodeInstance[];
  definitions: Map<string, NodeDefinition>;
  evaluation: GraphEvaluation;
  stepIndex: number | null; // null means all executed
  customTypes?: CustomTypeDefinition[];
  onStepNext: () => void;
  onResetStep: () => void;
  onTogglePlayStep: () => void;
  isPlayingStep: boolean;
}

export const TopologicalVisualizer: React.FC<TopologicalVisualizerProps> = ({
  order,
  hasCycle,
  nodes,
  definitions,
  evaluation,
  stepIndex,
  customTypes = [],
  onStepNext,
  onResetStep,
  onTogglePlayStep,
  isPlayingStep,
}) => {
  const nodeMap = new Map<string, NodeInstance>(nodes.map((n) => [n.id, n]));

  if (hasCycle) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-600 dark:text-red-400 text-xs">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="font-medium">
          循環参照（ループ）を検出しました: 有向非巡回グラフ (DAG)
          の制約に違反しているため評価を一時停止しています。
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            トポロジカル実行順序 (DAG 評価フロー)
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
            {order.length} ノード
          </span>
        </div>

        {/* Stepping controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onTogglePlayStep}
            title={isPlayingStep ? '一時停止' : '自動ステップ再生'}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 transition"
          >
            {isPlayingStep ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isPlayingStep ? '停止' : '順次実行'}</span>
          </button>
          <button
            onClick={onStepNext}
            title="次のノードを実行"
            className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
          >
            次へ進む
          </button>
          <button
            onClick={onResetStep}
            title="リセット"
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sequence badges */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-thin text-xs">
        {order.map((nodeId, idx) => {
          const node = nodeMap.get(nodeId);
          const def = definitions.get(node?.typeId || '');
          if (!node || !def) return null;

          const evalResult = evaluation[nodeId];
          const isActive = stepIndex !== null && stepIndex === idx;
          const isDone = stepIndex === null || idx <= stepIndex;
          const outType = def.outputs[0]?.type || def.inputs[0]?.type || 'any';

          return (
            <React.Fragment key={nodeId}>
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all shrink-0 ${
                  isActive
                    ? 'ring-2 ring-indigo-500 ring-offset-1 bg-indigo-50 dark:bg-indigo-950/80 border-indigo-300 dark:border-indigo-700 scale-105'
                    : isDone
                      ? 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700'
                      : 'opacity-40 bg-slate-100 dark:bg-slate-900 border-dashed border-slate-300 dark:border-slate-800'
                }`}
              >
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300">
                  {idx + 1}
                </span>

                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: getTypeStyle(outType, customTypes).color }}
                    />
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {node.customLabel || def.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="capitalize">{def.kind}</span>
                    {evalResult?.isCached ? (
                      <span
                        className="text-[9px] font-mono px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-750 text-slate-500"
                        title="前回の計算結果を保持"
                      >
                        cache
                      </span>
                    ) : evalResult?.durationMs !== undefined ? (
                      <span
                        className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"
                        title="差分再計算で実行"
                      >
                        <Clock className="w-2.5 h-2.5" />
                        {evalResult.durationMs}ms
                      </span>
                    ) : null}
                  </div>
                </div>

                {evalResult?.error ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                ) : isDone ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                ) : null}
              </div>

              {idx < order.length - 1 && (
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
