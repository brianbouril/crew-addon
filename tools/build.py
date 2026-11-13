"""Packages crew_bp + crew_rp into crew-addon.mcaddon (a zip of two .mcpack zips). Usage: python3 tools/build.py"""
import os, zipfile, io
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def pack(folder):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        base = os.path.join(ROOT, folder)
        for d, _, files in os.walk(base):
            for f in sorted(files):
                full = os.path.join(d, f)
                z.write(full, os.path.relpath(full, base))
    return buf.getvalue()

out = os.path.join(ROOT, "crew-addon.mcaddon")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("crew_bp.mcpack", pack("crew_bp"))
    z.writestr("crew_rp.mcpack", pack("crew_rp"))
print("wrote", out, os.path.getsize(out), "bytes")
