import React, { useState } from 'react';
import {
  NodeDefinition,
  NodeInstance,
  NodeEvaluationResult,
  CustomTypeDefinition,
  getTypeStyle,
} from '../types';
import { formatValue } from '../engine/typeSystem';
import {
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Sliders,
  Calculator,
  Type,
  Split,
  ListOrdered,
  Box,
  Eye,
  Sparkles,
  CheckCircle2,
  XCircle,
  Zap,
  Activity,
  Loader2,
  RotateCw,
  Layers,
  Lock,
} from 'lucide-react';

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

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
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
  connectedPorts,
  dragWireTargetHover,
}) => {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [copiedValue, setCopiedValue] = useState(false);
  const [isReevaluating, setIsReevaluating] = useState(false);

  const displayTitle = node.customLabel || definition.label;

  const handleReevaluateClick = () => {
    setIsReevaluating(true);
    onReevaluate?.();
    setTimeout(() => {
      setIsReevaluating(false);
    }, 600);
  };

  // Stop event propagation on input controls so dragging, typing, or wheeling inside them does not affect the container
  const stopInputPropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const handleCopyValue = (val: any) => {
    try {
      const text = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
      navigator.clipboard.writeText(text);
      setCopiedValue(true);
      setTimeout(() => setCopiedValue(false), 1500);
    } catch {
      // Fallback
    }
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
      {/* Node Header */}
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
              onBlur={(e) => {
                onUpdateLabel(e.target.value);
                setIsEditingLabel(false);
              }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  onUpdateLabel((e.target as HTMLInputElement).value);
                  setIsEditingLabel(false);
                } else if (e.key === 'Escape') {
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
              onClick={(e) => {
                e.stopPropagation();
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
            onClick={(e) => {
              e.stopPropagation();
              handleReevaluateClick();
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
            onClick={(e) => {
              e.stopPropagation();
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

      {/* Node Body & Embedded Controls */}
      <div className="p-3 space-y-3 text-xs">
        {/* INPUT NODES WIDGETS */}
        {definition.kind === 'input' && (
          <div className="space-y-2">
            {node.typeId === 'input/number' && (
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-medium">数値:</span>
                <input
                  type="number"
                  value={node.state?.value ?? 0}
                  onChange={(e) => onUpdateState({ ...node.state, value: Number(e.target.value) })}
                  onMouseDown={stopInputPropagation}
                  onMouseUp={stopInputPropagation}
                  onClick={stopInputPropagation}
                  onKeyDown={stopInputPropagation}
                  onKeyUp={stopInputPropagation}
                  onWheel={stopInputPropagation}
                  onPointerDown={stopInputPropagation}
                  className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-amber-500 font-mono"
                />
              </div>
            )}

            {node.typeId === 'input/slider' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">調整値</span>
                  <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                    {node.state?.value ?? 50}
                  </span>
                </div>
                <input
                  type="range"
                  min={node.state?.min ?? 0}
                  max={node.state?.max ?? 100}
                  step={node.state?.step ?? 1}
                  value={node.state?.value ?? 50}
                  onChange={(e) => onUpdateState({ ...node.state, value: Number(e.target.value) })}
                  onMouseDown={stopInputPropagation}
                  onMouseUp={stopInputPropagation}
                  onClick={stopInputPropagation}
                  onKeyDown={stopInputPropagation}
                  onKeyUp={stopInputPropagation}
                  onPointerDown={stopInputPropagation}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>{node.state?.min ?? 0}</span>
                  <span>{node.state?.max ?? 100}</span>
                </div>
              </div>
            )}

            {node.typeId === 'input/text' && (
              <div className="space-y-1">
                <span className="text-slate-500 text-[11px]">テキスト文字列:</span>
                <input
                  type="text"
                  value={node.state?.value ?? ''}
                  onChange={(e) => onUpdateState({ ...node.state, value: e.target.value })}
                  onMouseDown={stopInputPropagation}
                  onMouseUp={stopInputPropagation}
                  onClick={stopInputPropagation}
                  onKeyDown={stopInputPropagation}
                  onKeyUp={stopInputPropagation}
                  onPointerDown={stopInputPropagation}
                  placeholder="文字列を入力..."
                  className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            )}

            {node.typeId === 'input/boolean' && (
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500">状態:</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateState({ ...node.state, value: !node.state?.value });
                  }}
                  onMouseDown={stopInputPropagation}
                  onMouseUp={stopInputPropagation}
                  onPointerDown={stopInputPropagation}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                    node.state?.value
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {node.state?.value ? 'TRUE (真)' : 'FALSE (偽)'}
                </button>
              </div>
            )}

            {node.typeId === 'input/array' && (
              <div className="space-y-1">
                <span className="text-slate-500 text-[11px]">CSV形式で入力 (カンマ区切り):</span>
                <input
                  type="text"
                  value={node.state?.rawText ?? ''}
                  onChange={(e) => onUpdateState({ ...node.state, rawText: e.target.value })}
                  onMouseDown={stopInputPropagation}
                  onMouseUp={stopInputPropagation}
                  onClick={stopInputPropagation}
                  onKeyDown={stopInputPropagation}
                  onKeyUp={stopInputPropagation}
                  onPointerDown={stopInputPropagation}
                  placeholder="10, 20, 30..."
                  className="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-cyan-600 dark:text-cyan-400"
                />
              </div>
            )}

            {node.typeId === 'input/json' && (
              <div className="space-y-1">
                <span className="text-slate-500 text-[11px]">JSON オブジェクト:</span>
                <textarea
                  rows={3}
                  value={node.state?.rawJson ?? '{}'}
                  onChange={(e) => onUpdateState({ ...node.state, rawJson: e.target.value })}
                  onMouseDown={stopInputPropagation}
                  onMouseUp={stopInputPropagation}
                  onClick={stopInputPropagation}
                  onKeyDown={stopInputPropagation}
                  onKeyUp={stopInputPropagation}
                  onWheel={stopInputPropagation}
                  onPointerDown={stopInputPropagation}
                  className="w-full p-1.5 text-[11px] font-mono rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400"
                />
              </div>
            )}

            {node.typeId === 'composite/input-port' && (
              <div className="space-y-2 p-2 rounded-lg bg-purple-50/50 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/60">
                <div className="flex items-center justify-between gap-1 text-[11px]">
                  <span className="text-slate-500 font-medium shrink-0">引数名:</span>
                  <input
                    type="text"
                    value={node.state?.portName ?? 'x'}
                    onChange={(e) =>
                      onUpdateState({ ...node.state, portName: e.target.value.replace(/\s+/g, '') })
                    }
                    onMouseDown={stopInputPropagation}
                    onMouseUp={stopInputPropagation}
                    onClick={stopInputPropagation}
                    onKeyDown={stopInputPropagation}
                    onKeyUp={stopInputPropagation}
                    onPointerDown={stopInputPropagation}
                    placeholder="引数名"
                    className="w-24 px-1.5 py-0.5 text-right text-xs font-mono font-bold rounded border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300"
                  />
                </div>
                <div className="flex items-center justify-between gap-1 text-[11px]">
                  <span className="text-slate-500 font-medium shrink-0">型:</span>
                  <select
                    value={node.state?.portType ?? 'number'}
                    onChange={(e) => onUpdateState({ ...node.state, portType: e.target.value })}
                    onMouseDown={stopInputPropagation}
                    onClick={stopInputPropagation}
                    className="px-1.5 py-0.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  >
                    <option value="number">number</option>
                    <option value="string">string</option>
                    <option value="boolean">boolean</option>
                    <option value="array">array</option>
                    <option value="object">object</option>
                    <option value="any">any</option>
                    {customTypes.map((ct) => (
                      <option key={ct.id} value={ct.id}>
                        {ct.name} (Custom)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 pt-1 border-t border-purple-200/40 dark:border-purple-800/40">
                  <span className="text-[10px] text-slate-400">テスト入力値:</span>
                  {node.state?.portType === 'boolean' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateState({ ...node.state, testValue: !node.state?.testValue });
                      }}
                      className={`w-full py-1 rounded text-xs font-bold transition ${
                        node.state?.testValue
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {node.state?.testValue ? 'true' : 'false'}
                    </button>
                  ) : (
                    <input
                      type={node.state?.portType === 'number' ? 'number' : 'text'}
                      value={node.state?.testValue ?? ''}
                      onChange={(e) => {
                        const val =
                          node.state?.portType === 'number'
                            ? Number(e.target.value)
                            : e.target.value;
                        onUpdateState({ ...node.state, testValue: val });
                      }}
                      onMouseDown={stopInputPropagation}
                      onMouseUp={stopInputPropagation}
                      onClick={stopInputPropagation}
                      onKeyDown={stopInputPropagation}
                      onKeyUp={stopInputPropagation}
                      onPointerDown={stopInputPropagation}
                      className="w-full px-2 py-0.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* OUTPUT NODES WIDGETS */}
        {definition.kind === 'output' && (
          <div className="space-y-2">
            {node.typeId === 'composite/output-port' && (
              <div className="space-y-2 p-2 rounded-lg bg-purple-50/50 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/60">
                <div className="flex items-center justify-between gap-1 text-[11px]">
                  <span className="text-slate-500 font-medium shrink-0">戻り値名:</span>
                  <input
                    type="text"
                    value={node.state?.portName ?? 'result'}
                    onChange={(e) =>
                      onUpdateState({ ...node.state, portName: e.target.value.replace(/\s+/g, '') })
                    }
                    onMouseDown={stopInputPropagation}
                    onMouseUp={stopInputPropagation}
                    onClick={stopInputPropagation}
                    onKeyDown={stopInputPropagation}
                    onKeyUp={stopInputPropagation}
                    onPointerDown={stopInputPropagation}
                    placeholder="戻り値名"
                    className="w-24 px-1.5 py-0.5 text-right text-xs font-mono font-bold rounded border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300"
                  />
                </div>
                <div className="flex items-center justify-between gap-1 text-[11px]">
                  <span className="text-slate-500 font-medium shrink-0">型:</span>
                  <select
                    value={node.state?.portType ?? 'number'}
                    onChange={(e) => onUpdateState({ ...node.state, portType: e.target.value })}
                    onMouseDown={stopInputPropagation}
                    onClick={stopInputPropagation}
                    className="px-1.5 py-0.5 text-xs font-mono rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  >
                    <option value="number">number</option>
                    <option value="string">string</option>
                    <option value="boolean">boolean</option>
                    <option value="array">array</option>
                    <option value="object">object</option>
                    <option value="any">any</option>
                    {customTypes.map((ct) => (
                      <option key={ct.id} value={ct.id}>
                        {ct.name} (Custom)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="p-1.5 rounded bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400">現在の中継値:</div>
                  <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                    {formatValue(evaluation?.inputs?.in ?? evaluation?.outputs?.out, 30)}
                  </div>
                </div>
              </div>
            )}
            {node.typeId === 'output/inspector' && (
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>評価値プレビュー</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyValue(evaluation?.outputs?.displayedValue);
                    }}
                    onMouseDown={stopInputPropagation}
                    className="flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-200"
                    title="値をコピー"
                  >
                    {copiedValue ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
                <div
                  onWheel={stopInputPropagation}
                  className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 break-words max-h-24 overflow-y-auto"
                >
                  {formatValue(evaluation?.outputs?.displayedValue, 120)}
                </div>
              </div>
            )}

            {node.typeId === 'output/gauge' && (
              <div className="space-y-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-500">メーター</span>
                  <span className="font-bold text-amber-500">
                    {Number(evaluation?.outputs?.displayedValue ?? 0).toFixed(1)}
                  </span>
                </div>
                {(() => {
                  const val = Number(evaluation?.outputs?.displayedValue ?? 0);
                  const min = node.state?.min ?? 0;
                  const max = node.state?.max ?? 100;
                  const pct = Math.max(0, Math.min(100, ((val - min) / (max - min || 1)) * 100));
                  return (
                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="bg-amber-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  );
                })()}
              </div>
            )}

            {node.typeId === 'output/status' && (
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
                {evaluation?.outputs?.displayedValue ? (
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{node.state?.trueLabel || '合格 (Passed)'}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-rose-500 dark:text-rose-400 font-semibold text-xs">
                    <XCircle className="w-4 h-4" />
                    <span>{node.state?.falseLabel || '不合格 (Failed)'}</span>
                  </div>
                )}
              </div>
            )}

            {node.typeId === 'output/log' && (
              <div
                onWheel={stopInputPropagation}
                className="p-2 rounded-lg bg-slate-950 text-emerald-400 font-mono text-[11px] max-h-20 overflow-y-auto"
              >
                <div>&gt; {formatValue(evaluation?.outputs?.displayedValue, 60)}</div>
              </div>
            )}
          </div>
        )}

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

        {/* PORTS ROW (Inputs on Left, Outputs on Right) */}
        {(() => {
          const effectiveInputs = definition.inputs.map((port) => {
            if (node.typeId === 'composite/output-port') {
              return {
                ...port,
                name: node.state?.portName || port.name,
                type: node.state?.portType || port.type,
              };
            }
            return port;
          });

          const effectiveOutputs = definition.outputs.map((port) => {
            if (node.typeId === 'composite/input-port') {
              return {
                ...port,
                name: node.state?.portName || port.name,
                type: node.state?.portType || port.type,
              };
            }
            return port;
          });

          return (
            <div className="flex justify-between gap-4 pt-1">
              {/* Inputs */}
              <div className="flex-1 space-y-2">
                {effectiveInputs.map((port, idx) => {
                  const isConnected = connectedPorts.inputs.has(port.id);
                  const isHoveredCompatible =
                    dragWireTargetHover?.nodeId === node.id &&
                    dragWireTargetHover?.portId === port.id &&
                    dragWireTargetHover.isCompatible;

                  const isHoveredIncompatible =
                    dragWireTargetHover?.nodeId === node.id &&
                    dragWireTargetHover?.portId === port.id &&
                    !dragWireTargetHover.isCompatible;

                  const style = getTypeStyle(port.type, customTypes);
                  const portColor = style.color;
                  const inputVal = evaluation?.inputs?.[port.id];

                  return (
                    <div
                      key={`port-in-${node.id}-${port.id}-${idx}`}
                      id={`port-${node.id}-${port.id}-in`}
                      className="flex items-center gap-1.5 relative group/port"
                    >
                      {/* Socket circle */}
                      <div
                        data-port-node-id={node.id}
                        data-port-id={port.id}
                        data-port-direction="in"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          onPortMouseDown(e, port.id, false);
                        }}
                        onMouseUp={(e) => {
                          e.stopPropagation();
                          onPortMouseUp(e, port.id, false);
                        }}
                        className={`w-3.5 h-3.5 rounded-full border-2 cursor-pointer transition-transform hover:scale-125 -ml-4.5 bg-white dark:bg-slate-900 shrink-0 ${
                          isHoveredCompatible
                            ? 'ring-4 ring-emerald-400 scale-125'
                            : isHoveredIncompatible
                              ? 'ring-4 ring-red-400 scale-125'
                              : ''
                        }`}
                        style={{
                          borderColor: portColor,
                          backgroundColor: isConnected ? portColor : undefined,
                        }}
                        title={`ドラッグして接続・付け替え: ${port.name} (${port.type})`}
                      />

                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                            {port.name}
                          </span>
                          <span
                            className="text-[9px] px-1 py-0.2 rounded font-mono font-medium"
                            style={{
                              backgroundColor: style.bgColor,
                              color: style.color,
                            }}
                          >
                            {port.type}
                          </span>
                        </div>

                        {/* Live value preview badge if evaluated */}
                        {inputVal !== undefined && (
                          <span className="text-[10px] text-slate-400 font-mono truncate">
                            = {formatValue(inputVal, 16)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Outputs */}
              <div className="flex-1 space-y-2 text-right">
                {effectiveOutputs.map((port, idx) => {
                  const isConnected = connectedPorts.outputs.has(port.id);
                  const style = getTypeStyle(port.type, customTypes);
                  const portColor = style.color;
                  const outputVal = evaluation?.outputs?.[port.id];

                  return (
                    <div
                      key={`port-out-${node.id}-${port.id}-${idx}`}
                      id={`port-${node.id}-${port.id}-out`}
                      className="flex items-center justify-end gap-1.5 relative group/port"
                    >
                      <div className="flex flex-col items-end min-w-0">
                        <div className="flex items-center gap-1 justify-end">
                          <span
                            className="text-[9px] px-1 py-0.2 rounded font-mono font-medium"
                            style={{
                              backgroundColor: style.bgColor,
                              color: style.color,
                            }}
                          >
                            {port.type}
                          </span>
                          <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                            {port.name}
                          </span>
                        </div>

                        {/* Live evaluated value badge */}
                        {outputVal !== undefined && (
                          <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-mono truncate">
                            {formatValue(outputVal, 16)}
                          </span>
                        )}
                      </div>

                      {/* Socket circle */}
                      <div
                        data-port-node-id={node.id}
                        data-port-id={port.id}
                        data-port-direction="out"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          onPortMouseDown(e, port.id, true);
                        }}
                        onMouseUp={(e) => {
                          e.stopPropagation();
                          onPortMouseUp(e, port.id, true);
                        }}
                        className="w-3.5 h-3.5 rounded-full border-2 cursor-pointer transition-transform hover:scale-125 -mr-4.5 bg-white dark:bg-slate-900 shrink-0"
                        style={{
                          borderColor: portColor,
                          backgroundColor: isConnected ? portColor : undefined,
                        }}
                        title={`ドラッグして接続: ${port.name} (${port.type})`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

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
