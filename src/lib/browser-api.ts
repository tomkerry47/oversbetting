import chromium from 'chrome-aws-lambda';
import puppeteer from 'puppeteer-core';

// Cache the browser instance to reuse across requests
let browserInstance: any = null;

function prepareServerlessChromiumEnv() {
  // chrome-aws-lambda uses Lambda env detection to decide whether to expose a Chromium binary path.
  // Vercel functions are Lambda-like but may not set these vars consistently.
  if (process.env.VERCEL) {
    process.env.AWS_EXECUTION_ENV = process.env.AWS_EXECUTION_ENV || 'AWS_Lambda_nodejs18.x';
    process.env.AWS_LAMBDA_FUNCTION_NAME = process.env.AWS_LAMBDA_FUNCTION_NAME || 'vercel-function';
  }
}

async function getBrowser() {
  if (browserInstance) {
    return browserInstance;
  }

  console.log('Launching Chromium browser...');
  prepareServerlessChromiumEnv();
  console.log('Environment:', process.env.NODE_ENV);
  console.log('AWS_EXECUTION_ENV:', process.env.AWS_EXECUTION_ENV);
  console.log('AWS_LAMBDA_FUNCTION_NAME:', process.env.AWS_LAMBDA_FUNCTION_NAME);
  
  try {
    // Get the executable path - chrome-aws-lambda will download if needed
    const executablePath = await chromium.executablePath;
    console.log('Chrome executable path:', executablePath);
    if (!executablePath) {
      throw new Error(
        'Chromium executable path is null. Ensure chrome-aws-lambda is available in this runtime.'
      );
    }

    browserInstance = await puppeteer.launch({
      args: [...chromium.args, '--disable-dev-shm-usage', '--no-sandbox'],
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: true,
      ignoreHTTPSErrors: true,
    });

    console.log('Browser launched successfully');
    return browserInstance;
  } catch (error) {
    console.error('Failed to launch browser:', error);
    throw error;
  }
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

      // Read JSON response body from the API endpoint.
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
