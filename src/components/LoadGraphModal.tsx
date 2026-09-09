import React, { useState, useRef } from 'react';
import { FlowProjectExport } from '../types';
import { Upload, AlertCircle, CheckCircle2, X, AlertTriangle } from 'lucide-react';
import { parseFlowProjectJson } from '../engine/projectFormat';
import { canApplyProject, projectRequiresCodeTrust } from '../engine/projectTrust';

interface LoadGraphModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadProject: (project: FlowProjectExport) => void;
  currentNodeCount: number;
}

export const LoadGraphModal: React.FC<LoadGraphModalProps> = ({
  isOpen,
  onClose,
  onLoadProject,
  currentNodeCount,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [previewProject, setPreviewProject] = useState<FlowProjectExport | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [trustConfirmed, setTrustConfirmed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    setError(null);
    setPreviewProject(null);
    setFileName(file.name);
    setTrustConfirmed(false);

    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      setError('JSONファイル (.json) を選択してください。');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const project = parseFlowProjectJson(text);

        setPreviewProject(project);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'ファイルの解析に失敗しました。');
      }
    };
    reader.onerror = () => {
      setError('ファイルの読み込み中にエラーが発生しました。');
    };
    reader.readAsText(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleApply = () => {
    if (previewProject && canApplyProject(previewProject, trustConfirmed)) {
      onLoadProject(previewProject);
      handleClose();
    }
  };

  const handleClose = () => {
    setPreviewProject(null);
    setError(null);
    setFileName('');
    setTrustConfirmed(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden text-slate-800 dark:text-slate-100 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">プロジェクトファイルを読み込み</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                保存した `.json` ファイルからノードグラフとカスタム型を復元します
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-sm">
          {/* File Drop Area */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
              dragActive
                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 bg-slate-50/50 dark:bg-slate-850/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              }}
            />
            <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-1">
              <Upload className="w-6 h-6" />
            </div>
            <p className="font-medium text-slate-700 dark:text-slate-200 text-xs sm:text-sm">
              ここに JSON ファイルをドラッグ＆ドロップ
            </p>
            <p className="text-xs text-slate-400">または クリックしてファイルを選択</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">読み込みエラー</div>
                <div>{error}</div>
              </div>
            </div>
          )}

          {/* Parsed Preview */}
          {previewProject && (
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-semibold text-xs">
                <CheckCircle2 className="w-4 h-4" />
                <span>正常に解析されました: {fileName}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-emerald-200/50 dark:border-emerald-800/30 text-center">
                  <div className="text-slate-400 text-[10px]">ノード数</div>
                  <div className="font-mono font-bold text-slate-800 dark:text-slate-100 text-sm">
                    {previewProject.nodes.length}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-emerald-200/50 dark:border-emerald-800/30 text-center">
                  <div className="text-slate-400 text-[10px]">ワイヤー数</div>
                  <div className="font-mono font-bold text-slate-800 dark:text-slate-100 text-sm">
                    {previewProject.connections.length}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-emerald-200/50 dark:border-emerald-800/30 text-center">
                  <div className="text-slate-400 text-[10px]">カスタム型数</div>
                  <div className="font-mono font-bold text-slate-800 dark:text-slate-100 text-sm">
                    {previewProject.customTypes?.length || 0}
                  </div>
                </div>
              </div>

              {currentNodeCount > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    ※ 現在のキャンバス上のノード（{currentNodeCount}個）は置き換えられます
                  </span>
                </div>
              )}

              {projectRequiresCodeTrust(previewProject) && (
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  <input
                    type="checkbox"
                    checked={trustConfirmed}
                    onChange={(event) => setTrustConfirmed(event.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    このファイルの作成元を信頼し、含まれるJavaScript式を読み込みます。式は隔離Workerで実行されますが、信頼できるファイルだけを適用してください。
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700 transition"
          >
            キャンセル
          </button>
          <button
            disabled={!canApplyProject(previewProject, trustConfirmed)}
            onClick={handleApply}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>キャンバスに復元</span>
          </button>
        </div>
      </div>
    </div>
  );
};
