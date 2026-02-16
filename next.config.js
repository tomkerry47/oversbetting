/** @type {import('next').NextConfig} */
const nextConfig = {
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
