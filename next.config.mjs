/** @type {import('next').NextConfig} */
const nextConfig = {
  // 生成自包含产物（.next/standalone），供 Docker 部署
  output: 'standalone',
  reactStrictMode: true,
  // 允许在服务端 API 路由中处理文档解析库
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'mammoth', 'xlsx'],
  },
};

export default nextConfig;
