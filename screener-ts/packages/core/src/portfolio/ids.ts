/**
 * Injectable id factory. Core must stay deterministic and free of Date.now /
 * Math.random (per the platform-agnostic constraint), so callers provide the
 * id generator. The app supplies a real one (e.g. crypto.randomUUID); tests
 * pass a counter for reproducibility.
 */
export type IdFactory = () => string;

/** A simple deterministic counter factory, handy for tests. */
export function counterIds(prefix = 'id'): IdFactory {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
