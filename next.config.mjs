/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Exclude the functions directory from the Next.js build process
  webpack: (config, { isServer }) => {
    // Add the functions directory to the list of ignored modules
    if (isServer) {
      config.externals = [...config.externals, 'firebase-functions', 'firebase-admin'];
    }
    
    // Add a fallback for the 'fs' module
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    
    return config;
  },
  // Disable type checking during build to avoid Firebase Functions issues
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig; 