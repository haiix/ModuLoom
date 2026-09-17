import { Fragment, type SyntheticEvent } from 'react';

import type { CustomTypeDefinition, NodeDefinition, NodeInstance } from '../../types';

interface NodeInputEditorProps {
  node: NodeInstance;
  definition: NodeDefinition;
  customTypes: CustomTypeDefinition[];
  onUpdateState: (newState: any) => void;
}

export function NodeInputEditor({
  node,
  definition,
  customTypes,
  onUpdateState,
}: NodeInputEditorProps) {
  const stopInputPropagation = (event: SyntheticEvent) => event.stopPropagation();

  return (
    <>
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
                        node.state?.portType === 'number' ? Number(e.target.value) : e.target.value;
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
    </>
  );
}
