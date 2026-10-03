# Local server for the Swing Lab page. Run:  python3 serve.py   then open http://localhost:8000
# Same as `python3 -m http.server`, but tells the browser not to cache, so edits show up on reload.
import http.server, socketserver

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("127.0.0.1", 8000), NoCache) as httpd:
    print("Swing Lab running at http://localhost:8000  (Ctrl+C to stop)")
    httpd.serve_forever()
