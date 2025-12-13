const nextConfig = {
  // 移除 output: 'export' 以支持 Vercel 的优化构建
  // output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};
export default nextConfig;






