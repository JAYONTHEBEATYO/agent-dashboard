/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow server-side file system reads in API routes (no special webpack config needed)
  // serverExternalPackages handles Node.js built-ins like fs automatically
};

export default nextConfig;
