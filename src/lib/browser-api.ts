import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

// Cache the browser instance to reuse across requests
let browserInstance: any = null;

async function getBrowser() {
  if (browserInstance) {
    return browserInstance;
  }

  console.log('Launching Chromium browser...');
  
  // Check if we're in production (Vercel) or local
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    // Use @sparticuz/chromium for Vercel serverless
    browserInstance = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  } else {
    // Use local Chrome for development
    browserInstance = await puppeteer.launch({
      headless: true,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  console.log('Browser launched successfully');
  return browserInstance;
}

export async function browserApiRequest(url: string, retries = 3): Promise<any> {
  console.log(`Browser API request: ${url}`);

  for (let attempt = 0; attempt < retries; attempt++) {
    let page;
    try {
      if (attempt > 0) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.log(`Retrying in ${Math.round(delay)}ms... (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const browser = await getBrowser();
      page = await browser.newPage();

      // Set viewport and user agent to match real browser
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Set extra headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
        'Accept': '*/*',
        'Referer': 'https://www.sofascore.com/',
        'Origin': 'https://www.sofascore.com',
      });

      // Navigate and wait for network to be idle
      const response = await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      if (!response) {
        throw new Error('No response from page.goto');
      }

      // Get the JSON response from the page
      const content = await page.content();
      
      // Check if it's a JSON response (API endpoint)
      const text = await response.text();
      const data = JSON.parse(text);

      await page.close();

      console.log(`Browser request successful: ${url}`);
      return data;

    } catch (error: any) {
      console.error(`Browser request failed (attempt ${attempt + 1}/${retries}):`, error.message);
      
      if (page) {
        try {
          await page.close();
        } catch (closeError) {
          console.error('Error closing page:', closeError);
        }
      }

      if (attempt === retries - 1) {
        throw error;
      }
    }
  }

  throw new Error('All browser request attempts failed');
}

// Clean up browser on process exit
if (typeof process !== 'undefined') {
  process.on('exit', async () => {
    if (browserInstance) {
      await browserInstance.close();
    }
  });
}
