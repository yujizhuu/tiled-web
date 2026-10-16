#!/usr/bin/env bash
# Serve the editor on http://127.0.0.1:8806/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/tool"
PORT="${PORT:-8806}"
echo "Tiled Web → http://127.0.0.1:${PORT}/"
python3 -m http.server "$PORT"
