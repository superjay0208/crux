import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { ready, runRecipe, drag } from './helpers';
const recipes=JSON.parse(fs.readFileSync('tests/realism-recipes.json','utf8'));
const output='../validation/fatigue-realism-2026-10-09/browser';

test.describe('realism campaign through player input',()=>{
  for(const recipe of recipes) test(`realism ${recipe.id}`,async({page})=>{
    test.setTimeout(120000);
    await page.goto(`/?profile=realism&level=${recipe.id}`);await ready(page);
    await runRecipe(page,recipe.steps);
    const snap=await page.evaluate(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot());
    expect(snap.sessionState).toBe('Finished');expect(snap.finish.hands).toBe(2);
    expect(snap.support.footLoad).toBeGreaterThanOrEqual(.15);expect(snap.stamina).toBeGreaterThan(0);
    expect(snap.limbs.leftHand.holdId).toBe('top');expect(snap.limbs.rightHand.holdId).toBe('top');
    if(recipe.id==='pinpoint') {
      const left=await page.getByTestId('crimp-left').boundingBox(),right=await page.getByTestId('crimp-right').boundingBox();
      expect(left).not.toBeNull();expect(right).not.toBeNull();
      expect(left!.x+left!.width).toBeLessThanOrEqual(right!.x);
    }
    if(['first_light','pinpoint','crux'].includes(recipe.id)){
      fs.mkdirSync(output,{recursive:true});await page.screenshot({path:`${output}/${recipe.id}-realism-finish.png`});
    }
  });
});

test('mode selection persists and progress remains independent',async({page})=>{
  await page.goto('/');await page.getByTestId('mode-realism').click();
  await expect(page.getByTestId('mode-realism')).toHaveAttribute('aria-pressed','true');
  await page.getByTestId('start-play').click();await page.locator('[data-level-id="first_light"]').click();await ready(page);
  await runRecipe(page,recipes[0].steps);
  await expect(page.locator('.menu-crux-container')).toBeVisible({timeout:5000});
  await expect(page.locator('[data-level-id="thin_edge"]')).toBeEnabled();
  await page.getByTestId('mode-standard').click();
  await expect(page.locator('[data-level-id="thin_edge"]')).toBeDisabled();
  await page.getByTestId('mode-realism').click();await page.reload();
  await expect(page.getByTestId('mode-realism')).toHaveAttribute('aria-pressed','true');
  await page.getByTestId('start-play').click();await expect(page.locator('[data-level-id="thin_edge"]')).toBeEnabled();
});

test('realism idles slowly downward and a supported jug shake recovers and cleans up',async({page})=>{
  await page.goto('/?profile=realism&level=first_light');await ready(page);
  await page.waitForTimeout(1500);
  const before=await page.evaluate(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot().stamina);
  await page.waitForTimeout(1000);
  const idle=await page.evaluate(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot().stamina);
  expect(idle).toBeLessThan(before);expect(before-idle).toBeLessThan(.015);
  await drag(page,'leftFoot',recipes[0].steps[0].hold);await page.waitForTimeout(1000);
  const spent=await page.evaluate(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot().stamina);
  expect(spent).toBeLessThan(idle-.02);
  await page.keyboard.down('z');
  await expect(page.getByTestId('shake-indicator')).toHaveAttribute('data-recovering','true');
  await page.waitForTimeout(1500);
  const recovered=await page.evaluate(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot().stamina);
  expect(recovered).toBeGreaterThan(spent+.03);
  fs.mkdirSync(output,{recursive:true});await page.screenshot({path:`${output}/shake-recovery.png`});
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(()=>!(window as any).__crux.facade.getSimulation().getLatestSnapshot().shake.active);
  await page.keyboard.up('z');await page.locator('#hud-retry-btn').click();
  await page.waitForFunction(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot().stamina>.99);
  await expect(page.getByTestId('shake-indicator')).toBeHidden();
});

test('a single hand at TOP does not finish and the final match uses both hands',async({page})=>{
  await page.goto('/?profile=original_browser&level=first_light');await ready(page);
  await drag(page,'rightHand','top');await page.waitForTimeout(450);
  await expect(page.locator('#hud-completion')).toBeHidden();await expect(page.getByTestId('route-goals')).toContainText('1/2 TOP');
  await drag(page,'leftHand','top');await expect(page.locator('#hud-completion')).toBeVisible();
});

test('hidden tabs freeze fatigue and clear held shake state on resume',async({page})=>{
  await page.goto('/?profile=realism&level=first_light');await ready(page);await page.waitForTimeout(1500);
  await page.keyboard.down('z');await page.waitForFunction(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot().shake.active);
  const paused=await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
    return (window as any).__crux.facade.getSimulation().getLatestSnapshot();
  });
  await page.waitForTimeout(500);
  const still=await page.evaluate(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot());
  expect(still.tick).toBe(paused.tick);expect(still.stamina).toBe(paused.stamina);
  await page.evaluate(()=>{delete (document as any).hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>!(window as any).__crux.facade.getSimulation().getLatestSnapshot().shake.active);await page.keyboard.up('z');
});
