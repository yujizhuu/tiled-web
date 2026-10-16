#!/usr/bin/env python3
"""MCP stdio demo (newline-delimited JSON-RPC, per MCP spec) against cli/mcp-server.js.
usage: mcp_demo.py <mcp-server.js> <map.tmj>"""
import json, subprocess, sys
server, mp = sys.argv[1], sys.argv[2]
p = subprocess.Popen(["node", server], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
n = 0
def rpc(method, params=None, notify=False):
    global n
    msg = {"jsonrpc": "2.0", "method": method}
    if params is not None: msg["params"] = params
    if not notify: n += 1; msg["id"] = n
    p.stdin.write(json.dumps(msg) + "\n"); p.stdin.flush()
    if notify: return None
    r = json.loads(p.stdout.readline())
    assert "error" not in r, r
    return r["result"]
def call(name, **args):
    r = rpc("tools/call", {"name": name, "arguments": args})
    assert not r.get("isError"), r
    return r["content"][0]["text"]
init = rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "demo", "version": "1"}})
rpc("notifications/initialized", notify=True)
tools = [t["name"] for t in rpc("tools/list")["tools"]]
print("MCP server:", init["serverInfo"], "tools:", len(tools))
print(call("tiled_version").splitlines()[0])
# 通过 MCP 在 Deco 层放一朵花（gid 13，水平翻转）
call("tiled_set_tile", map=mp, x=11, y=9, gid=13, layer="Deco", flipH=True)
info = json.loads(call("tiled_info", map=mp))
print("info via MCP: layers=%d tilesets=%d" % (info["layerCount"], len(info["tilesets"])))
print("wangsets via MCP:", json.loads(call("tiled_wang", map=mp))["count"])
p.stdin.close(); p.wait()
