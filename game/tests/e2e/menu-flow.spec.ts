import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { ready, runRecipe } from './helpers';
const recipes=JSON.parse(fs.readFileSync('tests/campaign-recipes.json','utf8'));

test('Crux identity, campaign unlock, and saved completion survive reload',async({page})=>{
  await page.goto('/');
  await expect(page).toHaveTitle('Crux — A Climbing Puzzle');
  await page.getByTestId('start-play').click();
  await expect(page.locator('.menu-header h1')).toHaveText('CRUX');
  await expect(page.locator('.menu-card')).toHaveCount(12);
  await expect(page.locator('.menu-card.unlocked')).toHaveCount(1);
  await expect(page.locator('.menu-card.locked')).toHaveCount(11);
  await expect(page.locator('.menu-banner')).toHaveCount(0);
  await page.locator('[data-level-id="first_light"]').click();
  await ready(page);
  await expect(page.getByTestId('crimp-left')).toBeHidden();
  await runRecipe(page,recipes[0].steps);
  await expect(page.locator('.menu-crux-container')).toBeVisible({timeout:5000});
  await expect(page.locator('[data-level-id="thin_edge"]')).toBeEnabled();
  await page.reload();
  await page.getByTestId('start-play').click();
  await expect(page.locator('[data-level-id="first_light"]')).toHaveClass(/completed/);
  await expect(page.locator('[data-level-id="thin_edge"]')).toBeEnabled();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('crux.save.v2')!));
  expect(saved.profiles.original_browser.levels.first_light.completed).toBe(true);
});
