import sys
sys.dont_write_bytecode=True
import json,pathlib,tempfile,unittest
from unittest.mock import patch
import control,verification
class Adapter:
 def __init__(self):self.t={'id':'t','name':'test','description':'DEFINITION OF DONE: named output\nEVIDENCE REQUIRED: output read\nDEPENDENCIES: None','is_completed':False};self.writes=0
 def read(self,op,args):return dict(self.t)
 def projects(self,method,path,body):self.writes+=1;self.t['is_completed']=True;return {}
class Tests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name);(self.root/'plans').mkdir();self.a=Adapter();self.c=control.Control(self.root/'state',adapter=self.a,bus=object());self.c.journal=lambda r:None
  self.c.db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?)',('x','p','t','systems','systems','awaiting_verification',json.dumps({'mode':'execution'}),control.now()));self.c.db.commit()
  self.plan={'project':'p','task':'t','acceptance_sha256':verification.acceptance_hash(self.a.t),'checks':[{'criterion':'named output','operation':'project_task','params':{'project_id':'p','task_id':'t'},'path':['name'],'equals':'test'}],'verified_by':'Claude Code'};self.save()
  self.patch=patch.object(verification,'__file__',str(self.root/'verification.py'));self.patch.start()
 def save(self):(self.root/'plans/task.json').write_text(json.dumps(self.plan))
 def tearDown(self):self.patch.stop();self.c.db.close();self.tmp.cleanup()
 def _file_plan(self,executor):
  self.c.db.execute('UPDATE runs SET executor=?',(executor,));self.c.db.commit()
  self.plan['checks']=[{'criterion':'the file','operation':'workdrive_text','params':{'resource_id':'f'},'path':['name'],'equals':'test'}];self.save()
 def test_a_work_file_is_read_by_an_identity_that_can_open_it(self):
  self._file_plan('salesmkt');other=Adapter();other.t=dict(self.a.t);seen=[]
  with patch.object(self.c,'file_reader',lambda who:seen.append(who) or other):verification.verify(self.c,'x','task.json')
  self.assertEqual(seen,['salesmkt'])
 def test_finance_files_stay_behind_the_wall(self):
  self.assertIs(self.c.file_reader('finance'),self.c.a)
  self.assertIs(self.c.file_reader('bizops'),self.c.a)
 def test_the_task_record_is_never_read_through_the_executor(self):
  self.save()
  with patch.object(self.c,'file_reader',side_effect=AssertionError('no')):self.assertEqual(verification.verify(self.c,'x','task.json')['state'],'verified_deliverable')
 def test_a_failed_file_check_still_keeps_the_task_open(self):
  self._file_plan('salesmkt');other=Adapter();other.t=dict(self.a.t);other.t['name']='different'
  with patch.object(self.c,'file_reader',lambda who:other),self.assertRaises(ValueError):verification.verify(self.c,'x','task.json',True)
  self.assertEqual(self.a.writes,0)
 def test_verified_then_close_readback(self):
  self.assertEqual(verification.verify(self.c,'x','task.json')['state'],'verified_deliverable');self.assertEqual(self.a.writes,0)
  self.assertEqual(verification.verify(self.c,'x','task.json',True)['state'],'completed');self.assertEqual(self.a.writes,1)
 def test_mismatch_no_closure(self):
  self.plan['checks'][0]['equals']='wrong';self.save()
  with self.assertRaises(ValueError):verification.verify(self.c,'x','task.json',True)
  self.assertEqual(self.a.writes,0)
 def test_changed_criteria_blocks(self):
  self.a.t['description']+=' extra'
  with self.assertRaises(ValueError):verification.verify(self.c,'x','task.json',True)
 def test_receipt_alone_blocks(self):
  self.c.save('x','acknowledged',{'mode':'execution'})
  with self.assertRaises(ValueError):verification.verify(self.c,'x','task.json',True)
 def test_uncertain_close_never_repeated(self):
  def fail(*args):self.a.writes+=1;raise TimeoutError('uncertain')
  self.a.projects=fail
  with self.assertRaises(TimeoutError):verification.verify(self.c,'x','task.json',True)
  with self.assertRaises(RuntimeError):verification.verify(self.c,'x','task.json',True)
  self.assertEqual(self.a.writes,1)
 def test_close_refused_without_verified_by(self):   # SA5-T225 P-D
  del self.plan['verified_by'];self.save()
  with self.assertRaisesRegex(ValueError,'no verified_by'):verification.verify(self.c,'x','task.json',True)
  self.assertEqual(self.a.writes,0)
 def test_close_refused_when_verifier_is_the_executor(self):   # P-D: the dispatch executor here is 'systems' (SysAuto)
  for name in ('systems','SysAuto','Systems and Automation'):
   self.plan['verified_by']=name;self.save()
   with self.assertRaisesRegex(ValueError,'is the executor'):verification.verify(self.c,'x','task.json',True)
  self.assertEqual(self.a.writes,0)
 def test_close_refused_when_verifier_is_the_execution_actor(self):   # P-D
  self.a.t['execution_actor']='Biz Operations';self.plan['verified_by']='bizops';self.save()
  with self.assertRaisesRegex(ValueError,'is the executor'):verification.verify(self.c,'x','task.json',True)
  self.assertEqual(self.a.writes,0)
 def test_close_refused_for_every_spelling_of_the_execution_actor(self):   # SA5-T225 alias-casefold
  self.a.t['execution_actor']='Biz Operations'
  for name in ('Biz-Operations','biz operations','Business operations','bizops agent','BIZ OPERATIONS','Biz Operations Agent','Business-Operations agent','  biz_ops  ','BizOps'):
   with self.subTest(name=name):
    self.plan['verified_by']=name;self.save()
    with self.assertRaisesRegex(ValueError,'is the executor'):verification.verify(self.c,'x','task.json',True)
  self.assertEqual(self.a.writes,0)
 def test_close_refused_for_every_spelling_of_the_dispatch_executor(self):   # executor here is 'systems' (SysAuto)
  for name in ('sys-auto','SYSAUTO','sysauto agent','systems and automation','Systems & Automation Agent','Systems.'):
   with self.subTest(name=name):
    self.plan['verified_by']=name;self.save()
    with self.assertRaisesRegex(ValueError,'is the executor'):verification.verify(self.c,'x','task.json',True)
  self.assertEqual(self.a.writes,0)
 def test_unknown_actor_name_is_matched_by_its_normalised_form(self):
  self.a.t['execution_actor']='Claude Code'
  for name in ('claude-code','CLAUDE CODE','claude code agent','Claude_Code.'):
   with self.subTest(name=name):
    self.plan['verified_by']=name;self.save()
    with self.assertRaisesRegex(ValueError,'is the executor'):verification.verify(self.c,'x','task.json',True)
  self.assertEqual(self.a.writes,0)
 def test_punctuation_only_verifier_counts_as_none(self):
  for name in ('-','  ','...','_ / _'):
   with self.subTest(name=name):
    self.plan['verified_by']=name;self.save()
    with self.assertRaisesRegex(ValueError,'no verified_by'):verification.verify(self.c,'x','task.json',True)
  self.assertEqual(self.a.writes,0)
 def test_a_different_agent_still_closes(self):
  self.a.t['execution_actor']='Biz Operations';self.plan['verified_by']='claude-code agent';self.save()
  self.assertEqual(verification.verify(self.c,'x','task.json',True)['state'],'completed');self.assertEqual(self.a.writes,1)
 def test_who_and_norm(self):
  for name in ('Biz Operations','Biz-Operations','biz operations','Business operations','bizops agent','bizops','BIZOPS'):
   self.assertEqual(verification.who(name),'bizops',name)
  self.assertEqual(verification.who('Code Dev'),'codedev');self.assertEqual(verification.who('code-development agent'),'codedev')
  self.assertEqual(verification.norm('Claude Code Agent'),'claudecode');self.assertEqual(verification.norm('Agent'),'agent');self.assertEqual(verification.norm(None),'')
 def test_verify_without_close_records_verifier_and_writes_nothing(self):
  self.assertEqual(verification.verify(self.c,'x','task.json')['state'],'verified_deliverable');self.assertEqual(self.a.writes,0)
 def test_no_executor_code(self):
  self.plan['checks'][0]['operation']='shell';self.save()
  with self.assertRaises(ValueError):verification.verify(self.c,'x','task.json',True)
if __name__=='__main__':unittest.main()
