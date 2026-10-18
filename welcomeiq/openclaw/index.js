import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
export default {id:'welcomeiq-coval',name:'WelcomeIQ Coval testing',register(api){
 api.registerTool(ctx=>{
  if(ctx.agentId!=='coval-welcomeiq')return null;
  return {name:'coval_execute_request',label:'Execute verified WelcomeIQ testing request',description:'Process one persisted, authenticated WelcomeIQ request. The request must already exist in the private journal. No arbitrary Coval tool, resource, project or credential can be supplied.',parameters:{type:'object',properties:{request_id:{type:'string',pattern:'^[A-Za-z0-9_-]{43}$'}},required:['request_id'],additionalProperties:false},
  async execute(_id,args){
   if(ctx.agentId!=='coval-welcomeiq'||!/^[A-Za-z0-9_-]{43}$/.test(args.request_id))throw Error('DENIED');
   ctx.assertInvocationCurrent?.();
   const worker='/Users/damianknowles/Developer/agent-bus-relay/welcomeiq/execute.mjs';
   try{const {stdout}=await run('/Users/damianknowles/.nvm/versions/node/v26.10.0/bin/node',[worker,args.request_id],{timeout:120000,maxBuffer:1048576});return {content:[{type:'text',text:stdout}],details:JSON.parse(stdout)};}
   catch(e){let d={state:'blocked',error:'WelcomeIQ execution unavailable; no success claimed'};try{d=JSON.parse(e.stdout);}catch{}return {content:[{type:'text',text:JSON.stringify(d)}],details:d,isError:true};}
  }};
 },{name:'coval_execute_request',optional:true});
}};
