import React, { useState } from 'react';
import { NodeDefinition, CustomTypeDefinition, getTypeStyle } from '../types';
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

export const NodeLibrary: React.FC<NodeLibraryProps> = ({
  definitions,
  customTypes = [],
  onAddNode,
  onOpenCustomNodeModal,
  onOpenCustomTypeModal,
  onOpenCreateCompositeModal,
  isOpen,
  onToggleOpen,
}) => {
  const [search, setSearch] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const categories = ['Composite', 'Input', 'Math', 'String', 'Logic', 'Array', 'Object', 'Async', 'Stream', 'Output', 'Custom'];

  const filteredDefs = definitions.filter((def) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      def.label.toLowerCase().includes(q) ||
      def.category.toLowerCase().includes(q) ||
      (def.description && def.description.toLowerCase().includes(q))
    );
  });

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div
      className={`fixed top-16 left-4 z-40 flex flex-col bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl transition-all duration-200 overflow-hidden ${
        isOpen ? 'w-80 max-h-[calc(100vh-5rem)]' : 'w-12 h-12'
      }`}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50">
        <button
          onClick={onToggleOpen}
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
          {/* Search Input */}
          <div className="p-2.5 border-b border-slate-100 dark:border-slate-800">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="ノードを検索 (例: add, text, if)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onKeyUp={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Categorized node lists */}
          <div className="p-2 overflow-y-auto space-y-2 flex-1 scrollbar-thin">
            {categories.map((cat) => {
              const items = filteredDefs.filter((d) => d.category === cat);
              if (items.length === 0) return null;

              const isCollapsed = collapsedCategories[cat];

              return (
                <div key={cat} className="space-y-1">
                  <button
                    onClick={() => toggleCategory(cat)}
                    className="w-full flex items-center justify-between px-2 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                  >
                    <div className="flex items-center gap-1.5">
                      {CATEGORY_ICONS[cat] || <Box className="w-3.5 h-3.5" />}
                      <span>{cat}</span>
                      <span className="text-[10px] text-slate-400">({items.length})</span>
                    </div>
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {!isCollapsed && (
                    <div className="space-y-1 pl-1">
                      {items.map((def) => {
                        const outType = def.outputs[0]?.type || def.inputs[0]?.type || 'any';
                        return (
                          <div
                            key={def.typeId}
                            onClick={() => onAddNode(def.typeId)}
                            className="group flex items-center justify-between p-2 rounded-lg bg-slate-50/70 dark:bg-slate-800/50 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/40 border border-slate-200/70 dark:border-slate-800/70 hover:border-indigo-300 dark:hover:border-indigo-700/60 cursor-pointer transition"
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                                style={{ backgroundColor: getTypeStyle(outType, customTypes).color }}
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                                  {def.label}
                                </div>
                                {def.description && (
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {def.description}
                                  </div>
                                )}
                              </div>
                            </div>
                            <button
                              className="opacity-0 group-hover:opacity-100 p-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 transition shrink-0 ml-1.5"
                              title="キャンバスに配置"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
