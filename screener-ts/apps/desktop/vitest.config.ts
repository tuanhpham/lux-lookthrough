/**
 * Tests for the app's ADAPTERS — the layer core deliberately cannot reach.
 *
 * `packages/core` holds the pure merge rules and has always been tested. The
 * plumbing around them (the hydration gate, the pull retry, how a local write
 * failure is reported) had no tests at all, which is how a first sign-in on a
 * phone could hang forever with no message. UI is out of scope; storage and the
 * sync client are not.
 *
 * `environment: 'node'` on purpose: the point is that these modules work with a
 * stubbed Storage and a stubbed fetch, so nothing here needs a DOM.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
