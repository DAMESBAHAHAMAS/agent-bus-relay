import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Journal, Executor } from './core.mjs';
import { connectCoval } from './coval-client.mjs';
const state=path.join(os.homedir(),'.openclaw/state/welcomeiq');
const p=JSON.parse(fs.readFileSync(path.join(state,'policy.json'),'utf8'));
const id=process.argv[2];
if(!/^[A-Za-z0-9_-]{43}$/.test(id??''))throw Error('INVALID_REQUEST_ID');
const j=new Journal(path.join(state,'jobs.sqlite'),p);
let client;
try{
 const job=j.get(id);
 const needsCoval=(job.request.operation==='run'&&p.enabled&&p.baseline.approved&&Date.parse(p.allowanceVerifiedUntil)>Date.now())||job.request.operation==='result';
 if(needsCoval)client=await connectCoval(p);
 const ex=new Executor(j,client??{call(){throw Error('COVAL_NOT_CONNECTED');}});
 const result=await ex.execute(id);
 console.log(JSON.stringify({request_id:id,state:result.state,result:result.body,error:result.error}));
}catch(e){
 console.log(JSON.stringify({request_id:id,state:'blocked',error:String(e.message).slice(0,160)}));process.exitCode=1;
}finally{await client?.close();j.close();}
