/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Ignore source map files from Chromium packages
    config.module.rules.push({
      test: /\.js\.map$/,
      use: 'ignore-loader',
    });
    
    // Don't bundle Chromium providers on server side - keep them as runtime deps.
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('@sparticuz/chromium', 'chrome-aws-lambda');
      }
    }
    
    return config;
  },
};

module.exports = nextConfig;
