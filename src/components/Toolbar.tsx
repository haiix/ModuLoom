import React, { useEffect, useRef, useState } from 'react';
import {
  Boxes,
  CircleHelp,
  ChevronDown,
  Code2,
  Download,
  GitCommit,
  Info,
  Layers,
  MoreHorizontal,
  Play,
  Plus,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react';
import { DataType, type CustomTypeDefinition, getTypeStyle } from '../types';
import { getToolbarPresentation } from './toolbarLayout';
import type { DebouncedSaveStatus } from '../engine/debouncedSave';

interface ToolbarProps {
  onOpenPresetGallery: () => void;
  onClearGraph: () => void;
  onOpenLibrary: () => void;
  onOpenCustomTypeModal: () => void;
  onExportJson: () => void;
  onOpenLoadModal: () => void;
  customTypes: CustomTypeDefinition[];
  onOpenCodeExportModal: () => void;
  onOpenCreateCompositeModal?: () => void;
  onManualReevaluate: () => void;
  showDagViewer: boolean;
  onToggleDagViewer: () => void;
  onOpenOnboarding: () => void;
  nodeCount?: number;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  browserSaveStatus: DebouncedSaveStatus;
  onUndo: () => void;
  onRedo: () => void;
}

const primaryBase =
  'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
const primary = `${primaryBase} border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800`;

export const Toolbar: React.FC<ToolbarProps> = ({
  onOpenPresetGallery,
  onClearGraph,
  onOpenLibrary,
  onOpenCustomTypeModal,
  onExportJson,
  onOpenLoadModal,
  customTypes,
  onOpenCodeExportModal,
  onOpenCreateCompositeModal,
  onManualReevaluate,
  showDagViewer,
  onToggleDagViewer,
  onOpenOnboarding,
  nodeCount = 0,
  canUndo,
  canRedo,
  isDirty,
  browserSaveStatus,
  onUndo,
  onRedo,
}) => {
  const [width, setWidth] = useState(() => window.innerWidth);
  const [showMore, setShowMore] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const presentation = getToolbarPresentation(width);
  const dataTypes: DataType[] = [
    'number',
    'string',
    'boolean',
    'array',
    'object',
    'promise',
    'stream',
    'any',
  ];
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  useEffect(() => {
    if (!showMore) return;
    moreMenuRef.current?.querySelector<HTMLElement>('select, button, summary')?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowMore(false);
        moreButtonRef.current?.focus();
      }
    };
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (moreMenuRef.current?.contains(target) || moreButtonRef.current?.contains(target)) return;
      setShowMore(false);
    };
    window.addEventListener('keydown', close);
    document.addEventListener('pointerdown', closeOnOutsidePointerDown);
    return () => {
      window.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown);
    };
  }, [showMore]);
  const label = (text: string) => (presentation.showActionLabels ? <span>{text}</span> : null);
  const closeAndRun = (action: () => void) => {
    setShowMore(false);
    action();
  };
  return (
    <header className="fixed inset-x-0 top-0 z-[60] flex h-14 items-center gap-2 overflow-visible border-b border-slate-200 bg-white/95 px-2 shadow-xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 sm:px-3">
      <div className="flex min-w-0 shrink items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <GitCommit className="h-5 w-5 rotate-90" aria-hidden="true" />
        </div>
        {presentation.showBrandLabel && (
          <span className="whitespace-nowrap text-sm font-bold">ModuLoom</span>
        )}
        {isDirty && (
          <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            {presentation.showActionLabels && 'JSON未書き出し'}
          </span>
        )}
        <span
          role="status"
          aria-live="polite"
          className={`shrink-0 text-[10px] font-medium ${
            browserSaveStatus === 'error'
              ? 'text-red-600 dark:text-red-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {browserSaveStatus === 'pending' || browserSaveStatus === 'saving'
            ? '保存中'
            : browserSaveStatus === 'saved'
              ? 'ブラウザに保存済み'
              : browserSaveStatus === 'error'
                ? '自動保存に失敗'
                : 'ブラウザ保存待機'}
        </span>
      </div>
      <nav className="ml-auto flex shrink-0 items-center gap-1.5" aria-label="主要操作">
        <PrimaryButton
          icon={<Plus />}
          text="ノード追加"
          ariaLabel="ノードを追加"
          showLabel={presentation.showActionLabels}
          onClick={onOpenLibrary}
        />
        <PrimaryButton
          icon={<Download />}
          text="保存"
          ariaLabel="プロジェクトを保存"
          showLabel={presentation.showActionLabels}
          onClick={onExportJson}
        />
        <PrimaryButton
          icon={<Upload />}
          text="読み込み"
          ariaLabel="プロジェクトを読み込み"
          showLabel={presentation.showActionLabels}
          onClick={onOpenLoadModal}
        />
        <button
          className={`${primaryBase} border-indigo-600 bg-indigo-600 text-white hover:border-indigo-700 hover:bg-indigo-700 dark:border-indigo-500 dark:bg-indigo-600 dark:text-white dark:hover:border-indigo-400 dark:hover:bg-indigo-500`}
          onClick={onManualReevaluate}
          aria-label="グラフを実行"
          title="グラフを実行"
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          {label('実行')}
        </button>
      </nav>
      <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <button
          className="p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-30"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="元に戻す"
          title="元に戻す [Ctrl/Cmd+Z]"
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          className="border-l border-slate-200 p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-30 dark:border-slate-700"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="やり直す"
          title="やり直す [Ctrl/Cmd+Shift+Z / Ctrl+Y]"
        >
          <Redo2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="relative shrink-0">
        <button
          ref={moreButtonRef}
          className={primary}
          onClick={() => setShowMore((value) => !value)}
          aria-label="その他の操作"
          aria-haspopup="menu"
          aria-expanded={showMore}
          title="その他の操作"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          {presentation.showActionLabels && <ChevronDown className="h-3 w-3" />}
        </button>
        {showMore && (
          <div
            ref={moreMenuRef}
            role="menu"
            aria-label="その他の操作"
            className="absolute right-0 top-full mt-2 max-h-[calc(100vh-5rem)] w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <MenuButton
              icon={<Sparkles />}
              label="サンプルギャラリー"
              onClick={() => closeAndRun(onOpenPresetGallery)}
            />
            <MenuButton
              icon={<Boxes />}
              label={`カスタム型 (${customTypes.length})`}
              onClick={() => closeAndRun(onOpenCustomTypeModal)}
            />
            {onOpenCreateCompositeModal && (
              <MenuButton
                icon={<Layers />}
                label="複合ノード化"
                onClick={() => closeAndRun(onOpenCreateCompositeModal)}
              />
            )}
            <MenuButton
              icon={<Code2 />}
              label="TypeScriptコード出力"
              onClick={() => closeAndRun(onOpenCodeExportModal)}
            />
            <MenuButton
              icon={<Layers />}
              label={showDagViewer ? 'DAG実行デバッガーを閉じる' : 'DAG実行デバッガーを表示'}
              onClick={() => closeAndRun(onToggleDagViewer)}
            />
            <MenuButton
              icon={<CircleHelp />}
              label="はじめてガイドを表示"
              onClick={() => closeAndRun(onOpenOnboarding)}
            />
            <details className="group rounded-lg px-2 py-1 text-xs">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                <Info className="h-4 w-4" aria-hidden="true" />
                <span>型カラー凡例</span>
                <ChevronDown
                  className="ml-auto h-3 w-3 transition group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                {dataTypes.map((type) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-mono text-[11px]">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: getTypeStyle(type, customTypes).color }}
                      />
                      {type}
                    </span>
                  </div>
                ))}
                {customTypes.map((customType) => (
                  <div key={customType.id} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 font-mono text-[11px]">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: customType.color }}
                      />
                      <span className="truncate">{customType.name}</span>
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {customType.fields.length} fields
                    </span>
                  </div>
                ))}
              </div>
            </details>
            <MenuButton
              icon={<Trash2 />}
              label="キャンバスを全消去"
              disabled={nodeCount === 0}
              danger
              onClick={() => closeAndRun(onClearGraph)}
            />
          </div>
        )}
      </div>
    </header>
  );
};

function PrimaryButton({
  icon,
  text,
  ariaLabel,
  showLabel,
  onClick,
}: {
  icon: React.ReactElement<{ className?: string; 'aria-hidden'?: boolean }>;
  text: string;
  ariaLabel: string;
  showLabel: boolean;
  onClick: () => void;
}) {
  return (
    <button className={primary} onClick={onClick} aria-label={ariaLabel} title={ariaLabel}>
      {React.cloneElement(icon, {
        className: 'h-4 w-4 text-indigo-500',
        'aria-hidden': true,
      })}
      {showLabel && <span>{text}</span>}
    </button>
  );
}

function MenuButton({
  icon,
  label,
  onClick,
  disabled,
  danger = false,
}: {
  icon: React.ReactElement<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-30 dark:hover:bg-slate-800 ${danger ? 'text-red-600' : ''}`}
    >
      {React.cloneElement(icon, { className: 'h-4 w-4', 'aria-hidden': true })}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}
