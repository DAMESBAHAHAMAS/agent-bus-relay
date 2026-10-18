// Local operator smoke only; synthetic status fixture, never a Coval run or human Slack message.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Journal,admit} from './core.mjs';
const home=os.homedir(),dir=path.join(home,'.openclaw/state/welcomeiq'),p=JSON.parse(fs.readFileSync(path.join(dir,'policy.json'),'utf8'));
const j=new Journal(path.join(dir,'jobs.sqlite'),p);
const req=admit(p,{id:'local-status-smoke-'+Date.now(),channel_id:p.channelId,sender_id:p.ownerCliqIds[0],text:'@coval status'});j.enqueue(req);
const c=JSON.parse(fs.readFileSync(path.join(home,'.openclaw/openclaw.json'),'utf8'));
if(c.gateway.bind!=='loopback'||typeof c.gateway.auth.token!=='string')throw Error('PRIVATE_GATEWAY_REQUIRED');
const response=await fetch('http://127.0.0.1:'+Number(c.gateway.port||18789)+'/tools/invoke',{method:'POST',headers:{Authorization:'Bearer '+c.gateway.auth.token,'Content-Type':'application/json'},body:JSON.stringify({tool:'coval_execute_request',agentId:'coval-welcomeiq',sessionKey:'agent:coval-welcomeiq:smoke',args:{request_id:req.id}}),signal:AbortSignal.timeout(30000)});
const body=await response.json(),job=j.get(req.id);
const result={at:new Date().toISOString(),synthetic_fixture:true,description:'Local tool smoke only; not Slack human intake or live Coval testing',http_status:response.status,gateway_ok:body.ok,job_state:job.state,result:job.body,gateway_error:body.error,verified:response.ok&&body.ok&&job.state==='complete'};
fs.mkdirSync(path.join(dir,'evidence'),{recursive:true,mode:0o700});fs.writeFileSync(path.join(dir,'evidence/gateway-smoke.json'),JSON.stringify(result,null,2),{mode:0o600});
console.log(JSON.stringify(result,null,2));j.close();if(!result.verified)process.exitCode=1;
