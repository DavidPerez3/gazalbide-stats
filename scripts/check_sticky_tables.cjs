// Optional browser regression: build with VITE_STATS_SOURCE=json and run with
// GAZAL_PLAYWRIGHT_MODULE=/path/to/playwright GAZAL_CHROME=/path/to/chrome node scripts/check_sticky_tables.cjs
const {chromium}=require(process.env.GAZAL_PLAYWRIGHT_MODULE||'playwright');
const {spawn}=require('node:child_process');const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');const os=require('node:os');
(async()=>{const root=path.resolve(__dirname,'..'),serve=fs.mkdtempSync(path.join(os.tmpdir(),'gazal-tables-'));fs.symlinkSync(path.join(root,'dist'),path.join(serve,'gazalbide-stats'));const server=spawn('python3',['-m','http.server','4196','--bind','127.0.0.1','--directory',serve],{stdio:'ignore'});let browser;
try{await new Promise(r=>setTimeout(r,700));browser=await chromium.launch({executablePath:process.env.GAZAL_CHROME,headless:true,args:['--no-sandbox']});const page=await browser.newPage();await page.route('https://example.supabase.co/**',r=>r.fulfill({json:[]}));const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4196/gazalbide-stats/#/partido/2025-10-12-vs-anboto-jatetxea');const wrap=page.locator('.table-wrap');await page.locator('.sticky-first-two td').first().waitFor();await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});let cases=0;
for(const [width,height] of [[360,800],[390,844],[707,900],[844,390],[1280,900]]){
 await page.setViewportSize({width,height});await wrap.scrollIntoViewIfNeeded();
 for(const scroll of [0,150,350,10000]){
  await wrap.evaluate((e,left)=>e.scrollLeft=left,scroll);await page.waitForTimeout(60);
  const area=await page.evaluate(()=>{const w=document.querySelector('.table-wrap'),box=w.getBoundingClientRect(),cells=[...w.querySelector('tbody tr').cells],num=cells[0].getBoundingClientRect(),name=cells[1].getBoundingClientRect();return {left:box.x+1,num:num.x,numRight:num.right,name:name.x,bg:getComputedStyle(cells[1]).backgroundColor,clip:{x:Math.ceil(box.x),y:Math.ceil(num.y+3),width:Math.floor(name.right-box.x-1),height:Math.min(40,Math.floor(num.height-6))}};});
  assert(Math.abs(area.left-area.num)<1,'left inset exposes moving data');assert(Math.abs(area.numRight-area.name)<1,'frozen column offsets do not match');assert.equal(area.bg,'rgb(20, 20, 20)');
  const before=await page.screenshot({clip:area.clip});await page.locator('.sticky-first-two tr > :not(.col-num):not(.col-name)').evaluateAll(es=>es.forEach(e=>e.style.visibility='hidden'));const after=await page.screenshot({clip:area.clip});assert(before.equals(after),'moving cells remain visible through/around frozen columns');await page.locator('.sticky-first-two tr > :not(.col-num):not(.col-name)').evaluateAll(es=>es.forEach(e=>e.style.visibility=''));cases++;
 }
}
await page.getByTitle('Ordenar por PTS',{exact:true}).click();await wrap.evaluate(e=>e.scrollLeft=250);assert.equal(await page.locator('.sticky-first-two thead th[aria-sort="ascending"]').count(),1);assert.deepEqual(errors,[]);console.log(`${cases} viewport/scroll cases passed: opaque frozen columns, exact offsets, no left-edge leakage; sorting preserved.`);
}finally{await browser?.close();server.kill();fs.rmSync(serve,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exit(1);});
