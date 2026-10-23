"""Serve the exported development preview with client-side route fallback."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1] / "apps/mobile/dist"


class PreviewHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        path = urlsplit(self.path).path
        if not Path(self.translate_path(path)).exists() and not Path(path).suffix:
            self.path = "/index.html"
        return super().send_head()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8081)
    options = parser.parse_args()
    if not ROOT.joinpath("index.html").is_file():
        parser.error("Build the preview first with pnpm build")
    ThreadingHTTPServer(
        ("127.0.0.1", options.port), partial(PreviewHandler, directory=str(ROOT))
    ).serve_forever()
