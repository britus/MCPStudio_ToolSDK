#!/usr/bin/env python3

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def read_input() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def read_file_preview(file_path, max_bytes):
    if not file_path:
        return None
    with open(file_path, "rb") as handle:
        data = handle.read(max_bytes)
    return {
        "path": file_path,
        "size": os.path.getsize(file_path),
        "preview": data.decode("utf-8", errors="replace"),
    }


def fetch_url_summary(url, max_bytes):
    if not url:
        return None
    request = urllib.request.Request(
        url,
        method="GET",
        headers={"User-Agent": "MCPStudio-PythonRuntimeTool/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            data = response.read(max_bytes)
            return {
                "url": response.geturl(),
                "statusCode": response.status,
                "contentType": response.headers.get("content-type", ""),
                "bytesRead": len(data),
            }
    except urllib.error.HTTPError as error:
        return {
            "url": error.geturl(),
            "statusCode": error.code,
            "contentType": error.headers.get("content-type", ""),
            "bytesRead": len(error.read(max_bytes)),
        }


def main() -> int:
    payload = read_input()
    max_bytes = int(payload.get("maxBytes") or 1024)
    query = payload.get("query") or "EoF MCP Studio"
    url = payload.get("url") or "https://www.google.com/search?q=" + urllib.parse.quote_plus(query)

    result = {
        "ok": True,
        "modules": ["json", "os", "sys", "urllib.request", "urllib.parse"],
        "python": sys.version.split()[0],
        "argv": sys.argv[1:],
        "file": read_file_preview(payload.get("filePath"), max_bytes),
        "response": fetch_url_summary(url, max_bytes),
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        raise
