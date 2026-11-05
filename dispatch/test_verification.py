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
  self.plan={'project':'p','task':'t','acceptance_sha256':verification.acceptance_hash(self.a.t),'checks':[{'criterion':'named output','operation':'project_task','params':{'project_id':'p','task_id':'t'},'path':['name'],'equals':'test'}]};self.save()
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
 def test_no_executor_code(self):
  self.plan['checks'][0]['operation']='shell';self.save()
  with self.assertRaises(ValueError):verification.verify(self.c,'x','task.json',True)
if __name__=='__main__':unittest.main()
