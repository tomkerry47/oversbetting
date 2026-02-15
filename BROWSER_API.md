# Chromium-Based API Requests

## Problem
SofaScore API returns 403 errors when detecting automated requests from serverless functions.

## Solution
This implementation uses Puppeteer with a real Chromium browser to make API requests, making them indistinguishable from real user traffic.

## Setup

### Local Development
1. Ensure Google Chrome is installed at `/Applications/Google Chrome.app`
2. Set environment variable: `USE_BROWSER_API=false` (use regular fetch for dev)

### Production (Vercel)
1. Add environment variable in Vercel dashboard:
   ```
   USE_BROWSER_API=true
   ```

2. The app will automatically use `@sparticuz/chromium` which is optimized for serverless

## How It Works

- When `USE_BROWSER_API=false`: Uses regular `fetch()` with enhanced headers (faster, but may get 403)
- When `USE_BROWSER_API=true`: Launches a real Chrome browser, navigates to the URL, and extracts the JSON response (slower, but bypasses 403)

## Performance Impact

- **Regular fetch**: ~100-500ms per request
- **Browser request**: ~2-5 seconds per request (includes browser launch, page load, network idle)

The browser instance is cached and reused across requests to minimize overhead.

## Deployment Steps

1. Commit and push changes:
   ```bash
   git add .
   git commit -m "Add Chromium-based API requests to bypass 403 errors"
   git push
   ```

2. Add environment variable in Vercel:
   - Go to Vercel dashboard → Your project → Settings → Environment Variables
   - Add: `USE_BROWSER_API` = `true`
   - Apply to: Production, Preview, Development

3. Redeploy or wait for automatic deployment

## Testing

Test locally with browser mode:
```bash
USE_BROWSER_API=true npm run dev
```

Monitor logs to see browser requests in action:
```
SofaScore API request: https://api.sofascore.com/api/v1/... (browser: true)
Launching Chromium browser...
Browser launched successfully
Browser request successful: https://api.sofascore.com/api/v1/...
```

## Troubleshooting

If you get Chrome-related errors locally:
1. Update Chrome path in `browser-api.ts` if Chrome is installed elsewhere
2. Or set `USE_BROWSER_API=false` for local development

If deployment fails on Vercel:
1. Check build logs for Chromium-related errors
2. Ensure `@sparticuz/chromium` is in dependencies (not devDependencies)
3. The package should be automatically included in the deployment
