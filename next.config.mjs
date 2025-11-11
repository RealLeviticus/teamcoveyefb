/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Work around Windows filesystem cache race (ENOENT on pack.gz rename) in dev
  webpack: (config, { dev }) => {
    if (dev || process.env.NEXT_DISABLE_WEBPACK_CACHE === '1') {
      config.cache = false;
    }
    return config;
  },
};
export default nextConfig;
