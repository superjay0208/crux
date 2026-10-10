// Production subpath smoke test, or deployed URL check when --url is provided.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
const urlArg=process.argv.find(v=>v.startsWith('--url='));
let server;
let url=urlArg?.slice(6);
const root=path.resolve('dist');
if(!url){
  server=http.createServer(async(req,res)=>{
    try {
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(!pathname.startsWith('/crux/')){res.writeHead(404);res.end();return;}
      const file=path.resolve(root,pathname.slice(6)||'index.html');
      if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
      const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf'};
      const data=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  url=`http://127.0.0.1:${server.address().port}/crux/`;
}
const browser=await chromium.launch({channel:process.env.CRUX_CI==='1'?undefined:'msedge'});
const page=await browser.newPage({viewport:{width:1280,height:720}});
const errors=[],failed=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
try {
  await page.goto(url);await page.getByTestId('start-play').waitFor();
  await page.getByTestId('demo-route').getByText('CONTACT',{exact:true}).waitFor();
  await page.waitForFunction(()=>Number(document.querySelector('.start-screen')?.getAttribute('data-demo-tick'))>40);
  await page.getByTestId('start-play').click();await page.locator('[data-level-id="first_light"]').click();
  await page.waitForFunction(()=>Boolean(window.__crux?.facade));
  await page.waitForTimeout(150);
  const drag=async(limb,holdId)=>{
    const start=await page.evaluate(limb=>{
      const f=window.__crux.facade;return f.getCamera().worldToScreen(f.getSimulation().climber.getLimbPosition(limb));
    },limb);
    await page.mouse.move(start.x,start.y);await page.mouse.down();
    for(let i=1;i<=24;i++){
      const end=await page.evaluate(id=>{const f=window.__crux.facade,h=f.getSimulation().level.holds.find(h=>h.id===id);return f.getCamera().worldToScreen({x:h.pos[0],y:h.pos[1]});},holdId);
      const t=i/24;await page.mouse.move(start.x+(end.x-start.x)*t,start.y+(end.y-start.y)*t);await page.waitForTimeout(16);
    }
    await page.waitForFunction(id=>window.__crux.facade.getSimulation().getLatestSnapshot().hoverCandidateHoldId===id,holdId,{timeout:3000});
    await page.mouse.up();await page.waitForTimeout(80);
  };
  await drag('rightHand','top');
  if(await page.locator('#hud-completion').isVisible())throw new Error('Single-hand finish was accepted.');
  await drag('leftHand','top');await page.locator('#hud-completion').waitFor();
  await page.reload();await page.getByTestId('start-play').click();
  if(await page.locator('[data-level-id="thin_edge"]').isDisabled())throw new Error('Web save progression failed.');
  await page.getByTestId('mode-realism').click();
  if(!(await page.locator('[data-level-id="thin_edge"]').isDisabled()))throw new Error('Mode progress leaked into realism.');
  await page.locator('[data-level-id="first_light"]').click();await page.waitForFunction(()=>Boolean(window.__crux?.facade));
  await page.waitForTimeout(250);
  const recipe=JSON.parse(await fs.readFile('tests/realism-recipes.json','utf8')).find(r=>r.id==='first_light');
  for(const step of recipe.steps){await drag(step.limb,step.hold);if(step.limb.endsWith('Foot'))await page.waitForTimeout(700);}
  await page.locator('#hud-completion').waitFor();
  const real=await page.evaluate(()=>window.__crux.facade.getSimulation().getLatestSnapshot());
  if(real.finish.hands!==2||real.support.footLoad<.15)throw new Error('Realism finish lacks useful support.');
  await page.goto(`${url}?level=crux`);await page.waitForFunction(()=>Boolean(window.__crux?.facade));
  const fonts=await page.evaluate(async()=>{await document.fonts.load('16px "Barlow Condensed"');return document.fonts.check('16px "Barlow Condensed"');});
  if(!fonts||errors.length||failed.length)throw new Error(JSON.stringify({fonts,errors,failed}));
  const output='../validation/fatigue-realism-2026-10-09/browser';await fs.mkdir(output,{recursive:true});
  await page.screenshot({path:`${output}/${urlArg?'live':'subpath'}-crux.png`});
  await fs.writeFile(`${output}/${urlArg?'live':'subpath'}-results.json`,JSON.stringify({url,fonts,errors,failed,completed:true,realismCompleted:true,footLoad:real.support.footLoad},null,2));
  console.log(`PASS ${url}: demo, two-hand finishes in both modes, independent saves, direct level, JSON and fonts.`);
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
