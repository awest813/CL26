/**
 * Where the career is kept. A long career's save runs to 3–4 million characters, close to
 * what localStorage allows (about 5 MB, and some browsers count two bytes a character). So
 * the save lives in IndexedDB, which allows far more and writes without blocking the page.
 * Where IndexedDB is missing or refuses (some private-browsing modes), it falls back to
 * localStorage. A save from before the move is read from localStorage once, copied into
 * IndexedDB, and then cleared from localStorage to free the space.
 */

/** The three calls redux-persist makes. */
export interface PersistStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
}

/** Where the save is going right now. */
export type SaveLocation = 'indexeddb' | 'localstorage' | 'none';

export interface SaveStorage extends PersistStorage {
  location: () => SaveLocation;
}

/** A key-value store the save can sit in. */
export interface SaveBackend {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

const DB_NAME = 'cl26';
const STORE_NAME = 'save';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** IndexedDB as a key-value store, or null where the browser has none. */
export function indexedDbBackend(factory: IDBFactory | undefined = typeof indexedDB !== 'undefined' ? indexedDB : undefined): SaveBackend | null {
  if (!factory) return null;
  let opening: Promise<IDBDatabase> | null = null;
  const open = () => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = factory.open(DB_NAME, 1);
      } catch (error) {
        reject(error);
        return;
      }
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('The save database is blocked by another tab.'));
    });
    // A failed open is retried on the next call rather than cached.
    opening.catch(() => { opening = null; });
    return opening;
  };
  const run = async <T,>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    const tx = db.transaction(STORE_NAME, mode);
    const result = await request(act(tx.objectStore(STORE_NAME)));
    if (mode === 'readwrite') {
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('The save was not written.'));
      });
    }
    return result;
  };
  return {
    get: async (key) => {
      const value = await run('readonly', (store) => store.get(key));
      return typeof value === 'string' ? value : null;
    },
    set: async (key, value) => {
      await run('readwrite', (store) => store.put(value, key));
    },
    remove: async (key) => {
      await run('readwrite', (store) => store.delete(key));
    },
  };
}

/** localStorage as a key-value store, or null where the browser blocks it. */
export function localStorageBackend(storage?: Storage | null): SaveBackend | null {
  let target: Storage | null | undefined = storage;
  if (target === undefined) {
    try {
      target = typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      target = null;
    }
  }
  if (!target) return null;
  const local = target;
  return {
    get: async (key) => local.getItem(key),
    set: async (key, value) => { local.setItem(key, value); },
    remove: async (key) => { local.removeItem(key); },
  };
}

/**
 * The save's storage: IndexedDB first, localStorage when IndexedDB is unavailable or fails.
 * Reads find a save in either place; a localStorage save found by a read moves into IndexedDB.
 */
export function createSaveStorage(primary: SaveBackend | null, legacy: SaveBackend | null): SaveStorage {
  // Once IndexedDB fails, the session stays on localStorage rather than splitting the save.
  let usePrimary = primary !== null;
  const fallBack = (error: unknown): void => {
    if (!legacy) throw error;
    usePrimary = false;
  };

  return {
    location: () => (usePrimary && primary ? 'indexeddb' : legacy ? 'localstorage' : 'none'),
    getItem: async (key) => {
      if (usePrimary && primary) {
        try {
          const stored = await primary.get(key);
          if (stored !== null) return stored;
        } catch (error) {
          fallBack(error);
        }
      }
      const old = legacy ? await legacy.get(key) : null;
      if (old !== null && usePrimary && primary) {
        // Move the save over; keep the old copy unless the move fully worked.
        try {
          await primary.set(key, old);
          if ((await primary.get(key)) === old) await legacy?.remove(key);
        } catch {
          // Still readable where it was; the next write tries again.
        }
      }
      return old;
    },
    setItem: async (key, value) => {
      if (usePrimary && primary) {
        try {
          await primary.set(key, value);
          return;
        } catch (error) {
          fallBack(error);
          // An older copy left in IndexedDB would win the next load over this newer one.
          await primary.remove(key).catch(() => undefined);
        }
      }
      if (!legacy) throw new Error('No storage is available for the save.');
      await legacy.set(key, value);
    },
    removeItem: async (key) => {
      await Promise.all([
        primary?.remove(key).catch(() => undefined),
        legacy?.remove(key),
      ]);
    },
  };
}

export interface StorageHealth {
  location: SaveLocation;
  /** Bytes the site uses and may use, when the browser says. */
  usage: number | null;
  quota: number | null;
  /** True when the browser has agreed not to clear the site's data on its own; null when it cannot say. */
  persisted: boolean | null;
}

type StorageManagerLike = Pick<StorageManager, 'estimate' | 'persisted' | 'persist'>;

function storageManager(): StorageManagerLike | null {
  return typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function'
    ? navigator.storage
    : null;
}

/** How the save is kept: where, how much room it has, and whether the browser may clear it. */
export async function storageHealth(storage: Pick<SaveStorage, 'location'>, manager: StorageManagerLike | null = storageManager()): Promise<StorageHealth> {
  const estimate = manager ? await manager.estimate().catch(() => null) : null;
  const persisted = manager && typeof manager.persisted === 'function' ? await manager.persisted().catch(() => null) : null;
  return {
    location: storage.location(),
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
    persisted,
  };
}

/** Ask the browser to keep the site's data. Some browsers decide on their own; Firefox asks the player. */
export async function requestPersistentSave(manager: StorageManagerLike | null = storageManager()): Promise<boolean | null> {
  if (!manager || typeof manager.persist !== 'function') return null;
  return manager.persist().catch(() => null);
}
