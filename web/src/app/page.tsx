"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getMessages, addMessage, clearMessages, getProfile, saveProfile, canChat, getRemainingChats, incrementDailyCount } from "@/lib/storage";
import type { GirlProfile } from "@/lib/storage";
import { buildSystemPrompt } from "@/lib/prompt";
import { chatWithAI } from "@/lib/ai";
import {
  speakText, stopSpeaking, startListening, stopListening,
  startCloudListening, stopCloudListening, isCloudDeploy,
  isVoiceSupported, getVoiceUnsupportedReason, detectVoiceMode,
  startMobileRecord, stopMobileRecord, cancelMobileRecord,
  getVoiceStyle, VOICE_STYLES, unlockAudio, isSpeaking,
} from "@/lib/voice";
import type { VoiceMode } from "@/lib/voice";
import VRMCharacter from "@/components/VRMCharacter";
import type { VRMHandle } from "@/components/VRMCharacter";

type Msg = { id: number; role: "user" | "assistant"; content: string; time: string };

export default function HomePage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<GirlProfile>({ name: "小灵", character: "温柔软萌，偶尔撒娇粘人", birth: "6月1日", hobby: "追剧、吃甜品、逛小吃街", nickname: "宝贝" });
  const [apiKey, setApiKey] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [apiConfigured, setApiConfigured] = useState(false);

  // 语音
  const [voiceStyle, setVoiceStyle] = useState("tianmei");
  const voiceSupported = isVoiceSupported();
  const [voiceModeType, setVoiceModeType] = useState<VoiceMode>("none");
  const isMobileVoice = voiceModeType === "mobile";
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [subtitle, setSubtitle] = useState("");
  const [subtitleRole, setSubtitleRole] = useState<"user" | "assistant" | "">("");
  const [isListening, setIsListening] = useState(false);
  const [mobileRecording, setMobileRecording] = useState(false);
  const voiceActiveRef = useRef(false);
  const profileRef = useRef(getProfile());
  const voiceStyleRef = useRef("tianmei");

  const scrollRef = useRef<HTMLDivElement>(null);
  const girlRef = useRef<VRMHandle>(null);
  const mouthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);
  const [modelPath, setModelPath] = useState("/models/6851268443831277502.vrm");
  const [models, setModels] = useState<{ path: string; name: string; character?: string; birth?: string; hobby?: string; nickname?: string; rotationY?: number; armAngle?: number }[]>([]);
  const [mounted, setMounted] = useState(false);
  const [remainingChats, setRemainingChats] = useState(50);

  // 嘴型
  const startMouthAnim = useCallback(() => {
    stopMouthAnim(); let phase = 0;
    mouthTimerRef.current = setInterval(() => { phase += 0.3; girlRef.current?.setMouthOpen(0.25 + Math.abs(Math.sin(phase)) * 0.55); }, 80);
  }, []);
  const stopMouthAnim = useCallback(() => { if (mouthTimerRef.current) { clearInterval(mouthTimerRef.current); mouthTimerRef.current = null; } girlRef.current?.setMouthOpen(0); }, []);

  // 初始化
  useEffect(() => {
    setMessages(getMessages());
    const savedProfile = getProfile();
    setProfile(savedProfile); profileRef.current = savedProfile;
    const savedStyle = localStorage.getItem("gf_voicestyle") || "tianmei";
    setVoiceStyle(savedStyle); voiceStyleRef.current = savedStyle;
    const savedModel = localStorage.getItem("gf_model") || "/models/6851268443831277502.vrm";
    setModelPath(savedModel);
    const savedApiKey = localStorage.getItem("gf_api_key") || "";
    if (savedApiKey) { setApiKey(savedApiKey); setApiConfigured(true); }
    const savedServer = localStorage.getItem("gf_api_server") || "";
    // 自动检测：用当前域名作为代理服务器（云端 + 本地通用）
    if (savedServer) {
      setServerUrl(savedServer); setApiConfigured(true);
    } else if (typeof window !== "undefined") {
      const origin = window.location.origin;
      if (origin) {
        setServerUrl(origin); setApiConfigured(true);
      }
    }

    const isMobile = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
    const detected = detectVoiceMode();
    setVoiceModeType(isMobile && detected === "chrome" ? "mobile" : detected);
    setRemainingChats(getRemainingChats());
    setMounted(true);
    fetch("/models.json").then((r) => r.json()).then((data) => { if (Array.isArray(data)) setModels(data); }).catch(() => {});
  }, []);

  // 切换模型时同步名字+人设
  useEffect(() => {
    if (models.length > 0) {
      const matched = models.find((m) => m.path === modelPath);
      if (matched && matched.character) {
        setProfile((prev) => {
          if (prev.name === matched.name && prev.character === matched.character) return prev;
          const updated = { ...prev, name: matched.name, character: matched.character || prev.character, birth: matched.birth || prev.birth, hobby: matched.hobby || prev.hobby, nickname: matched.nickname || prev.nickname };
          saveProfile(updated); return updated;
        });
      }
    }
  }, [modelPath, models]);

  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { voiceStyleRef.current = voiceStyle; }, [voiceStyle]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  // 发送消息
  const voiceSend = useCallback(async (text: string): Promise<string> => {
    if (!canChat()) return "今日免费次数已用完，明天再来吧~";
    const now = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    const userMsg: Msg = { id: Date.now(), role: "user", content: text, time: now };
    addMessage(userMsg); setMessages(getMessages());
    const allMsgs = getMessages().slice(-20);
    const history = allMsgs.map((m) => ({ role: m.role, content: m.content }));
    const prompt = buildSystemPrompt(profileRef.current);
    const reply = await chatWithAI(apiKey, prompt, history, text);
    const aiMsg: Msg = { id: Date.now() + 1, role: "assistant", content: reply, time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) };
    addMessage(aiMsg); setMessages(getMessages());
    incrementDailyCount(); setRemainingChats(getRemainingChats());
    return reply;
  }, [apiKey]);

  // 桌面语音循环
  const clearRetryTimer = () => { if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; } };
  const scheduleNext = useCallback((delayMs: number) => { clearRetryTimer(); retryTimerRef.current = setTimeout(() => { retryTimerRef.current = null; if (voiceActiveRef.current) beginListening(); }, delayMs); }, []);
  const beginListening = useCallback(() => {
    if (!voiceActiveRef.current) return;
    if (processingRef.current || isSpeaking()) { scheduleNext(500); return; }
    clearRetryTimer(); stopMouthAnim(); setIsListening(true); setSubtitle("正在听..."); setSubtitleRole("");
    const handleResult = (text: string, isFinal: boolean) => {
      if (!voiceActiveRef.current) return;
      setSubtitle(text || "正在听..."); setSubtitleRole("user");
      if (isFinal && text.trim()) {
        setIsListening(false); processingRef.current = true;
        (async () => {
          try {
            if (!voiceActiveRef.current) { processingRef.current = false; return; }
            stopMouthAnim(); setSubtitle(text.trim()); setSubtitleRole("user"); setLoading(true);
            const reply = await voiceSend(text.trim()); setLoading(false);
            if (!voiceActiveRef.current) { processingRef.current = false; return; }
            setSubtitle(reply); setSubtitleRole("assistant"); startMouthAnim();
            await speakText(reply, voiceStyleRef.current);
            if (!canChat()) { stopVoiceLoop(); processingRef.current = false; return; }
            if (!voiceActiveRef.current) { processingRef.current = false; return; }
            stopMouthAnim(); processingRef.current = false; scheduleNext(2000);
          } catch (e) { processingRef.current = false; }
        })();
      }
    };
    const handleStop = (_status: string) => { if (!voiceActiveRef.current) return; setIsListening(false); scheduleNext(1500); };
    if (isCloudDeploy()) {
      startCloudListening(handleResult, handleStop);
    } else {
      startListening(handleResult, handleStop);
    }
  }, [voiceSend, scheduleNext]);

  const startVoiceLoop = useCallback(() => {
    if (!voiceSupported) { setSubtitle("浏览器不支持语音，请用Chrome"); setTimeout(() => setSubtitle(""), 3000); return; }
    voiceActiveRef.current = true; setVoiceActive(true); beginListening();
  }, [voiceSupported, beginListening]);

  const stopVoiceLoop = useCallback(() => {
    voiceActiveRef.current = false; setVoiceActive(false); clearRetryTimer();
    setIsListening(false); stopListening(); stopCloudListening(); stopSpeaking(); stopMouthAnim(); setSubtitle(""); setSubtitleRole("");
  }, [stopMouthAnim]);

  // 手机录音
  const handleMobileStart = useCallback(async () => {
    if (!voiceActiveRef.current || loading) return;
    try { await startMobileRecord(); setMobileRecording(true); setSubtitle("正在听..."); setSubtitleRole("user"); }
    catch { setSubtitle("无法访问麦克风，请检查权限"); setTimeout(() => setSubtitle(""), 3000); }
  }, [loading]);

  const handleMobileStop = useCallback(async () => {
    if (!mobileRecording) return; setMobileRecording(false);
    setSubtitle("识别中..."); setSubtitleRole("");
    const result = await stopMobileRecord();
    if (result.error || !result.text.trim()) { setSubtitle(result.error || "未识别到语音"); setTimeout(() => setSubtitle(""), 2500); return; }
    const userText = result.text.trim(); setSubtitle(userText); setSubtitleRole("user"); setLoading(true);
    const reply = await voiceSend(userText); setLoading(false);
    if (!voiceActiveRef.current) return;
    setSubtitle(reply); setSubtitleRole("assistant"); startMouthAnim();
    await speakText(reply, voiceStyleRef.current); stopMouthAnim();
    if (!canChat()) { stopVoiceLoop(); return; }
    if (!voiceActiveRef.current) return; setSubtitle(""); setSubtitleRole("");
  }, [mobileRecording, voiceSend]);

  const toggleVoiceMode = () => {
    if (voiceMode) {
      try { stopVoiceLoop(); } catch {}
      try { cancelMobileRecord(); } catch {}
      setVoiceMode(false); setVoiceActive(false); setMobileRecording(false);
    } else {
      const reason = getVoiceUnsupportedReason();
      if (reason) { setSubtitle(reason); setTimeout(() => setSubtitle(""), 5000); return; }
      unlockAudio(); voiceActiveRef.current = true; setVoiceMode(true); setVoiceActive(true);
      if (!isMobileVoice) { setTimeout(() => startVoiceLoop(), 800); }
    }
  };

  // 键盘
  const handleKey = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSend(); } };
  const handleTextSend = async () => {
    if (!input.trim() || loading) return;
    if (!canChat()) { setInput("今日免费次数已用完"); setTimeout(() => setInput(""), 1500); return; }
    unlockAudio();
    const text = input; setInput("");
    const allMsgs = getMessages().slice(-20);
    const history = allMsgs.map((m) => ({ role: m.role, content: m.content }));
    const prompt = buildSystemPrompt(profile);
    setLoading(true);
    const now = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    const userMsg: Msg = { id: Date.now(), role: "user", content: text, time: now };
    addMessage(userMsg); setMessages(getMessages());
    const reply = await chatWithAI(apiKey, prompt, history, text); setLoading(false);
    const aiMsg: Msg = { id: Date.now() + 1, role: "assistant", content: reply, time: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) };
    addMessage(aiMsg); setMessages(getMessages());
    incrementDailyCount(); setRemainingChats(getRemainingChats());
    if (reply) { startMouthAnim(); setTimeout(() => speakText(reply, voiceStyle), 100); }
  };

  const saveSettings = () => {
    saveProfile(profile); profileRef.current = profile;
    localStorage.setItem("gf_voicestyle", voiceStyle); voiceStyleRef.current = voiceStyle;
    if (apiKey) { localStorage.setItem("gf_api_key", apiKey); setApiConfigured(true); }
    if (serverUrl) { localStorage.setItem("gf_api_server", serverUrl); setApiConfigured(true); }
    setShowSettings(false);
  };

  const handleClear = () => { if (confirm("确定清空所有聊天记录？")) { clearMessages(); setMessages([]); } };

  return (
    <div className="relative flex flex-col h-dvh overflow-hidden bg-pink-50 select-none">
      {/* 顶部栏 */}
      {!voiceMode && (
        <header className="shrink-0 bg-white/95 backdrop-blur border-b border-pink-100 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center text-base heartbeat">💕</div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full border-2 border-white" />
            </div>
            <div>
              <div className="font-semibold text-gray-800 text-xs">{mounted ? profile.name : "❤️"}</div>
              <div className="text-[9px] text-green-500">{apiConfigured ? "在线" : "离线"}{" · "}{getVoiceStyle(voiceStyle).label}音 · 剩{remainingChats}次</div>
            </div>
          </div>
          <div className="flex gap-1">
            <a href="/小灵_桌面版.zip" download title="下载桌面悬浮版" className="w-7 h-7 rounded-full bg-pink-50 flex items-center justify-center text-sm hover:bg-pink-100 transition-colors">💻</a>
            <button onClick={() => setShowSettings(true)} className="w-7 h-7 rounded-full bg-pink-50 flex items-center justify-center text-sm">⚙️</button>
          </div>
        </header>
      )}

      {/* 3D 角色 */}
      <div className={`${voiceMode ? "fixed inset-0 z-0" : "relative w-full shrink-0"}`} style={voiceMode ? {} : { height: "50vh", maxHeight: "450px" }}>
        {mounted ? (
          <VRMCharacter key={modelPath} ref={girlRef} modelPath={modelPath}
            rotationY={models.find(m => m.path === modelPath)?.rotationY}
            armAngle={models.find(m => m.path === modelPath)?.armAngle} />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-pink-100 via-purple-50 to-white flex items-center justify-center">
            <div className="text-center"><div className="text-6xl animate-bounce">💕</div><p className="text-gray-400 text-sm mt-2">加载模型中...</p></div>
          </div>
        )}

        {/* 字幕 */}
        {voiceMode && subtitle && (
          <div className="absolute bottom-4 left-4 right-4 z-10 pointer-events-none">
            {subtitleRole === "user" && <div className="flex justify-end"><div className="bg-blue-500/90 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm max-w-[85%] shadow-lg backdrop-blur">{subtitle}</div></div>}
            {subtitleRole === "assistant" && <div className="flex justify-start"><div className="bg-white/90 text-gray-700 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm max-w-[85%] shadow-lg backdrop-blur">{subtitle}</div></div>}
            {!subtitleRole && <div className="flex justify-center"><div className={`px-4 py-2 rounded-full text-sm shadow-lg backdrop-blur ${isListening ? "bg-pink-500/90 text-white animate-pulse" : "bg-white/80 text-gray-400"}`}>{subtitle}</div></div>}
          </div>
        )}

        {/* 🎤 按钮 */}
        <div className="absolute top-3 right-3 z-10">
          <button onClick={toggleVoiceMode} className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg transition-all active:scale-90 ${voiceMode ? "bg-pink-500 text-white shadow-pink-300" : "bg-white/90 text-pink-500 shadow-pink-100"}`}
            title={voiceMode ? "退出语音对话" : "开始语音对话"}>{voiceMode ? "⏹" : "🎤"}</button>
        </div>

        {/* 手机按住说话 */}
        {voiceMode && isMobileVoice && (
          <div className="absolute bottom-6 left-0 right-0 z-10 flex justify-center">
            <button
              onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); handleMobileStart(); }}
              onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); handleMobileStop(); }}
              onTouchCancel={() => { if (mobileRecording) handleMobileStop(); }}
              className={`w-24 h-24 rounded-full flex items-center justify-center text-lg font-bold shadow-2xl transition-all select-none touch-none ${mobileRecording ? "bg-red-500 text-white scale-110 shadow-red-300" : "bg-white text-pink-500 shadow-pink-200 active:scale-95"}`}
            >{mobileRecording ? "松开发送" : "按住说话"}</button>
          </div>
        )}

        {/* 语音状态 */}
        {voiceMode && voiceActive && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-white/90 rounded-full px-3 py-1 shadow">
            <span className={`w-2 h-2 rounded-full ${isListening ? "bg-red-400 animate-pulse" : loading ? "bg-yellow-400" : "bg-green-400"}`} />
            <span className="text-xs text-gray-500">{isListening ? "聆听中" : loading ? "思考中" : "等待中"}</span>
          </div>
        )}

        {loading && voiceMode && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
            <div className="flex gap-1.5"><span className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: "0s" }} /><span className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} /><span className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} /></div>
          </div>
        )}
      </div>

      {/* 文字聊天 */}
      {!voiceMode && (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-2 chat-scroll">
            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-3 select-none">
                <div className="text-5xl">💝</div>
                <div className="text-sm text-center px-4">{mounted ? (voiceSupported ? `和${profile.name}说话吧~\n打字或点🎤进入语音模式` : `和${profile.name}打个招呼吧~`) : "加载中..."}</div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`msg-in flex ${m.role === "user" ? "justify-end" : "justify-start"} gap-2`}>
                {m.role === "assistant" && <div className="shrink-0 w-7 h-7 rounded-full bg-pink-100 flex items-center justify-center text-xs self-end">💕</div>}
                <div className="max-w-[80%]"><div className={`px-2.5 py-1.5 rounded-lg text-sm leading-relaxed ${m.role === "user" ? "bg-emerald-500 text-white" : "bg-white text-gray-700"}`}>{m.content}<div className="text-[10px] mt-0.5 opacity-50">{m.time}</div></div></div>
              </div>
            ))}
            {loading && (
              <div className="flex items-start gap-2 msg-in">
                <div className="shrink-0 w-7 h-7 rounded-full bg-pink-100 flex items-center justify-center text-xs">💕</div>
                <div className="bg-white rounded-lg px-3 py-2 flex gap-1 items-center"><span className="w-1.5 h-1.5 bg-pink-300 rounded-full dot-1" /><span className="w-1.5 h-1.5 bg-pink-300 rounded-full dot-2" /><span className="w-1.5 h-1.5 bg-pink-300 rounded-full dot-3" /></div>
              </div>
            )}
          </div>
          <div className="shrink-0 bg-white/95 backdrop-blur border-t border-gray-100 px-3 py-2 safe-input flex gap-2 items-end">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKey} placeholder={remainingChats <= 0 ? "今日免费次数已用完，明天再来~" : "说点什么..."} rows={1} disabled={remainingChats <= 0} className={`flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none max-h-20 ${remainingChats <= 0 ? "bg-gray-100 text-gray-400 placeholder-gray-400" : "bg-gray-50 placeholder-gray-400"}`} />
            <button onClick={handleTextSend} disabled={loading || !input.trim() || remainingChats <= 0} className={`shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-white transition-all active:scale-90 ${loading || !input.trim() || remainingChats <= 0 ? "bg-gray-300" : "bg-emerald-500 hover:bg-emerald-600"}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
          </div>
        </>
      )}

      {/* 设置面板 */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSettings(false)} />
          <div className="relative bg-white rounded-t-3xl max-h-[80vh] overflow-y-auto p-5 sheet-in space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto -mt-1 mb-1" />
            <h2 className="text-lg font-bold text-center">⚙️ 设置</h2>

            {/* API 配置 */}
            <div>
              <label className="text-sm font-medium text-gray-600">🔑 DeepSeek API Key（直接调用，无需服务器）</label>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-pink-400" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">🌐 服务器地址（走代理，无需 Key）</label>
              <input type="text" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://your-server.com" className="w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-pink-400" />
            </div>

            {/* 语音风格 */}
            {voiceSupported && (
              <div>
                <label className="text-sm font-medium text-gray-600">🎤 语音风格</label>
                <div className="flex gap-2 mt-1">
                  {Object.entries(VOICE_STYLES).map(([key, s]) => (
                    <button key={key} onClick={() => setVoiceStyle(key)} className={`flex-1 py-2 rounded-xl text-sm transition-all ${voiceStyle === key ? "bg-pink-500 text-white" : "bg-gray-100 text-gray-600"}`}>{s.label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* 角色模型 */}
            <div>
              <label className="text-sm font-medium text-gray-600">👧 角色模型</label>
              {models.length === 0 ? <p className="text-xs text-gray-400 mt-1">加载中...</p> : (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {models.map((m) => (
                    <button key={m.path} onClick={() => { setModelPath(m.path); localStorage.setItem("gf_model", m.path); }}
                      className={`py-2.5 px-3 rounded-xl text-sm transition-all text-left truncate ${modelPath === m.path ? "bg-pink-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{m.name}</button>
                  ))}
                </div>
              )}
            </div>

            {/* 人设 */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-600">👤 女友人设</p>
              <div className="grid grid-cols-2 gap-3">
                {[{ k: "name", label: "名字", ph: "小灵" }, { k: "birth", label: "生日", ph: "6月1日" }, { k: "nickname", label: "叫你", ph: "宝贝" }, { k: "hobby", label: "爱好", ph: "追剧、吃甜品" }].map((f) => (
                  <div key={f.k}><label className="text-xs text-gray-400">{f.label}</label><input value={(profile as any)[f.k]} onChange={(e) => setProfile({ ...profile, [f.k]: e.target.value })} placeholder={f.ph} className="w-full mt-0.5 px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-pink-400" /></div>
                ))}
              </div>
              <div><label className="text-xs text-gray-400">性格</label><input value={profile.character} onChange={(e) => setProfile({ ...profile, character: e.target.value })} placeholder="温柔软萌，偶尔撒娇粘人" className="w-full mt-0.5 px-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-pink-400" /></div>
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={saveSettings} className="flex-1 py-3 bg-pink-500 text-white rounded-xl font-medium text-sm active:scale-95">保存设置</button>
              <button onClick={handleClear} className="px-4 py-3 border border-red-200 text-red-500 rounded-xl text-sm active:scale-95">🗑 清空</button>
            </div>
            <p className="text-center text-xs text-gray-300 pt-1">本地虚拟女友 v1.0</p>
          </div>
        </div>
      )}
    </div>
  );
}
