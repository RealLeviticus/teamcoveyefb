/** @type {import('next').NextConfig} */
// Clean local server config - no GitHub Pages logic
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  output: 'standalone',
  // Work around Windows filesystem cache race (ENOENT on pack.gz rename) in dev
  webpack: (config, { dev }) => {
    if (dev || process.env.NEXT_DISABLE_WEBPACK_CACHE === '1') {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
