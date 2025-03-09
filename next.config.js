/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...config.externals, 'firebase-functions', 'firebase-admin'];
    }
    return config;
  },
};

module.exports = nextConfig; 