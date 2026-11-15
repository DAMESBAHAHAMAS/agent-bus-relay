"""Deterministic acceptance oracles, authored locally by the implementing function.
Plans are trusted code/configuration, never generated from an executor's reply.
"""
import hashlib,json,pathlib,re
ALLOWED_READS={'project_task','project_task_comments','workdrive_text','workdrive_metadata'}
def acceptance_hash(task):
 from control import requirements
 return hashlib.sha256(json.dumps(requirements(task),sort_keys=True).encode()).hexdigest()
def norm(v):
 """Compare names, not spellings: casefold, read '&' as 'and', drop everything but letters and digits, then one trailing 'agent'.
 'Biz-Operations', 'biz operations' and 'BizOps Agent' all become 'bizoperations' / 'bizops'."""
 s=re.sub(r'[^a-z0-9]','',str(v or '').casefold().replace('&','and'))
 return s[:-5] if s.endswith('agent') and len(s)>5 else s
def who(v):
 """One spelling per identity: 'Biz Operations', 'Business Operations' and 'bizops' are the same; so are 'Claude Code' and 'claude-code'.
 Aliases are looked up by their normalised form, so case, spaces, punctuation and a trailing 'agent' never make a new identity."""
 from control import ACTORS,FUNCTIONS
 table={norm(k):c for k,c in list(ACTORS.items())+list(FUNCTIONS.items())}
 table.update({norm(c):c for c in table.values()})
 n=norm(v)
 return table.get(n,n)
def closer_check(plan,task,row):
 """SA5-T225 P-D: a task is closed only by someone who did not do it. The plan must name verified_by, and it must differ from the
 task's Execution Actor and from the dispatch executor. Refused before anything is read or written."""
 verifier=str(plan.get('verified_by') or '').strip()
 if not norm(verifier):raise ValueError('Closure refused: the plan names no verified_by')
 # Both the resolved identity and the bare normalised name count, so an unknown spelling of the executor is still the executor.
 doers={f(x) for x in (task.get('execution_actor'),row['executor']) for f in (who,norm)}-{''}
 if {who(verifier),norm(verifier)}&doers:raise ValueError('Closure refused: verified_by ('+verifier+') is the executor; a different agent or a person must verify')
 return verifier
def verify(control,cid,plan_name,close=False):
 from control import closed
 if not re.fullmatch(r'[A-Za-z0-9_-]+\.json',plan_name):raise ValueError('Plan filename only')
 root=pathlib.Path(__file__).resolve().parent/'plans';path=root/plan_name
 if path.is_symlink():raise ValueError('No symlink plans')
 plan=json.loads(path.read_text());row=next(r for r in control.rows() if r['cid']==cid)
 if row['state'] not in ('awaiting_verification','verified_deliverable'):raise ValueError('Actual executor completion required before verification')
 data=json.loads(row['data']);task=control.task(row['project'],row['task'])
 if data['mode']!='execution':raise ValueError('Proof cannot close business tasks')
 if plan['project']!=row['project'] or plan['task']!=row['task'] or plan['acceptance_sha256']!=acceptance_hash(task):raise ValueError('Task/acceptance changed; review verifier')
 if not plan.get('checks'):raise ValueError('Nonempty acceptance checks required')
 verifier=closer_check(plan,task,row) if close else str(plan.get('verified_by') or '').strip()
 evidence=[]
 for check in plan['checks']:
  if check['operation'] not in ALLOWED_READS:raise ValueError('Unapproved verification operation')
  if check['operation']=='project_task_comments':
   # Executors record evidence as task comments; read them as one plain text, and only on the task being verified.
   from control import plain
   if check['params']!={'project_id':row['project'],'task_id':row['task']}:raise ValueError('Comment check must target the verified task')
   r=control.a.projects('GET',f"projects/{row['project']}/tasks/{row['task']}/comments?per_page=100")
   actual='\n'.join(plain(x.get('comment') or x.get('content') or '') for x in (r if isinstance(r,list) else r.get('comments',[])))
  else:
   reader=control.file_reader(row['executor']) if check['operation'].startswith('workdrive') else control.a
   actual=reader.read(check['operation'],check['params'])
   for key in check['path']:
    actual=actual[key] if isinstance(key,int) else actual.get(key)
  if 'equals' in check:passed=type(actual) is type(check['equals']) and actual==check['equals']
  elif 'contains' in check:passed=isinstance(actual,str) and bool(check['contains']) and check['contains'] in actual
  else:raise ValueError('Explicit equals/contains oracle required')
  evidence.append({'criterion':check['criterion'],'operation':check['operation'],'params':check['params'],'passed':passed,'actual_sha256':hashlib.sha256(json.dumps(actual,sort_keys=True).encode()).hexdigest()})
 if not all(e['passed'] for e in evidence):
  data['verification']={'passed':False,'checks':evidence};control.save(cid,'awaiting_verification',data);raise ValueError('Acceptance check failed; task remains open')
 data['verification']={'passed':True,'plan':plan_name,'acceptance_sha256':acceptance_hash(task),'checks':evidence,'verified_by':verifier}
 control.save(cid,'verified_deliverable',data)
 control.journal(next(r for r in control.rows() if r['cid']==cid))
 if close:
  # Resolve a previously uncertain close by read-back before any new write.
  fresh=control.task(row['project'],row['task'])
  if acceptance_hash(fresh)!=plan['acceptance_sha256']:raise ValueError('Acceptance changed before closure')
  if not closed(fresh):
   if data.get('close_attempted'):raise RuntimeError('WRITE_OUTCOME_UNKNOWN: reconcile existing close; no automatic retry')
   # The close is still written with the dispatcher's bizops Zoho credential, the executor's own. A separate verifier identity is an owner step.
   data['close_attempted']=True;data['verification']['closed_with']='bizops Zoho credential (shared with the executor; separate verifier identity pending)';control.save(cid,'verified_deliverable',data)
   control.a.projects('PATCH',f"projects/{row['project']}/tasks/{row['task']}",{'completion_percentage':100})
  after=control.task(row['project'],row['task'])
  if not closed(after):raise RuntimeError('WRITE_OUTCOME_UNKNOWN: closure not independently confirmed')
  control.save(cid,'completed',data);control.journal(next(r for r in control.rows() if r['cid']==cid))
 return {'cid':cid,'state':'completed' if close else 'verified_deliverable','checks':evidence}
