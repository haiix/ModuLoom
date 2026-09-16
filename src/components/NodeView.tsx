import React from 'react';
import { NodeDefinition, NodeInstance, NodeEvaluationResult, CustomTypeDefinition } from '../types';
import { AlertCircle, Layers, Lock } from 'lucide-react';
import { NodeHeader } from './node-view/NodeHeader';
import { NodeInputEditor } from './node-view/NodeInputEditor';
import { NodeOutputPreview } from './node-view/NodeOutputPreview';
import { NodePorts } from './node-view/NodePorts';

interface NodeViewProps {
  node: NodeInstance;
  definition: NodeDefinition;
  evaluation?: NodeEvaluationResult;
  isSelected: boolean;
  isSteppingActive: boolean;
  customTypes?: CustomTypeDefinition[];
  onDelete: () => void;
  onReevaluate?: () => void;
  onUnpackComposite?: () => void;
  onUpdateState: (newState: any) => void;
  onUpdateLabel: (newLabel: string) => void;
  onPortMouseDown: (e: React.MouseEvent, portId: string, isOutput: boolean) => void;
  onPortMouseUp: (e: React.MouseEvent, portId: string, isOutput: boolean) => void;
  onPortActivate?: (portId: string, isOutput: boolean) => void;
  connectedPorts: {
    inputs: Set<string>;
    outputs: Set<string>;
  };
  dragWireTargetHover?: {
    nodeId: string;
    portId: string;
    isCompatible: boolean;
  } | null;
}

export const NodeView: React.FC<NodeViewProps> = ({
  node,
  definition,
  evaluation,
  isSelected,
  isSteppingActive,
  customTypes = [],
  onDelete,
  onReevaluate,
  onUnpackComposite,
  onUpdateState,
  onUpdateLabel,
  onPortMouseDown,
  onPortMouseUp,
  onPortActivate,
  connectedPorts,
  dragWireTargetHover,
}) => {
  // Stop event propagation on input controls so dragging, typing, or wheeling inside them does not affect the container
  const stopInputPropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className={`relative min-w-[220px] max-w-[320px] rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border shadow-md transition-shadow select-none ${
        isSelected
          ? 'ring-2 ring-indigo-500 shadow-xl border-indigo-400 dark:border-indigo-600'
          : isSteppingActive
            ? 'ring-2 ring-emerald-500 shadow-xl border-emerald-400 dark:border-emerald-600'
            : evaluation?.isPending
              ? 'ring-2 ring-orange-500 shadow-xl border-orange-400 dark:border-orange-600'
              : evaluation?.isStreaming
                ? 'ring-2 ring-sky-500 shadow-xl border-sky-400 dark:border-sky-600'
                : evaluation?.error
                  ? 'border-red-400 dark:border-red-600 ring-1 ring-red-400'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <NodeHeader
        node={node}
        definition={definition}
        evaluation={evaluation}
        onDelete={onDelete}
        onReevaluate={onReevaluate}
        onUnpackComposite={onUnpackComposite}
        onUpdateLabel={onUpdateLabel}
      />

      {/* Node Body & Embedded Controls */}
      <div className="p-3 space-y-3 text-xs">
        <NodeInputEditor
          node={node}
          definition={definition}
          customTypes={customTypes}
          onUpdateState={onUpdateState}
        />

        <NodeOutputPreview
          node={node}
          definition={definition}
          evaluation={evaluation}
          customTypes={customTypes}
          onUpdateState={onUpdateState}
        />

        {/* GENERALIZED ARRAY & STREAM NODES CONTROLS */}
        {node.typeId === 'array/map' && (
          <div className="flex items-center justify-between text-[11px] p-1.5 rounded bg-cyan-50/70 dark:bg-cyan-950/40 border border-cyan-200/60 dark:border-cyan-800/60">
            <span className="text-cyan-800 dark:text-cyan-300 font-medium">演算子:</span>
            <select
              value={node.state?.operator ?? '*'}
              onChange={(e) => onUpdateState({ ...node.state, operator: e.target.value })}
              onMouseDown={stopInputPropagation}
              className="px-2 py-0.5 text-xs font-mono font-bold rounded border border-cyan-300 dark:border-cyan-700 bg-white dark:bg-slate-800 text-cyan-900 dark:text-cyan-100"
            >
              <option value="*">* (乗算)</option>
              <option value="+">+ (加算)</option>
              <option value="-">- (減算)</option>
              <option value="/">/ (除算)</option>
            </select>
          </div>
        )}

        {node.typeId === 'array/filter' && (
          <div className="flex items-center justify-between text-[11px] p-1.5 rounded bg-cyan-50/70 dark:bg-cyan-950/40 border border-cyan-200/60 dark:border-cyan-800/60">
            <span className="text-cyan-800 dark:text-cyan-300 font-medium">比較条件:</span>
            <select
              value={node.state?.operator ?? '>'}
              onChange={(e) => onUpdateState({ ...node.state, operator: e.target.value })}
              onMouseDown={stopInputPropagation}
              className="px-2 py-0.5 text-xs font-mono font-bold rounded border border-cyan-300 dark:border-cyan-700 bg-white dark:bg-slate-800 text-cyan-900 dark:text-cyan-100"
            >
              <option value=">">&gt; (超過)</option>
              <option value=">=">&ge; (以上)</option>
              <option value="<">&lt; (未満)</option>
              <option value="<=">&le; (以下)</option>
              <option value="==">== (等しい)</option>
              <option value="!=">!= (一致しない)</option>
            </select>
          </div>
        )}

        {node.typeId === 'stream/filter' && (
          <div className="flex items-center justify-between text-[11px] p-1.5 rounded bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60">
            <span className="text-emerald-800 dark:text-emerald-300 font-medium">フィルタ:</span>
            <select
              value={node.state?.mode ?? 'even'}
              onChange={(e) => onUpdateState({ ...node.state, mode: e.target.value })}
              onMouseDown={stopInputPropagation}
              className="px-2 py-0.5 text-xs font-semibold rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 text-emerald-900 dark:text-emerald-100"
            >
              <option value="even">偶数 (Even)</option>
              <option value="odd">奇数 (Odd)</option>
              <option value="positive">正数 (&gt; 0)</option>
              <option value="greater">&gt; 閾値 (Threshold)</option>
            </select>
          </div>
        )}

        {/* COMPOSITE NODES INTERNAL SUMMARY & PARTIALLY APPLIED VALUES */}
        {definition.isComposite && (
          <div className="space-y-1.5 p-2 rounded-lg bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/60 text-xs">
            <div className="flex items-center justify-between text-[11px] text-purple-700 dark:text-purple-300 font-medium">
              <span className="flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-purple-500" />
                <span>複合関数 (Composite)</span>
              </span>
              {definition.compositeSubgraph && (
                <span className="text-[10px] text-purple-500 dark:text-purple-400">
                  {definition.compositeSubgraph.nodes.length}ノード
                </span>
              )}
            </div>

            {/* Render partially applied constant values if present */}
            {(() => {
              if (!definition.compositeSubgraph) return null;
              const fixedNodes = definition.compositeSubgraph.nodes.filter(
                (n) =>
                  n.typeId !== 'composite/input-port' &&
                  n.typeId !== 'composite/output-port' &&
                  (n.typeId.startsWith('input/') ||
                    n.state?.value !== undefined ||
                    n.state?.text !== undefined),
              );

              if (fixedNodes.length === 0) return null;

              return (
                <div className="space-y-1 pt-1 border-t border-purple-200/40 dark:border-purple-800/40">
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1">
                    <Lock className="w-3 h-3" /> 部分適用（固定された入力値）:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {fixedNodes.map((fn) => {
                      const val = fn.state?.value ?? fn.state?.text ?? '';
                      return (
                        <span
                          key={fn.id}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 text-[10px] font-mono text-purple-800 dark:text-purple-200"
                        >
                          <span className="text-slate-500 font-sans">
                            {fn.customLabel || fn.typeId.replace('input/', '')}:
                          </span>
                          <span className="font-bold">{String(val)}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {onUnpackComposite && (
              <div className="pt-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnpackComposite();
                  }}
                  onMouseDown={stopInputPropagation}
                  onMouseUp={stopInputPropagation}
                  className="w-full py-1 rounded-md bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-[10px] font-semibold transition flex items-center justify-center gap-1"
                >
                  <Layers className="w-3 h-3" />
                  <span>内部ノード群を展開 (Unpack)</span>
                </button>
              </div>
            )}
          </div>
        )}

        <NodePorts
          node={node}
          definition={definition}
          evaluation={evaluation}
          customTypes={customTypes}
          connectedPorts={connectedPorts}
          dragWireTargetHover={dragWireTargetHover}
          onPortMouseDown={onPortMouseDown}
          onPortMouseUp={onPortMouseUp}
          onPortActivate={onPortActivate}
        />

        {/* Error Alert Banner */}
        {evaluation?.error && (
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-[11px] flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{evaluation.error}</span>
          </div>
        )}
      </div>
    </div>
  );
};
