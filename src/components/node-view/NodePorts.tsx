import type { PointerEvent } from 'react';

import { formatValue } from '../../engine/typeSystem';
import {
  getTypeStyle,
  type CustomTypeDefinition,
  type NodeDefinition,
  type NodeEvaluationResult,
  type NodeInstance,
} from '../../types';

interface NodePortsProps {
  node: NodeInstance;
  definition: NodeDefinition;
  evaluation?: NodeEvaluationResult;
  customTypes: CustomTypeDefinition[];
  connectedPorts: { inputs: Set<string>; outputs: Set<string> };
  dragWireTargetHover?: { nodeId: string; portId: string; isCompatible: boolean } | null;
  onPortPointerDown: (event: PointerEvent, portId: string, isOutput: boolean) => void;
  onPortActivate?: (portId: string, isOutput: boolean) => void;
}

export function NodePorts({
  node,
  definition,
  evaluation,
  customTypes,
  connectedPorts,
  dragWireTargetHover,
  onPortPointerDown,
  onPortActivate,
}: NodePortsProps) {
  return (
    <>
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
                      role="button"
                      tabIndex={0}
                      aria-label={`${port.name}入力ポート (${style.label})。候補を表示`}
                      data-port-node-id={node.id}
                      data-port-id={port.id}
                      data-port-direction="in"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onPortPointerDown(e, port.id, false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          onPortActivate?.(port.id, false);
                        }
                      }}
                      className={`relative after:absolute after:-inset-3 w-3.5 h-3.5 rounded-full border-2 cursor-pointer transition-transform hover:scale-125 -ml-4.5 bg-white dark:bg-slate-900 shrink-0 ${
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
                      title={`ドラッグして接続・付け替え: ${port.name} (${style.label})`}
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
                          {style.label}
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
                          {style.label}
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
                      role="button"
                      tabIndex={0}
                      aria-label={`${port.name}出力ポート (${style.label})。候補を表示`}
                      data-port-node-id={node.id}
                      data-port-id={port.id}
                      data-port-direction="out"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onPortPointerDown(e, port.id, true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          onPortActivate?.(port.id, true);
                        }
                      }}
                      className="relative after:absolute after:-inset-3 w-3.5 h-3.5 rounded-full border-2 cursor-pointer transition-transform hover:scale-125 -mr-4.5 bg-white dark:bg-slate-900 shrink-0"
                      style={{
                        borderColor: portColor,
                        backgroundColor: isConnected ? portColor : undefined,
                      }}
                      title={`ドラッグして接続: ${port.name} (${style.label})`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </>
  );
}
