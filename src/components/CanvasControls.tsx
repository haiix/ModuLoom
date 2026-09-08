import { Maximize2, Play, Zap, ZoomIn, ZoomOut } from 'lucide-react';

interface Props {
  isLiveReactive: boolean;
  onToggleLiveReactive: () => void;
  onRun: () => void;
  evalStats?: { dirtyCount: number; totalCount: number };
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFitView: () => void;
}
export function CanvasControls({
  isLiveReactive,
  onToggleLiveReactive,
  onRun,
  evalStats,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onFitView,
}: Props) {
  const button =
    'rounded-lg p-2 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800';
  return (
    <aside
      aria-label="キャンバス操作"
      className="fixed bottom-4 right-4 z-20 flex max-w-[calc(100vw-2rem)] items-center gap-1.5 rounded-xl border border-slate-200 bg-white/95 p-1.5 shadow-lg backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
    >
      <button
        onClick={onToggleLiveReactive}
        aria-label={`リアクティブ評価を${isLiveReactive ? '無効' : '有効'}にする`}
        title={`リアクティブ評価を${isLiveReactive ? '無効' : '有効'}にする`}
        className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-xs ${isLiveReactive ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
      >
        <span
          className={`h-2 w-2 rounded-full ${isLiveReactive ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'}`}
        />
        <span className="hidden sm:inline">自動 {isLiveReactive ? 'ON' : 'OFF'}</span>
      </button>
      <button
        onClick={onRun}
        aria-label="グラフを今すぐ実行"
        title="グラフを今すぐ実行"
        className={button}
      >
        <Play className="h-4 w-4" aria-hidden="true" />
      </button>
      {evalStats && evalStats.totalCount > 0 && (
        <span className="hidden items-center gap-1 whitespace-nowrap px-1 text-[10px] text-slate-500 md:flex">
          <Zap className="h-3 w-3" aria-hidden="true" />
          {evalStats.dirtyCount}/{evalStats.totalCount}
        </span>
      )}
      <span className="mx-0.5 h-5 w-px bg-slate-200 dark:bg-slate-700" />
      <button onClick={onZoomOut} aria-label="縮小" title="縮小" className={button}>
        <ZoomOut className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        onClick={onResetZoom}
        aria-label="ズームを100%に戻す"
        title="ズームを100%に戻す"
        className="min-w-12 rounded-lg px-1 py-2 text-[11px] font-mono hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button onClick={onZoomIn} aria-label="拡大" title="拡大" className={button}>
        <ZoomIn className="h-4 w-4" aria-hidden="true" />
      </button>
      <button onClick={onFitView} aria-label="全体を表示" title="全体を表示" className={button}>
        <Maximize2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </aside>
  );
}
