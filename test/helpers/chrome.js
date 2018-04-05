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

  // ensure login is selected
  await page.waitForSelector('#loadLogin, #login_email', { visible: true });
  await page.click('#loadLogin, #login_email');

  // now type login
  await page.waitForSelector('#login_email', { visible: true });
  await page.type('#login_email', process.env.PAYPAL_SANDBOX_USERNAME, { delay: 100 });

  const pwdHandle = await page.$('#login_password');
  await pwdHandle.type(process.env.PAYPAL_SANDBOX_PASSWORD, { delay: 100 });
  await pwdHandle.press('Enter', { delay: 100 });
  await pwdHandle.dispose();

  await page.waitForSelector('#continue', { visible: true });
  await page.click('#continue');

  await page.waitForNavigation({ waitUntil: 'networkidle0' });
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
  // for some reason even though its visible - it really is not
  await Promise.delay(3000);
  await page.click('#confirmButtonTop');

  await page.waitForNavigation({ waitUntil: 'networkidle0' });
  const href = page.url();

  console.assert(/paypal-sale-return\?/.test(href), 'url is %s - %s', href);
  const { query } = url.parse(href, true);

  return {
    payer_id: query.PayerID,
    payment_id: query.paymentId,
    token: query.token,
  };
});
