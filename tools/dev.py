"""Servidor local do ARA (Windows, macOS e Linux; só biblioteca padrão).

Uso, na raiz do projeto:
    python tools/dev.py            # abre http://localhost:8000
    python tools/dev.py --port 5500 --no-browser

Serve a pasta web/ e responde /data/* direto da pasta data/ da raiz, então
depois de rodar o pipeline é só recarregar a página (sem copiar arquivos).
Abrir o index.html com duplo clique não funciona: o navegador bloqueia fetch()
e módulos JS em file://.
"""
from __future__ import annotations

import argparse
import functools
import http.server
import socketserver
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
DATA = ROOT / "data"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json"}

    def translate_path(self, path):
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if clean.startswith("/data/"):
            target = (DATA / clean[len("/data/"):]).resolve()
            if DATA in target.parents or target == DATA:
                return str(target)
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    handler = functools.partial(Handler, directory=str(WEB))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", args.port), handler) as httpd:
        url = f"http://localhost:{args.port}/"
        print(f"ARA rodando em {url}  (Ctrl+C para parar)")
        if not args.no_browser:
            webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nParado.")


if __name__ == "__main__":
    main()
