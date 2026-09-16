import { useCallback, useEffect, useState } from 'react';

import { serializeFlowProject, type ParsedRecoverySnapshot } from '../engine/projectSerialization';
import {
  discardRecoverySnapshot,
  InvalidRecoverySnapshotError,
  loadRecoverySnapshot,
  saveRecoverySnapshot,
} from '../engine/recoveryStorage';
import {
  createProjectCodeFingerprint,
  recoverySnapshotHasTrustedCode,
} from '../engine/projectTrust';

interface RecoveryBootstrapState {
  loading: boolean;
  snapshot: ParsedRecoverySnapshot | null;
  pendingTrustSnapshot: ParsedRecoverySnapshot | null;
  warning: string | null;
  requiresDiscard: boolean;
}

const INITIAL_STATE: RecoveryBootstrapState = {
  loading: true,
  snapshot: null,
  pendingTrustSnapshot: null,
  warning: null,
  requiresDiscard: false,
};

export function useRecoveryBootstrap() {
  const [recovery, setRecovery] = useState<RecoveryBootstrapState>(INITIAL_STATE);

  useEffect(() => {
    let cancelled = false;
    void loadRecoverySnapshot()
      .then(async (snapshot) => {
        if (cancelled) return;
        if (snapshot && !(await recoverySnapshotHasTrustedCode(snapshot))) {
          if (cancelled) return;
          setRecovery({
            loading: false,
            snapshot: null,
            pendingTrustSnapshot: snapshot,
            warning: null,
            requiresDiscard: false,
          });
          return;
        }
        setRecovery({
          loading: false,
          snapshot,
          pendingTrustSnapshot: null,
          warning: null,
          requiresDiscard: false,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setRecovery({
          loading: false,
          snapshot: null,
          pendingTrustSnapshot: null,
          warning: error instanceof Error ? error.message : '復元データを読み込めませんでした。',
          requiresDiscard: error instanceof InvalidRecoverySnapshotError,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const discardRecovery = useCallback(async () => {
    try {
      await discardRecoverySnapshot();
      setRecovery((current) => ({
        ...current,
        warning: null,
        requiresDiscard: false,
        pendingTrustSnapshot: null,
      }));
    } catch (error) {
      setRecovery((current) => ({
        ...current,
        warning: error instanceof Error ? error.message : '復元データを破棄できませんでした。',
      }));
    }
  }, []);

  const trustRecovery = useCallback(async () => {
    const snapshot = recovery.pendingTrustSnapshot;
    if (!snapshot) return;
    try {
      const trustedCodeFingerprint = await createProjectCodeFingerprint(snapshot.project);
      if (!trustedCodeFingerprint) throw new Error('信頼対象の自作式が見つかりません。');
      const project = serializeFlowProject({
        document: {
          nodes: snapshot.project.nodes,
          connections: snapshot.project.connections,
          customDefinitions: snapshot.project.customDefinitions ?? [],
          customTypes: snapshot.project.customTypes ?? [],
        },
        viewport: snapshot.project.viewport ?? { zoom: 1, pan: { x: 60, y: 80 } },
        exportedAt: snapshot.project.exportedAt,
      });
      await saveRecoverySnapshot(
        { ...snapshot, project, trustedCodeFingerprint },
        snapshot.revision,
      );
      setRecovery({
        loading: false,
        snapshot: { ...snapshot, trustedCodeFingerprint },
        pendingTrustSnapshot: null,
        warning: null,
        requiresDiscard: false,
      });
    } catch (error) {
      setRecovery((current) => ({
        ...current,
        warning: error instanceof Error ? error.message : '信頼情報を保存できませんでした。',
      }));
    }
  }, [recovery.pendingTrustSnapshot]);

  return { recovery, discardRecovery, trustRecovery };
}
