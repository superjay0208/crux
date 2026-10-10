// Read-only auth check. Credentials stay in memory and are never logged or written.
import { spawnSync } from 'node:child_process';
const result=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true,timeout:10000,
  env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never',GIT_ASKPASS:'',SSH_ASKPASS:''}});
const fields=Object.fromEntries((result.stdout||'').split('\n').filter(v=>v.includes('=')).map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1).trim()];}));
if(!fields.password){console.log(JSON.stringify({authenticated:false,reason:'No noninteractive GitHub credential available.'}));process.exit(0);}
try {
  const response=await fetch('https://api.github.com/user',{headers:{Authorization:`Bearer ${fields.password}`,Accept:'application/vnd.github+json','User-Agent':'crux-release-check'},signal:AbortSignal.timeout(10000)});
  const data=await response.json();
  console.log(JSON.stringify({authenticated:response.ok,login:response.ok?data.login:undefined,status:response.status,scopes:response.headers.get('x-oauth-scopes')}));
} catch { console.log(JSON.stringify({authenticated:false,reason:'GitHub auth verification unavailable.'})); }
