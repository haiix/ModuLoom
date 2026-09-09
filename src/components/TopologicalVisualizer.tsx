import React, { useEffect, useState } from 'react';
import type { CustomTypeDefinition, GraphEvaluation, NodeDefinition, NodeInstance } from '../types';
import type { ExecutionDebuggerSnapshot } from '../engine/executionDebugger';
import { getTypeStyle } from '../types';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  PauseCircle,
  Play,
  RotateCcw,
  SkipForward,
  Square,
} from 'lucide-react';

interface TopologicalVisualizerProps {
  order: string[];
  hasCycle: boolean;
  nodes: NodeInstance[];
  definitions: Map<string, NodeDefinition>;
  evaluation: GraphEvaluation;
  debuggerSnapshot: ExecutionDebuggerSnapshot | null;
  breakpointNodeIds: Set<string>;
  customTypes?: CustomTypeDefinition[];
  onStart: () => void;
  onStepNext: () => void;
  onContinue: () => void;
  onStop: () => void;
  onCloseSession: () => void;
  onToggleBreakpoint: (nodeId: string) => void;
}

export const TopologicalVisualizer: React.FC<TopologicalVisualizerProps> = ({
  order,
  hasCycle,
  nodes,
  definitions,
  evaluation,
  debuggerSnapshot,
  breakpointNodeIds,
  customTypes = [],
  onStart,
  onStepNext,
  onContinue,
  onStop,
  onCloseSession,
  onToggleBreakpoint,
}) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    const preferred = debuggerSnapshot?.nextNodeId ?? debuggerSnapshot?.lastNodeId;
    if (preferred) setSelectedNodeId(preferred);
  }, [debuggerSnapshot?.lastNodeId, debuggerSnapshot?.nextNodeId]);

  if (hasCycle) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-600 dark:text-red-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="font-medium">
          循環参照（ループ）があるため、DAG実行デバッガーを開始できません。
        </span>
      </div>
    );
  }

  const status = debuggerSnapshot?.status;
  const isBusy = status === 'running' || status === 'waiting';
  const selectedTrace = selectedNodeId ? debuggerSnapshot?.traces[selectedNodeId] : undefined;
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) : undefined;
  const selectedDefinition = selectedNode ? definitions.get(selectedNode.typeId) : undefined;

  return (
    <div className="flex max-h-[48vh] flex-col gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              status === 'waiting'
                ? 'animate-pulse bg-orange-500'
                : status === 'paused'
                  ? 'bg-amber-500'
                  : status === 'completed'
                    ? 'bg-emerald-500'
                    : status === 'cancelled'
                      ? 'bg-slate-400'
                      : 'bg-indigo-500'
            }`}
          />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            DAG 実行デバッガー
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800">
            {statusLabel(status)} · {order.length} ノード
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button className={primaryButtonClass} onClick={onStart} disabled={isBusy}>
            <RotateCcw className="h-3.5 w-3.5" />
            {debuggerSnapshot ? '再開始' : '開始'}
          </button>
          <button
            className={secondaryButtonClass}
            onClick={onContinue}
            disabled={isBusy || status === 'completed' || status === 'cancelled'}
            title="次のブレークポイントまで実行"
          >
            <Play className="h-3.5 w-3.5" /> 続行
          </button>
          <button
            className={secondaryButtonClass}
            onClick={onStepNext}
            disabled={isBusy || status === 'completed' || status === 'cancelled'}
            title="次の1ノードだけを実行"
          >
            <SkipForward className="h-3.5 w-3.5" /> 1ノード実行
          </button>
          <button
            className={dangerButtonClass}
            onClick={onStop}
            disabled={!debuggerSnapshot || status === 'completed' || status === 'cancelled'}
            title="進行中の非同期・Stream処理をキャンセル"
          >
            <Square className="h-3.5 w-3.5" /> 停止
          </button>
          {debuggerSnapshot && (
            <button className={secondaryButtonClass} onClick={onCloseSession}>
              通常表示
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto py-1 text-xs scrollbar-thin">
        {order.map((nodeId, index) => {
          const node = nodeMap.get(nodeId);
          const definition = definitions.get(node?.typeId ?? '');
          if (!node || !definition) return null;
          const trace = debuggerSnapshot?.traces[nodeId];
          const result = trace ?? evaluation[nodeId];
          const isNext = debuggerSnapshot?.nextNodeId === nodeId;
          const isBreakpoint = breakpointNodeIds.has(nodeId);
          const outType = definition.outputs[0]?.type ?? definition.inputs[0]?.type ?? 'any';

          return (
            <React.Fragment key={nodeId}>
              <button
                type="button"
                onClick={() => setSelectedNodeId(nodeId)}
                className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-left transition-all ${
                  isNext
                    ? 'scale-105 border-indigo-300 bg-indigo-50 ring-2 ring-indigo-500 ring-offset-1 dark:border-indigo-700 dark:bg-indigo-950/80'
                    : trace
                      ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80'
                      : 'border-dashed border-slate-300 bg-slate-100 opacity-55 dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 font-mono text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                  {index + 1}
                </span>
                <span className="flex flex-col">
                  <span className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: getTypeStyle(outType, customTypes).color }}
                    />
                    {node.customLabel || definition.label}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
                    {trace?.status ?? (result ? '通常評価' : '未実行')}
                    {result?.durationMs !== undefined && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" /> {result.durationMs}ms
                      </span>
                    )}
                    {trace && <span>{trace.isCached ? 'cache hit' : 'cache miss'}</span>}
                  </span>
                </span>
                <span
                  role="checkbox"
                  aria-checked={isBreakpoint}
                  aria-label={`${node.customLabel || definition.label}のブレークポイント`}
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleBreakpoint(nodeId);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      onToggleBreakpoint(nodeId);
                    }
                  }}
                  className="rounded p-0.5"
                  title="ブレークポイントを切り替え"
                >
                  <Circle
                    className={`h-3.5 w-3.5 ${isBreakpoint ? 'fill-red-500 text-red-500' : 'text-slate-300'}`}
                  />
                </span>
                {trace?.error ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                ) : trace?.status === 'waiting' ? (
                  <PauseCircle className="h-3.5 w-3.5 shrink-0 animate-pulse text-orange-500" />
                ) : trace ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : null}
              </button>
              {index < order.length - 1 && (
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {selectedNode && selectedDefinition && (
        <div className="grid max-h-48 grid-cols-1 gap-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] dark:border-slate-700 dark:bg-slate-950/60 md:grid-cols-3">
          <Snapshot title="解決済み入力" value={selectedTrace?.inputs} />
          <Snapshot title="出力" value={selectedTrace?.outputs} />
          <div className="space-y-1 text-slate-600 dark:text-slate-300">
            <div className="font-semibold text-slate-700 dark:text-slate-200">
              {selectedNode.customLabel || selectedDefinition.label}
            </div>
            <div>状態: {selectedTrace?.status ?? '実行前（一時停止）'}</div>
            <div>時間: {selectedTrace?.durationMs ?? '—'} ms</div>
            <div>キャッシュ: {selectedTrace?.isCached ? '利用' : '未利用'}</div>
            <div>
              前回との差分: {selectedTrace ? (selectedTrace.changed ? 'あり' : 'なし') : '—'}
            </div>
            {selectedTrace?.error && (
              <div className="rounded bg-red-100 p-1.5 text-red-700 dark:bg-red-950/50 dark:text-red-300">
                <div>{selectedTrace.error}</div>
                <div className="mt-1 font-mono">伝播: {selectedTrace.errorPath.join(' → ')}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const primaryButtonClass =
  'flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-400';
const secondaryButtonClass =
  'flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';
const dangerButtonClass =
  'flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-red-950/50 dark:text-red-400';

function statusLabel(status: ExecutionDebuggerSnapshot['status'] | undefined) {
  if (!status) return '未開始';
  return {
    paused: 'ノード直前で一時停止',
    running: '実行中',
    waiting: '非同期処理を待機中',
    completed: '完了',
    cancelled: 'キャンセル済み',
  }[status];
}

function Snapshot({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 font-semibold text-slate-600 dark:text-slate-300">{title}</div>
      <pre className="overflow-auto whitespace-pre-wrap break-all rounded bg-white p-1.5 font-mono text-[10px] text-slate-700 dark:bg-slate-900 dark:text-slate-300">
        {value === undefined ? '—' : formatSnapshot(value)}
      </pre>
    </div>
  );
}

function formatSnapshot(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
