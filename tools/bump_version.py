#!/usr/bin/env python3
"""Sets the Crew add-on version everywhere it lives, together, so they can't drift apart.

Where the version lives:
  crew_bp/manifest.json   header, every module, and the dependency on the resource pack
  crew_rp/manifest.json   header and every module
  crew_bp/scripts/util.js export const VERSION = "x.y.z";

Usage (from anywhere; Python 3.8+, stdlib only):
  python tools/bump_version.py 0.4.1     set the version
  python tools/bump_version.py --check   exit 1 if the three places disagree
  python tools/bump_version.py           print the current version(s)

Never changes a pack UUID (CLAUDE.md rule 4). A server only sends players a new resource pack when
its version changes, so every server update needs a new version.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BP = ROOT / "crew_bp" / "manifest.json"
RP = ROOT / "crew_rp" / "manifest.json"
UTIL = ROOT / "crew_bp" / "scripts" / "util.js"
VERSION_RE = re.compile(r'export const VERSION = "([^"]*)";')


def _read(path):
    raw = path.read_bytes()
    newline = "\r\n" if b"\r\n" in raw else "\n"
    return raw.decode("utf-8-sig"), newline


def _write(path, text, newline):
    # Keep the file's own line endings; no BOM.
    path.write_bytes(text.replace("\r\n", "\n").replace("\n", newline).encode("utf-8"))


def _vstr(parts):
    return ".".join(str(p) for p in parts)


def read_versions():
    """Every place the version lives -> its value as "x.y.z" (or None when missing)."""
    rp_text, _ = _read(RP)
    bp_text, _ = _read(BP)
    rp, bp = json.loads(rp_text), json.loads(bp_text)
    rp_uuid = rp["header"]["uuid"]
    found = {}
    for label, m in (("crew_bp/manifest.json", bp), ("crew_rp/manifest.json", rp)):
        found[f"{label} header"] = _vstr(m["header"]["version"])
        for i, mod in enumerate(m.get("modules", [])):
            found[f"{label} module {i} ({mod.get('type')})"] = _vstr(mod["version"])
        for dep in m.get("dependencies", []):
            if dep.get("uuid") == rp_uuid:
                found[f"{label} dependency on the RP"] = _vstr(dep["version"])
    util_text, _ = _read(UTIL)
    match = VERSION_RE.search(util_text)
    found["crew_bp/scripts/util.js VERSION"] = match.group(1) if match else None
    return found


def current_version():
    """The one version if every place agrees, else raises ValueError naming the disagreement."""
    found = read_versions()
    values = set(found.values())
    if len(values) != 1 or None in values:
        detail = "\n".join(f"  {k}: {v}" for k, v in found.items())
        raise ValueError(f"versions disagree:\n{detail}")
    return values.pop()


def set_version(version):
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError(f"not a version: {version!r} (expected major.minor.patch, e.g. 0.4.1)")
    parts = [int(p) for p in version.split(".")]
    rp_uuid = json.loads(_read(RP)[0])["header"]["uuid"]
    for path in (BP, RP):
        text, newline = _read(path)
        m = json.loads(text)
        uuids_before = _uuids(m)
        m["header"]["version"] = parts
        for mod in m.get("modules", []):
            mod["version"] = parts
        for dep in m.get("dependencies", []):
            if dep.get("uuid") == rp_uuid:
                dep["version"] = parts
        assert _uuids(m) == uuids_before, "a pack UUID changed: never allowed"
        _write(path, json.dumps(m, indent=2, ensure_ascii=False) + "\n", newline)
    text, newline = _read(UTIL)
    if not VERSION_RE.search(text):
        raise ValueError("VERSION not found in crew_bp/scripts/util.js")
    _write(UTIL, VERSION_RE.sub(f'export const VERSION = "{version}";', text, count=1), newline)
    return current_version()


def _uuids(m):
    return [m["header"]["uuid"]] + [x.get("uuid") for x in m.get("modules", []) + m.get("dependencies", [])]


def main(argv):
    try:
        if not argv:
            found = read_versions()
            for k, v in found.items():
                print(f"{k}: {v}")
            return 0 if len(set(found.values())) == 1 else 1
        if argv[0] == "--check":
            print(f"version {current_version()} (all places agree)")
            return 0
        print(f"version set to {set_version(argv[0])} in both manifests and util.js")
        return 0
    except ValueError as e:
        print(f"bump_version: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
