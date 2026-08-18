import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // qpdf WASM은 번들하지 않고 런타임에 node_modules에서 로드한다 (서버 전용)
  serverExternalPackages: ["@jspawn/qpdf-wasm"],
  // Vercel 배포 시 wasm 바이너리가 함수 번들에 포함되도록 명시
  outputFileTracingIncludes: {
    "/api/analyses": ["./node_modules/@jspawn/qpdf-wasm/**"],
  },
};

export default nextConfig;
