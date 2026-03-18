#!/bin/bash
# Claudy Focan — Daily sync
# Fetch nouveaux AO + attributions récentes + fix statuts
# « Claudy fait sa ronde, fieu. »

set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$DIR/logs/daily-sync-$(date +%Y-%m-%d).log"
mkdir -p "$DIR/logs"

cd "$DIR"

echo "=== Claudy Daily Sync — $(date) ===" >> "$LOG"

# Daily sync (AO + attributions récentes)
npx tsx scripts/daily-sync.ts >> "$LOG" 2>&1

# Fix statuts (croisement AO ↔ attributions)
npx tsx scripts/fix-statuts.ts >> "$LOG" 2>&1

echo "=== Done — $(date) ===" >> "$LOG"
echo "" >> "$LOG"
