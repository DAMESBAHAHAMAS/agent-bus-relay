import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
export const digest = x => crypto.createHash('sha256').update(JSON.stringify(x)).digest('base64url');
export function validatePolicy(p) {
 if(p.project!=='welcomeiq'||p.agentId!=='coval-welcomeiq')throw Error('PROJECT_DENIED');
 if(!p.channelId||!Array.isArray(p.ownerCliqIds)||!Array.isArray(p.testerCliqIds))throw Error('INVALID_POLICY');
 if(p.spendLimitUsd!==0)throw Error('SPEND_NOT_AUTHORIZED');
 if(!Number.isInteger(p.maxRunsPerDay)||p.maxRunsPerDay<1||p.maxRunsPerDay>1)throw Error('LIMIT_NOT_APPROVED');
 return p;
}
export function admit(p, m) {
 validatePolicy(p);
 if(m.channel_id!==p.channelId || !m.id || !m.sender_id)throw Error('SOURCE_DENIED');
 const owner=p.ownerCliqIds.includes(String(m.sender_id)),tester=p.testerCliqIds.includes(String(m.sender_id));
 if(!owner&&!tester)throw Error('USER_DENIED');
 if(typeof m.text!=='string'||m.text.length>4000)throw Error('INVALID_MESSAGE');
 const text=m.text.trim();
 if(!/^@coval\b/i.test(text))throw Error('NOT_A_TEST_REQUEST');
 const command=text.replace(/^@coval\s*/i,'').trim();
 let operation,args={};
 if(command==='status')operation='status';
 else if(command==='run baseline')operation='run';
 else if(/^result [A-Za-z0-9_-]{1,100}$/.test(command)){operation='result';args.job_id=command.slice(7);}
 else {operation='clarify';args.text=command;}
 return {id:digest([p.project,p.channelId,m.id]),project:p.project,source_message_id:m.id,sender_id:String(m.sender_id),role:owner?'owner':'tester',operation,args};
}
export class Journal {
 constructor(file,policy){
  this.policy=validatePolicy(policy);
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  fs.chmodSync(path.dirname(file),0o700);
  this.db=new DatabaseSync(file);fs.chmodSync(file,0o600);
  this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,project TEXT NOT NULL,request TEXT NOT NULL,policy_hash TEXT NOT NULL,state TEXT NOT NULL,run_id TEXT,body TEXT,error TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,body TEXT NOT NULL,sent INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY,body TEXT NOT NULL,sha256 TEXT NOT NULL,created INTEGER NOT NULL);");
  const old=this.db.prepare("SELECT v FROM meta WHERE k='project'").get();
  if(old&&old.v!==policy.project)throw Error('STORAGE_PROJECT_MISMATCH');
  this.db.prepare("INSERT OR IGNORE INTO meta(k,v) VALUES('project',?)").run(policy.project);
 }
 get(id){const r=this.db.prepare('SELECT * FROM jobs WHERE id=? AND project=?').get(id,this.policy.project);if(!r)throw Error('JOB_NOT_FOUND');return {...r,request:JSON.parse(r.request),body:r.body?JSON.parse(r.body):null};}
 enqueue(request){
  if(request.project!==this.policy.project)throw Error('PROJECT_DENIED');
  this.db.prepare("INSERT OR IGNORE INTO jobs(id,project,request,policy_hash,state,created,updated) VALUES(?,?,?,?,'queued',?,?)").run(request.id,request.project,JSON.stringify(request),digest(this.policy),Date.now(),Date.now());
  return this.get(request.id);
 }
 set(id,state,body=null,error=null,runId=null){
  this.db.prepare("UPDATE jobs SET state=?,body=?,error=?,run_id=COALESCE(?,run_id),updated=? WHERE id=? AND project=?").run(state,body===null?null:JSON.stringify(body),error,runId,Date.now(),id,this.policy.project);
  return this.get(id);
 }
 pending(){return this.db.prepare("SELECT id FROM jobs WHERE project=? AND state IN ('queued','running') ORDER BY created").all(this.policy.project).map(x=>this.get(x.id));}
 recover(){this.db.prepare("UPDATE jobs SET state='uncertain',error='Submission interrupted; reconcile before any new run',updated=? WHERE project=? AND state='submitting'").run(Date.now(),this.policy.project);}
 evidence(id,body){const text=JSON.stringify(body),sha256=crypto.createHash('sha256').update(text).digest('base64url');this.db.prepare('INSERT OR REPLACE INTO evidence VALUES(?,?,?,?)').run(id,text,sha256,Date.now());return sha256;}
 close(){this.db.close();}
}
function unwrap(r){
 if(r?.isError)throw Error('COVAL_TOOL_ERROR');
 if(r?.structuredContent)return r.structuredContent;
 if(r?.content){const t=r.content.filter(c=>c.type==='text').map(c=>c.text).join('\n');try{return JSON.parse(t);}catch{throw Error('UNRECOGNIZED_COVAL_RESPONSE');}}
 return r;
}
function runRecord(x){return x?.data?.run??x?.run??x?.data??x;}
function safeMetrics(r){
 const m=r.metrics??r.results?.metrics??{};
 if(Array.isArray(m))return m.slice(0,20).map(x=>({id:String(x.metric_id??x.id??'').slice(0,100),value:typeof x.value==='number'?x.value:null}));
 return Object.fromEntries(Object.entries(m).filter(([k,v])=>/^[A-Za-z0-9_. -]{1,100}$/.test(k)&&typeof v==='number').slice(0,20));
}
export class Executor {
 constructor(journal,client){this.j=journal;this.p=journal.policy;this.client=client;}
 async execute(id){
  const job=this.j.get(id);
  if(job.state!=='queued')return job;
  const req=job.request;
  if(req.operation==='status')return this.j.set(id,'complete',{project:'welcomeiq',execution_enabled:this.p.enabled,suite_approved:this.p.baseline.approved,allowance_valid:Date.parse(this.p.allowanceVerifiedUntil)>Date.now(),message:'WelcomeIQ only. ChatGPT acceptance gate remains separate.'});
  if(req.operation==='clarify')return this.j.set(id,'blocked',{message:'Use @coval status, @coval run baseline, or @coval result JOB_ID. New scenarios and configuration changes require review.'});
  if(req.operation==='result'){
   const parent=this.j.get(req.args.job_id);
   if(!parent.run_id)return this.j.set(id,'blocked',{message:'No verified Coval run exists for that WelcomeIQ job.'});
   return this.readRun(id,parent.run_id);
  }
  const b=this.p.baseline;
  if(!this.p.enabled||!b.approved||!(Date.parse(this.p.allowanceVerifiedUntil)>Date.now()))return this.j.set(id,'blocked',{message:'Testing locked: approved suite, project credential and verified no-spend allowance are required.'});
  if(!b.agent_id||!b.persona_id||!b.test_set_id||b.metric_ids?.length!==3||b.options?.concurrency!==1||b.options?.iteration_count!==1)throw Error('SUITE_NOT_APPROVED');
  // Claim under a write lock: concurrent workers cannot submit twice or exceed the daily cap.
  this.j.db.exec('BEGIN IMMEDIATE');
  try{
   const current=this.j.get(id);
   if(current.state!=='queued'){this.j.db.exec('COMMIT');return current;}
   if(current.policy_hash!==digest(this.p))throw Error('POLICY_CHANGED_REAUTHORIZE');
   const unresolved=this.j.db.prepare("SELECT count(*) n FROM jobs WHERE project=? AND state IN ('submitting','uncertain','running')").get(this.p.project).n;
   const n=this.j.db.prepare("SELECT count(*) n FROM jobs WHERE project=? AND (state IN ('submitting','uncertain','running') OR run_id IS NOT NULL) AND created>=?").get(this.p.project,Date.now()-86400000).n;
   if(unresolved||n>=this.p.maxRunsPerDay)throw Error('RUN_LIMIT_OR_RECONCILIATION_REQUIRED');
   this.j.set(id,'submitting');this.j.db.exec('COMMIT');
  }catch(e){if(this.j.db.isTransaction)this.j.db.exec('ROLLBACK');throw e;}
  const args={...b,metadata:{project:'welcomeiq',request_id:id,policy_sha256:digest(this.p)}};delete args.approved;
  try{
   const result=unwrap(await this.client.call('create_run',args));
   const record=runRecord(result);const runId=record?.run_id??record?.id;
   if(typeof runId!=='string'||!runId)throw Error('MISSING_RUN_ID');
   this.j.evidence(id+':create',result);
   return this.j.set(id,'running',{run_id:runId},null,runId);
  }catch(e){this.j.set(id,'uncertain',null,'Coval submission outcome unknown; never automatically resubmit');throw Error('SUBMISSION_UNCERTAIN');}
 }
 async readRun(id,runId){
  const result=unwrap(await this.client.call('get_run',{run_id:runId}));const r=runRecord(result);
  if(String(r.run_id??r.id)!==runId)throw Error('RUN_ID_MISMATCH');
  if(r.agent_id&&r.agent_id!==this.p.baseline.agent_id)throw Error('RESOURCE_PROJECT_MISMATCH');
  if(r.test_set_id&&r.test_set_id!==this.p.baseline.test_set_id)throw Error('RESOURCE_PROJECT_MISMATCH');
  const sha256=this.j.evidence(id+':result',result),status=String(r.status??'UNKNOWN').toUpperCase();
  const terminal=['COMPLETED','COMPLETE','FAILED','CANCELLED','CANCELED','ERROR'].includes(status);
  return this.j.set(id,terminal?'complete':'running',{run_id:runId,coval_status:status,metrics:safeMetrics(r),evidence_sha256:sha256,launch_pass:null},null,runId);
 }
}
