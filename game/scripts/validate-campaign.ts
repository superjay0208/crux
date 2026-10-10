import fs from 'node:fs';
import { LevelLoader } from '../src/core/data/levelLoader';
import { Simulation, SimCommand } from '../src/core/sim/Simulation';
import { LimbId, HandId, ReplayCommand } from '../src/core/data/schema';
import { FootReachModel } from '../src/core/rules/FootReachModel';

const profile = LevelLoader.validateProfile(JSON.parse(fs.readFileSync('public/profiles/original_browser.json','utf8')));
const recipes = JSON.parse(fs.readFileSync('tests/campaign-recipes.json','utf8')) as Array<{id:string;steps:Array<{limb:LimbId;hold:string;crimp?:boolean;swap?:boolean}>}>;
const results: any[] = [];
const output = '../validation/web-polish-2026-10-09';
fs.mkdirSync(output,{recursive:true});
fs.mkdirSync('tests/replays/campaign',{recursive:true});
for (const recipe of recipes) {
  const level = LevelLoader.validateLevel(JSON.parse(fs.readFileSync(`public/levels/original/${recipe.id}.json`,'utf8')));
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
    if(action.swap) {
      let ticks=0;
      while(sim.getFootSwapSnapshot()&&!sim.getFootSwapSnapshot()!.inGreen&&ticks++<450) sim.stepTick();
      send({type:'swap_confirm'});
      if(sim.getLatestSnapshot().goals.footSwaps<1){error='swap failed';break;}
    }
    step(8);
  }
  const snapshot=sim.getLatestSnapshot();
  const numbers=[snapshot.torso.pos.x,snapshot.torso.pos.y,snapshot.torso.angle,...Object.values(snapshot.limbs).flatMap(limb=>[limb.pos.x,limb.pos.y])];
  if(numbers.some(value=>!Number.isFinite(value))) error='Non-finite physical state';
  const exitStep=recipe.steps.find(action=>action.hold==='exit');
  if(exitStep&&exitApproachReach) {
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
  fs.copyFileSync(`${output}/${recipe.id}-solution.json`,`tests/replays/campaign/${recipe.id}.json`);
  // Replay the saved inputs on a fresh world to prove the solution does not depend on the
  // authoring runner's local variables or an unrecorded state change.
  const replaySim=new Simulation(level,profile);
  replaySim.enqueueCommands(commands.map(command=>({...command,pos:command.pos?{x:command.pos[0],y:command.pos[1]}:undefined})));
  for(let tick=0;tick<=snapshot.tick+10;tick++) replaySim.stepTick();
  const replaySuccess=replaySim.session.getState()==='Finished'&&replaySim.scoring.getMoves()===snapshot.moves;
  results[results.length-1].replaySuccess=replaySuccess;
  if(!replaySuccess) {results[results.length-1].success=false;results[results.length-1].error='Fresh replay diverged';}
  console.log(`${results.at(-1).success?'PASS':'FAIL'} ${recipe.id}: ${snapshot.moves} moves ${error?.slice(0,450)??''}`);
}
fs.writeFileSync(`${output}/campaign-results.json`,JSON.stringify(results,null,2)+'\n');
if(results.some(result=>!result.success)) process.exitCode=1;
else {
  fs.mkdirSync('public/demos',{recursive:true});
  const ids=['contact','crossover','sequence'];
  for(const id of ids)fs.copyFileSync(`${output}/${id}-solution.json`,`public/demos/${id}.json`);
  fs.writeFileSync('public/demos/playlist.json',JSON.stringify(ids.map(id=>`${id}.json`))+'\n');
}
