import React, { useState } from 'react';
import { PRESETS } from '../nodes/definitions';
import { TYPE_CONFIG, DataType, CustomTypeDefinition } from '../types';
import {
  Play,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Code2,
  Trash2,
  Sparkles,
  GitCommit,
  Plus,
  Info,
  Layers,
  ChevronDown,
  Boxes,
  Download,
  Upload,
  Zap,
} from 'lucide-react';

interface ToolbarProps {
  onSelectPreset: (presetId: string) => void;
  onClearGraph: () => void;
  onOpenLibrary: () => void;
  onOpenCustomTypeModal: () => void;
  onExportJson: () => void;
  onOpenLoadModal: () => void;
  customTypes: CustomTypeDefinition[];
  onOpenCodeExportModal: () => void;
  onOpenCreateCompositeModal?: () => void;
  isLiveReactive: boolean;
  onToggleLiveReactive: () => void;
  onManualReevaluate: () => void;
  evalStats?: {
    dirtyCount: number;
    totalCount: number;
    lastDirtyNodeIds: string[];
  };
  showDagViewer: boolean;
  onToggleDagViewer: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitView: () => void;
  nodeCount?: number;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onSelectPreset,
  onClearGraph,
  onOpenLibrary,
  onOpenCustomTypeModal,
  onExportJson,
  onOpenLoadModal,
  customTypes,
  onOpenCodeExportModal,
  onOpenCreateCompositeModal,
  isLiveReactive,
  onToggleLiveReactive,
  onManualReevaluate,
  evalStats,
  showDagViewer,
  onToggleDagViewer,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitView,
  nodeCount = 0,
}) => {
  const [showTypeLegend, setShowTypeLegend] = useState(false);
  const [showPresetsMenu, setShowPresetsMenu] = useState(false);

  const dataTypes: DataType[] = ['number', 'string', 'boolean', 'array', 'object', 'any'];

  return (
    <header className="fixed top-0 left-0 right-0 z-30 h-14 px-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-xs">
      {/* Left: Branding & Presets */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-600 text-white shadow-xs">
            <GitCommit className="w-5 h-5 rotate-90" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-slate-900 dark:text-slate-100 tracking-tight">
                ModuLoom
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 font-semibold border border-indigo-200 dark:border-indigo-800">
                Pure Functions
              </span>
            </div>
          </div>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block" />

        {/* Node Library Trigger */}
        <button
          onClick={onOpenLibrary}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
        >
          <Plus className="w-3.5 h-3.5 text-indigo-500" />
          <span className="hidden sm:inline">ノードを追加</span>
        </button>

        {/* Custom Type Manager Trigger */}
        <button
          onClick={onOpenCustomTypeModal}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 hover:bg-pink-100 dark:hover:bg-pink-900/60 border border-pink-200 dark:border-pink-800 transition shadow-2xs"
          title="カスタム型（Interface）の作成と管理"
        >
          <Boxes className="w-3.5 h-3.5 text-pink-500" />
          <span className="hidden sm:inline">カスタム型定義</span>
        </button>

        {/* Project File Operations: Save (Download) & Load (Upload) */}
        <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 overflow-hidden text-xs">
          <button
            onClick={onExportJson}
            className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition font-medium border-r border-slate-200 dark:border-slate-700"
            title="プロジェクトをJSON形式でローカルに保存（ダウンロード） [Ctrl+S]"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden md:inline">保存</span>
          </button>

          <button
            onClick={onOpenLoadModal}
            className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition font-medium"
            title="保存したJSONファイルを読み込み [Ctrl+O]"
          >
            <Upload className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden md:inline">読み込み</span>
          </button>
        </div>

        {/* Preset Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowPresetsMenu(!showPresetsMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-50 dark:bg-slate-850 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>サンプルプリセット</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </button>

          {showPresetsMenu && (
            <div
              className="absolute left-0 top-full mt-1.5 w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
              onMouseLeave={() => setShowPresetsMenu(false)}
            >
              <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                プリセットを選択
              </div>
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    onSelectPreset(preset.id);
                    setShowPresetsMenu(false);
                  }}
                  className="w-full text-left p-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                >
                  <div className="text-xs font-medium">{preset.title}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">
                    {preset.description}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center: Reactive Engine & DAG Stepper */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleLiveReactive}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
            isLiveReactive
              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
          }`}
          title="入力変更時に自動で依存関係をリアルタイム再計算"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isLiveReactive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
            }`}
          />
          <span>リアクティブ評価: {isLiveReactive ? 'ON' : 'OFF'}</span>
        </button>

        {evalStats && evalStats.totalCount > 0 && isLiveReactive && (
          <span
            className={`hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono border transition ${
              evalStats.dirtyCount < evalStats.totalCount
                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/80'
                : 'bg-slate-50 dark:bg-slate-850 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
            }`}
            title={`差分評価: 変更のあったノードと下流ノード(${evalStats.dirtyCount}件)のみを再計算し、影響のないノード(${evalStats.totalCount - evalStats.dirtyCount}件)はキャッシュを再利用しています`}
          >
            <Zap
              className={`w-3 h-3 shrink-0 ${evalStats.dirtyCount < evalStats.totalCount ? 'text-blue-500 animate-pulse' : 'text-slate-400'}`}
            />
            <span>
              {evalStats.dirtyCount < evalStats.totalCount
                ? `差分再計算: ${evalStats.dirtyCount}/${evalStats.totalCount} ノード`
                : `全ノード実行 (${evalStats.totalCount})`}
            </span>
          </span>
        )}

        {!isLiveReactive && (
          <button
            onClick={onManualReevaluate}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition shadow-xs"
            title="グラフを手動実行"
          >
            <Play className="w-3.5 h-3.5" />
            <span>実行</span>
          </button>
        )}

        <button
          onClick={onToggleDagViewer}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
            showDagViewer
              ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800'
              : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
          }`}
          title="トポロジカル実行順序とステップ実行バーを表示"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="hidden md:inline">DAG実行順序</span>
        </button>
      </div>

      {/* Right: Code Generation, Zoom, Types */}
      <div className="flex items-center gap-2">
        {/* Type System Legend Popover */}
        <div className="relative">
          <button
            onClick={() => setShowTypeLegend(!showTypeLegend)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="型カラー定義の確認"
          >
            <Info className="w-4 h-4" />
          </button>

          {showTypeLegend && (
            <div
              className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-3 z-50 text-xs space-y-2 animate-in fade-in duration-100"
              onMouseLeave={() => setShowTypeLegend(false)}
            >
              <div className="font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 pb-1.5">
                型システムカラー (DataType)
              </div>
              <div className="space-y-1.5">
                {dataTypes.map((t) => (
                  <div key={t} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: TYPE_CONFIG[t].color }}
                      />
                      <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        {t}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">{t === 'any' ? '変換用' : t}</span>
                  </div>
                ))}
              </div>

              {customTypes.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                  <div className="font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                    定義済みカスタム型 ({customTypes.length})
                  </div>
                  {customTypes.map((ct) => (
                    <div key={ct.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: ct.color }}
                        />
                        <span className="font-mono font-medium text-[11px] text-slate-800 dark:text-slate-200">
                          {ct.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">{ct.fields.length} fields</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
                ※ 同型または `any` のみ接続可能です
              </div>
            </div>
          )}
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden text-xs">
          <button
            onClick={onZoomOut}
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            title="縮小"
          >
            <ZoomOut className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
          </button>
          <button
            onClick={onResetZoom}
            className="px-2 py-1 font-mono text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            title="100%にリセット"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={onZoomIn}
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            title="拡大"
          >
            <ZoomIn className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
          </button>
          <button
            onClick={onFitView}
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 transition border-l border-slate-200 dark:border-slate-700"
            title="全体をキャンバスにフィット"
          >
            <Maximize2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
          </button>
        </div>

        {/* Create Composite Node from Terminals */}
        {onOpenCreateCompositeModal && (
          <button
            onClick={onOpenCreateCompositeModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition"
            title="グループ出力端子から入力を遡って複合ノード化（フォーム入力値の部分適用対応）"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">複合ノード化</span>
          </button>
        )}

        {/* Export TS Code */}
        <button
          onClick={onOpenCodeExportModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition"
          title="TypeScriptの純粋関数コードを出力"
        >
          <Code2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">TSコード出力</span>
        </button>

        {/* Clear graph */}
        <button
          onClick={onClearGraph}
          disabled={nodeCount === 0}
          className={`p-1.5 rounded-lg transition ${
            nodeCount === 0
              ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-40'
              : 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 cursor-pointer'
          }`}
          title={nodeCount === 0 ? 'キャンバスは空です' : 'キャンバスの全ノードと接続を消去'}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
