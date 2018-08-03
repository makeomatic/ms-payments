const Promise = require('bluebird');
const puppeteer = require('puppeteer');
const url = require('url');

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
    await page.screenshot({ fullPage: true, path: `./ss/crash-${Date.now()}.png` });
    throw e;
  }

  return response;
};

// create retry function
const createRetry = (retrySelectror, confirmSelector) => {
  let retryCount = 3;
  return async function retry() {
    retryCount -= 1;

    if (retryCount < 0) {
      return Promise.reject(new Error('Operation failed: max number of retries'));
    }

    try {
      await Promise.some([
        page.waitFor(confirmSelector, { visible: true, timeout: 40000 }),
        page.waitFor(retrySelectror, { visible: true, timeout: 40000 }),
      ], 1);
    } catch (e) {
      return Promise.delay(100).then(retry);
    }

    const retryButton = await page.$(retrySelectror);
    const confirmButton = await page.$(confirmSelector);

    if (confirmButton) {
      return null;
    }

    if (retryButton) {
      await Promise.delay(2000);
      await page.click(retrySelectror, { delay: 100 });
    }

    return Promise.delay(100).then(retry);
  };
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

  await page.waitFor(EMAIL_INPUT, { visible: true });
  const emailHandle = await page.$(EMAIL_INPUT);
  await emailHandle.type(process.env.PAYPAL_SANDBOX_USERNAME, { delay: 100 });
  await emailHandle.press('Enter', { delay: 100 });
  await emailHandle.dispose();

  await page.waitFor(PWD_INPUT, { visible: true });
  const pwdHandle = await page.$(PWD_INPUT);
  await pwdHandle.type(process.env.PAYPAL_SANDBOX_PASSWORD, { delay: 100 });
  await pwdHandle.press('Enter', { delay: 100 });
  await pwdHandle.dispose();

  const retry = createRetry(RETRY_LINK, CONFIRM_BUTTON);

  try {
    await retry();
  } catch (e) {
    console.warn('failed to confirm', e);
  }

  // wait some time for button handlers
  await Promise.delay(7000);

  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }),
      page.click(CONFIRM_BUTTON, { delay: 100 }),
    ]);
  } catch (e) {
    console.warn('failed to get nav event', e);
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
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click(HAS_ACCOUNT_LINK, { delay: 100 }),
    ]);
  }

  await page.waitFor(EMAIL_INPUT, { visible: true });
  const emailHandle = await page.$(EMAIL_INPUT);
  await emailHandle.type(process.env.PAYPAL_SANDBOX_USERNAME, { delay: 100 });
  await emailHandle.press('Enter', { delay: 100 });
  await emailHandle.dispose();

  await page.waitFor(PWD_INPUT, { visible: true });
  const pwdHandle = await page.$(PWD_INPUT);
  await pwdHandle.type(process.env.PAYPAL_SANDBOX_PASSWORD, { delay: 100 });
  await pwdHandle.press('Enter', { delay: 100 });
  await pwdHandle.dispose();

  const retry = createRetry(RETRY_LINK, CONFIRM_BUTTON);

  try {
    await retry();
  } catch (e) {
    console.warn('failed to confirm', e);
  }

  // wait some time for button handlers
  await Promise.delay(7000);

  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 }),
      page.click(CONFIRM_BUTTON, { delay: 100 }),
    ]);
  } catch (e) {
    console.warn('failed to get nav event', e);
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
