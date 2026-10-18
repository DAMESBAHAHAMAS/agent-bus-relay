// WelcomeIQ namespace on the EXISTING relay. No arbitrary channel/project parameter.
const crypto=require('node:crypto');
module.exports=function welcomeIQ({cliq,send,readBody,leakReason,signing,ownerIds,underRate}){
 const chat=process.env.WELCOMEIQ_CHAT_ID;
 const roles=new Map((process.env.WELCOMEIQ_SERVICE_KEYS||'').split(',').filter(Boolean).map(s=>{const i=s.indexOf(':');return [s.slice(i+1),s.slice(0,i)];}));
 const testers=new Set((process.env.WELCOMEIQ_TESTER_IDS||'').split(',').filter(Boolean));
 const known=new Set(['worker','codex','coval','chatgpt']);
 const canonical=e=>JSON.stringify([e.project,e.from,e.to,e.type,e.correlation_id,e.payload,e.source_message_id,e.ts]);
 function sign(e){return crypto.createHmac('sha256',signing).update(canonical(e)).digest('hex');}
 function parse(text){
  try{const e=JSON.parse(text);if(e.project!=='welcomeiq'||!known.has(e.from)||!known.has(e.to)||!['request','ack','result','alert'].includes(e.type)||typeof e.sig!=='string')return null;
   const a=Buffer.from(e.sig),b=Buffer.from(sign(e));return a.length===b.length&&crypto.timingSafeEqual(a,b)?e:null;}catch{return null;}
 }
 return async function(req,res,url){
  if(!url.pathname.startsWith('/welcomeiq/'))return false;
  if(!chat||!signing||!roles.size){send(res,503,{error:'welcomeiq_not_configured'});return true;}
  const role=roles.get(String(req.headers.authorization||'').replace(/^Bearer /,''));
  if(!known.has(role)){send(res,401,{error:'unauthorized'});return true;}
  if(req.method==='POST'&&!underRate('welcomeiq:'+role)){send(res,429,{error:'rate_limited'});return true;}
  if(url.pathname==='/welcomeiq/inbox'&&req.method==='GET'){
   const since=Number(url.searchParams.get('since')||0);
   if(!Number.isSafeInteger(since)||since<0){send(res,400,{error:'invalid_cursor'});return true;}
   const scanStarted=Date.now();let until=scanStarted,all=[],complete=false;
   for(let i=0;i<20;i++){
    const r=await cliq('GET','/chats/'+encodeURIComponent(chat)+'/messages?limit=100&fromtime='+since+'&totime='+until);
    if(![200,204].includes(r.status)){send(res,502,{error:'cliq_read_failed'});return true;}
    const batch=r.json.data||[];all.push(...batch);
    if(batch.length<100){complete=true;break;}
    const oldest=Math.min(...batch.map(m=>Number(m.time)));if(oldest<=since){complete=true;break;}
    if(oldest>=until)break;until=oldest;
   }
   if(!complete){send(res,409,{error:'history_window_overflow',note:'Cursor not advanced; reconcile backlog.'});return true;}
   const uniq=new Map();
   for(const m of all){
    const text=m.content?.text??'',e=parse(text),sender=String(m.sender?.id??'');
    if(e){if(role==='worker'||e.to===role||e.from===role)uniq.set(m.id,{id:m.id,time:Number(m.time),envelope:e});continue;}
    if(role!=='worker'||(!ownerIds.has(sender)&&!testers.has(sender)))continue;
    // Service posts under the owner OAuth account must never be admitted as owner instructions.
    if(!/^@(coval|codex)\b/i.test(text))continue;
    if(testers.has(sender)&&!ownerIds.has(sender)&&!/^@coval\b/i.test(text))continue;
    uniq.set(m.id,{id:m.id,time:Number(m.time),channel_id:chat,sender_id:sender,text:text.slice(0,4000),human_role:ownerIds.has(sender)?'owner':'tester'});
   }
   send(res,200,{project:'welcomeiq',messages:[...uniq.values()].sort((a,b)=>a.time-b.time),scanned_until:scanStarted-2000});return true;
  }
  if(url.pathname==='/welcomeiq/messages'&&req.method==='POST'){
   let b;try{b=JSON.parse(await readBody(req));}catch{send(res,400,{error:'invalid_json'});return true;}
   if(!known.has(b.to)||!['request','ack','result','alert'].includes(b.type)||typeof b.payload!=='string'||b.payload.length>3000||!b.correlation_id||b.correlation_id.length>100){send(res,400,{error:'invalid_message'});return true;}
   if(role==='coval'&&b.type==='request'){send(res,403,{error:'coval_cannot_delegate'});return true;}
   if(leakReason(b.payload,true)){send(res,422,{error:'sensitive_content'});return true;}
   const e={project:'welcomeiq',from:role,to:b.to,type:b.type,correlation_id:b.correlation_id,payload:b.payload,source_message_id:b.source_message_id??null,ts:new Date().toISOString()};e.sig=sign(e);
   const r=await cliq('POST','/chats/'+encodeURIComponent(chat)+'/message',{text:JSON.stringify(e),sync_message:true});
   send(res,r.status>=200&&r.status<300?201:502,{posted:r.status>=200&&r.status<300,message_id:r.json.message_id??null});return true;
  }
  send(res,404,{error:'not_found'});return true;
 };
};
