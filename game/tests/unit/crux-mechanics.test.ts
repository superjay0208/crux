import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { FootReachModel } from '../../src/core/rules/FootReachModel';
import { isInGreen, wrapPhase } from '../../src/core/rules/TimingWheel';
import { LevelLoader } from '../../src/core/data/levelLoader';
import { Simulation } from '../../src/core/sim/Simulation';

const config={crossedReachFraction:.64,crossTransition:.55};
const hip={x:0,y:0};
describe('Crux timing and movement',()=>{
  it('wraps phase, including negative turns, and includes both green boundaries',()=>{
    expect(wrapPhase(1.2)).toBeCloseTo(.2); expect(wrapPhase(-.2)).toBeCloseTo(.8);
    expect(isInGreen(.39,.5,.22)).toBe(true); expect(isInGreen(.61,.5,.22)).toBe(true);
    expect(isInGreen(.389,.5,.22)).toBe(false); expect(isInGreen(.611,.5,.22)).toBe(false);
    expect(isInGreen(.99,.02,.1)).toBe(true);
  });
  it('allows the same-side foot farther than the crossed foot without lengthening either leg',()=>{
    const target={x:1.2,y:-.7};
    expect(FootReachModel.canReach('rightFoot',target,hip,0,1.575,config,0)).toBe(true);
    expect(FootReachModel.canReach('leftFoot',target,hip,0,1.575,config,0)).toBe(false);
    const clamped=FootReachModel.clamp('leftFoot',target,hip,0,1.575,config);
    expect(clamped.limited).toBe(true);
    expect(FootReachModel.canReach('leftFoot',clamped.target,hip,0,1.575,config,0)).toBe(true);
  });
  it('mirrors and rotates the envelope with the torso, with a smooth midline',()=>{
    const target={x:1.2,y:-.7};
    expect(FootReachModel.canReach('leftFoot',{x:-1.2,y:-.7},hip,0,1.575,config,0)).toBe(true);
    expect(FootReachModel.canReach('rightFoot',{x:.7,y:1.2},hip,Math.PI/2,1.575,config,0)).toBe(true);
    const left=FootReachModel.radius('rightFoot',{x:-.0001,y:0},1.575,config);
    const right=FootReachModel.radius('rightFoot',{x:.0001,y:0},1.575,config);
    expect(Math.abs(left-right)).toBeLessThan(.00001);
  });
  it('does not enable foot limits on isolated older fixtures',()=>{
    expect(FootReachModel.canReach('leftFoot',{x:20,y:20},hip,0,1,undefined)).toBe(true);
  });
});

describe('Crux campaign contracts',()=>{
  const recipes=JSON.parse(fs.readFileSync('tests/campaign-recipes.json','utf8'));
  const levels=recipes.map((r:any)=>LevelLoader.validateLevel(JSON.parse(fs.readFileSync(`public/levels/original/${r.id}.json`,'utf8'))));
  const profile=LevelLoader.validateProfile(JSON.parse(fs.readFileSync('public/profiles/original_browser.json','utf8')));
  it('introduces jugs, then crimps, then swaps; combines them across all later levels',()=>{
    expect(levels).toHaveLength(12);
    expect(levels[0].holds.every((h:any)=>h.grip==='jug')).toBe(true);
    expect(levels[1].goals.crimpHold).toBe('edge');
    expect(levels[2].goals.footSwaps).toBe(1); expect(levels[2].goals.crimpHold).toBeUndefined();
    for(const level of levels.slice(3)){expect(level.goals.crimpHold).toBe('edge');expect(level.goals.footSwaps).toBeGreaterThanOrEqual(1);expect(level.holds.some((h:any)=>h.id===level.finishSupportHold&&h.allowFeet)).toBe(true);}
  });
  it('taking TOP alone cannot bypass the visible foot-swap and support goals',()=>{
    const sim=new Simulation(levels[2],profile);
    const top=levels[2].holds.find((h:any)=>h.finish);
    sim.climber.attach('rightHand',top.id,{x:top.pos[0],y:top.pos[1]});
    sim.stepTick(); expect(sim.session.getState()).toBe('Playing');
    expect(sim.getLatestSnapshot().goals.footSwaps).toBe(0);
    sim.reset(); expect(sim.getLatestSnapshot().goals).toEqual({crimp:false,footSwaps:0,support:false,checkpoints:[]});
  });
  it('rejects malformed reach, wheel and route-goal data',()=>{
    expect(()=>LevelLoader.validateLevel({...levels[2],movement:{...config,crossTransition:0}})).toThrow();
    expect(()=>LevelLoader.validateLevel({...levels[2],goals:{crimpHold:'pivot'}})).toThrow();
    expect(()=>LevelLoader.validateProfile({...profile,rules:{...profile.rules,footSwap:{...profile.rules.footSwap,targetWidth:2}}})).toThrow();
  });
});
