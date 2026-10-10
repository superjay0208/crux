import fs from 'node:fs';
import path from 'node:path';

const names=[['first_light','FIRST LIGHT'],['thin_edge','THIN EDGE'],['switchback','SWITCHBACK'],
  ['contact','CONTACT'],['sidewinder','SIDEWINDER'],['balance','BALANCE'],['crossover','CROSSOVER'],
  ['pinpoint','PINPOINT'],['chalk_line','CHALK LINE'],['offset','OFFSET'],['sequence','SEQUENCE'],['crux','CRUX']];
const polygons={jug:[[-.28,-.12],[-.18,-.25],[.10,-.24],[.30,-.07],[.24,.17],[.06,.25],[-.21,.17]],
  crimp:[[-.30,-.055],[.28,-.055],[.31,.065],[-.28,.09]],foot:[[-.16,-.07],[.15,-.07],[.12,.10],[-.12,.12]]};
const folder='public/levels/original';fs.mkdirSync(folder,{recursive:true});
const recipes=[];

// Individually authored upper sequences, after the three mechanic introductions.
// [limb, hold, x, y, grip]; occupied foot contacts use the swap flag.
const upper=[
  [],[],[],
  [['rightHand','rest',.95,1.05,'jug'],['leftHand','ledge',-.2,1.8,'jug']],
  [['rightHand','rest',1.0,.9,'jug'],['leftHand','ledge',.05,1.8,'jug'],['rightFoot','high_step',.85,-.65,'foot']],
  [['rightHand','rest',.85,1.2,'jug'],['leftFoot','balance_step',-.2,-.75,'foot'],['leftHand','ledge',-.35,1.95,'jug']],
  [['rightHand','rest',1.0,1.1,'jug'],['leftHand','ledge',1.1,1.95,'jug'],['leftFoot','exit',1.26,-1.15,'foot','swap'],['rightFoot','far_step',1.65,-.55,'foot']],
  [['rightHand','rest',.75,1.2,'jug'],['leftHand','ledge',-.4,1.9,'jug'],['rightFoot','high_step',.8,-.55,'foot'],['rightHand','needle',.9,1.9,'crimp']],
  [['rightHand','rest',.95,1.0,'jug'],['leftHand','ledge',-.2,1.8,'jug'],['rightFoot','high_step',.9,-.65,'foot'],['rightHand','needle',1.1,1.9,'crimp'],['leftHand','upper_rest',.1,2.45,'jug'],['rightHand','last_jug',1.15,2.6,'jug']],
  [['rightHand','rest',1.05,1.2,'jug'],['leftHand','ledge',1.2,1.65,'jug'],['leftFoot','exit',1.3,-1.2,'foot','swap'],['rightFoot','far_step',1.6,-.55,'foot'],['rightHand','needle',1.45,1.85,'crimp'],['leftHand','upper_rest',.75,2.25,'jug']],
  [['rightHand','rest',.85,1.1,'jug'],['leftHand','ledge',-.3,1.8,'jug'],['rightFoot','high_step',.85,-.6,'foot'],['rightHand','needle',1.05,1.9,'crimp'],['leftHand','upper_rest',-.05,2.45,'jug'],['leftFoot','pivot_high',.35,-.35,'foot'],['rightFoot','pivot_high',.35,-.35,'foot','swap'],['leftFoot','left_high',-.55,-.1,'foot'],['rightHand','last_jug',1.05,2.6,'jug']],
  [['rightHand','rest',1.0,1.1,'jug'],['leftHand','ledge',.0,1.85,'jug'],['rightFoot','high_step',1.0,-.65,'foot'],['rightHand','needle',1.2,2.0,'crimp'],['leftHand','upper_rest',.2,2.55,'jug'],['leftFoot','pivot_high',.5,-.3,'foot'],['rightFoot','pivot_high',.5,-.3,'foot','swap'],['leftFoot','left_high',-.45,-.05,'foot'],['rightHand','last_jug',1.25,2.65,'jug'],['leftHand','final_edge',.25,3.05,'crimp'],['rightFoot','final_step',.8,.1,'foot']]
];
const descriptions=['Jugs and an easy finish.','Secure the amber edge.','Free the outside leg.',
  'Grip transfer to the upper ledge.','A sideways traverse and a high step.','Bring the inside foot up before reaching.',
  'Two swaps open the rightward traverse.','A narrow double-edge finish.','Recover on jugs between edges.',
  'Off-center reach with two support transfers.','Two pivot heights and a leftward finish.','A long chain of edges and support changes.'];

for(let i=0;i<names.length;i++) {
  const [id,name]=names[i],order=i+1,crimp=order===2||order>=4,swap=order>=3;
  const mirror=[5,6,9,11].includes(order)?-1:1;
  const mapLimb=limb=>mirror===1?limb:limb.replace(/left|right/,side=>side==='left'?'right':'left');
  const make=(id,x,y,kind='jug',finish=false)=>({id,shape:kind,grip:kind==='crimp'?'crimp':'jug',
    color:finish?'#eff0d9':kind==='crimp'?'#ffb86b':kind==='foot'?'#90a7be':'#8cdec1',
    pos:[x*mirror,y],rot:kind==='crimp'?(order%3-1)*.12:kind==='foot'?-.05*mirror:0,
    scale:kind==='crimp'&&order>=8?.85:1,capacity:finish?2:1,allowHands:kind!=='foot',allowFeet:kind==='foot',finish,outline:polygons[kind]});
  const holds=[make('start_left',-.65,.35),make('start_right',.65,.35),make('left_foot',-.6,-1.25,'foot'),make('pivot',.18,-1.25,'foot'),
    make('edge',-.78,1.06,crimp?'crimp':'jug'),make('exit',order===7?1.26:order===10?1.3:1.28,order===7?-1.15:order===10?-1.2:-1.25,'foot')];
  const steps=[];
  if(swap)steps.push({limb:mapLimb('leftFoot'),hold:'pivot',swap:true},{limb:mapLimb('rightFoot'),hold:'exit'});
  if(crimp)steps.push({limb:mapLimb('leftHand'),hold:'edge',crimp:true});
  const checkpoints=[];
  for(const [limb,h,x,y,kind,action] of upper[i]) {
    if(!holds.some(hold=>hold.id===h))holds.push(make(h,x,y,kind));
    steps.push({limb:mapLimb(limb),hold:h,...(kind==='crimp'?{crimp:true}:{}),...(action==='swap'?{swap:true}:{})});
    if(!checkpoints.includes(h)&&h!=='exit')checkpoints.push(h);
  }
  const topPositions=[[.6,1.6],[.6,1.6],[.6,1.6],[.7,2.05],[.8,2.25],[.5,2.3],[1.15,2.4],[.2,2.5],[.55,3.1],[1.2,2.85],[.15,3.05],[.95,3.5]];
  holds.push(make('top',...topPositions[i],'jug',true));
  // Pinpoint's finish itself is a crimp; both hands must secure the match.
  if(order===8){const top=holds.at(-1);top.grip='crimp';top.shape='crimp';top.outline=polygons.crimp;}
  steps.push({limb:mapLimb(order===8||order===11?'leftHand':'rightHand'),hold:'top',...(order===8?{crimp:true}:{})});
  steps.push({limb:mapLimb(order===8||order===11?'rightHand':'leftHand'),hold:'top',...(order===8?{crimp:true}:{})});
  const level={schemaVersion:1,id,profile:'original_browser',name,group:'CAMPAIGN',order,
    camera:{center:[0,order>=9?.8:.25],height:8.7,aspect:16/9},holds,
    start:{leftHand:mirror===1?'start_left':'start_right',rightHand:mirror===1?'start_right':'start_left',leftFoot:mirror===1?'left_foot':'pivot',rightFoot:mirror===1?'pivot':'left_foot'},
    targets:{moves:steps.length,timeSeconds:null,elimination:null},movement:{crossedReachFraction:.64,crossTransition:.55},
    goals:{...(crimp?{crimpHold:'edge'}:{}),...(swap?{footSwaps:steps.filter(s=>s.swap).length}:{}),...(checkpoints.length?{checkpoints}:{})},
    ...(swap?{finishSupportHold:order>=11?'left_high':order===7||order===10?'far_step':order===5||order===8||order===9?'high_step':'exit'}:{}),
    tutorial:[{type:'text',text:descriptions[i]}],sourceConfidence:'authored',sourceNotes:'Original Crux routes with validated grip and support sequences.'};
  fs.writeFileSync(path.join(folder,`${id}.json`),JSON.stringify(level,null,2)+'\n');recipes.push({id,steps});
}
fs.writeFileSync('tests/campaign-recipes.json',JSON.stringify(recipes,null,2)+'\n');
for(const name of ['original_browser','desktop']) {
  const file=`public/profiles/${name}.json`,profile=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  profile.rules.finishRequires='two_hands';profile.rules.finishEstablishSeconds=.35;
  Object.assign(profile.rules.stamina,{drainBase:.30,effortGain:.65,refillPerSecond:.22});
  Object.assign(profile.rules.crimp,{drainPerSecond:.25,recoverPerSecond:.16,openGripGraceSeconds:.4,reengageFraction:.2});
  Object.assign(profile.rules.footSwap,{windowSeconds:2.4,revolutionsPerSecond:.8,targetCenter:.5,targetWidth:.14});
  Object.assign(profile.visual.palette,{wall:'#202c35',skin:'#d5aa88',shirt:'#62bea8',shorts:'#152129',shoes:'#cedcd1'});
  fs.writeFileSync(file,JSON.stringify(profile,null,2)+'\n');
}
const realism=JSON.parse(fs.readFileSync('public/profiles/original_browser.json','utf8'));
realism.id='realism';
Object.assign(realism.rules.crimp,{drainPerSecond:.2,recoverPerSecond:.18,openGripGraceSeconds:.45});
realism.rules.realism={idleDrain:.0015,armLoadDrain:.008,moveDrain:.055,handMoveCost:.018,footMoveCost:.012,
  shakeRecover:.045,restMinFootLoad:.25,restMaxSpeed:.8,finishMinFootLoad:.15,
  legStiffness:220,legDamping:18,legForceCap:.9,footFriction:1.25,footReachGraceSeconds:.22};
fs.writeFileSync('public/profiles/realism.json',JSON.stringify(realism,null,2)+'\n');

// The same route identities with upward foot progression for the compressive-leg model.
const realismFolder='public/levels/realism';fs.mkdirSync(realismFolder,{recursive:true});
const realismRecipes=[];
for(const recipe of recipes) {
  const level=JSON.parse(fs.readFileSync(`${folder}/${recipe.id}.json`,'utf8'));
  level.profile='realism';level.movement.crossedReachFraction=.82;
  level.holds.find(h=>h.id==='exit').pos[1]=-.85;
  const steps=[];let stanceHeight=-1.25,stanceIndex=0,lastStance=null;
  let jugX=level.holds.find(h=>h.id===level.start.rightHand).pos[0];
  const movedFeet=new Set();
  for(const action of recipe.steps) {
    const h=level.holds.find(h=>h.id===action.hold);
    if(action.limb.endsWith('Foot')&&!['pivot','exit','left_foot'].includes(h.id)&&!movedFeet.has(h.id)) {
      h.pos[0]=jugX+(action.limb==='rightFoot'?.38:-.38);movedFeet.add(h.id);
      if(h.id==='final_step'){h.pos[0]=.65;h.pos[1]=.65;}
    }
    if(action.limb.endsWith('Hand')&&h.grip==='jug')jugX=h.pos[0];
  }
  jugX=level.holds.find(h=>h.id===level.start.rightHand).pos[0];
  const footContacts={leftFoot:level.start.leftFoot,rightFoot:level.start.rightFoot};
  for(const [actionIndex,action] of recipe.steps.entries()) {
    const hold=level.holds.find(h=>h.id===action.hold);
    // Establish the next stance before committing to a short-lived crimp. Look only
    // one hand move ahead so feet cannot skip an entire section of the route.
    const followingHand=recipe.steps.slice(actionIndex+1).find(s=>s.limb.endsWith('Hand'));
    const followingHold=followingHand&&level.holds.find(h=>h.id===followingHand.hold);
    const previewHeight=Math.max(hold.pos[1],hold.grip==='crimp'&&followingHold?followingHold.pos[1]:hold.pos[1])-2.6;
    // A high step staged too far above the current stance is unweightable. Keep an
    // intermediate stance instead of skipping it to shorten a crimp sequence.
    const nextHeight=previewHeight-stanceHeight>.75?hold.pos[1]-2.6:previewHeight;
    if(action.limb.endsWith('Hand') && nextHeight>stanceHeight+.24) {
      stanceIndex++;
      const baseFeet=Object.values(footContacts).filter(Boolean).map(id=>level.holds.find(h=>h.id===id).pos[0]);
      const baseX=baseFeet.reduce((a,b)=>a+b,0)/baseFeet.length;
      const stanceX=Math.max(baseX-.55,Math.min(baseX+.55,jugX));
      for(const [foot,offset] of [['leftFoot',-.42],['rightFoot',.42]]) {
        let id=`stance_${stanceIndex}_${foot}`,x=stanceX+offset,y=nextHeight;
        const other=foot==='rightFoot'?'leftFoot':'rightFoot';
        const nearby=level.holds.find(h=>h.allowFeet&&Math.hypot(h.pos[0]-x,h.pos[1]-y)<.4);
        if(nearby&&footContacts[other]!==nearby.id)id=nearby.id;
        else {
          // Distinct contact targets must stay visually/pickably separated.
          for(let n=0;n<8&&level.holds.some(h=>h.allowFeet&&Math.hypot(h.pos[0]-x,h.pos[1]-y)<.4);n++)y+=.32;
          level.holds.push({id,shape:'foot',grip:'jug',color:'#90a7be',pos:[x,y],rot:0,
            scale:1,capacity:1,allowHands:false,allowFeet:true,finish:false,outline:polygons.foot});
        }
        if(footContacts[foot]!==id)steps.push({limb:foot,hold:id});
        footContacts[foot]=id;lastStance=id;
      }
      stanceHeight=nextHeight;
    }
    if(action.limb.endsWith('Foot')) {
      const other=action.limb==='rightFoot'?'leftFoot':'rightFoot';
      const swapNeeded=footContacts[other]===action.hold;
      if(footContacts[action.limb]!==action.hold)steps.push({...action,swap:swapNeeded});
      footContacts[action.limb]=action.hold;if(swapNeeded)footContacts[other]=null;
    } else steps.push(action);
    if(action.limb.endsWith('Hand') && hold.grip==='jug') jugX=hold.pos[0];
  }
  delete level.finishSupportHold;
  level.goals.checkpoints=[...new Set([...(level.goals.checkpoints??[]),...steps.filter(s=>s.limb.endsWith('Foot')).map(s=>s.hold)])];
  level.goals.footSwaps=steps.filter(s=>s.swap).length;
  level.targets.moves=steps.length;
  level.sourceNotes='Crux realism variant: compressive toe support and staged upward footholds.';
  fs.writeFileSync(`${realismFolder}/${recipe.id}.json`,JSON.stringify(level,null,2)+'\n');
  realismRecipes.push({id:recipe.id,steps});
}
fs.writeFileSync('tests/realism-recipes.json',JSON.stringify(realismRecipes,null,2)+'\n');
for(const name of ['lab','grip_lab']) {
  const file=`${folder}/${name}.json`,level=JSON.parse(fs.readFileSync(file,'utf8'));
  level.camera.height=Math.max(8.7,level.camera.height);
  level.holds.find(h=>h.finish).capacity=2;
  for(const hold of level.holds)hold.color=hold.finish?'#eff0d9':hold.grip==='crimp'?'#ffb86b':hold.allowHands?'#8cdec1':'#90a7be';
  fs.writeFileSync(file,JSON.stringify(level,null,2)+'\n');
  const variant=structuredClone(level);variant.profile='realism';
  fs.writeFileSync(`${realismFolder}/${name}.json`,JSON.stringify(variant,null,2)+'\n');
}
console.log('Authored 12 distinct Crux routes and matching solution recipes.');
