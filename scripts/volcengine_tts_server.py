"""火山引擎语音合成代理 — 监听 5001 端口"""
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import urllib.request
import json
import sys
import uuid
import base64

APPID = "YOUR_VOLCENGINE_APPID"
TOKEN = "KgHAxs85dkcFVDEh0saLABteS9L2ukUP"
TTS_URL = "https://openspeech.bytedance.com/api/v1/tts"

# 女声发音人 (全部已验证可用)
VOICES = {
    "tianmei": "BV113_streaming",     # 甜宠少御 (情感版)
    "wenrou":  "BV104_streaming",     # 温柔淑女 (情感版)
    "yujie":   "BV428_streaming",     # 清新文艺
    "huopo":   "BV405_streaming",     # 甜美小源
}

class TTSHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.end_headers()

    def do_GET(self):
        qs = parse_qs(urlparse(self.path).query)
        text = qs.get("text", [""])[0]
        style = qs.get("style", ["tianmei"])[0]

        if not text.strip():
            self.err(400, "empty text")
            return

        voice_type = VOICES.get(style, VOICES["tianmei"])

        payload = json.dumps({
            "app": {
                "appid": APPID,
                "token": TOKEN,
                "cluster": "volcano_tts",
            },
            "user": {"uid": "xiaoling"},
            "audio": {
                "voice_type": voice_type,
                "encoding": "mp3",
            },
            "request": {
                "reqid": str(uuid.uuid4()),
                "text": text,
                "text_type": "plain",
                "operation": "query",
            },
        }).encode("utf-8")

        try:
            req = urllib.request.Request(
                TTS_URL,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer; {TOKEN}",
                },
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read())

                if result.get("code") != 3000:
                    self.err(400, f"Volc TTS: {result.get('message', 'unknown')}")
                    return

                audio_b64 = result.get("data", "")
                if not audio_b64:
                    self.err(500, "no audio data")
                    return

                audio_data = base64.b64decode(audio_b64)
                self.send_response(200)
                self.send_header("Content-Type", "audio/mp3")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(audio_data)))
                self.end_headers()
                self.wfile.write(audio_data)
        except Exception as e:
            self.err(502, str(e)[:200])

    def err(self, code, msg):
        body = json.dumps({"error": msg}, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, f, *a):
        pass

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5001
    print(f"Volcengine TTS on http://127.0.0.1:{port}", file=sys.stderr, flush=True)
    HTTPServer(("127.0.0.1", port), TTSHandler).serve_forever()
