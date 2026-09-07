import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Connection,
  NodeDefinition,
  NodeInstance,
  GraphEvaluation,
  TYPE_CONFIG,
  DataType,
  CustomTypeDefinition,
  getTypeStyle,
} from '../types';
import { isTypeCompatible } from '../engine/typeSystem';
import { wouldCreateCycle } from '../engine/dagEngine';
import { NodeView } from './NodeView';
import { Trash2, AlertTriangle, CheckCircle } from 'lucide-react';

interface CanvasProps {
  nodes: NodeInstance[];
  connections: Connection[];
  definitions: Map<string, NodeDefinition>;
  evaluation: GraphEvaluation;
  stepActiveNodeId?: string | null;
  customTypes?: CustomTypeDefinition[];
  onUpdateNodePosition: (id: string, x: number, y: number) => void;
  onUpdateNodeState: (id: string, newState: any) => void;
  onUpdateNodeLabel: (id: string, newLabel: string) => void;
  onDeleteNode: (id: string) => void;
  onReevaluateNode?: (id: string) => void;
  onAddConnection: (conn: Connection) => void;
  onDeleteConnection: (connId: string) => void;
  zoom: number;
  pan: { x: number; y: number };
  onUpdateZoomPan: (zoom: number, pan: { x: number; y: number }) => void;
  onOpenLibrary?: () => void;
  onUnpackComposite?: (nodeId: string) => void;
}

interface DraggingWire {
  fromNodeId: string;
  fromPortId: string;
  fromType: DataType;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export const Canvas: React.FC<CanvasProps> = ({
  nodes,
  connections,
  definitions,
  evaluation,
  stepActiveNodeId,
  customTypes = [],
  onUpdateNodePosition,
  onUpdateNodeState,
  onUpdateNodeLabel,
  onDeleteNode,
  onReevaluateNode,
  onAddConnection,
  onDeleteConnection,
  zoom,
  pan,
  onUpdateZoomPan,
  onOpenLibrary,
  onUnpackComposite,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);

  // Dragging node state
  const [draggingNode, setDraggingNode] = useState<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Wire dragging state
  const [draggingWire, setDraggingWire] = useState<DraggingWire | null>(null);
  const [wireHoverHint, setWireHoverHint] = useState<{
    nodeId: string;
    portId: string;
    isCompatible: boolean;
    reason?: string;
  } | null>(null);

  // Port coordinates cache for wire drawing
  const [portPositions, setPortPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

  // Helper to re-measure port positions from DOM
  const updatePortPositions = useCallback(() => {
    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newPositions: Record<string, { x: number; y: number }> = {};

    for (const node of nodes) {
      const def = definitions.get(node.typeId);
      if (!def) continue;

      for (const port of def.inputs) {
        const el = document.getElementById(`port-${node.id}-${port.id}-in`);
        if (el) {
          const rect = el.getBoundingClientRect();
          // Port center inside the transformed canvas
          const x = (rect.left + rect.width / 2 - containerRect.left - pan.x) / zoom;
          const y = (rect.top + rect.height / 2 - containerRect.top - pan.y) / zoom;
          newPositions[`${node.id}:${port.id}:in`] = { x, y };
        }
      }

      for (const port of def.outputs) {
        const el = document.getElementById(`port-${node.id}-${port.id}-out`);
        if (el) {
          const rect = el.getBoundingClientRect();
          const x = (rect.left + rect.width / 2 - containerRect.left - pan.x) / zoom;
          const y = (rect.top + rect.height / 2 - containerRect.top - pan.y) / zoom;
          newPositions[`${node.id}:${port.id}:out`] = { x, y };
        }
      }
    }

    setPortPositions(newPositions);
  }, [nodes, definitions, pan, zoom]);

  // Update port positions whenever nodes change, zoom/pan changes, or window resizes
  useEffect(() => {
    updatePortPositions();
    const handleResize = () => updatePortPositions();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updatePortPositions]);

  // Also update positions on next animation frame after nodes render
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      updatePortPositions();
    });
    return () => cancelAnimationFrame(id);
  }, [nodes, evaluation, updatePortPositions]);

  // Handle Mouse Wheel Zoom
  const handleWheel = (e: React.WheelEvent) => {
    // If scrolling inside an input box, textarea, or scrollable area, do not hijack with canvas zoom
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, .overflow-y-auto, .overflow-auto')) {
      return;
    }

    e.preventDefault();
    if (!containerRef.current) return;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.35), 2.2);

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Zoom centered on cursor
    const newPanX = mouseX - ((mouseX - pan.x) * newZoom) / zoom;
    const newPanY = mouseY - ((mouseY - pan.y) * newZoom) / zoom;

    onUpdateZoomPan(newZoom, { x: newPanX, y: newPanY });
  };

  // Canvas Mouse Down: Start Pan or Deselect
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // If clicking on node or handle or input controls, do not pan or deselect
    if (target.closest('.node-drag-handle, input, textarea, select, button')) {
      return;
    }

    setSelectedNodeId(null);
    setSelectedConnectionId(null);

    // Pan canvas with Left Click or Middle Click on empty space
    if (e.button === 0 || e.button === 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  // Node Dragging Start
  const handleNodeMouseDown = (e: React.MouseEvent, node: NodeInstance) => {
    const target = e.target as HTMLElement;
    // If click originated on an input box, textarea, select, or button, do not start dragging the node
    if (target.closest('input, textarea, select, button, [contenteditable="true"]')) {
      setSelectedNodeId(node.id);
      setSelectedConnectionId(null);
      return;
    }

    e.stopPropagation();
    setSelectedNodeId(node.id);
    setSelectedConnectionId(null);

    setDraggingNode({
      id: node.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y,
    });
  };

  // Port Mouse Down: Start dragging connection wire
  const handlePortMouseDown = (
    e: React.MouseEvent,
    nodeId: string,
    portId: string,
    isOutput: boolean
  ) => {
    if (!isOutput) return; // Connections originate from outputs

    const node = nodes.find((n) => n.id === nodeId);
    const def = node ? definitions.get(node.typeId) : null;
    const port = def?.outputs.find((p) => p.id === portId);
    if (!port || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const startX = (e.clientX - containerRect.left - pan.x) / zoom;
    const startY = (e.clientY - containerRect.top - pan.y) / zoom;

    const fromType =
      node.typeId === 'composite/input-port'
        ? node.state?.portType || port.type
        : port.type;

    setDraggingWire({
      fromNodeId: nodeId,
      fromPortId: portId,
      fromType,
      startX,
      startY,
      currentX: startX,
      currentY: startY,
    });
    setWireHoverHint(null);
  };

  // Port Mouse Up: Drop wire on input port to create connection
  const handlePortMouseUp = (
    _e: React.MouseEvent,
    toNodeId: string,
    toPortId: string,
    isOutput: boolean
  ) => {
    if (!draggingWire) return;
    if (isOutput) {
      // Cannot connect output to output
      setDraggingWire(null);
      setWireHoverHint(null);
      return;
    }

    const toNode = nodes.find((n) => n.id === toNodeId);
    const toDef = toNode ? definitions.get(toNode.typeId) : null;
    const toPort = toDef?.inputs.find((p) => p.id === toPortId);

    if (!toPort) {
      setDraggingWire(null);
      setWireHoverHint(null);
      return;
    }

    // Type Compatibility Rule:
    const toType =
      toNode.typeId === 'composite/output-port'
        ? toNode.state?.portType || toPort.type
        : toPort.type;

    const compatible = isTypeCompatible(draggingWire.fromType, toType, customTypes);
    if (!compatible) {
      setDraggingWire(null);
      setWireHoverHint(null);
      return;
    }

    // Cycle Detection Rule:
    const wouldLoop = wouldCreateCycle(connections, draggingWire.fromNodeId, toNodeId);
    if (wouldLoop) {
      setDraggingWire(null);
      setWireHoverHint(null);
      return;
    }

    // Remove any existing connection to this specific input port (Constraint: 1 input has max 1 connection)
    const existingConn = connections.find(
      (c) => c.toNodeId === toNodeId && c.toPortId === toPortId
    );
    if (existingConn) {
      onDeleteConnection(existingConn.id);
    }

    // Add new connection!
    const newConn: Connection = {
      id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fromNodeId: draggingWire.fromNodeId,
      fromPortId: draggingWire.fromPortId,
      toNodeId,
      toPortId,
    };

    onAddConnection(newConn);
    setDraggingWire(null);
    setWireHoverHint(null);
  };

  // Canvas Mouse Move: Move node, pan canvas, or move wire
  const handleMouseMove = (e: React.MouseEvent) => {
    // 1. Panning
    if (isPanning) {
      const newPanX = e.clientX - panStart.x;
      const newPanY = e.clientY - panStart.y;
      onUpdateZoomPan(zoom, { x: newPanX, y: newPanY });
      return;
    }

    // 2. Dragging Node
    if (draggingNode) {
      const dx = (e.clientX - draggingNode.startX) / zoom;
      const dy = (e.clientY - draggingNode.startY) / zoom;
      const newX = Math.round(draggingNode.origX + dx);
      const newY = Math.round(draggingNode.origY + dy);
      onUpdateNodePosition(draggingNode.id, newX, newY);
      updatePortPositions();
      return;
    }

    // 3. Dragging Wire
    if (draggingWire && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const currentX = (e.clientX - containerRect.left - pan.x) / zoom;
      const currentY = (e.clientY - containerRect.top - pan.y) / zoom;

      setDraggingWire({
        ...draggingWire,
        currentX,
        currentY,
      });

      // Check if hovering over any input socket
      const hoveredElement = document.elementFromPoint(e.clientX, e.clientY);
      const portSocket = hoveredElement?.closest('[id^="port-"]');
      if (portSocket) {
        const idParts = portSocket.id.split('-');
        // Format: port-nodeId-portId-in
        const targetNodeId = idParts[1];
        const targetPortId = idParts[2];
        const isIn = idParts[3] === 'in';

        if (isIn && targetNodeId && targetPortId) {
          const toNode = nodes.find((n) => n.id === targetNodeId);
          const toDef = toNode ? definitions.get(toNode.typeId) : null;
          const toPort = toDef?.inputs.find((p) => p.id === targetPortId);

          if (toPort) {
            const toType =
              toNode.typeId === 'composite/output-port'
                ? toNode.state?.portType || toPort.type
                : toPort.type;

            const compatible = isTypeCompatible(draggingWire.fromType, toType, customTypes);
            const wouldLoop = wouldCreateCycle(connections, draggingWire.fromNodeId, targetNodeId);

            let reason = '';
            if (!compatible) {
              reason = `型不一致: ${draggingWire.fromType} → ${toType}`;
            } else if (wouldLoop) {
              reason = '循環参照（ループ）を検出したため接続不可';
            } else {
              reason = `接続可能: ${draggingWire.fromType} → ${toType}`;
            }

            setWireHoverHint({
              nodeId: targetNodeId,
              portId: targetPortId,
              isCompatible: compatible && !wouldLoop,
              reason,
            });
            return;
          }
        }
      }

      setWireHoverHint(null);
    }
  };

  // Mouse Up: Stop dragging or panning
  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggingNode(null);
    if (draggingWire) {
      setDraggingWire(null);
      setWireHoverHint(null);
    }
  };

  // Compute Bezier Curve Path
  const getBezierPath = (
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): string => {
    const dx = Math.abs(x2 - x1) * 0.5;
    const curvature = Math.max(dx, 40);
    return `M ${x1} ${y1} C ${x1 + curvature} ${y1}, ${x2 - curvature} ${y2}, ${x2} ${y2}`;
  };

  // Collect connected ports mapping for visual highlight in nodes
  const connectedPortsMap = React.useMemo(() => {
    const map: Record<string, { inputs: Set<string>; outputs: Set<string> }> = {};
    for (const node of nodes) {
      map[node.id] = { inputs: new Set(), outputs: new Set() };
    }
    for (const conn of connections) {
      if (map[conn.fromNodeId]) {
        map[conn.fromNodeId].outputs.add(conn.fromPortId);
      }
      if (map[conn.toNodeId]) {
        map[conn.toNodeId].inputs.add(conn.toPortId);
      }
    }
    return map;
  }, [nodes, connections]);

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="relative w-full h-full overflow-hidden bg-slate-100 dark:bg-slate-950 select-none cursor-default"
      style={{
        backgroundImage: `radial-gradient(circle, var(--color-slate-300, #cbd5e1) 1px, transparent 1px)`,
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
      }}
    >
      {/* Transformed Stage */}
      <div
        className="absolute top-0 left-0 w-full h-full origin-top-left pointer-events-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {/* SVG Cable Wires Layer */}
        <svg className="absolute top-0 left-0 w-[5000px] h-[5000px] overflow-visible pointer-events-none">
          <defs>
            <linearGradient id="wire-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
            <filter id="wire-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#6366f1" floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Render Active Connections */}
          {connections.map((conn) => {
            const startPos = portPositions[`${conn.fromNodeId}:${conn.fromPortId}:out`];
            const endPos = portPositions[`${conn.toNodeId}:${conn.toPortId}:in`];
            if (!startPos || !endPos) return null;

            const fromNode = nodes.find((n) => n.id === conn.fromNodeId);
            const fromDef = fromNode ? definitions.get(fromNode.typeId) : null;
            const fromPort = fromDef?.outputs.find((p) => p.id === conn.fromPortId);
            const portType = fromPort?.type || 'any';
            const wireColor = getTypeStyle(portType, customTypes).color;

            const isSelected = selectedConnectionId === conn.id;
            const path = getBezierPath(startPos.x, startPos.y, endPos.x, endPos.y);

            // Midpoint for delete button or value badge
            const midX = (startPos.x + endPos.x) / 2;
            const midY = (startPos.y + endPos.y) / 2;

            const outputValue = evaluation[conn.fromNodeId]?.outputs?.[conn.fromPortId];

            return (
              <g key={conn.id} className="group/wire pointer-events-auto">
                {/* Thick invisible click hit-area */}
                <path
                  d={path}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={20}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedConnectionId(conn.id);
                  }}
                />

                {/* Visible colored wire */}
                <path
                  d={path}
                  fill="none"
                  stroke={wireColor}
                  strokeWidth={isSelected ? 4 : 2.5}
                  strokeLinecap="round"
                  className="transition-all duration-150 group-hover/wire:stroke-[3.5px]"
                  style={{
                    filter: isSelected ? 'url(#wire-glow)' : undefined,
                  }}
                />

                {/* Animated data particle pulses along the wire when live */}
                <path
                  d={path}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={2}
                  strokeDasharray="6 14"
                  strokeLinecap="round"
                  className="opacity-70 animate-pulse pointer-events-none"
                />

                {/* Delete button on wire hover or selection */}
                {(isSelected || false) && (
                  <foreignObject
                    x={midX - 14}
                    y={midY - 14}
                    width={28}
                    height={28}
                    className="overflow-visible"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConnection(conn.id);
                      }}
                      className="flex items-center justify-center w-7 h-7 rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 transition hover:scale-110"
                      title="接続を削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </foreignObject>
                )}
              </g>
            );
          })}

          {/* Render Wire Being Dragged */}
          {draggingWire && (
            <g className="pointer-events-none">
              <path
                d={getBezierPath(
                  draggingWire.startX,
                  draggingWire.startY,
                  draggingWire.currentX,
                  draggingWire.currentY
                )}
                fill="none"
                stroke={
                  wireHoverHint
                    ? wireHoverHint.isCompatible
                      ? '#10b981'
                      : '#ef4444'
                    : getTypeStyle(draggingWire.fromType, customTypes).color
                }
                strokeWidth={3}
                strokeDasharray="5 5"
                strokeLinecap="round"
              />
            </g>
          )}
        </svg>

        {/* Nodes Layer */}
        {nodes.map((node) => {
          const def = definitions.get(node.typeId);
          if (!def) return null;

          const isSelected = selectedNodeId === node.id;
          const isSteppingActive = stepActiveNodeId === node.id;
          const nodeEvaluation = evaluation[node.id];

          return (
            <div
              key={node.id}
              className="absolute pointer-events-auto"
              style={{
                transform: `translate(${node.x}px, ${node.y}px)`,
              }}
              onMouseDown={(e) => handleNodeMouseDown(e, node)}
            >
              <NodeView
                node={node}
                definition={def}
                evaluation={nodeEvaluation}
                customTypes={customTypes}
                isSelected={isSelected}
                isSteppingActive={isSteppingActive}
                onSelect={() => setSelectedNodeId(node.id)}
                onDelete={() => onDeleteNode(node.id)}
                onReevaluate={() => onReevaluateNode?.(node.id)}
                onUnpackComposite={() => onUnpackComposite?.(node.id)}
                onUpdateState={(state) => onUpdateNodeState(node.id, state)}
                onUpdateLabel={(lbl) => onUpdateNodeLabel(node.id, lbl)}
                onPortMouseDown={(e, portId, isOut) =>
                  handlePortMouseDown(e, node.id, portId, isOut)
                }
                onPortMouseUp={(e, portId, isOut) =>
                  handlePortMouseUp(e, node.id, portId, isOut)
                }
                connectedPorts={connectedPortsMap[node.id] || { inputs: new Set(), outputs: new Set() }}
                dragWireTargetHover={
                  wireHoverHint?.nodeId === node.id ? wireHoverHint : null
                }
              />
            </div>
          );
        })}

        {/* Empty Canvas Guide */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center p-6 max-w-sm rounded-2xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80 shadow-lg backdrop-blur-sm space-y-3 pointer-events-auto">
              <div className="w-10 h-10 mx-auto rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-lg">
                +
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  キャンバスは空です
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  上部の「ノードを追加」または「サンプルプリセット」からノードを配置してグラフを作成できます。
                </p>
              </div>
              {onOpenLibrary && (
                <button
                  onClick={onOpenLibrary}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition shadow-xs"
                >
                  ノードを追加する
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Floating Wire Hover / Drag Compatibility Tooltip */}
      {draggingWire && wireHoverHint && (
        <div
          className={`fixed z-50 pointer-events-none px-3 py-1.5 rounded-lg shadow-lg text-xs font-medium flex items-center gap-1.5 border backdrop-blur-md ${
            wireHoverHint.isCompatible
              ? 'bg-emerald-500/90 text-white border-emerald-400'
              : 'bg-rose-600/90 text-white border-rose-400'
          }`}
          style={{
            left: window.innerWidth / 2 - 120,
            bottom: 80,
          }}
        >
          {wireHoverHint.isCompatible ? (
            <CheckCircle className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{wireHoverHint.reason}</span>
        </div>
      )}
    </div>
  );
};
