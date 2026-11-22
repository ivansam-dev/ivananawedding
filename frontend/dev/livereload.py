"""Dev-only live reload for `make dev`.

Watches /watch (frontend/public, mounted read-only) and tells open pages over Server-Sent Events
when something changes. nginx injects /__livereload/client.js into HTML in dev (see livereload.conf).
Polls mtimes rather than relying on inotify, which is unreliable on Docker Desktop bind mounts.
"""
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = "/watch"
PORT = 35729

CLIENT_JS = b"""(() => {
  const es = new EventSource('/__livereload/events');
  es.onmessage = (e) => {
    const files = JSON.parse(e.data);
    if (files.every((f) => f.endsWith('.css'))) {
      // CSS only: swap stylesheets in place so the page (and admin view) keeps its state
      for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
        const url = new URL(link.href);
        if (url.origin !== location.origin) continue;
        url.searchParams.set('lr', Date.now());
        link.href = url.href;
      }
    } else {
      location.reload();
    }
  };
})();
"""

cond = threading.Condition()
version = 0
changed: list[str] = []


def snapshot() -> dict[str, float]:
    out = {}
    for dirpath, _, files in os.walk(ROOT):
        for name in files:
            p = os.path.join(dirpath, name)
            try:
                out[p] = os.stat(p).st_mtime
            except FileNotFoundError:
                pass
    return out


def watch() -> None:
    global version, changed
    prev = snapshot()
    while True:
        time.sleep(0.3)
        cur = snapshot()
        diff = sorted({p for p in prev.keys() | cur.keys() if prev.get(p) != cur.get(p)})
        prev = cur
        if diff:
            rel = [os.path.relpath(p, ROOT) for p in diff]
            print("changed:", ", ".join(rel), flush=True)
            with cond:
                version += 1
                changed = rel
                cond.notify_all()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # quiet
        pass

    def do_GET(self):
        if self.path.startswith("/__livereload/client.js"):
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(CLIENT_JS)
        elif self.path.startswith("/__livereload/events"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            with cond:
                seen = version
            try:
                while True:
                    with cond:
                        cond.wait_for(lambda: version != seen, timeout=15)
                        if version == seen:
                            msg = b": ping\n\n"  # keep the connection alive
                        else:
                            seen = version
                            msg = f"data: {json.dumps(changed)}\n\n".encode()
                    self.wfile.write(msg)
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
        else:
            self.send_error(404)


if __name__ == "__main__":
    threading.Thread(target=watch, daemon=True).start()
    print(f"livereload watching {ROOT} on :{PORT}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
