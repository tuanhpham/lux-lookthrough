#!/usr/bin/env bash
# Probe one point in time: restore the DB to it, report what the portfolio looked
# like at that instant, and leave a return ticket so it can be undone.
#
#   bash scripts/probe-timestamp.sh 2026-07-20T00:00:00Z
#
# WHY PROBING IS SAFE, and why a "failed" restore is not the end:
# Time Travel keeps EVERY point in the last 30 days. Restoring does not consume
# or erase bookmarks — including bookmarks from before the restore. So restoring
# to a wrong instant loses nothing, and can be walked back. The one thing that
# would be unrecoverable is losing track of where you started, which is why this
# script writes a return ticket BEFORE it touches anything.
#
# Run from screener-ts/apps/desktop. Requires `npx wrangler login` first.
set -uo pipefail

DB=screener-sync
TS="${1:-}"
TICKET_DIR="./recovery-tickets"

if [ -z "$TS" ]; then
  echo "usage: bash scripts/probe-timestamp.sh <RFC3339 timestamp, e.g. 2026-07-20T00:00:00Z>" >&2
  exit 2
fi

mkdir -p "$TICKET_DIR"
SAFE_TS="$(printf '%s' "$TS" | tr ':' '-')"

# ── 0. Return ticket: where are we right now? ────────────────────────────────
# Written before any restore, so the current state is always reachable again.
if [ ! -f "$TICKET_DIR/return-bookmark.txt" ]; then
  echo "── Saving a return ticket for the CURRENT state (first run only) ──"
  npx wrangler d1 time-travel info "$DB" --json > "$TICKET_DIR/return-info.json" 2>&1
  # The bookmark is the only thing needed to come back; keep the raw JSON too.
  grep -o '"bookmark"[^,}]*' "$TICKET_DIR/return-info.json" | head -1 \
    > "$TICKET_DIR/return-bookmark.txt" || true
  npx wrangler d1 export "$DB" --remote --output "$TICKET_DIR/state-before-probing.sql" >/dev/null 2>&1
  echo "   → $TICKET_DIR/return-bookmark.txt"
  echo "   → $TICKET_DIR/state-before-probing.sql"
  echo
fi

# ── 1. Does a bookmark even exist for this instant? ──────────────────────────
echo "── Resolving a bookmark for $TS ──"
INFO="$(npx wrangler d1 time-travel info "$DB" --timestamp "$TS" 2>&1)"
echo "$INFO"
if printf '%s' "$INFO" | grep -qiE 'error|not.*(available|found)|outside'; then
  echo
  echo "✗ No bookmark for that instant — it is outside the 30-day window, or the"
  echo "  timestamp format is wrong (needs e.g. 2026-07-20T00:00:00Z)."
  echo "  The 30-day limit is the hard boundary: nothing older can be recovered."
  exit 1
fi
echo

# ── 2. Restore to it ─────────────────────────────────────────────────────────
echo "── Restoring to $TS (undoable — see the return ticket) ──"
npx wrangler d1 time-travel restore "$DB" --timestamp "$TS" 2>&1 | tail -8
echo

# ── 3. What did the data look like at that instant? ──────────────────────────
echo "════ STATE AT $TS ════"
echo "'accounts' is the row that matters. A few hundred bytes = the empty starter"
echo "account (still overwritten at this point → probe an EARLIER instant)."
echo "Tens of KB = your real portfolio → this is the instant to keep."
npx wrangler d1 execute "$DB" --remote --json --command \
  "SELECT key,
          datetime(updated_at/1000,'unixepoch') AS written_utc,
          length(value) AS bytes
   FROM kv
   WHERE key NOT LIKE 'scan:%' AND key NOT LIKE 'calendar:%'
     AND key NOT LIKE 'pf_bars:%' AND key NOT LIKE 'pf_eurusd%'
   ORDER BY bytes DESC" 2>&1

echo
echo "── Number of positions actually inside 'accounts' at this instant ──"
# The decisive signal: an empty starter account has no lots at all.
npx wrangler d1 execute "$DB" --remote --json --command \
  "SELECT length(value) AS bytes,
          (length(value) - length(replace(value,'\"ticker\"',''))) / 8 AS lot_mentions
   FROM kv WHERE key = 'accounts'" 2>&1

# Keep a dump of every probed instant, so a good one is captured on disk
# immediately rather than depending on the DB staying put.
npx wrangler d1 export "$DB" --remote --output "$TICKET_DIR/probe-$SAFE_TS.sql" >/dev/null 2>&1
echo
echo "→ Dump of this instant saved: $TICKET_DIR/probe-$SAFE_TS.sql"
echo
echo "════ NEXT ════"
echo "  bytes for 'accounts' still tiny  → probe EARLIER (e.g. a week back)"
echo "  bytes large / lot_mentions > 0   → FOUND IT. Stop and say so; do not probe on."
echo "  to return to where you started   → cat $TICKET_DIR/return-bookmark.txt"
echo "                                     npx wrangler d1 time-travel restore $DB --bookmark <it>"
