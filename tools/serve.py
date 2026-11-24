"""Local web server for the simulator with correct MIME types
(Windows often maps .js to text/plain, which browsers refuse for ES modules).

    python tools/serve.py            # then open http://localhost:8000/simulator/
    python tools/serve.py 9000       # another port
"""
import http.server
import os
import sys
from pathlib import Path

os.chdir(Path(__file__).resolve().parents[1])
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".glb": "model/gltf-binary",
        ".json": "application/json",
    }


print(f"Lotus Nano Bot Simulator: http://localhost:{port}/simulator/")
http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()
