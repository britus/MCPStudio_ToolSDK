#!/usr/bin/env python3

import json
import sys


def main() -> int:
    raw = sys.stdin.read()
    payload = json.loads(raw) if raw.strip() else None
    print(json.dumps({
        "ok": True,
        "argv": sys.argv[1:],
        "stdin": payload,
        "python": sys.version.split()[0],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
