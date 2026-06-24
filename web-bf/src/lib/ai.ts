"use client";

interface ApiMessage { role: string; content: string; }

// 清理 AI 回复中的动作描写残留 + 过滤英文
export function cleanReply(text: string): string {
  let t = text;
  t = t.replace(/[\u{1F600}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2700}-\u{27BF}\u{200D}\u{FE0F}]/gu, "");
  t = t.replace(/（[^）]*）/g, "");
  t = t.replace(/\([^)]*\)/g, "");
  t = t.replace(/\*[^*]*\*/g, "");
  t = t.replace(/用[^说]*[说：:]/g, "");
  t = t.replace(/^[,，。.、\s]+|[,，。.、\s]+$/g, "").trim();
  t = t.replace(/[（(]\s*[)）]/g, "");
  const latinChars = (t.match(/[a-zA-Z]/g) || []).length;
  const chineseChars = (t.match(/[一-鿿]/g) || []).length;
  if (latinChars > chineseChars * 0.6 && latinChars > 20) {
    const sentences = t.split(/[。！？.!?\n]+/);
    const chineseOnly = sentences.filter((s) => /[一-鿿]/.test(s)).join("。");
    if (chineseOnly.trim()) t = chineseOnly;
  }
  return t || text;
}

// 通过服务器代理调用 DeepSeek
async function chatViaProxy(
  serverUrl: string,
  systemPrompt: string,
  history: { role: string; content: string }[],
  userMessage: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000); // 3 分钟超时
  try {
    const res = await fetch(`${serverUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_prompt: systemPrompt,
        messages: [
          ...history.map((h) => ({ role: h.role, content: h.content })),
          { role: "user", content: userMessage },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if ((err as any).code === "rate_limited") return "（聊太快了，让我喘口气~）";
      throw new Error(`Proxy error: ${res.status}`);
    }
    const data = await res.json();
    return cleanReply(data.reply || "") || "嗯？";
  } catch (e: any) {
    clearTimeout(timer);
    throw e;
  }
}

// 直接调用 DeepSeek API
async function chatDirect(
  apiKey: string,
  systemPrompt: string,
  history: { role: string; content: string }[],
  userMessage: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const messages: ApiMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage },
  ];
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "deepseek-chat", messages, temperature, max_tokens: maxTokens }),
  });
  if (!res.ok) {
    if (res.status === 401) return "（API密钥无效，请在设置中检查）";
    throw new Error(`API error: ${res.status}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "";
  return cleanReply(raw) || "嗯？";
}

// 统一入口
export async function chatWithAI(
  apiKeyOrServer: string,
  systemPrompt: string,
  history: { role: string; content: string }[],
  userMessage: string
): Promise<string> {
  let serverUrl = typeof window !== "undefined" ? localStorage.getItem("gf_api_server") || "" : "";
  // 本地开发默认用线上后端
  if (!serverUrl && typeof window !== "undefined") {
    const origin = window.location.origin;
    // localhost 无后端 → 自动用线上站
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      serverUrl = "https://xiaoling.zbjh.top";
    } else if (origin) {
      serverUrl = origin;
    }
  }
  const temperature = 0.5;
  const maxTokens = 256;
  try {
    if (serverUrl) {
      return await chatViaProxy(serverUrl, systemPrompt, history, userMessage, temperature, maxTokens);
    } else if (apiKeyOrServer) {
      return await chatDirect(apiKeyOrServer, systemPrompt, history, userMessage, temperature, maxTokens);
    } else {
      return "（请设置 API Key 或服务器地址）";
    }
  } catch (e: any) {
    if (e.name === "TypeError" || e.name === "AbortError" || e.message?.includes("timeout")) {
      return "（网络不太好，再试一次？）";
    }
    return "（她暂时不在，稍等一下~）";
  }
}
