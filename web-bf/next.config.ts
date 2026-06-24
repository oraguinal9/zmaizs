import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // 静态导出时跳过 API 路由中的动态逻辑
  images: { unoptimized: true },
};

export default nextConfig;
