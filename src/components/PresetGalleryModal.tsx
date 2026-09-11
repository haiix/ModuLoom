import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Plus, Search, Sparkles, X } from 'lucide-react';
import type { GraphPreset } from '../types';

interface PresetGalleryModalProps {
  isOpen: boolean;
  presets: GraphPreset[];
  hasCurrentContent: boolean;
  onClose: () => void;
  onOpenAsNew: (preset: GraphPreset) => string | undefined;
  onInsert: (preset: GraphPreset) => string | undefined;
}

const difficultyLabels = {
  beginner: '入門',
  intermediate: '中級',
  advanced: '上級',
} as const;

function PresetPreview({ preset }: { preset: GraphPreset }) {
  const bounds = useMemo(() => {
    const xs = preset.nodes.map((node) => node.x);
    const ys = preset.nodes.map((node) => node.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      width: Math.max(Math.max(...xs) - Math.min(...xs), 1),
      height: Math.max(Math.max(...ys) - Math.min(...ys), 1),
    };
  }, [preset]);
  const point = (nodeId: string) => {
    const node = preset.nodes.find(({ id }) => id === nodeId)!;
    return {
      x: 12 + ((node.x - bounds.minX) / bounds.width) * 176,
      y: 10 + ((node.y - bounds.minY) / bounds.height) * 60,
    };
  };

  return (
    <svg viewBox="0 0 200 80" role="img" aria-label={`${preset.title}のグラフプレビュー`}>
      {preset.connections.map((connection) => {
        const from = point(connection.fromNodeId);
        const to = point(connection.toNodeId);
        return (
          <line
            key={connection.id}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            className="stroke-indigo-300 dark:stroke-indigo-700"
            strokeWidth="1.5"
          />
        );
      })}
      {preset.nodes.map((node) => {
        const position = point(node.id);
        return (
          <rect
            key={node.id}
            x={position.x - 5}
            y={position.y - 4}
            width="10"
            height="8"
            rx="2"
            className="fill-indigo-600 dark:fill-indigo-400"
          />
        );
      })}
    </svg>
  );
}

export function PresetGalleryModal({
  isOpen,
  presets,
  hasCurrentContent,
  onClose,
  onOpenAsNew,
  onInsert,
}: PresetGalleryModalProps) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const filteredPresets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return presets;
    return presets.filter((preset) =>
      [
        preset.title,
        preset.description,
        preset.expectedResult,
        ...preset.tags,
        ...preset.learningGoals,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [presets, query]);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    searchRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const runAction = (action: () => string | undefined) => {
    const nextError = action();
    if (nextError) setError(nextError);
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-3">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-gallery-title"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <header className="flex items-start gap-3 border-b border-slate-200 p-5 dark:border-slate-700">
          <span className="rounded-xl bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="preset-gallery-title" className="font-bold">
              サンプルギャラリー
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              内容を置き換える「新規として開く」と、現在のキャンバスへ追加する「挿入」を選べます。
              どちらもUndoできます。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="サンプルギャラリーを閉じる"
            className="rounded-lg p-2 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="border-b border-slate-200 p-4 dark:border-slate-700">
          <label className="relative block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <span className="sr-only">サンプルを検索</span>
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="タイトル、学べる内容、タグから検索"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950 dark:text-red-300"
            >
              {error}
            </p>
          )}
        </div>

        <div className="grid gap-4 overflow-y-auto p-4 md:grid-cols-2">
          {filteredPresets.map((preset) => {
            const requiredTypes = preset.dependencies?.customTypes?.map(({ name }) => name) ?? [];
            const usedTypes = [...new Set(preset.nodes.map(({ typeId }) => typeId))];
            return (
              <article
                key={preset.id}
                data-preset-id={preset.id}
                className="flex flex-col rounded-xl border border-slate-200 p-4 dark:border-slate-700"
              >
                <div className="mb-3 rounded-lg bg-slate-50 p-2 dark:bg-slate-950">
                  <PresetPreview preset={preset} />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold">{preset.title}</h3>
                  <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {difficultyLabels[preset.difficulty]}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  {preset.description}
                </p>
                <dl className="mt-3 space-y-2 text-[11px]">
                  <div>
                    <dt className="font-semibold text-slate-500">学べる内容</dt>
                    <dd>{preset.learningGoals.join('／')}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">想定結果</dt>
                    <dd>{preset.expectedResult}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-slate-500">使用ノード・必要な型</dt>
                    <dd>
                      {usedTypes.length}種類・{preset.nodes.length}ノード
                      {requiredTypes.length > 0
                        ? `／${requiredTypes.join('、')}`
                        : '／追加の型なし'}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-1">
                  {preset.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-800"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-auto flex gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        hasCurrentContent &&
                        !window.confirm(
                          '現在のノード、接続、プロジェクト固有定義をこのサンプルで置き換えます。続行しますか？（Undoで戻せます）',
                        )
                      )
                        return;
                      runAction(() => onOpenAsNew(preset));
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-600 dark:hover:bg-slate-800"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" /> 新規として開く
                  </button>
                  <button
                    type="button"
                    onClick={() => runAction(() => onInsert(preset))}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" /> 挿入
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
