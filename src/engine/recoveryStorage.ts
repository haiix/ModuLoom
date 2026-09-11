import {
  parseRecoverySnapshot,
  type ParsedRecoverySnapshot,
  type RecoverySnapshot,
} from './projectSerialization';

const DATABASE_NAME = 'moduloom-recovery';
const DATABASE_VERSION = 1;
const STORE_NAME = 'snapshots';
const SNAPSHOT_KEY = 'current';

export class InvalidRecoverySnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRecoverySnapshotError';
  }
}

export class RecoveryConflictError extends Error {
  constructor(
    readonly expectedRevision: number | null,
    readonly currentSnapshot: Pick<ParsedRecoverySnapshot, 'revision' | 'updatedAt'>,
  ) {
    super('別のタブで保存された新しい編集があるため、自動保存を停止しました。');
    this.name = 'RecoveryConflictError';
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let settled = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    };
    request.onerror = () => {
      if (settled) return;
      settled = true;
      reject(request.error ?? new Error('IndexedDBを開けませんでした。'));
    };
    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new Error('IndexedDBの更新がブロックされました。'));
    };
  });
}

async function runRequest<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      let result: T;
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error ?? new Error('IndexedDB操作に失敗しました。'));
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('IndexedDBトランザクションが中断されました。'));
    });
  } finally {
    database.close();
  }
}

export async function loadRecoverySnapshot(): Promise<ParsedRecoverySnapshot | null> {
  const stored = await runRequest('readonly', (store) => store.get(SNAPSHOT_KEY));
  if (stored === undefined) return null;
  try {
    return parseRecoverySnapshot(stored);
  } catch (error) {
    throw new InvalidRecoverySnapshotError(
      error instanceof Error ? error.message : '復元データを検証できませんでした。',
    );
  }
}

function readStoredMetadata(
  stored: unknown,
): Pick<ParsedRecoverySnapshot, 'revision' | 'updatedAt'> | null {
  if (stored === undefined) return null;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    throw new InvalidRecoverySnapshotError('snapshot: オブジェクトである必要があります。');
  }
  const snapshot = stored as Record<string, unknown>;
  if (!Number.isSafeInteger(snapshot.revision) || (snapshot.revision as number) < 0) {
    throw new InvalidRecoverySnapshotError(
      'snapshot.revision: 0以上の安全な整数である必要があります。',
    );
  }
  if (typeof snapshot.updatedAt !== 'string' || snapshot.updatedAt.trim() === '') {
    throw new InvalidRecoverySnapshotError(
      'snapshot.updatedAt: 空でない文字列である必要があります。',
    );
  }
  return { revision: snapshot.revision as number, updatedAt: snapshot.updatedAt };
}

async function mutateRecoverySnapshot(
  expectedRevision: number | null,
  mutation: (store: IDBObjectStore) => void,
): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(SNAPSHOT_KEY);
      let operationError: unknown;
      request.onsuccess = () => {
        try {
          const currentSnapshot = readStoredMetadata(request.result);
          if ((currentSnapshot?.revision ?? null) !== expectedRevision) {
            operationError = currentSnapshot
              ? new RecoveryConflictError(expectedRevision, currentSnapshot)
              : new Error('保存済みの復元データが削除されたため、操作を停止しました。');
            transaction.abort();
            return;
          }
          mutation(store);
        } catch (error) {
          operationError = error;
          transaction.abort();
        }
      };
      request.onerror = () => {
        operationError = request.error ?? new Error('IndexedDB操作に失敗しました。');
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(
          operationError ??
            transaction.error ??
            new Error('IndexedDBトランザクションが中断されました。'),
        );
      transaction.onerror = () => {
        operationError ??= transaction.error ?? new Error('IndexedDB操作に失敗しました。');
      };
    });
  } finally {
    database.close();
  }
}

export async function saveRecoverySnapshot(
  snapshot: RecoverySnapshot,
  expectedRevision: number | null,
): Promise<void> {
  await mutateRecoverySnapshot(expectedRevision, (store) => {
    store.put(snapshot, SNAPSHOT_KEY);
  });
}

export async function discardRecoverySnapshot(): Promise<void> {
  await runRequest('readwrite', (store) => store.delete(SNAPSHOT_KEY));
}
