/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Ignore source map files from chrome-aws-lambda
    config.module.rules.push({
      test: /\.js\.map$/,
      use: 'ignore-loader',
    });
    
    // Exclude chrome-aws-lambda from being processed
    config.externals = config.externals || [];
    config.externals.push({
      'chrome-aws-lambda': 'chrome-aws-lambda',
    });
    
    return config;
  },
};

module.exports = nextConfig;
