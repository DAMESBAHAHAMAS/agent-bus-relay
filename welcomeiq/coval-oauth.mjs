// Official MCP SDK OAuth client. WelcomeIQ-only storage; no global Codex configuration changes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {auth} from '@modelcontextprotocol/sdk/client/auth.js';
const endpoint='https://mcp.coval.dev/mcp';
const dir=path.join(os.homedir(),'.openclaw/state/welcomeiq');
const file=path.join(dir,'coval-oauth.json');
function load(){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw Error('COVAL_AUTH_STORAGE_UNREADABLE');}}
function save(data){
 fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data),{mode:0o600});fs.chmodSync(tmp,0o600);fs.renameSync(tmp,file);
}
export function provider({redirect,onAuthorization}={}){
 let state=load();
 if(redirect){state={...state,redirect};save(state);}
 const update=(key,value)=>{state={...load(),[key]:value};save(state);};
 return {
  get redirectUrl(){return state.redirect;},
  get clientMetadata(){return {client_name:'WelcomeIQ Coval Specialist',redirect_uris:[state.redirect],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'};},
  state(){if(!state.oauthState)update('oauthState',crypto.randomBytes(32).toString('base64url'));return state.oauthState;},
  clientInformation(){return state.client;},saveClientInformation(v){update('client',v);},
  tokens(){return state.tokens;},saveTokens(v){update('tokens',v);},
  saveCodeVerifier(v){update('verifier',v);},codeVerifier(){if(!state.verifier)throw Error('PKCE_VERIFIER_MISSING');return state.verifier;},
  async redirectToAuthorization(url){if(!onAuthorization)throw Error('COVAL_OWNER_SIGNIN_REQUIRED');await onAuthorization(url);},
  discoveryState(){return state.discovery;},saveDiscoveryState(v){update('discovery',v);},
  invalidateCredentials(scope){
   // Archive state by clearing only the invalid section. Never remove a file or another project's credentials.
   const before=load();if(scope==='tokens')update('tokens',undefined);else if(scope==='verifier')update('verifier',undefined);else if(scope==='discovery')update('discovery',undefined);else throw Error('COVAL_OWNER_REAUTH_REQUIRED');
  }
 };
}
export async function remoteClient(){
 const p=provider();
 if(!p.tokens())throw Error('COVAL_OWNER_SIGNIN_REQUIRED');
 const client=new Client({name:'welcomeiq-coval-specialist',version:'0.1.0'});
 const transport=new StreamableHTTPClientTransport(new URL(endpoint),{authProvider:p,reconnectionOptions:{maxRetries:1,initialReconnectionDelay:1000,maxReconnectionDelay:5000,reconnectionDelayGrowFactor:2}});
 try{await client.connect(transport);return client;}catch{await client.close().catch(()=>{});throw Error('COVAL_OAUTH_CONNECTION_FAILED');}
}
async function inspect(){
 const c=await remoteClient();
 try{
  const catalog=await c.listTools();
  const inventory={checked_at:new Date().toISOString(),endpoint,transport:'official_remote_mcp_oauth',tool_names:catalog.tools.map(x=>x.name),read_only:true,project_mapping_verified:false,agents:[],test_sets:[]};
  function value(result){if(result.isError)throw Error('COVAL_READ_REFUSED');if(result.structuredContent)return result.structuredContent;return JSON.parse(result.content.filter(x=>x.type==='text').map(x=>x.text).join('\n'));}
  const a=value(await c.callTool({name:'list_agents',arguments:{limit:20}}));
  const agents=Array.isArray(a)?a:a.agents??a.data?.agents??a.data??[];
  inventory.agents=Array.isArray(agents)?agents.map(x=>({id:x.agent_id??x.id,name:x.name,model_type:x.model_type})):['Unrecognized response shape; retained tool catalog only'];
  const t=value(await c.callTool({name:'list_test_sets',arguments:{limit:20}}));
  const sets=Array.isArray(t)?t:t.test_sets??t.data?.test_sets??t.data??[];
  inventory.test_sets=Array.isArray(sets)?sets.map(x=>({id:x.test_set_id??x.id,name:x.name})):['Unrecognized response shape; retained tool catalog only'];
  const target=path.join(dir,'evidence/coval-mcp-readonly.json');fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});fs.writeFileSync(target,JSON.stringify(inventory,null,2),{mode:0o600});console.log(JSON.stringify(inventory,null,2));
 }finally{await c.close();}
}
async function login(){
 const prior=load();let accepted=false,finish;const callback=new Promise(resolve=>{finish=resolve;});
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname!=='/coval/callback'){res.writeHead(404);res.end();return;}
  const state=load().oauthState??'',got=url.searchParams.get('state')??'';
  const a=Buffer.from(state),b=Buffer.from(got);
  if(accepted||!a.length||a.length!==b.length||!crypto.timingSafeEqual(a,b)){res.writeHead(403);res.end('OAuth state did not match.');return;}
  if(url.searchParams.has('error')){res.writeHead(400);res.end('Coval authorization was declined.');finish(false);return;}
  const code=url.searchParams.get('code');if(!code){res.writeHead(400);res.end('Missing authorization code.');return;}
  accepted=true;
  try{
   const outcome=await auth(p,{serverUrl:endpoint,authorizationCode:code});
   if(outcome!=='AUTHORIZED')throw Error('not_authorized');
   res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('WelcomeIQ Coval MCP authorization completed. You may close this tab.');finish(true);
  }catch{res.writeHead(400);res.end('Coval authorization did not complete. No credentials are displayed.');finish(false);}
 });
 const preferred=prior.redirect?Number(new URL(prior.redirect).port):0;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(preferred,'127.0.0.1',resolve);});
 const redirect='http://127.0.0.1:'+server.address().port+'/coval/callback';
 let p=provider({redirect,onAuthorization:url=>console.log(JSON.stringify({event:'owner_authorization_required',authorization_url:String(url)}))});
 const timer=setTimeout(()=>finish(false),15*60000);
 try{
  const outcome=await auth(p,{serverUrl:endpoint});
  const authorized=outcome==='AUTHORIZED'||(outcome==='REDIRECT'&&await callback);
  if(!authorized)throw Error('COVAL_AUTHORIZATION_PENDING_OR_DECLINED');
  console.log(JSON.stringify({event:'coval_oauth_authorized',project:'welcomeiq',tokens_displayed:false}));
  await inspect();
 }finally{clearTimeout(timer);server.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const mode=process.argv[2];
 (mode==='login'?login():mode==='inspect'?inspect():Promise.reject(Error('Use login or inspect'))).catch(e=>{console.error(JSON.stringify({error:String(e.message).slice(0,120),tokens_displayed:false}));process.exitCode=1;});
}
