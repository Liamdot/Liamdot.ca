"""Local dev server for the site.

Same as `python3 -m http.server`, but tells the browser never to cache, so
edits to CSS/JS show up on a normal reload instead of serving stale copies.

    python3 serve.py          # http://localhost:8123
    python3 serve.py 9000     # pick a different port
"""

import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    with http.server.ThreadingHTTPServer(("", PORT), NoCacheHandler) as server:
        print(f"Serving on http://localhost:{PORT}")
        server.serve_forever()
