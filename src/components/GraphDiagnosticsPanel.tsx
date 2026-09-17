import { useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Info, ScanSearch, TriangleAlert } from 'lucide-react';

import type { GraphDiagnostic, GraphDiagnosticSeverity } from '../engine/graphDiagnostics';

interface GraphDiagnosticsPanelProps {
  diagnostics: GraphDiagnostic[];
  onSelectNode: (nodeId: string) => void;
}

const SEVERITY_LABELS: Record<GraphDiagnosticSeverity, string> = {
  error: 'エラー',
  warning: '警告',
  info: '情報',
};

const SEVERITY_STYLES: Record<GraphDiagnosticSeverity, string> = {
  error:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200',
  warning:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200',
};

function SeverityIcon({ severity }: { severity: GraphDiagnosticSeverity }) {
  if (severity === 'error') return <AlertCircle className="h-4 w-4 shrink-0" />;
  if (severity === 'warning') return <TriangleAlert className="h-4 w-4 shrink-0" />;
  return <Info className="h-4 w-4 shrink-0" />;
}

export function GraphDiagnosticsPanel({ diagnostics, onSelectNode }: GraphDiagnosticsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const counts = useMemo(
    () => ({
      error: diagnostics.filter(({ severity }) => severity === 'error').length,
      warning: diagnostics.filter(({ severity }) => severity === 'warning').length,
      info: diagnostics.filter(({ severity }) => severity === 'info').length,
    }),
    [diagnostics],
  );

  return (
    <aside
      aria-label="グラフ診断"
      className="fixed bottom-20 right-4 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white/95 text-xs shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
    >
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <span className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
          <ScanSearch className="h-4 w-4 text-indigo-500" />
          グラフ診断
        </span>
        <span className="flex items-center gap-1.5">
          {counts.error > 0 && (
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
              {counts.error} error
            </span>
          )}
          {counts.warning > 0 && (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              {counts.warning} warning
            </span>
          )}
          {counts.info > 0 && (
            <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              {counts.info} info
            </span>
          )}
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </span>
      </button>

      {isOpen && (
        <div className="max-h-[60vh] space-y-2 overflow-y-auto border-t border-slate-200 p-2 dark:border-slate-700">
          {diagnostics.length === 0 ? (
            <p className="px-2 py-3 text-center text-slate-500">問題は見つかりませんでした。</p>
          ) : (
            diagnostics.map((diagnostic) => {
              const content = (
                <>
                  <SeverityIcon severity={diagnostic.severity} />
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {SEVERITY_LABELS[diagnostic.severity]}: {diagnostic.message}
                    </span>
                    {diagnostic.detail && (
                      <span className="mt-0.5 block text-[10px] opacity-80">
                        {diagnostic.detail}
                      </span>
                    )}
                  </span>
                </>
              );
              const className = `flex w-full items-start gap-2 rounded-lg border p-2 text-left ${SEVERITY_STYLES[diagnostic.severity]}`;
              return diagnostic.nodeId ? (
                <button
                  key={diagnostic.id}
                  type="button"
                  className={`${className} hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`}
                  onClick={() => onSelectNode(diagnostic.nodeId!)}
                >
                  {content}
                </button>
              ) : (
                <div key={diagnostic.id} className={className}>
                  {content}
                </div>
              );
            })
          )}
        </div>
      )}
    </aside>
  );
}
