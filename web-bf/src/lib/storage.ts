"use client";

// ── 纯前端 localStorage 存储 ──

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  time: string;
}

export interface GirlProfile {
  name: string;
  character: string;
  birth: string;
  hobby: string;
  nickname: string;
}

// ── 聊天记录 ──
const CHAT_KEY = "gf_chat";
const MAX_MSGS = 40;

export function getMessages(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addMessage(msg: Message): Message[] {
  const msgs = getMessages();
  msgs.push(msg);
  // 超过上限删最早的
  while (msgs.length > MAX_MSGS) msgs.shift();
  localStorage.setItem(CHAT_KEY, JSON.stringify(msgs));
  return msgs;
}

export function clearMessages() {
  localStorage.removeItem(CHAT_KEY);
}

// ── 男友人设 ──
const PROFILE_KEY = "gf_profile";
const DEFAULT_PROFILE: GirlProfile = {
  name: "景琛",
  character: "金发酷帅，外表高冷内心温柔。说话低沉有磁性，偶尔霸道偶尔撒娇。会保护你、宠你、逗你笑。是让人心动的初恋男友类型。",
  birth: "5月20日",
  hobby: "健身、弹吉他、打篮球、喝咖啡",
  nickname: "宝贝",
};

export function getProfile(): GirlProfile {
  if (typeof window === "undefined") return { ...DEFAULT_PROFILE };
  try {
    return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(p: Partial<GirlProfile>) {
  const current = getProfile();
  const updated = { ...current, ...p };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
  return updated;
}

// ── 每日免费次数 ──
const DAILY_KEY = "gf_daily";
const DAILY_LIMIT = 50;

export function getDailyCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    if (data.date !== new Date().toDateString()) return 0;
    return data.count || 0;
  } catch {
    return 0;
  }
}

export function incrementDailyCount(): number {
  const count = getDailyCount() + 1;
  localStorage.setItem(DAILY_KEY, JSON.stringify({ date: new Date().toDateString(), count }));
  return count;
}

export function canChat(): boolean {
  return getDailyCount() < DAILY_LIMIT;
}

export function getRemainingChats(): number {
  return Math.max(0, DAILY_LIMIT - getDailyCount());
}

// ── 音色 ──
const VOICE_KEY = "gf_voice";
export function getVoice(): string {
  if (typeof window === "undefined") return "soft";
  return localStorage.getItem(VOICE_KEY) || "soft";
}
export function setVoice(v: string) {
  localStorage.setItem(VOICE_KEY, v);
}
