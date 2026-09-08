import React, { useState, useEffect, useMemo } from 'react';
import {
  NodeDefinition,
  NodeInstance,
  Connection,
  Port,
  CompositeSubgraph,
  CustomTypeDefinition,
  getTypeStyle,
} from '../types';
import { Layers, X, AlertCircle, Sparkles, Box, Info, Lock, CheckCircle2 } from 'lucide-react';
import { evaluateCompositeNode } from '../engine/dagEngine';

interface CreateCompositeModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: NodeInstance[];
  connections: Connection[];
  definitions: Map<string, NodeDefinition>;
  customTypes?: CustomTypeDefinition[];
  onSaveComposite: (
    compositeDef: NodeDefinition,
    replaceCanvas: boolean,
    targetNodeIds: string[],
  ) => void;
  onInsertSampleTerminalNodes?: (sampleType?: 'multiply-partial' | 'vector-hypot') => void;
}

export const CreateCompositeModal: React.FC<CreateCompositeModalProps> = ({
  isOpen,
  onClose,
  nodes,
  connections,
  definitions,
  customTypes = [],
  onSaveComposite,
  onInsertSampleTerminalNodes,
}) => {
  const [label, setLabel] = useState('TimesTenFunction');
  const [description, setDescription] = useState('入力値を10倍する部分適用カスタム関数');
  const [replaceCanvas, setReplaceCanvas] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Group Output Terminal Nodes
  const outputTerminalNodes = useMemo(() => {
    return nodes.filter((n) => n.typeId === 'composite/output-port');
  }, [nodes]);

  // Trace back upstream from Group Output Terminals (Reverse BFS)
  const {
    subgraphNodes,
    subgraphConnections,
    connectedInputTerminals,
    partiallyAppliedNodes,
    inputPorts,
    outputPorts,
  } = useMemo(() => {
    if (outputTerminalNodes.length === 0) {
      return {
        subgraphNodes: [] as NodeInstance[],
        subgraphConnections: [] as Connection[],
        connectedInputTerminals: [] as NodeInstance[],
        partiallyAppliedNodes: [] as NodeInstance[],
        intermediateNodes: [] as NodeInstance[],
        inputPorts: [] as Port[],
        outputPorts: [] as Port[],
      };
    }

    // Build reverse adjacency list (toNodeId -> fromNodeId)
    const revAdj = new Map<string, Set<string>>();
    for (const c of connections) {
      if (!revAdj.has(c.toNodeId)) revAdj.set(c.toNodeId, new Set<string>());
      revAdj.get(c.toNodeId)!.add(c.fromNodeId);
    }

    // Traverse upstream from all output terminals
    const canReachOutputs = new Set<string>();
    const queueUp: string[] = outputTerminalNodes.map((n) => n.id);
    for (const id of queueUp) {
      canReachOutputs.add(id);
    }

    while (queueUp.length > 0) {
      const curr = queueUp.shift()!;
      const prevs = revAdj.get(curr);
      if (prevs) {
        for (const p of prevs) {
          if (!canReachOutputs.has(p)) {
            canReachOutputs.add(p);
            queueUp.push(p);
          }
        }
      }
    }

    // Nodes included in the composite subgraph
    const subNodes = nodes.filter((n) => canReachOutputs.has(n.id));
    const subConnections = connections.filter(
      (c) => canReachOutputs.has(c.fromNodeId) && canReachOutputs.has(c.toNodeId),
    );

    // Group input terminals connected to the output path
    const inTerminals = subNodes.filter((n) => n.typeId === 'composite/input-port');

    // Categorize partially applied nodes:
    // Nodes that supply constant/form values (Number Input, Slider, Text, etc.)
    const fixedInputs = subNodes.filter((n) => {
      if (n.typeId === 'composite/input-port' || n.typeId === 'composite/output-port') {
        return false;
      }
      const def = definitions.get(n.typeId);
      return (
        def?.kind === 'input' ||
        n.typeId.startsWith('input/') ||
        n.state?.value !== undefined ||
        n.state?.text !== undefined ||
        n.state?.min !== undefined ||
        n.state?.rawJson !== undefined
      );
    });

    // Intermediate computation nodes
    const intermediates = subNodes.filter(
      (n) =>
        n.typeId !== 'composite/input-port' &&
        n.typeId !== 'composite/output-port' &&
        !fixedInputs.some((f) => f.id === n.id),
    );

    // Input ports generated from connected terminal inputs (with duplicate-name deduplication)
    const inNameCounts = new Map<string, number>();
    const inPorts: Port[] = inTerminals.map((n, idx) => {
      let pName = (n.state?.portName || 'input').trim();
      if (!pName) pName = `input_${idx + 1}`;

      const count = inNameCounts.get(pName) || 0;
      inNameCounts.set(pName, count + 1);
      const uniqueName = count === 0 ? pName : `${pName}_${count + 1}`;

      const pType = n.state?.portType || 'number';
      return {
        id: uniqueName,
        name: uniqueName,
        type: pType,
        defaultValue: n.state?.testValue,
      };
    });

    // Output ports generated from terminal outputs (with duplicate-name deduplication)
    const outNameCounts = new Map<string, number>();
    const outPorts: Port[] = outputTerminalNodes.map((n, idx) => {
      let pName = (n.state?.portName || 'result').trim();
      if (!pName) pName = `result_${idx + 1}`;

      const count = outNameCounts.get(pName) || 0;
      outNameCounts.set(pName, count + 1);
      const uniqueName = count === 0 ? pName : `${pName}_${count + 1}`;

      const pType = n.state?.portType || 'number';
      return {
        id: uniqueName,
        name: uniqueName,
        type: pType,
      };
    });

    return {
      subgraphNodes: subNodes,
      subgraphConnections: subConnections,
      connectedInputTerminals: inTerminals,
      partiallyAppliedNodes: fixedInputs,
      intermediateNodes: intermediates,
      inputPorts: inPorts,
      outputPorts: outPorts,
    };
  }, [nodes, connections, outputTerminalNodes, definitions]);

  // Validation: Must have at least 1 output terminal, and must reach at least 1 node
  const isValid = useMemo(() => {
    if (outputTerminalNodes.length === 0) return false;
    if (subgraphNodes.length < 2) return false; // At least output terminal + 1 source or calculation node
    if (!label.trim()) return false;
    return true;
  }, [outputTerminalNodes.length, subgraphNodes.length, label]);

  // Reset or initialize default label when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (partiallyAppliedNodes.length > 0 && connectedInputTerminals.length > 0) {
        const firstFixed = partiallyAppliedNodes[0];
        const val = firstFixed.state?.value;
        if (typeof val === 'number') {
          setLabel(`MultiplyBy${val}`);
          setDescription(`入力値を固定された定数値 (${val}) で計算する部分適用グループ関数`);
        } else {
          setLabel(`CustomComposite_${Date.now().toString().slice(-4)}`);
        }
      } else if (connectedInputTerminals.length > 0) {
        setLabel(`CustomComposite_${Date.now().toString().slice(-4)}`);
      }
    }
  }, [isOpen, partiallyAppliedNodes, connectedInputTerminals]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!isValid) {
      setError('グループ出力端子に接続された計算経路が必要です。');
      return;
    }

    const uniqueTypeId = `composite/custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const subgraph: CompositeSubgraph = {
      nodes: JSON.parse(JSON.stringify(subgraphNodes)),
      connections: JSON.parse(JSON.stringify(subgraphConnections)),
      inputNodeIds: connectedInputTerminals.map((n) => n.id),
      outputNodeIds: outputTerminalNodes.map((n) => n.id),
    };

    const newDef: NodeDefinition = {
      typeId: uniqueTypeId,
      label: label.trim(),
      category: 'Composite',
      kind: 'pure',
      inputs: inputPorts,
      outputs: outputPorts,
      description:
        description.trim() ||
        (partiallyAppliedNodes.length > 0
          ? `部分適用された定数値を含む複合関数`
          : '複合ノード（カスタム関数）'),
      isComposite: true,
      compositeSubgraph: subgraph,
      evaluate: (inputs) => {
        return evaluateCompositeNode(subgraph, inputs, definitions);
      },
    };

    const targetNodeIds = subgraphNodes.map((n) => n.id);
    onSaveComposite(newDef, replaceCanvas, targetNodeIds);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>複合ノードの作成 & 部分適用</span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 font-normal">
                  Partial Application
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                グループ出力端子から入力を遡って探索し、入力フォーム値（定数）を固定したカスタム関数を作成します
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 flex items-center gap-2.5 text-xs text-red-600 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Missing Output Terminal state */}
          {outputTerminalNodes.length === 0 ? (
            <div className="p-5 rounded-xl border border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 text-center space-y-3">
              <div className="inline-flex p-3 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400">
                <Info className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  グループ出力端子ノードがありません
                </h3>
                <p className="text-xs text-amber-700 dark:text-amber-400 max-w-md mx-auto">
                  複合ノード化を行うには、計算の終点となる
                  <strong>「グループ出力端子」ノード</strong>がキャンバス上に必要です。
                </p>
              </div>

              {onInsertSampleTerminalNodes && (
                <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={() => {
                      onInsertSampleTerminalNodes('multiply-partial');
                      onClose();
                    }}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-sm transition"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>部分適用サンプル (10倍関数) を配置</span>
                  </button>
                  <button
                    onClick={() => {
                      onInsertSampleTerminalNodes('vector-hypot');
                      onClose();
                    }}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium transition"
                  >
                    <span>2Dベクトル長サンプルを配置</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Upstream Trace Status Banner */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Box className="w-4 h-4 text-purple-500" />
                    出力端子から遡って検出 ({subgraphNodes.length} ノード /{' '}
                    {subgraphConnections.length} 接続)
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    グループ化可能
                  </span>
                </div>

                {/* 3-Column Pipeline Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {/* 1. Group Inputs (Open Arguments) */}
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                      <span>公開引数 ({inputPorts.length})</span>
                      <span className="text-[10px] text-purple-600 dark:text-purple-400 font-normal">
                        引数ポート
                      </span>
                    </div>
                    {inputPorts.length === 0 ? (
                      <div className="text-[11px] text-slate-400 italic py-1">
                        外部引数なし (定数関数)
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {inputPorts.map((port, idx) => {
                          const style = getTypeStyle(port.type, customTypes);
                          return (
                            <div
                              key={`in-port-${port.id}-${idx}`}
                              className="flex items-center justify-between px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                            >
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {port.name}
                              </span>
                              <span
                                className="text-[10px] px-1.5 py-0.2 rounded font-medium"
                                style={{ backgroundColor: style.bgColor, color: style.color }}
                              >
                                {port.type}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 2. Partially Applied Inputs (Fixed Form Values) */}
                  <div className="p-3 rounded-lg bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 space-y-2">
                    <div className="text-[11px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Lock className="w-3 h-3 text-purple-600" />
                        部分適用定数 ({partiallyAppliedNodes.length})
                      </span>
                      <span className="text-[10px] text-purple-500 font-normal">固定値</span>
                    </div>
                    {partiallyAppliedNodes.length === 0 ? (
                      <div className="text-[11px] text-slate-400 italic py-1">
                        固定入力フォームなし
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {partiallyAppliedNodes.map((n) => {
                          const def = definitions.get(n.typeId);
                          const val = n.state?.value ?? n.state?.text ?? n.state?.rawJson ?? '';
                          return (
                            <div
                              key={n.id}
                              className="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-purple-100 dark:border-purple-900/40 text-xs flex items-center justify-between"
                            >
                              <span
                                className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[90px]"
                                title={n.customLabel || def?.label}
                              >
                                {n.customLabel || def?.label || n.typeId}
                              </span>
                              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 font-bold">
                                {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 3. Group Outputs */}
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                      <span>戻り値 ({outputPorts.length})</span>
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">
                        出力ポート
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {outputPorts.map((port, idx) => {
                        const style = getTypeStyle(port.type, customTypes);
                        return (
                          <div
                            key={`out-port-${port.id}-${idx}`}
                            className="flex items-center justify-between px-2 py-1 rounded bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                          >
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {port.name}
                            </span>
                            <span
                              className="text-[10px] px-1.5 py-0.2 rounded font-medium"
                              style={{ backgroundColor: style.bgColor, color: style.color }}
                            >
                              {port.type}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Explanation note */}
                {partiallyAppliedNodes.length > 0 && (
                  <div className="text-[11px] text-purple-700 dark:text-purple-300 bg-purple-100/60 dark:bg-purple-950/40 p-2.5 rounded-lg flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 shrink-0 text-purple-600" />
                    <span>
                      検出された入力フォームの値（
                      {partiallyAppliedNodes
                        .map(
                          (n) =>
                            `${n.customLabel || definitions.get(n.typeId)?.label || n.typeId}: ${n.state?.value ?? ''}`,
                        )
                        .join(', ')}
                      ）は、複合ノード内部の定数値として固定（部分適用）されます。
                    </span>
                  </div>
                )}
              </div>

              {/* Node Metadata Configuration */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    複合ノード名 (関数名) *
                  </label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="例: MultiplyBy10, VectorHypot"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    ノードの説明
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="ノードの役割や処理内容"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Replace canvas checkbox */}
                <div className="p-3.5 rounded-xl bg-purple-50/40 dark:bg-purple-950/20 border border-purple-200/50 dark:border-purple-800/40 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="replaceCanvas"
                    checked={replaceCanvas}
                    onChange={(e) => setReplaceCanvas(e.target.checked)}
                    className="mt-0.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                  />
                  <label
                    htmlFor="replaceCanvas"
                    className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <span className="font-semibold block text-slate-900 dark:text-slate-100">
                      キャンバス上の対象ノード群をこの複合ノード1つに置き換える
                    </span>
                    <span className="text-slate-500 text-[11px]">
                      チェックすると、出力端子へと繋がるノード群が1つの複合ノードにまとまり、外部からの配線も自動で再接続されます（ノード右上の「展開」ボタンでいつでも元のノード群に復元可能）。
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              キャンセル
            </button>
            {onInsertSampleTerminalNodes && (
              <button
                onClick={() => {
                  onInsertSampleTerminalNodes('multiply-partial');
                  onClose();
                }}
                className="text-xs text-purple-600 dark:text-purple-400 hover:underline px-2 py-1"
              >
                10倍関数サンプルを挿入
              </button>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={!isValid}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition ${
              isValid
                ? 'bg-purple-600 hover:bg-purple-700 text-white cursor-pointer'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Layers className="w-4 h-4" />
            複合ノードを作成してライブラリに登録
          </button>
        </div>
      </div>
    </div>
  );
};
