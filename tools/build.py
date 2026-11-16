#!/usr/bin/env python3
"""The one build command: builds dist/crew-addon-<version>.mcaddon from crew_bp and crew_rp.

  python tools/build.py               check versions, run the mock tests, build
  python tools/build.py --skip-tests  build without the tests (quick local package)
  python tools/build.py --out DIR     write the .mcaddon to DIR instead of dist/

It bumps nothing: the version comes from the manifests (set it with tools/bump_version.py), and the
build stops if the manifests and util.js disagree. The same files always give the same bytes
(sorted entries, fixed timestamps), so two builds of one commit are identical.
Python 3.8+, stdlib only; the tests need Node 18+.
"""
import argparse
import io
import os
import subprocess
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bump_version  # noqa: E402  (same folder)

ROOT = Path(__file__).resolve().parent.parent
FIXED_TIME = (1980, 1, 1, 0, 0, 0)


def pack_files(folder):
    """Every file under a pack folder as (path relative to it with /, bytes), sorted."""
    base = ROOT / folder
    out = []
    for dirpath, dirnames, filenames in os.walk(base):
        dirnames.sort()
        for name in sorted(filenames):
            full = Path(dirpath) / name
            out.append((full.relative_to(base).as_posix(), full.read_bytes()))
    out.sort(key=lambda e: e[0])
    return out


def zip_bytes(entries):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in entries:
            info = zipfile.ZipInfo(name, date_time=FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            z.writestr(info, data, compresslevel=9)
    return buf.getvalue()


def run_tests():
    print("== mock tests (node tools/sim/run.mjs)")
    result = subprocess.run(["node", str(ROOT / "tools" / "sim" / "run.mjs")], cwd=ROOT,
                            stdout=subprocess.DEVNULL)
    if result.returncode != 0:
        sys.exit("Build stopped: the mock tests failed (run node tools/sim/run.mjs to see why).")
    print("all passed")


def main():
    parser = argparse.ArgumentParser(description="Build the Crew .mcaddon.")
    parser.add_argument("--skip-tests", action="store_true", help="don't run the mock tests first")
    parser.add_argument("--out", default=str(ROOT / "dist"), help="output folder (default dist/)")
    args = parser.parse_args()

    try:
        version = bump_version.current_version()
    except ValueError as e:
        sys.exit(f"Build stopped: {e}\nSet one version with: python tools/bump_version.py <x.y.z>")
    print(f"== Crew Workers {version}")

    if not args.skip_tests:
        run_tests()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"crew-addon-{version}.mcaddon"
    out.write_bytes(zip_bytes([
        ("crew_bp.mcpack", zip_bytes(pack_files("crew_bp"))),
        ("crew_rp.mcpack", zip_bytes(pack_files("crew_rp"))),
    ]))
    print(f"== built {out} ({out.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
