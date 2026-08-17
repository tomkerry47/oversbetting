/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'sports.bzzoiro.com', pathname: '/img/player/**' },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
    outputFileTracingIncludes: {
      '/api/*': [
        'node_modules/@sparticuz/chromium/**/*',
        'node_modules/puppeteer-core/**/*',
      ],
    },
  },
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
