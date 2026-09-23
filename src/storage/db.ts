/**
 * IndexedDB for feedback and dataset records. Only ever opened from extension
 * pages (service worker, popup), so the data lives under the extension's
 * origin, never LinkedIn's.
 */
import type { DatasetRecord, FeedbackRecord } from '../messages';

const DB_NAME = 'legithire';
const DB_VERSION = 1;

export type StoreName = 'feedback' | 'dataset';
type RecordOf<S extends StoreName> = S extends 'feedback' ? FeedbackRecord : DatasetRecord;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('feedback')) db.createObjectStore('feedback', { autoIncrement: true });
      // One dataset record per post; saving again overwrites.
      if (!db.objectStoreNames.contains('dataset')) db.createObjectStore('dataset', { keyPath: 'post_id_hash' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(store, mode).objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const put = <S extends StoreName>(store: S, record: RecordOf<S>) => run(store, 'readwrite', (s) => s.put(record));
export const all = <S extends StoreName>(store: S) => run(store, 'readonly', (s) => s.getAll() as IDBRequest<RecordOf<S>[]>);
export const count = (store: StoreName) => run(store, 'readonly', (s) => s.count());
export const clear = (store: StoreName) => run(store, 'readwrite', (s) => s.clear());

export function toJsonl(records: unknown[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
}
