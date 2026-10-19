"""Deterministic acceptance oracles, authored locally by the implementing function.
Plans are trusted code/configuration, never generated from an executor's reply.
"""
import hashlib,json,pathlib,re
ALLOWED_READS={'project_task','workdrive_text','workdrive_metadata'}
def acceptance_hash(task):
 from control import requirements
 return hashlib.sha256(json.dumps(requirements(task),sort_keys=True).encode()).hexdigest()
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
 evidence=[]
 for check in plan['checks']:
  if check['operation'] not in ALLOWED_READS:raise ValueError('Unapproved verification operation')
  actual=control.a.read(check['operation'],check['params'])
  for key in check['path']:
   actual=actual[key] if isinstance(key,int) else actual.get(key)
  if 'equals' in check:passed=type(actual) is type(check['equals']) and actual==check['equals']
  elif 'contains' in check:passed=isinstance(actual,str) and bool(check['contains']) and check['contains'] in actual
  else:raise ValueError('Explicit equals/contains oracle required')
  evidence.append({'criterion':check['criterion'],'operation':check['operation'],'params':check['params'],'passed':passed,'actual_sha256':hashlib.sha256(json.dumps(actual,sort_keys=True).encode()).hexdigest()})
 if not all(e['passed'] for e in evidence):
  data['verification']={'passed':False,'checks':evidence};control.save(cid,'awaiting_verification',data);raise ValueError('Acceptance check failed; task remains open')
 data['verification']={'passed':True,'plan':plan_name,'acceptance_sha256':acceptance_hash(task),'checks':evidence}
 control.save(cid,'verified_deliverable',data)
 control.journal(next(r for r in control.rows() if r['cid']==cid))
 if close:
  # Resolve a previously uncertain close by read-back before any new write.
  fresh=control.task(row['project'],row['task'])
  if acceptance_hash(fresh)!=plan['acceptance_sha256']:raise ValueError('Acceptance changed before closure')
  if not closed(fresh):
   if data.get('close_attempted'):raise RuntimeError('WRITE_OUTCOME_UNKNOWN: reconcile existing close; no automatic retry')
   data['close_attempted']=True;control.save(cid,'verified_deliverable',data)
   control.a.projects('PATCH',f"projects/{row['project']}/tasks/{row['task']}",{'completion_percentage':100})
  after=control.task(row['project'],row['task'])
  if not closed(after):raise RuntimeError('WRITE_OUTCOME_UNKNOWN: closure not independently confirmed')
  control.save(cid,'completed',data);control.journal(next(r for r in control.rows() if r['cid']==cid))
 return {'cid':cid,'state':'completed' if close else 'verified_deliverable','checks':evidence}
