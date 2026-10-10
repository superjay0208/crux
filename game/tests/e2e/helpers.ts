import { Page, expect } from '@playwright/test';
import { LimbId } from '../../src/core/data/schema';

export async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as any).__crux?.facade));
  await page.waitForTimeout(180);
}

export async function drag(page: Page, limb: LimbId, holdId: string): Promise<void> {
  const points = await page.evaluate(({limb,holdId}) => {
    const facade=(window as any).__crux.facade;
    const sim=facade.getSimulation();
    const hold=sim.level.holds.find((h:any)=>h.id===holdId);
    const rect=document.querySelector('#viewport')!.getBoundingClientRect();
    const convert=(point:any)=>{const p=facade.getCamera().worldToScreen(point);return{x:rect.left+p.x,y:rect.top+p.y};};
    return{start:convert(sim.climber.getLimbPosition(limb)),end:convert({x:hold.pos[0],y:hold.pos[1]})};
  },{limb,holdId});
  await page.mouse.move(points.start.x,points.start.y);
  await page.mouse.down();
  await page.waitForTimeout(25);
  for(let step=1;step<=20;step++) {
    const t=step/20;const eased=t*t*(3-2*t);
    const end=await page.evaluate(id=>{
      const f=(window as any).__crux.facade,h=f.getSimulation().level.holds.find((h:any)=>h.id===id);
      const p=f.getCamera().worldToScreen({x:h.pos[0],y:h.pos[1]}),r=document.querySelector('#viewport')!.getBoundingClientRect();
      return {x:r.left+p.x,y:r.top+p.y};
    },holdId);
    await page.mouse.move(points.start.x+(end.x-points.start.x)*eased,points.start.y+(end.y-points.start.y)*eased);
    await page.waitForTimeout(20);
  }
  await page.waitForFunction(id=>{
    const snap=(window as any).__crux.facade.getSimulation().getLatestSnapshot();
    return snap.hoverCandidateHoldId===id||snap.hoverFootSwapHoldId===id;
  },holdId,{timeout:3000});
  await page.mouse.up();
  await page.waitForFunction(({limb,holdId})=>{
    const snap=(window as any).__crux.facade.getSimulation().getLatestSnapshot();
    return snap.limbs[limb].holdId===holdId||snap.footSwap?.holdId===holdId;
  },{limb,holdId},{timeout:1500});
}

export async function landGreen(page:Page,click=false):Promise<void> {
  await expect(page.getByTestId('foot-swap-qte')).toBeVisible();
  await page.waitForFunction(()=>{
    const wheel=(window as any).__crux.facade.getSimulation().getFootSwapSnapshot();
    return wheel&&wheel.phase>=.46&&wheel.phase<=.53;
  },undefined,{timeout:3000});
  if(click)await page.getByTestId('swap-stop').click();else await page.keyboard.press('Space');
  await expect(page.getByTestId('foot-swap-qte')).toBeHidden();
}

export async function runRecipe(page:Page,steps:Array<{limb:LimbId;hold:string;crimp?:boolean;swap?:boolean}>):Promise<void>{
  const held=new Set<string>();
  for(const step of steps){
    const state=await page.evaluate(limb=>{
      const sim=(window as any).__crux.facade.getSimulation(),snap=sim.getLatestSnapshot();
      const other=limb==='leftHand'?'rightHand':'leftHand';
      const hold=sim.level.holds.find((h:any)=>h.id===snap.limbs[other].holdId);
      return{realism:!!sim.profile.rules.realism,reserve:snap.stamina,
        rest:limb.endsWith('Hand')&&hold?.grip==='jug'&&snap.limbs[other].status==='attached'&&(snap.support?.footLoad??0)>.25};
    },step.limb);
    if(!state.realism&&state.reserve<.7) {
      await page.waitForFunction(()=>{
        const snap=(window as any).__crux.facade.getSimulation().getLatestSnapshot();
        return snap.stamina>=.95||Object.values(snap.crimp).some((h:any)=>h.onCrimp&&h.availableSeconds<1.4)||snap.sessionState!=='Playing';
      },undefined,{timeout:6000});
    }
    if(state.realism&&state.reserve<.6&&state.rest) {
      const gripKey=step.limb==='leftHand'?'q':'e',shakeKey=step.limb==='leftHand'?'z':'c';
      await page.keyboard.up(gripKey);held.delete(gripKey);
      await page.waitForTimeout(1000);
      await page.keyboard.down(shakeKey);
      await page.waitForFunction(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot().shake.active,undefined,{timeout:1000});
      await page.waitForFunction(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot().stamina>=.92,undefined,{timeout:20000});
      await page.keyboard.up(shakeKey);
    }
    if(step.limb.endsWith('Hand')){
      const key=step.limb==='leftHand'?'q':'e';
      if(step.crimp){await page.keyboard.down(key);held.add(key);}
      else {await page.keyboard.up(key);held.delete(key);}
    }
    await drag(page,step.limb,step.hold);
    if(step.swap)await landGreen(page);
    await page.waitForTimeout(state.realism&&step.limb.endsWith('Foot')?700:65);
  }
  try { await expect(page.locator('#hud-completion')).toBeVisible(); }
  catch(error) {
    const snap=await page.evaluate(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot());
    throw new Error(`Route did not establish: ${JSON.stringify(snap)}`,{cause:error});
  }
  for(const key of held)await page.keyboard.up(key);
}
