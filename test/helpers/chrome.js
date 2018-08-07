const Promise = require('bluebird');
const puppeteer = require('puppeteer');
const url = require('url');
const fs = require('fs').promises;

// selector constants
const EMAIL_INPUT = '#email';
const PWD_INPUT = '#password';
const CONFIRM_BUTTON = '#confirmButtonTop';
const RETRY_LINK = '#retryLink';
const HAS_ACCOUNT_LINK = '.baslLoginButtonContainer .btn';

// instance variables
let page;
let chrome;

// save screenshot in case of crash
const saveCrashReport = fn => async (...args) => {
  let response;
  try {
    response = await fn(...args);
  } catch (e) {
    console.error('fail', e);
    await page.screenshot({ fullPage: false, path: `./ss/crash-${Date.now()}.png` });
    await fs.writeFile(`./ss/crash-${Date.now()}.html`, await page.content(), 'utf-8');
    throw e;
  }

  return response;
};

const typeAndSubmit = async (selector, text) => {
  let handle;
  try {
    await page.waitFor(selector, { visible: true });
    handle = await page.$(selector);
    await handle.type(text, { delay: 100 });
    await handle.press('Enter', { delay: 100 });
  } finally {
    if (handle) await handle.dispose();
  }
};

const dispose = async (...handlers) => {
  await Promise.all((
    handlers
      .filter(x => x !== null)
      .map(x => x.dispose())
  ));
};

const idle = async (type = '2') => {
  await page.waitForNavigation({ waitUntil: `networkidle${type}`, timeout: 10000 });
};

// create retry function
const confirmRetry = (retrySelectror, confirmSelector) => {
  let retryCount = 3;
  async function retry() {
    retryCount -= 1;

    if (retryCount < 0) {
      return Promise.reject(new Error('Operation failed: max number of retries'));
    }

    let retryButton;
    let confirmButton;
    try {
      await Promise.some([
        page.waitFor(confirmSelector, { visible: true, timeout: 40000 }),
        page.waitFor(retrySelectror, { visible: true, timeout: 40000 }),
      ], 1);

      retryButton = await page.$(retrySelectror);
      confirmButton = await page.$(confirmSelector);

      if (confirmButton) {
        console.info('pressed confirm btn');
        await Promise.all([
          idle('0'),
          page.click(confirmSelector, { delay: 100 }),
        ]);
        return null;
      }

      if (retryButton) {
        console.info('pressed retry btn');
        await Promise.all([
          idle('0'),
          page.click(retrySelectror, { delay: 100 }),
        ]);
      }
    } catch (e) {
      console.info('failed to confirm/retry', e);
    } finally {
      await dispose(retryButton, confirmButton);
    }

    return Promise.delay(100).then(retry);
  }

  return retry();
};

// headless testing
// need to relaunch each time for clean contexts
exports.initChrome = async () => {
  chrome = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--headless', '--disable-gpu'],
  });
  page = await chrome.newPage();
  await page.setRequestInterception(true);
  await page.setViewport({ width: 1960, height: 1280 });
  page.on('request', (interceptedRequest) => {
    if (/api-sandbox.cappasity.matic.ninja/.test(interceptedRequest.url())) {
      return interceptedRequest.respond({
        status: 200,
        contentType: 'text/plain',
        body: interceptedRequest.url(),
      });
    }

    return interceptedRequest.continue();
  });

  return { page, chrome };
};

exports.closeChrome = async () => {
  if (page) await page.close();
  if (chrome) await chrome.close();
};

exports.approveSubscription = saveCrashReport(async (saleUrl) => {
  await page.goto(saleUrl, { waitUntil: 'networkidle2' });

  await typeAndSubmit(EMAIL_INPUT, process.env.PAYPAL_SANDBOX_USERNAME);
  await typeAndSubmit(PWD_INPUT, process.env.PAYPAL_SANDBOX_PASSWORD);

  try {
    await confirmRetry(RETRY_LINK, CONFIRM_BUTTON);
  } catch (e) {
    console.warn('confirmation failed');
    throw e;
  }

  const href = page.url();

  console.assert(/paypal-subscription-return\?/.test(href), 'url is %s - %s', href);
  const { query } = url.parse(href, true);

  return {
    payer_id: query.PayerID,
    payment_id: query.paymentId,
    token: query.token,
  };
});

exports.approveSale = saveCrashReport(async (saleUrl) => {
  console.info('trying to load %s', saleUrl);
  await page.goto(saleUrl, { waitUntil: 'networkidle2', timeout: 40000 });
  await Promise.some([
    page.waitFor(HAS_ACCOUNT_LINK, { visible: true }),
    page.waitFor(CONFIRM_BUTTON, { visible: true }),
  ], 1);

  const hasAccount = await page.$(HAS_ACCOUNT_LINK);

  if (hasAccount) {
    await Promise.delay(3000);
    await Promise.all([
      idle('2'),
      page.click(HAS_ACCOUNT_LINK, { delay: 100 }),
    ]);
    await dispose(hasAccount);
  }

  await typeAndSubmit(EMAIL_INPUT, process.env.PAYPAL_SANDBOX_USERNAME);
  await typeAndSubmit(PWD_INPUT, process.env.PAYPAL_SANDBOX_PASSWORD);

  try {
    await confirmRetry(RETRY_LINK, CONFIRM_BUTTON);
  } catch (e) {
    console.warn('failed to confirm');
    throw e;
  }

  const href = page.url();
  console.assert(/paypal-sale-return\?/.test(href), 'url is %s - %s', href);
  const { query } = url.parse(href, true);

  return {
    payer_id: query.PayerID,
    payment_id: query.paymentId,
    token: query.token,
  };
});
