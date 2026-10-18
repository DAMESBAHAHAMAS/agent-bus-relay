import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { remoteClient } from './coval-oauth.mjs';
function keychainKey(service){
 try{return execFileSync('/usr/bin/security',['find-generic-password','-a',os.userInfo().username,'-s',service,'-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
 catch{return '';}
}
export async function connectCoval(policy){
 const apiKey=keychainKey(policy.credentialService);
 let client;
 if(apiKey){
  // A fresh child with a minimal environment; no HumanIQ credential or inherited MCP configuration.
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./node_modules/@coval/mcp-server/dist/index.js',import.meta.url))],env:{PATH:'/usr/bin:/bin',COVAL_API_KEY:apiKey,LOG_LEVEL:'error'},stderr:'pipe'});
  client=new Client({name:'welcomeiq-coval-worker',version:'0.1.0'});
  await client.connect(transport);
 }else{
  // No WelcomeIQ API key: use the owner-approved OAuth sign-in to Coval's hosted MCP (welcomeiq-only token file).
  try{client=await remoteClient();}catch{throw Error('WELCOMEIQ_CREDENTIAL_MISSING');}
 }
 const catalog=await client.listTools();
 const names=new Set(catalog.tools.map(t=>t.name));
 for(const name of ['create_run','get_run'])if(!names.has(name)){await client.close();throw Error('REQUIRED_COVAL_TOOL_MISSING');}
 return {catalog,call:async(name,args)=>{
  if(!['create_run','get_run'].includes(name))throw Error('TOOL_DENIED');
  return await client.callTool({name,arguments:args},undefined,{timeout:90000});
 },close:()=>client.close()};
}
