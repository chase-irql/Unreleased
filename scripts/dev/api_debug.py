#!/usr/bin/env python3
"""
Unreleased Music Player — API Debug Console

Send manual requests to the Juice WRLD API (juicewrldapi.com) and inspect
the raw response. No third-party deps — stdlib only.
"""

import json
import os
import shlex
import sys
import urllib.error
import urllib.parse
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

if sys.platform == "win32":
    os.system("")  # enable ANSI colour codes in cmd.exe

DEFAULT_BASE = "https://juicewrldapi.com/juicewrld"
METHODS = ("GET", "POST", "PUT", "PATCH", "DELETE")
COLLAPSE_LIMIT = 200  # chars per string value before it gets collapsed

# Handy shortcuts: `alias arg1 arg2` -> real request. {n} pulls in positional
# words typed after the alias.
SHORTCUTS = {
    "songs":   "GET /songs/ page_size=10",
    "song":    "GET /songs/{0}/",
    "search":  "GET /songs/ search={0}",
    "eras":    "GET /eras/",
    "stats":   "GET /stats/",
    "browse":  "GET /files/browse/",
    "me":      "GET /accounts/me/",
    "favorites": "GET /library/favorites/",
    "playlists": "GET /library/playlists/",
}

RST, BOLD, DIM = "\033[0m", "\033[1m", "\033[2m"
RED, GRN, YEL, CYN = "\033[91m", "\033[92m", "\033[93m", "\033[96m"

HELP = f"""
{BOLD}Requests{RST}
  {CYN}get{RST} <path> [key=value ...]          e.g. get /songs/ page_size=5 category=released
  {CYN}post|put|patch|delete{RST} <path> [k=v ...]   key=value becomes a JSON body
  Add as many optional params as you want:  get /songs/ versions=true include_snippets=true
  Quote values with spaces:  get /songs/ search="see you again"
  Use --body for raw JSON:   post /accounts/login/ --body {{"discord_id": "123"}}

{BOLD}Shortcuts{RST} (type the name, some take an argument)
  {", ".join(SHORTCUTS)}
  e.g. {CYN}songs{RST}                        ->  GET /songs/?page_size=10
       {CYN}songs category=released{RST}      ->  GET /songs/?page_size=10&category=released
       {CYN}songs versions=true{RST}          ->  GET /songs/?page_size=10&versions=true
                                                (adds version_title + versions[] to each song; collection only, the song/{{id}} route ignores it)
       {CYN}song 94316{RST}                   ->  GET /songs/94316/
       {CYN}search juice{RST}                 ->  GET /songs/?search=juice
       {CYN}search juice category=released{RST} ->  GET /songs/?search=juice&category=released
       {CYN}eras{RST}                         ->  GET /eras/
       {CYN}stats{RST}                        ->  GET /stats/
       {CYN}browse{RST}                       ->  GET /files/browse/
       {CYN}browse search=juice{RST}          ->  GET /files/browse/?search=juice
       {CYN}me{RST}                           ->  GET /accounts/me/  (needs a token)
       {CYN}favorites{RST}                    ->  GET /library/favorites/  (needs a token)
       {CYN}playlists{RST}                    ->  GET /library/playlists/  (needs a token)
  Any shortcut can take extra key=value args, which get added as query params.

{BOLD}Session{RST}
  {CYN}token{RST} <value>       set the auth token (sent as "Authorization: Token <value>")
  {CYN}token clear{RST}         clear the stored token
  {CYN}token{RST}               show the current token
  {CYN}base{RST} <url>          override the API base URL
  {CYN}base{RST}                show the current base URL
  {CYN}history{RST}             list requests made this session
  {CYN}save{RST} <file>         save the last response body (full, uncollapsed) to a file
  {CYN}expand{RST}              reprint the last response in full (no collapsing)
  {CYN}collapse{RST} on|off     toggle collapsing of long fields (lyrics, etc.) — default on
  {CYN}collapse{RST}            show current collapse state
  {CYN}clear{RST} / {CYN}cls{RST}          clear the screen
  {CYN}help{RST}                show this again
  {CYN}quit{RST} / {CYN}exit{RST}          leave

CLI one-shot mode:
  python scripts/dev/api_debug.py GET /songs/ page_size=5 category=released
  python scripts/dev/api_debug.py POST /accounts/login/ --body '{{"discord_id":"123"}}' --token abc
"""


class ApiError(Exception):
    pass


def collapse_long_strings(obj, limit=COLLAPSE_LIMIT):
    """Recursively replace string values longer than `limit` chars with a
    truncated preview + a note on how much was hidden."""
    if isinstance(obj, dict):
        return {k: collapse_long_strings(v, limit) for k, v in obj.items()}
    if isinstance(obj, list):
        return [collapse_long_strings(v, limit) for v in obj]
    if isinstance(obj, str) and len(obj) > limit:
        hidden = len(obj) - limit
        return obj[:limit].rstrip() + f" …[+{hidden} chars hidden — 'expand' to view full]"
    return obj


def send(base, method, path, params=None, body=None, token=None, collapse=True):
    if not path.startswith("/"):
        path = "/" + path
    url = base.rstrip("/") + "/" + path.lstrip("/")
    if params:
        url += "?" + urllib.parse.urlencode(params)

    data = None
    headers = {
        "Accept": "application/json",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Token {token}"

    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())

    print(f"\n{DIM}--> {method.upper()} {url}{RST}")
    if body is not None:
        print(f"{DIM}    body: {json.dumps(body)}{RST}")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            status = resp.status
            raw = resp.read()
    except urllib.error.HTTPError as e:
        status = e.code
        raw = e.read()
    except urllib.error.URLError as e:
        print(f"{RED}<-- request failed: {e.reason}{RST}")
        return None
    except TimeoutError:
        print(f"{RED}<-- request timed out{RST}")
        return None

    colour = GRN if 200 <= status < 300 else (YEL if 300 <= status < 400 else RED)
    print(f"{colour}<-- {status}{RST}")

    text = raw.decode("utf-8", errors="replace")
    try:
        parsed = json.loads(text)
        pretty = json.dumps(parsed, indent=2, ensure_ascii=False)
        if collapse:
            print(json.dumps(collapse_long_strings(parsed), indent=2, ensure_ascii=False))
        else:
            print(pretty)
        return pretty
    except json.JSONDecodeError:
        print(text)
        return text


def parse_args(tokens):
    """Split shlex-tokenized args into query/body params dict + optional
    explicit --body JSON. Values are quoted-aware (e.g. search="two words")."""
    kv = {}
    explicit_body = None
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok == "--body":
            if i + 1 >= len(tokens):
                raise ApiError("--body needs a JSON argument")
            try:
                explicit_body = json.loads(tokens[i + 1])
            except json.JSONDecodeError as e:
                raise ApiError(f"--body is not valid JSON: {e}")
            i += 2
            continue
        if "=" in tok:
            k, v = tok.split("=", 1)
            kv[k] = v
        i += 1
    return kv, explicit_body


def run_one(base, token, method, path, tokens, collapse=True):
    method = method.upper()
    if method not in METHODS:
        raise ApiError(f"unknown method {method!r} (expected one of {', '.join(METHODS)})")
    kv, explicit_body = parse_args(tokens)
    if explicit_body is not None:
        params, body = None, explicit_body
    elif method in ("GET", "DELETE"):
        params, body = kv, None
    else:
        params, body = None, kv
    return send(base, method, path, params=params, body=body, token=token, collapse=collapse)


def expand_shortcut(cmd, args):
    """Fill {0}, {1}, ... placeholders in a shortcut template from args.
    Any leftover args (e.g. `versions=true`) are passed through untouched so
    they still reach the request as extra query params / body fields."""
    template = SHORTCUTS[cmd]
    needed = template.count("{")
    fill_args, extra_args = args[:needed], args[needed:]
    try:
        filled = template.format(*fill_args)
    except IndexError:
        raise ApiError(f"'{cmd}' needs {needed} argument(s), e.g. {cmd} <value>")
    return shlex.split(filled) + extra_args


def interactive(base, token):
    print(f"{BOLD}Juice WRLD API debug console{RST}  (base: {CYN}{base}{RST})")
    print(f"Type {CYN}help{RST} for commands, {CYN}quit{RST} to exit.")
    history = []
    last_response = None
    collapse = True

    while True:
        prompt_token = f"{GRN}token set{RST}" if token else f"{DIM}no token{RST}"
        try:
            line = input(f"\n[{prompt_token}] >> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not line:
            continue

        try:
            parts = shlex.split(line)
        except ValueError as e:
            print(f"{RED}couldn't parse that line: {e}{RST}")
            continue
        if not parts:
            continue
        cmd = parts[0].lower()

        if cmd in ("quit", "exit"):
            break

        if cmd == "help":
            print(HELP)
            continue

        if cmd in ("clear", "cls"):
            os.system("cls" if sys.platform == "win32" else "clear")
            continue

        if cmd == "base":
            if len(parts) < 2:
                print(f"current base: {base}")
            else:
                base = parts[1]
                print(f"{GRN}base set to {base}{RST}")
            continue

        if cmd == "token":
            if len(parts) < 2:
                print(f"current token: {token or '(none)'}")
            elif parts[1] == "clear":
                token = None
                print(f"{GRN}token cleared{RST}")
            else:
                token = parts[1]
                print(f"{GRN}token set{RST}")
            continue

        if cmd == "history":
            if not history:
                print("(no requests yet)")
            for i, entry in enumerate(history, 1):
                print(f"  {i}. {entry}")
            continue

        if cmd == "expand":
            if last_response is None:
                print(f"{RED}no response yet{RST}")
            else:
                print(last_response)
            continue

        if cmd == "collapse":
            if len(parts) < 2:
                print(f"collapse is {'on' if collapse else 'off'}")
            elif parts[1] == "on":
                collapse = True
                print(f"{GRN}collapse on{RST} — long fields will be truncated")
            elif parts[1] == "off":
                collapse = False
                print(f"{GRN}collapse off{RST} — full fields will be printed")
            else:
                print(f"{RED}usage: collapse on|off{RST}")
            continue

        if cmd == "save":
            if len(parts) < 2:
                print(f"{RED}usage: save <filename>{RST}")
            elif last_response is None:
                print(f"{RED}no response to save yet{RST}")
            else:
                try:
                    with open(parts[1], "w", encoding="utf-8") as f:
                        f.write(last_response)
                    print(f"{GRN}saved to {parts[1]}{RST}")
                except OSError as e:
                    print(f"{RED}couldn't save: {e}{RST}")
            continue

        try:
            if cmd in SHORTCUTS:
                expanded = expand_shortcut(cmd, parts[1:])
                method, path, rest = expanded[0], expanded[1], expanded[2:]
                history.append(line)
                last_response = run_one(base, token, method, path, rest, collapse=collapse)
            elif cmd.upper() in METHODS:
                if len(parts) < 2:
                    print(f"{RED}usage: {cmd} <path> [key=value ...]{RST}")
                    continue
                history.append(line)
                last_response = run_one(base, token, cmd, parts[1], parts[2:], collapse=collapse)
            else:
                print(f"{RED}unknown command: {cmd!r}{RST}  (type {CYN}help{RST} for commands)")
        except ApiError as e:
            print(f"{RED}{e}{RST}")


def main():
    argv = sys.argv[1:]
    base = DEFAULT_BASE
    token = None

    if not argv:
        interactive(base, token)
        return

    # One-shot CLI mode: METHOD PATH [key=value ...] [--body '<json>'] [--token X] [--base URL]
    method = argv[0]
    path = argv[1] if len(argv) > 1 else "/"
    rest = argv[2:]

    kv_tokens = []
    i = 0
    while i < len(rest):
        if rest[i] == "--token":
            token = rest[i + 1]
            i += 2
        elif rest[i] == "--base":
            base = rest[i + 1]
            i += 2
        else:
            kv_tokens.append(rest[i])
            i += 1

    try:
        run_one(base, token, method, path, kv_tokens)
    except ApiError as e:
        print(f"{RED}{e}{RST}")
        sys.exit(1)


if __name__ == "__main__":
    main()
