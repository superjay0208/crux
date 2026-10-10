// Narrow release helper: current Git credential, this repo, user-owned Crux only.
// No secrets are printed, persisted, passed in command arguments or added to Git URLs.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
const user='superjay0208',repo='crux',remote=`https://github.com/${user}/${repo}.git`;
const run=(args)=>{
  const result=spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000,
    env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});
  if(result.status!==0)throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
};
const credential=spawnSync('git',['credential','fill'],{cwd:root,input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true,timeout:10000,
  env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});
const password=(credential.stdout||'').split('\n').find(line=>line.startsWith('password='))?.slice(9).trim();
if(!password)throw new Error('No GitHub login available. Sign in through Git Credential Manager or gh auth login.');
const api=async(endpoint,method='GET',body,allow404=false)=>{
  const response=await fetch(`https://api.github.com${endpoint}`,{method,
    headers:{Authorization:`Bearer ${password}`,Accept:'application/vnd.github+json','User-Agent':'crux-release','X-GitHub-Api-Version':'2022-11-28',
      ...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  const text=await response.text();
  const data=text?JSON.parse(text):null;
  if(allow404&&response.status===404)return null;
  if(!response.ok)throw new Error(`GitHub ${method} ${endpoint}: ${response.status}, ${data.message}`);
  return data;
};
const identity=await api('/user');
if(identity.login.toLowerCase()!==user)throw new Error(`Signed in as ${identity.login}; expected ${user}.`);
if(!process.argv.includes('--publish')){
  const repository=await api(`/repos/${user}/${repo}`,'GET',undefined,true);
  const site=await api(`/repos/${user}/${repo}/pages`,'GET',undefined,true);
  const runs=repository?await api(`/repos/${user}/${repo}/actions/runs?per_page=3`):{workflow_runs:[]};
  console.log(JSON.stringify({login:identity.login,repository:repository?.html_url,pages:site?.html_url,runs:runs.workflow_runs.map(r=>({id:r.id,status:r.status,conclusion:r.conclusion,url:r.html_url}))},null,2));
}else{
  if(run(['status','--porcelain']))throw new Error('Commit the reviewed release before publishing.');
  let repository=await api(`/repos/${user}/${repo}`,'GET',undefined,true);
  if(!repository)repository=await api('/user/repos','POST',{name:repo,private:false,description:'Crux: a physics climbing puzzle with jugs, crimps and timed foot swaps.',homepage:`https://${user}.github.io/${repo}/`,has_wiki:false,auto_init:false});
  const origin=run(['remote']);
  if(!origin.split('\n').includes('origin'))run(['remote','add','origin',remote]);
  else if(run(['remote','get-url','origin'])!==remote)throw new Error('Unexpected origin; refusing to publish.');
  const refs=run(['ls-remote','--heads','origin']);
  if(refs){
    run(['fetch','origin','main']);
    run(['merge-base','--is-ancestor','origin/main','HEAD']);
  }
  run(['push','-u','origin','main']);
  const pages=await api(`/repos/${user}/${repo}/pages`,'GET',undefined,true);
  if(!pages)await api(`/repos/${user}/${repo}/pages`,'POST',{build_type:'workflow'});
  else if(pages.build_type!=='workflow')throw new Error('Existing Pages configuration differs; review before changing.');
  // Pages must exist before the configure-pages action runs. Dispatch after enabling it.
  await api(`/repos/${user}/${repo}/actions/workflows/pages.yml/dispatches`,'POST',{ref:'main'});
  console.log(JSON.stringify({repository:repository.html_url,pages:`https://${user}.github.io/${repo}/`,pushed:true}));
}
