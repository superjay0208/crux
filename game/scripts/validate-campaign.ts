import fs from 'node:fs';
import { LevelLoader } from '../src/core/data/levelLoader';
import { Simulation, SimCommand } from '../src/core/sim/Simulation';
import { LimbId, HandId, ReplayCommand } from '../src/core/data/schema';
import { FootReachModel } from '../src/core/rules/FootReachModel';

const realism = process.argv.includes('--realism');
const profile = LevelLoader.validateProfile(JSON.parse(fs.readFileSync(`public/profiles/${realism?'realism':'original_browser'}.json`,'utf8')));
const recipes = JSON.parse(fs.readFileSync(`tests/${realism?'realism-recipes':'campaign-recipes'}.json`,'utf8')) as Array<{id:string;steps:Array<{limb:LimbId;hold:string;crimp?:boolean;swap?:boolean}>}>;
const results: any[] = [];
const output = `../validation/fatigue-realism-2026-10-09/${realism?'realism':'standard'}`;
const replayFolder = `tests/replays/${realism?'realism':'campaign'}`;
fs.mkdirSync(output,{recursive:true});
fs.mkdirSync(replayFolder,{recursive:true});
for (const recipe of recipes) {
  const requested = process.argv.find(a=>a.startsWith('--level='))?.slice(8);
  if(requested && requested!==recipe.id)continue;
  const level = LevelLoader.validateLevel(JSON.parse(fs.readFileSync(`public/levels/${realism?'realism':'original'}/${recipe.id}.json`,'utf8')));
  const sim = new Simulation(level,profile);
  const commands: ReplayCommand[] = [];
  const send = (command: Omit<SimCommand,'tick'>) => {
    const tick=sim.getTick();
    sim.enqueueCommand({...command,tick});
    commands.push({...command,tick,pos:command.pos?[command.pos.x,command.pos.y]:undefined} as ReplayCommand);
    sim.stepTick();
  };
  const step = (n:number) => { for(let t=0;t<n;t++) sim.stepTick(); };
  step(30);
  let error:string|null=null;
  let exitApproachReach: Record<string,boolean>|null=null;
  for (const action of recipe.steps) {
    if (realism && action.limb.endsWith('Hand') && sim.stamina.getValue() < .6) {
      const other=action.limb==='leftHand'?'rightHand':'leftHand';
      const contact=sim.climber.getLimb(other),hold=level.holds.find(h=>h.id===contact.holdId);
      if(contact.status==='attached'&&hold?.grip==='jug'&&(sim.getLatestSnapshot().support?.footLoad??0)>.25) {
        step(120);
        send({type:'shake',hand:action.limb as HandId,active:true});
        for(let rest=0;rest<1800&&sim.stamina.getValue()<.92&&sim.getLatestSnapshot().shake.active;rest++)sim.stepTick();
        send({type:'shake',hand:action.limb as HandId,active:false});
      }
    }
    if (!realism && sim.stamina.getValue() < .7) {
      for (let rest=0;rest<600 && sim.stamina.getValue()<.95;rest++) {
        const crimp=sim.crimp.snapshot();
        if (Object.values(crimp).some(h=>h.onCrimp&&h.availableSeconds<1.4)) break;
        sim.stepTick();
      }
    }
    const hold=level.holds.find(h=>h.id===action.hold)!;
    if(action.crimp) send({type:'crimp',hand:action.limb as HandId,active:true});
    else if(action.limb.endsWith('Hand')) send({type:'crimp',hand:action.limb as HandId,active:false});
    const start=sim.climber.getLimbPosition(action.limb);
    send({type:'down',limb:action.limb,pos:start});
    for(let t=1;t<=60;t++) {
      const fraction=t/60; const eased=fraction*fraction*(3-2*fraction);
      send({type:'move',pos:{x:start.x+(hold.pos[0]-start.x)*eased,y:start.y+(hold.pos[1]-start.y)*eased}});
    }
    let reached=false;
    for(let wait=0;wait<240;wait++) {
      const snap=sim.getLatestSnapshot();
      if(snap.hoverCandidateHoldId===hold.id||snap.hoverFootSwapHoldId===hold.id){ reached=true;break; }
      sim.stepTick();
    }
    if(!reached) { error=`${action.limb} could not reach ${hold.id}; ${JSON.stringify(sim.getLatestSnapshot())}`;break; }
    if(action.hold==='exit'&&!action.swap&&!exitApproachReach) exitApproachReach=Object.fromEntries((['leftFoot','rightFoot'] as const).map(foot=>[foot,FootReachModel.canReach(foot,sim.climber.getLimbPosition(action.limb),sim.climber.getAnchorWorld(foot),sim.climber.getTorsoAngle(),profile.physics.legReach,level.movement)]));
    send({type:'up'});
    if(sim.getFootSwapSnapshot()) {
      let ticks=0;
      while(sim.getFootSwapSnapshot()&&!sim.getFootSwapSnapshot()!.inGreen&&ticks++<450) sim.stepTick();
      send({type:'swap_confirm'});
      if(sim.getLatestSnapshot().goals.footSwaps<1){error='swap failed';break;}
    }
    step(realism && action.limb.endsWith('Foot') ? 80 : 8);
    if(process.argv.includes('--trace')) {const s=sim.getLatestSnapshot();console.log(action.limb,action.hold,JSON.stringify({torso:s.torso,feet:s.support,holds:Object.fromEntries(Object.entries(s.limbs).map(([k,v])=>[k,v.holdId])),fatigue:s.stamina}));}
  }
  step(60);
  const snapshot=sim.getLatestSnapshot();
  const numbers=[snapshot.torso.pos.x,snapshot.torso.pos.y,snapshot.torso.angle,...Object.values(snapshot.limbs).flatMap(limb=>[limb.pos.x,limb.pos.y])];
  if(numbers.some(value=>!Number.isFinite(value))) error='Non-finite physical state';
  const exitStep=recipe.steps.find(action=>action.hold==='exit');
  if(!realism&&exitStep&&exitApproachReach) {
    const correct=exitStep.limb==='rightFoot'?'rightFoot':'leftFoot';
    const crossed=correct==='rightFoot'?'leftFoot':'rightFoot';
    if(!exitApproachReach[correct]||exitApproachReach[crossed]) error='Exit approach failed to distinguish the freed leg from the crossed leg';
  }
  const success=!error&&snapshot.sessionState==='Finished';
  if(!success&&!error) error=`Did not finish: ${JSON.stringify(snapshot)}`;
  const exit=level.holds.find(h=>h.id==='exit')!;
  const exitReach=Object.fromEntries((['leftFoot','rightFoot'] as const).map(foot=>[foot,FootReachModel.canReach(foot,{x:exit.pos[0],y:exit.pos[1]},sim.climber.getAnchorWorld(foot),sim.climber.getTorsoAngle(),profile.physics.legReach,level.movement)]));
  results.push({level:recipe.id,success,moves:snapshot.moves,tick:snapshot.tick,goals:snapshot.goals,exitApproachReach,exitReach,torso:snapshot.torso,footAnchors:{left:sim.climber.getAnchorWorld('leftFoot'),right:sim.climber.getAnchorWorld('rightFoot')},error});
  fs.writeFileSync(`${output}/${recipe.id}-solution.json`,JSON.stringify({schemaVersion:1,profile:profile.id,levelId:recipe.id,physicsHz:120,commands,expected:{moves:snapshot.moves}},null,2)+'\n');
  if(success) fs.copyFileSync(`${output}/${recipe.id}-solution.json`,`${replayFolder}/${recipe.id}.json`);
  // Replay the saved inputs on a fresh world to prove the solution does not depend on the
  // authoring runner's local variables or an unrecorded state change.
  const replaySim=new Simulation(level,profile);
  replaySim.enqueueCommands(commands.map(command=>({...command,pos:command.pos?{x:command.pos[0],y:command.pos[1]}:undefined})));
  for(let tick=0;tick<=snapshot.tick+10;tick++) replaySim.stepTick();
  const replaySuccess=replaySim.session.getState()==='Finished'&&replaySim.scoring.getMoves()===snapshot.moves;
  results[results.length-1].replaySuccess=replaySuccess;
  if(success&&!replaySuccess) {results[results.length-1].success=false;results[results.length-1].error='Fresh replay diverged';}
  console.log(`${results.at(-1).success?'PASS':'FAIL'} ${recipe.id}: ${snapshot.moves} moves ${error?.slice(0,450)??''}`);
}
fs.writeFileSync(`${output}/campaign-results.json`,JSON.stringify(results,null,2)+'\n');
if(results.some(result=>!result.success)) process.exitCode=1;
else if(!process.argv.some(a=>a.startsWith('--level='))) {
  const demoFolder=realism?'public/demos/realism':'public/demos';
  fs.mkdirSync(demoFolder,{recursive:true});
  const ids=['contact','crossover','sequence'];
  for(const id of ids)fs.copyFileSync(`${output}/${id}-solution.json`,`${demoFolder}/${id}.json`);
  fs.writeFileSync(`${demoFolder}/playlist.json`,JSON.stringify(ids.map(id=>`${id}.json`))+'\n');
}
