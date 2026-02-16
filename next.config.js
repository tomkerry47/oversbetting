/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Ignore source map files from Chromium packages
    config.module.rules.push({
      test: /\.js\.map$/,
      use: 'ignore-loader',
    });
    
    return config;
  },
};

module.exports = nextConfig;
