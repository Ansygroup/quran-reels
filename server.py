#!/usr/bin/env python3
"""قرآن ريلز — local server: static files + CORS proxy for audio/APIs."""
import http.server
import os
import socketserver
import urllib.parse
import urllib.request
import urllib.error
import gzip
import io
import json
import mimetypes
import hashlib
import time
import threading

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
PORT = int(os.environ.get("PORT", "8787"))

ALLOWED_HOSTS = {
    "everyayah.com",
    "www.everyayah.com",
    "api.alquran.cloud",
    "cdn.jsdelivr.net",
    "raw.githubusercontent.com",
    "qurango.net",
    "overpass-api.de", "overpass.osm.ch", "overpass.kumi.systems",
    "lz4.overpass-api.de",
    "api.aladhan.com",
    "nominatim.openstreetmap.org",
}

# ---- hardening (mirrors api/proxy.js) ----
MAX_BYTES = 25 * 1024 * 1024
RATE_LIMIT = 120
RATE_WINDOW = 60.0
_rate = {}          # ip -> [window_start, count]
_rate_lock = threading.Lock()


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_OPENER_NO_REDIRECT = urllib.request.build_opener(_NoRedirect)


def _parse_range(header, size):
    if not header:
        return None
    import re
    m = re.match(r"bytes=(\d*)-(\d*)$", header.strip())
    if not m:
        return None
    if m.group(1) == "":
        n = int(m.group(2))
        if not n:
            return None
        start, end = max(0, size - n), size - 1
    else:
        start = int(m.group(1))
        end = size - 1 if m.group(2) == "" else int(m.group(2))
    if start > end or start >= size:
        return None
    return start, min(end, size - 1)


mimetypes.add_type("font/ttf", ".ttf")
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("audio/mpeg", ".mp3")
mimetypes.add_type("video/mp4", ".mp4")

TEXT_TYPES = {
    "text/html", "text/css", "text/plain", "text/svg", "application/json",
    "application/javascript", "image/svg+xml",
}

_cache = {}
_cache_lock = threading.Lock()
CACHE_TTL = 60 * 60 * 6  # 6 hours


def _should_gzip(path, ctype, data):
    if len(data) < 900:
        return False
    if ctype and (ctype.startswith("text/") or ctype in ("application/json", "application/javascript", "image/svg+xml")
                  or ctype.endswith(("javascript", "json", "css", "html", "svg"))):
        return True
    return False


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        pass

    def end_headers(self):
        if not getattr(self, "_cc_set", False):
            self.send_header("Cache-Control", "public, max-age=3600")
        super().end_headers()

    def do_GET(self):
        self._cc_set = False
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/proxy":
            return self.handle_proxy(parsed)
        if parsed.path.startswith("/api/ip"):
            return self.handle_ip()
        if parsed.path.startswith("/api/app-config"):
            return self.handle_config()
        # static with gzip
        rel = urllib.parse.unquote(parsed.path)
        if rel == "/" or rel == "":
            rel = "/index.html"
        safe = os.path.normpath(rel).lstrip("/")
        full = os.path.join(ROOT, safe)
        if os.path.isfile(full) and full.startswith(ROOT):
            try:
                with open(full, "rb") as f:
                    data = f.read()
                ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
                self._send(data, ctype)
            except Exception as e:
                self.send_error(500, str(e))
            return
        # SPA fallback for extensionless routes
        if "." not in os.path.basename(safe):
            full = os.path.join(ROOT, "index.html")
            with open(full, "rb") as f:
                data = f.read()
            self._send(data, "text/html; charset=utf-8")
            return
        self.send_error(404, "not found")

    def do_HEAD(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/proxy":
            return self.handle_proxy(parsed, head=True)
        return super().do_HEAD()

    def handle_config(self):
        """Public runtime config — mirror of api/app-config.js (Supabase via env)."""
        body = json.dumps({
            "supabase": {
                "url": os.environ.get("SUPABASE_URL", ""),
                "anon": os.environ.get("SUPABASE_ANON_KEY", ""),
            }
        }).encode("utf-8")
        self._send(body, "application/json; charset=utf-8")

    def handle_ip(self):
        """Best-effort public IP geolocation for default prayer/qibla location."""
        try:
            req = urllib.request.Request(
                "https://ipapi.co/json/",
                headers={"User-Agent": "quran-reels/1.0"},
            )
            with urllib.request.urlopen(req, timeout=8) as r:
                data = r.read()
            body = data
            ctype = "application/json"
        except Exception:
            body = b'{"country_name":"Egypt","city":"","latitude":30.0444,"longitude":31.2357}'
            ctype = "application/json"
        self._send(body, ctype)

    def handle_proxy(self, parsed, head=False):
        qs = urllib.parse.parse_qs(parsed.query)
        target = (qs.get("u") or qs.get("url") or [""])[0]
        if not target:
            self.send_error(400, "missing url")
            return
        # allow bare paths relative to known hosts? no — require full url
        tp = urllib.parse.urlparse(target)
        if tp.scheme not in ("http", "https") or (tp.hostname or "").lower() not in ALLOWED_HOSTS:
            self.send_error(403, "host not allowed")
            return
        if not self._rate_ok():
            self.send_error(429, "rate limit")
            return

        range_header = self.headers.get("Range")
        key = target
        now = time.time()
        with _cache_lock:
            hit = _cache.get(key)
        if hit and now - hit[0] < CACHE_TTL:
            body, ctype = hit[1], hit[2]
            rng = _parse_range(range_header, len(body)) if range_header else None
            if rng:
                s, e = rng
                self._send(body[s:e + 1], ctype, head=head, status=206,
                           extra={"Content-Range": f"bytes {s}-{e}/{len(body)}",
                                  "Accept-Ranges": "bytes"},
                           cache="public, max-age=600")
                return
            self._send(body, ctype, head=head, cached=True)
            return

        url = target
        resp = None
        for _hop in range(4):
            up = urllib.parse.urlparse(url)
            if up.scheme not in ("http", "https") or (up.hostname or "").lower() not in ALLOWED_HOSTS:
                self.send_error(502, "upstream error: redirect to host not allowed")
                return
            hdrs = {
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) QuranReels/1.0",
                "Accept": "*/*",
                "Accept-Encoding": "identity",
            }
            if range_header and _hop == 0:
                hdrs["Range"] = range_header
            req = urllib.request.Request(url, headers=hdrs)
            try:
                resp = _OPENER_NO_REDIRECT.open(req, timeout=30)
                break
            except urllib.error.HTTPError as e:
                if 300 <= e.code < 400:
                    loc = e.headers.get("Location")
                    e.close()
                    if not loc:
                        self.send_error(502, "upstream error: redirect without location")
                        return
                    url = urllib.parse.urljoin(url, loc)
                    continue
                code = e.code
                e.close()
                self.send_error(502, f"upstream error: status {code}")
                return
            except Exception as e:
                self.send_error(502, f"upstream error: {e}")
                return
        if resp is None:
            self.send_error(502, "upstream error: too many redirects")
            return

        status = getattr(resp, "status", 200)
        ctype = resp.headers.get("Content-Type", "application/octet-stream")
        if status == 206:
            body = resp.read()
            resp.close()
            self._send(body, ctype, head=head, status=206,
                       extra={"Content-Range": resp.headers.get("Content-Range", ""),
                              "Accept-Ranges": "bytes"},
                       cache="public, max-age=600")
            return
        body = resp.read(MAX_BYTES + 1)
        resp.close()
        if len(body) > MAX_BYTES:
            self.send_error(413, "response too large")
            return

        with _cache_lock:
            if len(_cache) > 120:
                _cache.clear()
            _cache[key] = (now, body, ctype)

        self._send(body, ctype, head=head)

    def _rate_ok(self):
        ip = self.client_address[0]
        nowt = time.time()
        with _rate_lock:
            e = _rate.get(ip)
            if not e or nowt - e[0] > RATE_WINDOW:
                e = [nowt, 0]
                _rate[ip] = e
            e[1] += 1
            if len(_rate) > 500:
                for k in [k for k, v in _rate.items() if nowt - v[0] > RATE_WINDOW]:
                    _rate.pop(k, None)
        return e[1] <= RATE_LIMIT

    def _send(self, body, ctype, head=False, cached=False, status=200, extra=None, cache=None):
        if ctype.startswith("text/html") and "charset" not in ctype:
            ctype += "; charset=utf-8"
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        if cached:
            self.send_header("X-Cache", "HIT")
        if cache:
            self.send_header("Cache-Control", cache)
            self._cc_set = True
        if extra:
            for k, v in extra.items():
                if v:
                    self.send_header(k, str(v))
        accept = self.headers.get("Accept-Encoding", "")
        if status != 206 and "gzip" in accept and _should_gzip("", ctype, body):
            buf = io.BytesIO()
            with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
                gz.write(body)
            body = buf.getvalue()
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head:
            try:
                self.wfile.write(body)
            except BrokenPipeError:
                pass

    def send_error(self, code, message=None, explain=None):
        # JSON-ish errors for proxy callers
        try:
            super().send_error(code, message, explain)
        except BrokenPipeError:
            pass


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    os.chdir(ROOT)
    server = ThreadingServer(("0.0.0.0", PORT), Handler)
    print(f"QuranReels server running on http://0.0.0.0:{PORT} (root={ROOT})")
    server.serve_forever()


if __name__ == "__main__":
    main()
