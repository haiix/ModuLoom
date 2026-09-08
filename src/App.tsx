import { useState, useMemo, useEffect, useRef, useCallback, type SetStateAction } from 'react';
import {
  NodeDefinition,
  NodeInstance,
  Connection,
  GraphEvaluation,
  CustomTypeDefinition,
  FlowProjectExport,
} from './types';
import { BUILTIN_NODES, PRESETS } from './nodes/definitions';
import { INITIAL_CUSTOM_TYPES, generateNodesForCustomType } from './nodes/customTypeNodes';
import {
  evaluateGraph,
  evaluateGraphAsync,
  getTopologicalOrder,
  generateTypeScriptCode,
  detectDirtySeedNodeIds,
  getDownstreamNodeIds,
  unpackCompositeNode,
} from './engine/dagEngine';
import { Canvas } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { CanvasControls } from './components/CanvasControls';
import { OnboardingGuide } from './components/OnboardingGuide';
import {
  ONBOARDING_STORAGE_KEY,
  shouldShowOnboarding,
  STARTER_PRESET_ID,
} from './components/onboarding';
import { NodeLibrary } from './components/NodeLibrary';
import { LoadGraphModal } from './components/LoadGraphModal';
import { CustomNodeModal } from './components/CustomNodeModal';
import { CustomTypeModal } from './components/CustomTypeModal';
import { CodeExportModal } from './components/CodeExportModal';
import { CreateCompositeModal } from './components/CreateCompositeModal';
import { TopologicalVisualizer } from './components/TopologicalVisualizer';
import { CURRENT_PROJECT_VERSION } from './engine/projectFormat';
import {
  commitEditorDocument,
  createEditorHistory,
  finishEditorHistoryGroup,
  isEditorDocumentDirty,
  markEditorDocumentSaved,
  redoEditorHistory,
  undoEditorHistory,
  type EditorDocument,
} from './engine/editorHistory';
import {
  alignSelectedNodes,
  createGraphClipboard,
  deleteSelectedGraph,
  distributeSelectedNodes,
  pasteGraphClipboard,
  type Alignment,
  type Distribution,
  type GraphClipboard,
} from './engine/graphEditing';

export default function App() {
  // Empty graph as initial state (no sample nodes by default)
  const [editorHistory, setEditorHistory] = useState(() =>
    createEditorHistory({
      nodes: [],
      connections: [],
      customDefinitions: [],
      customTypes: INITIAL_CUSTOM_TYPES,
    }),
  );
  const { nodes, connections, customDefinitions, customTypes } = editorHistory.present;
  const isDirty = isEditorDocumentDirty(editorHistory);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const graphClipboardRef = useRef<GraphClipboard | null>(null);
  const pasteCountRef = useRef(0);

  const updateEditorDocument = useCallback(
    (update: (document: EditorDocument) => EditorDocument, groupKey?: string) => {
      setEditorHistory((history) =>
        commitEditorDocument(history, update(history.present), groupKey),
      );
    },
    [],
  );
  const updateField = useCallback(
    <K extends keyof EditorDocument>(key: K, action: SetStateAction<EditorDocument[K]>) => {
      updateEditorDocument((document) => ({
        ...document,
        [key]: typeof action === 'function' ? action(document[key]) : action,
      }));
    },
    [updateEditorDocument],
  );
  const setNodes = useCallback(
    (action: SetStateAction<NodeInstance[]>) => updateField('nodes', action),
    [updateField],
  );
  const setConnections = useCallback(
    (action: SetStateAction<Connection[]>) => updateField('connections', action),
    [updateField],
  );
  const setCustomDefinitions = useCallback(
    (action: SetStateAction<NodeDefinition[]>) => updateField('customDefinitions', action),
    [updateField],
  );
  const setCustomTypes = useCallback(
    (action: SetStateAction<CustomTypeDefinition[]>) => updateField('customTypes', action),
    [updateField],
  );

  // Canvas viewport
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // UI Drawer & Modal States
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [isCustomTypeModalOpen, setIsCustomTypeModalOpen] = useState(false);
  const [isCodeExportModalOpen, setIsCodeExportModalOpen] = useState(false);
  const [isCreateCompositeOpen, setIsCreateCompositeOpen] = useState(false);
  const [showDagViewer, setShowDagViewer] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return shouldShowOnboarding(window.localStorage);
    } catch {
      return true;
    }
  });

  // Engine evaluation settings
  const [isLiveReactive, setIsLiveReactive] = useState(true);
  const [manualEvalTrigger, setManualEvalTrigger] = useState(0);

  // Stepping execution
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [isPlayingStep, setIsPlayingStep] = useState(false);
  const stepTimerRef = useRef<number | null>(null);

  // Auto-generate Constructor, Deconstructor, and Validator nodes for each custom type!
  const customTypeGeneratedNodes = useMemo(() => {
    return customTypes.flatMap((ct) => generateNodesForCustomType(ct));
  }, [customTypes]);

  // Combined definitions map
  const allDefinitions = useMemo(() => {
    return [...BUILTIN_NODES, ...customTypeGeneratedNodes, ...customDefinitions];
  }, [customTypeGeneratedNodes, customDefinitions]);

  const definitionsMap = useMemo(() => {
    const map = new Map<string, NodeDefinition>();
    for (const def of allDefinitions) {
      map.set(def.typeId, def);
    }
    return map;
  }, [allDefinitions]);

  // Topological ordering
  const { order: topoOrder, hasCycle } = useMemo(() => {
    return getTopologicalOrder(nodes, connections);
  }, [nodes, connections]);

  // Reactive Graph Evaluation (synchronous fast-pass + asynchronous live streaming)
  const [evaluation, setEvaluation] = useState<GraphEvaluation>({});

  // Previous graph snapshot for incremental dirty node tracking
  const prevGraphSnapshotRef = useRef<{
    nodes: NodeInstance[];
    connections: Connection[];
  }>({
    nodes: [],
    connections: [],
  });

  // Keep latest evaluation in a ref so incremental evaluation can reuse cached node outputs
  const evaluationRef = useRef<GraphEvaluation>({});
  evaluationRef.current = evaluation;

  // Track incremental calculation stats (how many nodes were recomputed vs cached)
  const [evalStats, setEvalStats] = useState<{
    dirtyCount: number;
    totalCount: number;
    lastDirtyNodeIds: string[];
  }>({
    dirtyCount: 0,
    totalCount: 0,
    lastDirtyNodeIds: [],
  });

  useEffect(() => {
    if (!isLiveReactive && manualEvalTrigger === 0) {
      setEvaluation({});
      return;
    }

    const prevSnapshot = prevGraphSnapshotRef.current;

    // Detect dirty seed nodes between previous state and current state
    const dirtySeeds = detectDirtySeedNodeIds(
      prevSnapshot.nodes,
      nodes,
      prevSnapshot.connections,
      connections,
    );

    // Save snapshot for next update
    prevGraphSnapshotRef.current = {
      nodes: nodes.map((n) => ({ ...n })),
      connections: [...connections],
    };

    // If nothing functionally changed (e.g. only node position x, y changed or pan/zoom)
    if (dirtySeeds !== 'all' && dirtySeeds.size === 0) {
      return;
    }

    // Determine the full set of dirty nodes: seed nodes + all reachable downstream nodes!
    let dirtyNodeIds: Set<string> | undefined;
    if (dirtySeeds !== 'all') {
      dirtyNodeIds = getDownstreamNodeIds(dirtySeeds, connections);
    }

    const dirtyList = dirtyNodeIds ? Array.from(dirtyNodeIds) : nodes.map((n) => n.id);
    setEvalStats({
      dirtyCount: dirtyList.length,
      totalCount: nodes.length,
      lastDirtyNodeIds: dirtyList,
    });

    // Step 1: Immediate synchronous calculation (only recomputes dirty nodes, reuses cache for others)
    const syncEval = evaluateGraph(
      nodes,
      connections,
      definitionsMap,
      evaluationRef.current,
      dirtyNodeIds,
    );
    setEvaluation(syncEval);

    // Step 2: Check if any DIRTY node is async or stream
    const hasDirtyAsyncOrStream = nodes.some((n) => {
      if (dirtyNodeIds && !dirtyNodeIds.has(n.id)) return false;
      const def = definitionsMap.get(n.typeId);
      return def?.isAsync || def?.category === 'Async' || def?.category === 'Stream';
    });

    if (!hasDirtyAsyncOrStream) return;

    let cancelled = false;

    // Step 3: Run asynchronous DAG evaluation (only re-running dirty nodes!)
    evaluateGraphAsync(
      nodes,
      connections,
      definitionsMap,
      syncEval,
      dirtyNodeIds,
      (nodeId, partial) => {
        if (cancelled) return;
        setEvaluation((prev) => ({
          ...prev,
          [nodeId]: {
            ...(prev[nodeId] || {}),
            ...partial,
          },
        }));
      },
      () => cancelled,
    ).then((finalEval) => {
      if (!cancelled) {
        setEvaluation(finalEval);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [nodes, connections, definitionsMap, isLiveReactive, manualEvalTrigger]);

  // Step active node ID
  const stepActiveNodeId = useMemo(() => {
    if (stepIndex === null || stepIndex < 0 || stepIndex >= topoOrder.length) {
      return null;
    }
    return topoOrder[stepIndex];
  }, [stepIndex, topoOrder]);

  // Auto-play step execution loop
  useEffect(() => {
    if (isPlayingStep) {
      stepTimerRef.current = window.setInterval(() => {
        setStepIndex((prev) => {
          if (prev === null) return 0;
          if (prev + 1 >= topoOrder.length) {
            setIsPlayingStep(false);
            return null; // Complete
          }
          return prev + 1;
        });
      }, 700);
    } else {
      if (stepTimerRef.current) {
        clearInterval(stepTimerRef.current);
      }
    }
    return () => {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    };
  }, [isPlayingStep, topoOrder.length]);

  // Handlers for Canvas & Graph Manipulation
  const handleFinishNodeDrag = useCallback(() => {
    setEditorHistory(finishEditorHistoryGroup);
  }, []);

  const handleUpdateNodePositions = useCallback(
    (positions: Map<string, { x: number; y: number }>) => {
      updateEditorDocument(
        (document) => ({
          ...document,
          nodes: document.nodes.map((node) => {
            const position = positions.get(node.id);
            return position ? { ...node, ...position } : node;
          }),
        }),
        'drag:selection',
      );
    },
    [updateEditorDocument],
  );

  const handleUpdateNodeState = (id: string, newState: any) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, state: newState } : n)));
  };

  const handleUpdateNodeLabel = (id: string, customLabel: string) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, customLabel } : n)));
  };

  const handleDeleteNode = (id: string) => {
    updateEditorDocument((document) => ({
      ...document,
      nodes: document.nodes.filter((node) => node.id !== id),
      connections: document.connections.filter(
        (connection) => connection.fromNodeId !== id && connection.toNodeId !== id,
      ),
    }));
    setSelectedNodeIds((selected) => {
      const next = new Set(selected);
      next.delete(id);
      return next;
    });
    if (stepIndex !== null) setStepIndex(null);
  };

  // Reevaluate specific node and its downstream dependencies
  const handleReevaluateNode = useCallback(
    (nodeId: string) => {
      const dirtyNodeIds = getDownstreamNodeIds(new Set([nodeId]), connections);
      const dirtyList = Array.from(dirtyNodeIds);

      setEvalStats({
        dirtyCount: dirtyList.length,
        totalCount: nodes.length,
        lastDirtyNodeIds: dirtyList,
      });

      // Clear previous cache for dirty nodes so they are freshly executed
      const prevEval = { ...evaluationRef.current };
      for (const id of dirtyNodeIds) {
        delete prevEval[id];
      }

      const syncEval = evaluateGraph(nodes, connections, definitionsMap, prevEval, dirtyNodeIds);
      setEvaluation(syncEval);

      // Check for async/stream nodes among dirty nodes
      const hasDirtyAsyncOrStream = nodes.some((n) => {
        if (!dirtyNodeIds.has(n.id)) return false;
        const def = definitionsMap.get(n.typeId);
        return def?.isAsync || def?.category === 'Async' || def?.category === 'Stream';
      });

      if (hasDirtyAsyncOrStream) {
        const cancelled = false;
        evaluateGraphAsync(
          nodes,
          connections,
          definitionsMap,
          syncEval,
          dirtyNodeIds,
          (nid, partial) => {
            if (cancelled) return;
            setEvaluation((prev) => ({
              ...prev,
              [nid]: {
                ...(prev[nid] || {}),
                ...partial,
              },
            }));
          },
          () => cancelled,
        ).then((finalEval) => {
          if (!cancelled) {
            setEvaluation(finalEval);
          }
        });
      }
    },
    [nodes, connections, definitionsMap],
  );

  const handleAddConnection = (newConn: Connection) => {
    setConnections((prev) => [
      ...prev.filter(
        (connection) =>
          connection.toNodeId !== newConn.toNodeId || connection.toPortId !== newConn.toPortId,
      ),
      newConn,
    ]);
  };

  const handleDeleteConnection = (connId: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== connId));
  };

  const handleCopySelection = useCallback(() => {
    if (selectedNodeIds.size === 0) return;
    graphClipboardRef.current = createGraphClipboard(nodes, connections, selectedNodeIds);
    pasteCountRef.current = 0;
  }, [connections, nodes, selectedNodeIds]);

  const handlePasteSelection = useCallback(() => {
    const clipboard = graphClipboardRef.current;
    if (!clipboard || clipboard.nodes.length === 0) return;
    pasteCountRef.current += 1;
    let sequence = 0;
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const pasted = pasteGraphClipboard(
      clipboard,
      nodes,
      connections,
      (kind) => `${kind === 'node' ? 'n' : 'conn'}_copy_${stamp}_${sequence++}`,
      { x: 40 * pasteCountRef.current, y: 40 * pasteCountRef.current },
    );
    updateEditorDocument((document) => ({
      ...document,
      nodes: pasted.nodes,
      connections: pasted.connections,
    }));
    setSelectedNodeIds(pasted.selectedNodeIds);
  }, [connections, nodes, updateEditorDocument]);

  const handleDuplicateSelection = useCallback(() => {
    if (selectedNodeIds.size === 0) return;
    graphClipboardRef.current = createGraphClipboard(nodes, connections, selectedNodeIds);
    pasteCountRef.current = 0;
    handlePasteSelection();
  }, [connections, handlePasteSelection, nodes, selectedNodeIds]);

  const handleDeleteSelection = useCallback(() => {
    if (selectedNodeIds.size === 0) return;
    updateEditorDocument((document) => ({
      ...document,
      ...deleteSelectedGraph(document.nodes, document.connections, selectedNodeIds),
    }));
    setSelectedNodeIds(new Set());
  }, [selectedNodeIds, updateEditorDocument]);

  const handleAlignSelection = useCallback(
    (alignment: Alignment) => {
      updateEditorDocument((document) => ({
        ...document,
        nodes: alignSelectedNodes(document.nodes, selectedNodeIds, alignment),
      }));
    },
    [selectedNodeIds, updateEditorDocument],
  );

  const handleDistributeSelection = useCallback(
    (distribution: Distribution) => {
      updateEditorDocument((document) => ({
        ...document,
        nodes: distributeSelectedNodes(document.nodes, selectedNodeIds, distribution),
      }));
    },
    [selectedNodeIds, updateEditorDocument],
  );

  useEffect(() => {
    const existingIds = new Set(nodes.map(({ id }) => id));
    setSelectedNodeIds((selected) => {
      const next = new Set([...selected].filter((id) => existingIds.has(id)));
      return next.size === selected.size ? selected : next;
    });
  }, [nodes]);

  const handleAddNode = (typeId: string, customDef?: NodeDefinition) => {
    const def = customDef || definitionsMap.get(typeId);
    if (!def) return;

    // Place node in visible canvas viewport
    const containerEl = document.querySelector('main');
    const bounds = containerEl?.getBoundingClientRect();
    const centerX = bounds ? (bounds.width / 2 - pan.x) / zoom - 100 : 200;
    const centerY = bounds ? (bounds.height / 2 - pan.y) / zoom - 60 : 200;

    const newNode: NodeInstance = {
      id: `n_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      typeId,
      x: Math.round(centerX + (Math.random() * 40 - 20)),
      y: Math.round(centerY + (Math.random() * 40 - 20)),
      state: def.defaultState ? JSON.parse(JSON.stringify(def.defaultState)) : undefined,
    };

    setNodes((prev) => [...prev, newNode]);
    return newNode;
  };

  const handleSelectPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    prevGraphSnapshotRef.current = { nodes: [], connections: [] };
    updateEditorDocument((document) => ({
      ...document,
      nodes: preset.nodes,
      connections: preset.connections,
    }));
    setZoom(1.0);
    setPan({ x: 60, y: 80 });
    setStepIndex(null);
    setIsPlayingStep(false);
  };

  const hideOnboarding = (status: 'skipped' | 'completed') => {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, status);
    } catch {
      // The guide can still be dismissed when browser storage is unavailable.
    }
    setShowOnboarding(false);
  };

  const handleClearGraph = () => {
    prevGraphSnapshotRef.current = { nodes: [], connections: [] };
    updateEditorDocument((document) => ({ ...document, nodes: [], connections: [] }));
    setStepIndex(null);
    setIsPlayingStep(false);
    setEvaluation({});
    setEvalStats({ dirtyCount: 0, totalCount: 0, lastDirtyNodeIds: [] });
  };

  const handleSaveCustomNode = (customDef: NodeDefinition) => {
    setCustomDefinitions((prev) => {
      const idx = prev.findIndex((d) => d.typeId === customDef.typeId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = customDef;
        return next;
      }
      return [...prev, customDef];
    });

    // Auto-add to canvas if newly created
    const isExisting = customDefinitions.some((d) => d.typeId === customDef.typeId);
    if (!isExisting) {
      handleAddNode(customDef.typeId, customDef);
    }
  };

  const handleDeleteCustomNode = (typeId: string) => {
    setCustomDefinitions((prev) => prev.filter((d) => d.typeId !== typeId));
  };

  const handleSaveCustomType = (newType: CustomTypeDefinition, autoAdd = false) => {
    setCustomTypes((prev) => {
      const idx = prev.findIndex((t) => t.id === newType.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = newType;
        return next;
      }
      return [...prev, newType];
    });

    if (autoAdd) {
      const generated = generateNodesForCustomType(newType);
      const ctorDef = generated.find((g) => g.typeId === `type/${newType.id}/constructor`);
      if (ctorDef) {
        handleAddNode(ctorDef.typeId, ctorDef);
      }
    }
  };

  const handleDeleteCustomType = (typeId: string) => {
    setCustomTypes((prev) => prev.filter((t) => t.id !== typeId));
  };

  // Composite Node Handlers: Grouping into composite function & Unpacking
  const handleInsertTerminalSampleNodes = (
    sampleType: 'multiply-partial' | 'vector-hypot' = 'multiply-partial',
  ) => {
    const containerEl = document.querySelector('main');
    const bounds = containerEl?.getBoundingClientRect();
    const centerX = bounds ? (bounds.width / 2 - pan.x) / zoom - 250 : 100;
    const centerY = bounds ? (bounds.height / 2 - pan.y) / zoom - 80 : 100;

    if (sampleType === 'multiply-partial') {
      const inXId = `in_x_${Date.now()}`;
      const numFixedId = `num_fixed_${Date.now()}`;
      const mulId = `mul_${Date.now()}`;
      const outResId = `out_res_${Date.now()}`;

      const sampleNodes: NodeInstance[] = [
        {
          id: inXId,
          typeId: 'composite/input-port',
          x: Math.round(centerX),
          y: Math.round(centerY),
          state: { portName: 'x', portType: 'number', testValue: 5 },
          customLabel: 'グループ入力端子 (x)',
        },
        {
          id: numFixedId,
          typeId: 'input/number',
          x: Math.round(centerX),
          y: Math.round(centerY + 160),
          state: { value: 10 },
          customLabel: 'Number Input (固定値: 10)',
        },
        {
          id: mulId,
          typeId: 'math/multiply',
          x: Math.round(centerX + 280),
          y: Math.round(centerY + 80),
          customLabel: '乗算 (x * 10)',
        },
        {
          id: outResId,
          typeId: 'composite/output-port',
          x: Math.round(centerX + 540),
          y: Math.round(centerY + 80),
          state: { portName: 'result', portType: 'number' },
          customLabel: 'グループ出力端子 (result)',
        },
      ];

      const sampleConnections: Connection[] = [
        {
          id: `c_${inXId}_${mulId}_a`,
          fromNodeId: inXId,
          fromPortId: 'out',
          toNodeId: mulId,
          toPortId: 'a',
        },
        {
          id: `c_${numFixedId}_${mulId}_b`,
          fromNodeId: numFixedId,
          fromPortId: 'value',
          toNodeId: mulId,
          toPortId: 'b',
        },
        {
          id: `c_${mulId}_${outResId}_in`,
          fromNodeId: mulId,
          fromPortId: 'result',
          toNodeId: outResId,
          toPortId: 'in',
        },
      ];

      updateEditorDocument((document) => ({
        ...document,
        nodes: [...document.nodes, ...sampleNodes],
        connections: [...document.connections, ...sampleConnections],
      }));
      return;
    }

    const inXId = `in_x_${Date.now()}`;
    const inYId = `in_y_${Date.now()}`;
    const sqXId = `sq_x_${Date.now()}`;
    const sqYId = `sq_y_${Date.now()}`;
    const addId = `add_${Date.now()}`;
    const sqrtId = `sqrt_${Date.now()}`;
    const outHypotId = `out_hypot_${Date.now()}`;

    const sampleNodes: NodeInstance[] = [
      {
        id: inXId,
        typeId: 'composite/input-port',
        x: Math.round(centerX - 100),
        y: Math.round(centerY),
        state: { portName: 'x', portType: 'number', testValue: 3 },
      },
      {
        id: inYId,
        typeId: 'composite/input-port',
        x: Math.round(centerX - 100),
        y: Math.round(centerY + 160),
        state: { portName: 'y', portType: 'number', testValue: 4 },
      },
      {
        id: sqXId,
        typeId: 'math/multiply',
        x: Math.round(centerX + 160),
        y: Math.round(centerY),
      },
      {
        id: sqYId,
        typeId: 'math/multiply',
        x: Math.round(centerX + 160),
        y: Math.round(centerY + 160),
      },
      {
        id: addId,
        typeId: 'math/add',
        x: Math.round(centerX + 420),
        y: Math.round(centerY + 80),
      },
      {
        id: sqrtId,
        typeId: 'math/sqrt',
        x: Math.round(centerX + 660),
        y: Math.round(centerY + 80),
      },
      {
        id: outHypotId,
        typeId: 'composite/output-port',
        x: Math.round(centerX + 900),
        y: Math.round(centerY + 80),
        state: { portName: 'hypot', portType: 'number' },
      },
    ];

    const sampleConnections: Connection[] = [
      {
        id: `c_${inXId}_${sqXId}_a`,
        fromNodeId: inXId,
        fromPortId: 'out',
        toNodeId: sqXId,
        toPortId: 'a',
      },
      {
        id: `c_${inXId}_${sqXId}_b`,
        fromNodeId: inXId,
        fromPortId: 'out',
        toNodeId: sqXId,
        toPortId: 'b',
      },
      {
        id: `c_${inYId}_${sqYId}_a`,
        fromNodeId: inYId,
        fromPortId: 'out',
        toNodeId: sqYId,
        toPortId: 'a',
      },
      {
        id: `c_${inYId}_${sqYId}_b`,
        fromNodeId: inYId,
        fromPortId: 'out',
        toNodeId: sqYId,
        toPortId: 'b',
      },
      {
        id: `c_${sqXId}_${addId}`,
        fromNodeId: sqXId,
        fromPortId: 'result',
        toNodeId: addId,
        toPortId: 'a',
      },
      {
        id: `c_${sqYId}_${addId}`,
        fromNodeId: sqYId,
        fromPortId: 'result',
        toNodeId: addId,
        toPortId: 'b',
      },
      {
        id: `c_${addId}_${sqrtId}`,
        fromNodeId: addId,
        fromPortId: 'result',
        toNodeId: sqrtId,
        toPortId: 'value',
      },
      {
        id: `c_${sqrtId}_${outHypotId}`,
        fromNodeId: sqrtId,
        fromPortId: 'result',
        toNodeId: outHypotId,
        toPortId: 'in',
      },
    ];

    updateEditorDocument((document) => ({
      ...document,
      nodes: [...document.nodes, ...sampleNodes],
      connections: [...document.connections, ...sampleConnections],
    }));
  };

  const handleSaveComposite = (
    compositeDef: NodeDefinition,
    replaceCanvas: boolean,
    targetNodeIds: string[],
  ) => {
    if (!replaceCanvas || targetNodeIds.length === 0) {
      setCustomDefinitions((previous) =>
        previous.some((definition) => definition.typeId === compositeDef.typeId)
          ? previous.map((definition) =>
              definition.typeId === compositeDef.typeId ? compositeDef : definition,
            )
          : [...previous, compositeDef],
      );
      return;
    }

    // 2. Calculate center coordinates of grouped nodes
    const targetSet = new Set(targetNodeIds);
    const targetNodes = nodes.filter((n) => targetSet.has(n.id));
    if (targetNodes.length === 0) return;

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const n of targetNodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const centerX = Math.round((minX + maxX) / 2);
    const centerY = Math.round((minY + maxY) / 2);

    const newCompositeNodeId = `composite_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newCompositeNode: NodeInstance = {
      id: newCompositeNodeId,
      typeId: compositeDef.typeId,
      x: centerX,
      y: centerY,
      customLabel: compositeDef.label,
    };

    // 3. Rewire external connections that entered or exited the target cluster
    const externalConnections: Connection[] = [];
    for (const c of connections) {
      const isFromTarget = targetSet.has(c.fromNodeId);
      const isToTarget = targetSet.has(c.toNodeId);

      if (isFromTarget && isToTarget) {
        // Internal wire encapsulated inside composite
        continue;
      }

      if (!isFromTarget && isToTarget) {
        // External node feeding into target
        const targetNode = nodes.find((n) => n.id === c.toNodeId);
        if (targetNode?.typeId === 'composite/input-port') {
          const portName =
            compositeDef.compositeSubgraph?.inputPortMappings?.find(
              ({ internalNodeId }) => internalNodeId === targetNode.id,
            )?.externalPortId ??
            targetNode.state?.portName ??
            'input';
          externalConnections.push({
            id: `c_${newCompositeNodeId}_${c.id}`,
            fromNodeId: c.fromNodeId,
            fromPortId: c.fromPortId,
            toNodeId: newCompositeNodeId,
            toPortId: portName,
          });
        }
      } else if (isFromTarget && !isToTarget) {
        // Target node feeding to external node
        const targetNode = nodes.find((n) => n.id === c.fromNodeId);
        if (targetNode?.typeId === 'composite/output-port') {
          const portName =
            compositeDef.compositeSubgraph?.outputPortMappings?.find(
              ({ internalNodeId }) => internalNodeId === targetNode.id,
            )?.externalPortId ??
            targetNode.state?.portName ??
            'result';
          externalConnections.push({
            id: `c_${newCompositeNodeId}_${c.id}`,
            fromNodeId: newCompositeNodeId,
            fromPortId: portName,
            toNodeId: c.toNodeId,
            toPortId: c.toPortId,
          });
        }
      } else {
        externalConnections.push(c);
      }
    }

    updateEditorDocument((document) => ({
      ...document,
      customDefinitions: document.customDefinitions.some(
        (definition) => definition.typeId === compositeDef.typeId,
      )
        ? document.customDefinitions.map((definition) =>
            definition.typeId === compositeDef.typeId ? compositeDef : definition,
          )
        : [...document.customDefinitions, compositeDef],
      nodes: [...document.nodes.filter((node) => !targetSet.has(node.id)), newCompositeNode],
      connections: externalConnections,
    }));
  };

  const handleUnpackComposite = (nodeId: string) => {
    const def = definitionsMap.get(nodes.find((node) => node.id === nodeId)?.typeId || '');
    if (!def || !def.isComposite || !def.compositeSubgraph) return;
    const unpacked = unpackCompositeNode(nodes, connections, nodeId, def);
    if (
      unpacked.warnings.length > 0 &&
      !window.confirm(
        `一部の接続を復元できません。復元できる範囲で展開しますか？\n\n${unpacked.warnings.join('\n')}`,
      )
    ) {
      return;
    }
    updateEditorDocument((document) => ({
      ...document,
      nodes: unpacked.nodes,
      connections: unpacked.connections,
    }));
  };

  // Export JSON project file (Local Download)
  const handleExportJson = useCallback(() => {
    const projectData: FlowProjectExport = {
      version: CURRENT_PROJECT_VERSION,
      appName: 'ModuLoom Project',
      exportedAt: new Date().toISOString(),
      nodes,
      connections,
      customTypes,
      customDefinitions,
      viewport: { zoom, pan },
    };

    const jsonString = JSON.stringify(projectData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `moduloom-graph-${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setEditorHistory(markEditorDocumentSaved);
  }, [connections, customDefinitions, customTypes, nodes, pan, zoom]);

  // Load JSON project from local file
  const handleLoadProject = (project: FlowProjectExport) => {
    prevGraphSnapshotRef.current = { nodes: [], connections: [] };
    setEditorHistory((history) =>
      markEditorDocumentSaved(
        commitEditorDocument(history, {
          nodes: project.nodes || [],
          connections: project.connections || [],
          customTypes: Array.isArray(project.customTypes) ? project.customTypes : [],
          customDefinitions: Array.isArray(project.customDefinitions)
            ? project.customDefinitions
            : [],
        }),
      ),
    );
    if (project.viewport) {
      setZoom(project.viewport.zoom ?? 1.0);
      setPan(project.viewport.pan ?? { x: 60, y: 80 });
    }
    setStepIndex(null);
    setIsPlayingStep(false);
  };

  const handleUndo = useCallback(() => {
    setEditorHistory(undoEditorHistory);
    setStepIndex(null);
    setIsPlayingStep(false);
  }, []);

  const handleRedo = useCallback(() => {
    setEditorHistory(redoEditorHistory);
    setStepIndex(null);
    setIsPlayingStep(false);
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Project and history shortcuts. Form controls retain their native undo/redo behavior.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditing = Boolean(
        target?.closest('input, textarea, select, [contenteditable="true"]'),
      );
      const key = e.key.toLowerCase();
      if (!isEditing && (key === 'delete' || key === 'backspace')) {
        e.preventDefault();
        handleDeleteSelection();
        return;
      }
      if (!e.ctrlKey && !e.metaKey) return;
      if (!isEditing && key === 'a') {
        e.preventDefault();
        setSelectedNodeIds(new Set(nodes.map(({ id }) => id)));
      } else if (!isEditing && key === 'c') {
        e.preventDefault();
        handleCopySelection();
      } else if (!isEditing && key === 'v') {
        e.preventDefault();
        handlePasteSelection();
      } else if (!isEditing && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (!isEditing && key === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (key === 's') {
        e.preventDefault();
        handleExportJson();
      } else if (key === 'o') {
        e.preventDefault();
        setIsLoadModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleCopySelection,
    handleDeleteSelection,
    handleExportJson,
    handlePasteSelection,
    handleRedo,
    handleUndo,
    nodes,
  ]);

  // Zoom helpers
  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.15, 2.2));
  const handleZoomOut = () => setZoom((z) => Math.max(z * 0.85, 0.35));
  const handleResetZoom = () => {
    setZoom(1.0);
    setPan({ x: 60, y: 80 });
  };
  const handleFitView = () => {
    if (nodes.length === 0) {
      handleResetZoom();
      return;
    }
    const minX = Math.min(...nodes.map((n) => n.x));
    const maxX = Math.max(...nodes.map((n) => n.x + 240));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxY = Math.max(...nodes.map((n) => n.y + 200));

    const w = maxX - minX;
    const h = maxY - minY;
    const targetZoom = Math.min(1.2, Math.max(0.45, Math.min(800 / (w || 1), 500 / (h || 1))));
    setZoom(targetZoom);
    setPan({
      x: 100 - minX * targetZoom,
      y: 120 - minY * targetZoom,
    });
  };

  // Stepping controls
  const handleStepNext = () => {
    setIsPlayingStep(false);
    setStepIndex((prev) => {
      if (prev === null) return 0;
      if (prev + 1 >= topoOrder.length) return 0;
      return prev + 1;
    });
  };

  const handleResetStep = () => {
    setIsPlayingStep(false);
    setStepIndex(null);
  };

  const handleTogglePlayStep = () => {
    if (isPlayingStep) {
      setIsPlayingStep(false);
    } else {
      if (stepIndex === null || stepIndex >= topoOrder.length - 1) {
        setStepIndex(0);
      }
      setIsPlayingStep(true);
    }
  };

  // Generate TypeScript Code
  const generatedTypeScript = useMemo(() => {
    try {
      return {
        code: generateTypeScriptCode(nodes, connections, definitionsMap, customTypes),
        error: undefined,
      };
    } catch (error) {
      return {
        code: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [nodes, connections, definitionsMap, customTypes]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-100 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Toolbar */}
      <Toolbar
        onSelectPreset={handleSelectPreset}
        onClearGraph={handleClearGraph}
        onOpenLibrary={() => setIsLibraryOpen((o) => !o)}
        onOpenCustomTypeModal={() => setIsCustomTypeModalOpen(true)}
        onOpenCreateCompositeModal={() => setIsCreateCompositeOpen(true)}
        onExportJson={handleExportJson}
        onOpenLoadModal={() => setIsLoadModalOpen(true)}
        canUndo={editorHistory.past.length > 0}
        canRedo={editorHistory.future.length > 0}
        isDirty={isDirty}
        onUndo={handleUndo}
        onRedo={handleRedo}
        customTypes={customTypes}
        onOpenCodeExportModal={() => setIsCodeExportModalOpen(true)}
        onManualReevaluate={() => setManualEvalTrigger((t) => t + 1)}
        showDagViewer={showDagViewer}
        onToggleDagViewer={() => setShowDagViewer((v) => !v)}
        onOpenOnboarding={() => setShowOnboarding(true)}
        nodeCount={nodes.length}
      />

      <CanvasControls
        isLiveReactive={isLiveReactive}
        onToggleLiveReactive={() => setIsLiveReactive((value) => !value)}
        onRun={() => setManualEvalTrigger((value) => value + 1)}
        evalStats={evalStats}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onFitView={handleFitView}
      />

      {/* Main Canvas Workspace */}
      <main className="relative flex-1 w-full h-full pt-14">
        <Canvas
          nodes={nodes}
          connections={connections}
          definitions={definitionsMap}
          evaluation={evaluation}
          stepActiveNodeId={stepActiveNodeId}
          customTypes={customTypes}
          selectedNodeIds={selectedNodeIds}
          onSelectionChange={setSelectedNodeIds}
          onUpdateNodePositions={handleUpdateNodePositions}
          onFinishNodeDrag={handleFinishNodeDrag}
          onUpdateNodeState={handleUpdateNodeState}
          onUpdateNodeLabel={handleUpdateNodeLabel}
          onDeleteNode={handleDeleteNode}
          onReevaluateNode={handleReevaluateNode}
          onUnpackComposite={handleUnpackComposite}
          onAddConnection={handleAddConnection}
          onDeleteConnection={handleDeleteConnection}
          onCopySelection={handleCopySelection}
          onDuplicateSelection={handleDuplicateSelection}
          onDeleteSelection={handleDeleteSelection}
          onAlignSelection={handleAlignSelection}
          onDistributeSelection={handleDistributeSelection}
          zoom={zoom}
          pan={pan}
          onUpdateZoomPan={(newZoom, newPan) => {
            setZoom(newZoom);
            setPan(newPan);
          }}
          onOpenLibrary={() => setIsLibraryOpen(true)}
          onLoadStarterPreset={() => handleSelectPreset(STARTER_PRESET_ID)}
        />

        {showOnboarding && (
          <OnboardingGuide
            nodes={nodes}
            connections={connections}
            definitions={definitionsMap}
            evaluation={evaluation}
            onOpenLibrary={() => setIsLibraryOpen(true)}
            onLoadStarterPreset={() => handleSelectPreset(STARTER_PRESET_ID)}
            onSkip={() => hideOnboarding('skipped')}
            onComplete={() => hideOnboarding('completed')}
          />
        )}

        {/* Node Library Sidebar */}
        <NodeLibrary
          definitions={allDefinitions}
          customTypes={customTypes}
          onAddNode={handleAddNode}
          onOpenCustomNodeModal={() => setIsCustomModalOpen(true)}
          onOpenCustomTypeModal={() => setIsCustomTypeModalOpen(true)}
          onOpenCreateCompositeModal={() => setIsCreateCompositeOpen(true)}
          isOpen={isLibraryOpen}
          onToggleOpen={() => setIsLibraryOpen((o) => !o)}
        />

        {/* Floating DAG Topological Execution Visualizer */}
        {showDagViewer && nodes.length > 0 && (
          <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 z-30 max-w-2xl animate-in slide-in-from-bottom-2 duration-150">
            <TopologicalVisualizer
              order={topoOrder}
              hasCycle={hasCycle}
              nodes={nodes}
              definitions={definitionsMap}
              evaluation={evaluation}
              stepIndex={stepIndex}
              customTypes={customTypes}
              onStepNext={handleStepNext}
              onResetStep={handleResetStep}
              onTogglePlayStep={handleTogglePlayStep}
              isPlayingStep={isPlayingStep}
            />
          </div>
        )}
      </main>

      {/* Custom Pure Function Creator Modal */}
      <CustomNodeModal
        isOpen={isCustomModalOpen}
        onClose={() => setIsCustomModalOpen(false)}
        onSave={handleSaveCustomNode}
        customTypes={customTypes}
        customDefinitions={customDefinitions}
        onDelete={handleDeleteCustomNode}
      />

      {/* Project Load / Import Modal */}
      <LoadGraphModal
        isOpen={isLoadModalOpen}
        onClose={() => setIsLoadModalOpen(false)}
        onLoadProject={handleLoadProject}
        currentNodeCount={nodes.length}
      />

      {/* Custom Type System Creator Modal */}
      <CustomTypeModal
        isOpen={isCustomTypeModalOpen}
        onClose={() => setIsCustomTypeModalOpen(false)}
        customTypes={customTypes}
        onSaveType={(newType, autoAdd) => {
          handleSaveCustomType(newType, autoAdd);
        }}
        onDeleteType={handleDeleteCustomType}
      />

      {/* TypeScript Code Export Modal */}
      <CodeExportModal
        isOpen={isCodeExportModalOpen}
        onClose={() => setIsCodeExportModalOpen(false)}
        code={generatedTypeScript.code}
        error={generatedTypeScript.error}
      />

      {/* Composite Node Creator Modal */}
      <CreateCompositeModal
        isOpen={isCreateCompositeOpen}
        onClose={() => setIsCreateCompositeOpen(false)}
        nodes={nodes}
        connections={connections}
        definitions={definitionsMap}
        customTypes={customTypes}
        onSaveComposite={handleSaveComposite}
        onInsertSampleTerminalNodes={handleInsertTerminalSampleNodes}
      />
    </div>
  );
}
