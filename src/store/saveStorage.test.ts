import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createSaveStorage, localStorageBackend, requestPersistentSave, storageHealth, type SaveBackend } from './saveStorage.ts';

/** An in-memory store that can be told to fail. */
function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const state = { failWrites: false, failReads: false };
  const backend: SaveBackend = {
    get: async (key) => {
      if (state.failReads) throw new Error('read failed');
      return data.get(key) ?? null;
    },
    set: async (key, value) => {
      if (state.failWrites) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      data.set(key, value);
    },
    remove: async (key) => { data.delete(key); },
  };
  return { backend, data, state };
}

describe('save storage', () => {
  test('saves go to IndexedDB and read back from it', async () => {
    const idb = memory();
    const local = memory();
    const storage = createSaveStorage(idb.backend, local.backend);
    await storage.setItem('persist:root', 'career');
    assert.equal(await storage.getItem('persist:root'), 'career');
    assert.equal(idb.data.get('persist:root'), 'career');
    assert.equal(local.data.size, 0);
  });

  test('a save from before the move is read once, moved to IndexedDB, and cleared from localStorage', async () => {
    const idb = memory();
    const local = memory({ 'persist:root': 'old career' });
    const storage = createSaveStorage(idb.backend, local.backend);
    assert.equal(await storage.getItem('persist:root'), 'old career');
    assert.equal(idb.data.get('persist:root'), 'old career');
    assert.equal(local.data.has('persist:root'), false);
  });

  test('if the move fails the old save stays where it was', async () => {
    const idb = memory();
    idb.state.failWrites = true;
    const local = memory({ 'persist:root': 'old career' });
    const storage = createSaveStorage(idb.backend, local.backend);
    assert.equal(await storage.getItem('persist:root'), 'old career');
    assert.equal(local.data.get('persist:root'), 'old career');
  });

  test('when IndexedDB fails, saves fall back to localStorage and the stale copy is cleared', async () => {
    const idb = memory({ 'persist:root': 'week 3' });
    const local = memory();
    const storage = createSaveStorage(idb.backend, local.backend);
    idb.state.failWrites = true;
    await storage.setItem('persist:root', 'week 4');
    assert.equal(local.data.get('persist:root'), 'week 4');
    assert.equal(idb.data.has('persist:root'), false, 'the next load must not find week 3');
    // The next load reads the newer save.
    idb.state.failWrites = false;
    const reloaded = createSaveStorage(idb.backend, local.backend);
    assert.equal(await reloaded.getItem('persist:root'), 'week 4');
  });

  test('without IndexedDB the save uses localStorage; with neither a write fails loudly', async () => {
    const local = memory();
    const storage = createSaveStorage(null, local.backend);
    await storage.setItem('k', 'v');
    assert.equal(await storage.getItem('k'), 'v');
    await assert.rejects(createSaveStorage(null, null).setItem('k', 'v'));
    assert.equal(localStorageBackend(null), null);
  });

  test('it says where the save is going, and switches when IndexedDB fails', async () => {
    const idb = memory();
    const storage = createSaveStorage(idb.backend, memory().backend);
    assert.equal(storage.location(), 'indexeddb');
    idb.state.failWrites = true;
    await storage.setItem('k', 'v');
    assert.equal(storage.location(), 'localstorage');
    assert.equal(createSaveStorage(null, null).location(), 'none');
  });

  test('storage health reads what the browser reports, and copes when it reports nothing', async () => {
    const manager = {
      estimate: async () => ({ usage: 3_000_000, quota: 300_000_000 }),
      persisted: async () => false,
      persist: async () => true,
    };
    const storage = createSaveStorage(memory().backend, null);
    assert.deepEqual(await storageHealth(storage, manager), { location: 'indexeddb', usage: 3_000_000, quota: 300_000_000, persisted: false });
    assert.deepEqual(await storageHealth(storage, null), { location: 'indexeddb', usage: null, quota: null, persisted: null });
    assert.equal(await requestPersistentSave(manager), true);
    assert.equal(await requestPersistentSave(null), null);
  });
});
