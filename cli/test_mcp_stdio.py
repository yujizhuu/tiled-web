#!/usr/bin/env python3
"""Smoke-test tiled-web MCP stdio server (Content-Length framing)."""
import json
import os
import subprocess
import sys

root = os.path.dirname(os.path.abspath(__file__))
proc = subprocess.Popen(
    ["node", os.path.join(root, "mcp-server.js")],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)


def send(obj):
    body = json.dumps(obj).encode()
    proc.stdin.write(f"Content-Length: {len(body)}\r\n\r\n".encode() + body)
    proc.stdin.flush()


def read_msg():
    buf = b""
    while b"\r\n\r\n" not in buf:
        chunk = proc.stdout.read(1)
        if not chunk:
            err = proc.stderr.read().decode() if proc.stderr else ""
            raise SystemExit("EOF from MCP: " + err)
        buf += chunk
        if len(buf) > 10000:
            raise SystemExit("header too long: " + buf[:200].decode())
    header, rest = buf.split(b"\r\n\r\n", 1)
    length = None
    for line in header.split(b"\r\n"):
        if line.lower().startswith(b"content-length:"):
            length = int(line.split(b":", 1)[1].strip())
    assert length is not None, header
    body = rest
    while len(body) < length:
        body += proc.stdout.read(length - len(body))
    return json.loads(body.decode())


send(
    {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "test", "version": "0"},
        },
    }
)
r1 = read_msg()
assert r1.get("result", {}).get("serverInfo", {}).get("name") == "tiled-web", r1
send({"jsonrpc": "2.0", "method": "notifications/initialized"})
send({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
r2 = read_msg()
names = [t["name"] for t in r2["result"]["tools"]]
for need in [
    "tiled_version",
    "tiled_info",
    "tiled_new",
    "tiled_set_tile",
    "tiled_fill",
    "tiled_coord",
    "tiled_wang",
    "tiled_export",
    "tiled_prop",
    "tiled_template",
]:
    assert need in names, (need, names)
send(
    {
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {"name": "tiled_version", "arguments": {}},
    }
)
r3 = read_msg()
text = r3["result"]["content"][0]["text"]
assert "0.7.1" in text and "phase: 7" in text, text
proc.terminate()
try:
    proc.wait(timeout=2)
except Exception:
    proc.kill()
print("MCP ok", len(names), "tools")
