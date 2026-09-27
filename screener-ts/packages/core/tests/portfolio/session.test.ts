import { describe, it, expect } from 'vitest';
import { lastSettledSession } from '../../src/portfolio/session.js';

/**
 * The dates below are written as UTC instants on purpose: the point of the module
 * is that a European user's clock does not decide when a US close has happened,
 * so the test must not be able to pass by reading a local hour.
 */
describe('the last settled session', () => {
  it('is still yesterday during the session', () => {
    // Fri 2026-09-25 18:00 UTC = 14:00 in New York — the session is open.
    expect(lastSettledSession(new Date('2026-09-25T18:00:00Z'))).toBe('2026-09-24');
  });

  it('is still yesterday in the hour right after the bell', () => {
    // 20:30 UTC = 16:30 NY: closed, but the day's bar has not settled.
    expect(lastSettledSession(new Date('2026-09-25T20:30:00Z'))).toBe('2026-09-24');
  });

  it('becomes today once the close has settled', () => {
    // 21:30 UTC = 17:30 NY.
    expect(lastSettledSession(new Date('2026-09-25T21:30:00Z'))).toBe('2026-09-25');
  });

  it('stays on Friday all weekend', () => {
    expect(lastSettledSession(new Date('2026-09-26T12:00:00Z'))).toBe('2026-09-25'); // Sat
    expect(lastSettledSession(new Date('2026-09-27T23:00:00Z'))).toBe('2026-09-25'); // Sun
    expect(lastSettledSession(new Date('2026-09-28T12:00:00Z'))).toBe('2026-09-25'); // Mon morning
  });

  it('uses the New York day, not the UTC day', () => {
    // 2026-09-29 01:00 UTC is still Monday evening (21:00) in New York, and the
    // Monday close has settled. A UTC reading would answer Monday too — but for
    // the wrong reason, so check the case where they disagree: 03:00 UTC Saturday
    // is Friday 23:00 NY, after Friday's settle.
    expect(lastSettledSession(new Date('2026-09-26T03:00:00Z'))).toBe('2026-09-25');
  });

  it('handles a Monday before the open by going back to Friday', () => {
    // Mon 2026-09-28 10:00 UTC = 06:00 NY.
    expect(lastSettledSession(new Date('2026-09-28T10:00:00Z'))).toBe('2026-09-25');
  });
});
