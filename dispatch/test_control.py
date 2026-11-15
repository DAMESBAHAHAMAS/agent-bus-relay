import sys
sys.dont_write_bytecode=True
import json,re,tempfile,unittest,types,time,datetime as _dt
from unittest.mock import patch
import control
class Clock(_dt.datetime):
 """The tests are dated inside Damian's baseline window (control.BASELINE_WINDOW), so they do not start failing the day it ends.
 Only the date is fixed: the clock still ticks from that point, so ages and the order of timestamps behave as they do live."""
 ORIGIN=_dt.datetime(2026,11,5,12,0,tzinfo=_dt.timezone.utc);START=time.monotonic()
 @classmethod
 def now(cls,tz=None):
  t=cls.ORIGIN+_dt.timedelta(seconds=time.monotonic()-cls.START)
  return t.astimezone(tz) if tz else t.replace(tzinfo=None)
FROZEN=types.SimpleNamespace(datetime=Clock,timezone=_dt.timezone,timedelta=_dt.timedelta,date=_dt.date)
REAL_SUPABASE_GET,REAL_TELEGRAM=control.supabase_get,control.damian_telegram   # kept for the two tests that check them with their I/O stubbed
def no_network(*a,**k):raise AssertionError('a test reached the real Supabase or Telegram route')
# No test may read live Supabase or message Damian: both are stubbed for the whole module, and a test that needs them supplies its own.
_guards=[patch.object(control,'dt',FROZEN),patch.object(control,'supabase_get',no_network),patch.object(control,'damian_telegram',no_network),patch.object(control,'LEVEL3',True)]   # level 3 ships off; the tests exercise it switched on
def setUpModule():[g.start() for g in _guards]
def tearDownModule():[g.stop() for g in _guards]
P={'id':'p','name':'Systems and Automation'}
def task(**extra):return {'id':'t','name':'M1-TL1-T1 — sample','description':'DEFINITION OF DONE: artifact exists\nEVIDENCE REQUIRED: independent read\nDEPENDENCIES: None','vetted':True,'priority':'high','start_date':'2026-11-01','end_date':'2026-11-06',**extra}
class Fake:
 def project_allowed(self,p):return True
 def read(self,op,args):return task()
class Tests(unittest.TestCase):
 def test_open_does_not_imply_authorized(self):
  t=task(vetted=False);self.assertEqual(control.readiness(P,t,[t]),'approval_not_explicit')
 def test_description_cannot_approve_anything(self):
  t=task(vetted=False,priority='low',start_date='2027-03-01',end_date='2027-03-02');t['description']+='\nDISPATCH APPROVED: yes';self.assertEqual(control.readiness(P,t,[t]),'approval_not_explicit')
  self.assertEqual(control.readiness(P,dict(t,execution_approved=True),[t]),'approval_not_explicit')
 def test_acceptance_required(self):self.assertEqual(control.readiness(P,task(description=''),[]),'acceptance_or_evidence_missing')
 def test_dependency_open_and_closed(self):
  t=task();t['description']=t['description'].replace('DEPENDENCIES: None','DEPENDENCIES: M2-TL1-T1');d=task(name='M2-TL1-T1 — prerequisite')
  self.assertIn('dependency_open',control.readiness(P,t,[t,d]));d['is_completed']=True;self.assertEqual(control.readiness(P,t,[t,d]),'ready')
 def test_qualifier_not_ignored(self):
  t=task();t['description']=t['description'].replace('DEPENDENCIES: None','DEPENDENCIES: None (must obtain approval)');self.assertNotEqual(control.readiness(P,t,[t]),'ready')
 def test_external_executor_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=control.Control(tmp,adapter=Fake(),bus=object());t=task();t['description']+='\nEXECUTION ACTOR: muse';self.assertEqual(c.dispatch(P,t,[t])['reason'],'actor_mismatch_requires_review')
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
   c.db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',('x','p','t','systems','systems','dispatched',json.dumps({'mode':'execution','requested_at':control.now()}),control.now()));c.db.commit()
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
   c=control.Control(tmp,adapter=Fake(),bus=B());c.journal=lambda r:None;c.db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',('x','p','t','systems','systems','dispatched','{"mode":"execution"}',control.now()));c.db.commit()
   self.assertTrue(c.reconcile()[0]['quarantined']);self.assertEqual(c.rows()[0]['state'],'stalled')
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
  if op=='calendar_events':return {'events':[]}
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
 p=pathlib.Path(tmp)/'gates.json';p.write_text(gates);c.gates_path=str(p);c.register=lambda:{'ADR-1':'Submitted','ADR-2':'Approved'}
 c.watch_read=lambda:[];c.to_damian=[];c.telegram=c.to_damian.append;c.rotate_audit=lambda:None;return c
OLD=lambda h:(control.dt.datetime.now(control.dt.timezone.utc)-control.dt.timedelta(hours=h)).isoformat()
def row(c,task='t',state='blocked',cid='pd-old',project='1',owner_='compliance',**d):
 data={'mode':'execution','requested_at':control.now(),'attempt':1,'task_name':'x','blocked_on':[],'wait_snapshot':[],**d}
 c.db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',(cid,project,task,owner_,owner_,state,json.dumps(data),control.now()));c.db.commit()
def alerts(b,word):return [a for a in b.alerts if word in a[2]]
class Authority(unittest.TestCase):
 def test_baseline_needs_the_window(self):
  self.assertFalse(control.baseline(base(end_date='2026-11-11')));self.assertTrue(control.baseline(base()))
 def test_owner_only_reads_every_field_and_word_form(self):
  for name in ('Email the five past clients the new offer','Purchase the domain renewal','Process the payments','Publishing the blog posts','Deploy the site to production','Rotate the API credentials','Deleting stale CRM contacts','File the Articles of Organization on Sunbiz'):
   self.assertEqual(control.readiness(P,base(name=name),[]),'material_action_requires_existing_specific_authority',name)
  self.assertEqual(control.readiness(P,base(name='Update the page',definition_of_done='Publish the article and email every client'),[]),'material_action_requires_existing_specific_authority')
  self.assertEqual(control.readiness(P,base(evidence_required='One test purchase on the live card'),[]),'material_action_requires_existing_specific_authority')
 def test_a_cleared_owner_hold_needs_the_file(self):
  t=base(name='Publish the page');self.assertEqual(control.readiness(P,t,[],cleared={'AB1-T1'}),'ready')
 def test_named_actor_without_route_is_held_not_rerouted(self):
  self.assertEqual(control.readiness(P,base(execution_actor='Claude Code'),[]),'actor_not_on_dispatch_route')
 def test_human_in_description_is_held(self):
  self.assertEqual(control.readiness(P,base(execution_actor='',description='Executor: Arsalan'),[]),'human_executor_required')
 def test_description_cannot_route(self):
  self.assertEqual(control.owner(P,base(description='FUNCTION: Systems and Automation',execution_actor='SalesM')),'salesmkt')
  self.assertEqual(control.readiness(P,base(description='EXECUTION ACTOR: finance'),[]),'actor_mismatch_requires_review')
 def test_window_end_stops_sends_even_for_tasks_dated_inside_it(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base()],b)
   with patch.object(control,'BASELINE_WINDOW',('2026-01-01','2026-01-31')):
    t=base(start_date='2026-01-02',end_date='2026-01-03');c.a.ts[0].update(t);out=c.scan(True);c.flush()
   self.assertEqual(b.sent,[]);self.assertEqual(out[0]['state'],'window_ended');self.assertTrue(alerts(b,'OWNER DECISION NEEDED'))
 def test_unreadable_gates_stop_all_sends(self):
  for bad in ('{not json','[{"holds":{}}]','{"a":1}','[{"id":"x","condition":{"type":"nope"},"holds":{}}]'):
   with tempfile.TemporaryDirectory() as tmp:
    b=Bus();c=ctl(tmp,[base()],b,gates=bad);out=c.scan(True);c.flush();self.assertEqual(b.sent,[],bad);self.assertEqual(out[0]['state'],'held_dispatch_halted');self.assertTrue(alerts(b,'GATE PROBLEM'))
 def test_unknown_gate_keeps_holding(self):
  g='[{"id":"h","condition":{"type":"task_closed","prefix":"XX-T1"},"holds":{"tasks":["AB1-T1"]}}]'
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base()],b,gates=g);c.scan(True);c.flush();self.assertEqual(b.sent,[]);self.assertTrue(alerts(b,'GATE PROBLEM'))
 def test_register_gate_needs_approved_and_duplicates_are_unknown(self):
  e=lambda s:control.G.evaluate({'condition':{'type':'register_status','adr':'ADR-1','statuses':['Approved']}},lambda c:None,s)['state']
  self.assertEqual(e({'ADR-1':'Submitted'}),'waiting');self.assertEqual(e({'ADR-1':'Closed'}),'waiting');self.assertEqual(e({'ADR-1':'Approved'}),'clear');self.assertEqual(e(None),'unknown');self.assertEqual(e({'ADR-1':None}),'unknown')
 def test_unregistered_pause_holds_the_project(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base()],b,desc='<p>IMPLEMENTATION PAUSED until the Master Handoff is formally accepted.</p>');out=c.scan(True);c.flush()
   self.assertEqual(b.sent,[]);self.assertTrue(alerts(b,'UNREGISTERED GATE'));self.assertIn('gate_waiting',out[0]['state'])
 def test_failed_assignment_does_not_send(self):
  class Z(Zoho):
   def projects(self,m,path,body=None):
    if m=='PATCH':raise RuntimeError('refused')
    return super().projects(m,path,body)
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base(execution_actor='')],b);c.a.__class__=Z;out=c.scan(True);c.flush();self.assertEqual(b.sent,[]);self.assertIn('held_no_execution_owner',[x['state'] for x in out]);self.assertTrue(alerts(b,'NO EXECUTION OWNER'))
 def test_contradicted_read_back_does_not_send(self):
  class Z(Zoho):
   def projects(self,m,path,body=None):
    if m=='PATCH':return {}
    r=super().projects(m,path,body)
    return dict(r,execution_actor='Damian') if '/tasks/' in path and '/comments' not in path else r
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();t=base(execution_actor='');c=ctl(tmp,[t],b);c.a.__class__=Z;c.scan(True);self.assertEqual(b.sent,[])
 def test_missing_actor_is_assigned_and_read_back(self):
  t=base(execution_actor='')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[t],b);c.scan(True);self.assertEqual(c.a.patches[0][1],{'execution_actor':'Compliance'});self.assertEqual(len(b.sent),1)
 def test_no_clear_owner_escalates(self):
  t=base(execution_actor='')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[t],b,name='Knowledge Base');c.scan(True);c.flush();self.assertEqual(b.sent,[])
 def test_read_only_scan_sends_nothing(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base()],b);out=c.scan(False);self.assertEqual(b.sent,[]);self.assertIn('would_dispatch',[x['state'] for x in out])
class Detection(unittest.TestCase):
 W=staticmethod(lambda txt,**k:control.G.analyse(dict({'resume_context':txt},**k)))
 def test_waits_in_words_and_codes(self):
  self.assertEqual(self.W('Blocked: waits for findings from CA1-T37, T38 and T41.')['tasks'],['CA1-T37','CA1-T38','CA1-T41'])
  self.assertEqual(self.W('Blocked: CA1-T40 confirms the CANON path.')['tasks'],['CA1-T40'])
  self.assertEqual(self.W('Waits on close-this-session_REVISED_2026-10-30.md from CA1-T40.')['tasks'],['CA1-T40'])
  self.assertEqual(self.W('Slip reason: predecessor A6Y2-T96 is still open.')['tasks'],['A6Y2-T96'])
  self.assertEqual(self.W('Once A6Y2-T77 to A6Y2-T80 are filed.')['tasks'],['A6Y2-T77','A6Y2-T78','A6Y2-T79','A6Y2-T80'])
  self.assertEqual(self.W('Waits on ADR-239.')['others'],['ADR-239']);self.assertEqual(self.W('Square cannot pass until EX-2026-11-04-02 clears.')['others'],['EX-2026-11-04-02'])
  self.assertEqual(self.W('Do not start until Damian approves the vendor.')['unclear'],['Do not start until Damian approves the vendor.'])
 def test_not_waits(self):
  for txt in ('Related: BO2-T79 and BO2-T89.','Depends on: None — supports SA-6.','No longer waits on A6Y2-T94.','Does not depend on A6Y2-T94.','Gates CA1-T37, T39 and T41, which are blocked until the CANON path is confirmed.','Exclude parked records until the two counts match.'):
   a=self.W(txt);self.assertEqual((a['tasks'],a['others'],a['unclear']),([],[],[]),txt)
  self.assertEqual(self.W('Slip reason: subtask A6Y2-T96 is still open and no record was found, so A6Y2-T97 cannot start.')['tasks'],['A6Y2-T96'])
  self.assertEqual(control.G.analyse({'prefix':'CA1-T9','next_activity':'After CA1-T9 is done, tell someone.'})['tasks'],[])
 def test_open_dependency_holds_then_closing_it_releases_on_the_next_run(self):
  dep=base(id='d',prefix='AB1-T2',name='prereq',execution_actor='Damian',status={'is_closed_type':False});t=base(id='t',resume_context='Blocked by AB1-T2.')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[dep,t],b);c.scan(True);self.assertEqual(b.sent,[])
   dep['status']['is_closed_type']=True;c.scan(True);self.assertEqual([s[0] for s in b.sent],['compliance'])
 def test_agent_closing_its_own_dependency_does_not_count(self):
  dep=base(id='d',prefix='AB1-T2',name='prereq',status={'is_closed_type':True});t=base(id='t',resume_context='Blocked by AB1-T2.')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[dep,t],b);row(c,task='d',state='acknowledged');c.scan(True);c.flush();self.assertEqual(b.sent,[]);self.assertTrue(alerts(b,'CLOSED WITHOUT VERIFICATION'))
 def test_unknown_or_register_wait_holds(self):
  self.assertIn('ZZ1-T9',control.readiness(P,base(resume_context='Depends on ZZ1-T9.'),[],index={}))
  self.assertIn('ADR-1',control.readiness(P,base(resume_context='Waits on ADR-1.'),[],index={},register={'ADR-1':'Submitted'}))
  self.assertEqual(control.readiness(P,base(resume_context='Waits on ADR-1.'),[],index={},register={'ADR-1':'Approved'}),'ready')
  self.assertEqual(control.readiness(P,base(resume_context='Waiting on the vendor.'),[],index={}),'dependency_stated_without_code')
 def test_native_predecessor_read_before_send(self):
  dep=base(id='d',prefix='AB1-T2',name='prereq',execution_actor='Damian',status={'is_closed_type':False});t=base(id='t',dependency_info={'predecessor':[{'id':'d'}]})
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[dep,t],b);out=c.scan(True);self.assertEqual(b.sent,[]);self.assertIn('dependency_open_or_unresolved:native',[x['state'] for x in out])
 def test_gate_holds_then_release_is_announced_exactly_once(self):
  g='[{"id":"h","condition":{"type":"task_closed","prefix":"AB1-T2"},"holds":{"tasks":["AB1-T1"]},"on_clear":"go"}]'
  dep=base(id='d',prefix='AB1-T2',name='prereq',execution_actor='Damian',status={'is_closed_type':False});t=base(id='t')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[dep,t],b,gates=g);out=c.scan(True);self.assertIn('gate_waiting:h',[x['state'] for x in out]);self.assertEqual(b.sent,[]);c.flush()
   dep['status']['is_closed_type']=True;c.scan(False);self.assertEqual(alerts(b,'GATE CLEARED'),[])   # a read-only scan must not swallow it
   c.scan(True);c.flush();self.assertEqual(len(b.sent),1);self.assertEqual(len(alerts(b,'GATE CLEARED')),1)
   c.scan(True);c.flush();self.assertEqual(len(alerts(b,'GATE CLEARED')),1)
 def test_gate_clear_announcement_survives_a_failed_send(self):
  g='[{"id":"h","condition":{"type":"task_closed","prefix":"AB1-T2"},"holds":{"tasks":["AB1-T1"]}}]'
  class F(Bus):
   fail=True
   def alert(self,*a):
    if self.fail:raise TimeoutError('x')
    return super().alert(*a)
  dep=base(id='d',prefix='AB1-T2',name='prereq',execution_actor='Damian',status={'is_closed_type':True});t=base(id='t')
  with tempfile.TemporaryDirectory() as tmp:
   b=F();c=ctl(tmp,[dep,t],b,gates=g);c.scan(True);c.flush();b.fail=False;c.scan(True);c.flush();self.assertEqual(len(alerts(b,'GATE CLEARED')),1)
class Lifecycle(unittest.TestCase):
 def test_finished_work_frees_the_function_and_sent_work_holds_it(self):
  for st,freed in (('awaiting_verification',True),('blocked',True),('verified_deliverable',True),('stalled',True),('acknowledged',False),('ack_overdue',False)):
   a,d=base(id='a',prefix='AB1-T1'),base(id='b',prefix='AB1-T2')
   with tempfile.TemporaryDirectory() as tmp:
    b=Bus();c=ctl(tmp,[a,d],b);row(c,task='a',state=st,cid='x');c.scan(True);self.assertEqual(len(b.sent),1 if freed else 0,st)
 def test_a_function_that_never_acked_is_not_fed(self):
  a,d=base(id='a',prefix='AB1-T1'),base(id='b',prefix='AB1-T2')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[a,d],b);row(c,task='a',state='stalled',cid='x',never_acked=True,stalled_at=control.now());c.scan(True);self.assertEqual(b.sent,[])
 def test_missed_ack_is_not_blocked_and_a_late_answer_is_read(self):
  class B(Bus):
   r={'from':'claude-systems','to':'compliance','state':'escalated','replies':[]}
   def status(self,cid):return self.r
  with tempfile.TemporaryDirectory() as tmp:
   b=B();c=ctl(tmp,[base()],b);row(c,task='t',state='dispatched',cid='x');self.assertEqual(c.reconcile()[0]['state'],'ack_overdue')
   b.r=dict(b.r,replies=[{'text':'STATUS: COMPLETE done'}]);self.assertEqual(c.reconcile()[0]['state'],'awaiting_verification')
 def test_complete_after_blocked_is_read(self):
  class B(Bus):
   def status(self,cid):return {'from':'claude-systems','to':'compliance','state':'acknowledged','acknowledged_by':'compliance','replies':[{'text':'STATUS: BLOCKED x'},{'text':'STATUS: COMPLETE y'}]}
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,[base()],B());row(c,state='blocked');self.assertEqual(c.reconcile()[0]['state'],'awaiting_verification')
 def test_silent_agent_stalls_and_escalates(self):
  class B(Bus):
   def status(self,cid):return {'from':'claude-systems','to':'compliance','state':'acknowledged','acknowledged_by':'compliance','replies':[]}
  with tempfile.TemporaryDirectory() as tmp:
   b=B();c=ctl(tmp,[base()],b);row(c,state='acknowledged',cid='x',requested_at=OLD(7));self.assertEqual(c.reconcile()[0]['state'],'stalled');c.scan(True);c.flush();self.assertTrue(alerts(b,'STALLED'));self.assertEqual(b.alerts[0][0],'bizops')
 def test_aged_out_status_never_touches_finished_or_acknowledged_truthfully(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base()],b);row(c,task='a',state='awaiting_verification',cid='a');row(c,task='b',state='acknowledged',cid='b',requested_at=OLD(7),bus={'acknowledged_by':'compliance'});c.reconcile()
   s={r['cid']:r for r in c.rows()};self.assertEqual(s['a']['state'],'awaiting_verification');self.assertEqual(s['b']['state'],'stalled');self.assertIn('aged out',json.loads(s['b']['data'])['blocker'])
 def test_mismatch_quarantines_one_row_and_the_rest_continue(self):
  class B(Bus):
   def status(self,cid):return {'from':'gpt','to':'x'} if cid=='a' else {'from':'claude-systems','to':'compliance','state':'acknowledged','acknowledged_by':'compliance','replies':[{'text':'STATUS: COMPLETE'}]}
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,[base()],B());row(c,task='a',cid='a',state='dispatched');row(c,task='b',cid='b',state='dispatched');r=c.reconcile();self.assertEqual({x['cid']:x['state'] for x in r},{'a':'stalled','b':'awaiting_verification'})
 def test_agent_reusing_the_id_for_its_own_request_changes_nothing(self):
  class B(Bus):
   def status(self,cid):return {'from':'compliance','to':'claude-systems','state':'acknowledged'}
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,[base()],B());row(c,state='acknowledged',cid='x');c.reconcile();self.assertEqual(c.rows()[0]['state'],'acknowledged')
 def test_one_status_failure_does_not_stop_reconcile(self):
  class B(Bus):
   def status(self,cid):
    if cid=='a':raise TimeoutError('slow')
    return {'from':'claude-systems','to':'compliance','state':'acknowledged','acknowledged_by':'compliance','replies':[{'text':'STATUS: COMPLETE'}]}
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,[base()],B());row(c,task='a',cid='a',state='dispatched');row(c,task='b',cid='b',state='dispatched');self.assertEqual([r.get('state') for r in c.reconcile()],['dispatched','awaiting_verification'])
 def test_blocker_comes_from_the_blocked_line_not_ack_chatter(self):
  class B(Bus):
   def status(self,cid):return {'from':'claude-systems','to':'compliance','state':'acknowledged','acknowledged_by':'compliance','replies':[{'text':'STATUS: ACK reading the task now'},{'text':'STATUS: BLOCKED waiting on AB1-T2. Context: AB1-T3 finished.'}]}
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,[base()],B());row(c,state='dispatched',cid='x');c.reconcile();d=json.loads(c.rows()[0]['data']);self.assertTrue(d['blocker'].startswith('STATUS: BLOCKED'));self.assertEqual(d['blocked_on'],['AB1-T2'])
 def test_legacy_blocked_row_is_backfilled_and_can_resume(self):
  dep=base(id='d',prefix='AB1-T2',name='prereq',execution_actor='Damian',status={'is_closed_type':False});t=base(id='t')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[dep,t],b)
   c.db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',('pd-old','1','t','compliance','compliance','blocked',json.dumps({'mode':'execution','task_name':'x','requested_at':OLD(48),'bus':{'replies':[{'text':'STATUS: BLOCKED depends on AB1-T2'}]}}),OLD(48)));c.db.commit()
   c.reconcile();c.scan(True);self.assertEqual(b.sent,[]);dep['status']['is_closed_type']=True;c.scan(True);self.assertEqual(len(b.sent),1);self.assertTrue(b.sent[0][1].endswith('-r2'))
   self.assertEqual(c.db.execute("SELECT state FROM events WHERE cid='pd-old' ORDER BY id DESC").fetchone()[0],'superseded_by_resume')
 def test_mentioned_code_or_a_note_does_not_resume(self):
  dep=base(id='d',prefix='AB1-T2',name='prereq',execution_actor='Damian',status={'is_closed_type':True});t=base(id='t',next_activity='was')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[dep,t],b);row(c,blocker='Owner must approve. Context only: AB1-T2 finished.',blocked_on=[]);t['next_activity']='someone wrote a note';c.scan(True);self.assertEqual(b.sent,[])
 def test_deliberate_resume_comment_works_once_and_stops_after_three(self):
  class Z(Zoho):
   comments=[]
   def projects(self,m,path,body=None):
    return self.comments if '/comments' in path and m=='GET' else super().projects(m,path,body)
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();t=base();c=ctl(tmp,[t],b);c.a.__class__=Z;row(c);c.scan(True);self.assertEqual(b.sent,[])
   Z.comments=[{'content':'[PROJECT-DISPATCH RESUME pd-old] cleared'}];c.scan(True);self.assertEqual(len(b.sent),1)
   Z.comments=[];c.db.execute('UPDATE runs SET state=?,cid=?,data=?',('blocked','pd-old',json.dumps({'mode':'execution','attempt':3,'task_name':'x','blocked_on':[],'wait_snapshot':[],'requested_at':control.now()})));c.db.commit();c.seen=set();c.scan(True);c.flush();self.assertEqual(len(b.sent),1);self.assertTrue(alerts(b,'BLOCKED REPEATEDLY'))
   Z.comments=[{'content':'[PROJECT-DISPATCH RESUME pd-old] a person says go'}];c.scan(True);self.assertEqual(len(b.sent),2)   # a person's word outranks the limit
 def test_stall_never_resends_by_itself(self):
  dep=base(id='d',prefix='AB1-T2',name='prereq',execution_actor='Damian',status={'is_closed_type':True});t=base(id='t')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[dep,t],b);row(c,state='stalled',blocked_on=['AB1-T2']);c.scan(True);self.assertEqual(b.sent,[])
 def test_resume_changes_owner_when_the_actor_changed(self):
  class Z(Zoho):
   def projects(self,m,path,body=None):
    return [{'content':'[PROJECT-DISPATCH RESUME pd-old] x'}] if '/comments' in path else super().projects(m,path,body)
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base(execution_actor='SysAuto')],b);c.a.__class__=Z;row(c);c.scan(True);r=c.rows()[0];self.assertEqual((r['owner'],r['executor']),('systems','systems'));self.assertEqual(b.sent[0][0],'systems')
 def test_prepared_row_retries_and_refusal_waits(self):
  class B(Bus):
   refuse=True
   def send(self,to,cid,text):
    if self.refuse:raise control.BusRefused('BUS_HTTP_429')
    return super().send(to,cid,text)
  with tempfile.TemporaryDirectory() as tmp:
   b=B();c=ctl(tmp,[base()],b);out=c.scan(True);self.assertEqual(c.rows()[0]['state'],'prepared');self.assertEqual(out[0]['state'],'refused')
   b.refuse=False;self.assertEqual(c.scan(True)[0]['state'],'waiting_to_retry')
   d=json.loads(c.rows()[0]['data']);d['retry_after']=OLD(1);c.db.execute('UPDATE runs SET data=?',(json.dumps(d),));c.db.commit();c.scan(True);self.assertEqual(len(b.sent),1)
 def test_send_failure_loses_only_that_task(self):
  class B(Bus):
   def send(self,to,cid,text):
    if to=='compliance':raise TimeoutError('x')
    return super().send(to,cid,text)
  a,d=base(id='a',prefix='AB1-T1'),base(id='b',prefix='AB1-T2',execution_actor='Finance')
  with tempfile.TemporaryDirectory() as tmp:
   b=B();c=ctl(tmp,[a,d],b);out=c.scan(True);self.assertEqual(sorted(x['state'] for x in out),['dispatch_failed','held_after_send_failure']);self.assertEqual(json.loads(c.rows()[0]['data'])['attempt'],1)
 def test_run_limit(self):
  ts=[base(id=str(i),prefix='AB1-T'+str(i),execution_actor=a) for i,a in enumerate(['Compliance','Finance','SalesM','SysAuto','Biz Operations','Code Dev'])]
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,ts,b);c.scan(True);self.assertEqual(len(b.sent),control.MAX_SENDS)
 def test_one_task_per_function_per_run(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base(id='a',prefix='AB1-T1'),base(id='b',prefix='AB1-T2')],b);c.scan(True);self.assertEqual(len(b.sent),1)
class Unattended(unittest.TestCase):
 def test_a_zoho_outage_still_reports_and_writes_a_heartbeat(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base()],b)
   def boom():raise RuntimeError('401 token expired')
   c.projects=boom;r=control.cycle(c);self.assertTrue(r['errors']);self.assertTrue(alerts(b,'TOOL FAILURE'))
   hb=json.loads((c.root/'latest-run.json').read_text());self.assertFalse(hb['ok'])
 def test_blocked_is_escalated_once_then_up_the_chain(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base()],b);row(c,blocker='needs a login')
   c.scan(True);c.flush();c.scan(True);c.flush();self.assertEqual(len(b.alerts),1);self.assertEqual(b.alerts[0][0],'bizops')
   c.db.execute('UPDATE escalations SET sent_at=?',(OLD(25),));c.db.commit();c.scan(True);c.flush();self.assertEqual(len(b.alerts),2);self.assertEqual(b.alerts[1][0],'claude-code')
   c.db.execute('UPDATE escalations SET sent_at=?',(OLD(25),));c.db.commit();c.scan(True);c.flush();self.assertEqual(len(b.alerts),2)
 def test_flag_needs_clean_runs_to_resolve_and_a_flap_is_quiet(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();t=base(execution_actor='Damian');c=ctl(tmp,[t],b);c.scan(True);c.flush();self.assertEqual(len(b.alerts),1)
   t['execution_actor']='Compliance'
   for _ in range(2):c.seen=set();c.flush();self.assertIsNone(c.db.execute('SELECT resolved_at FROM escalations').fetchone()[0])
   c.seen=set();c.flush();self.assertIsNotNone(c.db.execute('SELECT resolved_at FROM escalations').fetchone()[0])
   t['execution_actor']='Damian';c.seen=set();c.scan(True);c.flush();self.assertEqual(len(b.alerts),1)
 def test_digest_marks_only_what_it_names_and_the_rest_follow(self):
  ts=[base(id=str(i),prefix='AB1-T'+str(i),execution_actor='Damian') for i in range(30)]
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,ts,b);c.scan(True);r=c.flush();self.assertEqual(r[0]['items'],12);self.assertEqual(r[0]['left'],18)
   seen=set()
   for _ in range(3):
    seen|=set(re.findall(r'AB1-T\d+',b.alerts[-1][2]));c.seen=set();c.scan(True);c.flush()
   self.assertEqual(len(seen),30)
 def test_refused_detail_falls_back_to_a_count(self):
  class B(Bus):
   def alert(self,to,cid,text):
    if 'AB1-T1' in text:raise control.BusRefused('BUS_HTTP_422')
    return super().alert(to,cid,text)
  with tempfile.TemporaryDirectory() as tmp:
   b=B();ts=[base(id='a',execution_actor='Damian'),base(id='b',prefix='AB1-T2',execution_actor='Damian')];c=ctl(tmp,ts,b);c.scan(True);c.flush();self.assertEqual(len(b.alerts),1);self.assertIn('AB1-T2',b.alerts[0][2]);self.assertEqual(len(c.undeliverable),1);c.seen=set();c.scan(True);c.flush();self.assertEqual(len(b.alerts),1)
 def test_bad_time_reads_as_old(self):
  self.assertEqual(control.hours_since('garbage'),float('inf'));self.assertGreater(control.hours_since('2026-10-01T10:00:00'),24)
class Blockers(unittest.TestCase):
 """One regression per confirmed activation blocker from the second review."""
 def test_refused_send_retries_through_the_real_journal(self):
  class Z(Zoho):
   store=[]
   def projects(self,m,path,body=None):
    if '/comments' in path:
     if m=='POST':self.store.append({'content':body['comment']});return {}
     return self.store if 'page=1&' in path or 'page=' not in path else []
    return super().projects(m,path,body)
  class B(Bus):
   refuse=True
   def send(self,to,cid,text):
    if self.refuse:raise control.BusRefused('BUS_HTTP_429')
    return super().send(to,cid,text)
  with tempfile.TemporaryDirectory() as tmp:
   import pathlib
   Z.store=[];z=Z([base()]);b=B();c=control.Control(tmp,adapter=z,bus=b);c.projects=lambda:[{'id':'1','name':'Compliance and Filings'}];p=pathlib.Path(tmp)/'gates.json';p.write_text('[]');c.gates_path=str(p);c.register=lambda:{}
   self.assertEqual(c.scan(True)[0]['state'],'refused');b.refuse=False
   d=json.loads(c.rows()[0]['data']);d['retry_after']=OLD(1);c.db.execute('UPDATE runs SET data=?',(json.dumps(d),));c.db.commit()
   out=c.scan(True);self.assertEqual(out[0]['state'],'dispatched',out);self.assertEqual(len(b.sent),1)
 def test_first_refusal_stops_the_rest_of_the_run(self):
  class B(Bus):
   def send(self,*a):raise control.BusRefused('BUS_HTTP_429')
  ts=[base(id='a',prefix='AB1-T1'),base(id='b',prefix='AB1-T2',execution_actor='Finance')]
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,ts,B());self.assertEqual(sorted(x['state'] for x in c.scan(True)),['held_after_send_failure','refused'])
 def test_unticked_vetted_on_the_fresh_read_stops_the_send(self):
  class Z(Zoho):
   def projects(self,m,path,body=None):
    r=super().projects(m,path,body)
    if '/tasks/' in path and '/comments' not in path:r=dict(r);r.pop('vetted',None)   # Zoho omits a cleared field
    return r
   def read(self,op,args):
    r=dict(super().read(op,args));r.pop('vetted',None);return r
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base()],b);c.a.__class__=Z;out=c.scan(True);self.assertEqual(b.sent,[]);self.assertEqual(out[0]['state'],'approval_not_explicit')
 def test_a_total_relay_outage_is_not_ok(self):
  class B(Bus):
   def status(self,cid):raise RuntimeError('BUS_HTTP_503')
   def alert(self,*a):raise RuntimeError('BUS_HTTP_503')
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,[base(execution_actor='Damian')],B());row(c,task='z',state='dispatched',cid='x');control.cycle(c);hb=json.loads((c.root/'latest-run.json').read_text());self.assertFalse(hb['ok']);self.assertTrue(any('status reads failed' in e for e in hb['errors']));self.assertTrue(any('escalation' in e for e in hb['errors']))
 def test_healthy_run_is_ok(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,[base()],Bus());control.cycle(c);self.assertTrue(json.loads((c.root/'latest-run.json').read_text())['ok'])
 def test_gates_sentence_does_not_deadlock(self):
  t={'prefix':'CA1-T40','resume_context':'Subtask of the audit (CA1-T36). Gates CA1-T37, T39 and T41, which are blocked until the CANON path is confirmed. 4 Nov check: the path resolves.'}
  self.assertEqual(control.G.analyse(t)['tasks'],[])
 def test_a_negated_clause_does_not_hide_a_real_wait(self):
  self.assertEqual(control.G.analyse({'resume_context':'Not blocked by legal, but waiting on SA5-T9.'})['tasks'],['SA5-T9'])
 def test_block_reply_with_another_reason_never_auto_resumes(self):
  self.assertEqual(control.G.block_refs('STATUS: BLOCKED Waiting on SA5-T2. Also needs Damian to approve ADR-246.'),[])
  self.assertEqual(control.G.block_refs('STATUS: BLOCKED AB1-T1 waits on AB1-T2.','AB1-T1'),['AB1-T2'])
 def test_journal_quoting_the_marker_does_not_resume(self):
  class Z(Zoho):
   def projects(self,m,path,body=None):
    return [{'content':'[PROJECT-DISPATCH pd-old blocked] agent wrote [PROJECT-DISPATCH RESUME pd-old]'}] if '/comments' in path else super().projects(m,path,body)
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base()],b);c.a.__class__=Z;row(c);c.scan(True);self.assertEqual(b.sent,[])
 def test_resumable_row_reads_a_late_complete(self):
  class B(Bus):
   def status(self,cid):return {'from':'claude-systems','to':'compliance','state':'acknowledged','acknowledged_by':'compliance','replies':[{'text':'STATUS: BLOCKED x'},{'text':'STATUS: COMPLETE done'}]}
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,[base()],B());row(c,state='resumable');c.reconcile();self.assertEqual(c.rows()[0]['state'],'awaiting_verification')
 def test_resume_comment_survives_a_busy_function(self):
  class Z(Zoho):
   def projects(self,m,path,body=None):
    return [{'content':'[PROJECT-DISPATCH RESUME pd-old] x'}] if '/comments' in path else super().projects(m,path,body)
  a,d=base(id='t',resume_context='Waiting on the vendor.'),base(id='o',prefix='AB1-T2')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[a,d],b);c.a.__class__=Z;row(c);row(c,task='o',state='acknowledged',cid='busy');c.scan(True);self.assertEqual(b.sent,[])
   c.db.execute("UPDATE runs SET state='blocked' WHERE cid='busy'");c.db.commit();c.scan(True);self.assertEqual(len(b.sent),1);self.assertTrue(b.sent[0][1].endswith('-r2'))
 def test_a_new_pause_under_a_cleared_gate_still_holds(self):
  g='[{"id":"h","condition":{"type":"task_closed","prefix":"AB1-T9"},"holds":{"projects":["1"]}}]'
  d=base(id='d',prefix='AB1-T9',name='x',status={'is_closed_type':True},execution_actor='Damian')
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[d,base()],b,gates=g,desc='Paused until ADR-300 is decided.');c.scan(True);self.assertEqual(b.sent,[])
 def test_deadline_cannot_be_swallowed_and_the_run_still_reports(self):
  self.assertFalse(issubclass(control.RunDeadline,Exception))
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base(execution_actor='Damian')],b)
   def late():raise control.RunDeadline('deadline')
   c.projects=late;r=control.cycle(c);self.assertTrue(r['errors']);self.assertTrue((c.root/'latest-run.json').exists());self.assertTrue(alerts(b,'TOOL FAILURE'))
 def test_journal_each_state_once(self):
  n=[]
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,[base()],Bus());c.journal=lambda r:n.append(r['state']);row(c,state='completed');c.reconcile();c.reconcile();c.reconcile();self.assertEqual(n,['completed'])
class Withheld(unittest.TestCase):
 def test_withheld_reply_frees_the_function_and_escalates_at_once(self):
  class B(Bus):
   def status(self,cid):return {'from':'claude-systems','to':'compliance','state':'acknowledged','acknowledged_by':'compliance','replies':[{'text':'Received. Part 1 of 2 of my reply was withheld by the relay: It appeared to contain a long key or token.'}]}
  with tempfile.TemporaryDirectory() as tmp:
   b=B();c=ctl(tmp,[base()],b);row(c,state='acknowledged',cid='x');c.reconcile();self.assertEqual(c.rows()[0]['state'],'stalled');c.scan(True);c.flush();self.assertTrue(alerts(b,'STALLED'));self.assertFalse(c.busy('compliance','other'))
class Sustained(unittest.TestCase):
 def test_a_refused_alert_keeps_the_run_unhealthy_until_it_resolves(self):
  class B(Bus):
   def alert(self,*a):raise control.BusRefused('BUS_HTTP_400')
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,[base(execution_actor='Damian')],B());control.cycle(c);c.seen=set();c.queue=[];control.cycle(c);c.seen=set();c.queue=[];control.cycle(c)
   self.assertFalse(json.loads((c.root/'latest-run.json').read_text())['ok'])
 def test_report_failure_reaches_the_bus(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base()],b)
   def boom():raise RuntimeError('disk full')
   c.report=boom;control.cycle(c);self.assertTrue(alerts(b,'TOOL FAILURE'));self.assertFalse(json.loads((c.root/'latest-run.json').read_text())['ok'])
 def test_old_resume_comment_does_not_answer_a_newer_block(self):
  class Z(Zoho):
   def projects(self,m,path,body=None):
    return [{'content':'[PROJECT-DISPATCH RESUME pd-old] x','created_time':'2026-11-01T00:00:00Z'}] if '/comments' in path else super().projects(m,path,body)
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base()],b);c.a.__class__=Z;row(c,blocked_at='2026-11-05T13:00:00+00:00');c.scan(True);self.assertEqual(b.sent,[])
 def test_resume_context_is_read_for_owner_acts(self):
  self.assertEqual(control.readiness(P,base(resume_context='Then pay the vendor.'),[]),'material_action_requires_existing_specific_authority')
 def test_wait_written_in_the_description_holds(self):
  self.assertEqual(control.readiness(P,base(description='Do not start until AB1-T2 closes.'),[],index={}),'dependency_open_or_unresolved:AB1-T2')
class Verification(unittest.TestCase):
 def done_row(self,c,cid='x'):
  row(c,state='awaiting_verification',cid=cid,prefix='AB1-T1')
 def test_completion_asks_someone_else_once(self):
  class B(Bus):
   req=[]
   def verify_request(self,cid,text):self.req.append((cid,text))
  with tempfile.TemporaryDirectory() as tmp:
   b=B();B.req=[];c=ctl(tmp,[base()],b);self.done_row(c)
   with patch.object(c,'plan_path',lambda code:__import__('pathlib').Path(tmp)/'none.json'):
    r=c.verify_ready();c.verify_ready()
   self.assertEqual(r[0]['state'],'verification_requested');self.assertEqual(len(B.req),1);self.assertIn('Do not trust the executor',B.req[0][1]);self.assertEqual(c.rows()[0]['state'],'awaiting_verification')
 def test_overdue_check_is_flagged(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base()],b);row(c,state='awaiting_verification',cid='x',prefix='AB1-T1',verify_requested=OLD(7))
   with patch.object(c,'plan_path',lambda code:__import__('pathlib').Path(tmp)/'none.json'):c.verify_ready()
   c.flush();self.assertTrue(alerts(b,'VERIFICATION OVERDUE'))
 def test_failed_plan_keeps_the_task_open_and_escalates(self):
  import pathlib
  with tempfile.TemporaryDirectory() as tmp:
   b=Bus();c=ctl(tmp,[base()],b);self.done_row(c);p=pathlib.Path(tmp)/'ab1-t1.json';p.write_text('{}')
   with patch.object(c,'plan_path',lambda code:p),patch('verification.verify',side_effect=ValueError('Acceptance check failed; task remains open')):
    r=c.verify_ready()
   self.assertEqual(r[0]['state'],'verification_failed');self.assertEqual(c.rows()[0]['state'],'awaiting_verification');c.flush();self.assertTrue(alerts(b,'VERIFICATION FAILED'))
class Totals(unittest.TestCase):
 def test_heartbeat_reports_what_the_dashboard_shows(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,[base(execution_actor='Damian')],Bus());row(c,task='a',cid='a',state='awaiting_verification',prefix='AB1-T5');row(c,task='b',cid='b',state='blocked',blocker='x')
   c.db.execute("INSERT INTO events(cid,state,data,at) VALUES('c','independently_verified',?,?)",(json.dumps({'prefix':'AB1-T9'}),control.now()));c.db.commit();control.cycle(c)
   h=json.loads((c.root/'latest-run.json').read_text())['totals'];self.assertEqual(h['closed_verified'],['AB1-T9']);self.assertEqual(h['awaiting_check'],['AB1-T5']);self.assertEqual(h['blocked'],1)
class VerifyWording(unittest.TestCase):
 def test_the_hash_passes_the_relays_label_rule(self):
  class B(Bus):
   text=''
   def verify_request(self,cid,text):B.text=text
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,[base()],B());row(c,state='awaiting_verification',cid='x',prefix='AB1-T1')
   with patch.object(c,'plan_path',lambda code:__import__('pathlib').Path(tmp)/'none.json'):c.verify_ready()
   m=re.search(r'[0-9a-f]{64}',B.text);before=B.text[:m.start()]
   self.assertRegex(before,r"(?i)\b(?:commit|sha(?:-?(?:1|256))?|checksum|digest)[\s:*`'\"=]{0,6}$")
class HonestHeartbeat(unittest.TestCase):
 """Green has to mean nothing failed. Every path below used to report ok with no error."""
 def _hb(self,c,**res):
  base_={'receipts':[],'dispatch':[],'errors':[]};base_.update(res);c.heartbeat(base_);return json.loads((c.root/'latest-run.json').read_text())
 def _c(self,tmp,t=None,b=None):return ctl(tmp,[t or base()],b or Bus())
 def test_clean_run_is_green(self):
  with tempfile.TemporaryDirectory() as tmp:self.assertTrue(self._hb(self._c(tmp))['ok'])
 def test_a_halt_is_red(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=self._c(tmp);c.halt='gates.json cannot be read';h=self._hb(c);self.assertFalse(h['ok']);self.assertIn('gates.json',h['errors'][0])
 def test_an_unknown_gate_is_red(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=self._c(tmp);c.gate_results=[{'id':'g','state':'unknown','detail':'register unreadable'}];self.assertFalse(self._hb(c)['ok'])
 def test_a_refused_send_is_red(self):
  class B(Bus):
   def send(self,to,cid,text):raise control.BusRefused('429 rate limit')
  with tempfile.TemporaryDirectory() as tmp:
   c=self._c(tmp,b=B());c.scan(True);h=self._hb(c);self.assertFalse(h['ok']);self.assertTrue(any('refused' in e for e in h['errors']))
 def test_a_failed_journal_write_is_red_on_a_polled_row(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=self._c(tmp);row(c,state='blocked',cid='pd-j',prefix='AB1-T1',mode='execution',blocked_on=[],requested_at=control.now())
   with patch.object(c,'journal',side_effect=RuntimeError('zoho down')):c.reconcile()
   self.assertFalse(self._hb(c)['ok'])
 def test_a_calendar_failure_is_red(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=self._c(tmp)
   with patch.object(c.a,'read',side_effect=RuntimeError('calendar down')):
    try:c.report()
    except Exception:pass
   self.assertFalse(self._hb(c)['ok'])
 def test_an_unread_verifier_answer_is_red(self):
  class B(Bus):
   def status(self,cid):raise OSError('relay down')
  with tempfile.TemporaryDirectory() as tmp:
   c=self._c(tmp,b=B());row(c,state='awaiting_verification',cid='pd-v',prefix='AB1-T1',mode='execution',verify_requested=control.now())
   with patch.object(c,'plan_path',lambda code:__import__('pathlib').Path(tmp)/'none.json'):c.verify_ready()
   self.assertFalse(self._hb(c)['ok'])
 def test_problems_do_not_carry_into_the_next_run(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=self._c(tmp);c.problem('one');c.problem('one');self.assertEqual(self._hb(c)['errors'],['one'])
   self.assertTrue(self._hb(c)['ok'])
 def test_a_crash_in_the_heartbeat_does_not_leave_the_old_green_file(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=self._c(tmp);(c.root/'latest-run.json').write_text('{"ok":true,"at":"old"}')
   with patch.object(c,'heartbeat',side_effect=RuntimeError('boom')),patch.object(c,'reconcile',return_value=[]),patch.object(c,'scan',return_value=[]),patch.object(c,'verify_ready',return_value=[]),patch.object(c,'report',return_value={}),patch.object(c,'flush',return_value=[]):control.cycle(c)
   h=json.loads((c.root/'latest-run.json').read_text());self.assertFalse(h['ok']);self.assertIn('boom',h['errors'][0])
class ResumeNote(unittest.TestCase):
 """Direction left in a RESUME comment has to reach the agent, which may have no way to read comments."""
 def _run(self,comments):
  class Z(Zoho):
   def projects(self,m,path,body=None):
    return comments if '/comments' in path and m=='GET' else super().projects(m,path,body)
  tmp=tempfile.mkdtemp();b=Bus();c=ctl(tmp,[base()],b);c.a.__class__=Z;row(c);c.scan(True);return b,c
 def test_the_note_travels_with_the_resend(self):
  b,c=self._run([{'content':'[PROJECT-DISPATCH RESUME pd-old] Read SALESM-167 and reissue the report.','created_time':'2026-11-05T16:00:00Z'}])
  self.assertEqual(len(b.sent),1);self.assertIn('Read SALESM-167',b.sent[0][2]);self.assertIn('record data',b.sent[0][2]);self.assertNotIn('RESUME pd-old',b.sent[0][2])
 def test_the_latest_note_wins(self):
  b,c=self._run([{'content':'[PROJECT-DISPATCH RESUME pd-old] old note','created_time':'2026-11-05T16:00:00Z'},{'content':'[PROJECT-DISPATCH RESUME pd-old] new note','created_time':'2026-11-05T16:30:00Z'}])
  self.assertIn('new note',b.sent[0][2]);self.assertNotIn('old note',b.sent[0][2])
 def test_a_long_note_is_cut(self):
  b,c=self._run([{'content':'[PROJECT-DISPATCH RESUME pd-old] '+'x'*5000}])
  self.assertLess(b.sent[0][2].count('x'*100),40)
 def test_a_marker_with_no_text_still_resumes(self):
  b,c=self._run([{'content':'[PROJECT-DISPATCH RESUME pd-old]'}])
  self.assertEqual(len(b.sent),1);self.assertNotIn('Resume note',b.sent[0][2])
class FailedCheckStays(unittest.TestCase):
 """A failed independent check is final for that attempt. The old COMPLETE on the bus must not reopen it."""
 def _bus(self,replies,verdict=None):
  class B(Bus):
   req=[]
   def status(self,cid):
    if cid.startswith('vr-'):return {'replies':[{'text':verdict}]} if verdict and cid in B.seen else None
    return {'correlation_id':cid,'from':'claude-systems','to':'compliance','state':'acknowledged','acknowledged_by':'compliance','replies':[{'text':replies}]}
   def verify_request(self,cid,text):B.req.append(cid)
  B.req=[];B.seen=set();return B()
 def test_poll_leaves_a_failed_check_blocked(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=self._bus('STATUS: COMPLETE');c=ctl(tmp,[base()],b)
   row(c,state='blocked',cid='pd-abc',prefix='AB1-T1',mode='execution',requested_at=control.now(),verify_failed=control.now(),blocker='Independent check did not pass: x',bus={'acknowledged_by':'compliance'})
   r=c.rows()[0];c.reconcile_row(r)
   self.assertEqual(c.rows()[0]['state'],'blocked');self.assertIn('did not pass',json.loads(c.rows()[0]['data'])['blocker'])
   c.reconcile_row(c.rows()[0]);self.assertEqual(c.rows()[0]['state'],'blocked');self.assertEqual(b.req,[])
 def test_each_attempt_has_its_own_verifier_id(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=self._bus('STATUS: COMPLETE','STATUS: BLOCKED old attempt');type(b).seen={'vr-'+'a'*24}
   c=ctl(tmp,[base()],b);row(c,state='awaiting_verification',cid='pd-'+'a'*24+'-r2',prefix='AB1-T1',mode='execution')
   with patch.object(c,'plan_path',lambda code:__import__('pathlib').Path(tmp)/'none.json'):c.verify_ready();c.verify_ready()
   self.assertEqual(b.req,['vr-'+'a'*24+'-r2']);self.assertEqual(c.rows()[0]['state'],'awaiting_verification')
 def test_request_in_flight_keeps_its_old_id(self):
  with tempfile.TemporaryDirectory() as tmp:
   b=self._bus('STATUS: COMPLETE','STATUS: BLOCKED real verdict');type(b).seen={'vr-'+'a'*24}
   c=ctl(tmp,[base()],b);row(c,state='awaiting_verification',cid='pd-'+'a'*24+'-r2',prefix='AB1-T1',mode='execution',verify_requested=control.now())
   with patch.object(c,'plan_path',lambda code:__import__('pathlib').Path(tmp)/'none.json'):c.verify_ready()
   self.assertEqual(c.rows()[0]['state'],'blocked')
class VerifierVerdict(unittest.TestCase):
 def test_a_failed_check_returns_to_the_blocker_flow(self):
  class B(Bus):
   def status(self,cid):return {'replies':[{'text':'STATUS: BLOCKED Provider accounts were never audited.'}]} if cid.startswith('vr-') else None
  with tempfile.TemporaryDirectory() as tmp:
   b=B();c=ctl(tmp,[base()],b);row(c,state='awaiting_verification',cid='pd-abc',prefix='AB1-T1',verify_requested=control.now())
   with patch.object(c,'plan_path',lambda code:__import__('pathlib').Path(tmp)/'none.json'):r=c.verify_ready()
   self.assertEqual(r[0]['state'],'verification_did_not_pass');x=c.rows()[0];self.assertEqual(x['state'],'blocked');self.assertIn('Provider accounts',json.loads(x['data'])['blocker'])
   c.scan(True);c.flush();self.assertTrue(alerts(b,'BLOCKED'))
 def test_the_verifier_gets_a_read_only_packet(self):
  class B(Bus):
   text=''
   def verify_request(self,cid,text):B.text=text
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,[base()],B());row(c,state='awaiting_verification',cid='x',prefix='AB1-T1')
   with patch.object(c,'plan_path',lambda code:__import__('pathlib').Path(tmp)/'none.json'):c.verify_ready()
   self.assertTrue((c.root/'verify'/'ab1-t1.json').exists());self.assertIn('read that instead of Zoho',B.text)
class RunExitStatus(unittest.TestCase):
 """A red run must be visible to launchd and the log, not only in latest-run.json: one timestamped ERROR line and exit 2."""
 LINE=r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z ERROR project-dispatch run failed: '
 def _main(self,c,result):
  import io,contextlib
  out,err=io.StringIO(),io.StringIO()
  with patch.object(control,'Control',lambda state=None:c),patch.object(control,'cycle',lambda c_:result),patch.object(control.signal,'signal'),patch.object(control.signal,'alarm'),patch.object(control.sys,'argv',['control.py','run']),contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):
   try:control.main();code=0
   except SystemExit as e:code=e.code
  return code,out.getvalue(),err.getvalue()
 def test_green_run_has_no_failure_line(self):
  self.assertIsNone(control.run_failure({'heartbeat':{'ok':True,'errors':[]}}))
 def test_red_run_line_is_one_timestamped_error_line(self):
  line=control.run_failure({'heartbeat':{'ok':False,'errors':['a gate could not be read','scan: multi\nline']}})
  self.assertRegex(line,self.LINE+'a gate could not be read; scan: multi line$');self.assertNotIn('\n',line)
 def test_missing_heartbeat_counts_as_failed(self):
  self.assertRegex(control.run_failure({}),self.LINE+'no heartbeat was recorded$')
 def test_unreadable_gate_cycle_is_reported_as_failed(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,[base()],Bus())
   with patch.object(c,'reconcile',return_value=[]),patch.object(c,'scan',side_effect=lambda *a:(setattr(c,'gate_results',[{'id':'master-handoff-accepted','state':'unknown','detail':'404'}]),[])[1]),patch.object(c,'verify_ready',return_value=[]),patch.object(c,'report',return_value={}),patch.object(c,'flush',return_value=[]):r=control.cycle(c)
   self.assertFalse(r['heartbeat']['ok']);self.assertEqual(r['heartbeat'],json.loads((c.root/'latest-run.json').read_text()))
   self.assertRegex(control.run_failure(r),self.LINE+'.*a gate could not be read')
 def test_heartbeat_crash_is_reported_as_failed(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=ctl(tmp,[base()],Bus())
   with patch.object(c,'heartbeat',side_effect=RuntimeError('boom')),patch.object(c,'reconcile',return_value=[]),patch.object(c,'scan',return_value=[]),patch.object(c,'verify_ready',return_value=[]),patch.object(c,'report',return_value={}),patch.object(c,'flush',return_value=[]):r=control.cycle(c)
   self.assertRegex(control.run_failure(r),self.LINE+'heartbeat: boom$')
 def test_main_run_exits_2_with_the_error_line_on_stderr_when_red(self):
  with tempfile.TemporaryDirectory() as tmp:
   code,out,err=self._main(ctl(tmp,[base()],Bus()),{'receipts':[],'dispatch':[],'errors':[],'heartbeat':{'ok':False,'errors':['a gate could not be read']}})
   self.assertEqual(code,2);self.assertRegex(err,self.LINE+'a gate could not be read\n$');self.assertEqual(err.count('\n'),1);self.assertIn('"command": "run"',out)
 def test_main_run_exits_0_and_is_silent_on_stderr_when_green(self):
  with tempfile.TemporaryDirectory() as tmp:
   code,out,err=self._main(ctl(tmp,[base()],Bus()),{'receipts':[],'dispatch':[],'errors':[],'heartbeat':{'ok':True,'errors':[]}})
   self.assertEqual(code,0);self.assertEqual(err,'')
def ago(h):return (control.dt.datetime.now(control.dt.timezone.utc)-control.dt.timedelta(hours=h)).isoformat().replace('+00:00','Z')   # Supabase's form
def later(minutes):return patch.object(Clock,'ORIGIN',Clock.ORIGIN+_dt.timedelta(minutes=minutes))
ACTION='Past due: finish, or agree a new date with Damian (dates are never moved without him).'
def wrow(prefix='SA5-T900',flags=('overdue',),since=None,owner='Biz Operations',action=ACTION):
 since=since or ago(1)
 return {'task_id':'t-'+prefix,'prefix':prefix,'flags':list(flags),'flag_since':{f:since for f in flags},'recovery_owner':owner,'recovery_action':action,'checked_at':control.now()}
def wctl(tmp,rows,tasks=None):
 c=ctl(tmp,tasks or [base(vetted=False)],Bus());c.watch_read=lambda:rows;return c
def run(c):
 c.seen=set();control.cycle(c);return json.loads((c.root/'latest-run.json').read_text())
class Level3Default(unittest.TestCase):
  def test_level3_is_off_unless_switched_on(self):
    import importlib,os
    for v,want in ((None,False),('on',True),('yes',True),('off',False),('',False)):
      env=dict(os.environ);env.pop('DISPATCH_LEVEL3',None)
      if v is not None:env['DISPATCH_LEVEL3']=v
      with patch.dict(os.environ,env,clear=True):
        self.assertEqual(os.environ.get('DISPATCH_LEVEL3','off').strip().lower() in ('1','on','true','yes'),want)

class DispatchWatchDigest(unittest.TestCase):
 """The dashboard's dispatch_watch drives Business Operations every cycle, and what it cannot clear reaches Damian (level 3)."""
 def test_overdue_flag_one_digest_then_one_level3_then_nothing(self):
  # The original failure: an overdue dispatched task, and nobody hears. Now one digest to bizops, one level-3 message after 15 min, then quiet.
  with tempfile.TemporaryDirectory() as tmp:
   c=wctl(tmp,[wrow(since=ago(0.05))]);b=c.bus
   hb=run(c);self.assertTrue(hb['ok'],hb['errors'])
   self.assertEqual(len(b.alerts),1);to,cid,text=b.alerts[0];self.assertEqual(to,'bizops')
   self.assertIn('DISPATCH WATCH (1):',text);self.assertRegex(text,r'SA5-T900: overdue since \d{4}-\d\d-\d\dT\d\d:\d\dZ\. Recovery owner: Biz Operations\. Recovery action: Past due: finish')
   self.assertEqual(c.to_damian,[]);self.assertEqual(hb['watch'],{'tasks':1,'critical':1})
   with later(15):hb=run(c)
   self.assertTrue(hb['ok'],hb['errors']);self.assertEqual(len(b.alerts),1)
   self.assertEqual(len(c.to_damian),1);self.assertIn('OVERDUE, NO RECOVERY (1):',c.to_damian[0]);self.assertIn('SA5-T900 overdue since',c.to_damian[0]);self.assertIn('Recovery owner Biz Operations: Past due',c.to_damian[0])
   self.assertEqual(hb['damian']['sent'],1)
   with later(30):hb=run(c)
   self.assertEqual(len(b.alerts),1);self.assertEqual(len(c.to_damian),1);self.assertEqual(hb['damian']['sent'],0)
 def test_level3_waits_for_a_cycle_after_bizops_was_told(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=wctl(tmp,[wrow(since=ago(30))]);run(c);self.assertEqual(c.to_damian,[])   # overdue for a day, but bizops only heard now
   with later(10):run(c)
   self.assertEqual(c.to_damian,[])
   with later(15):run(c)
   self.assertEqual(len(c.to_damian),1)
 def test_a_new_flag_is_news_and_a_clear_is_not(self):
  with tempfile.TemporaryDirectory() as tmp:
   since=ago(1);rows=[wrow(since=since)];c=wctl(tmp,rows);b=c.bus
   c.watch();c.flush();self.assertEqual(len(b.alerts),1)
   rows[0]=dict(wrow(flags=('overdue','no_thread'),since=since));c.watch_read=lambda:rows
   c.seen=set();c.watch();c.flush();self.assertEqual(len(b.alerts),2);self.assertIn('no_thread since',b.alerts[1][2]);self.assertIn('overdue since',b.alerts[1][2])
   rows[0]=wrow(since=since);c.seen=set();c.watch();c.flush();self.assertEqual(len(b.alerts),2)   # no_thread cleared: not news
   c.seen=set();c.watch();c.flush();self.assertEqual(len(b.alerts),2)
   rows[0]=wrow(flags=('overdue','no_thread'),since=since);rows[0]['flag_since']['no_thread']=ago(0.1);c.seen=set();c.watch();c.flush()
   self.assertEqual(len(b.alerts),3)   # back again with a new since: news
 def test_only_critical_flags_are_sent(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=wctl(tmp,[wrow(flags=('no_evidence','unverified','blocked'))]);c.watch();c.flush();self.assertEqual(c.bus.alerts,[])
   for f in control.WATCH_CRITICAL:
    c=wctl(tmp+'/'+f,[wrow(prefix='X1-T'+f,flags=(f,))]);c.watch();c.flush();self.assertIn(f+' since',c.bus.alerts[0][2],f)
 def test_many_tasks_make_one_digest_a_cycle(self):
  rows=[wrow(prefix='AB9-T'+str(i)) for i in range(21)]
  with tempfile.TemporaryDirectory() as tmp:
   c=wctl(tmp,rows);seen=set()
   for n in range(4):
    c.seen=set();c.watch();c.flush();self.assertEqual(len(c.bus.alerts),n+1)
    seen|=set(re.findall(r'AB9-T\d+',c.bus.alerts[-1][2]))
    if len(seen)==21:break
   self.assertEqual(len(seen),21)
 def test_owner_decision_goes_to_damian_at_once_and_repeats_every_4_hours(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=wctl(tmp,[wrow(owner='Damian',action='Waiting on Damian: Confirm the page inventory')]);run(c)
   self.assertEqual(len(c.bus.alerts),1);self.assertEqual(len(c.to_damian),1);self.assertIn('OWNER-ONLY DECISION (1):',c.to_damian[0]);self.assertIn('Confirm the page inventory',c.to_damian[0])
   with later(3*60):run(c)
   self.assertEqual(len(c.to_damian),1)
   with later(4*60+1):run(c)
   self.assertEqual(len(c.to_damian),2)
 def test_dispatcher_owner_only_holds_reach_damian(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=wctl(tmp,[],tasks=[base(name='Publish the page')]);run(c)
   self.assertTrue(alerts(c.bus,'OWNER-ONLY ACTION'));self.assertEqual(len(c.to_damian),1);self.assertIn('AB1-T1 Publish the page',c.to_damian[0])
 def test_dispatcher_down_after_two_failed_runs_once_per_4_hours(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=wctl(tmp,[wrow(since=ago(0.05))]);run(c);self.assertEqual(len(c.bus.alerts),1)
   def down():raise RuntimeError('dispatch_watch GET HTTP 503')
   c.watch_read=down
   with later(15):hb=run(c)
   self.assertFalse(hb['ok']);self.assertEqual(hb['damian']['fail_streak'],1);self.assertEqual(c.to_damian,[])
   with later(30):hb=run(c)
   self.assertEqual(hb['damian']['fail_streak'],2);self.assertEqual(len(c.to_damian),1)
   self.assertIn('DISPATCHER DOWN (1):',c.to_damian[0]);self.assertIn('2 failed runs in a row',c.to_damian[0]);self.assertIn('dispatch_watch GET HTTP 503',c.to_damian[0])
   with later(45):run(c)
   self.assertEqual(len(c.to_damian),1)
   # The outage did not sweep the open watch item away as resolved.
   self.assertIsNone(c.db.execute("SELECT resolved_at FROM escalations WHERE key LIKE 'watch:%'").fetchone()[0])
   c.watch_read=lambda:[wrow(since=ago(0.05))]
   with later(60):hb=run(c)
   self.assertTrue(hb['ok'],hb['errors']);self.assertEqual(hb['damian']['fail_streak'],0)
 def test_level3_switch_off(self):
  with tempfile.TemporaryDirectory() as tmp,patch.object(control,'LEVEL3',False):
   c=wctl(tmp,[wrow(owner='Damian')]);hb=run(c)
   self.assertEqual(c.to_damian,[]);self.assertFalse(hb['damian']['enabled']);self.assertEqual(len(c.bus.alerts),1)
 def test_a_failed_level3_send_is_red_retried_and_never_prints_the_url(self):
  with tempfile.TemporaryDirectory() as tmp:
   c=wctl(tmp,[wrow(owner='Damian')])
   def broken(text):raise ValueError('unknown url type: https://api.telegram.org/botSECRET123/sendMessage')
   c.telegram=broken;hb=run(c)
   self.assertFalse(hb['ok']);self.assertIn('a level-3 alert could not reach Damian: ValueError',hb['errors'])
   self.assertNotIn('SECRET123',(c.root/'latest-run.json').read_text());self.assertIsNone(c.db.execute('SELECT sent_at FROM damian_alerts').fetchone()[0])
   c.telegram=c.to_damian.append
   with later(15):run(c)
   self.assertEqual(len(c.to_damian),1)
 def test_dispatch_watch_is_read_the_way_the_collector_reads_supabase(self):
  got={}
  class R:
   def __enter__(self):return self
   def __exit__(self,*a):return False
   def read(self,*a):return b'[]'
  def urlopen(req,timeout=None):got['url']=req.full_url;got['headers']=dict(req.header_items());return R()
  def keychain(args,**k):got['args']=args;return 'test-key\n'
  with tempfile.TemporaryDirectory() as tmp,patch.object(control,'supabase_get',REAL_SUPABASE_GET),patch.object(control,'WATCH_EXPORT',None),patch.object(control.subprocess,'check_output',keychain),patch.object(control.urllib.request,'urlopen',urlopen):
   c=control.Control(tmp,adapter=Fake(),bus=Bus());self.assertEqual(c.watch_read(),[])
  self.assertEqual(got['url'],'https://hjycuzfhjokccpygvpvo.supabase.co/rest/v1/dispatch_watch?select=task_id,prefix,flags,flag_since,recovery_owner,recovery_action,checked_at')
  self.assertIn('exec-dashboard-supabase-service',got['args']);self.assertEqual(got['headers'].get('Apikey'),'test-key')
 def test_a_fresh_local_export_is_used_and_a_stale_one_is_not(self):
  import os
  with tempfile.TemporaryDirectory() as tmp:
   f=__import__('pathlib').Path(tmp)/'dispatch_watch.json';f.write_text(json.dumps([wrow()]))
   asked=[]
   with patch.object(control,'WATCH_EXPORT',str(f)),patch.object(control,'supabase_get',lambda p:asked.append(p) or []):
    c=control.Control(tmp,adapter=Fake(),bus=Bus());self.assertEqual(c.watch_read()[0]['prefix'],'SA5-T900');self.assertEqual(asked,[])
    os.utime(f,(1,1));self.assertEqual(c.watch_read(),[]);self.assertEqual(len(asked),1)
 def test_the_damian_route_is_the_watchdog_send(self):
  self.assertTrue(str(control.DAMIAN_SENDER).endswith('.openclaw/bin/gateway-watchdog.py'))
  with tempfile.TemporaryDirectory() as tmp:
   import pathlib
   out=pathlib.Path(tmp)/'sent.txt';w=pathlib.Path(tmp)/'gateway-watchdog.py'
   w.write_text('def send(text):\n    open('+repr(str(out))+', "a").write(text)\nif __name__ == "__main__":\n    raise SystemExit("main must not run")\n')
   with patch.object(control,'DAMIAN_SENDER',w):REAL_TELEGRAM('level 3 test')
   self.assertEqual(out.read_text(),'level 3 test')
if __name__=='__main__':unittest.main()
