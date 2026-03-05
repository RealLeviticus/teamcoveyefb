/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  output: "export",
  webpack: (config, { dev }) => {
    if (dev || process.env.NEXT_DISABLE_WEBPACK_CACHE === "1") {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
