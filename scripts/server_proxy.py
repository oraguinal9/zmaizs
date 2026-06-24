"""虚拟女友 API 代理 — DeepSeek V4 Flash + 限流"""
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
import json
import time
import urllib.request

DEEPSEEK_KEY = open("/root/.deepseek_key").read().strip()
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
MODEL = "deepseek-chat"
PORT = 5002

RATE_LIMIT = {}
MAX_RPM = 30

def is_rate_limited(ip):
    now = time.time()
    if ip not in RATE_LIMIT:
        RATE_LIMIT[ip] = []
    RATE_LIMIT[ip] = [t for t in RATE_LIMIT[ip] if now - t < 60]
    if len(RATE_LIMIT[ip]) >= MAX_RPM:
        return True
    RATE_LIMIT[ip].append(now)
    return False

class ProxyHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if urlparse(self.path).path != "/chat":
            self.err(404, "not found")
            return

        ip = self.client_address[0]
        if is_rate_limited(ip):
            self.err(429, "rate limited")
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            req_data = json.loads(body)
        except Exception:
            self.err(400, "bad json")
            return

        system_prompt = req_data.get("system_prompt", "")
        messages = req_data.get("messages", [])
        temperature = req_data.get("temperature", 0.6)
        max_tokens = req_data.get("max_tokens", 200)

        ds_messages = []
        if system_prompt:
            ds_messages.append({"role": "system", "content": system_prompt})
        ds_messages.extend(messages)

        payload = json.dumps({
            "model": MODEL,
            "messages": ds_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }).encode("utf-8")

        try:
            req = urllib.request.Request(
                DEEPSEEK_URL,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + DEEPSEEK_KEY,
                },
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
                reply = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                self.ok({"reply": reply})
        except Exception as e:
            self.err(502, str(e)[:100])

    def ok(self, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def err(self, code, msg):
        body = json.dumps({"error": msg}, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass

if __name__ == "__main__":
    print("Proxy on port " + str(PORT) + ", model=" + MODEL)
    HTTPServer(("127.0.0.1", PORT), ProxyHandler).serve_forever()
