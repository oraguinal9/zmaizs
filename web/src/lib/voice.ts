"use client";

// ── 语音模块 v9.1 — 双模式录音 + 云端桌面 ──
// 本地桌面: Chrome SpeechRecognition + 6s 自动截断
// 云端桌面: MediaRecorder 连续录音 → WAV → /asr（不依赖 Google）
// 手机/其他: MediaRecorder 按住录音 → WAV → /asr
// TTS: /tts → Web Audio

// ── TTS ──
let ttsCancelToken = 0;
let sharedCtx: AudioContext | null = null;
let ttsSpeaking = false;
let activeSource: AudioBufferSourceNode | null = null;
export function isSpeaking(): boolean { return ttsSpeaking; }

export function unlockAudio() {
  if (typeof window === "undefined") return;
  try {
    if (!sharedCtx) sharedCtx = new AudioContext();
    if (sharedCtx.state === "suspended") sharedCtx.resume();
  } catch {}
}

export async function speakText(text: string, style: string = "tianmei"): Promise<void> {
  if (typeof window === "undefined") return;
  stopSpeaking();
  ttsSpeaking = true;
  const token = ++ttsCancelToken;
  const ttsUrl = `/tts?text=${encodeURIComponent(text)}&voice=${style}`;
  const done = () => { if (token === ttsCancelToken) ttsSpeaking = false; };

  try {
    const res = await fetch(ttsUrl);
    if (!res.ok || token !== ttsCancelToken) { done(); return; }
    const arrayBuf = await res.arrayBuffer();
    if (arrayBuf.byteLength < 100 || token !== ttsCancelToken) { done(); return; }
    if (!sharedCtx) sharedCtx = new AudioContext();
    if (sharedCtx.state === "suspended") await sharedCtx.resume();
    const audioBuf = await sharedCtx.decodeAudioData(arrayBuf.slice(0));
    const source = sharedCtx.createBufferSource();
    source.buffer = audioBuf;
    source.connect(sharedCtx.destination);
    source.onended = () => { if (activeSource === source) activeSource = null; done(); };
    activeSource = source;
    source.start(0);
    setTimeout(done, (audioBuf.duration * 1000) + 500);
  } catch {
    done();
  }
}

export function stopSpeaking() {
  ttsCancelToken++;
  ttsSpeaking = false;
  if (activeSource) {
    try { activeSource.stop(); } catch {}
    activeSource = null;
  }
}

// ── 语音支持检测 ──
export type VoiceMode = "chrome" | "mobile" | "none";

export function detectVoiceMode(): VoiceMode {
  if (typeof window === "undefined") return "none";
  const hasSR = !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
  if (hasSR) return "chrome";
  const hasMic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (hasMic) return "mobile";
  return "none";
}

export function isVoiceSupported(): boolean {
  return getVoiceUnsupportedReason() === null;
}

export function getVoiceUnsupportedReason(): string | null {
  if (typeof window === "undefined") return "浏览器环境未就绪";
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return "未检测到麦克风，请检查麦克风是否已连接";
  }
  return null;
}

// ── 桌面 ASR：Chrome SpeechRecognition ──
let recognition: any = null;
let recordTimer: ReturnType<typeof setTimeout> | null = null;
let accumulatedText = "";

function getSpeechRecognition(): any {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function startListening(onResult: (text: string, isFinal: boolean) => void, onStatus: (s: string) => void) {
  if (typeof window === "undefined") return;
  stopListening();
  const SR = getSpeechRecognition();
  if (!SR) { onStatus("stopped"); return; }

  try {
    recognition = new SR();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    accumulatedText = "";

    recognition.onresult = (event: any) => {
      let latest = "";
      for (let i = 0; i < event.results.length; i++) {
        const t = event.results[i][0].transcript.trim();
        const isFinal = event.results[i].isFinal;
        if (t.length > latest.length) latest = t;
        if (isFinal && t) {
          if (recordTimer) { clearTimeout(recordTimer); recordTimer = null; }
          onResult(t, true);
          return;
        }
      }
      if (latest) {
        accumulatedText = latest;
        onResult(latest, false);
      }
    };

    recognition.onerror = () => {};
    recognition.onend = () => {};
    recognition.start();
    onStatus("listening");

    recordTimer = setTimeout(() => {
      stopListening();
      const finalText = accumulatedText.trim();
      if (finalText) onResult(finalText, true);
      onStatus("stopped");
    }, 6000);
  } catch (e) {
    onStatus("stopped");
  }
}

export function stopListening() {
  if (recordTimer) { clearTimeout(recordTimer); recordTimer = null; }
  if (recognition) { try { recognition.stop(); } catch {}; recognition = null; }
}

// ── 手机录音：MediaRecorder webm → decode → WAV → ASR ──
function _writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

let mobileStream: MediaStream | null = null;
let mobileRecorder: MediaRecorder | null = null;
let mobileWebmChunks: Blob[] = [];

export async function startMobileRecord(): Promise<void> {
  mobileWebmChunks = [];
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mobileStream = stream;
  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
    ? "audio/webm;codecs=opus" : "audio/webm";
  mobileRecorder = new MediaRecorder(stream, { mimeType });
  mobileRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) mobileWebmChunks.push(e.data);
  };
  mobileRecorder.start();
}

export async function stopMobileRecord(): Promise<{ text: string; error?: string }> {
  if (!mobileRecorder || mobileRecorder.state === "inactive") {
    return { text: "", error: "录音未开始" };
  }

  return new Promise((resolve) => {
    mobileRecorder!.onstop = async () => {
      if (mobileStream) { mobileStream.getTracks().forEach((t) => t.stop()); mobileStream = null; }
      const webmBlob = new Blob(mobileWebmChunks, { type: "audio/webm" });
      mobileWebmChunks = [];
      if (webmBlob.size < 300) { resolve({ text: "", error: "录音太短" }); return; }

      try {
        const wavBlob = await webmToWav(webmBlob);
        const asrUrl = localStorage.getItem("gf_asr_server") || "";
        const res = await fetch(asrUrl || "/asr", {
          method: "POST",
          body: wavBlob,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          resolve({ text: "", error: "识别失败(" + res.status + "): " + errText.slice(0, 40) });
          return;
        }
        const data = await res.json();
        resolve({ text: data.text || "", error: data.text ? undefined : "未识别到语音" });
      } catch (e: any) {
        resolve({ text: "", error: "网络错误" });
      }
    };
    mobileRecorder!.stop();
  });
}

export function cancelMobileRecord() {
  if (mobileRecorder && mobileRecorder.state !== "inactive") {
    mobileRecorder.onstop = null;
    mobileRecorder.stop();
  }
  if (mobileStream) { mobileStream.getTracks().forEach((t) => t.stop()); mobileStream = null; }
  mobileRecorder = null; mobileWebmChunks = [];
}

// ── WebM → WAV 转换（共享，重采样到 16kHz 匹配阿里云 ASR）──
async function webmToWav(webmBlob: Blob): Promise<Blob> {
  const arrayBuf = await webmBlob.arrayBuffer();
  const ctx = new AudioContext();
  const audioBuf = await ctx.decodeAudioData(arrayBuf);
  const inputSr = audioBuf.sampleRate;
  const inputPcm = audioBuf.getChannelData(0);

  // 重采样到 16000 Hz（阿里云 ASR 要求）
  const TARGET_SR = 16000;
  let pcm: Float32Array;
  if (inputSr === TARGET_SR) {
    pcm = inputPcm;
  } else {
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(inputPcm.length * TARGET_SR / inputSr), TARGET_SR);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuf;
    source.connect(offlineCtx.destination);
    source.start(0);
    const rendered = await offlineCtx.startRendering();
    pcm = rendered.getChannelData(0);
  }
  ctx.close();

  const sr = TARGET_SR;
  const dataSize = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  _writeString(v, 0, "RIFF"); v.setUint32(4, 36 + dataSize, true);
  _writeString(v, 8, "WAVE"); _writeString(v, 12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  _writeString(v, 36, "data"); v.setUint32(40, dataSize, true);
  for (let i = 0; i < pcm.length; i++) {
    v.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, pcm[i] * 32767)), true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

// ── 云端桌面 ASR：MediaRecorder 连续录音 → /asr ──
let cloudStream: MediaStream | null = null;
let cloudRecorder: MediaRecorder | null = null;
let cloudChunks: Blob[] = [];
let cloudTimer: ReturnType<typeof setTimeout> | null = null;
let cloudCancelled = false;

export function startCloudListening(
  onResult: (text: string, isFinal: boolean) => void,
  onStatus: (s: string) => void
) {
  if (typeof window === "undefined") return;
  stopCloudListening();
  cloudCancelled = false;
  cloudChunks = [];

  navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    if (cloudCancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
    cloudStream = stream;
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus" : "audio/webm";
    cloudRecorder = new MediaRecorder(stream, { mimeType });
    cloudRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) cloudChunks.push(e.data);
    };
    cloudRecorder.onstop = async () => {
      if (cloudStream) { cloudStream.getTracks().forEach((t) => t.stop()); cloudStream = null; }
      if (cloudCancelled) return;
      const webmBlob = new Blob(cloudChunks, { type: "audio/webm" });
      cloudChunks = [];
      if (webmBlob.size < 500) { onStatus("stopped"); return; }
      try {
        const wavBlob = await webmToWav(webmBlob);
        const asrUrl = localStorage.getItem("gf_asr_server") || "";
        const res = await fetch(asrUrl || "/asr", { method: "POST", body: wavBlob });
        if (!res.ok) { onStatus("stopped"); return; }
        const data = await res.json();
        if (data.text) {
          onResult(data.text, true);
        }
      } catch { /* ignore */ }
      onStatus("stopped");
    };
    cloudRecorder.start();
    onStatus("listening");
    // 4 秒后自动停止并识别
    cloudTimer = setTimeout(() => {
      stopCloudListening();
    }, 4000);
  }).catch(() => {
    onStatus("stopped");
  });
}

export function stopCloudListening() {
  if (cloudTimer) { clearTimeout(cloudTimer); cloudTimer = null; }
  cloudCancelled = true;
  if (cloudRecorder && cloudRecorder.state !== "inactive") {
    try { cloudRecorder.stop(); } catch {}
  }
  cloudRecorder = null;
  if (cloudStream) { cloudStream.getTracks().forEach((t) => t.stop()); cloudStream = null; }
}

// ── 检测是否为云端部署 ──
export function isCloudDeploy(): boolean {
  if (typeof window === "undefined") return false;
  const origin: string = window.location.origin;
  return !!origin && !origin.includes("localhost") && !origin.includes("127.0.0.1");
}

// ── 语音风格 ──
export interface VoiceStyle { label: string; voice: string; desc: string; }
export const VOICE_STYLES: Record<string, VoiceStyle> = {
  tianmei: { label: "甜宠", voice: "zh-CN-XiaoyiNeural", desc: "甜美少御" },
  wenrou:  { label: "淑女", voice: "zh-CN-XiaoxiaoNeural", desc: "温柔淑女" },
};
export function getVoiceStyle(key: string): VoiceStyle {
  return VOICE_STYLES[key] || VOICE_STYLES["tianmei"];
}
