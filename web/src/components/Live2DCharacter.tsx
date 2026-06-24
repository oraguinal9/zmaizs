"use client";

import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from "react";

export interface Live2DHandle {
  setMouthOpen: (ratio: number) => void;
  playEmotion: (emotion: string) => void;
}

// 纯 CSS/JS 动画虚拟女友 — 轻量、可爱、无依赖
const Live2DCharacter = forwardRef<Live2DHandle, {}>(function Live2DCharacter(_, ref) {
  const [blinking, setBlinking] = useState(false);
  const [emotion, setEmotion] = useState("");
  const [mouthOpen, setMouthOpen] = useState(0);
  const [talking, setTalking] = useState(false);
  const blinkTimer = useRef<any>(null);
  const emotionTimer = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    setMouthOpen: (ratio: number) => {
      setMouthOpen(Math.min(ratio, 1));
      setTalking(ratio > 0.1);
    },
    playEmotion: (em: string) => {
      setEmotion(em);
      if (emotionTimer.current) clearTimeout(emotionTimer.current);
      emotionTimer.current = setTimeout(() => setEmotion(""), 3000);
    },
  }));

  // 自动眨眼
  useEffect(() => {
    function blink() {
      setBlinking(true);
      setTimeout(() => setBlinking(false), 150);
      const next = 2000 + Math.random() * 3000;
      blinkTimer.current = setTimeout(blink, next);
    }
    blinkTimer.current = setTimeout(blink, 2000);
    return () => { if (blinkTimer.current) clearTimeout(blinkTimer.current); };
  }, []);

  // 点击反应
  const handleTap = () => {
    const ems = ["😊", "😘", "🥰", "😆", "💕"];
    const em = ems[Math.floor(Math.random() * ems.length)];
    setEmotion(em);
    if (emotionTimer.current) clearTimeout(emotionTimer.current);
    emotionTimer.current = setTimeout(() => setEmotion(""), 2000);
  };

  return (
    <div
      className="relative w-full flex flex-col items-center pt-6 pb-2 select-none"
      onClick={handleTap}
      style={{ touchAction: "manipulation" }}
    >
      {/* 身体 */}
      <div className="relative w-40 h-48" style={{ transform: talking ? "scale(1.02)" : "scale(1)", transition: "transform 0.3s" }}>
        {/* 头发 */}
        <div className="absolute -top-4 -left-3 w-[calc(100%+24px)] h-24 bg-gradient-to-b from-pink-800 via-pink-600 to-pink-400 rounded-t-[60%] overflow-hidden">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-8 bg-pink-500 rounded-t-full" />
          <div className="absolute -bottom-2 -left-1 w-12 h-16 bg-pink-600 rounded-r-full" />
          <div className="absolute -bottom-2 -right-1 w-12 h-16 bg-pink-600 rounded-l-full" />
        </div>

        {/* 脸部 */}
        <div className="absolute top-6 left-2 right-2 bottom-2 bg-rose-100 rounded-[45%] shadow-inner flex flex-col items-center justify-center overflow-hidden">
          {/* 腮红 */}
          <div className="absolute top-14 left-4 w-5 h-3 bg-pink-300/50 rounded-full blur-sm" />
          <div className="absolute top-14 right-4 w-5 h-3 bg-pink-300/50 rounded-full blur-sm" />

          {/* 眼睛区域 */}
          <div className="flex gap-8 mt-1">
            {/* 左眼 */}
            <div className="relative w-8 h-8">
              {/* 眉毛 */}
              <div className="absolute -top-3 left-0 w-8 h-1.5 bg-pink-600/60 rounded-full" />
              {/* 眼睛 */}
              <div className={`absolute inset-0 bg-white rounded-full border-2 border-pink-800 overflow-hidden transition-all ${blinking ? "scale-y-[0.05]" : "scale-y-100"}`} style={{ transitionDuration: "0.1s" }}>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-amber-900 rounded-full">
                  <div className="absolute top-1 left-1 w-2 h-2 bg-white rounded-full" />
                </div>
              </div>
            </div>
            {/* 右眼 */}
            <div className="relative w-8 h-8">
              <div className="absolute -top-3 left-0 w-8 h-1.5 bg-pink-600/60 rounded-full" />
              <div className={`absolute inset-0 bg-white rounded-full border-2 border-pink-800 overflow-hidden transition-all ${blinking ? "scale-y-[0.05]" : "scale-y-100"}`} style={{ transitionDuration: "0.1s" }}>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 bg-amber-900 rounded-full">
                  <div className="absolute top-1 left-1 w-2 h-2 bg-white rounded-full" />
                </div>
              </div>
            </div>
          </div>

          {/* 鼻子 */}
          <div className="w-1.5 h-1.5 bg-pink-400 rounded-full mt-1 opacity-60" />

          {/* 嘴巴 — 与说话联动 */}
          <div className="mt-1 relative">
            <div
              className="w-6 bg-pink-600 rounded-full mx-auto transition-all"
              style={{
                height: `${6 + mouthOpen * 12}px`,
                borderRadius: mouthOpen > 0.3 ? "0 0 10px 10px" : "10px",
              }}
            />
          </div>
        </div>

        {/* 身体部分 */}
        <div className="absolute -bottom-6 left-8 right-8 h-16 bg-gradient-to-b from-pink-400 to-pink-500 rounded-t-2xl rounded-b-lg">
          {/* 领口 */}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-5 h-3 bg-rose-100 rounded-b-full" />
        </div>
      </div>

      {/* 情绪气泡 */}
      {emotion && (
        <div className="absolute -top-0 text-3xl animate-bounce">
          {emotion}
        </div>
      )}

      {/* Live2D 升级提示（开发中） */}
      <p className="text-[10px] text-gray-300 mt-8">
        💡 点击互动 · 升级 Live2D 模型看教程
      </p>
    </div>
  );
});

export default Live2DCharacter;
