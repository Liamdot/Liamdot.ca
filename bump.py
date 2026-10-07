"""Bump the ?v= on every script and stylesheet tag.

Cloudflare Pages caches JS and CSS for four hours and ignores any Cache-Control
we ask for in _headers, so the only reliable way to get a change to a visitor is
to change the URL. Every page asks for its assets with a ?v=N; this walks the
version on by one everywhere at once.

Run it after changing any JS or CSS, before pushing:

    python3 bump.py
"""

import pathlib
import re
import sys

PAGES = ["index.html", "404.html"] + sorted(
    str(p) for p in pathlib.Path("projects").glob("*/index.html")
)

TAG = re.compile(r'\b(src|href)="([^"]+\.(?:js|css))(\?v=(\d+))?"')


def main():
    found = set()
    for page in PAGES:
        for m in TAG.finditer(pathlib.Path(page).read_text()):
            found.add(int(m.group(4)) if m.group(4) else 0)

    nxt = (max(found) if found else 0) + 1
    touched = 0

    for page in PAGES:
        path = pathlib.Path(page)
        before = path.read_text()
        after = TAG.sub(lambda m: f'{m.group(1)}="{m.group(2)}?v={nxt}"', before)
        if after != before:
            path.write_text(after)
            touched += 1

    if len(found) > 1:
        print(f"note: pages were on mixed versions {sorted(found)} - all on {nxt} now")
    print(f"v{nxt} across {touched} page{'' if touched == 1 else 's'}")


if __name__ == "__main__":
    sys.exit(main())
