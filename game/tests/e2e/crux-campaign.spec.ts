import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { ready, runRecipe } from './helpers';

const recipes=JSON.parse(fs.readFileSync('tests/campaign-recipes.json','utf8'));
test.describe('Crux campaign: actual pointer and keyboard solutions',()=>{
  for(const recipe of recipes){
    test(`${recipe.id} is playable through real input`,async({page})=>{
      const errors:string[]=[];
      page.on('pageerror',error=>errors.push(String(error)));
      page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
      await page.goto(`/?level=${recipe.id}`);
      await ready(page);
      await runRecipe(page,recipe.steps);
      const snapshot=await page.evaluate(()=>(window as any).__crux.facade.getSimulation().getLatestSnapshot());
      expect(snapshot.sessionState).toBe('Finished');
      if(recipe.steps.some((s:any)=>s.swap))expect(snapshot.goals.footSwaps).toBeGreaterThanOrEqual(1);
      if(recipe.steps.some((s:any)=>s.crimp))expect(snapshot.goals.crimp).toBe(true);
      expect(errors).toEqual([]);
    });
  }
});
