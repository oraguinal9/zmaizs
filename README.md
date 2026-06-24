# 桌面 AI 助手

> 开源版 | 女友 + 男友双模式 | 3D + Live2D | Electron 桌面悬浮

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black?logo=next.js" />
  <img src="https://img.shields.io/badge/Three.js-VRM-000?logo=three.js" />
  <img src="https://img.shields.io/badge/Live2D-Cubism_5-ff69b4" />
  <img src="https://img.shields.io/badge/Electron-33-blue?logo=electron" />
  <img src="https://img.shields.io/badge/license-MIT-green" />
</p>

<p align="center">
  <b>🌐 <a href="https://ai.zbjh.top">ai.zbjh.top</a> — 免费在线体验</b>
</p>

---

## 💕 小灵 · AI 女友

| 特性 | 说明 |
|------|------|
| 3D 渲染 | Three.js + VRM，8 个角色实时切换 |
| 实时语音 | 语音识别 → AI 回复 → TTS 语音播出 |
| 角色系统 | 8 种性格：甜宠、御姐、元气、文艺... |
| 配色 | 粉色系 |

## 🌟 景琛 · AI 男友

| 特性 | 说明 |
|------|------|
| 动态渲染 | PixiJS + Live2D Cubism 5，金发酷哥 |
| 男声 TTS | Edge-TTS 男声（云希磁性音/云枫少年音） |
| 交互 | 点击互动，自然表情变化 |
| 配色 | 深蓝系 |

## 🖥️ 桌面悬浮窗

- 无边框始终置顶，像桌面宠物一样
- 系统托盘，最小化不占空间
- 开机自启、可拖动
- Electron 打包，Windows exe

## 项目结构

```
├── web/              ← Next.js 前端（小灵）
├── web-bf/           ← Next.js 前端（景琛，Live2D）
├── desktop/          ← Electron 桌面壳（双模式切换）
├── landing/          ← ai.zbjh.top 门户页
└── scripts/          ← 后端代理（Python）
    ├── server_proxy.py        ← DeepSeek API 代理
    ├── edge_tts_server.py     ← Edge-TTS 合成（免费）
    └── ali_asr_server.py      ← 阿里云 ASR（需配置）
```

## 快速开始

### 前端

```bash
cd web
npm install
npm run dev    # → http://localhost:3091
```

### 后端

```bash
pip install aiohttp edge-tts
python scripts/server_proxy.py    # :5002
python scripts/edge_tts_server.py # :5005
```

### 桌面端

```bash
cd desktop
npm install
npm start
```

## 技术栈

| 层 | 技术 |
|------|------|
| 前端 | Next.js 15 + React 19 + TypeScript + Tailwind CSS 4 |
| 3D 渲染 | Three.js + @pixiv/three-vrm |
| Live2D | PixiJS v6 + pixi-live2d-display + Cubism 5 Core |
| 桌面 | Electron 33，无边框 + 系统托盘 |
| AI | DeepSeek API（可替换为任何 OpenAI 兼容接口） |
| TTS | Edge-TTS（免费，无需 API Key） |
| ASR | 阿里云语音识别 / Chrome SpeechRecognition |

## License

MIT — 随便改，Star ⭐ 安排一下

---

> 📮 [ai.zbjh.top](https://ai.zbjh.top) | 🎧 客服QQ：10844470
