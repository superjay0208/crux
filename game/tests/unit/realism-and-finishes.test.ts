import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { FootSupportModel, FootGeometry } from '../../src/core/sim/FootSupportModel';
import { Simulation } from '../../src/core/sim/Simulation';
import { StaminaModel } from '../../src/core/rules/StaminaModel';
import { LevelLoader } from '../../src/core/data/levelLoader';
import { SaveStore } from '../../src/persist/SaveStore';
const read=(file:string)=>JSON.parse(fs.readFileSync(file,'utf8'));
const standard=LevelLoader.validateProfile(read('public/profiles/original_browser.json'));
const realism=LevelLoader.validateProfile(read('public/profiles/realism.json'));
const rules=realism.rules.realism!;
const ticks=(s:Simulation,n:number)=>{for(let i=0;i<n;i++)s.stepTick();};
const make=()=>new Simulation({...LevelLoader.validateLevel(read('public/levels/realism/first_light.json')),goals:{}},realism);
const geometry:FootGeometry={hip:{x:0,y:0},foot:{x:0,y:-1.15},velocity:{x:0,y:0},length:1.575,reachable:true,rotation:0,weight:122.4};

describe('ordinary toe support geometry',()=>{
  it('supports upward weight with a reachable leg beneath its hip',()=>{
    const result=FootSupportModel.evaluateFoot(geometry,rules);
    expect(result.reason).toBe('loaded');expect(result.load).toBeGreaterThan(.3);
    expect(result.force.y).toBeGreaterThan(0);expect(result.force.x).toBe(0);
  });
  it('rejects above-hip, folded, overstretched and excluded contacts',()=>{
    expect(FootSupportModel.evaluateFoot({...geometry,foot:{x:0,y:.3}},rules).reason).toBe('high');
    expect(FootSupportModel.evaluateFoot({...geometry,foot:{x:0,y:-.1}},rules).reason).toBe('folded');
    expect(FootSupportModel.evaluateFoot({...geometry,foot:{x:0,y:-2}},rules).reason).toBe('reach');
    expect(FootSupportModel.evaluateFoot({...geometry,reachable:false},rules).load).toBe(0);
  });
  it('rejects sideways and reversed top surfaces instead of awarding contact-count support',()=>{
    expect(FootSupportModel.evaluateFoot({...geometry,foot:{x:1.2,y:-.3}},rules).reason).toBe('direction');
    expect(FootSupportModel.evaluateFoot({...geometry,rotation:Math.PI},rules).load).toBe(0);
    const centered=FootSupportModel.evaluateFoot(geometry,rules);
    const lateral=FootSupportModel.evaluateFoot({...geometry,foot:{x:.8,y:-.65}},rules);
    expect(lateral.quality).toBeLessThan(centered.quality);
  });
  it('never gives tensile spring force to a straight leg moving away',()=>{
    const result=FootSupportModel.evaluateFoot({...geometry,foot:{x:0,y:-1.575},velocity:{x:0,y:4}},rules);
    expect(result.load).toBe(0);expect(result.force.y).toBe(0);
  });
  it('keeps steered stance forces within a rotated hold cone and its strength cap',()=>{
    const sim=make();sim.level.holds.filter(h=>h.allowFeet).forEach(h=>h.rot=.7);
    const stance=FootSupportModel.evaluate(sim.climber,sim.level,rules);
    for(const foot of Object.values(stance.feet)){
      const normal=-Math.sin(.7)*foot.force.x+Math.cos(.7)*foot.force.y;
      const tangent=Math.cos(.7)*foot.force.x+Math.sin(.7)*foot.force.y;
      expect(normal).toBeGreaterThanOrEqual(0);expect(Math.abs(tangent)).toBeLessThanOrEqual(rules.footFriction*normal+1e-8);
      expect(Math.hypot(foot.force.x,foot.force.y)).toBeLessThanOrEqual(geometry.weight*rules.legForceCap*foot.quality+1e-8);
    }
    expect(FootSupportModel.evaluateFoot({...geometry,weight:0},rules).load).toBe(0);
    expect(FootSupportModel.evaluateFoot({...geometry,velocity:{x:NaN,y:0}},rules).force).toEqual({x:0,y:0});
  });
  it('removes attached-foot ropes and restores free-leg anatomical constraints',()=>{
    const sim=make();expect(sim.climber.limbs.leftFoot.joint).toBeNull();
    expect(sim.climber.limbs.rightFoot.joint).toBeNull();expect(sim.world.getJointCount()).toBe(2);
    sim.climber.release('leftFoot');expect(sim.climber.limbs.leftFoot.joint).not.toBeNull();
    expect(sim.world.getJointCount()).toBe(3);
  });
  it('invalid feet detach after reach grace and cannot hang the torso from a toe',()=>{
    const sim=make();
    sim.climber.attach('leftFoot','left_foot',{x:7,y:7});
    ticks(sim,Math.ceil(rules.footReachGraceSeconds*120)+2);
    expect(sim.climber.limbs.leftFoot.status).toBe('free');
    expect(sim.getLatestSnapshot().support!.feet.leftFoot.load).toBe(0);
  });
  it('settles to finite useful support and does not self-flip while idle',()=>{
    const sim=make();ticks(sim,1200);
    const snap=sim.getLatestSnapshot();expect(snap.sessionState).toBe('Playing');
    expect(snap.support!.footLoad).toBeGreaterThan(.25);expect(snap.support!.footLoad).toBeLessThanOrEqual(.92);
    expect(Math.abs(snap.torso.angle)).toBeLessThan(.5);
    expect(Object.values(snap.support!.feet).every(f=>Number.isFinite(f.load)&&f.force.y>=0)).toBe(true);
  });
});

describe('persistent fatigue and qualified rests',()=>{
  it('drains slowly while still and spends more while moving, with no passive refill',()=>{
    const still=new StaminaModel(realism),moving=new StaminaModel(realism);
    still.spend(.3);moving.spend(.3);
    for(let i=0;i<120;i++) {
      still.updateRealism(1/120,false,0,.5,false,0,false);
      moving.updateRealism(1/120,true,1,.5,false,0,false);
    }
    expect(still.getValue()).toBeLessThan(.7);expect(still.getValue()).toBeGreaterThan(.69);
    expect(moving.getValue()).toBeLessThan(still.getValue()-.08);
  });
  it('useful feet reduce arm demand and fatigue relative to cutting feet',()=>{
    const loaded=new StaminaModel(realism),cut=new StaminaModel(realism);
    for(let i=0;i<1200;i++) {
      loaded.updateRealism(1/120,false,0,.2,false,0,false);
      cut.updateRealism(1/120,false,0,1,true,0,false);
    }
    expect(loaded.getValue()).toBeGreaterThan(cut.getValue()+.1);
  });
  it('charges an action cost even when the pointer barely moves',()=>{
    const sim=make();ticks(sim,180);const before=sim.stamina.getValue();
    sim.enqueueCommand({tick:sim.getTick(),type:'down',limb:'leftHand',pos:sim.climber.getLimbPosition('leftHand')});sim.stepTick();
    expect(sim.stamina.getValue()).toBeLessThan(before-rules.handMoveCost);
  });
  it('recovers while one hand is released and the other jug and feet remain useful',()=>{
    const sim=make();ticks(sim,240);sim.stamina.spend(.45);const before=sim.stamina.getValue();
    sim.enqueueCommand({tick:sim.getTick(),type:'shake',hand:'leftHand',active:true});ticks(sim,240);
    expect(sim.getLatestSnapshot().shake).toEqual({hand:'leftHand',active:true,recovering:true});
    expect(sim.climber.limbs.leftHand.status).toBe('free');expect(sim.climber.limbs.rightHand.status).toBe('attached');
    expect(sim.stamina.getValue()).toBeGreaterThan(before+.06);
    sim.enqueueCommand({tick:sim.getTick(),type:'shake',hand:'leftHand',active:false});sim.stepTick();
    expect(sim.getLatestSnapshot().shake.hand).toBeNull();
  });
  it('does not release the last hand or recover on unsupported feet or a crimp',()=>{
    const sim=make();ticks(sim,240);sim.climber.release('rightHand');
    sim.enqueueCommand({tick:sim.getTick(),type:'shake',hand:'leftHand',active:true});sim.stepTick();
    expect(sim.climber.limbs.leftHand.status).toBe('attached');expect(sim.getLatestSnapshot().shake.active).toBe(false);
    const unsupported=make();unsupported.climber.release('leftFoot');unsupported.climber.release('rightFoot');
    unsupported.enqueueCommand({tick:0,type:'shake',hand:'leftHand',active:true});unsupported.stepTick();
    expect(unsupported.getLatestSnapshot().shake.active).toBe(false);
    const crimp=make();ticks(crimp,180);crimp.level.holds.find(h=>h.id==='start_right')!.grip='crimp';
    crimp.enqueueCommands([{tick:crimp.getTick(),type:'crimp',hand:'rightHand',active:true},
      {tick:crimp.getTick(),type:'shake',hand:'leftHand',active:true}]);crimp.stepTick();
    expect(crimp.getLatestSnapshot().shake.active).toBe(false);
  });
  it('losing foot support immediately stops recovery and retry clears every resource/input',()=>{
    const sim=make();ticks(sim,240);sim.stamina.spend(.4);
    sim.enqueueCommand({tick:sim.getTick(),type:'shake',hand:'leftHand',active:true});ticks(sim,30);
    expect(sim.getLatestSnapshot().shake.recovering).toBe(true);
    sim.climber.release('leftFoot');sim.climber.release('rightFoot');const before=sim.stamina.getValue();ticks(sim,30);
    expect(sim.getLatestSnapshot().shake.recovering).toBe(false);expect(sim.stamina.getValue()).toBeLessThan(before);
    sim.reset();expect(sim.getLatestSnapshot().shake.hand).toBeNull();expect(sim.stamina.getValue()).toBe(1);
    expect(sim.getLatestSnapshot().finish.progress).toBe(0);expect(sim.world.getJointCount()).toBe(2);
  });
  it('exhaustion falls once and cannot recover while falling',()=>{
    const sim=make();let exhausted=0;sim.session.addListener(e=>{if(e.type==='Exhausted')exhausted++;});
    sim.stamina.spend(1);ticks(sim,5);expect(sim.session.getState()).toBe('Falling');expect(exhausted).toBe(1);
    expect(sim.stamina.getValue()).toBe(0);
  });
});

describe('secure matched finishes',()=>{
  const create=()=>new Simulation({...LevelLoader.validateLevel(read('public/levels/original/first_light.json')),goals:{}},standard);
  it('requires both hands and a continuous establishment interval',()=>{
    const sim=create(),hold=sim.level.holds.find(h=>h.finish)!;
    sim.climber.attach('rightHand',hold.id,{x:hold.pos[0],y:hold.pos[1]});ticks(sim,60);
    expect(sim.session.getState()).toBe('Playing');expect(sim.getLatestSnapshot().finish.hands).toBe(1);
    sim.climber.attach('leftHand',hold.id,{x:hold.pos[0],y:hold.pos[1]});ticks(sim,20);
    expect(sim.session.getState()).toBe('Playing');expect(sim.getLatestSnapshot().finish.progress).toBeGreaterThan(0);
    sim.climber.release('leftHand');sim.stepTick();expect(sim.getLatestSnapshot().finish.progress).toBe(0);
    sim.climber.attach('leftHand',hold.id,{x:hold.pos[0],y:hold.pos[1]});ticks(sim,42);
    expect(sim.session.getState()).toBe('Finished');
  });
  it('realism cannot establish a match with both feet cut',()=>{
    const sim=make(),hold=sim.level.holds.find(h=>h.finish)!;
    sim.climber.release('leftFoot');sim.climber.release('rightFoot');
    sim.climber.attach('leftHand',hold.id,{x:hold.pos[0],y:hold.pos[1]});
    sim.climber.attach('rightHand',hold.id,{x:hold.pos[0],y:hold.pos[1]});ticks(sim,60);
    expect(sim.session.getState()).toBe('Playing');expect(sim.getLatestSnapshot().finish.progress).toBe(0);
  });
});

describe('mode contracts and saves',()=>{
  it('preserves old standard progress and isolates realism unlocks',()=>{
    const store=new SaveStore();store.importJson(JSON.stringify({schemaVersion:1,profiles:{original_browser:{levels:{first_light:{completed:true,star:true,bestMoves:1,bestTimeSeconds:1}}}},settings:{master:.5}}));
    store.setCampaign([{id:'first_light',order:1,group:'CAMPAIGN'},{id:'thin_edge',order:2,group:'CAMPAIGN'}]);
    expect(store.isLevelUnlocked('original_browser','thin_edge',2)).toBe(true);
    expect(store.isLevelUnlocked('realism','thin_edge',2)).toBe(false);
    store.recordCompletion('realism','first_light',4,10,true);expect(store.isLevelUnlocked('realism','thin_edge',2)).toBe(true);
    expect(store.getLevelRecord('original_browser','first_light')!.bestMoves).toBe(1);
    store.setSelectedProfile('realism');expect(store.getSelectedProfile()).toBe('realism');
  });
  it('rejects impossible or non-finite realism tuning and one-hand-only finish assets',()=>{
    const invalid=structuredClone(realism);invalid.rules.realism!.restMinFootLoad=2;
    expect(()=>LevelLoader.validateProfile(invalid)).toThrow();
    invalid.rules.realism!.restMinFootLoad=NaN;expect(()=>LevelLoader.validateProfile(invalid)).toThrow();
    const level=read('public/levels/realism/first_light.json');level.holds.find((h:any)=>h.finish).capacity=1;
    expect(()=>LevelLoader.validateLevel(level)).toThrow();
  });
});
