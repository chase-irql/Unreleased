#!/usr/bin/env python3
"""
Unreleased Music Player — Interactive Release Script

Just run it — no arguments needed.

All prompts are asked up front, then everything else runs unattended:
  1. Pick a version (bump patch / minor / major, or keep / custom)
  2. Enter a commit message (only if the tree is dirty)
  3. Enter release notes (blank = auto-generate from commits)
     and choose stable or beta. Betas are NEVER uploaded to GitHub —
     they're privately published to juicewrldapi.com's gated backend,
     only reachable with a beta access code (see build/fetch-releases.ps1
     for the endpoint contract). Stable releases are unaffected.
  ── nothing left to answer past this point ──
  4. Commit all changes to the desktop branch (app)
  5. Build the renderer + Electron installers (offline + web)
  6. Push the desktop branch to GitHub
  7. Sync the web branch (copies src/ + package.json from app, skips
     electron/) — skipped for beta releases, betas are desktop-only
  8. Stable: create the GitHub release and upload all assets.
     Beta: publish privately to the gated backend instead (needs
     BETA_ADMIN_TOKEN in .env.local).
"""

import os, sys, re, json, subprocess, time, urllib.request, urllib.error, urllib.parse
if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"): sys.stderr.reconfigure(encoding="utf-8")

# Enable ANSI colours on Windows
if sys.platform == "win32":
    os.system("")

from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
ROOT         = Path(__file__).parent.parent
REPO_OWNER   = "leanwrldd"
REPO_NAME    = "unreleased"
APP_BRANCH   = "app"
WEB_BRANCH   = "web"
API_BASE     = "https://api.github.com"
UPLOAD_BASE  = "https://uploads.github.com"
BETA_API_BASE = "https://juicewrldapi.com/beta"

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
    row = "  🎵  UNRELEASED  —  Release & Publish  "
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

def confirm(prompt, default=True):
    yn = "Y/n" if default else "y/N"
    return ask(f"{prompt} ({yn})", "y" if default else "n").lower() in ("y", "yes")

def wait():
    try:
        input(_c("\n\n  Press Enter to close…", DIM))
    except (EOFError, KeyboardInterrupt):
        pass

# ── Shell ─────────────────────────────────────────────────────────────────────

def run(cmd, check=True):
    detail(f"> {cmd}")
    r = subprocess.run(cmd, shell=True, cwd=ROOT)
    if check and r.returncode != 0:
        die(f"Command failed (exit {r.returncode}):\n  {cmd}")
    return r

def capture(cmd):
    r = subprocess.run(cmd, shell=True, cwd=ROOT, capture_output=True, text=True)
    return r.stdout.strip()

def is_dirty():
    return bool(capture("git status --porcelain"))

def git_branch():
    return capture("git rev-parse --abbrev-ref HEAD")

# ── package.json ──────────────────────────────────────────────────────────────

def load_version():
    pkg = json.loads((ROOT / "package.json").read_text("utf-8"))
    return pkg["version"]

def set_version(new_ver):
    path = ROOT / "package.json"
    text = path.read_text("utf-8")
    new_text, n = re.subn(r'("version"\s*:\s*)"[^"]+"', rf'\g<1>"{new_ver}"', text, count=1)
    if n == 0:
        die("Could not find version field in package.json")
    path.write_text(new_text, "utf-8")

def bump(v, part):
    # a current version like 1.15.0-beta.1 bumps from its 1.15.0 base
    maj, mn, pat = map(int, v.split("-")[0].split("."))
    if part == "major": return f"{maj+1}.0.0"
    if part == "minor": return f"{maj}.{mn+1}.0"
    return f"{maj}.{mn}.{pat+1}"

# ── GitHub API ────────────────────────────────────────────────────────────────

def get_token():
    t = os.environ.get("GH_TOKEN")
    if t: return t
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("GH_TOKEN="):
                return line.split("=", 1)[1].strip()
    die("GH_TOKEN not found.\nSet it as an environment variable or add GH_TOKEN=xxx to .env.local")

def get_beta_admin_token():
    t = os.environ.get("BETA_ADMIN_TOKEN")
    if t: return t
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("BETA_ADMIN_TOKEN="):
                val = line.split("=", 1)[1].strip()
                if val: return val
    die("BETA_ADMIN_TOKEN not found.\nAdd BETA_ADMIN_TOKEN=xxx to .env.local — this is the admin secret\n"
        "for juicewrldapi.com's POST /beta/admin/publish endpoint, separate\n"
        "from GH_TOKEN. Only needed for beta releases.")

def api(method, path, token, data=None):
    url  = f"{API_BASE}{path}"
    hdrs = {
        "Authorization": f"token {token}",
        "Accept":        "application/vnd.github+json",
        "Content-Type":  "application/json",
        "User-Agent":    "release.py",
    }
    body = json.dumps(data).encode() if data else None
    req  = urllib.request.Request(url, data=body, headers=hdrs, method=method)
    with urllib.request.urlopen(req) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else {}

# ── Upload with live progress bar ─────────────────────────────────────────────

class _ProgressFile:
    def __init__(self, path):
        self._f    = open(path, "rb")
        self._size = path.stat().st_size
        self._done = 0
    def read(self, n=-1):
        chunk = self._f.read(n)
        self._done += len(chunk)
        pct = self._done * 100 // self._size if self._size else 100
        bar = "#" * (pct // 2) + "-" * (50 - pct // 2)
        mb_d, mb_t = self._done / 1_048_576, self._size / 1_048_576
        print(f"\r     [{bar}] {pct:3d}%  {mb_d:.1f}/{mb_t:.1f} MB", end="", flush=True)
        return chunk
    def __len__(self):  return self._size
    def close(self):    self._f.close()

def upload_asset(release_id, filepath, token):
    name = filepath.name
    size = filepath.stat().st_size
    print(f"\n  Uploading: {_c(name, WHT, BOLD)}  ({size/1_048_576:.1f} MB)")
    url = (f"{UPLOAD_BASE}/repos/{REPO_OWNER}/{REPO_NAME}"
           f"/releases/{release_id}/assets?name={urllib.parse.quote(name)}")
    hdrs = {
        "Authorization":  f"token {token}",
        "Accept":         "application/vnd.github+json",
        "Content-Type":   "application/octet-stream",
        "Content-Length": str(size),
        "User-Agent":     "release.py",
    }
    wrap = _ProgressFile(filepath)
    req  = urllib.request.Request(url, data=wrap, headers=hdrs, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            print(f"\n  {_c('✓', GRN, BOLD)}  {result['browser_download_url']}")
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        print(f"\n  HTTP {e.code}: {body[:300]}")
        raise
    finally:
        wrap.close()

# ── Beta publish (private — never touches GitHub) ─────────────────────────────
# Streams a multipart/form-data body (fields + files) without loading the
# whole installer into memory at once, same idea as _ProgressFile above but
# composed from multiple segments (boundary text + one or more files).

class _MultipartUpload:
    def __init__(self, boundary, fields, files):
        self._segments = []  # ('bytes', b'...') | ('file', Path)
        for name, value in fields.items():
            self._segments.append(("bytes",
                f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode("utf-8")))
        for name, path in files.items():
            header = (f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{path.name}"\r\n'
                      f'Content-Type: application/octet-stream\r\n\r\n').encode("utf-8")
            self._segments.append(("bytes", header))
            self._segments.append(("file", path))
            self._segments.append(("bytes", b"\r\n"))
        self._segments.append(("bytes", f"--{boundary}--\r\n".encode("utf-8")))

        self._size = sum(len(d) if k == "bytes" else d.stat().st_size for k, d in self._segments)
        self._idx = 0
        self._fh = None
        self._done = 0

    def __len__(self):
        return self._size

    def _report(self):
        pct = self._done * 100 // self._size if self._size else 100
        bar = "#" * (pct // 2) + "-" * (50 - pct // 2)
        mb_d, mb_t = self._done / 1_048_576, self._size / 1_048_576
        print(f"\r     [{bar}] {pct:3d}%  {mb_d:.1f}/{mb_t:.1f} MB", end="", flush=True)

    def read(self, n=-1):
        while self._idx < len(self._segments):
            kind, data = self._segments[self._idx]
            if kind == "bytes":
                self._idx += 1
                if data:
                    self._done += len(data)
                    self._report()
                    return data
                continue
            if self._fh is None:
                self._fh = open(data, "rb")
            chunk = self._fh.read(n if n and n > 0 else 1_048_576)
            if chunk:
                self._done += len(chunk)
                self._report()
                return chunk
            self._fh.close()
            self._fh = None
            self._idx += 1
        return b""

    def close(self):
        if self._fh:
            self._fh.close()

def upload_beta(url, token, fields, files):
    boundary = f"----unreleased-{int(time.time())}"
    wrap = _MultipartUpload(boundary, fields, files)
    print(f"\n  Uploading: {_c(', '.join(p.name for p in files.values()), WHT, BOLD)}  ({len(wrap)/1_048_576:.1f} MB)")
    req = urllib.request.Request(url, data=wrap, method="POST", headers={
        "Authorization":  f"Bearer {token}",
        "Content-Type":   f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(wrap)),
        "User-Agent":     "release.py",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            print()
            return resp.read()
    finally:
        wrap.close()

def sha512_base64(path):
    import hashlib, base64
    h = hashlib.sha512()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1_048_576), b""):
            h.update(chunk)
    return base64.b64encode(h.digest()).decode("ascii")

# ── Prompts (collected up front, before any build/deploy/commit) ──────────────

TOTAL = 8

def prompt_version():
    section(1, TOTAL, "Version")
    cur = load_version()
    info(f"Current version: {_c(cur, WHT, BOLD)}")
    print()
    opts = [
        ("1", "keep",   cur,              "Keep current"),
        ("2", "patch",  bump(cur,"patch"),"Bump patch  "),
        ("3", "minor",  bump(cur,"minor"),"Bump minor  "),
        ("4", "major",  bump(cur,"major"),"Bump major  "),
        ("5", "custom", None,             "Custom…     "),
    ]
    for k, _, v, label in opts:
        print(_c(f"    {k}) {label}  {v or '?'}", DIM))

    choice = ask("Choice", default="2")
    entry  = next((o for o in opts if o[0] == choice), None)
    if not entry:
        die("Invalid choice.")

    _, part, new_ver, _ = entry
    if part == "custom":
        new_ver = ask("Version (e.g. 2.0.0 or 1.15.0-beta.1)")
        if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", new_ver):
            die("Invalid format. Use major.minor.patch, optionally with a\n"
                "pre-release suffix (e.g. 1.15.0-beta.1)")
    elif part == "keep":
        ok(f"Keeping {_c(cur, WHT, BOLD)}")
        return cur

    ok(f"Version: {cur}  →  {_c(new_ver, WHT, BOLD)}")
    return new_ver


def prompt_commit_message(version):
    section(2, TOTAL, f"Commit message")

    if is_dirty():
        info("Uncommitted changes:")
        for line in capture("git status --short").splitlines():
            detail(line)
        return ask("Commit message", default=f"v{version}")
    else:
        ok("Nothing to commit — tree is clean")
        return None


def prompt_release_notes():
    section(3, TOTAL, "Release notes")
    notes = ask("Release notes  (blank = auto-generate from commits)", default="")
    # Beta builds are NEVER uploaded to GitHub — they're published privately
    # to the gated backend (see step_publish_beta), reachable only with a
    # beta access code. Regular users and stable auto-updates never see them.
    is_beta = confirm("Publish as beta (gated — not a public GitHub release)?", default=False)
    return notes, is_beta


# ── Steps (run only after every prompt above has been answered) ──────────────

def step_apply_version(new_ver):
    set_version(new_ver)


def step_commit(version, msg):
    section(4, TOTAL, f"Commit → {APP_BRANCH}")

    if git_branch() != APP_BRANCH:
        info(f"Switching to {APP_BRANCH}")
        run(f"git checkout {APP_BRANCH}")

    if msg is not None:
        run("git add -A")
        run(f'git commit -m "{msg}"')
        ok(f"Committed: {msg}")
    else:
        ok("Nothing to commit — tree is clean")


def step_build():
    section(5, TOTAL, "Build Electron app")
    warn("This takes ~2 minutes — output streams below")
    print()

    # 1. Rebuild the renderer FIRST (tsc --noEmit && vite build) so dist/ is
    #    fresh. electron-builder only packages whatever is already in dist/ —
    #    skipping this ships a stale renderer (old bugs) under a new version.
    info("Compiling renderer (npm run build)…")
    renderer = subprocess.run("npm run build", shell=True, cwd=ROOT)
    print()
    if renderer.returncode != 0:
        die("Renderer build failed (tsc / vite). See output above.")
    ok("Renderer compiled → dist/")
    print()

    # 2. Package the Electron installers (offline nsis + web nsis-web) from the
    #    freshly built dist/. Clear last build's artifacts first — the
    #    web-installer stub has a version-free name (Unreleased-Setup.exe), so
    #    a stale copy is indistinguishable from a fresh one at upload time.
    for directory, patterns in (
        (ROOT / "release" / "nsis-web", ("Unreleased-Setup*.exe*", "latest.yml", "*.nsis.7z")),
        (ROOT / "release", ("Unreleased-Setup*.exe*", "latest.yml")),
    ):
        if directory.exists():
            for pattern in patterns:
                for stale in directory.glob(pattern):
                    stale.unlink()

    info("Packaging installer (electron-builder)…")
    result = subprocess.run(
        r"node_modules\.bin\electron-builder.cmd --win --publish never",
        shell=True, cwd=ROOT,
    )
    print()
    if result.returncode != 0:
        die("Build failed. See output above.")
    ok("Build complete")


def step_push_app():
    section(6, TOTAL, f"Push → origin/{APP_BRANCH}")
    run(f"git push origin {APP_BRANCH}")
    ok(f"Pushed to origin/{APP_BRANCH}")


def step_sync_web(version, is_beta=False):
    if is_beta:
        # The web branch is the live site (Vercel) — beta builds are
        # desktop-only and must never deploy there.
        section(7, TOTAL, f"Sync → {WEB_BRANCH}  (skipped)")
        info("Beta release — desktop-only, web branch left untouched.")
        return

    section(7, TOTAL, f"Sync → {WEB_BRANCH}  (electron/ excluded)")

    original = git_branch()
    try:
        run(f"git checkout {WEB_BRANCH}")

        # Pull only the web-safe directories from app branch.
        #   `git checkout app -- src/` copies files that EXIST in app but does
        #   NOT remove files that were DELETED in app — they'd linger on web
        #   forever. So first delete files that app no longer has, then restore.
        deleted = capture(
            f"git diff --diff-filter=D --name-only {WEB_BRANCH} {APP_BRANCH} -- src/"
        ).splitlines()
        for f in deleted:
            if f.strip():
                run(f'git rm -q --ignore-unmatch "{f.strip()}"', check=False)
        run(f"git checkout {APP_BRANCH} -- src/ package.json package-lock.json")

        if not is_dirty():
            info("Web branch already up to date.")
            return

        staged = capture("git diff --cached --name-only").splitlines()
        info(f"Syncing {len(staged)} file(s) to {WEB_BRANCH}")
        for f in staged[:8]:
            detail(f)
        if len(staged) > 8:
            detail(f"… and {len(staged)-8} more")

        run("git add -A")
        run(f'git commit -m "v{version}"')
        run(f"git push origin {WEB_BRANCH} --force")
        ok(f"Web branch synced and pushed")

    finally:
        cur = git_branch()
        if cur != original:
            run(f"git checkout {original}")


def step_publish_beta(version, notes):
    section(8, TOTAL, "Beta publish  (gated backend, not GitHub)")
    tag = f"v{version}"
    token = get_beta_admin_token()

    exe = ROOT / "release" / f"Unreleased-Setup-{version}.exe"
    if not exe.exists():
        die(f"No {exe.name} in release/\nDid the build succeed?")

    info("Computing checksum…")
    sha512 = sha512_base64(exe)
    size = exe.stat().st_size
    yml_path = ROOT / "release" / "latest-beta.yml"
    yml_path.write_text(
        f"version: {version}\n"
        f"path: {exe.name}\n"
        f"sha512: {sha512}\n"
        f"files:\n"
        f"  - url: {exe.name}\n"
        f"    sha512: {sha512}\n"
        f"    size: {size}\n"
        f"releaseDate: '{time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime())}'\n",
        "utf-8",
    )

    if not notes:
        notes = capture(
            f'git log $(git describe --tags --abbrev=0 2>nul)..HEAD --pretty="- %s" --no-merges 2>nul'
            if sys.platform == "win32" else
            f'git log $(git describe --tags --abbrev=0 2>/dev/null)..HEAD --pretty="- %s" --no-merges 2>/dev/null'
        ) or f"Beta {tag}"

    info(f"Publishing {_c(tag, WHT, BOLD)} to {BETA_API_BASE}/admin/publish …")
    try:
        upload_beta(
            f"{BETA_API_BASE}/admin/publish", token,
            fields={"version": version, "tag": tag, "notes": notes},
            files={"installer": exe, "latest_yml": yml_path},
        )
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        die(f"Beta publish failed: HTTP {e.code}\n{body[:300]}")

    ok("Beta build published — private, not a public GitHub release")
    print()
    print(_c(f"  🧪  Beta {tag} is live for code holders only.", GRN, BOLD))


def step_release(version, token, notes):
    section(8, TOTAL, "GitHub release")
    tag         = f"v{version}"
    release_dir = ROOT / "release" / "nsis-web"

    # Collect assets to upload. The nsis-web target produces a small
    # version-free stub installer (stable name so the GitHub
    # releases/latest/download/Unreleased-Setup.exe link always serves the
    # newest release) plus a versioned .7z app package the stub downloads
    # at install time. electron-updater also fetches the .7z, so it MUST
    # be uploaded alongside latest.yml. (No separate .blockmap files —
    # the block map is embedded in the .7z.)
    # The nsis target additionally produces a full offline installer
    # (Unreleased-Setup-<version>.exe at release/ root) — a standalone
    # download that the maintenance page's version picker also prefers.
    # latest.yml comes from nsis-web (its root nsis twin points at the
    # offline exe and must NOT be uploaded, or updates would fetch the
    # full exe instead of the differential .7z).
    to_upload = []
    candidates = [
        release_dir / "latest.yml",
        release_dir / "Unreleased-Setup.exe",
        *sorted(release_dir.glob(f"unreleased-{version}-*.nsis.7z")),
        ROOT / "release" / f"Unreleased-Setup-{version}.exe",
    ]
    for p in candidates:
        if p.exists():
            to_upload.append(p)
        else:
            warn(f"Not found (skipping): {p.name}")

    if not any(p.name.endswith(".nsis.7z") for p in to_upload):
        die(f"No unreleased-{version}-*.nsis.7z package in {release_dir}/\n"
            "The web installer is useless without it. Did the build succeed?")

    if not to_upload:
        die(f"No release assets found in {release_dir}/\nDid the build succeed?")

    if not notes:
        # Auto-generate from commits since last tag
        notes = capture(
            f'git log $(git describe --tags --abbrev=0 2>nul)..HEAD --pretty="- %s" --no-merges 2>nul'
            if sys.platform == "win32" else
            f'git log $(git describe --tags --abbrev=0 2>/dev/null)..HEAD --pretty="- %s" --no-merges 2>/dev/null'
        ) or f"Release {tag}"

    # Create or fetch the release
    info(f"Creating release {_c(tag, WHT, BOLD)} on GitHub…")
    try:
        release = api("POST",
            f"/repos/{REPO_OWNER}/{REPO_NAME}/releases", token,
            {"tag_name": tag, "name": tag, "body": notes,
             "target_commitish": APP_BRANCH,
             "draft": False, "prerelease": False})
        ok(f"Release created  (id={release['id']})")
    except urllib.error.HTTPError as e:
        if e.code == 422:
            release = api("GET",
                f"/repos/{REPO_OWNER}/{REPO_NAME}/releases/tags/{tag}", token)
            api("PATCH",
                f"/repos/{REPO_OWNER}/{REPO_NAME}/releases/{release['id']}", token,
                {"prerelease": False, "body": notes})
            ok(f"Release already exists — updated  (id={release['id']})")
        else:
            raise

    release_id = release["id"]

    # Delete any pre-existing assets with the same name
    try:
        existing = {a["name"]: a["id"] for a in
                    api("GET", f"/repos/{REPO_OWNER}/{REPO_NAME}/releases/{release_id}/assets", token)}
    except Exception:
        existing = {}

    for fp in to_upload:
        if fp.name in existing:
            info(f"Replacing existing asset: {fp.name}")
            api("DELETE", f"/repos/{REPO_OWNER}/{REPO_NAME}/releases/assets/{existing[fp.name]}", token)

    for fp in to_upload:
        upload_asset(release_id, fp, token)

    url = f"https://github.com/{REPO_OWNER}/{REPO_NAME}/releases/tag/{tag}"
    print()
    print(_c(f"  🚀  {url}", GRN, BOLD))


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    banner()
    try:
        token = get_token()

        # ── Every user prompt happens first — once these are answered, the
        #    rest of the release runs unattended (build, push, sync, commit).
        version = prompt_version()
        step_apply_version(version)
        commit_msg = prompt_commit_message(version)
        release_notes, is_beta = prompt_release_notes()

        step_commit(version, commit_msg)
        step_build()
        step_push_app()
        step_sync_web(version, is_beta)
        if is_beta:
            step_publish_beta(version, release_notes)
        else:
            step_release(version, token, release_notes)

        print()
        print(_c("  " + "═" * 46, GRN, BOLD))
        print(_c(f"  ✓  v{version} released successfully!", GRN, BOLD))
        print(_c("  " + "═" * 46, GRN, BOLD))
        print()

    except KeyboardInterrupt:
        print()
        warn("Interrupted.")
    except SystemExit:
        raise
    except Exception as exc:
        die(str(exc))
    finally:
        # Always land back on the desktop branch
        try:
            if git_branch() != APP_BRANCH:
                subprocess.run(f"git checkout {APP_BRANCH}", shell=True, cwd=ROOT)
        except Exception:
            pass

    wait()


if __name__ == "__main__":
    main()
