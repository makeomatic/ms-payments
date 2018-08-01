const Promise = require('bluebird');
const puppeteer = require('puppeteer');
const url = require('url');

// instance variables
let page;
let chrome;

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
  console.info('try to subscribe to %s', saleUrl);
  await page.goto(saleUrl, { waitUntil: 'networkidle2' });

  await page.waitFor('#email', { visible: true });
  const emailHandle = await page.$('#email');
  await emailHandle.type(process.env.PAYPAL_SANDBOX_USERNAME, { delay: 100 });
  await emailHandle.press('Enter', { delay: 100 });
  await emailHandle.dispose();

  await page.waitFor('#password', { visible: true });
  const pwdHandle = await page.$('#password');
  await pwdHandle.type(process.env.PAYPAL_SANDBOX_PASSWORD, { delay: 100 });
  await pwdHandle.press('Enter', { delay: 100 });
  await pwdHandle.dispose();

  let retryCount = 3;

  const retry = async () => {
    retryCount -= 1;

    if (retryCount < 0) {
      return Promise.reject(new Error('Operation failed: max number of retries'));
    }

    await Promise.some([
      page.waitFor('#confirmButtonTop', { visible: true, timeout: 40000 }),
      page.waitFor('#retryLink', { visible: true, timeout: 40000 }),
    ], 1).catch(() => Promise.delay(100).then(() => retry));

    const retryButton = await page.$('#retryLink');
    const confirmButton = await page.$('#confirmButtonTop');

    if (confirmButton) {
      return Promise.resolve();
    }

    if (retryButton) {
      await Promise.delay(2000);
      await page.click('#retryLink', { delay: 100 });
    }

    return Promise.delay(100).then(() => retry());
  };

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
      page.click('#confirmButtonTop', { delay: 100 }),
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
  await page.goto(saleUrl, { waitUntil: 'networkidle2' });

  await page.waitFor('#email', { visible: true });
  const emailHandle = await page.$('#email');
  await emailHandle.type(process.env.PAYPAL_SANDBOX_USERNAME, { delay: 100 });
  await emailHandle.press('Enter', { delay: 100 });
  await emailHandle.dispose();

  await page.waitFor('#password', { visible: true });
  const pwdHandle = await page.$('#password');
  await pwdHandle.type(process.env.PAYPAL_SANDBOX_PASSWORD, { delay: 100 });
  await pwdHandle.press('Enter', { delay: 100 });
  await pwdHandle.dispose();

  await page.waitFor('#confirmButtonTop', { visible: true });

  // wait some time for button handlers
  await Promise.delay(7000);

  try {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 }),
      page.click('#confirmButtonTop', { delay: 100 }),
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
