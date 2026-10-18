import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPair,SignJWT} from 'jose';
import {EventStore,publicAddress,verifyPrincipal,createChatGPT} from '../chatgpt.mjs';
test('callback address policy rejects private/reserved destinations',()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','192.168.1.2','100.64.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1'])assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('8.8.8.8'),true);
});
test('subscription ownership, encryption, deduplication and restart persistence',async()=>{
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'welcomeiq-events-')),'events.sqlite'),key=Buffer.alloc(32,5),secret='whsec_'+Buffer.alloc(32,7).toString('base64');
 let deliveries=0;const send=async(_url,body)=>{const b=JSON.parse(body);if(b.type==='verification')return {status:200,body:{challenge:b.challenge}};deliveries++;return {status:200};};
 let s=new EventStore(file,key,send);
 const p={name:'welcomeiq.message.created',arguments:{project:'welcomeiq'},delivery:{mode:'webhook',url:'https://chatgpt.com/callback',secret}};
 const a=await s.subscribe('owner',p),b=await s.subscribe('owner',p);assert.equal(a.id,b.id);assert.ok(!s.db.prepare('SELECT secret FROM subscriptions').get().secret.includes(secret));
 const e={project:'welcomeiq',from:'codex',to:'chatgpt',type:'request',correlation_id:'c1',payload:'Review',ts:new Date().toISOString()};
 s.publish(e);s.publish(e);s.close();s=new EventStore(file,key,send);await s.deliver(new Set(['owner']));assert.equal(deliveries,1);
 s.publish({...e,correlation_id:'c2'});await s.deliver(new Set());assert.equal(deliveries,1);
 assert.throws(()=>s.unsubscribe('owner',{...p,arguments:{project:'humaniq'}}));
 s.close();
});
test('OAuth verification rejects wrong audience, scope and user',async()=>{
 const keys=await generateKeyPair('RS256'),owners=new Set(['owner']),issuer='https://identity.example/';
 async function token(sub='owner',aud='welcomeiq',scope='welcomeiq.coordinate'){return new SignJWT({scope}).setProtectedHeader({alg:'RS256'}).setSubject(sub).setAudience(aud).setIssuer(issuer).setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);}
 const config={issuer,audience:'welcomeiq',owners,jwks:keys.publicKey};
 assert.equal(await verifyPrincipal(await token(),config),'owner');
 await assert.rejects(verifyPrincipal(await token('owner','other'),config));
 await assert.rejects(verifyPrincipal(await token('stranger'),config));
 await assert.rejects(verifyPrincipal(await token('owner','welcomeiq','other'),config));
});
test('actual MCP 2 discovery uses authenticated principal',async()=>{
 const calls=[],owners=new Set(['owner']),service=createChatGPT({config:{owners},store:{},post:async x=>{calls.push(x);return {queued:true};},inbox:async()=>({messages:[]}),verify:async()=> 'owner'});
 const request=new Request('https://example.com/welcomeiq/mcp',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2026-07-28','MCP-Method':'server/discover'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'server/discover',params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}}}})});
 const response=await service.handler.fetch(request,{authInfo:{token:'test',clientId:'owner',scopes:['welcomeiq.coordinate']}});
 const body=await response.json();assert.ok(body.result,JSON.stringify(body));assert.equal(body.result.capabilities.events!==undefined,true);
 await service.handler.close();
});
