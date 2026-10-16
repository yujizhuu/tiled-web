#!/bin/bash
# 双击启动 Tiled 网页版（Mac 工具站「脚本」主题）
ROOT="$(cd "$(dirname "$0")" && pwd)" || exit 1
TOOL_DIR="${ROOT}/tool"
cd "${TOOL_DIR}" || exit 1
PORT="${TILED_WEB_PORT:-8806}"
URL="http://127.0.0.1:${PORT}/"

kill_port_listeners() {
  local pids
  pids="$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null | sort -u)"
  [[ -z "${pids}" ]] && return 0
  kill ${pids} 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1 || return 0
    sleep 0.3
  done
  pids="$(lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null | sort -u)"
  [[ -z "${pids}" ]] || kill -9 ${pids} 2>/dev/null || true
}

if [[ -x /usr/bin/python3 ]]; then
  PY=/usr/bin/python3
elif [[ -x /opt/homebrew/bin/python3 ]]; then
  PY=/opt/homebrew/bin/python3
else
  PY="$(command -v python3 || true)"
fi
[[ -n "${PY}" ]] || { echo "错误：找不到 python3"; read -r -p "按回车关闭…"; exit 1; }

kill_port_listeners
. "${ROOT}/open_url.inc.sh"
( sleep 0.6 && open_local_web_url "${URL}" ) &
exec env -u PYTHONHOME -u PYTHONPATH -u PYTHONEXECUTABLE -u __PYVENV_LAUNCHER__ \
  "${PY}" -m http.server "${PORT}" --bind 127.0.0.1 --directory "${TOOL_DIR}"
