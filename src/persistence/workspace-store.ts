import type { QuickMindDocument } from '../domain/document';

export const WORKSPACE_DATABASE_NAME = 'quickmind';
export const WORKSPACE_DATABASE_VERSION = 1;
export const WORKSPACE_STORE_NAME = 'workspace';
export const WORKSPACE_KEY = 'current';

export interface WorkspaceStore {
  load(): Promise<QuickMindDocument | null>;
  save(document: QuickMindDocument): Promise<void>;
  clear(): Promise<void>;
}

export class IndexedDbWorkspaceStore implements WorkspaceStore {
  private readonly database: IDBFactory;

  constructor(database: IDBFactory = globalThis.indexedDB) {
    this.database = database;
  }

  async load(): Promise<QuickMindDocument | null> {
    const database = await this.open();

    return new Promise((resolve, reject) => {
      const request = database.transaction(WORKSPACE_STORE_NAME, 'readonly')
        .objectStore(WORKSPACE_STORE_NAME)
        .get(WORKSPACE_KEY);

      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error('Unable to load the local workspace'));
    });
  }

  async save(document: QuickMindDocument): Promise<void> {
    const database = await this.open();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(WORKSPACE_STORE_NAME, 'readwrite');
      transaction.objectStore(WORKSPACE_STORE_NAME).put(document, WORKSPACE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save the local workspace'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Unable to save the local workspace'));
    });
  }

  async clear(): Promise<void> {
    const database = await this.open();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(WORKSPACE_STORE_NAME, 'readwrite');
      transaction.objectStore(WORKSPACE_STORE_NAME).delete(WORKSPACE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Unable to clear the local workspace'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Unable to clear the local workspace'));
    });
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.database.open(WORKSPACE_DATABASE_NAME, WORKSPACE_DATABASE_VERSION);

      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(WORKSPACE_STORE_NAME)) {
          request.result.createObjectStore(WORKSPACE_STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Unable to open the local workspace'));
    });
  }
}
