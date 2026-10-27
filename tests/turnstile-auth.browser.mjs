import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PRAXIZ_PLAYWRIGHT || 'playwright');
const base = process.env.PRAXIZ_URL || 'http://127.0.0.1:4174';
const browser = await chromium.launch({headless:true, ...(process.env.PRAXIZ_CHROME ? {executablePath:process.env.PRAXIZ_CHROME} : {})});
const context = await browser.newContext({viewport:{width:1440,height:1000}});
const page = await context.newPage();
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const requests = [];
const errors = [];
page.on('pageerror', error => errors.push(error.message));
if(process.env.PRAXIZ_VERCEL_BYPASS) {
  // An existing authorized preview-access token stays on this deployment only.
  await context.route(`${new URL(base).origin}/**`, route => route.fallback({headers:{...route.request().headers(),'x-vercel-protection-bypass':process.env.PRAXIZ_VERCEL_BYPASS}}));
}

// Explicit widget stub. These are synthetic test tokens, never sent to Cloudflare
// or Supabase. All auth endpoints and all other mutations are intercepted below.
await context.route('https://challenges.cloudflare.com/turnstile/v0/api.js*', route => route.fulfill({contentType:'application/javascript', body:`
  const widgets = new Map(); let next = 0;
  window.__turnstileTest = { widgets, latest: () => [...widgets.values()].at(-1) };
  window.turnstile = {
    ready(callback) { callback(); },
    render(container, options) {
      const id = String(++next);
      const host = typeof container === 'string' ? document.querySelector(container) : container;
      const frame = document.createElement('iframe'); frame.title = 'Test security verification';
      frame.style.cssText = 'width:100%;min-width:200px;height:65px;border:0'; host.append(frame);
      widgets.set(id, {options, frame}); return id;
    },
    remove(id) { widgets.get(id)?.frame.remove(); widgets.delete(id); },
    reset(id) { const widget = widgets.get(id); if(widget) widget.resets = (widget.resets || 0) + 1; },
    getResponse() { return ''; }, isExpired() { return false; }
  };
  const callback = new URL(document.currentScript.src).searchParams.get('onload');
  if(callback) window[callback]?.();
` }));
await context.route('**/*', async route => {
  const request = route.request();
  if(new URL(request.url()).pathname.includes('/auth/v1/')) {
    if(request.method() === 'POST') {
      requests.push({path:new URL(request.url()).pathname, body:request.postDataJSON(), url:request.url()});
      return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'test_auth_error',msg:'Synthetic auth failure for regression test'})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:'{}'});
  }
  if(!['GET','HEAD','OPTIONS'].includes(request.method())) return route.abort();
  return route.fallback();
});
const units = [{id:'fixture-campus',parent_id:null,unit_type:'campus',code:'TEST',name:'Test campus',short_name:'Test campus',is_active:true,deleted_at:null},{id:'fixture-college',parent_id:'fixture-campus',unit_type:'college',code:'TEST',name:'Test college',short_name:'Test college',is_active:true,deleted_at:null}];
for(const [table,data] of Object.entries({org_units:units,academic_programs:[{id:'fixture-program',owning_org_unit_id:'fixture-college',code:'TEST',name:'Test program',is_active:true,deleted_at:null}],campuses:[{org_unit_id:'fixture-campus',municipality:'Test'}],'rpc/get_registration_academic_terms':[{id:'fixture-term',academic_year:'2026-2027',term:'first'}]})) {
  await context.route(`**/rest/v1/${table}*`, route => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)}));
}
async function widget() { await page.waitForFunction(() => window.__turnstileTest?.latest()); }
async function solve() { await page.evaluate(() => window.__turnstileTest.latest().options.callback('synthetic-turnstile-token')); }
async function changeMode(mode) {
  await page.getByRole('button',{name:'Appearance preferences',exact:true}).click();
  await page.getByRole('button',{name:mode,exact:true}).click();
  await page.getByRole('button',{name:'Appearance preferences',exact:true}).click();
}
async function checkModes() {
  for(const mode of ['Dark','Light','System']) {
    await changeMode(mode); await widget();
    if(mode === 'System') await page.emulateMedia({colorScheme:'dark'});
    await page.waitForFunction(() => window.__turnstileTest.latest()?.options.theme === document.documentElement.dataset.theme);
    check(await page.evaluate(() => window.__turnstileTest.latest().options.size === 'flexible'),'widget uses responsive size');
  }
  await page.emulateMedia({colorScheme:'light'});
  await page.waitForFunction(() => window.__turnstileTest.latest()?.options.theme === 'light');
  checks++;
}
async function checkWidths() {
  for(const width of [320,390,440,768,1440]) {
    await page.setViewportSize({width,height:1000});
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),`page fits ${width}`);
    const box = await page.locator('.auth-turnstile').boundingBox();
    check(box && box.x >= -1 && box.x + box.width <= width + 1,`widget fits ${width}`);
  }
}
async function prepareRegistration() {
  await page.goto(`${base}/register`,{waitUntil:'networkidle'});
  await page.locator('input[name=firstName]').fill('Test'); await page.locator('input[name=lastName]').fill('Fixture');
  await page.locator('input[name=studentNumber]').fill('2026-123'); await page.locator('input[name=email]').fill('fixture123.pbox@parsu.edu.ph');
  await page.locator('select[name=campusId]').selectOption('fixture-campus'); await page.locator('select[name=collegeId]').selectOption('fixture-college'); await page.locator('select[name=programId]').selectOption('fixture-program');
  await page.locator('select[name=yearLevel]').selectOption('4'); await page.locator('select[name=section]').selectOption('A');
  const term = page.locator('select[name=academicTermId]'); if(await term.count()) await term.selectOption('fixture-term');
  await page.locator('input[name=password]').fill('SyntheticPassword123'); await page.locator('input[name=confirmPassword]').fill('SyntheticPassword123');
  await page.getByRole('checkbox').check();
  await changeMode('Light');
  await page.getByRole('button',{name:'Submit registration',exact:true}).click();
  await page.getByRole('dialog',{name:'Review your registration',exact:true}).waitFor();
}
try {
  if(process.env.PRAXIZ_EXPECT_MISSING_TURNSTILE === '1') {
    for(const path of ['/signin','/forgot-password']) {
      await page.goto(`${base}${path}`,{waitUntil:'networkidle'});
      await page.getByRole('alert').filter({hasText:'NEXT_PUBLIC_TURNSTILE_SITE_KEY is not configured'}).waitFor();
      check(await page.locator('.auth-turnstile iframe').count() === 0,`${path}: missing key never renders empty-key widget`);
    }
    await prepareRegistration();
    const dialog = page.getByRole('dialog',{name:'Review your registration',exact:true});
    await dialog.getByRole('alert').filter({hasText:'NEXT_PUBLIC_TURNSTILE_SITE_KEY is not configured'}).waitFor();
    check(await dialog.getByRole('button',{name:'Submit registration',exact:true}).isDisabled(),'missing key blocks registration submission');
    check(requests.length === 0,'missing configuration sends no auth requests');
    check(errors.length === 0,`no runtime or hydration errors: ${errors.join('; ')}`);
    console.log(`${checks} missing-key Preview browser checks passed; no users created or emails sent.`);
  } else {
  await page.goto(`${base}/signin`,{waitUntil:'networkidle'}); await widget();
  await page.locator('input[name=email]').fill('nobody@example.test');
  await page.locator('input[name=password]').fill('SyntheticPassword123');
  await page.getByRole('button',{name:'Sign in to PRAXIZ',exact:true}).click();
  check(requests.length === 0,'login requires verification before auth request');
  await solve(); await changeMode('Dark'); await widget();
  await page.getByRole('button',{name:'Sign in to PRAXIZ',exact:true}).click();
  check(requests.length === 0,'login invalidates token on theme change');
  await changeMode('Light'); await widget();
  await page.getByRole('button',{name:'Sign in to PRAXIZ',exact:true}).click();
  check(requests.length === 0,'returning to original theme does not revive old token');
  await solve(); await page.getByRole('button',{name:'Sign in to PRAXIZ',exact:true}).click();
  await page.getByText('Synthetic auth failure for regression test',{exact:false}).waitFor();
  check(requests.at(-1).body.gotrue_meta_security.captcha_token === 'synthetic-turnstile-token','login passes token to Supabase wire payload');
  check(await page.evaluate(() => window.__turnstileTest.latest().resets === 1),'login resets widget after auth error');
  const count = requests.length;
  await page.getByRole('button',{name:'Sign in to PRAXIZ',exact:true}).click();
  check(requests.length === count,'failed login token cannot be reused');
  await checkModes(); await checkWidths();

  await page.goto(`${base}/forgot-password`,{waitUntil:'networkidle'}); await widget();
  await page.locator('input[type=email]').fill('nobody@example.test');
  await solve(); await changeMode('Dark'); await widget();
  await page.getByRole('button',{name:'Request reset link',exact:true}).click();
  check(requests.length === count,'recovery invalidates token on theme change');
  await solve();
  await page.evaluate(() => window.__turnstileTest.latest().options['expired-callback']());
  await page.getByRole('button',{name:'Request reset link',exact:true}).click();
  check(requests.length === count,'expired token cannot request recovery');
  await solve(); await page.getByRole('button',{name:'Request reset link',exact:true}).click();
  await page.getByText('Synthetic auth failure for regression test',{exact:false}).waitFor();
  check(requests.at(-1).path.endsWith('/recover') && requests.at(-1).body.gotrue_meta_security.captcha_token === 'synthetic-turnstile-token','recovery passes token to Supabase wire payload');
  check(await page.evaluate(() => window.__turnstileTest.latest().resets === 1),'recovery resets after auth error');
  await checkModes(); await checkWidths();

  await prepareRegistration();
  let dialog = page.getByRole('dialog',{name:'Review your registration',exact:true}); await dialog.waitFor(); await widget();
  check(await page.evaluate(() => window.__turnstileTest.latest().options.theme === 'light'),'registration uses effective light theme');
  check(await dialog.getByRole('button',{name:'Submit registration',exact:true}).isDisabled(),'registration requires a verification token');
  for(const width of [320,390,440,768,1440]) {
    await page.setViewportSize({width,height:1000});
    check(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1),`registration review fits ${width}`);
  }
  await solve();
  await page.evaluate(() => {document.documentElement.dataset.theme='dark';window.dispatchEvent(new Event('praxiz-appearance'));});
  await page.waitForFunction(() => window.__turnstileTest.latest()?.options.theme === 'dark');
  check(await dialog.getByRole('button',{name:'Submit registration',exact:true}).isDisabled(),'registration clears token when review theme changes');
  await solve();
  await page.evaluate(() => window.__turnstileTest.latest().options['error-callback']('synthetic-error'));
  await dialog.getByRole('alert').waitFor();
  check(await dialog.getByRole('button',{name:'Submit registration',exact:true}).isDisabled(),'widget error clears registration token');
  await dialog.getByRole('button',{name:'Retry security verification',exact:true}).click();
  await solve(); await dialog.getByRole('button',{name:'Submit registration',exact:true}).click();
  await page.getByText('Synthetic auth failure for regression test',{exact:false}).waitFor();
  const signup = requests.at(-1);
  check(signup.path.endsWith('/signup') && signup.body.gotrue_meta_security.captcha_token === 'synthetic-turnstile-token','registration passes token to Supabase wire payload');
  check(signup.body.data.requested_role === 'student_intern','registration retains Student Intern role validation');
  await page.getByRole('button',{name:'Submit registration',exact:true}).click();
  dialog = page.getByRole('dialog',{name:'Review your registration',exact:true}); await dialog.waitFor(); await widget();
  check(await dialog.getByRole('button',{name:'Submit registration',exact:true}).isDisabled(),'registration retry requires a fresh verification');
  check(await page.locator('input[name=email]').inputValue() === 'fixture123.pbox@parsu.edu.ph','registration error preserves input');
  check(errors.length === 0,`no runtime or hydration errors: ${errors.join('; ')}`);
  await mkdir('tmp/turnstile-audit',{recursive:true});
  await page.screenshot({path:'tmp/turnstile-audit/registration-review.png'});
  console.log(`${checks} Turnstile browser checks passed; all auth requests intercepted; no users created or emails sent.`);
  }
} finally { await browser.close(); }
