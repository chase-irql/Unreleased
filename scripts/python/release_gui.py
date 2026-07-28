#!/usr/bin/env python3
"""
Unreleased Music Player — Release & Publish (GUI)

A windowed wizard front-end for release.py. Same pipeline (version bump →
commit → build → push → sync web → publish), just click-through instead of
terminal prompts, with a live log and progress bar for the build/upload.

release.py itself is untouched as a script — this file loads it dynamically
from the target repo (see resolve_root/load_release_core below) and drives
its reusable helpers (load_version, api, upload_asset, upload_beta, …)
from a background thread so the UI never blocks.
"""

import sys, os, re, io, json, time, shutil, subprocess, importlib.util, urllib.error
from pathlib import Path

from PySide6.QtCore import Qt, QThread, Signal
from PySide6.QtGui import QIcon, QFont, QTextCursor, QCloseEvent
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QStackedWidget, QVBoxLayout, QHBoxLayout,
    QLabel, QLineEdit, QPlainTextEdit, QRadioButton, QButtonGroup, QCheckBox,
    QPushButton, QProgressBar, QFileDialog, QMessageBox, QFrame, QSizePolicy,
    QScrollArea,
)

APP_TITLE   = "Unreleased — Release & Publish"
CONFIG_DIR  = Path(os.environ.get("APPDATA", str(Path.home()))) / "Unreleased"
CONFIG_FILE = CONFIG_DIR / "release-gui.json"


# ── Locate the project repo ───────────────────────────────────────────────────
# This file is meant to end up as a standalone .exe that can live anywhere
# (Desktop, a tools/ folder, wherever), so it can't assume __file__ sits next
# to the repo the way release.py's own ROOT computation does. Instead it
# remembers the last folder the user pointed it at (or a UNRELEASED_ROOT env
# var), and falls back to "next to this script" only when running un-frozen
# during development.

def is_valid_root(p) -> bool:
    p = Path(p)
    return (p / "package.json").exists() and (p / "scripts" / "python" / "release.py").exists()

def load_saved_root():
    try:
        data = json.loads(CONFIG_FILE.read_text("utf-8"))
        root = data.get("root")
        if root and is_valid_root(root):
            return Path(root)
    except Exception:
        pass
    return None

def save_root(p):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps({"root": str(p)}), "utf-8")

def dev_root():
    if getattr(sys, "frozen", False):
        return None
    return Path(__file__).resolve().parent.parent.parent

def resolve_root(parent=None):
    env = os.environ.get("UNRELEASED_ROOT")
    if env and is_valid_root(env):
        return Path(env)
    saved = load_saved_root()
    if saved:
        return saved
    dev = dev_root()
    if dev and is_valid_root(dev):
        return dev
    while True:
        chosen = QFileDialog.getExistingDirectory(
            parent, "Locate the Unreleased project folder (contains package.json)")
        if not chosen:
            return None
        if is_valid_root(chosen):
            save_root(chosen)
            return Path(chosen)
        QMessageBox.warning(
            parent, "Not a valid project folder",
            f"{chosen}\n\ndoesn't look like the Unreleased repo "
            "(missing package.json / scripts/python/release.py). Try again.")

def load_release_core(root: Path):
    """Load the *actual* release.py living in the target repo, so its own
    ROOT computation (Path(__file__).parent.parent.parent) resolves correctly
    and this GUI always drives whatever version of the script is checked out."""
    spec = importlib.util.spec_from_file_location("release_core", str(root / "scripts" / "python" / "release.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def read_env_local(root: Path, key: str):
    p = root / ".env.local"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip()
    return None

def get_gh_token(root: Path):
    return os.environ.get("GH_TOKEN") or read_env_local(root, "GH_TOKEN")

def get_beta_token(root: Path):
    return os.environ.get("BETA_ADMIN_TOKEN") or read_env_local(root, "BETA_ADMIN_TOKEN")


# ── Theme ──────────────────────────────────────────────────────────────────────
# Matches the player's own dark palette (index.css): near-black surfaces,
# Spotify-green accent.

QSS = """
QWidget { background: #121212; color: #ffffff; font-size: 13px; }
QMainWindow { background: #121212; }
#Sidebar { background: #000000; }
#Card { background: #1a1a1a; border-radius: 10px; }
QLabel[role="title"] { font-size: 20px; font-weight: 700; color: #ffffff; }
QLabel[role="subtitle"] { color: #b3b3b3; font-size: 12.5px; }
QLabel[role="step"] { color: #1db954; font-weight: 700; letter-spacing: 1px; font-size: 11px; }
QLabel[role="hint"] { color: #6b6b6b; font-size: 11.5px; }
QLineEdit, QPlainTextEdit {
    background: #242424; border: 1px solid #2a2a2a; border-radius: 6px;
    padding: 8px; color: #ffffff; selection-background-color: #1db954;
}
QLineEdit:focus, QPlainTextEdit:focus { border: 1px solid #1db954; }
QRadioButton, QCheckBox { spacing: 8px; padding: 4px 0; }
QRadioButton::indicator, QCheckBox::indicator { width: 16px; height: 16px; }
QRadioButton::indicator {
    border-radius: 8px; border: 1.5px solid #6b6b6b; background: #121212;
}
QRadioButton::indicator:hover { border-color: #b3b3b3; }
QRadioButton::indicator:checked {
    border: 1.5px solid #1db954; background: #1db954;
}
QCheckBox::indicator {
    border-radius: 4px; border: 1.5px solid #6b6b6b; background: transparent;
}
QCheckBox::indicator:hover { border-color: #b3b3b3; }
QCheckBox::indicator:checked { border: 1.5px solid #1db954; background: #1db954; }
QPushButton {
    background: #242424; border: 1px solid #2a2a2a; border-radius: 18px;
    padding: 9px 22px; font-weight: 600; color: #ffffff;
}
QPushButton:hover { background: #2a2a2a; }
QPushButton:disabled { color: #6b6b6b; }
QPushButton#Primary { background: #1db954; color: #000000; border: none; }
QPushButton#Primary:hover { background: #1ed760; }
QPushButton#Primary:disabled { background: #1a3a26; color: #6b6b6b; }
QPushButton#Ghost { background: transparent; border: none; color: #b3b3b3; }
QPushButton#Ghost:hover { color: #ffffff; }
QProgressBar {
    background: #242424; border: none; border-radius: 6px; height: 10px; text-align: center; color: transparent;
}
QProgressBar::chunk { background: #1db954; border-radius: 6px; }
#Log {
    background: #000000; color: #d0d0d0; border: 1px solid #2a2a2a; border-radius: 8px;
    font-family: Consolas, 'Cascadia Mono', monospace; font-size: 12px;
}
QScrollBar:vertical { background: #121212; width: 10px; }
QScrollBar::handle:vertical { background: #404040; border-radius: 5px; min-height: 24px; }
QScrollBar::handle:vertical:hover { background: #535353; }
"""


# ── Small widgets ──────────────────────────────────────────────────────────────

def title_label(text):
    l = QLabel(text); l.setProperty("role", "title"); return l

def subtitle_label(text):
    l = QLabel(text); l.setProperty("role", "subtitle"); l.setWordWrap(True); return l

def step_label(text):
    l = QLabel(text); l.setProperty("role", "step"); return l

def hint_label(text):
    l = QLabel(text); l.setProperty("role", "hint"); l.setWordWrap(True); return l


# ── Worker thread — runs the actual release pipeline off the UI thread ───────

class ReleaseWorker(QThread):
    log      = Signal(str, str)          # message, level
    step     = Signal(int, int, str)     # n, total, title
    upload   = Signal(str, int)          # asset name, pct
    done     = Signal(str, str)          # version, closing note/url
    failed   = Signal(str)

    TOTAL = 7

    def __init__(self, r, root: Path, opts: dict):
        super().__init__()
        self.r = r
        self.root = root
        self.opts = opts
        self.state = {}

    def run(self):
        try:
            self._run()
        except Exception as exc:
            self._rollback()
            self.failed.emit(str(exc))

    # Streamed subprocess — release.py's own run() inherits stdout straight to
    # a real console, which this windowed app doesn't have. CREATE_NO_WINDOW
    # stops Windows from popping a console for each `cmd.exe /c ...` child.
    def cmd(self, c):
        self.log.emit(f"> {c}", "dim")
        flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        proc = subprocess.Popen(
            c, shell=True, cwd=self.root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", bufsize=1, creationflags=flags,
        )
        for line in proc.stdout:
            self.log.emit(line.rstrip("\n"), "raw")
        proc.wait()
        return proc.returncode

    def _run(self):
        r, root, opts = self.r, self.root, self.opts
        version, is_beta = opts["version"], opts["is_beta"]

        # Mirrors release.py's step_sync_remote — see its docstring. The tail of
        # a release pushes web, which fires the sync-web-to-app workflow and
        # advances origin/app; without fast-forwarding first, the next release
        # commits onto a stale app and dies at the push, after the whole build.
        self.step.emit(1, self.TOTAL, f"Sync with origin/{r.APP_BRANCH}")
        if r.git_branch() != r.APP_BRANCH:
            self.log.emit(f"Switching to {r.APP_BRANCH}", "info")
            if self.cmd(f"git checkout {r.APP_BRANCH}") != 0:
                raise RuntimeError("git checkout failed")
        if self.cmd("git fetch origin") != 0:
            raise RuntimeError("git fetch failed")
        behind = int(r.capture(
            f"git rev-list --count {r.APP_BRANCH}..origin/{r.APP_BRANCH}") or 0)
        ahead = int(r.capture(
            f"git rev-list --count origin/{r.APP_BRANCH}..{r.APP_BRANCH}") or 0)
        if behind and ahead:
            # Real divergence: someone pushed work that isn't ours. Merging that
            # into a release build unattended isn't this script's call.
            raise RuntimeError(
                f"{r.APP_BRANCH} has diverged from origin/{r.APP_BRANCH} "
                f"({ahead} local, {behind} remote).\n"
                f"Reconcile by hand (rebase or merge), then re-run.")
        if behind:
            self.log.emit(
                f"{behind} new commit(s) on origin/{r.APP_BRANCH} -- fast-forwarding", "info")
            if self.cmd(f"git merge --ff-only origin/{r.APP_BRANCH}") != 0:
                raise RuntimeError("Fast-forward failed")
            self.log.emit("Fast-forwarded to "
                          + r.capture("git rev-parse --short HEAD"), "ok")
        else:
            self.log.emit(f"Up to date with origin/{r.APP_BRANCH}", "ok")

        # Read after the fast-forward — origin may have carried a newer version.
        self.state["original_version"] = r.load_version()

        self.step.emit(2, self.TOTAL, "Applying version")
        if version != self.state["original_version"]:
            r.set_version(version)
            self.state["version_changed"] = True
            self.log.emit(f"package.json version → {version}", "ok")
        else:
            self.log.emit("Version unchanged", "info")

        self.step.emit(3, self.TOTAL, f"Commit -> {r.APP_BRANCH}")
        if r.git_branch() != r.APP_BRANCH:
            self.log.emit(f"Switching to {r.APP_BRANCH}", "info")
            if self.cmd(f"git checkout {r.APP_BRANCH}") != 0:
                raise RuntimeError("git checkout failed")
        self.state["pre_commit_sha"] = r.capture("git rev-parse HEAD")
        # Gate on the tree, not on whether a message was typed. Leaving the
        # message blank used to skip the commit outright — but the version bump
        # above has already dirtied package.json, so the release would build,
        # push and publish a version that was never committed, leaving the bump
        # stranded as an uncommitted edit. Fall back to "vX.Y.Z" like the CLI.
        commit_msg = opts["commit_msg"] or (f"v{version}" if r.is_dirty() else "")
        if commit_msg:
            if self.cmd("git add -A") != 0:
                raise RuntimeError("git add failed")
            msg = commit_msg.replace('"', '\\"')
            if self.cmd(f'git commit -m "{msg}"') != 0:
                raise RuntimeError("git commit failed")
            self.state["committed"] = True
            self.log.emit(f"Committed: {commit_msg}", "ok")
        else:
            self.log.emit("Nothing to commit -- tree is clean", "ok")

        self.step.emit(4, self.TOTAL, "Build Electron app")
        self._refresh_bundled_binaries()
        self.log.emit("Compiling renderer (npm run build)...", "info")
        if self.cmd("npm run build") != 0:
            raise RuntimeError("Renderer build failed (tsc / vite). See log above.")
        self.log.emit("Renderer compiled -> dist/", "ok")

        for directory, patterns in (
            (root / "release" / "nsis-web", ("Unreleased-Setup*.exe*", "latest.yml", "*.nsis.7z")),
            (root / "release", ("Unreleased-Setup*.exe*", "latest.yml")),
        ):
            if directory.exists():
                for pattern in patterns:
                    for stale in directory.glob(pattern):
                        stale.unlink()

        self.log.emit("Packaging installer (electron-builder)...", "info")
        if self.cmd(r"node_modules\.bin\electron-builder.cmd --win --publish never") != 0:
            raise RuntimeError("Build failed. See log above.")
        self.log.emit("Build complete", "ok")

        stub = root / "release" / "nsis-web" / "Unreleased-Setup.exe"
        if stub.exists():
            bundled_dir = root / "build" / "bundled"
            bundled_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(stub, bundled_dir / "Unreleased-Setup.exe")
            self.log.emit("Bundled installer stub refreshed for next build", "ok")
        else:
            self.log.emit(f"Not found (skipping bundled-stub refresh): {stub.name}", "warn")

        self.step.emit(5, self.TOTAL, f"Push -> origin/{r.APP_BRANCH}")
        if self.cmd(f"git push origin {r.APP_BRANCH}") != 0:
            raise RuntimeError("git push failed")
        self.state["pushed_app"] = True
        self.log.emit(f"Pushed to origin/{r.APP_BRANCH}", "ok")

        if is_beta:
            self.step.emit(6, self.TOTAL, f"Sync -> {r.WEB_BRANCH} (skipped)")
            self.log.emit("Beta release -- desktop-only, web branch left untouched.", "info")
        else:
            self.step.emit(6, self.TOTAL, f"Sync -> {r.WEB_BRANCH}")
            self._sync_web(version)

        if is_beta:
            self.step.emit(7, self.TOTAL, "Beta publish (gated backend)")
            note = self._publish_beta(version, opts["notes"], opts["beta_token"])
        else:
            self.step.emit(7, self.TOTAL, "GitHub release")
            note = self._publish_release(version, opts["gh_token"], opts["notes"])

        self.done.emit(version, note)

    def _refresh_bundled_binaries(self):
        """Mirror release.py's refresh_bundled_binaries: self-update the bundled
        yt-dlp before packaging so the installer doesn't ship a stale extractor
        that YouTube breaks within weeks. Non-fatal -- a failed update just
        ships whatever copy is already on disk."""
        r, root = self.r, self.root
        exe = root / "node_modules" / "youtube-dl-exec" / "bin" / (
            "yt-dlp.exe" if sys.platform == "win32" else "yt-dlp")
        if not exe.exists():
            self.log.emit(f"yt-dlp binary not found -- skipping update ({exe})", "warn")
            return
        before = r.capture(f'"{exe}" --version')
        self.log.emit(f"Refreshing bundled yt-dlp (current: {before or 'unknown'})...", "info")
        rc = self.cmd(f'"{exe}" -U')
        after = r.capture(f'"{exe}" --version')
        if rc != 0:
            self.log.emit("yt-dlp self-update failed -- shipping the existing binary", "warn")
        elif after and after != before:
            self.log.emit(f"yt-dlp updated: {before} -> {after}", "ok")
        else:
            self.log.emit(f"yt-dlp already current ({after or before})", "ok")

    def _rollback(self):
        """Mirror release.py's rollback(): undo whatever earlier steps already
        did, scoped to what's safely automatable -- the local version bump/
        commit, and a GitHub release created by *this* run. Never force-pushes
        app or web (web is the live production branch); those cases just log
        the manual undo command instead."""
        r, root, state = self.r, self.root, self.state
        if not state:
            return
        self.log.emit("Rolling back what's safely revertible (local commit/version + GitHub release)...", "warn")

        if state.get("release_id") and state.get("release_created_new") and state.get("token"):
            try:
                r.api("DELETE", f"/repos/{r.REPO_OWNER}/{r.REPO_NAME}/releases/{state['release_id']}", state["token"])
                self.log.emit(f"Deleted GitHub release {state.get('tag')}", "ok")
            except Exception as e:
                self.log.emit(f"Could not delete GitHub release: {e}", "warn")
            try:
                r.api("DELETE", f"/repos/{r.REPO_OWNER}/{r.REPO_NAME}/git/refs/tags/{state['tag']}", state["token"])
                self.log.emit(f"Deleted tag {state['tag']}", "ok")
            except Exception:
                pass

        if state.get("web_pushed"):
            self.log.emit(f"Web branch already pushed to origin/{r.WEB_BRANCH} -- the live site. Not auto-reverting.", "warn")
            self.log.emit(f"To undo manually: git checkout {r.WEB_BRANCH} && git reset --hard "
                           f"{state.get('pre_web_sha')} && git push --force origin {r.WEB_BRANCH}", "dim")

        if state.get("pushed_app"):
            self.log.emit(f"App branch already pushed to origin/{r.APP_BRANCH}. Not auto-reverting shared history.", "warn")
            self.log.emit(f"To undo manually: git reset --hard {state.get('pre_commit_sha')} && "
                           f"git push --force origin {r.APP_BRANCH}", "dim")
        elif state.get("committed") and state.get("pre_commit_sha"):
            # `reset --hard` throws away the commit we just made *and* anything
            # uncommitted alongside it. Park a branch on it first so recovering
            # is `git cherry-pick <branch>` rather than a reflog dig -- this
            # rollback has eaten real work more than once.
            doomed = r.capture("git rev-parse --short HEAD")
            backup = (f"backup/{state.get('tag') or 'release'}"
                      f"-{time.strftime('%Y%m%d-%H%M%S')}")
            if r.capture(f"git branch {backup} 2>&1") == "":
                self.log.emit(f"Saved the discarded commit ({doomed}) on branch {backup}", "ok")
                self.log.emit(f"Recover with: git cherry-pick {backup}", "dim")
            else:
                self.log.emit(f"Could not create backup branch -- recover {doomed} via `git reflog`", "warn")
            self.cmd(f"git reset --hard {state['pre_commit_sha']}")
            self.log.emit(f"Reverted local commit (and version bump) on {r.APP_BRANCH}", "ok")
        elif state.get("version_changed") and state.get("original_version"):
            r.set_version(state["original_version"])
            self.log.emit(f"Reverted package.json version to {state['original_version']}", "ok")

    def _sync_web(self, version):
        r, root = self.r, self.root
        original = r.git_branch()
        try:
            if self.cmd(f"git checkout {r.WEB_BRANCH}") != 0:
                raise RuntimeError("git checkout web failed")
            self.state["pre_web_sha"] = r.capture("git rev-parse HEAD")

            deleted = r.capture(
                f"git diff --diff-filter=D --name-only {r.WEB_BRANCH} {r.APP_BRANCH} -- src/"
            ).splitlines()
            for f in deleted:
                if f.strip():
                    self.cmd(f'git rm -q --ignore-unmatch "{f.strip()}"')
            if self.cmd(f"git checkout {r.APP_BRANCH} -- src/ package.json package-lock.json") != 0:
                raise RuntimeError("git checkout of app-branch files failed")

            if not r.is_dirty():
                self.log.emit("Web branch already up to date.", "info")
                return

            staged = r.capture("git diff --cached --name-only").splitlines()
            self.log.emit(f"Syncing {len(staged)} file(s) to {r.WEB_BRANCH}", "info")
            if self.cmd("git add -A") != 0:
                raise RuntimeError("git add (web) failed")
            if self.cmd(f'git commit -m "v{version}"') != 0:
                raise RuntimeError("git commit (web) failed")
            if self.cmd(f"git push origin {r.WEB_BRANCH} --force") != 0:
                raise RuntimeError("git push (web) failed")
            self.state["web_pushed"] = True
            self.log.emit("Web branch synced and pushed", "ok")
        finally:
            if r.git_branch() != original:
                self.cmd(f"git checkout {original}")

    def _publish_release(self, version, token, notes):
        r, root = self.r, self.root
        tag = f"v{version}"
        self.state["tag"] = tag
        self.state["token"] = token
        release_dir = root / "release" / "nsis-web"

        to_upload = []
        candidates = [
            release_dir / "latest.yml",
            release_dir / "Unreleased-Setup.exe",
            *sorted(release_dir.glob(f"unreleased-{version}-*.nsis.7z")),
            root / "release" / f"Unreleased-Setup-{version}.exe",
        ]
        for p in candidates:
            if p.exists():
                to_upload.append(p)
            else:
                self.log.emit(f"Not found (skipping): {p.name}", "warn")

        if not any(p.name.endswith(".nsis.7z") for p in to_upload):
            raise RuntimeError(
                f"No unreleased-{version}-*.nsis.7z package in {release_dir}/\n"
                "The web installer is useless without it. Did the build succeed?")
        if not to_upload:
            raise RuntimeError(f"No release assets found in {release_dir}/")

        if not notes:
            notes = r.capture(
                'git log $(git describe --tags --abbrev=0 2>nul)..HEAD --pretty="- %s" --no-merges 2>nul'
            ) or f"Release {tag}"

        self.log.emit(f"Creating release {tag} on GitHub...", "info")
        try:
            release = r.api("POST", f"/repos/{r.REPO_OWNER}/{r.REPO_NAME}/releases", token,
                             {"tag_name": tag, "name": tag, "body": notes,
                              "target_commitish": r.APP_BRANCH, "draft": False, "prerelease": False})
            self.state["release_id"] = release["id"]
            self.state["release_created_new"] = True
            self.log.emit(f"Release created (id={release['id']})", "ok")
        except urllib.error.HTTPError as e:
            if e.code == 422:
                release = r.api("GET", f"/repos/{r.REPO_OWNER}/{r.REPO_NAME}/releases/tags/{tag}", token)
                r.api("PATCH", f"/repos/{r.REPO_OWNER}/{r.REPO_NAME}/releases/{release['id']}", token,
                      {"prerelease": False, "body": notes})
                self.state["release_id"] = release["id"]
                self.state["release_created_new"] = False
                self.log.emit(f"Release already exists -- updated (id={release['id']})", "ok")
            else:
                raise

        release_id = release["id"]
        try:
            existing = {a["name"]: a["id"] for a in
                        r.api("GET", f"/repos/{r.REPO_OWNER}/{r.REPO_NAME}/releases/{release_id}/assets", token)}
        except Exception:
            existing = {}

        for fp in to_upload:
            if fp.name in existing:
                self.log.emit(f"Replacing existing asset: {fp.name}", "info")
                r.api("DELETE", f"/repos/{r.REPO_OWNER}/{r.REPO_NAME}/releases/assets/{existing[fp.name]}", token)

        for fp in to_upload:
            self.log.emit(f"Uploading: {fp.name}  ({fp.stat().st_size/1_048_576:.1f} MB)", "info")
            name = fp.name
            def _cb(done, total, _name=name):
                pct = done * 100 // total if total else 100
                self.upload.emit(_name, pct)
            r.upload_asset(release_id, fp, token, on_progress=_cb)
            self.upload.emit(name, 100)

        return f"https://github.com/{r.REPO_OWNER}/{r.REPO_NAME}/releases/tag/{tag}"

    def _publish_beta(self, version, notes, token):
        r, root = self.r, self.root
        tag = f"v{version}"
        exe = root / "release" / f"Unreleased-Setup-{version}.exe"
        if not exe.exists():
            raise RuntimeError(f"No {exe.name} in release/\nDid the build succeed?")

        self.log.emit("Computing checksum...", "info")
        sha512 = r.sha512_base64(exe)
        size = exe.stat().st_size
        yml_path = root / "release" / "latest-beta.yml"
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
            notes = r.capture(
                'git log $(git describe --tags --abbrev=0 2>nul)..HEAD --pretty="- %s" --no-merges 2>nul'
            ) or f"Beta {tag}"

        self.log.emit(f"Publishing {tag} to {r.BETA_API_BASE}/admin/publish ...", "info")

        def _cb(done, total):
            pct = done * 100 // total if total else 100
            self.upload.emit(exe.name, pct)

        try:
            r.upload_beta(
                f"{r.BETA_API_BASE}/admin/publish", token,
                fields={"version": version, "tag": tag, "notes": notes},
                files={"installer": exe, "latest_yml": yml_path},
                on_progress=_cb,
            )
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            raise RuntimeError(f"Beta publish failed: HTTP {e.code}\n{body[:300]}")

        self.upload.emit(exe.name, 100)
        return f"Beta {tag} is live for code holders only."


# ── Main window / wizard ──────────────────────────────────────────────────────

class MainWindow(QMainWindow):
    def __init__(self, r, root: Path):
        super().__init__()
        self.r = r
        self.root = root
        self.worker = None
        self.version = None
        self.commit_msg = None
        self.dirty = r.is_dirty()

        self.setWindowTitle(APP_TITLE)
        self.resize(720, 560)
        icon_path = root / "resources" / "icon.ico"
        if icon_path.exists():
            self.setWindowIcon(QIcon(str(icon_path)))

        central = QWidget()
        self.setCentralWidget(central)
        outer = QVBoxLayout(central)
        outer.setContentsMargins(28, 24, 28, 20)
        outer.setSpacing(16)

        header = QHBoxLayout()
        icon_lbl = QLabel("\U0001F3B5")
        icon_lbl.setStyleSheet("font-size: 22px;")
        header.addWidget(icon_lbl)
        htitle = QVBoxLayout()
        htitle.setSpacing(0)
        htitle.addWidget(title_label("Unreleased"))
        sub = subtitle_label(f"Release & Publish  ·  {root}")
        htitle.addWidget(sub)
        header.addLayout(htitle)
        header.addStretch(1)
        outer.addLayout(header)

        self.stack = QStackedWidget()
        outer.addWidget(self.stack, 1)

        self.page_version = self._build_version_page()
        self.page_commit  = self._build_commit_page()
        self.page_notes   = self._build_notes_page()
        self.page_review  = self._build_review_page()
        self.page_run      = self._build_run_page()
        for p in (self.page_version, self.page_commit, self.page_notes, self.page_review, self.page_run):
            self.stack.addWidget(p)

        self.flow = [self.page_version] + ([self.page_commit] if self.dirty else []) + [self.page_notes, self.page_review]
        self.flow_idx = 0
        self.stack.setCurrentWidget(self.flow[0])

        nav = QHBoxLayout()
        self.btn_back = QPushButton("Back")
        self.btn_back.setObjectName("Ghost")
        self.btn_back.clicked.connect(self.go_back)
        self.btn_next = QPushButton("Next")
        self.btn_next.setObjectName("Primary")
        self.btn_next.clicked.connect(self.go_next)
        nav.addWidget(self.btn_back)
        nav.addStretch(1)
        nav.addWidget(self.btn_next)
        self.nav_widget = QWidget()
        self.nav_widget.setLayout(nav)
        outer.addWidget(self.nav_widget)

        self._update_nav()

    # ── Page 1: version ───────────────────────────────────────────────────
    def _build_version_page(self):
        w = QWidget(); l = QVBoxLayout(w); l.setSpacing(10)
        l.addWidget(step_label("STEP 1 OF 4"))
        l.addWidget(title_label("Pick a version"))
        cur = self.r.load_version()
        l.addWidget(subtitle_label(f"Current version: {cur}"))
        l.addSpacing(6)

        self.version_group = QButtonGroup(w)
        self.version_options = [
            ("keep",   cur,                     "Keep current"),
            ("patch",  self.r.bump(cur, "patch"), "Bump patch"),
            ("minor",  self.r.bump(cur, "minor"), "Bump minor"),
            ("major",  self.r.bump(cur, "major"), "Bump major"),
            ("custom", None,                      "Custom version"),
        ]
        self.version_radios = {}
        for i, (key, val, label) in enumerate(self.version_options):
            text = f"{label}   ({val})" if val else label
            rb = QRadioButton(text)
            self.version_group.addButton(rb, i)
            self.version_radios[key] = rb
            l.addWidget(rb)
        self.version_radios["patch"].setChecked(True)

        self.custom_version_edit = QLineEdit()
        self.custom_version_edit.setPlaceholderText("e.g. 2.0.0 or 1.15.0-beta.1")
        self.custom_version_edit.setEnabled(False)
        l.addWidget(self.custom_version_edit)

        def on_toggle():
            self.custom_version_edit.setEnabled(self.version_radios["custom"].isChecked())
        for rb in self.version_radios.values():
            rb.toggled.connect(on_toggle)

        l.addStretch(1)
        return w

    def _selected_version(self):
        cur = self.r.load_version()
        for key, val, _ in self.version_options:
            if self.version_radios[key].isChecked():
                if key == "custom":
                    v = self.custom_version_edit.text().strip()
                    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", v):
                        return None, "Custom version must look like major.minor.patch, optionally with a pre-release suffix (e.g. 1.15.0-beta.1)."
                    return v, None
                return (cur if key == "keep" else val), None
        return None, "Pick a version option."

    # ── Page 2: commit message (only shown when the tree is dirty) ────────
    def _build_commit_page(self):
        w = QWidget(); l = QVBoxLayout(w); l.setSpacing(10)
        l.addWidget(step_label("STEP 2 OF 4"))
        l.addWidget(title_label("Commit message"))
        l.addWidget(subtitle_label("Uncommitted changes will be committed to the app branch before building."))

        self.status_view = QPlainTextEdit()
        self.status_view.setObjectName("Log")
        self.status_view.setReadOnly(True)
        self.status_view.setMaximumHeight(140)
        l.addWidget(self.status_view)

        l.addWidget(hint_label("Commit message"))
        self.commit_edit = QLineEdit()
        l.addWidget(self.commit_edit)
        l.addStretch(1)
        return w

    def _refresh_commit_page(self):
        status = self.r.capture("git status --short")
        self.status_view.setPlainText(status)
        if not self.commit_edit.text():
            self.commit_edit.setText(f"v{self.version}")

    # ── Page 3: release notes + beta toggle ────────────────────────────────
    def _build_notes_page(self):
        w = QWidget(); l = QVBoxLayout(w); l.setSpacing(10)
        l.addWidget(step_label("STEP 3 OF 4"))
        l.addWidget(title_label("Release notes"))
        l.addWidget(hint_label("Blank = auto-generate from commits since the last tag."))
        self.notes_edit = QPlainTextEdit()
        self.notes_edit.setMinimumHeight(160)
        l.addWidget(self.notes_edit)

        self.beta_check = QCheckBox("Publish as beta")
        l.addWidget(self.beta_check)
        l.addWidget(hint_label(
            "Betas are never uploaded to GitHub. They're privately published to "
            "juicewrldapi.com's gated backend, reachable only with a beta access "
            "code, and the web branch is left untouched (desktop-only)."))
        l.addStretch(1)
        return w

    # ── Page 4: review & start ─────────────────────────────────────────────
    def _build_review_page(self):
        w = QWidget(); l = QVBoxLayout(w); l.setSpacing(10)
        l.addWidget(step_label("STEP 4 OF 4"))
        l.addWidget(title_label("Review"))
        self.review_view = QPlainTextEdit()
        self.review_view.setObjectName("Log")
        self.review_view.setReadOnly(True)
        l.addWidget(self.review_view, 1)
        l.addWidget(hint_label(
            "Starting will commit, build the installers, push to GitHub, sync the "
            "web branch (unless beta), and publish the release. This can't be undone."))
        return w

    def _refresh_review_page(self):
        lines = [
            f"Version:        {self.r.load_version()}  ->  {self.version}",
            f"Commit message: {self.commit_msg or '(nothing to commit)'}",
            f"Publish as:     {'BETA (gated backend)' if self.beta_check.isChecked() else 'Stable (public GitHub release)'}",
            "",
            "Release notes:",
            self.notes_edit.toPlainText().strip() or "(blank -- auto-generate from commits)",
        ]
        self.review_view.setPlainText("\n".join(lines))

    # ── Page 5: run ─────────────────────────────────────────────────────────
    def _build_run_page(self):
        w = QWidget(); l = QVBoxLayout(w); l.setSpacing(10)
        self.run_title = title_label("Releasing...")
        l.addWidget(self.run_title)
        self.run_step_lbl = subtitle_label("")
        l.addWidget(self.run_step_lbl)

        self.progress = QProgressBar()
        self.progress.setRange(0, ReleaseWorker.TOTAL)
        l.addWidget(self.progress)

        self.upload_progress = QProgressBar()
        self.upload_progress.setRange(0, 100)
        self.upload_progress.setVisible(False)
        l.addWidget(self.upload_progress)

        self.log_view = QPlainTextEdit()
        self.log_view.setObjectName("Log")
        self.log_view.setReadOnly(True)
        l.addWidget(self.log_view, 1)

        footer = QHBoxLayout()
        self.btn_copy_log = QPushButton("Copy log")
        self.btn_copy_log.setObjectName("Ghost")
        self.btn_copy_log.clicked.connect(lambda: QApplication.clipboard().setText(self.log_view.toPlainText()))
        footer.addWidget(self.btn_copy_log)
        footer.addStretch(1)
        self.btn_close = QPushButton("Close")
        self.btn_close.setObjectName("Primary")
        self.btn_close.setEnabled(False)
        self.btn_close.clicked.connect(self.close)
        footer.addWidget(self.btn_close)
        l.addLayout(footer)
        return w

    # ── Navigation ───────────────────────────────────────────────────────────
    def _update_nav(self):
        page = self.flow[self.flow_idx]
        self.btn_back.setEnabled(self.flow_idx > 0)
        is_last = self.flow_idx == len(self.flow) - 1
        self.btn_next.setText("Start Release" if is_last else "Next")
        if page is self.page_commit:
            self._refresh_commit_page()
        if page is self.page_review:
            self._refresh_review_page()

    def go_back(self):
        if self.flow_idx > 0:
            self.flow_idx -= 1
            self.stack.setCurrentWidget(self.flow[self.flow_idx])
            self._update_nav()

    def go_next(self):
        page = self.flow[self.flow_idx]

        if page is self.page_version:
            version, err = self._selected_version()
            if err:
                QMessageBox.warning(self, "Invalid version", err)
                return
            self.version = version

        elif page is self.page_commit:
            self.commit_msg = self.commit_edit.text().strip() or f"v{self.version}"

        elif page is self.page_notes:
            pass

        elif page is self.page_review:
            self._start_release()
            return

        if not self.dirty:
            self.commit_msg = None

        self.flow_idx += 1
        self.stack.setCurrentWidget(self.flow[self.flow_idx])
        self._update_nav()

    # ── Kick off the worker ─────────────────────────────────────────────────
    def _start_release(self):
        gh_token = get_gh_token(self.root)
        if not gh_token:
            QMessageBox.critical(
                self, "GH_TOKEN not found",
                "Set it as an environment variable, or add GH_TOKEN=xxx to .env.local in the project root.")
            return

        is_beta = self.beta_check.isChecked()
        beta_token = None
        if is_beta:
            beta_token = get_beta_token(self.root)
            if not beta_token:
                QMessageBox.critical(
                    self, "BETA_ADMIN_TOKEN not found",
                    "Add BETA_ADMIN_TOKEN=xxx to .env.local -- the admin secret for "
                    "juicewrldapi.com's POST /beta/admin/publish endpoint, separate from GH_TOKEN.")
                return

        opts = {
            "version": self.version,
            "commit_msg": self.commit_msg,
            "notes": self.notes_edit.toPlainText().strip(),
            "is_beta": is_beta,
            "gh_token": gh_token,
            "beta_token": beta_token,
        }

        self.stack.setCurrentWidget(self.page_run)
        self.nav_widget.setVisible(False)
        self.log_view.clear()
        self.progress.setValue(0)

        self.worker = ReleaseWorker(self.r, self.root, opts)
        self.worker.log.connect(self._on_log)
        self.worker.step.connect(self._on_step)
        self.worker.upload.connect(self._on_upload)
        self.worker.done.connect(self._on_done)
        self.worker.failed.connect(self._on_failed)
        self.worker.start()

    def _on_log(self, msg, level):
        colors = {"ok": "#1db954", "warn": "#e0a415", "err": "#f15e6c", "dim": "#6b6b6b", "info": "#7fd4e8", "raw": "#d0d0d0"}
        color = colors.get(level, "#d0d0d0")
        cursor = self.log_view.textCursor()
        cursor.movePosition(QTextCursor.End)
        cursor.insertHtml(f'<span style="color:{color}">{_html_escape(msg)}</span><br>')
        self.log_view.setTextCursor(cursor)
        self.log_view.ensureCursorVisible()

    def _on_step(self, n, total, title):
        self.progress.setRange(0, total)
        self.progress.setValue(n)
        self.run_step_lbl.setText(f"Step {n} of {total} -- {title}")
        self.upload_progress.setVisible(False)

    def _on_upload(self, name, pct):
        self.upload_progress.setVisible(True)
        self.upload_progress.setValue(pct)
        self.upload_progress.setFormat(f"{name}  {pct}%")

    def _on_done(self, version, note):
        self.run_title.setText(f"v{version} released!")
        self.run_step_lbl.setText(note)
        self._on_log(f"Done -- {note}", "ok")
        self.btn_close.setEnabled(True)
        self.worker = None

    def _on_failed(self, message):
        self.run_title.setText("Release failed")
        self._on_log(message, "err")
        self.btn_close.setEnabled(True)
        self.worker = None

    def closeEvent(self, event: QCloseEvent):
        if self.worker is not None and self.worker.isRunning():
            resp = QMessageBox.question(
                self, "Release in progress",
                "A release is still running (build/push/publish). Closing now may leave things "
                "half-done. Close anyway?",
                QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
            if resp != QMessageBox.Yes:
                event.ignore()
                return
        event.accept()


def _html_escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def main():
    app = QApplication(sys.argv)
    app.setStyleSheet(QSS)

    root = resolve_root(None)
    if root is None:
        return 0

    r = load_release_core(root)
    win = MainWindow(r, root)
    win.show()
    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
