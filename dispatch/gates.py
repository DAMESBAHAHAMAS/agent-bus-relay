"""Machine-checked dependencies, so a condition written in prose cannot outlive its reason.

A gate is one condition plus what it holds. The dispatcher re-reads every gate on every
run. Zoho and the register stay the record; gates.json only says which record answers
each question. This is a rule file, not a tracker: nothing here is a task.
"""
import html,json,pathlib,re
CODE=r'\b(?:[A-Z][A-Z0-9]{1,4}-T\d+|M\d+-TL\d+-T\d+)\b'
_WAIT=re.compile(r'(?i)\b(blocked by|blocked:|depends? on|dependent on|waits? (?:on|for)|waiting (?:on|for)|only after|hold until|held until|until|after|once|following)\b[^.;]{0,90}?'+CODE)
# Prose that holds work with no task code the dispatcher could resolve.
_PROSE=re.compile(r'(?i)\b(paused|on hold|parked|parking|held|hold|deferred|frozen|do not start|start only)\b[^.;]{0,70}\b(until|after|pending|once|unless)\b')
_DONE=re.compile(r'(?i)\b(depends on: none|no dependenc)')
def clean(t):return html.unescape(re.sub('<[^>]+>',' ',str(t or '')))
def text_of(t):return ' '.join(clean(t.get(k)) for k in ('resume_context','next_activity'))
def expand(sentence):
 """CA1-T37, T38 and T39 names three tasks; carry the prefix across the bare numbers."""
 out=[];last=None
 for m in re.finditer(CODE+r'|\bT\d+\b',sentence):
  c=m.group(0)
  if re.fullmatch(r'T\d+',c):
   if last:out.append(last+'-'+c)
  else:
   out.append(c)
   if '-T' in c and not c.startswith('M'):last=c.rsplit('-T',1)[0]
 return list(dict.fromkeys(out))
def sentences(text):return [s.strip() for s in re.split(r'(?<=[.;])\s+',text) if s.strip()]
def wait_refs(t):
 """Task codes this task says it is waiting on. "Related: X" and "gate for X" do not count."""
 refs=[]
 for s in sentences(text_of(t)):
  if _DONE.search(s):continue
  if _WAIT.search(s):refs+=expand(s)
 own=t.get('prefix')
 return [r for r in dict.fromkeys(refs) if r!=own]
def prose_gates(text):
 """Sentences that hold work on a condition. Used to catch a gate nobody registered."""
 return [s[:200] for s in sentences(clean(text)) if _PROSE.search(s)]
def load(path=None):
 p=pathlib.Path(path) if path else pathlib.Path(__file__).resolve().parent/'gates.json'
 return json.loads(p.read_text())
def evaluate(gate,index,register):
 """Return clear, waiting or unknown. Unknown never releases work."""
 c=gate.get('condition') or {}
 if c.get('type')=='task_closed':
  t=index.get(c.get('prefix'))
  if t is None:return {'state':'unknown','detail':'task '+str(c.get('prefix'))+' not found'}
  done=bool(t.get('is_completed') or (t.get('status') or {}).get('is_closed_type'))
  return {'state':'clear' if done else 'waiting','detail':str(c.get('prefix'))+(' closed' if done else ' open')}
 if c.get('type')=='register_status':
  if register is None:return {'state':'unknown','detail':'register not read'}
  s=register.get(c.get('adr'))
  if s is None:return {'state':'unknown','detail':str(c.get('adr'))+' not in register'}
  ok=s in (c.get('statuses') or [])
  return {'state':'clear' if ok else 'waiting','detail':str(c.get('adr'))+' is '+s}
 return {'state':'unknown','detail':'condition type not recognised'}
def covers(gate,prefix=None,project=None):
 h=gate.get('holds') or {}
 return (prefix is not None and prefix in (h.get('tasks') or [])) or (project is not None and str(project) in (h.get('projects') or []))
