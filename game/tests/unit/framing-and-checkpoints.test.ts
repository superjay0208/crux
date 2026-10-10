import { describe,it,expect } from 'vitest';
import fs from 'node:fs';
import { Camera } from '../../src/render/Camera';
import { ClimberRenderer } from '../../src/render/ClimberRenderer';
import { Simulation } from '../../src/core/sim/Simulation';
import { LevelLoader } from '../../src/core/data/levelLoader';
const read=(path:string)=>JSON.parse(fs.readFileSync(path,'utf8'));
const profile=LevelLoader.validateProfile(read('public/profiles/original_browser.json'));

describe('whole-body framing',()=>{
  for(const mode of ['original','realism']) {
    const frameProfile=mode==='original'?profile:LevelLoader.validateProfile(read('public/profiles/realism.json'));
    const recipePath=mode==='original'?'tests/campaign-recipes.json':'tests/realism-recipes.json';
    const replayFolder=mode==='original'?'campaign':'realism';
  for(const [w,h,dpr] of [[1280,720,1],[1012,1050,1.25],[640,360,2],[1920,800,1]]) {
    it(`${mode} contains all authored replay poses and preserves input mapping at ${w}x${h} / ${dpr}`,()=>{
      const renderer=new ClimberRenderer(frameProfile);
      for(const {id} of read(recipePath)) {
        const level=LevelLoader.validateLevel(read(`public/levels/${mode}/${id}.json`));
        const replay=read(`tests/replays/${replayFolder}/${id}.json`);
        const sim=new Simulation(level,frameProfile),camera=new Camera();
        camera.updateViewport(w,h,level.camera,dpr);
        sim.enqueueCommands(replay.commands.map((c:any)=>({...c,pos:c.pos?{x:c.pos[0],y:c.pos[1]}:undefined})));
        for(let tick=0;tick<=replay.commands.at(-1).tick+10;tick++) {
          sim.stepTick();
          if(tick%12)continue;
          const points=renderer.getFramePoints(sim.getLatestSnapshot());
          camera.framePoints([...points,...level.holds.map(v=>({x:v.pos[0],y:v.pos[1]}))]);
          const vp=camera.getViewport();
          for(const p of points) {
            const s=camera.worldToScreen(p);
            expect(s.x).toBeGreaterThan(vp.x+8);expect(s.x).toBeLessThan(vp.x+vp.w-8);
            expect(s.y).toBeGreaterThan(vp.y+8);expect(s.y).toBeLessThan(vp.y+vp.h-8);
            const inverse=camera.screenToWorld(s);
            expect(inverse.x).toBeCloseTo(p.x,8);expect(inverse.y).toBeCloseTo(p.y,8);
          }
        }
      }
    });
  }
  }
  it('keeps dangling legs visible while both hands support the climber',()=>{
    const level=LevelLoader.validateLevel(read('public/levels/original/first_light.json'));
    const sim=new Simulation(level,profile),renderer=new ClimberRenderer(profile),camera=new Camera();
    camera.updateViewport(1280,720,level.camera);
    sim.enqueueCommands(['leftFoot','rightFoot'].map(limb=>({tick:0,type:'drop' as const,limb:limb as 'leftFoot'|'rightFoot'})));
    for(let tick=0;tick<600;tick++) {
      sim.stepTick();const snap=sim.getLatestSnapshot();expect(snap.sessionState).toBe('Playing');
      const points=renderer.getFramePoints(snap);camera.framePoints(points);
      for(const p of points)expect(camera.worldToScreen(p).y).toBeLessThan(720-50);
    }
  });
});

describe('route checkpoints',()=>{
  it('cannot finish early and clears visited contacts on retry',()=>{
    const original=LevelLoader.validateLevel(read('public/levels/original/first_light.json'));
    const level={...original,goals:{checkpoints:['edge']}};
    const sim=new Simulation(level,profile),top=level.holds.find(h=>h.finish)!,edge=level.holds.find(h=>h.id==='edge')!;
    sim.climber.attach('rightHand',top.id,{x:top.pos[0],y:top.pos[1]});sim.stepTick();
    expect(sim.session.getState()).toBe('Playing');
    sim.climber.attach('leftHand',edge.id,{x:edge.pos[0],y:edge.pos[1]});sim.stepTick();
    expect(sim.session.getState()).toBe('Playing');
    sim.climber.attach('leftHand',top.id,{x:top.pos[0],y:top.pos[1]});
    for(let tick=0;tick<42;tick++)sim.stepTick();
    expect(sim.session.getState()).toBe('Finished');expect(sim.getLatestSnapshot().goals.checkpoints).toEqual(['edge']);
    sim.reset();expect(sim.getLatestSnapshot().goals.checkpoints).toEqual([]);
  });
  it('requires an engaged crimp to record its checkpoint',()=>{
    const original=LevelLoader.validateLevel(read('public/levels/original/thin_edge.json'));
    const level={...original,goals:{checkpoints:['edge']}},sim=new Simulation(level,profile),edge=level.holds.find(h=>h.id==='edge')!;
    sim.climber.attach('leftHand',edge.id,{x:edge.pos[0],y:edge.pos[1]});sim.stepTick();
    expect(sim.getLatestSnapshot().goals.checkpoints).toEqual([]);
    sim.enqueueCommand({tick:sim.getTick(),type:'crimp',hand:'leftHand',active:true});sim.stepTick();
    expect(sim.getLatestSnapshot().goals.checkpoints).toEqual(['edge']);
  });
  it('rejects nonexistent and duplicated checkpoint ids',()=>{
    const level=read('public/levels/original/contact.json');
    expect(()=>LevelLoader.validateLevel({...level,goals:{checkpoints:['missing']}})).toThrow();
    expect(()=>LevelLoader.validateLevel({...level,goals:{checkpoints:['edge','edge']}})).toThrow();
  });
});
