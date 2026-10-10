import { test,expect } from '@playwright/test';
import fs from 'node:fs';
import { ready,drag } from './helpers';
const output='../validation/web-polish-2026-10-09';

test('start demos animate, cycle, never save completions, and stop after navigation',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('/');
  await expect(page.locator('.start-screen')).toBeVisible();
  await page.waitForFunction(()=>Number(document.querySelector('.start-screen')?.getAttribute('data-demo-tick'))>80);
  await expect(page.getByTestId('demo-route')).toHaveText('CONTACT');
  const tick=Number(await page.locator('.start-screen').getAttribute('data-demo-tick'));
  await page.waitForTimeout(300);
  expect(Number(await page.locator('.start-screen').getAttribute('data-demo-tick'))).toBeGreaterThan(tick);
  await page.waitForFunction(()=>document.querySelector('[data-testid="demo-route"]')?.textContent==='CROSSOVER',undefined,{timeout:30000});
  expect(await page.evaluate(()=>localStorage.getItem('crux.save.v2'))).toBeNull();
  await page.evaluate(()=>{(window as any).__oldDemo=document.querySelector('.start-screen');});
  await page.getByTestId('start-play').click();
  const stopped=await page.evaluate(()=>(window as any).__oldDemo.dataset.demoTick);
  await page.waitForTimeout(300);
  expect(await page.evaluate(()=>(window as any).__oldDemo.dataset.demoTick)).toBe(stopped);
  for(let cycle=0;cycle<3;cycle++){
    await page.getByTestId('menu-home').click();await expect(page.locator('.demo-canvas')).toHaveCount(1);
    await page.getByTestId('start-play').click();
  }
  await page.getByTestId('grip-lab-button').click();await ready(page);
  await page.keyboard.down('q');await drag(page,'leftHand','left_crimp');
  await expect(page.getByTestId('crimp-left')).toHaveAttribute('data-state','engaged');
  await page.keyboard.up('q');expect(errors).toEqual([]);
});

test('reduced motion leaves a still demo and controls work with the keyboard',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await expect(page.getByTestId('demo-route')).toHaveText('CONTACT');
  const tick=await page.locator('.start-screen').getAttribute('data-demo-tick');
  await page.waitForTimeout(300);await expect(page.locator('.start-screen')).toHaveAttribute('data-demo-tick',tick!);
  await page.getByTestId('start-controls').click();await expect(page.locator('.start-control-copy')).toBeVisible();
  await page.getByTestId('start-play').focus();await page.keyboard.press('Enter');
  await expect(page.locator('.menu-crux-container')).toBeVisible();
});

test('hand ring follows the hand, turns red and shakes near exhaustion',async({page})=>{
  await page.goto('/?level=grip_lab');await ready(page);
  await expect(page.getByTestId('crimp-left')).toBeHidden();
  await expect(page.locator('.hud-crimp-panel')).toHaveCount(0);
  await page.keyboard.down('q');await drag(page,'leftHand','left_crimp');
  const ring=page.getByTestId('crimp-left');await expect(ring).toBeVisible();
  const tracking=await page.evaluate(()=>{
    const f=(window as any).__crux.facade,p=f.getCamera().worldToScreen(f.getSimulation().climber.getLimbPosition('leftHand'));
    const box=document.querySelector('[data-testid="crimp-left"]')!.getBoundingClientRect();
    return Math.hypot(box.x+box.width/2-p.x,box.y+box.height/2-p.y);
  });expect(tracking).toBeLessThan(4);
  await expect(ring).toHaveAttribute('data-warning','true',{timeout:6000});
  const hue=await ring.evaluate(el=>parseFloat((el as HTMLElement).style.getPropertyValue('--grip-color').slice(4)));
  expect(hue).toBeLessThan(4);
  expect(await ring.locator('svg').evaluate(el=>getComputedStyle(el).animationName)).toBe('grip-shake');
  fs.mkdirSync(output,{recursive:true});await page.screenshot({path:`${output}/grip-warning.png`});
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await ring.locator('svg').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await page.keyboard.up('q');
});

for(const [w,h,dpr] of [[1280,720,1],[1012,1050,1.25],[800,450,2]]){
  test.describe(`active climbing stays in frame ${w}x${h} DPR ${dpr}`,()=>{
    test.use({viewport:{width:w,height:h},deviceScaleFactor:dpr});
    test('dangling feet, bent knees and head remain visible after releasing feet and resizing',async({page})=>{
      await page.goto('/?level=first_light');await ready(page);
      for(const limb of ['leftFoot','rightFoot']){
        const p=await page.evaluate(limb=>{
          const f=(window as any).__crux.facade;
          return f.getCamera().worldToScreen(f.getSimulation().climber.getLimbPosition(limb));
        },limb);
        await page.mouse.move(p.x,p.y);await page.mouse.down();
        await page.mouse.move(p.x,Math.min(h-85,p.y+60),{steps:8});await page.mouse.up();
      }
      await page.waitForTimeout(500);
      const report=await page.evaluate(async()=>{
        const f=(window as any).__crux.facade,sim=f.getSimulation();let min=Infinity;
        for(let frame=0;frame<60;frame++){
          await new Promise(requestAnimationFrame);
          const snap=sim.getInterpolatedSnapshot(sim.getInterpolationAlpha()),vp=f.getCamera().getViewport();
          for(const p of f.climberRenderer.getFramePoints(snap)){
            const s=f.getCamera().worldToScreen(p);
            min=Math.min(min,s.x-vp.x,vp.x+vp.w-s.x,s.y-vp.y,vp.y+vp.h-s.y);
          }
        }
        return {margin:min,state:sim.getLatestSnapshot().sessionState,feet:Object.values(sim.getLatestSnapshot().limbs).slice(2).map((l:any)=>l.status),scale:f.getCamera().getScale()};
      });
      expect(report.feet).toEqual(['free','free']);expect(report.state).toBe('Playing');expect(report.margin).toBeGreaterThan(30);
      expect(report.scale).toBeLessThanOrEqual(h/8.7);
      await page.setViewportSize({width:w-80,height:h-60});await page.waitForTimeout(100);
      const inside=await page.evaluate(()=>{
        const f=(window as any).__crux.facade,sim=f.getSimulation(),vp=f.getCamera().getViewport();
        return f.climberRenderer.getFramePoints(sim.getInterpolatedSnapshot(sim.getInterpolationAlpha())).every((p:any)=>{
          const s=f.getCamera().worldToScreen(p);return s.x>vp.x&&s.x<vp.x+vp.w&&s.y>vp.y&&s.y<vp.y+vp.h;
        });
      });expect(inside).toBe(true);
      fs.mkdirSync(output,{recursive:true});await page.screenshot({path:`${output}/dangling-${w}-${dpr}.png`});
    });
  });
}

test('swap wheel follows the incoming shoe through resize',async({page})=>{
  await page.goto('/?level=switchback');await ready(page);await drag(page,'leftFoot','pivot');
  await page.setViewportSize({width:1000,height:650});
  await page.waitForTimeout(80);
  const report=await page.evaluate(()=>{
    const f=(window as any).__crux.facade,s=f.getSimulation().getLatestSnapshot();
    const p=f.getCamera().worldToScreen(s.limbs[s.footSwap.incoming].pos);
    const b=document.querySelector('[data-testid="foot-swap-qte"]')!.getBoundingClientRect();
    return {distance:Math.hypot(b.x+b.width/2-p.x,b.y+b.height/2-p.y),width:b.width};
  });expect(report.distance).toBeLessThan(4);expect(report.width).toBe(96);
  await page.keyboard.press('Escape');await expect(page.getByTestId('foot-swap-qte')).toBeHidden();
});
