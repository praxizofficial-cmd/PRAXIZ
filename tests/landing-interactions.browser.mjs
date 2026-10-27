import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PRAXIZ_PLAYWRIGHT || 'playwright');
const output = process.env.PRAXIZ_SCREENSHOTS || 'tmp/landing-validation';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PRAXIZ_CHROME ? { executablePath: process.env.PRAXIZ_CHROME } : {}) });
const errors = [];
let checks = 0;
const baseURL = process.env.PRAXIZ_URL || 'http://127.0.0.1:4174';
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const check = (value, message) => { assert.ok(value, message); checks++; };
const groups = ['.record-sources', '.connected-flow-journey .connected-stages', '.connected-flow-ai .connected-stages', '.workspace-roles', '.human-actions'];
async function verifyInteraction(group) {
  const buttons = page.locator(`${group} button`);
  await buttons.nth(1).click();
  await page.mouse.move(0, 0);
  check(await buttons.nth(1).getAttribute('aria-pressed') === 'true', `${group} persistent choice`);
  for (let i = 0; i < await buttons.count(); i++) {
    await buttons.nth(i).hover();
    check(await buttons.nth(i).getAttribute('data-active') === 'true', `${group} hover ${i}`);
    check(await buttons.nth(1).getAttribute('aria-pressed') === 'true', `${group} hover preserves choice`);
  }
  await page.mouse.move(0, 0);
  check(await buttons.nth(1).getAttribute('data-active') === 'true', `${group} pointer leave restores choice`);
  await buttons.nth(0).focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  check(await buttons.nth(2).getAttribute('data-active') === 'true', `${group} keyboard preview`);
  check(await buttons.nth(1).getAttribute('aria-pressed') === 'true', `${group} focus is temporary`);
  await buttons.nth(2).blur();
  check(await buttons.nth(1).getAttribute('data-active') === 'true', `${group} blur restores saved selection`);
  await buttons.nth(2).focus();
  await page.keyboard.press('Space');
  check(await buttons.nth(2).getAttribute('aria-pressed') === 'true', `${group} Space commits`);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  check(await buttons.nth(1).getAttribute('aria-pressed') === 'true', `${group} Enter commits`);
}
try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  check((await page.locator('.hero-slogan').innerText()).replace(/\s+/g, ' ').trim() === 'The Pursuit of Knowledge. The Practice of Intelligence.', 'exact slogan');
  for (const group of groups) await verifyInteraction(group);
  await page.getByRole('button', { name: 'Next journey stage', exact: true }).click();
  check(await page.locator('.connected-flow-journey .stage-card').nth(2).getAttribute('aria-pressed') === 'true', 'next stage');
  await page.getByRole('button', { name: 'Previous journey stage', exact: true }).click();
  check(await page.locator('.connected-flow-journey .stage-card').nth(1).getAttribute('aria-pressed') === 'true', 'previous stage');
  const modeOptions = [{ mode: 'Light', os: 'light' }, { mode: 'Dark', os: 'dark' }, { mode: 'System', os: 'light' }, { mode: 'System', os: 'dark' }];
  const colors = ['PRAXIZ Blue', 'Pink', 'Gold', 'Green'];
  const strokes = {};
  for (const { mode, os } of modeOptions) {
    await page.emulateMedia({ colorScheme: os });
    for (const color of colors) {
      await page.getByRole('button', { name: 'Appearance preferences', exact: true }).click();
      await page.getByRole('button', { name: mode, exact: true }).click();
      await page.getByRole('radio', { name: color, exact: true }).check();
      await page.getByRole('button', { name: 'Appearance preferences', exact: true }).click();
      await page.waitForTimeout(300);
      check(await page.locator('.hero-slogan').evaluate(el => el.getAnimations({subtree:true}).every(a => a.playState === 'finished')), 'theme does not replay headline');
      const state = await page.evaluate(() => {
        const target = document.querySelector('.record-connectors [data-active=true] path');
        const orbit = document.querySelector('.interpretation-orbit');
        const probe = document.createElement('span');
        probe.style.color = 'var(--showcase-ink)';
        document.querySelector('.landing').append(probe);
        const expected = getComputedStyle(probe).color; probe.remove();
        return { theme: document.documentElement.dataset.theme, stroke: getComputedStyle(target).stroke, border: getComputedStyle(orbit).borderTopColor, expected,
          accents: [...document.querySelectorAll('.public-experience button[data-active=true]')].map(el => getComputedStyle(el).borderTopColor) };
      });
      check(state.theme === os, `${mode}/${os}/${color} resolved theme`);
      check(state.stroke === state.expected && state.border === state.expected, `${mode}/${os}/${color} connector + orbit accent`);
      check(state.accents.every(value => value === state.expected), `${mode}/${os}/${color} all selected borders`);
      strokes[`${mode}/${os}/${color}`] = state.stroke;
      for (const group of groups) {
        const buttons = page.locator(`${group} button`);
        check(await buttons.nth(1).getAttribute('aria-pressed') === 'true', 'appearance retains selection');
        await buttons.nth(0).hover();
        check(await buttons.nth(0).getAttribute('data-active') === 'true', 'appearance hover');
        await page.mouse.move(0, 0);
        check(await buttons.nth(1).getAttribute('data-active') === 'true', 'appearance restores selection');
      }
    }
  }
  check(new Set(Object.values(strokes)).size >= 8, 'all accents change computed colors');
  await page.reload({ waitUntil: 'networkidle' });
  check(await page.evaluate(() => document.documentElement.dataset.accent) === 'green', 'accent survives refresh');
  check(await page.evaluate(() => document.documentElement.dataset.themeMode) === 'system', 'mode survives refresh');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(100);
  check(await page.evaluate(() => document.documentElement.dataset.theme) === 'light', 'System responds to OS change');
  await page.getByRole('link', {name:'Sign in to PRAXIZ', exact:true}).click();
  await page.goBack({waitUntil:'networkidle'});
  check(await page.evaluate(() => document.documentElement.dataset.accent) === 'green', 'accent survives public navigation');
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const selector of ['.hero', '.connected-flow-journey', '.analytics-experience', '.connected-flow-ai', '.workspace-explorer']) {
      const section = page.locator(selector); await section.scrollIntoViewIfNeeded(); await page.waitForTimeout(900);
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width} no page overflow`);
      check(await section.evaluate(el => el.scrollWidth <= el.clientWidth + 2), `${width}/${selector} no section overflow`);
      if ([1440,768,390].includes(width)) await section.screenshot({path:`${output}/${width}-${selector.slice(1)}.png`});
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  check(await page.locator('.travel-light').first().evaluate(el => getComputedStyle(el).display) === 'none', 'reduced motion disables traveling lights');
  check(await page.locator('.hero-stage-3').evaluate(el => getComputedStyle(el).opacity) === '1', 'reduced motion keeps hero visible');
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobile = await touch.newPage(); await mobile.goto(baseURL, { waitUntil: 'networkidle' });
  for (const group of groups) {
    const buttons = mobile.locator(`${group} button`);
    for (let i=0;i<await buttons.count();i++) { await buttons.nth(i).tap(); check(await buttons.nth(i).getAttribute('aria-pressed') === 'true', `${group} touch ${i}`); }
  }
  await touch.close();
  check(errors.length === 0, `browser errors: ${errors.join('; ')}`);
  console.log(JSON.stringify({ checks, appearanceCombinations:16, widths:[1440,1024,768,390,320], errors, strokes }, null, 2));
} finally { await browser.close(); }
