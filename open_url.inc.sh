#!/bin/bash
# 本地 web 工具通用启动器：复用已有匹配 Tab；有窗口则只加 Tab；无窗口不 make new window。
# 通道优先级（用户可见打开）：用户 Google Chrome（正在用的窗口/会话）> Playwright Chrome > IDE 浏览器
# 验收：开页前后 `pgrep -x "Google Chrome"` 主进程 PID 集不得新增（同 App 新 PID = 仍违规）
# 本脚本只服务优先级 1；见 柱子AI/标准/工具工程标准.md §1.5
open_local_web_url() {
  local url="${1:-}"
  if [[ -z "${url}" ]]; then
    echo "open_local_web_url: 缺少 URL" >&2
    return 1
  fi
  if [[ -d "/Applications/Google Chrome.app" ]]; then
    local result
    if result="$(/usr/bin/osascript - "${url}" <<'APPLESCRIPT'
on run argv
  set targetUrl to item 1 of argv
  tell application "Google Chrome"
    -- 1) 已有同 URL Tab → 复用并刷新
    repeat with w in windows
      repeat with t in tabs of w
        set tabUrl to URL of t
        if tabUrl starts with targetUrl then
          set active tab index of w to (index of t)
          set index of w to 1
          reload t
          activate
          return "reused"
        end if
      end repeat
    end repeat
    -- 2) 已有窗口 → 只在 front window 加 Tab（禁止另开窗）
    if (count of windows) > 0 then
      tell front window
        make new tab with properties {URL:targetUrl}
        set active tab index to (count of tabs)
      end tell
      activate
      return "opened_tab"
    end if
    -- 3) AppleScript 看到 0 窗口 → 不 make new window，交给 shell 用 open -a 挂到用户会话
    return "no_window"
  end tell
end run
APPLESCRIPT
)"; then
      result="$(printf '%s' "${result}" | tr -d '\r')"
      case "${result}" in
        reused|opened_tab)
          printf '%s\n' "${result}"
          return 0
          ;;
        no_window)
          # 有 Chrome.app 但 AppleScript 会话无窗：用 open -a 附到用户正在用的窗口/配置
          open -a "Google Chrome" "${url}"
          printf 'opened_via_open\n'
          return $?
          ;;
        *)
          echo "open_local_web_url: 未知 AppleScript 结果「${result}」，回退 open -a" >&2
          open -a "Google Chrome" "${url}"
          return $?
          ;;
      esac
    fi
    echo "open_local_web_url: AppleScript 失败，回退为 open -a Google Chrome" >&2
    open -a "Google Chrome" "${url}"
    return $?
  fi
  open "${url}"
}
