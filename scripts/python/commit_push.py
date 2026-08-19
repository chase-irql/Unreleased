#!/usr/bin/env python3
"""
Unreleased Music Player — Manual Commit & Push

For one-off commits that don't go through the full release.py flow
(e.g. small fixes on a non-release branch, worktree cleanup, docs).

Just run it — no arguments needed:
  1. Shows `git status` so you can see what's about to be committed
  2. Asks for a commit message (blank = abort)
  3. Stages everything, commits, and pushes the current branch to origin
"""

import os, sys, subprocess

if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"): sys.stderr.reconfigure(encoding="utf-8")
if sys.platform == "win32":
    os.system("")

from pathlib import Path

ROOT = Path(__file__).parent.parent.parent


def run(args, **kwargs):
    return subprocess.run(args, cwd=ROOT, **kwargs)


def capture(args):
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    return result.stdout.strip()


def main():
    branch = capture(["git", "branch", "--show-current"])
    if not branch:
        print("Not on a branch (detached HEAD?). Aborting.")
        input("\nPress Enter to close...")
        return

    print(f"Branch: {branch}\n")
    run(["git", "status"])

    if not capture(["git", "status", "--porcelain"]):
        print("\nNothing to commit — working tree is clean.")
        input("\nPress Enter to close...")
        return

    print()
    message = input("Commit message (blank to abort): ").strip()
    if not message:
        print("Aborted.")
        input("\nPress Enter to close...")
        return

    run(["git", "add", "-A"])
    commit = run(["git", "commit", "-m", message])
    if commit.returncode != 0:
        print("\nCommit failed.")
        input("\nPress Enter to close...")
        return

    print(f"\nPushing {branch} to origin...")
    push = run(["git", "push", "origin", branch])
    if push.returncode != 0:
        print("\nPush failed.")
        input("\nPress Enter to close...")
        return

    print("\nDone.")
    input("\nPress Enter to close...")


if __name__ == "__main__":
    main()
