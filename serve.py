"""Local dev server for the site.

Same as `python3 -m http.server`, but tells the browser never to cache, so
edits to CSS/JS show up on a normal reload instead of serving stale copies.

    python3 serve.py          # http://localhost:8123
    python3 serve.py 9000     # pick a different port

It also lets Sokoball's developer tools (projects/sokoball/dev.js) save the
campaign - its levels and its map - straight into levels.js. Only from this
computer: a save from anywhere else on the network is turned away.
"""

import http.server
import json
import os
import re
import string
import sys
import tempfile
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123

ROOT = Path(__file__).resolve().parent
SOKOBALL_LEVELS = ROOT / "projects" / "sokoball" / "levels.js"
SOKOBALL_SAVE = "/__dev/sokoball"

# Every character a Sokoball level can have - keep it in step with KNOWN in
# projects/sokoball/sokoball.js, or new kinds of square can't be saved
LEVEL_CHARS = set("# -_.$*@+!^=~ox?:[]rRgG()<>")
MAP_CHARS = set("# -_@$^=~%&") | set(string.ascii_letters)
LOCAL = {"127.0.0.1", "::1", "::ffff:127.0.0.1"}


def check_text(text, allowed, what):
    if not isinstance(text, str) or not text.strip() or len(text) > 5000:
        raise ValueError(f"{what} is missing or too big")
    bad = set(text) - allowed - {"\n"}
    if bad:
        raise ValueError(f"{what} has characters it can't: {''.join(sorted(bad))!r}")
    return [row for row in text.split("\n")]


def rewrite_levels(source, levels, world):
    """The levels.js text with its LEVELS list and WORLD map replaced. Comment
    lines just above a level stay with it, matched by the name it had (`was`),
    so renaming a level keeps them; everything else in the file is left as it
    was."""
    start = source.index("const LEVELS = [")
    end = source.index("];", start) + 2
    old = source[start:end]
    notes = {
        name: comment
        for comment, name in re.findall(r'((?:  // [^\n]*\n)*)  \{\n    name: (".*?"),', old)
    }
    blocks = []
    for level in levels:
        name = json.dumps(level["name"], ensure_ascii=False)
        was = json.dumps(level.get("was") or level["name"], ensure_ascii=False)
        rows = "".join(f"      {row}\n" for row in level["rows"])
        blocks.append(f"{notes.get(was, '')}  {{\n    name: {name},\n    map: `\n{rows}    `,\n  }},")
    source = source[:start] + "const LEVELS = [\n" + "\n".join(blocks) + "\n];" + source[end:]

    start = source.index("const WORLD = `")
    end = source.index("`;", start) + 2
    rows = "".join(f"  {row}\n" for row in world)
    return source[:start] + "const WORLD = `\n" + rows + "`;" + source[end:]


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def reply(self, code, text):
        body = text.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != SOKOBALL_SAVE:
            return self.reply(404, "Not found")
        # Only this computer, only the dev tools (the header can't be sent by a
        # plain form on some other site), and only addressed as localhost.
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0]
        if (self.client_address[0] not in LOCAL or self.headers.get("X-Sokoball-Dev") != "1"
                or host not in {"localhost", "127.0.0.1", "[::1]"}):
            return self.reply(403, "Only from this computer")
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > 1_000_000:
                raise ValueError("too big")
            data = json.loads(self.rfile.read(length))
            levels = []
            for n, level in enumerate(data["levels"]):
                name = str(level["name"]).strip()
                if not name or len(name) > 60 or "\n" in name:
                    raise ValueError(f"level {n + 1}'s name is missing or too long")
                was = str(level.get("was") or "")[:60]
                levels.append({"name": name, "was": was, "rows": check_text(level["map"], LEVEL_CHARS, f"{name}")})
            if not levels or len(levels) > 26:
                raise ValueError("there must be between 1 and 26 levels")
            world = check_text(data["world"], MAP_CHARS, "the map")
            text = rewrite_levels(SOKOBALL_LEVELS.read_text(encoding="utf-8"), levels, world)
        except (KeyError, TypeError, ValueError) as e:
            return self.reply(400, f"Not saved: {e}")
        # written to a spare file first, then swapped in, so a half-written
        # levels.js can never be left behind
        fd, spare = tempfile.mkstemp(dir=SOKOBALL_LEVELS.parent, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.chmod(spare, 0o644)
        os.replace(spare, SOKOBALL_LEVELS)
        self.reply(200, "Saved")


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler) as server:
        print(f"Serving on http://localhost:{PORT}")
        server.serve_forever()
