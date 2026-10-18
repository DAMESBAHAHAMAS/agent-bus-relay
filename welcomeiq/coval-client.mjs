import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
export async function connectCoval(policy){
 const apiKey=execFileSync('/usr/bin/security',['find-generic-password','-a',os.userInfo().username,'-s',policy.credentialService,'-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 if(!apiKey)throw Error('WELCOMEIQ_CREDENTIAL_MISSING');
 // A fresh child with a minimal environment; no HumanIQ credential or inherited MCP configuration.
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./node_modules/@coval/mcp-server/dist/index.js',import.meta.url))],env:{PATH:'/usr/bin:/bin',COVAL_API_KEY:apiKey,LOG_LEVEL:'error'},stderr:'pipe'});
 const client=new Client({name:'welcomeiq-coval-worker',version:'0.1.0'});
 await client.connect(transport);
 const catalog=await client.listTools();
 const names=new Set(catalog.tools.map(t=>t.name));
 for(const name of ['create_run','get_run'])if(!names.has(name))throw Error('REQUIRED_COVAL_TOOL_MISSING');
 return {catalog,call:async(name,args)=>{
  if(!['create_run','get_run'].includes(name))throw Error('TOOL_DENIED');
  return await client.callTool({name,arguments:args},undefined,{timeout:90000});
 },close:()=>client.close()};
}
