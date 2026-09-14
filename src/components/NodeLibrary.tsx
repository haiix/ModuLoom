import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NodeDefinition, CustomTypeDefinition, getTypeStyle } from '../types';
import { getNodeCatalogSection, matchesNodeCatalogSearch } from '../nodes/nodeCatalog';
import {
  NODE_PALETTE_STORAGE_KEY,
  parseNodePalettePreferences,
  recordRecentNode,
  togglePinnedNode,
} from './browserPreferences';
import {
  getCompatibleDefinitions,
  getProjectDefinitions,
  getUsedDefinitions,
  resolveDefinitions,
  type SelectedPort,
} from './nodeLibraryModel';
import {
  Search,
  Plus,
  Sliders,
  Calculator,
  Type,
  Split,
  ListOrdered,
  Box,
  Eye,
  Sparkles,
  Code2,
  ChevronDown,
  ChevronRight,
  Boxes,
  Zap,
  Activity,
  Layers,
  Star,
  Clock3,
  Workflow,
  Cable,
  X,
} from 'lucide-react';

interface NodeLibraryProps {
  definitions: NodeDefinition[];
  customTypes?: CustomTypeDefinition[];
  onAddNode: (typeId: string) => void;
  onOpenCustomNodeModal: () => void;
  onOpenCustomTypeModal: () => void;
  onOpenCreateCompositeModal?: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  nodeTypeIds?: string[];
  selectedPort?: SelectedPort | null;
  onClearSelectedPort?: () => void;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Input: <Sliders className="w-4 h-4 text-amber-500" />,
  Math: <Calculator className="w-4 h-4 text-blue-500" />,
  String: <Type className="w-4 h-4 text-emerald-500" />,
  Logic: <Split className="w-4 h-4 text-violet-500" />,
  Array: <ListOrdered className="w-4 h-4 text-cyan-500" />,
  Object: <Box className="w-4 h-4 text-indigo-500" />,
  Async: <Zap className="w-4 h-4 text-orange-500" />,
  Stream: <Activity className="w-4 h-4 text-sky-500" />,
  Output: <Eye className="w-4 h-4 text-rose-500" />,
  Custom: <Sparkles className="w-4 h-4 text-amber-500" />,
  Composite: <Layers className="w-4 h-4 text-purple-500" />,
};

const CATEGORIES = [
  'Composite',
  'Input',
  'Math',
  'String',
  'Logic',
  'Array',
  'Object',
  'Async',
  'Stream',
  'Output',
  'Utility',
  'Custom',
] as const;

const CATALOG_SECTIONS = [
  { id: 'core', label: 'Core', description: '最初に使う基本ノード' },
  { id: 'advanced', label: 'Advanced', description: '必要に応じて使う高度なノード' },
  { id: 'examples', label: 'Examples', description: '学習用の定義とシミュレーション' },
  { id: 'project', label: 'Project', description: 'このプロジェクト固有のノード' },
] as const;

export const NodeLibrary: React.FC<NodeLibraryProps> = ({
  definitions,
  customTypes = [],
  onAddNode,
  onOpenCustomNodeModal,
  onOpenCustomTypeModal,
  onOpenCreateCompositeModal,
  isOpen,
  onToggleOpen,
  nodeTypeIds = [],
  selectedPort = null,
  onClearSelectedPort,
}) => {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [preferences, setPreferences] = useState(() => {
    try {
      return parseNodePalettePreferences(window.localStorage.getItem(NODE_PALETTE_STORAGE_KEY));
    } catch {
      return parseNodePalettePreferences(null);
    }
  });
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    advanced: true,
    examples: true,
  });

  const filteredDefinitions = definitions.filter((definition) =>
    matchesNodeCatalogSearch(definition, search),
  );

  const hasSearch = Boolean(search.trim());
  const pinnedDefinitions = useMemo(
    () => resolveDefinitions(definitions, preferences.pinnedTypeIds),
    [definitions, preferences.pinnedTypeIds],
  );
  const recentDefinitions = useMemo(
    () => resolveDefinitions(definitions, preferences.recentTypeIds),
    [definitions, preferences.recentTypeIds],
  );
  const usedDefinitions = useMemo(
    () => getUsedDefinitions(definitions, nodeTypeIds),
    [definitions, nodeTypeIds],
  );
  const projectDefinitions = useMemo(() => getProjectDefinitions(definitions), [definitions]);
  const compatibleDefinitions = useMemo(
    () =>
      selectedPort
        ? getCompatibleDefinitions(definitions, selectedPort, customTypes).slice(0, 12)
        : [],
    [customTypes, definitions, selectedPort],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(NODE_PALETTE_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Browser preferences are optional; the catalog remains fully available.
    }
  }, [preferences]);

  useEffect(() => {
    const handleQuickAdd = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key !== '/') return;
      event.preventDefault();
      if (!isOpen) onToggleOpen();
      requestAnimationFrame(() => searchRef.current?.focus());
    };
    window.addEventListener('keydown', handleQuickAdd);
    return () => window.removeEventListener('keydown', handleQuickAdd);
  }, [isOpen, onToggleOpen]);

  useEffect(() => {
    if (selectedPort && isOpen) {
      setSearch('');
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [isOpen, selectedPort]);

  const addNode = (typeId: string) => {
    onAddNode(typeId);
    setPreferences((previous) => recordRecentNode(previous, typeId));
  };

  const renderNodeRow = (definition: NodeDefinition) => {
    const outType = definition.outputs[0]?.type || definition.inputs[0]?.type || 'any';
    const isPinned = preferences.pinnedTypeIds.includes(definition.typeId);
    return (
      <div
        key={definition.typeId}
        className="group flex items-center rounded-lg bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800/70 hover:border-indigo-300 dark:hover:border-indigo-700/60 transition"
      >
        <button
          onClick={() => addNode(definition.typeId)}
          aria-label={`${definition.label}をキャンバスに配置`}
          className="min-w-0 flex-1 flex items-center justify-between p-2 text-left rounded-l-lg hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40"
          title={`${definition.label}をキャンバスに配置`}
        >
          <span className="flex items-start gap-2 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
              style={{ backgroundColor: getTypeStyle(outType, customTypes).color }}
            />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                {definition.label}
              </span>
              {definition.description && (
                <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {definition.description}
                </span>
              )}
            </span>
          </span>
          <Plus className="w-3 h-3 shrink-0 ml-1.5 text-indigo-600 dark:text-indigo-400" />
        </button>
        <button
          onClick={() =>
            setPreferences((previous) => togglePinnedNode(previous, definition.typeId))
          }
          aria-label={`${definition.label}をパレット${isPinned ? 'から外す' : 'に追加'}`}
          aria-pressed={isPinned}
          className="self-stretch px-2 rounded-r-lg text-slate-400 hover:text-amber-500 focus-visible:text-amber-500"
          title={isPinned ? 'パレットから外す' : 'パレットに追加'}
        >
          <Star className={`w-3.5 h-3.5 ${isPinned ? 'fill-amber-400 text-amber-500' : ''}`} />
        </button>
      </div>
    );
  };

  const quickSections = [
    { id: 'palette', label: 'パレット', icon: Star, items: pinnedDefinitions },
    { id: 'recent', label: '最近使ったノード', icon: Clock3, items: recentDefinitions },
    { id: 'used', label: 'このプロジェクトで使用中', icon: Workflow, items: usedDefinitions },
    { id: 'project-only', label: 'このプロジェクト固有', icon: Boxes, items: projectDefinitions },
  ];

  return (
    <div
      role="complementary"
      aria-label="ノードライブラリ"
      className={`fixed top-16 left-2 right-2 sm:left-4 sm:right-auto z-40 flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl transition-all duration-200 overflow-hidden ${
        isOpen ? 'w-auto sm:w-80 max-h-[calc(100vh-5rem)]' : 'right-auto w-12 h-12'
      }`}
    >
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50">
        <button
          onClick={onToggleOpen}
          aria-label={isOpen ? 'ノードライブラリを閉じる' : 'ノードライブラリを開く'}
          className="flex items-center gap-2 text-slate-800 dark:text-slate-100 hover:opacity-80 transition font-medium text-xs"
        >
          <Box className="w-4 h-4 text-indigo-500" />
          {isOpen && <span>ノードライブラリ</span>}
        </button>

        {isOpen && (
          <div className="flex items-center gap-1.5">
            {onOpenCreateCompositeModal && (
              <button
                onClick={onOpenCreateCompositeModal}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 hover:bg-purple-100 border border-purple-200 dark:border-purple-800 transition"
                title="グループ出力端子から入力を遡って複合ノード化（フォーム入力値の部分適用対応）"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>複合化</span>
              </button>
            )}
            <button
              onClick={onOpenCustomTypeModal}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-pink-50 dark:bg-pink-950/60 text-pink-600 dark:text-pink-400 hover:bg-pink-100 border border-pink-200 dark:border-pink-800 transition"
              title="独自のカスタム型（Interface）を定義"
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>型定義</span>
            </button>
            <button
              onClick={onOpenCustomNodeModal}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 transition"
              title="独自の純粋関数を定義してノードに追加"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>自作ノード</span>
            </button>
          </div>
        )}
      </div>

      {isOpen && (
        <>
          <div className="p-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 w-3.5 h-3.5 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                placeholder="ノードを検索 (例: add, API, debug)..."
                aria-label="ノードを検索"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onMouseDown={(event) => event.stopPropagation()}
                onMouseUp={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                onKeyUp={(event) => event.stopPropagation()}
                onWheel={(event) => event.stopPropagation()}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="p-2 overflow-y-auto space-y-2 flex-1 scrollbar-thin">
            {!hasSearch && selectedPort && (
              <section
                aria-label="接続可能候補"
                className="rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/20"
              >
                <div className="flex items-center justify-between px-2.5 py-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                      <Cable className="w-3.5 h-3.5" />
                      接続可能候補 ({compatibleDefinitions.length})
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {selectedPort.name} ({selectedPort.type}) の
                      {selectedPort.direction === 'output' ? '接続先' : '入力元'}
                    </div>
                  </div>
                  <button
                    onClick={onClearSelectedPort}
                    aria-label="接続可能候補を閉じる"
                    className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="px-1.5 pb-1.5 space-y-1">
                  {compatibleDefinitions.map(renderNodeRow)}
                  {compatibleDefinitions.length === 0 && (
                    <p className="px-2 pb-1 text-[11px] text-slate-500">互換ノードはありません。</p>
                  )}
                </div>
              </section>
            )}

            {!hasSearch &&
              quickSections.map(({ id, label, icon: Icon, items }) => (
                <section key={id} aria-labelledby={`node-library-${id}`}>
                  <div
                    id={`node-library-${id}`}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label} ({items.length})
                  </div>
                  <div className="space-y-1">
                    {items.map(renderNodeRow)}
                    {id === 'palette' && items.length === 0 && (
                      <p className="px-2 py-1 text-[11px] text-slate-400">
                        星印でよく使うノードを追加できます。
                      </p>
                    )}
                  </div>
                </section>
              ))}

            <div className="px-2 pt-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
              すべてのノード
            </div>
            {CATALOG_SECTIONS.map((section) => {
              const sectionItems = filteredDefinitions.filter(
                (definition) => getNodeCatalogSection(definition) === section.id,
              );
              if (sectionItems.length === 0 && (hasSearch || section.id !== 'project')) return null;
              const isSectionCollapsed = hasSearch
                ? false
                : (collapsedSections[section.id] ?? false);

              return (
                <section
                  key={section.id}
                  aria-labelledby={`node-library-${section.id}`}
                  className="rounded-lg border border-slate-200/80 dark:border-slate-800"
                >
                  <button
                    id={`node-library-${section.id}`}
                    onClick={() =>
                      setCollapsedSections((previous) => ({
                        ...previous,
                        [section.id]: !previous[section.id],
                      }))
                    }
                    aria-expanded={!isSectionCollapsed}
                    className="w-full flex items-center justify-between px-2.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {section.label}{' '}
                        <span className="text-[10px] font-normal text-slate-400">
                          ({sectionItems.length})
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {section.description}
                      </div>
                    </div>
                    {isSectionCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {!isSectionCollapsed && (
                    <div className="px-1.5 pb-1.5 space-y-1.5">
                      {sectionItems.length === 0 && (
                        <p className="px-2 py-1 text-[11px] text-slate-400">
                          自作ノード、カスタム型、複合ノードがここに表示されます。
                        </p>
                      )}
                      {CATEGORIES.map((category) => {
                        const items = sectionItems.filter(
                          (definition) => definition.category === category,
                        );
                        if (items.length === 0) return null;
                        const categoryKey = `${section.id}:${category}`;
                        const isCategoryCollapsed = hasSearch
                          ? false
                          : (collapsedCategories[categoryKey] ?? false);

                        return (
                          <div key={categoryKey} className="space-y-1">
                            <button
                              onClick={() =>
                                setCollapsedCategories((previous) => ({
                                  ...previous,
                                  [categoryKey]: !previous[categoryKey],
                                }))
                              }
                              aria-expanded={!isCategoryCollapsed}
                              className="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                            >
                              <div className="flex items-center gap-1.5">
                                {CATEGORY_ICONS[category] || <Box className="w-3.5 h-3.5" />}
                                <span>{category}</span>
                                <span className="text-[10px] text-slate-400">({items.length})</span>
                              </div>
                              {isCategoryCollapsed ? (
                                <ChevronRight className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>

                            {!isCategoryCollapsed && (
                              <div className="space-y-1 pl-1">{items.map(renderNodeRow)}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
