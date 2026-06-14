/**
 * Port of `scipy.signal.argrelextrema` for the two uses in the pattern engine:
 *   - peaks:   argrelextrema(arr, np.greater,       order=order)
 *   - troughs: argrelextrema(arr, np.less,          order=order)
 *   - pivots:  argrelextrema(highs, np.greater_equal, order=order)
 *
 * scipy's default `mode='clip'` means out-of-bounds neighbour indices are
 * clamped to the array edge (not wrapped). A point i is an extremum if, for
 * every shift s in 1..order, comparator(arr[i], arr[clip(i-s)]) AND
 * comparator(arr[i], arr[clip(i+s)]) both hold.
 *
 * Comparators (matching numpy):
 *   greater       → a > b      (strict)
 *   less          → a < b      (strict)
 *   greater_equal → a >= b
 */
export type Comparator = 'greater' | 'less' | 'greater_equal';

function cmp(kind: Comparator, a: number, b: number): boolean {
  switch (kind) {
    case 'greater':
      return a > b;
    case 'less':
      return a < b;
    case 'greater_equal':
      return a >= b;
  }
}

export function argrelextrema(
  arr: readonly number[],
  comparator: Comparator,
  order = 1,
): number[] {
  const n = arr.length;
  if (n === 0 || order < 1) return [];
  const clip = (idx: number): number => (idx < 0 ? 0 : idx >= n ? n - 1 : idx);
  const out: number[] = [];

  for (let i = 0; i < n; i++) {
    const val = arr[i]!;
    let isExtremum = true;
    for (let s = 1; s <= order; s++) {
      const left = arr[clip(i - s)]!;
      const right = arr[clip(i + s)]!;
      if (!cmp(comparator, val, left) || !cmp(comparator, val, right)) {
        isExtremum = false;
        break;
      }
    }
    if (isExtremum) out.push(i);
  }
  return out;
}
