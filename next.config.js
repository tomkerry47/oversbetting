/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Ignore source map files from chrome-aws-lambda
    config.module.rules.push({
      test: /\.js\.map$/,
      use: 'ignore-loader',
    });
    
    // Don't bundle chrome-aws-lambda on server side - it needs to be in node_modules
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('chrome-aws-lambda');
      }
    }
    
    return config;
  },
};

module.exports = nextConfig;
