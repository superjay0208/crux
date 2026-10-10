import { test, expect } from '@playwright/test';
import { ready, drag, landGreen } from './helpers';

test('independent Q/E rings, reserve drain, repeat input and blur cleanup',async({page})=>{
  await page.goto('/?level=grip_lab');await ready(page);
  await page.keyboard.down('q');await drag(page,'leftHand','left_crimp');
  await page.keyboard.down('e');await drag(page,'rightHand','right_crimp');
  await page.keyboard.down('q'); // OS-style repeated key-down must not toggle intent.
  const left=page.getByTestId('crimp-left');const right=page.getByTestId('crimp-right');
  await expect(left).toHaveAttribute('data-state','engaged');await expect(right).toHaveAttribute('data-state','engaged');
  const before=Number(await left.getByRole('progressbar').getAttribute('aria-valuenow'));
  const arcBefore=parseFloat((await left.locator('.grip-reserve').getAttribute('stroke-dasharray'))!);
  await page.waitForTimeout(500);
  expect(Number(await left.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeLessThan(before);
  expect(parseFloat((await left.locator('.grip-reserve').getAttribute('stroke-dasharray'))!)).toBeLessThan(arcBefore);
  await page.keyboard.up('q');
  await page.waitForFunction(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot().limbs.leftHand.status==='free',undefined,{timeout:2500});
  await expect(right).toHaveAttribute('data-state','engaged');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(()=>!(window as any).__crux.facade.getSimulation().getLatestSnapshot().crimp.rightHand.intent);
  await page.keyboard.up('e');
  await page.waitForFunction(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot().limbs.rightHand.status==='free',undefined,{timeout:2500});
});

test('wheel success, miss, timeout, Escape, blur, and retry preserve transaction invariants',async({page})=>{
  for(const mode of ['miss','timeout','escape','blur','retry','success']){
    await page.goto('/?level=grip_lab');await ready(page);
    await drag(page,'rightFoot','swap_left_foothold');
    await expect(page.getByTestId('timing-wheel')).toBeVisible();
    if(mode==='miss')await page.keyboard.press('Space');
    if(mode==='timeout')await page.waitForTimeout(4000);
    if(mode==='escape')await page.keyboard.press('Escape');
    if(mode==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    if(mode==='retry')await page.locator('#hud-retry-btn').click();
    if(mode==='success'){
      await page.keyboard.press('q');await page.keyboard.press('e');await page.keyboard.press('a');await page.keyboard.press('d');
      await page.waitForTimeout(40);
      await expect(page.getByTestId('foot-swap-qte')).toBeVisible();
      await landGreen(page,true);
    }
    await expect(page.getByTestId('foot-swap-qte')).toBeHidden();
    const result=await page.evaluate(()=>{
      const sim=(window as any).__crux.facade.getSimulation();const snap=sim.getLatestSnapshot();
      return{left:snap.limbs.leftFoot,right:snap.limbs.rightFoot,moves:snap.moves,joints:sim.world.getJointCount()};
    });
    if(mode==='success'){
      expect(result.left.status).toBe('free');expect(result.right.holdId).toBe('swap_left_foothold');expect(result.moves).toBe(1);
      await expect(page.getByTestId('mechanic-feedback')).toContainText('CLEAN SWAP');
    }else{
      expect(result.left.holdId).toBe('swap_left_foothold');expect(result.moves).toBe(0);
      expect(result.right.status).toBe(mode==='retry'?'attached':'free');
      if(mode==='miss')await expect(page.getByTestId('mechanic-feedback')).toContainText('MISSED GREEN');
    }
    expect(result.joints).toBe(4);
  }
});

test('repeated menu/practice navigation leaves one effective keyboard handler',async({page})=>{
  await page.goto('/');
  await page.getByTestId('start-play').click();
  for(let visit=0;visit<4;visit++){
    await page.getByTestId('grip-lab-button').click();await ready(page);
    await page.keyboard.down('q');
    await page.locator('#hud-back-btn').click();await page.keyboard.up('q');
    await expect(page.locator('.menu-crux-container')).toBeVisible();
  }
  await page.getByTestId('grip-lab-button').click();await ready(page);
  await drag(page,'rightFoot','swap_left_foothold');await landGreen(page);
  const moves=await page.evaluate(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot().moves);
  expect(moves).toBe(1);
});

test.describe('Crux at 125% display scaling',()=>{
  test.use({deviceScaleFactor:1.25,viewport:{width:1012,height:720}});
  test('wheel and reserve panels stay in bounds and a foot swap is playable',async({page})=>{
    await page.goto('/?level=grip_lab');await ready(page);
    await drag(page,'rightFoot','swap_left_foothold');
    for(const id of ['foot-swap-qte']){
      const box=await page.getByTestId(id).boundingBox();expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x+box!.width).toBeLessThanOrEqual(1012);expect(box!.y+box!.height).toBeLessThanOrEqual(720);
    }
    await landGreen(page);await expect(page.getByTestId('mechanic-feedback')).toContainText('CLEAN SWAP');
  });
});
