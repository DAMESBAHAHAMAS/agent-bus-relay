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
  t={'id':'t','name':'Verify a statute','description':'','vetted':True,'priority':'high','execution_actor':'Compliance','definition_of_done':'Marked verified','evidence_required':'Source link'}
  self.assertEqual(control.owner({'name':'Knowledge Base'},t),'compliance');self.assertEqual(control.readiness({'name':'Knowledge Base'},t,[t]),'ready')
 def test_vetted_needs_high_priority(self):
  t={'id':'t','name':'x','description':'','vetted':True,'priority':'medium','execution_actor':'Compliance','definition_of_done':'d','evidence_required':'e'}
  self.assertEqual(control.readiness(P,t,[t]),'approval_not_explicit')
 def test_human_actor_not_dispatched(self):
  t={'id':'t','name':'x','description':'','vetted':True,'priority':'high','execution_actor':'Damian','definition_of_done':'d','evidence_required':'e'}
  self.assertEqual(control.readiness(P,t,[t]),'human_executor_required')
 def test_vetted_material_action_still_held(self):
  t={'id':'t','name':'Publish the five campaign blog articles','description':'','vetted':True,'priority':'high','execution_actor':'SalesM','definition_of_done':'d','evidence_required':'e'}
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
if __name__=='__main__':unittest.main()
