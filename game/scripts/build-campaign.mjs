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
  [['rightHand','rest',1.0,1.1,'jug'],['leftFoot','exit',1.26,-1.15,'foot','swap'],['rightFoot','far_step',1.65,-.55,'foot'],['leftHand','ledge',.15,1.95,'jug']],
  [['rightHand','rest',.75,1.2,'jug'],['leftHand','ledge',-.4,1.9,'jug'],['rightHand','needle',.9,1.9,'crimp'],['rightFoot','high_step',.8,-.55,'foot']],
  [['rightHand','rest',.95,1.0,'jug'],['leftHand','ledge',-.2,1.8,'jug'],['rightFoot','high_step',.9,-.65,'foot'],['rightHand','needle',1.1,1.9,'crimp'],['leftHand','upper_rest',.1,2.45,'jug'],['rightHand','last_jug',1.15,2.6,'jug']],
  [['rightHand','rest',1.05,1.2,'jug'],['leftFoot','exit',1.3,-1.2,'foot','swap'],['rightFoot','far_step',1.6,-.55,'foot'],['leftHand','ledge',.25,1.65,'jug'],['rightHand','needle',1.45,1.85,'crimp'],['leftHand','upper_rest',.75,2.25,'jug']],
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
  // Pinpoint's finish itself is a crimp; the other hand remains on the ledge.
  if(order===8){const top=holds.at(-1);top.grip='crimp';top.shape='crimp';top.outline=polygons.crimp;}
  steps.push({limb:mapLimb(order===8||order===11?'leftHand':'rightHand'),hold:'top',...(order===8?{crimp:true}:{})});
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
  Object.assign(profile.rules.footSwap,{windowSeconds:3.6,revolutionsPerSecond:.55,targetCenter:.5,targetWidth:.22});
  Object.assign(profile.visual.palette,{wall:'#202c35',skin:'#d5aa88',shirt:'#62bea8',shorts:'#152129',shoes:'#cedcd1'});
  fs.writeFileSync(file,JSON.stringify(profile,null,2)+'\n');
}
for(const name of ['lab','grip_lab']) {
  const file=`${folder}/${name}.json`,level=JSON.parse(fs.readFileSync(file,'utf8'));
  level.camera.height=Math.max(8.7,level.camera.height);
  for(const hold of level.holds)hold.color=hold.finish?'#eff0d9':hold.grip==='crimp'?'#ffb86b':hold.allowHands?'#8cdec1':'#90a7be';
  fs.writeFileSync(file,JSON.stringify(level,null,2)+'\n');
}
console.log('Authored 12 distinct Crux routes and matching solution recipes.');
