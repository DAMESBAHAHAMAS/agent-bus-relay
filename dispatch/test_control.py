import sys
sys.dont_write_bytecode=True
import json,tempfile,unittest
from unittest.mock import patch
import control
P={'id':'p','name':'Systems and Automation'}
def task(**extra):return {'id':'t','name':'M1-TL1-T1 — sample','description':'DEFINITION OF DONE: artifact exists\nEVIDENCE REQUIRED: independent read\nDEPENDENCIES: None\nDISPATCH APPROVED: yes',**extra}
class Fake:
 def project_allowed(self,p):return True
 def read(self,op,args):return task()
class Tests(unittest.TestCase):
 def test_open_does_not_imply_authorized(self):
  t=task();t['description']=t['description'].replace('DISPATCH APPROVED: yes','');self.assertEqual(control.readiness(P,t,[t]),'approval_not_explicit')
 def test_acceptance_required(self):self.assertEqual(control.readiness(P,task(description='DISPATCH APPROVED: yes'),[]),'acceptance_or_evidence_missing')
 def test_dependency_open_and_closed(self):
  t=task();t['description']=t['description'].replace('DEPENDENCIES: None','DEPENDENCIES: M2-TL1-T1');d=task(name='M2-TL1-T1 — prerequisite')
  self.assertIn('dependency_open',control.readiness(P,t,[t,d]));d['is_completed']=True;self.assertEqual(control.readiness(P,t,[t,d]),'ready')
 def test_qualifier_not_ignored(self):
  t=task();t['description']=t['description'].replace('DEPENDENCIES: None','DEPENDENCIES: None (must obtain approval)');self.assertNotEqual(control.readiness(P,t,[t]),'ready')
 def test_external_executor_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=control.Control(tmp,adapter=Fake(),bus=object());t=task();t['description']+='\nEXECUTION ACTOR: muse';self.assertIn('executor_not_existing',c.dispatch(P,t,[t])['reason'])
 def test_duplicate_prevention_after_uncertain_delivery(self):
  class B:
   def status(self,cid):return None
   def send(self,*args):raise TimeoutError('outcome unknown')
  with tempfile.TemporaryDirectory() as tmp:
   c=control.Control(tmp,adapter=Fake(),bus=B());c.journal=lambda r:None
   with self.assertRaises(TimeoutError):c.dispatch(P,task(),[task()])
   self.assertEqual(c.dispatch(P,task(),[task()])['state'],'duplicate_prevented')
 def test_ack_is_not_completion(self):
  class B:
   def status(self,cid):return {'from':'claude-systems','to':'systems','state':'acknowledged','acknowledged_by':'systems','replies':[{'text':'STATUS: ACK. Will execute.'}]}
  with tempfile.TemporaryDirectory() as tmp:
   c=control.Control(tmp,adapter=Fake(),bus=B());c.journal=lambda r:None
   c.db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',('x','p','t','systems','systems','dispatched',json.dumps({'mode':'execution'}),control.now()));c.db.commit()
   self.assertEqual(c.reconcile()[0]['state'],'acknowledged')
 def test_vetted_baseline_task_is_ready(self):
  t={'id':'t','name':'Verify a statute','description':'','start_date':'2026-11-01','end_date':'2026-11-06','vetted':True,'priority':'high','execution_actor':'Compliance','definition_of_done':'Marked verified','evidence_required':'Source link'}
  self.assertEqual(control.owner({'name':'Knowledge Base'},t),'compliance');self.assertEqual(control.readiness({'name':'Knowledge Base'},t,[t]),'ready')
 def test_vetted_needs_high_priority(self):
  t={'id':'t','name':'x','description':'','start_date':'2026-11-01','end_date':'2026-11-06','vetted':True,'priority':'medium','execution_actor':'Compliance','definition_of_done':'d','evidence_required':'e'}
  self.assertEqual(control.readiness(P,t,[t]),'approval_not_explicit')
 def test_human_actor_not_dispatched(self):
  t={'id':'t','name':'x','description':'','start_date':'2026-11-01','end_date':'2026-11-06','vetted':True,'priority':'high','execution_actor':'Damian','definition_of_done':'d','evidence_required':'e'}
  self.assertEqual(control.readiness(P,t,[t]),'human_executor_required')
 def test_vetted_material_action_still_held(self):
  t={'id':'t','name':'Publish the five campaign blog articles','description':'','start_date':'2026-11-01','end_date':'2026-11-06','vetted':True,'priority':'high','execution_actor':'SalesM','definition_of_done':'d','evidence_required':'e'}
  self.assertEqual(control.readiness(P,t,[t]),'material_action_requires_existing_specific_authority')
 def test_spoofed_party_rejected(self):
  class B:
   def status(self,cid):return {'from':'gpt','to':'systems','state':'acknowledged'}
  with tempfile.TemporaryDirectory() as tmp:
   c=control.Control(tmp,adapter=Fake(),bus=B());c.db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',('x','p','t','systems','systems','dispatched','{}',control.now()));c.db.commit()
   with self.assertRaises(RuntimeError):c.reconcile()
 def test_completion_needs_verification(self):
  class B:
   def status(self,cid):return {'from':'claude-systems','to':'systems','state':'acknowledged','acknowledged_by':'systems','replies':[{'text':'STATUS: COMPLETE. Trust me.'}]}
  with tempfile.TemporaryDirectory() as tmp:
   c=control.Control(tmp,adapter=Fake(),bus=B());c.journal=lambda r:None;c.db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',('x','p','t','systems','systems','dispatched',json.dumps({'mode':'execution'}),control.now()));c.db.commit()
   self.assertEqual(c.reconcile()[0]['state'],'awaiting_verification')

def base(**extra):return {'id':'t','prefix':'AB1-T1','name':'Verify a statute','description':'','vetted':True,'priority':'high','start_date':'2026-11-01','end_date':'2026-11-06','execution_actor':'Compliance','definition_of_done':'d','evidence_required':'e',**extra}
class Bus:
 def __init__(self,replies=None):self.sent=[];self.alerts=[];self.replies=replies or {}
 def status(self,cid):return self.replies.get(cid)
 def send(self,to,cid,text):self.sent.append((to,cid,text));return {'delivery':'ok'}
 def alert(self,to,cid,text):self.alerts.append((to,cid,text));return {}
class Zoho:
 """Stands in for the Zoho adapter only; everything under test is the dispatcher's own logic."""
 def __init__(self,tasks,pid='1',name='Compliance and Filings',desc=''):self.ts=tasks;self.pid=pid;self.name=name;self.desc=desc;self.patches=[]
 def project_allowed(self,p):return True
 def read(self,op,args):
  if op=='project_milestones':return []
  return next(t for t in self.ts if t['id']==args['task_id'])
 def projects(self,m,path,body=None):
  if m=='PATCH':
   self.patches.append((path,body));next(t for t in self.ts if path.endswith('/'+t['id'])).update(body);return {}
  if path.startswith('projects?'):return [{'id':self.pid,'name':self.name,'description':self.desc}] if 'page=1&' in path else []
  if '/comments' in path:return []
  if '/tasks?' in path:return self.ts if 'page=1&' in path else []
  return next(t for t in self.ts if path.endswith('/'+t['id']))
def ctl(tmp,tasks,bus=None,gates='[]',**kw):
 import pathlib
 z=Zoho(tasks,**kw);c=control.Control(tmp,adapter=z,bus=bus or Bus());c.projects=lambda:[{'id':z.pid,'name':z.name}];c.journal=lambda r:None
 p=pathlib.Path(tmp)/'gates.json';p.write_text(gates);c.gates_path=str(p);c.register=lambda:{'ADR-1':'Submitted','ADR-2':'Approved'};return c
class Autonomy(unittest.TestCase):
 def test_baseline_needs_the_window(self):
  self.assertFalse(control.baseline(base(end_date='2026-11-11')));self.assertTrue(control.baseline(base()))
 def test_past_window_is_not_dispatched(self):
  t=base(start_date='2026-11-09',end_date='2026-11-10');self.assertEqual(control.readiness(P,t,[t]),'approval_not_explicit')
 def test_named_actor_without_route_is_held_not_rerouted(self):
  t=base(execution_actor='Claude Code');self.assertEqual(control.readiness(P,t,[t]),'actor_not_on_dispatch_route')
 def test_actor_field_outranks_description(self):
  t=base(description='FUNCTION: Systems and Automation',execution_actor='SalesM');self.assertEqual(control.owner(P,t),'salesmkt')
 def test_waiting_refs_found_and_related_ignored(self):
  import gates as G
  self.assertEqual(G.wait_refs({'resume_context':'Blocked: waits for findings from CA1-T37, T38 and T41.'}),['CA1-T37','CA1-T38','CA1-T41'])
  self.assertEqual(G.wait_refs({'resume_context':'Related: BO2-T79 and BO2-T89.'}),[])
  self.assertEqual(G.wait_refs({'resume_context':'Depends on: None — supports SA-6.'}),[])
  self.assertEqual(G.wait_refs({'prefix':'CA1-T9','next_activity':'After CA1-T9 is done, tell someone.'}),[])
 def test_open_dependency_holds_then_closing_it_releases(self):
  dep={'id':'d','prefix':'AB1-T2','name':'prereq','status':{'is_closed_type':False}};t=base(resume_context='Blocked by AB1-T2.')
  idx={'AB1-T2':dep};self.assertEqual(control.readiness(P,t,[t],index=idx),'dependency_open_or_unresolved:AB1-T2')
  dep['status']['is_closed_type']=True;self.assertEqual(control.readiness(P,t,[t],index=idx),'ready')
 def test_unknown_dependency_holds(self):
  t=base(resume_context='Depends on ZZ1-T9.');self.assertIn('ZZ1-T9',control.readiness(P,t,[t],index={}))
 def test_completed_dependency_releases_on_next_run_end_to_end(self):
  dep=base(id='d',prefix='AB1-T2',name='prereq',execution_actor='Damian',status={'is_closed_type':False});t=base(id='t',resume_context='Blocked by AB1-T2.')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[dep,t],b);c.scan(True);self.assertEqual(b.sent,[])
   dep['status']['is_closed_type']=True;c.scan(True);self.assertEqual([s[0] for s in b.sent],['compliance'])
 def test_native_predecessor_read_before_send(self):
  dep=base(id='d',prefix='AB1-T2',name='prereq',execution_actor='Damian',status={'is_closed_type':False});t=base(id='t',dependency_info={'predecessor':[{'id':'d'}]})
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[dep,t],b);out=c.scan(True);self.assertEqual(b.sent,[]);self.assertIn('dependency_open_or_unresolved:native',[x['state'] for x in out])
 def test_gate_waits_then_clear_releases_and_reports_once(self):
  g='[{"id":"h","condition":{"type":"task_closed","prefix":"AB1-T2"},"holds":{"tasks":["AB1-T1"]},"on_clear":"go"}]'
  dep=base(id='d',prefix='AB1-T2',name='prereq',execution_actor='Damian',status={'is_closed_type':False});t=base(id='t')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[dep,t],b,gates=g);out=c.scan(True);self.assertIn('gate_waiting:h',[x['state'] for x in out]);self.assertEqual(b.sent,[]);c.flush()
   dep['status']['is_closed_type']=True;c.scan(True);c.flush();self.assertEqual(len(b.sent),1);self.assertTrue(any('gate cleared'.upper() in a[2] for a in b.alerts))
   n=len([a for a in b.alerts if 'GATE CLEARED' in a[2]]);c.scan(True);c.flush();self.assertEqual(len([a for a in b.alerts if 'GATE CLEARED' in a[2]]),n)
 def test_register_gate_and_unknown_never_releases(self):
  import gates as G
  self.assertEqual(G.evaluate({'condition':{'type':'register_status','adr':'ADR-1','statuses':['Approved']}},{},{'ADR-1':'Submitted'})['state'],'waiting')
  self.assertEqual(G.evaluate({'condition':{'type':'register_status','adr':'ADR-2','statuses':['Approved']}},{},{'ADR-2':'Approved'})['state'],'clear')
  self.assertEqual(G.evaluate({'condition':{'type':'register_status','adr':'ADR-1','statuses':['Approved']}},{},None)['state'],'unknown')
  self.assertEqual(G.evaluate({'condition':{'type':'task_closed','prefix':'NO-T1'}},{},None)['state'],'unknown')
 def test_unknown_gate_keeps_holding(self):
  g='[{"id":"h","condition":{"type":"task_closed","prefix":"XX-T1"},"holds":{"tasks":["AB1-T1"]}}]'
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base()],b,gates=g);c.scan(True);c.flush();self.assertEqual(b.sent,[]);self.assertTrue(any('GATE PROBLEM' in a[2] for a in b.alerts))
 def test_unregistered_prose_gate_is_caught(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base()],b,desc='<p>IMPLEMENTATION PAUSED until the Master Handoff is formally accepted.</p>');c.all_projects=lambda:[{'id':'1','name':'Compliance and Filings','description':c.a.desc}];c.scan(True);c.flush()
   self.assertTrue(any('UNREGISTERED GATE' in a[2] for a in b.alerts))
 def test_finished_work_frees_the_function(self):
  a,d=base(id='a',prefix='AB1-T1'),base(id='b',prefix='AB1-T2')
  for st,freed in (('awaiting_verification',True),('stalled',True),('blocked',True),('verified_deliverable',True),('acknowledged',False)):
   with tempfile.TemporaryDirectory() as tmp:
    b=Bus();c=ctl(tmp,[a,d],b);c.db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',('x','1','a','compliance','compliance',st,json.dumps({'mode':'execution','requested_at':control.now(),'attempt':1,'fingerprint':control.fingerprint(a)}),control.now()));c.db.commit();c.scan(True)
    self.assertEqual(len(b.sent),1 if freed else 0,st)
 def test_silent_agent_stalls_and_escalates(self):
  old=(control.dt.datetime.now(control.dt.timezone.utc)-control.dt.timedelta(hours=7)).isoformat()
  class B(Bus):
   def status(self,cid):return {'from':'claude-systems','to':'compliance','state':'acknowledged','acknowledged_by':'compliance','replies':[]}
  with tempfile.TemporaryDirectory() as tmp:
   b=B();c=ctl(tmp,[base()],b);c.db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',('x','1','t','compliance','compliance','acknowledged',json.dumps({'mode':'execution','requested_at':old}),old));c.db.commit()
   self.assertEqual(c.reconcile()[0]['state'],'stalled');c.scan(True);c.flush();self.assertTrue(any('STALLED' in a[2] and a[0]=='bizops' for a in b.alerts))
 def test_blocked_is_escalated_once_then_up_the_chain(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();t=base();c=ctl(tmp,[t],b);d={'mode':'execution','requested_at':control.now(),'blocker':'needs a login','fingerprint':control.fingerprint(t),'attempt':1}
   c.db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',('x','1','t','compliance','compliance','blocked',json.dumps(d),control.now()));c.db.commit()
   c.scan(True);c.flush();c.scan(True);c.flush();self.assertEqual(len(b.alerts),1);self.assertEqual(b.alerts[0][0],'bizops')
   old=(control.dt.datetime.now(control.dt.timezone.utc)-control.dt.timedelta(hours=25)).isoformat();c.db.execute('UPDATE escalations SET sent_at=?',(old,));c.db.commit()
   c.scan(True);c.flush();self.assertEqual(len(b.alerts),2);self.assertEqual(b.alerts[1][0],'claude-code')
 def test_cleared_blocker_resolves_and_failed_send_retries(self):
  class F(Bus):
   fail=True
   def alert(self,to,cid,text):
    if self.fail:raise TimeoutError('x')
    return super().alert(to,cid,text)
  with tempfile.TemporaryDirectory() as tmp:
   b=F();t=base(execution_actor='Damian');c=ctl(tmp,[t],b);c.scan(True);self.assertIn('error',c.flush()[0]);b.fail=False;c.seen=set();c.scan(True);c.flush();self.assertEqual(len(b.alerts),1)
   t['execution_actor']='Compliance';c.seen=set();c.scan(True);c.flush();self.assertIsNotNone(c.db.execute('SELECT resolved_at FROM escalations').fetchone()[0])
 def test_blocked_task_resumes_when_its_blocker_closes(self):
  dep=base(id='d',prefix='AB1-T2',name='prereq',execution_actor='Damian',status={'is_closed_type':False});t=base(id='t')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[dep,t],b);d={'mode':'execution','requested_at':control.now(),'blocker':'cannot start, AB1-T2 not done','fingerprint':control.fingerprint(t),'attempt':1,'task_name':'x'}
   c.db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',('pd-old','1','t','compliance','compliance','blocked',json.dumps(d),control.now()));c.db.commit()
   c.scan(True);self.assertEqual(b.sent,[]);dep['status']['is_closed_type']=True;c.scan(True)
   self.assertEqual(len(b.sent),1);self.assertTrue(b.sent[0][1].endswith('-r2'));self.assertNotEqual(b.sent[0][1],'pd-old')
   self.assertEqual(c.db.execute("SELECT state FROM events WHERE cid='pd-old' ORDER BY id DESC").fetchone()[0],'superseded_by_resume')
 def test_blocked_task_resumes_when_someone_changes_it_and_stops_after_three(self):
  t=base(id='t',next_activity='was')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[t],b);d={'mode':'execution','requested_at':control.now(),'blocker':'x','fingerprint':control.fingerprint(t),'attempt':1,'task_name':'x'}
   c.db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',('pd-old','1','t','compliance','compliance','blocked',json.dumps(d),control.now()));c.db.commit()
   c.scan(True);self.assertEqual(b.sent,[]);t['next_activity']='now fixed';c.scan(True);self.assertEqual(len(b.sent),1)
   d['attempt']=3;c.db.execute('UPDATE runs SET state=?,data=?',('blocked',json.dumps(d)));c.db.commit();t['next_activity']='again';c.scan(True);c.flush();self.assertEqual(len(b.sent),1);self.assertTrue(any('BLOCKED REPEATEDLY' in a[2] for a in b.alerts))
 def test_missing_actor_is_assigned_and_read_back(self):
  t=base(execution_actor='')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[t],b);c.scan(True);self.assertEqual(t['execution_actor'],'Compliance');self.assertEqual(c.a.patches[0][1],{'execution_actor':'Compliance'});self.assertEqual(len(b.sent),1)
 def test_no_clear_owner_escalates(self):
  t=base(execution_actor='')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[t],b,name='Knowledge Base');c.scan(True);c.flush();self.assertEqual(b.sent,[]);self.assertTrue(any('NO EXECUTION OWNER' in a[2] for a in b.alerts))
 def test_one_task_per_function_per_run(self):
  a,d=base(id='a',prefix='AB1-T1'),base(id='b',prefix='AB1-T2')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[a,d],b);c.scan(True);self.assertEqual(len(b.sent),1)
 def test_read_only_scan_sends_nothing_and_previews(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base()],b);out=c.scan(False);c.flush;self.assertEqual(b.sent,[]);self.assertIn('would_dispatch',[x['state'] for x in out])
 def test_one_status_failure_does_not_stop_reconcile(self):
  class B(Bus):
   def status(self,cid):
    if cid=='a':raise TimeoutError('slow')
    return {'from':'claude-systems','to':'systems','state':'acknowledged','acknowledged_by':'systems','replies':[{'text':'STATUS: COMPLETE'}]}
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,[base()],B())
   for cid,task in (('a','1'),('b','2')):c.db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',(cid,'p',task,'systems','systems','dispatched',json.dumps({'mode':'execution','requested_at':control.now()}),control.now()))
   c.db.commit();self.assertEqual([r.get('state') for r in c.reconcile()],['dispatched','awaiting_verification'])
if __name__=='__main__':unittest.main()
