import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { ready, drag, landGreen } from './helpers';

for(const dpr of [1,1.25]){
  test.describe(`Crux visual evidence DPR ${dpr}`,()=>{
    test.use({deviceScaleFactor:dpr,viewport:{width:1280,height:720}});
    test('captures rendered identity, crimp grip, and timing-wheel transfer',async({page})=>{
      const output='../validation/web-polish-2026-10-09';fs.mkdirSync(output,{recursive:true});
      const errors:string[]=[];const failedResponses:any[]=[];
      page.on('pageerror',error=>errors.push(String(error)));
      page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
      page.on('response',response=>{if(response.status()>=400)failedResponses.push({url:response.url(),status:response.status()});});
      await page.goto('/');await expect(page.locator('.start-screen')).toBeVisible();
      await page.screenshot({path:`${output}/start-dpr-${dpr}.png`});
      await page.getByTestId('start-play').click();await expect(page.locator('.menu-crux-container')).toBeVisible();
      await page.screenshot({path:`${output}/menu-dpr-${dpr}.png`});
      await page.getByTestId('grip-lab-button').click();await ready(page);
      await page.keyboard.down('q');await drag(page,'leftHand','left_crimp');
      await page.waitForTimeout(200);
      await page.screenshot({path:`${output}/crimp-dpr-${dpr}.png`});
      const grip=await page.evaluate(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot().crimp);
      await page.keyboard.up('q');
      await page.goto('/?level=switchback');await ready(page);
      await drag(page,'leftFoot','pivot');
      await page.screenshot({path:`${output}/wheel-dpr-${dpr}.png`});
      const wheel=await page.evaluate(()=>(window as any).__crux.facade.getSimulation().getFootSwapSnapshot());
      await landGreen(page);
      await page.screenshot({path:`${output}/swap-dpr-${dpr}.png`});
      const swap=await page.evaluate(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot());
      fs.writeFileSync(`${output}/browser-results-dpr-${dpr}.json`,JSON.stringify({target:process.env.CRUX_PRODUCTION==='1'?'production':'development',dpr,grip,wheel,swap,errors,failedResponses},null,2)+'\n');
      expect(errors).toEqual([]);expect(failedResponses).toEqual([]);
      expect(swap.goals.footSwaps).toBe(1);
    });
  });
}
