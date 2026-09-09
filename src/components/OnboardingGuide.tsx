import { CheckCircle2, ChevronRight, CircleHelp, X } from 'lucide-react';
import type { Connection, GraphEvaluation, NodeDefinition, NodeInstance } from '../types';
import { getOnboardingProgress } from './onboarding';

interface Props {
  nodes: NodeInstance[];
  connections: Connection[];
  definitions: Map<string, NodeDefinition>;
  evaluation: GraphEvaluation;
  onOpenLibrary: () => void;
  onLoadStarterPreset: () => void;
  onSkip: () => void;
  onComplete: () => void;
}

const guidance = {
  input: {
    title: '入力ノードを置く',
    text: 'ノード追加を開き、Inputから Number Input または Slider Input を選びます。',
  },
  process: {
    title: '処理ノードを置く',
    text: 'ノード追加を開き、Mathから Addを選びます。未接続の入力には初期値が使われます。',
  },
  output: {
    title: '出力ノードを置く',
    text: 'ノード追加を開き、Outputから Value Inspectorを選びます。',
  },
  connect: {
    title: 'ノードを接続する',
    text: '入力ノード右側の出力ポートから処理ノード左側へドラッグし、処理ノードの出力もValue Inspectorへつなぎます。',
  },
  run: {
    title: 'グラフを実行する',
    text: '上部または右下の実行ボタンを押し、Value Inspectorに結果が表示されることを確認します。',
  },
} as const;

export function OnboardingGuide({
  nodes,
  connections,
  definitions,
  evaluation,
  onOpenLibrary,
  onLoadStarterPreset,
  onSkip,
  onComplete,
}: Props) {
  const progress = getOnboardingProgress(nodes, connections, definitions, evaluation);
  const success = progress.stage === 'success';
  const current = progress.stage === 'success' ? undefined : guidance[progress.stage];

  return (
    <aside
      aria-label="はじめてガイド"
      className="pointer-events-none fixed bottom-4 left-4 z-20 w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-indigo-200 bg-white/95 p-4 shadow-xl backdrop-blur dark:border-indigo-900 dark:bg-slate-900/95"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">
          {success ? <CheckCircle2 className="h-5 w-5" /> : <CircleHelp className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
              {success ? '完成' : `はじめてガイド ${progress.step}/5`}
            </span>
            <button
              onClick={onSkip}
              aria-label="ガイドをスキップ"
              title="ガイドをスキップ"
              className="pointer-events-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {success ? '最初のパイプラインが動きました' : current?.title}
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {success
              ? `評価結果: ${formatResult(progress.result)}。入力 → 処理 → 出力の流れが完成しています。`
              : current?.text}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {success ? (
              <button className={primaryButton} onClick={onComplete}>
                ガイドを完了
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : progress.stage === 'connect' ? (
              <span className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                右の出力 ● → ● 左の入力
              </span>
            ) : progress.stage === 'run' ? null : (
              <button className={primaryButton} onClick={onOpenLibrary}>
                ノード追加を開く
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            {nodes.length === 0 && (
              <button className={secondaryButton} onClick={onLoadStarterPreset}>
                完成サンプルを見る
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

const primaryButton =
  'pointer-events-auto inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
const secondaryButton =
  'pointer-events-auto rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';

function formatResult(value: unknown) {
  if (value === undefined) return '評価完了';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
