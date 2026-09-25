import { describe, it, expect } from 'vitest';
import { deriveSyncStatus } from '../../src/storage/syncStatus.js';
import type { SyncStatusInput } from '../../src/storage/syncStatus.js';

/** A device that is signed in, hydrated, and has pushed successfully. */
const healthy: SyncStatusInput = {
  hasCode: true,
  hydrated: true,
  queued: 0,
  lastPushAt: 1_780_000_000_000,
  lastError: null,
};

const at = (over: Partial<SyncStatusInput>): SyncStatusInput => ({ ...healthy, ...over });

describe('deriveSyncStatus', () => {
  it('reports off when no access code is set', () => {
    // The condition that made the incident invisible: the app works normally and
    // saves nothing off-device. It must never render as healthy.
    expect(deriveSyncStatus(at({ hasCode: false })).phase).toBe('off');
  });

  it('reports off even when local writes look perfectly successful', () => {
    // No code means the pushes were no-ops, so a recent `lastPushAt` from an
    // earlier signed-in session must not be read as "saved".
    const v = deriveSyncStatus(at({ hasCode: false, lastPushAt: Date.now(), queued: 0 }));
    expect(v.phase).toBe('off');
    expect(v.showTime).toBe(false);
  });

  it('surfaces a failed push', () => {
    expect(deriveSyncStatus(at({ lastError: 'HTTP 409' })).phase).toBe('error');
  });

  it('keeps showing the error while later writes queue up', () => {
    // 'pending' here would imply the failure was handled. It was not: the server
    // is still behind, and the queue says nothing about the write that already
    // failed. Error outranks pending.
    expect(deriveSyncStatus(at({ lastError: 'HTTP 409', queued: 3 })).phase).toBe('error');
  });

  it('prefers off over error — the actionable cause wins', () => {
    // Signing out after a failure: the code being absent is the thing to fix, and
    // it is not transient. Reporting a stale error instead would send the user
    // looking for a network problem.
    expect(deriveSyncStatus(at({ hasCode: false, lastError: 'HTTP 500' })).phase).toBe('off');
  });

  it('is pending before the first pull lands', () => {
    // The hydration gate is shut, so pushes are queued rather than sent. Claiming
    // 'ok' here would be a lie about writes that have not left the device.
    expect(deriveSyncStatus(at({ hydrated: false })).phase).toBe('pending');
  });

  it('is pending while writes are still queued', () => {
    expect(deriveSyncStatus(at({ queued: 1 })).phase).toBe('pending');
  });

  it('is ok when hydrated, queue-free and error-free', () => {
    const v = deriveSyncStatus(healthy);
    expect(v.phase).toBe('ok');
    expect(v.showTime).toBe(true);
  });

  it('stays ok on a device that simply has not written anything yet', () => {
    // Nothing has been pushed from here, but nothing has failed either. A fault
    // badge on a quiet device would cry wolf and devalue the real warnings.
    const v = deriveSyncStatus(at({ lastPushAt: null }));
    expect(v.phase).toBe('ok');
    expect(v.showTime).toBe(false); // no time to show
  });

  it('does not treat an old successful push as a fault', () => {
    // Staleness is not failure: a portfolio untouched for a month is normal.
    expect(deriveSyncStatus(at({ lastPushAt: 1 })).phase).toBe('ok');
  });

  it('renders only the actionable states as text', () => {
    // The agreed visual rule: healthy and in-flight collapse to a dot; anything
    // the user should act on keeps its words.
    expect(deriveSyncStatus(at({ hasCode: false })).verbose).toBe(true);
    expect(deriveSyncStatus(at({ lastError: 'x' })).verbose).toBe(true);
    expect(deriveSyncStatus(healthy).verbose).toBe(false);
    expect(deriveSyncStatus(at({ hydrated: false })).verbose).toBe(false);
  });

  it('gives every phase a distinct label key', () => {
    const keys = [
      deriveSyncStatus(at({ hasCode: false })).labelKey,
      deriveSyncStatus(at({ lastError: 'x' })).labelKey,
      deriveSyncStatus(at({ hydrated: false })).labelKey,
      deriveSyncStatus(healthy).labelKey,
    ];
    expect(new Set(keys).size).toBe(4);
  });
});
