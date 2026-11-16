#!/bin/sh
# Runs the mock tests (job logic against an in-memory mock world, no Minecraft needed).
# The test list lives in run.mjs, so both commands always run the same tests.
# Usage: sh tools/sim/run.sh   (from the project folder; needs Node 18+)
exec node "$(dirname "$0")/run.mjs" "$@"
