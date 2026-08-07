#!/usr/bin/env bash
# Find WHEN the data was overwritten, so Time Travel is aimed at the right instant.
#
# Why this exists: a restore to a guessed timestamp silently does nothing useful if
# the overwrite happened BEFORE that instant — the snapshot you restored already
# contained the empty rows. The overwrite time is recorded in kv.updated_at, so we
# read it instead of guessing.
#
# Read-only. Run from screener-ts/apps/desktop:  bash scripts/diagnose-loss.sh
set -uo pipefail

DB=screener-sync
q() { npx wrangler d1 execute "$DB" --remote --json --command "$1"; }

echo "════ 1. Every live row: when it was last written, and how big ════"
echo "Look at the DATES. Rows all stamped within minutes of each other = the moment"
echo "the new device overwrote them. 'accounts' at a few hundred bytes is an empty"
echo "starter account; a real portfolio is tens of KB."
q "SELECT key,
          datetime(updated_at/1000,'unixepoch') AS written_utc,
          updated_at AS raw_ms,
          length(value) AS bytes
   FROM kv
   WHERE key NOT LIKE 'scan:%' AND key NOT LIKE 'calendar:%'
     AND key NOT LIKE 'pf_bars:%' AND key NOT LIKE 'pf_eurusd%'
   ORDER BY updated_at DESC"

echo
echo "════ 2. The overwrite window ════"
echo "earliest_utc is the answer: Time Travel must target JUST BEFORE it."
q "SELECT datetime(MIN(updated_at)/1000,'unixepoch') AS earliest_utc,
          datetime(MAX(updated_at)/1000,'unixepoch') AS latest_utc,
          COUNT(*) AS rows
   FROM kv
   WHERE key NOT LIKE 'scan:%' AND key NOT LIKE 'calendar:%'
     AND key NOT LIKE 'pf_bars:%' AND key NOT LIKE 'pf_eurusd%'"

echo
echo "════ 3. Is the app-level history table present yet? ════"
echo "Empty/absent is EXPECTED if the fix has not been deployed — it only records"
echo "from deploy onward and is not the recovery path for this incident."
q "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('kv_history','kv_trash')"

echo
echo "════ 4. Oldest point Time Travel can still reach (30-day limit) ════"
npx wrangler d1 time-travel info "$DB" 2>&1 | tail -20

echo
echo "════ NEXT ════"
echo "Take earliest_utc from section 2, subtract ~10 minutes, and probe THAT instant."
echo "Probe into a COPY first — never restore blind:"
echo
echo "  npx wrangler d1 export $DB --remote --output ./kv-now.sql   # safety copy"
echo "  npx wrangler d1 time-travel info $DB --timestamp <earliest_utc minus 10min>"
echo
echo "Paste both outputs back before running any 'time-travel restore'."
