#!/usr/bin/env python3
"""Recalculate every formula in an .xlsx with LibreOffice, in place.

    python3 build/recalc_lo.py book.xlsx [timeout_seconds]

openpyxl writes formulas with no cached values; this opens the file in a
headless LibreOffice with a throwaway profile, runs calculateAll() and saves.
Exits non-zero if LibreOffice is missing or the file was not rewritten.
On macOS it looks in /Applications/LibreOffice.app as well as PATH."""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

MACRO = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE script:module PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "module.dtd">
<script:module xmlns:script="http://openoffice.org/2000/script" script:name="Module1" script:language="StarBasic">
Sub RecalculateAndSave()
  ThisComponent.calculateAll()
  ThisComponent.store()
  ThisComponent.close(True)
End Sub
</script:module>"""


def soffice():
    for c in (shutil.which("soffice"), shutil.which("libreoffice"),
              "/Applications/LibreOffice.app/Contents/MacOS/soffice"):
        if c and Path(c).exists():
            return c
    sys.exit("LibreOffice (soffice) not found — install it to run the workbook parity check")


def recalc(path, timeout=300):
    """Works on a private copy and writes the result back, so LibreOffice's
    .~lock files never land beside the user's workbook."""
    exe, final = soffice(), Path(path).resolve()
    env = dict(os.environ, SAL_USE_VCLPLUGIN="svp")
    with tempfile.TemporaryDirectory(prefix="gp_lo_") as prof:
        work = Path(prof) / "work" / final.name
        work.parent.mkdir()
        shutil.copyfile(final, work)
        path = str(work)
        url = Path(prof).as_uri()
        subprocess.run([exe, "--headless", "--terminate_after_init", f"-env:UserInstallation={url}"],
                       capture_output=True, timeout=timeout, env=env)
        mdir = Path(prof) / "user" / "basic" / "Standard"
        if not mdir.exists():
            sys.exit("LibreOffice did not create a profile; nothing recalculated")
        (mdir / "Module1.xba").write_text(MACRO)
        before = os.stat(path).st_mtime_ns
        r = subprocess.run([exe, "--headless", "--norestore", f"-env:UserInstallation={url}",
                            "vnd.sun.star.script:Standard.Module1.RecalculateAndSave?language=Basic&location=application",
                            path], capture_output=True, text=True, timeout=timeout, env=env)
        if r.returncode != 0 or os.stat(path).st_mtime_ns == before:
            sys.exit(f"LibreOffice did not recalculate {final}: {r.stderr.strip()}")
        with open(final, "wb") as out:
            out.write(work.read_bytes())


if __name__ == "__main__":
    recalc(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 300)
    print("recalculated", sys.argv[1])
