import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "景琛 - AI男友陪伴",
  description: "你的专属AI男友，随时倾听陪伴",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "景琛",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1E3A5F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌟</text></svg>" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script src="/live2dcubismcore.min.js" async />
      </head>
      <body>
        <audio id="tts-player" playsInline style={{ display: "none" }} preload="auto" />
        {children}
      </body>
    </html>
  );
}
