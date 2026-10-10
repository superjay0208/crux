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
  const points=await page.evaluate(()=>{
    const f=window.__crux.facade,s=f.getSimulation(),hold=s.level.holds.find(h=>h.finish);
    return {start:f.getCamera().worldToScreen(s.climber.getLimbPosition('rightHand')),end:f.getCamera().worldToScreen({x:hold.pos[0],y:hold.pos[1]})};
  });
  await page.mouse.move(points.start.x,points.start.y);await page.mouse.down();
  await page.mouse.move(points.end.x,points.end.y,{steps:24});
  await page.waitForFunction(()=>window.__crux.facade.getSimulation().getLatestSnapshot().hoverCandidateHoldId==='top');
  await page.mouse.up();await page.locator('#hud-completion').waitFor();
  await page.reload();await page.getByTestId('start-play').click();
  if(await page.locator('[data-level-id="thin_edge"]').isDisabled())throw new Error('Web save progression failed.');
  await page.goto(`${url}?level=crux`);await page.waitForFunction(()=>Boolean(window.__crux?.facade));
  const fonts=await page.evaluate(async()=>{await document.fonts.load('16px "Barlow Condensed"');return document.fonts.check('16px "Barlow Condensed"');});
  if(!fonts||errors.length||failed.length)throw new Error(JSON.stringify({fonts,errors,failed}));
  const output='../validation/web-polish-2026-10-09';await fs.mkdir(output,{recursive:true});
  await page.screenshot({path:`${output}/${urlArg?'live':'subpath'}-crux.png`});
  await fs.writeFile(`${output}/${urlArg?'live':'subpath'}-results.json`,JSON.stringify({url,fonts,errors,failed,completed:true},null,2));
  console.log(`PASS ${url}: demo, real first-route input, save/reload, direct level, JSON and fonts.`);
}finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
