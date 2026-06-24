"""阿里云语音识别代理 — 监听 5003 端口
接收 WAV/PCM 音频 → 阿里云 ASR → 返回文本
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.request
import json
import sys
import time
from alibabacloud_nls_cloud_meta20180518.client import Client
from alibabacloud_tea_openapi import models as open_api_models
from alibabacloud_tea_util import models as util_models

AK_ID = "YOUR_ALIBABA_ACCESS_KEY"
AK_SECRET = "cFBErWncI5UmKLDA3A5X35ZLmyIkeN"
APPKEY = "sCvlOnw6aggvGa6N"

ASR_URL = "https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/asr"

_token_cache = {"value": "", "expire": 0}

def get_token():
    if _token_cache["value"] and time.time() < _token_cache["expire"] - 60:
        return _token_cache["value"]
    config = open_api_models.Config(
        access_key_id=AK_ID, access_key_secret=AK_SECRET,
        endpoint="nls-meta.cn-shanghai.aliyuncs.com",
    )
    client = Client(config)
    headers = {"appkey": APPKEY}
    resp = client.create_token_with_options(headers, util_models.RuntimeOptions())
    _token_cache["value"] = resp.body.token.id
    _token_cache["expire"] = resp.body.token.expire_time
    return _token_cache["value"]

class ASRHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if self.path != "/asr":
            self.err(404, "not found")
            return

        length = int(self.headers.get("Content-Length", 0))
        if length < 1000:
            self.err(400, "audio too short")
            return

        audio_data = self.rfile.read(length)
        content_type = self.headers.get("Content-Type", "")

        # 判断音频格式
        if "wav" in content_type:
            fmt = "wav"
        elif "pcm" in content_type:
            fmt = "pcm"
        else:
            fmt = "wav"  # 默认WAV

        token = get_token()
        params = (f"appkey={APPKEY}&token={token}&format={fmt}"
                  f"&sample_rate=16000&enable_punctuation_prediction=true"
                  f"&enable_inverse_text_normalization=true")

        try:
            req = urllib.request.Request(
                f"{ASR_URL}?{params}",
                data=audio_data,
                headers={
                    "Content-Type": "application/octet-stream",
                    "X-NLS-Token": token,
                },
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read())
                text = result.get("result", "").strip()
                if text:
                    self.ok({"text": text})
                else:
                    self.err(400, "no speech detected")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode(errors="replace")
            print(f"ASR API error: {err_body[:300]}", file=sys.stderr, flush=True)
            self.err(502, f"ASR API: {e.code}")
        except Exception as e:
            self.err(502, str(e)[:200])

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

    def log_message(self, f, *a):
        pass

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5003
    get_token()
    print(f"Aliyun ASR on http://127.0.0.1:{port}", file=sys.stderr, flush=True)
    HTTPServer(("127.0.0.1", port), ASRHandler).serve_forever()
