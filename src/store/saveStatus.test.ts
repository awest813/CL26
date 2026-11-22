import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { checkStorageAvailable, getSaveStatus, reportSaveFailure, reportSaveOk, resetSaveStatus, saveProblemFor, subscribeSaveStatus } from './saveStatus.ts';

describe('save status', () => {
  beforeEach(() => resetSaveStatus());

  test('classifies a full quota, a refusal, and anything else', () => {
    assert.equal(saveProblemFor(new DOMException('q', 'QuotaExceededError')), 'full');
    assert.equal(saveProblemFor({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }), 'full');
    assert.equal(saveProblemFor({ code: 22 }), 'full');
    assert.equal(saveProblemFor(new DOMException('no', 'SecurityError')), 'blocked');
    assert.equal(saveProblemFor(new Error('disk')), 'failed');
  });

  test('a failed save is reported until the next one works', () => {
    const seen: Array<string | null> = [];
    const stop = subscribeSaveStatus(() => seen.push(getSaveStatus().problem));
    reportSaveFailure(new DOMException('q', 'QuotaExceededError'));
    assert.equal(getSaveStatus().problem, 'full');
    reportSaveOk();
    assert.equal(getSaveStatus().problem, null);
    stop();
    assert.deepEqual(seen, ['full', null]);
  });

  test('storage the browser blocks stays reported for the session', () => {
    assert.equal(checkStorageAvailable(null), false);
    reportSaveOk();
    assert.equal(getSaveStatus().problem, 'blocked');
  });

  test('a working store passes the startup check, and a full one is reported as full', () => {
    const memory = new Map<string, string>();
    assert.equal(checkStorageAvailable({ setItem: (k, v) => memory.set(k, v), removeItem: (k) => memory.delete(k) }), true);
    assert.equal(getSaveStatus().problem, null);
    assert.equal(memory.size, 0, 'the probe cleans up after itself');
    const full = { setItem: () => { throw new DOMException('q', 'QuotaExceededError'); }, removeItem: () => {} };
    assert.equal(checkStorageAvailable(full), false);
    assert.equal(getSaveStatus().problem, 'full');
  });
});
