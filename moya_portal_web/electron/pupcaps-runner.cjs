const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

const originalSymlinkSync = fs.symlinkSync;

fs.symlinkSync = function symlinkSyncWithWindowsFallback(target, destination, type) {
  try {
    return originalSymlinkSync.call(fs, target, destination, type);
  } catch (error) {
    if (error?.code !== 'EPERM' && error?.code !== 'EACCES') {
      throw error;
    }
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      return originalSymlinkSync.call(fs, target, destination, 'junction');
    }
    fs.copyFileSync(target, destination);
    return undefined;
  }
};

const originalLaunch = puppeteer.launch.bind(puppeteer);

puppeteer.launch = async function launchWithReadyFallback(options = {}) {
  const browser = await originalLaunch(options);
  const originalNewPage = browser.newPage.bind(browser);
  browser.newPage = async function newPageWithReadyFallback() {
    const page = await originalNewPage();
    const originalEvaluate = page.evaluate.bind(page);
    page.evaluate = async function evaluateWithPlayerFallback(pageFunction, ...args) {
      await page.waitForFunction(() => window.Player || typeof window.onload === 'function', { timeout: 10000 }).catch(() => undefined);
      await originalEvaluate(async () => {
        if (!window.Player && typeof window.onload === 'function') {
          window.onload();
        }
        if (window.ready && typeof window.ready.then === 'function') {
          await window.ready;
        }
      }).catch(() => undefined);
      return originalEvaluate(pageFunction, ...args);
    };
    const originalGoto = page.goto.bind(page);
    page.goto = async function gotoAndEnsurePlayer(url, gotoOptions = {}) {
      const response = await originalGoto(url, { waitUntil: 'load', ...gotoOptions });
      await page.evaluate(async () => {
        if (!window.Player && typeof window.onload === 'function') {
          window.onload();
        }
        if (window.ready && typeof window.ready.then === 'function') {
          await window.ready;
        }
      }).catch(() => undefined);
      await page.waitForFunction(() => window.Player && typeof window.Player.next === 'function', { timeout: 10000 }).catch(() => undefined);
      return response;
    };
    return page;
  };
  return browser;
};

const pupcapsEntry = require.resolve('pupcaps/dist/script/index.js', {
  paths: [path.join(__dirname, '..')]
});

require(pupcapsEntry);
