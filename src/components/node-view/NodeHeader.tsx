import { useState, type ReactNode, type SyntheticEvent } from 'react';
import {
  Activity,
  Box,
  Calculator,
  Eye,
  Layers,
  ListOrdered,
  Loader2,
  RotateCw,
  Sliders,
  Sparkles,
  Split,
  Trash2,
  Type,
  Zap,
} from 'lucide-react';

import type { NodeDefinition, NodeEvaluationResult, NodeInstance } from '../../types';

const CATEGORY_ICONS: Record<string, ReactNode> = {
  Input: <Sliders className="w-3.5 h-3.5 text-amber-500" />,
  Math: <Calculator className="w-3.5 h-3.5 text-blue-500" />,
  String: <Type className="w-3.5 h-3.5 text-emerald-500" />,
  Logic: <Split className="w-3.5 h-3.5 text-violet-500" />,
  Array: <ListOrdered className="w-3.5 h-3.5 text-cyan-500" />,
  Object: <Box className="w-3.5 h-3.5 text-indigo-500" />,
  Async: <Zap className="w-3.5 h-3.5 text-orange-500" />,
  Stream: <Activity className="w-3.5 h-3.5 text-sky-500" />,
  Output: <Eye className="w-3.5 h-3.5 text-rose-500" />,
  Custom: <Sparkles className="w-3.5 h-3.5 text-amber-500" />,
  Composite: <Layers className="w-3.5 h-3.5 text-purple-500" />,
};

interface NodeHeaderProps {
  node: NodeInstance;
  definition: NodeDefinition;
  evaluation?: NodeEvaluationResult;
  onDelete: () => void;
  onReevaluate?: () => void;
  onUnpackComposite?: () => void;
  onUpdateLabel: (newLabel: string) => void;
}

export function NodeHeader({
  node,
  definition,
  evaluation,
  onDelete,
  onReevaluate,
  onUnpackComposite,
  onUpdateLabel,
}: NodeHeaderProps) {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [isReevaluating, setIsReevaluating] = useState(false);
  const displayTitle = node.customLabel || definition.label;
  const stopInputPropagation = (event: SyntheticEvent) => event.stopPropagation();
  const handleReevaluate = () => {
    setIsReevaluating(true);
    onReevaluate?.();
    globalThis.setTimeout(() => setIsReevaluating(false), 600);
  };

  return (
    <div className="node-drag-handle flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-850/80 rounded-t-xl cursor-grab active:cursor-grabbing">
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0">
          {CATEGORY_ICONS[definition.category] || <Box className="w-3.5 h-3.5" />}
        </span>
        {isEditingLabel ? (
          <input
            type="text"
            autoFocus
            defaultValue={displayTitle}
            onBlur={(event) => {
              onUpdateLabel(event.target.value);
              setIsEditingLabel(false);
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') {
                onUpdateLabel((event.target as HTMLInputElement).value);
                setIsEditingLabel(false);
              } else if (event.key === 'Escape') {
                setIsEditingLabel(false);
              }
            }}
            onKeyUp={stopInputPropagation}
            onMouseDown={stopInputPropagation}
            onMouseUp={stopInputPropagation}
            onClick={stopInputPropagation}
            onPointerDown={stopInputPropagation}
            className="text-xs font-semibold px-1 py-0.5 rounded bg-white dark:bg-slate-800 border border-indigo-500 focus:outline-hidden text-slate-800 dark:text-slate-100 w-32"
          />
        ) : (
          <span
            onDoubleClick={() => setIsEditingLabel(true)}
            title="ダブルクリックでノード名を変更"
            className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate cursor-pointer hover:underline"
          >
            {displayTitle}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0 ml-2">
        {evaluation?.isPending && (
          <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 animate-pulse border border-orange-200 dark:border-orange-800">
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            <span>待機中</span>
          </span>
        )}
        {evaluation?.isStreaming && (
          <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800">
            <Activity className="w-3 h-3 animate-pulse shrink-0" />
            <span>{evaluation.streamCount ?? 0}件</span>
          </span>
        )}
        {definition.execution?.simulated && (
          <span
            className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
            title="外部通信を行わないローカルのシミュレーション"
          >
            simulation
          </span>
        )}
        {definition.execution?.determinism === 'nondeterministic' && (
          <span
            className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-fuchsia-50 dark:bg-fuchsia-950/60 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-200 dark:border-fuchsia-800"
            title="再評価ごとに結果が変わる場合があります"
          >
            non-deterministic
          </span>
        )}
        {definition.execution?.determinism === 'time-dependent' && (
          <span
            className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800"
            title="時間の経過を伴うノード"
          >
            time-dependent
          </span>
        )}
        {evaluation?.isCached ? (
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200/60 dark:border-slate-700/60"
            title="変更なし: 前回の計算結果をキャッシュから再利用"
          >
            cache
          </span>
        ) : (
          evaluation?.durationMs !== undefined &&
          !evaluation.isPending && (
            <span
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60"
              title="差分再計算で実行"
            >
              {evaluation.durationMs}ms
            </span>
          )
        )}
        {definition.isComposite && onUnpackComposite && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              onUnpackComposite();
            }}
            onMouseDown={stopInputPropagation}
            onMouseUp={stopInputPropagation}
            className="p-1 rounded text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition"
            title="複合ノードを展開 (Unpack Subgraph)"
            aria-label="複合ノードを展開"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={(event) => {
            event.stopPropagation();
            handleReevaluate();
          }}
          onMouseDown={stopInputPropagation}
          onMouseUp={stopInputPropagation}
          className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition"
          title="このノードと下流ノードを再計算"
          aria-label="再計算"
        >
          <RotateCw
            className={`w-3.5 h-3.5 ${
              isReevaluating || evaluation?.isPending
                ? 'animate-spin text-indigo-600 dark:text-indigo-400'
                : ''
            }`}
          />
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          onMouseDown={stopInputPropagation}
          onMouseUp={stopInputPropagation}
          className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
          title="ノードを削除"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
