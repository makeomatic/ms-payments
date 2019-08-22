const Promise = require('bluebird');
const puppeteer = require('puppeteer');
const url = require('url');
const fs = require('fs').promises;

// selector constants
const EMAIL_INPUT = '#email';
const PWD_INPUT = '#password';
const CONFIRM_PAYMENT_METHOD = '.confirmButton';
const CONFIRM_BUTTON = '#confirmButtonTop, .confirmButton, #btnNext, #btnLogin';
const RETRY_LINK = '#retryLink';
const HAS_ACCOUNT_LINK = '.baslLoginButtonContainer .btn';
const LOGIN_BUTTON = '#btnLogin';

// instance variables
let page;
let chrome;
let context;

// save screenshot in case of crash
const saveCrashReport = (fn) => async (...args) => {
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
  console.info('>>> typeAndSubmit', selector);
  try {
    await page.waitFor(selector, { visible: true });
    handle = await page.$(selector);
    console.info('>>> typeAndSubmit %s found', selector);
    await handle.type(text, { delay: 100 });
    await page.screenshot({ fullPage: false, path: './ss/pre-press.png' });
    await handle.press('Enter', { delay: 100 });
  } finally {
    await page.screenshot({ fullPage: false, path: './ss/after-enter.png' });
    if (handle) await handle.dispose();
  }
};

const dispose = async (...handlers) => {
  await Promise.all((
    handlers
      .filter((x) => x != null)
      .map((x) => x.dispose())
  ));
};

const idle = async (type = '2') => {
  await page.waitForNavigation({ waitUntil: `networkidle${type}`, timeout: 10000 });
};

const isIgnorableError = (e) => {
  if (e.message.includes('Protocol error (Runtime.callFunctionOn)')
      || e.message.includes('Protocol error (Target.activateTarget)')
      || e.message.includes('Node is detached from document')) {
    return true;
  }

  if (e.length && e.length > 0) {
    for (let i = 0; i < e.length; i += 1) {
      if (isIgnorableError(e[i])) return true;
    }
  }

  return false;
};

// create retry function
const confirmRetry = (retrySelectror, confirmSelector, breaker) => {
  let retryCount = 5;
  async function retry() {
    console.info('trying', retrySelectror, confirmSelector);
    retryCount -= 1;

    if (breaker && breaker.test(page.url())) {
      return null;
    }

    if (retryCount < 0) {
      return Promise.reject(new Error('Operation failed: max number of retries'));
    }

    try {
      const [jsHandle] = await Promise.some([
        page.waitFor(confirmSelector, { visible: true, timeout: 40000 }),
        page.waitFor(retrySelectror, { visible: true, timeout: 40000 }),
      ], 1);

      await Promise.all([
        jsHandle.asElement().click({ delay: 100 }),
        Promise.some([idle('0', { timeout: 20000 }), Promise.delay(15000)], 1),
      ]);
    } catch (e) {
      if (isIgnorableError(e)) {
        console.info('ignored error', e);
        return null;
      }

      console.info('failed to confirm/retry', e);
      console.info('message:', e.message);
      await page.screenshot({ fullPage: false, path: `./ss/crash-${Date.now()}.png` });
      await fs.writeFile(`./ss/crash-${Date.now()}.html`, await page.content(), 'utf-8');
    }

    return Promise.delay(500).then(retry);
  }

  return retry();
};

// headless testing
// need to relaunch each time for clean contexts
exports.initChrome = async () => {
  chrome = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--headless', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  context = await chrome.createIncognitoBrowserContext();
  page = await context.newPage();

  await page.setRequestInterception(true);
  await page.setViewport({ width: 1960, height: 1280 });

  page.on('request', (interceptedRequest) => {
    console.info(interceptedRequest.url());

    if (/api-sandbox.cappasity.matic.ninja/.test(interceptedRequest.url())) {
      return interceptedRequest.respond({
        status: 200,
        contentType: 'text/plain',
        body: interceptedRequest.url(),
      });
    }

    return interceptedRequest.continue();
  });

  page.on('error', (err) => {
    console.info('pptr', err);
  });

  page.on('pageerror', (err) => {
    console.info('page err', err);
  });

  return { page, chrome };
};

exports.closeChrome = async () => {
  if (page) await page.close().catch(console.warn);
  if (context) await context.close().catch(console.warn);
  if (chrome) await chrome.close().catch(console.warn);
};

exports.approveSubscription = saveCrashReport(async (saleUrl) => {
  await Promise.all([
    page.goto(saleUrl, { waitUntil: 'domcontentloaded' }),
    page.waitForSelector(EMAIL_INPUT),
  ]);

  await typeAndSubmit(EMAIL_INPUT, process.env.PAYPAL_SANDBOX_USERNAME);
  await typeAndSubmit(PWD_INPUT, process.env.PAYPAL_SANDBOX_PASSWORD);

  try {
    console.info('[after login] --> ', page.url());
    await confirmRetry(RETRY_LINK, CONFIRM_BUTTON, /paypal-subscription-return\?/);
    console.info('[after payment method] --> ', page.url());
    await confirmRetry(RETRY_LINK, CONFIRM_BUTTON, /paypal-subscription-return\?/);
    console.info('[after confirm] --> ', page.url());
  } catch (e) {
    console.warn('confirmation failed');
    throw e;
  }

  await page.screenshot({ fullPage: false, path: './ss/2.png' });
  const href = page.url();
  console.assert(/paypal-subscription-return\?/.test(href), 'url is %s - %s', href);

  const { query } = url.parse(href, true);

  return {
    payer_id: query.PayerID,
    payment_id: query.paymentId,
    token: query.token,
  };
});

exports.approveSale = saveCrashReport(async (saleUrl, regexp = /paypal-sale-return\?/) => {
  console.info('trying to load %s', saleUrl);

  console.info('preload');
  await Promise.all([
    page.goto(saleUrl, { waitUntil: 'domcontentloaded' }),
    Promise.some([
      page.waitFor(HAS_ACCOUNT_LINK, { visible: true }),
      page.waitFor(CONFIRM_BUTTON, { visible: true }),
      page.waitFor(LOGIN_BUTTON, { visible: true }),
    ], 1),
  ]);

  const hasAccount = await page.$(HAS_ACCOUNT_LINK);
  if (hasAccount && await hasAccount.boundingBox()) {
    console.info('has account');
    await Promise.delay(3000);
    await Promise.all([idle('2'), hasAccount.click({ delay: 100 })]);
    await dispose(hasAccount);
  }

  await typeAndSubmit(EMAIL_INPUT, process.env.PAYPAL_SANDBOX_USERNAME);
  await typeAndSubmit(PWD_INPUT, process.env.PAYPAL_SANDBOX_PASSWORD);

  try {
    console.info('[after login] --> ', page.url());
    await confirmRetry(RETRY_LINK, CONFIRM_PAYMENT_METHOD, regexp);
    console.info('[after payment method] --> ', page.url());
    await confirmRetry(RETRY_LINK, CONFIRM_BUTTON, regexp);
    console.info('[after confirm] --> ', page.url());
  } catch (e) {
    console.warn('failed to confirm');
    throw e;
  }

  const href = page.url();
  console.assert(regexp.test(href), 'url is %s - %s', href);
  const { query } = url.parse(href, true);

  return {
    payer_id: query.PayerID,
    payment_id: query.paymentId,
    token: query.token,
  };
});
