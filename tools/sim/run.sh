#!/bin/sh
# Runs the job logic against an in-memory mock world (no Minecraft needed).
# Usage: sh tools/sim/run.sh   (from the minecraft-addon folder)
set -e
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../.." && pwd)
W=$(mktemp -d); mkdir -p "$W/node_modules/@minecraft" "$W/scripts"
cp -r "$HERE/mock/@minecraft/server" "$HERE/mock/@minecraft/server-ui" "$W/node_modules/@minecraft/"
cp "$ROOT"/crew_bp/scripts/*.js "$W/scripts/"; cp "$HERE"/*.mjs "$W/"; echo '{"type":"module"}' > "$W/package.json"
cd "$W"
echo "== quarry (keep all)"; node quarry_test.mjs all
echo "== branch mine"; node branch_test.mjs
echo "== tool kit"; node kit_test.mjs
echo "== permissions and resume"; node crew_test.mjs
echo "== main.js loads"; node -e 'import("./scripts/main.js").then(() => console.log("ok"))'
