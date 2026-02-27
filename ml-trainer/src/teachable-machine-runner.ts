/**
 * Teachable Machine browser automation via Puppeteer.
 * Navigates to TM Image project, uploads images per class, trains, exports model, captures download.
 *
 * Note: Teachable Machine UI may change. Selectors are centralized here for easier updates.
 * See https://teachablemachine.withgoogle.com/train/image
 */
import path from 'path';
import fs from 'fs';
import { launch, Browser } from 'puppeteer';
import { TrainingManifest } from './types';
import { logger } from './constants';

const TM_IMAGE_URL = 'https://teachablemachine.withgoogle.com/train/image';

/** Timeouts (ms). Training can take several minutes. */
const PAGE_LOAD_TIMEOUT = 60000;
const TRAINING_TIMEOUT = 600000; // 10 min
const DOWNLOAD_WAIT_TIMEOUT = 120000; // 2 min
const SELECTOR_TIMEOUT = 30000;

export interface RunTeachableMachineInput {
  jobDir: string;
  manifest: TrainingManifest;
  downloadDir: string;
  /** Optional: Chromium path (e.g. in Docker). */
  executablePath?: string;
}

export interface RunTeachableMachineResult {
  /** Path to the downloaded file (typically a .zip) or directory containing model files. */
  exportPath: string;
}

/**
 * Wait for a file matching pattern to appear in dir (e.g. .zip or model.json).
 */
function waitForFile(
  dir: string,
  pattern: RegExp | string,
  timeoutMs: number
): Promise<string> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const files = fs.readdirSync(dir);
      const match = typeof pattern === 'string' ? (f: string) => f === pattern : (f: string) => pattern.test(f);
      const found = files.find(match);
      if (found) {
        resolve(path.join(dir, found));
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timeout waiting for file in ${dir} (pattern: ${pattern})`));
        return;
      }
      setTimeout(check, 500);
    };
    check();
  });
}

/**
 * Run Teachable Machine: create project, upload images per class, train, export, capture download.
 */
export async function runTeachableMachine(
  input: RunTeachableMachineInput
): Promise<RunTeachableMachineResult> {
  const { jobDir, manifest, downloadDir, executablePath } = input;
  const products = manifest.products;

  if (products.length < 2) {
    throw new Error('Need at least 2 products (classes) for Teachable Machine');
  }

  const launchOptions: Parameters<typeof launch>[0] = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
    ],
  };
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  let browser: Browser | null = null;

  try {
    logger.info('Launching browser for Teachable Machine...');
    browser = await launch(launchOptions);
    const page = await browser.newPage();

    await page.setDefaultNavigationTimeout(PAGE_LOAD_TIMEOUT);
    await page.setDefaultTimeout(SELECTOR_TIMEOUT);

    // Allow downloads to the given directory
    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
    });

    logger.info(`Navigating to ${TM_IMAGE_URL}`);
    await page.goto(TM_IMAGE_URL, { waitUntil: 'networkidle2' });

    // Wait for the project to be ready (TM shows class sections)
    await page.waitForSelector('input[type="file"]', { timeout: SELECTOR_TIMEOUT }).catch(() => {
      // TM might use different structure; try body and then look for file inputs
      return null;
    });

    // Collect all file inputs (one per class). TM typically has Class 1, Class 2, and we can add more.
    let inputs = await page.$$('input[type="file"][accept*="image"]');
    if (inputs.length < products.length) {
      // Add more classes if needed (TM "Add class" button)
      for (let i = inputs.length; i < products.length; i++) {
        const addClassEl = await (page as any).$x("//button[contains(., 'Add class')] | //a[contains(., 'Add class')]").then((arr: any[]) => arr[0]).catch(() => null);
        if (addClassEl) {
          await (addClassEl as any).click();
          await new Promise((r) => setTimeout(r, 1000));
        }
        inputs = await page.$$('input[type="file"][accept*="image"]');
      }
    }
    if (inputs.length < products.length) {
      throw new Error(
        `Teachable Machine has ${inputs.length} class upload(s), need ${products.length}. UI may have changed.`
      );
    }

    // Upload images for each class
    for (let i = 0; i < products.length; i++) {
      const productDir = path.join(jobDir, 'images', String(i));
      if (!fs.existsSync(productDir)) {
        logger.warn(`No images directory for class ${i}, skipping`);
        continue;
      }
      const imageFiles = fs.readdirSync(productDir)
        .filter((f) => /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f))
        .map((f) => path.join(productDir, f));
      if (imageFiles.length === 0) {
        logger.warn(`No images for class ${i}, skipping`);
        continue;
      }
      logger.info(`Uploading ${imageFiles.length} images for class ${i} (${products[i].productName})`);
      await (inputs[i] as any).uploadFile(...imageFiles);
      await new Promise((r) => setTimeout(r, 1500)); // Allow UI to process
    }

    // Click Train (XPath: button containing "Train")
    const trainButtons = await (page as any).$x("//button[contains(., 'Train')]");
    const trainButton = trainButtons.length ? trainButtons[0] : null;
    if (!trainButton) {
      const byText = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const b = buttons.find((el) => el.textContent?.trim() === 'Train');
        return b || null;
      });
      const h = byText as any;
      if (h && (await page.evaluate((e: unknown) => e != null, h))) await h.click();
      else throw new Error('Could not find Train button. Teachable Machine UI may have changed.');
    } else {
      await (trainButton as any).click();
    }
    logger.info('Training started, waiting for completion...');

    // Wait for Export to become available (training done)
    await page.waitForFunction(
      () => {
        const nodes = document.querySelectorAll('button, a');
        return Array.from(nodes).some((n) => n.textContent?.trim().toLowerCase().includes('export'));
      },
      { timeout: TRAINING_TIMEOUT }
    ).catch(() => {
      throw new Error('Export button did not appear within training timeout');
    });

    logger.info('Training complete, opening Export...');
    const exportBtn = await page.evaluateHandle(() => {
      const nodes = Array.from(document.querySelectorAll('button, a'));
      for (const n of nodes) {
        if (n.textContent?.trim().toLowerCase().includes('export')) return n;
      }
      return null;
    });
    const hasExport = await page.evaluate((e: unknown) => e != null, exportBtn as any);
    if (hasExport) await (exportBtn as any).click();

    await new Promise((r) => setTimeout(r, 2000));

    // TensorFlow.js export option, then Download (XPath or by text)
    const tfJsEl = await (page as any).$x("//*[contains(., 'TensorFlow.js')]").then((arr: any[]) => arr[0]).catch(() => null);
    if (tfJsEl) await (tfJsEl as any).click();
    await new Promise((r) => setTimeout(r, 1000));

    const downloadEl = await (page as any).$x("//*[contains(., 'Download')]").then((arr: any[]) => arr[0]).catch(() => null);
    if (downloadEl) await (downloadEl as any).click();

    const exportPath = await waitForFile(downloadDir, /\.zip$|model\.json/, DOWNLOAD_WAIT_TIMEOUT);
    logger.info(`Export captured: ${exportPath}`);

    return { exportPath };
  } finally {
    if (browser) await browser.close();
  }
}
