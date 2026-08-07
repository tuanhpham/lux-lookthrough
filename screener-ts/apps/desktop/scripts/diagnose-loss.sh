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
echo "════ 2. FIRST QUESTION: is the server data actually gone? ════"
echo "Answer this BEFORE considering Time Travel. A restore cannot help if the"
echo "server copy is intact — and restoring anyway would roll back good rows."
echo
echo "  accounts_bytes in the tens of KB or more → THE DATA IS SAFE ON THE SERVER."
echo "    The loss is local-only: the device holds empty rows stamped later than the"
echo "    server's, so the old build's last-write-wins kept the empty ones. Fix by"
echo "    deploying the current build and re-entering the code (freshCode = download)."
echo "    Do NOT run time-travel restore."
echo
echo "  accounts_bytes a few hundred → the wipe reached the server. Time Travel is"
echo "    the path; aim at the spread below."
q "SELECT (SELECT length(value) FROM kv WHERE key='accounts') AS accounts_bytes,
          datetime(MIN(updated_at)/1000,'unixepoch') AS oldest_row_utc,
          datetime(MAX(updated_at)/1000,'unixepoch') AS newest_row_utc,
          COUNT(*) AS rows
   FROM kv
   WHERE key NOT LIKE 'scan:%' AND key NOT LIKE 'calendar:%'
     AND key NOT LIKE 'pf_bars:%' AND key NOT LIKE 'pf_eurusd%'"

echo
echo "════ 2b. Were the rows all rewritten at once? ════"
echo "This is what identifies a wipe. A wipe stamps many rows within one minute."
echo "Months of ordinary editing spreads them out — in that case the MIN above is"
echo "just your oldest normal row and means NOTHING about an overwrite time."
q "SELECT datetime(updated_at/1000,'unixepoch') AS minute_utc, COUNT(*) AS rows_written
   FROM kv
   WHERE key NOT LIKE 'scan:%' AND key NOT LIKE 'calendar:%'
     AND key NOT LIKE 'pf_bars:%' AND key NOT LIKE 'pf_eurusd%'
   GROUP BY strftime('%Y-%m-%d %H:%M', updated_at/1000, 'unixepoch')
   HAVING rows_written > 2
   ORDER BY updated_at DESC"

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
echo "Read section 2 first. If accounts_bytes is large, the server is FINE: deploy the"
echo "current build, then re-enter the access code to pull it down. Stop there."
echo
echo "Only if the server really was wiped: take the wipe minute from 2b, subtract ~10"
echo "minutes, and probe that instant. Never restore blind — take a copy first:"
echo
echo "  npx wrangler d1 export $DB --remote --output ../../../kv-now.sql   # OUTSIDE the repo"
echo "  npx wrangler d1 time-travel info $DB --timestamp <wipe minute minus 10min>"
echo
echo "⚠️  A dump contains the \`users\` table, i.e. YOUR ACCESS CODE IN PLAINTEXT, plus"
echo "    the whole portfolio. Keep it out of the repo and never commit or share it."
echo
echo "Paste both outputs back before running any 'time-travel restore'."
