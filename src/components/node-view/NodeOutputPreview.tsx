import { Fragment, useState, type SyntheticEvent } from 'react';
import { Check, CheckCircle2, Copy, XCircle } from 'lucide-react';

import { formatValue } from '../../engine/typeSystem';
import type {
  CustomTypeDefinition,
  NodeDefinition,
  NodeEvaluationResult,
  NodeInstance,
} from '../../types';

interface NodeOutputPreviewProps {
  node: NodeInstance;
  definition: NodeDefinition;
  evaluation?: NodeEvaluationResult;
  customTypes: CustomTypeDefinition[];
  onUpdateState: (newState: any) => void;
}

export function NodeOutputPreview({
  node,
  definition,
  evaluation,
  customTypes,
  onUpdateState,
}: NodeOutputPreviewProps) {
  const [copiedValue, setCopiedValue] = useState(false);
  const stopInputPropagation = (event: SyntheticEvent) => event.stopPropagation();
  const handleCopyValue = (value: unknown) => {
    try {
      const text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
      void navigator.clipboard.writeText(text);
      setCopiedValue(true);
      globalThis.setTimeout(() => setCopiedValue(false), 1500);
    } catch {
      // Clipboard access can be unavailable in restricted browser contexts.
    }
  };

  return (
    <>
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
                  <option value="array<any>">Array&lt;any&gt;</option>
                  <option value="array<number>">Array&lt;number&gt;</option>
                  <option value="array<string>">Array&lt;string&gt;</option>
                  <option value="object">object</option>
                  <option value="promise<any>">Promise&lt;any&gt;</option>
                  <option value="stream<any>">Stream&lt;any&gt;</option>
                  <option value="any">any</option>
                  <option value="unknown">unknown</option>
                  {customTypes.map((ct) => (
                    <Fragment key={ct.id}>
                      <option value={ct.id}>{ct.name} (Custom)</option>
                      <option value={`array<${ct.id}>`}>Array&lt;{ct.name}&gt;</option>
                    </Fragment>
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
    </>
  );
}
