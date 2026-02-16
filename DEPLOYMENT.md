# Deployment Instructions - Chromium Browser API

## ✅ Implementation Complete

I've implemented a Chromium-based solution to bypass SofaScore's 403 errors by using a real browser to make requests.

## 📦 What Changed

1. **New Dependencies**:
   - `puppeteer-core@10.1.0` - Browser automation library  
   - `@sparticuz/chromium` - Serverless-optimized Chromium binary (works on Vercel/AWS Lambda)
   - `ignore-loader` - Webpack loader to handle source maps

2. **New Files**:
   - [src/lib/browser-api.ts](src/lib/browser-api.ts) - Browser-based API request handler
   - [BROWSER_API.md](BROWSER_API.md) - Full documentation

3. **Updated Files**:
   - [src/lib/football-api.ts](src/lib/football-api.ts) - Now supports browser mode via env variable
   - [next.config.js](next.config.js) - Webpack config to handle Chromium serverless packages
   - [.env.local](.env.local) - Added `USE_BROWSER_API=false` (for local dev)
   - [.env.local.example](.env.local.example) - Added example config

## 🚀 Deployment Steps

### 1. Commit and Push
```bash
git add .
git commit -m "Add Chromium browser API to bypass 403 errors"
git push
```

### 2. Configure Vercel Environment Variable
Go to your Vercel dashboard:
1. Navigate to: **Your Project** → **Settings** → **Environment Variables**
2. Add new variable:
   - **Key**: `USE_BROWSER_API`
   - **Value**: `true`
   - **Apply to**: ✅ Production (required), Preview (optional), Development (optional)
3. Click **Save**

### 3. Redeploy
- Vercel will auto-deploy on push, OR
- Manually trigger: **Deployments** → **...** → **Redeploy**

## 🔍 How It Works

### Local Development (Fast)
- `USE_BROWSER_API=false` (default)
- Uses regular `fetch()` with enhanced headers
- ~100-500ms per request
- May get occasional 403s (acceptable in dev)

### Production (Reliable)
- `USE_BROWSER_API=true` (set in Vercel)
- Launches real Chrome browser
- Navigates to API URL like a human
- Extracts JSON response
- ~2-5 seconds per request (worth it to avoid 403s)

## 📊 Performance Trade-off

| Mode | Speed | Reliability | Use Case |
|------|-------|-------------|----------|
| Fetch | ⚡ Fast (0.1-0.5s) | ⚠️ May get 403s | Local development |
| Browser | 🐢 Slow (2-5s) | ✅ Bypasses 403s | Production |

The browser instance is cached and reused to minimize overhead.

## ✅ Testing

### Test Locally (Optional)
To test browser mode locally:
```bash
USE_BROWSER_API=true npm run dev
```

You should see in logs:
```
SofaScore API request: https://api.sofascore.com/... (browser: true)
Launching Chromium browser...
Browser launched successfully
Browser request successful
```

### Monitor Production
After deployment, check Vercel logs:
- Look for `(browser: true)` in request logs
- Should see "Browser request successful" messages
- No more 403 errors 🎉

## 🔧 Troubleshooting

**If build fails:**
- Check that `puppeteer-core` and `@sparticuz/chromium` are in `dependencies` (not devDependencies)
- Ensure ignore-loader is in devDependencies for webpack config

**If you get Chrome errors locally:**
- Keep `USE_BROWSER_API=false` for local development
- Only enable browser mode in production where it's needed
- `@sparticuz/chromium` provides the Chromium binary for serverless runtimes; local browser install is not required for production

**If still getting 403s in production:**
- Verify `USE_BROWSER_API=true` is set in Vercel
- Check deployment logs to confirm browser mode is active
- May need to increase delays between requests further

## 📝 Next Steps

1. ✅ Build successful locally
2. 🔄 Deploy to Vercel
3. 🔄 Add environment variable
4. 🔄 Test in production
5. 🔄 Monitor logs for 403 errors

The implementation is ready to deploy!
