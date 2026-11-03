#!/usr/bin/env python3
"""
Nocturne Games verify entry (Python-first; no npm).

Runs:
  1. smoke — critical files + SW precache paths
  2. test:unit — mahjong rule-tests via Node (if available)

Usage:
  python scripts/verify.py
  py -3 scripts/verify.py
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FAILURES: list[str] = []


def ok(msg: str) -> None:
    print(f"PASS  {msg}")


def fail(msg: str) -> None:
    FAILURES.append(msg)
    print(f"FAIL  {msg}")


def section(title: str) -> None:
    print()
    print(f"== {title} ==")


def find_node() -> str | None:
    which = shutil.which("node")
    if which:
        return which
    candidates = [
        Path(os.environ.get("LOCALAPPDATA", ""))
        / "Programs"
        / "cursor"
        / "resources"
        / "app"
        / "resources"
        / "helpers"
        / "node.exe",
        Path(r"C:\Program Files\nodejs\node.exe"),
        Path("/usr/local/bin/node"),
        Path("/usr/bin/node"),
    ]
    for path in candidates:
        if path.is_file():
            return str(path)
    return None


def smoke() -> None:
    section("smoke: critical files")
    required = [
        "index.html",
        "manifest.webmanifest",
        "service-worker.js",
        "shared/pwa.js",
        "shared/base.css",
        "mahjong/index.html",
        "mahjong/game.js",
        "mahjong/render.js",
        "mahjong/hu.js",
        "mahjong/score.js",
        "mahjong/rule-tests.js",
        "mahjong/style.css",
        "chess/index.html",
        "turn-beans/index.html",
        "turn-beans/engine.js",
        "turn-beans/levels.js",
        "turn-beans/game.js",
        "turn-beans/style.css",
        "docs/Nocturne_Games_Project_Guide.md",
        "docs/00_project_handoff.md",
        ".cursor/rules/nocturne-games-guide.mdc",
        ".cursor/rules/development-workflow.mdc",
    ]
    for rel in required:
        if (ROOT / rel).is_file():
            ok(rel)
        else:
            fail(f"missing {rel}")

    section("smoke: service-worker precache")
    sw_text = (ROOT / "service-worker.js").read_text(encoding="utf-8")
    cache_m = re.search(r'const\s+CACHE\s*=\s*"([^"]+)"', sw_text)
    if cache_m:
        ok(f"CACHE={cache_m.group(1)}")
    else:
        fail("service-worker.js missing CACHE constant")

    block = re.search(r"const\s+PRECACHE\s*=\s*\[(.*?)\];", sw_text, re.S)
    if not block:
        fail("service-worker.js missing PRECACHE array")
        return
    entries = re.findall(r'"(\./[^"]+)"', block.group(1))
    missing = 0
    for entry in entries:
        file_part = entry[2:].split("?", 1)[0]
        if not (ROOT / file_part).exists():
            fail(f"precache missing on disk: {entry} -> {file_part}")
            missing += 1
    if missing == 0:
        ok(f"precache files present ({len(entries)})")


def skipped() -> None:
    section("skipped by design")
    for msg in [
        "lint: no ESLint (Guide forbids npm toolchain)",
        "typecheck: no TypeScript (Guide forbids TS)",
        "test:e2e: UI/layout/PWA still manual (localhost + device)",
        "build: static GitHub Pages; smoke substitutes CI build gate",
    ]:
        print(f"SKIP  {msg}")


def unit_tests() -> None:
    section("test:unit mahjong rule-tests")
    node = find_node()
    if not node:
        fail(
            "node not found — install Node.js LTS, or open from Cursor "
            "(helper node.exe), then re-run verify"
        )
        return
    ok(f"node={node}")
    loader = ROOT / "scripts" / "strip-query-loader.mjs"
    shim = ROOT / "scripts" / "node-dom-shim.mjs"
    runner = ROOT / "scripts" / "run-mahjong-rule-tests.mjs"
    cmd = [
        node,
        "--import",
        loader.as_uri(),
        "--import",
        shim.as_uri(),
        str(runner),
    ]
    proc = subprocess.run(cmd, cwd=ROOT, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0:
        fail(f"mahjong rule-tests exited {proc.returncode}")
    else:
        ok("mahjong rule-tests")


def main() -> int:
    print("Nocturne Games verify")
    print(f"root={ROOT}")
    smoke()
    skipped()
    unit_tests()
    section("summary")
    if FAILURES:
        print(f"VERIFY FAILED ({len(FAILURES)})")
        for item in FAILURES:
            print(f" - {item}")
        return 1
    print("VERIFY OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
