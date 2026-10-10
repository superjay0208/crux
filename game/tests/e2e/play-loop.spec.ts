import { test, expect } from '@playwright/test';
import { ready, drag } from './helpers';

test('isolated lab finishes after the actual limb reaches the target',async({page})=>{
  await page.goto('/?level=lab');await ready(page);
  await drag(page,'rightHand','h1');
  await expect(page.locator('#hud-moves-val')).toHaveText('1');
  await expect(page.locator('#hud-completion')).toBeVisible();
  await expect(page.locator('.completion-level-name')).toHaveText('LAB');
});

test('pointer drag outside the canvas is cleaned up on focus loss',async({page})=>{
  await page.goto('/?level=lab');await ready(page);
  const point=await page.evaluate(()=>{
    const facade=(window as any).__crux.facade;
    const p=facade.getCamera().worldToScreen(facade.getSimulation().climber.getLimbPosition('rightHand'));
    const box=document.querySelector('#viewport')!.getBoundingClientRect();
    return{x:box.left+p.x,y:box.top+p.y};
  });
  await page.mouse.move(point.x,point.y);await page.mouse.down();
  await page.waitForFunction(()=>(window as any).__crux.facade.getSimulation().dragActuator.isDragging());
  await page.mouse.move(-10,-10);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(()=>!(window as any).__crux.facade.getSimulation().dragActuator.isDragging());
  await page.mouse.up();
});
