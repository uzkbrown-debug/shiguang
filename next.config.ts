import type { NextConfig } from "next";

// 后端地址一律走环境变量，默认指向本机；不要在仓库里写死真实服务器地址
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const NOVEL_API_URL = process.env.NOVEL_API_URL || "http://127.0.0.1:8085";

const nextConfig: NextConfig = {
  compress: true,

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${BACKEND_URL}/uploads/:path*`,
      },
      {
        // 后端上传的原始图片与生成的音频
        source: "/media/:path*",
        destination: `${BACKEND_URL}/media/:path*`,
      },
      {
        source: "/reader3/:path*",
        destination: `${NOVEL_API_URL}/reader3/:path*`,
      },
    ];
  },

  experimental: {
    // 关掉代理转发时的请求体上限：默认只有 10MB，传视频必然 500
    proxyClientMaxBodySize: "500mb",
    optimizePackageImports: [
      "framer-motion",
      "lucide-react",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
    ],
  },

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "http", hostname: "wfqqreader-1252317822.image.myqcloud.com" },
    ],
  },
};

export default nextConfig;
