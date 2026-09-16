import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DebouncedSave,
  shouldWarnBeforeUnload,
  type DebouncedSaveStatus,
} from '../engine/debouncedSave';
import type { EditorDocument } from '../engine/editorHistory';
import {
  createRecoverySnapshot,
  serializeFlowProject,
  type ParsedRecoverySnapshot,
} from '../engine/projectSerialization';
import { RecoveryConflictError, saveRecoverySnapshot } from '../engine/recoveryStorage';
import { createProjectCodeFingerprint } from '../engine/projectTrust';

interface RecoverySaveInput {
  document: EditorDocument;
  viewport: { zoom: number; pan: { x: number; y: number } };
  wasDirty: boolean;
}

interface RecoveryUpdateMessage {
  type: 'snapshot-saved';
  writerId: string;
  revision: number;
  updatedAt: string;
}

export interface AutosaveConflict {
  revision: number;
  updatedAt: string;
}

interface UseRecoveryAutosaveOptions {
  initialSnapshot: ParsedRecoverySnapshot | null;
  document: EditorDocument;
  viewport: RecoverySaveInput['viewport'];
  isDirty: boolean;
  enabled: boolean;
}

const RECOVERY_CHANNEL_NAME = 'moduloom-recovery-updates';

function createRecoveryWriterId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const randomPart = crypto.getRandomValues(new Uint32Array(2)).join('-');
  return `${Date.now()}-${randomPart}`;
}

function isRecoveryUpdateMessage(value: unknown): value is RecoveryUpdateMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<RecoveryUpdateMessage>;
  return (
    message.type === 'snapshot-saved' &&
    typeof message.writerId === 'string' &&
    Number.isSafeInteger(message.revision) &&
    typeof message.updatedAt === 'string'
  );
}

export function useRecoveryAutosave({
  initialSnapshot,
  document,
  viewport,
  isDirty,
  enabled,
}: UseRecoveryAutosaveOptions) {
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [browserSaveStatus, setBrowserSaveStatus] = useState<DebouncedSaveStatus>(
    initialSnapshot ? 'saved' : 'idle',
  );
  const [autosaveConflict, setAutosaveConflict] = useState<AutosaveConflict | null>(null);
  const [showRecoveryNotice, setShowRecoveryNotice] = useState(Boolean(initialSnapshot));
  const writerIdRef = useRef(createRecoveryWriterId());
  const revisionRef = useRef<number | null>(initialSnapshot?.revision ?? null);
  const recoveryChannelRef = useRef<BroadcastChannel | null>(null);
  const lastAutosaveInputRef = useRef<RecoverySaveInput>({
    document,
    viewport,
    wasDirty: isDirty,
  });
  const saveSchedulerRef = useRef<DebouncedSave<RecoverySaveInput> | null>(null);
  const enterAutosaveConflict = useCallback((conflict: AutosaveConflict) => {
    saveSchedulerRef.current?.dispose();
    setAutosaveConflict(conflict);
    setAutosaveError(null);
    setBrowserSaveStatus('error');
  }, []);

  if (saveSchedulerRef.current === null) {
    saveSchedulerRef.current = new DebouncedSave(
      async ({ document: nextDocument, viewport: nextViewport, wasDirty }) => {
        const now = new Date().toISOString();
        const project = serializeFlowProject({
          document: nextDocument,
          viewport: nextViewport,
          exportedAt: now,
        });
        const trustedCodeFingerprint = await createProjectCodeFingerprint(project);
        const expectedRevision = revisionRef.current;
        const revision = (expectedRevision ?? 0) + 1;
        const writerId = writerIdRef.current;
        await saveRecoverySnapshot(
          createRecoverySnapshot(project, {
            updatedAt: now,
            revision,
            writerId,
            wasDirty,
            ...(trustedCodeFingerprint ? { trustedCodeFingerprint } : {}),
          }),
          expectedRevision,
        );
        revisionRef.current = revision;
        recoveryChannelRef.current?.postMessage({
          type: 'snapshot-saved',
          writerId,
          revision,
          updatedAt: now,
        } satisfies RecoveryUpdateMessage);
        setAutosaveError(null);
      },
      {
        delayMs: 400,
        maxWaitMs: 2_000,
        onError: (error) => {
          if (error instanceof RecoveryConflictError) {
            enterAutosaveConflict({
              revision: error.currentSnapshot.revision,
              updatedAt: error.currentSnapshot.updatedAt,
            });
            return;
          }
          setAutosaveError(
            error instanceof Error ? error.message : 'プロジェクトを自動保存できませんでした。',
          );
        },
        onStatusChange: setBrowserSaveStatus,
      },
    );
  }

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(RECOVERY_CHANNEL_NAME);
    recoveryChannelRef.current = channel;
    channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!isRecoveryUpdateMessage(data) || data.writerId === writerIdRef.current) return;
      if (data.revision <= (revisionRef.current ?? -1)) return;
      enterAutosaveConflict({ revision: data.revision, updatedAt: data.updatedAt });
    };
    return () => {
      recoveryChannelRef.current = null;
      channel.close();
    };
  }, [enterAutosaveConflict]);

  useEffect(() => {
    if (!enabled || autosaveConflict) return;
    const nextInput: RecoverySaveInput = { document, viewport, wasDirty: isDirty };
    const previousInput = lastAutosaveInputRef.current;
    if (
      previousInput.document === nextInput.document &&
      previousInput.viewport.zoom === nextInput.viewport.zoom &&
      previousInput.viewport.pan.x === nextInput.viewport.pan.x &&
      previousInput.viewport.pan.y === nextInput.viewport.pan.y &&
      previousInput.wasDirty === nextInput.wasDirty
    ) {
      return;
    }
    lastAutosaveInputRef.current = nextInput;
    saveSchedulerRef.current?.schedule(nextInput);
  }, [autosaveConflict, document, enabled, isDirty, viewport]);

  useEffect(() => {
    const flushPendingSave = () => void saveSchedulerRef.current?.flush();
    const handleVisibilityChange = () => {
      if (globalThis.document.visibilityState === 'hidden') flushPendingSave();
    };
    globalThis.document.addEventListener('visibilitychange', handleVisibilityChange);
    globalThis.addEventListener('pagehide', flushPendingSave);
    return () => {
      globalThis.document.removeEventListener('visibilitychange', handleVisibilityChange);
      globalThis.removeEventListener('pagehide', flushPendingSave);
      saveSchedulerRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!shouldWarnBeforeUnload(browserSaveStatus)) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    globalThis.addEventListener('beforeunload', handleBeforeUnload);
    return () => globalThis.removeEventListener('beforeunload', handleBeforeUnload);
  }, [browserSaveStatus]);

  const resetAutosaveState = useCallback(() => {
    saveSchedulerRef.current?.dispose();
    setShowRecoveryNotice(false);
    setBrowserSaveStatus('idle');
  }, []);

  return {
    autosaveError,
    browserSaveStatus,
    autosaveConflict,
    showRecoveryNotice,
    setShowRecoveryNotice,
    resetAutosaveState,
  };
}
