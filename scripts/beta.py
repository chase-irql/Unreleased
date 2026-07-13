#!/usr/bin/env python3
"""
Unreleased Music Player — Beta Build Script

Builds a shareable installer for bug testers WITHOUT releasing:
  - no version bump, no commits, no pushes, no GitHub release.

Unlike release.py (which builds the nsis-web stub that downloads the app
package from GitHub Releases at install time), this builds a FULL offline
NSIS installer — one self-contained .exe you can send directly to testers.

  1. Pick an optional build label (e.g. "beta1")
  2. Build the renderer (tsc + vite)
  3. Package the full offline installer (electron-builder, nsis target)
  4. Copy it into beta-builds/ with a labeled name + build-info.txt
"""

import os, sys, shutil, subprocess, json, datetime
if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"): sys.stderr.reconfigure(encoding="utf-8")

# Enable ANSI colours on Windows
if sys.platform == "win32":
    os.system("")

from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
ROOT     = Path(__file__).parent.parent
OUT_DIR  = ROOT / "beta-builds"

# ── ANSI helpers ──────────────────────────────────────────────────────────────
RST  = "\033[0m"
BOLD = "\033[1m"
DIM  = "\033[2m"
RED  = "\033[91m"
GRN  = "\033[92m"
YLW  = "\033[93m"
CYN  = "\033[96m"
WHT  = "\033[97m"

def _c(text, *codes):
    return "".join(codes) + str(text) + RST

def banner():
    w = 66
    print()
    print(_c("╔" + "═"*(w-2) + "╗", CYN, BOLD))
    row = "  🧪  UNRELEASED  —  Beta Build (testers only)  "
    print(_c("║", CYN, BOLD) + _c(row.ljust(w-2), WHT, BOLD) + _c("║", CYN, BOLD))
    print(_c("╚" + "═"*(w-2) + "╝", CYN, BOLD))
    print()

def section(n, total, title):
    print()
    bar = "─" * 52
    print(_c(f"  [{n}/{total}]  {title}", WHT, BOLD))
    print(_c("  " + bar, DIM))
    print()

def ok(msg):     print(_c("  ✓  ", GRN, BOLD)  + msg)
def info(msg):   print(_c("  ·  ", CYN)         + msg)
def warn(msg):   print(_c("  ⚠  ", YLW, BOLD)  + msg)
def detail(msg): print(_c("     " + msg, DIM))

def die(msg):
    print()
    print(_c("  ✗  ", RED, BOLD) + _c(msg, RED))
    wait()
    sys.exit(1)

def ask(prompt, default=""):
    hint = _c(f"  [{default}]", DIM) if default else ""
    try:
        ans = input(_c(f"\n  ▶  {prompt}", CYN, BOLD) + hint + _c(": ", CYN, BOLD)).strip()
    except KeyboardInterrupt:
        print()
        die("Cancelled.")
    return ans if ans else default

def wait():
    try:
        input(_c("\n\n  Press Enter to close…", DIM))
    except (EOFError, KeyboardInterrupt):
        pass

def capture(cmd):
    r = subprocess.run(cmd, shell=True, cwd=ROOT, capture_output=True, text=True)
    return r.stdout.strip()

def load_version():
    pkg = json.loads((ROOT / "package.json").read_text("utf-8"))
    return pkg["version"]

# ── Steps ─────────────────────────────────────────────────────────────────────

TOTAL = 4

def prompt_label():
    section(1, TOTAL, "Build label")
    version = load_version()
    info(f"Current version: {_c(version, WHT, BOLD)}  (not changed by this script)")
    label = ask("Label for this build (goes in the filename)", default="beta")
    # Keep it filename-safe
    label = "".join(ch for ch in label if ch.isalnum() or ch in "-_.") or "beta"
    ok(f"Build: {_c(f'{version}-{label}', WHT, BOLD)}")
    return version, label


def step_build_renderer():
    section(2, TOTAL, "Build renderer")
    warn("This takes a while — output streams below")
    print()

    # Rebuild the renderer FIRST so dist/ is fresh. electron-builder only
    # packages whatever is already in dist/ — skipping this ships a stale
    # renderer (old bugs) to testers.
    info("Compiling renderer (npm run build)…")
    r = subprocess.run("npm run build", shell=True, cwd=ROOT)
    print()
    if r.returncode != 0:
        die("Renderer build failed (tsc / vite). See output above.")
    ok("Renderer compiled → dist/")


def step_build_installer(version):
    section(3, TOTAL, "Package offline installer")

    # Clear any previous full installer for this version so we can't pick up
    # a stale artifact after the build.
    release_dir = ROOT / "release"
    if release_dir.exists():
        for stale in release_dir.glob(f"Unreleased-Setup-{version}.exe*"):
            stale.unlink()

    # `--win nsis` overrides the nsis-web target from package.json: a full
    # offline installer that bundles the app instead of downloading it from
    # GitHub Releases (which don't exist yet for an unreleased build).
    info("Packaging installer (electron-builder, nsis)…")
    r = subprocess.run(
        r"node_modules\.bin\electron-builder.cmd --win nsis --publish never",
        shell=True, cwd=ROOT,
    )
    print()
    if r.returncode != 0:
        die("Build failed. See output above.")

    installer = release_dir / f"Unreleased-Setup-{version}.exe"
    if not installer.exists():
        die(f"Expected installer not found:\n  {installer}")
    ok("Installer built")
    return installer


def step_save(installer, version, label):
    section(4, TOTAL, "Save to beta-builds/")

    stamp     = datetime.datetime.now().strftime("%Y-%m-%d_%H%M")
    build_dir = OUT_DIR / f"v{version}-{label}-{stamp}"
    build_dir.mkdir(parents=True, exist_ok=True)

    dest = build_dir / f"Unreleased-Setup-{version}-{label}.exe"
    shutil.copy2(installer, dest)

    commit = capture("git rev-parse --short HEAD") or "unknown"
    branch = capture("git rev-parse --abbrev-ref HEAD") or "unknown"
    dirty  = "yes" if capture("git status --porcelain") else "no"
    (build_dir / "build-info.txt").write_text(
        f"Unreleased beta build\n"
        f"version:  {version}\n"
        f"label:    {label}\n"
        f"built:    {stamp}\n"
        f"branch:   {branch}\n"
        f"commit:   {commit}\n"
        f"uncommitted changes: {dirty}\n",
        "utf-8",
    )

    size_mb = dest.stat().st_size / 1_048_576
    ok(f"Saved: {_c(dest.name, WHT, BOLD)}  ({size_mb:.1f} MB)")
    detail(str(build_dir))

    # Open the folder so it's ready to drag into Discord/etc.
    if sys.platform == "win32":
        subprocess.run(f'explorer "{build_dir}"', shell=True)

    return build_dir


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    banner()
    try:
        version, label = prompt_label()
        step_build_renderer()
        installer = step_build_installer(version)
        build_dir = step_save(installer, version, label)

        print()
        print(_c("  " + "═" * 46, GRN, BOLD))
        print(_c(f"  ✓  Beta build v{version}-{label} ready to send!", GRN, BOLD))
        print(_c("  " + "═" * 46, GRN, BOLD))
        print()
        info("Nothing was committed, pushed, or released.")
        warn("Note: if a newer version is already on GitHub Releases, the")
        warn("auto-updater may update testers past this build after install.")

    except KeyboardInterrupt:
        print()
        warn("Interrupted.")
    except SystemExit:
        raise
    except Exception as exc:
        die(str(exc))

    wait()


if __name__ == "__main__":
    main()
