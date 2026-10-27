import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PRAXIZ_PLAYWRIGHT || 'playwright');
const browser=await chromium.launch({headless:true,...(process.env.PRAXIZ_CHROME ? {executablePath:process.env.PRAXIZ_CHROME} : {})});
const base=process.env.PRAXIZ_URL || 'http://127.0.0.1:4174';
const output='tmp/ui-refinement/browser'; await mkdir(output,{recursive:true});
let checks=0;const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('response',response=>{if(response.request().isNavigationRequest() && response.request().frame()===page.mainFrame() && response.status()>=400) errors.push(`Navigation HTTP ${response.status()}: ${new URL(response.url()).pathname}`);});
// Public UI only: block all mutations, including accidental registration submission.
await context.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort());
const units=[{id:'fixture-campus',parent_id:null,unit_type:'campus',code:'TEST',name:'Test campus',short_name:'Test campus',is_active:true,deleted_at:null},{id:'fixture-college',parent_id:'fixture-campus',unit_type:'college',code:'TEST',name:'Test college',short_name:'Test college',is_active:true,deleted_at:null}];
for(const [table,data] of Object.entries({org_units:units,academic_programs:[{id:'fixture-program',owning_org_unit_id:'fixture-college',code:'TEST',name:'Test program',is_active:true,deleted_at:null}],campuses:[{org_unit_id:'fixture-campus',municipality:'Test'}],'rpc/get_registration_academic_terms':[{id:'fixture-term',academic_year:'2026-2027',term:'first'}]})) {
 await context.route(`**/rest/v1/${table}*`,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)}));
}
async function preview(selector) {
 const buttons=page.locator(`${selector} button`); await buttons.nth(1).click();await page.mouse.move(0,0);
 check(await buttons.nth(1).getAttribute('aria-pressed')==='true','selection committed');
 await buttons.nth(2).hover();check(await buttons.nth(2).getAttribute('class')==='is-active','hover previews');
 check(await buttons.nth(1).getAttribute('aria-pressed')==='true','hover preserves selection');
 await page.mouse.move(0,0);check(await buttons.nth(1).getAttribute('class')==='is-active','leave restores selection');
 await buttons.nth(0).focus();await page.keyboard.press('Enter');check(await buttons.nth(0).getAttribute('aria-pressed')==='true','keyboard commits');
}
async function noOverflow(label) {check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label);}
try {
 await page.goto(base,{waitUntil:'networkidle'});await preview('.sdg-explorer-grid');
 await page.waitForFunction(()=>[...document.querySelectorAll('.sdg-explorer-grid img')].every(img=>img.complete&&img.naturalWidth>0));
 check(await page.locator('.sdg-explorer-grid img').evaluateAll(nodes=>nodes.every(img=>img.complete&&img.naturalWidth>0)),'official SDG assets load');
 await page.locator('.sdg-explorer').screenshot({path:`${output}/sdg-desktop.png`});
 await page.goto(`${base}/register/success`,{waitUntil:'networkidle'});await page.getByRole('heading',{name:'No recent submission found'}).waitFor();checks++;
 // Explicit browser-only proof fixture. No production record is created.
 await page.evaluate(()=>sessionStorage.setItem('praxiz-registration-submission',JSON.stringify({email:'ui-fixture@example.test',submittedAt:'2026-10-26T00:00:00Z'})));
 await page.reload({waitUntil:'networkidle'});await page.getByRole('heading',{name:'Your registration is submitted!'}).waitFor();checks++;
 await preview('.registration-journey');await page.screenshot({path:`${output}/success-desktop.png`,fullPage:true});
 for(const width of [320,390,440,768]) {await page.setViewportSize({width,height:900});await noOverflow(`success ${width} fits`);}
 await page.screenshot({path:`${output}/success-mobile.png`,fullPage:true});
 await page.goto(`${base}/register`,{waitUntil:'networkidle'});
 await page.locator('input[name=firstName]').fill('María José');await page.locator('input[name=middleInitial]').fill('ñ.');await page.locator('input[name=lastName]').fill('Dela Cruz');
 check(await page.locator('input[name=fullName]').inputValue()==='María José Ñ. Dela Cruz','composed existing fullName field');
 check(await page.locator('.registration-navigator button').count()===3,'three continuous sections');
 await page.getByRole('button',{name:/Account security Incomplete/}).click();
 check(await page.locator('input[name=firstName]').inputValue()==='María José','jump preserves fields');
 for(const width of [320,390,440,768,1440]) {await page.setViewportSize({width,height:900});await noOverflow(`registration ${width} fits`);}
 await page.screenshot({path:`${output}/registration-desktop.png`,fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${output}/registration-mobile.png`,fullPage:true});
 await page.locator('input[name=studentNumber]').fill('2026-123');await page.locator('input[name=email]').fill('fixture123.pbox@parsu.edu.ph');
 await page.locator('select[name=campusId]').selectOption('fixture-campus');await page.locator('select[name=collegeId]').selectOption('fixture-college');await page.locator('select[name=programId]').selectOption('fixture-program');
 await page.locator('select[name=yearLevel]').selectOption('4');await page.locator('select[name=section]').selectOption('A');
 const term=page.locator('select[name=academicTermId]');if(await term.count()) await term.selectOption('fixture-term');
 await page.locator('input[name=password]').fill('NotSubmittedFixture123');await page.locator('input[name=confirmPassword]').fill('NotSubmittedFixture123');
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Submit registration',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Review your registration',exact:true});await dialog.waitFor();checks++;
 check(!(await dialog.innerText()).includes('NotSubmittedFixture123'),'review never displays password');
 check(await dialog.locator('.native-dialog-footer').count()===1,'separate action footer');
 for(const width of [320,390,768,1440]) {await page.setViewportSize({width,height:900});const box=await dialog.boundingBox();check(box.x>=-1 && box.x+box.width<=width+1,`review fits ${width}`);check(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'review no horizontal overflow');}
 await page.getByRole('button',{name:'Expand dialog',exact:true}).click();check(await dialog.evaluate(el=>el.classList.contains('native-dialog-expanded')),'dialog expands');
 await page.getByRole('button',{name:'Restore dialog size',exact:true}).click();
 await page.screenshot({path:`${output}/registration-review.png`});
 await page.keyboard.press('Escape');check(await dialog.count()===0,'Escape closes review');
 check(await page.locator('input[name=firstName]').inputValue()==='María José','closing review preserves form');
 await page.goto(`${base}/register/success`,{waitUntil:'networkidle'});
 for(const mode of ['Light','Dark','System']) {
  for(const color of ['PRAXIZ Blue','Pink','Gold','Green']) {
   await page.getByRole('button',{name:'Appearance preferences',exact:true}).click();await page.getByRole('button',{name:mode,exact:true}).click();await page.getByRole('radio',{name:color,exact:true}).check();await page.getByRole('button',{name:'Appearance preferences',exact:true}).click();
   await noOverflow(`${mode}/${color} success layout`);
  }
 }
 await page.getByRole('button',{name:'Appearance preferences',exact:true}).click();await page.getByRole('button',{name:'Dark',exact:true}).click();await page.getByRole('radio',{name:'PRAXIZ Blue',exact:true}).check();await page.getByRole('button',{name:'Appearance preferences',exact:true}).click();
 await page.screenshot({path:`${output}/success-dark.png`,fullPage:true});
 await page.emulateMedia({reducedMotion:'reduce'});check(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),'reduced motion enabled');
 check(errors.length===0,`no runtime/hydration errors: ${errors.join('; ')}`);
 console.log(`${checks} browser checks passed; no writes; screenshots: ${output}`);
} finally {await browser.close();}
