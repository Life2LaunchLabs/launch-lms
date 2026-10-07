/* global process, URL, __dirname, document, innerWidth, innerHeight, localStorage, console, setTimeout */
const { chromium, expect } = require('@playwright/test');
const fs=require('fs');
const base=process.env.DEMO_BROWSER_BASE_URL || 'http://127.0.0.1:13100';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Only local synthetic fixtures are supported');
const out=require('path').resolve(__dirname, '../../../docs/plans/active/demo-checkpoints/evidence');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true});
 const findings=[];
 async function assertViewport(page, label) {
  await expect(page.getByRole('region',{name:'Hub companion',exact:true})).toBeVisible({timeout:30000});
  await expect(page.getByText(/Loading conversations/)).toHaveCount(0,{timeout:30000});
  const bounds=await page.evaluate(()=>({height:innerHeight,documentHeight:document.documentElement.scrollHeight,width:innerWidth,documentWidth:document.documentElement.scrollWidth,bar:document.querySelector('.demo-experience')?.getBoundingClientRect().height}));
  if(bounds.documentHeight>bounds.height || bounds.documentWidth>bounds.width || bounds.bar!==48)throw Error(label+' viewport bounds '+JSON.stringify(bounds));
  findings.push({surface:label,bounds});
 }
 const cancelled=await browser.newContext({viewport:{width:390,height:844}});const cancelPage=await cancelled.newPage();
 await cancelPage.goto(base+'/demo');
 await cancelPage.route('**/api/demo/start',async route=>{const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,1200));await route.fulfill({response});});
 await cancelPage.getByTestId('demo-account-2').getByRole('button',{name:'Start demo',exact:true}).click();await cancelPage.getByRole('button',{name:'Cancel',exact:true}).click();
 await expect(cancelPage.getByTestId('demo-account-2').getByRole('button',{name:'Start demo',exact:true})).toBeEnabled({timeout:30000});
 if((await cancelled.cookies()).some(cookie=>cookie.name==='demo_pending_cookie'))throw Error('Cancellation left a pending ticket');
 findings.push({cancelDuringAdmission:'passed'});await cancelled.close();

 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  const mode=viewport.width===390?'phone':'desktop';
  const context=await browser.newContext({viewport});const page=await context.newPage();
  await page.goto(base+'/demo');await page.getByTestId('demo-account-2').getByRole('button',{name:'Start demo',exact:true}).waitFor();await page.waitForTimeout(1200);
  await page.waitForTimeout(400);await page.screenshot({path:`${out}/entry-${mode}.png`,fullPage:true});
  await page.getByTestId('demo-account-2').getByRole('button',{name:'Start demo',exact:true}).click();
  await page.getByRole('button',{name:'Reset',exact:true}).waitFor({timeout:90000});
  await page.waitForTimeout(1200);
  await assertViewport(page, 'visitor-'+mode);
  await page.waitForTimeout(400);await page.screenshot({path:`${out}/visitor-${mode}.png`,fullPage:true});
  const oldToken=(await context.cookies()).find(c=>c.name==='access_token_cookie').value;
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Reset',exact:true})).toBeFocused();await page.getByRole('button',{name:'Reset',exact:true}).click();await page.waitForTimeout(400);await page.screenshot({path:`${out}/reset-${mode}.png`});
  await page.getByRole('button',{name:'Reset demo',exact:true}).click();
  await page.getByRole('button',{name:'Reset',exact:true}).waitFor({timeout:90000});
  const revoked=await context.request.get(base+'/api/v1/users/session',{headers:{Authorization:`Bearer ${oldToken}`}});
  if(revoked.status()!==401)throw Error('Reset did not revoke old credentials '+revoked.status());
  await page.getByRole('button',{name:'Back to demo users',exact:true}).click();
  await page.getByRole('button',{name:'Back to demo users',exact:true}).click();
  await page.getByTestId('demo-account-2').getByRole('button',{name:'Start demo',exact:true}).waitFor({timeout:60000});
  findings.push({viewport:mode,resetRevocation:revoked.status(),end:'passed',overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
  await context.close();
 }
 const admin=await browser.newContext({viewport:{width:1440,height:900}});const page=await admin.newPage();
 await page.goto(base+'/login');await page.getByLabel('Email address').fill('operator@example.com');await page.getByLabel('Password').fill('demo-fixture-only');await page.getByRole('button',{name:/log ?in|sign ?in/i}).click();
 await page.waitForURL(url=>!url.pathname.includes('login'),{timeout:90000});await page.waitForTimeout(1000);await expect(page.locator('.demo-experience')).toHaveCount(0);await page.goto(base+'/demo');
 await page.getByTestId('demo-account-2').getByRole('button',{name:'Edit live account',exact:true}).waitFor({timeout:90000});
 await page.getByRole('button',{name:'Demo settings',exact:true}).click();await page.getByRole('heading',{name:'Demo settings',exact:true}).waitFor();await page.waitForTimeout(400);await page.screenshot({path:`${out}/admin-settings-desktop.png`});
 await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Demo settings',exact:true}).click();await page.waitForTimeout(400);await page.screenshot({path:`${out}/admin-settings-phone.png`});await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:900});await page.getByTestId('demo-account-2').getByRole('button',{name:'Edit live account',exact:true}).click();
 await page.getByRole('button',{name:'Save checkpoint',exact:true}).waitFor({timeout:60000});
 await page.waitForTimeout(1200);await assertViewport(page, 'admin-live-desktop');
 await page.waitForTimeout(400);await page.screenshot({path:`${out}/admin-live-desktop.png`,fullPage:true});
 await page.getByRole('button',{name:'Save checkpoint',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Save checkpoint',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Checkpoint saved.'}).waitFor({timeout:60000});
 await page.getByRole('button',{name:'Switch demo user',exact:true}).click();await page.getByTestId('demo-account-2').getByRole('button',{name:'Edit live account',exact:true}).waitFor({timeout:60000});
 findings.push({admin:'enter, settings, publish, exit passed'});
 const dark=await browser.newContext({viewport:{width:390,height:844}});await dark.addInitScript(()=>localStorage.setItem('theme','dark'));const darkPage=await dark.newPage();await darkPage.goto(base+'/demo');await darkPage.waitForTimeout(1500);await darkPage.screenshot({path:`${out}/entry-dark-phone.png`,fullPage:true});await dark.close();
 fs.writeFileSync(`${out}/browser-results.json`,JSON.stringify(findings,null,2));process.stdout.write(JSON.stringify(findings)+'\n');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
