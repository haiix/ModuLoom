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

export async function saveRecoverySnapshot(snapshot: RecoverySnapshot): Promise<void> {
  await runRequest('readwrite', (store) => store.put(snapshot, SNAPSHOT_KEY));
}

export async function discardRecoverySnapshot(): Promise<void> {
  await runRequest('readwrite', (store) => store.delete(SNAPSHOT_KEY));
}
