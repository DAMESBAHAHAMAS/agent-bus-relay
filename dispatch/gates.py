"""Machine-checked dependencies, so a condition written in prose cannot outlive its reason.

A gate is one condition plus what it holds. The dispatcher re-reads every gate on every
run. Zoho and the register stay the record; gates.json only says which record answers
each question. This is a rule file, not a tracker: nothing here is a task.

Everything here fails closed: text that says work is waiting holds that work, and text
the dispatcher cannot resolve goes to a person. A wrong hold costs a look. A wrong
release sends work nobody approved.
"""
import html,json,pathlib,re
TASK=r'(?:[A-Z][A-Z0-9]{1,4}-T\d+|M\d+-TL\d+-T\d+)'
OTHER=r'(?:ADR-\d+|[A-Z][A-Z0-9]{1,4}-I\d+|EX-\d{4}-\d{2}-\d{2}-\d+|R-\d{3,4})'
_ANY=re.compile(r'(?<![A-Za-z0-9-])(?:'+TASK+'|'+OTHER+r')(?![A-Za-z0-9])')
_RANGE=re.compile(r'(?<![A-Za-z0-9-])([A-Z][A-Z0-9]{1,4}-T)(\d+)\s*(?:to|through|-|–|—)\s*(?:[A-Z][A-Z0-9]{1,4}-T|T)?(\d+)\b')
_LIST=re.compile(r'(?<![A-Za-z0-9-])([A-Z][A-Z0-9]{1,4}-T)(\d+)((?:\s*(?:,|and|&|or|/)\s*(?:and\s+)?T?\d+\b(?!\.\d))+)')
# Waiting words that need a code nearby to mean anything.
_SOFT=r'until|after|once|following|requires?|needs?|before'
# Words that say the task cannot proceed, with or without a code.
_HARD=r'contingent on|subject to|prerequisites?\b|deferred until|deferred to|pending\b|paused|parked until|parked pending|held until|held pending|blocked by|blocked:|blocked until|blocked\b|depends? on|dependent on|dependency:|waits? on|waits? for|waiting on|waiting for|awaiting|only after|hold until|held until|(?:is|are|stays?|remains?|kept)\s+(?:on hold|paused|parked|held)|do not start|cannot start|can\'t start|start only|must (?:close|finish|happen|land|pass|complete) first|is still open|are still open|predecessor'
_WAIT=re.compile(r'(?i)(?<![A-Za-z])(?:'+_HARD+'|'+_SOFT+r')(?![A-Za-z])')
_HARDONLY=re.compile(r'(?i)(?<![A-Za-z])(?:'+_HARD+r')(?![A-Za-z])')
_NEG=re.compile(r"(?i)\b(?:no longer|not|does not|doesn't|never|no)\s+(?:\w+\s+)?(?:blocked|block|wait|waits|waiting|depend|depends|dependent|held|hold|parked|paused)\b|\b(?:was|were|been)\s+(?:lifted|cleared|resolved|removed)\b|\brelated(?:\s+to)?\b|\bdepends? on:?\s*none\b|\bdependenc(?:y|ies):?\s*none\b|\bno dependenc")
# Text that names the next step for someone else, not something this task waits for.
_SUCCESSOR=re.compile(r'(?i)(?:,\s*so\s+[^.;]*\b(?:cannot|can)\b[^.;]*[.;]?\s*$|^\s*(?:gates?|feeds?)\b[^.;]*[.;]?\s*$|\b(?:gate for|blocks|unblocks|then (?:tell|start|run)|so that)\b[^.;]*[.;]?\s*$)')
_PROSE=re.compile(r'(?i)(?<![A-Za-z])(?:paused?|on hold|parked|parking|held|hold|deferred|defer|frozen|freeze|blocked|waiting|awaiting|suspended|gated|do not start|start only|not started)(?![A-Za-z])[^.;]{0,90}(?<![A-Za-z])(?:until|after|pending|once|unless|before|when|for)(?![A-Za-z])')
_ROUTINE=re.compile(r'(?i)\b(?:held after|on hold for review)\b')
def clean(t):return html.unescape(re.sub(r'\s+',' ',re.sub('<[^>]+>',' ',str(t or '')))).strip()
def text_of(t):
 notes=re.findall(r'(?im)^\s*(?:note|notes|waiting|waits|blocked|hold|do not start|depends|dependency|paused|pending)\b.*$',html.unescape(re.sub('<[^>]+>','\n',str(t.get('description') or ''))))
 return ' '.join([clean(t.get(k)) for k in ('resume_context','next_activity')]+[x.strip().rstrip('.')+'.' for x in notes])
def expand(s):
 """Every code in a sentence. CA1-T37, T38 and T39 is three tasks; A6Y2-T77 to A6Y2-T80 is four."""
 out=[]
 for m in _RANGE.finditer(s):
  a,b=int(m.group(2)),int(m.group(3))
  if a<b<=a+60:out+=[m.group(1)+str(n) for n in range(a,b+1)]
 for m in _LIST.finditer(s):
  out.append(m.group(1)+m.group(2));out+=[m.group(1)+n for n in re.findall(r'\d+',m.group(3))]
 out+=_ANY.findall(s)
 return list(dict.fromkeys(out))
def sentences(text):return [x.strip() for x in re.split(r'(?<=[.;])\s+(?=[A-Z0-9(])',text) if x.strip()]
def _clause(s):
 """Drop only the negated clause: "Not blocked by legal, but waiting on SA5-T9" still waits on SA5-T9."""
 return re.sub(_NEG.pattern+r'[^,;]*','',s,flags=re.I)
def analyse(t):
 """What a task says it waits on: resolvable task codes, other record codes, and waits with no code at all."""
 own=t.get('prefix');tasks=[];others=[];unclear=[]
 for s in sentences(text_of(t)):
  # "Blocked 3 Nov (dispatch pd-...)" records a block the ledger already holds; the resume rules decide that one.
  if '(dispatch pd-' in s:continue
  kept=_SUCCESSOR.sub('',_clause(s))
  codes=[c for c in expand(kept) if c!=own]
  if not _WAIT.search(kept):continue
  if codes:
   for c in codes:(tasks if re.fullmatch(TASK,c) else others).append(c)
  elif _HARDONLY.search(kept):unclear.append(kept[:160])
 return {'tasks':list(dict.fromkeys(tasks)),'others':list(dict.fromkeys(others)),'unclear':unclear}
def block_refs(text,own=None):
 """Task codes a BLOCKED reply waits on, from the last BLOCKED line onward. Empty unless the whole wait is task codes:
 a reply that also needs an owner decision or names something else must not resume itself when a task closes."""
 m=list(re.finditer(r'STATUS:\s*BLOCKED',text or ''))
 tail=(text or '')[m[-1].start():] if m else (text or '')
 got=analyse({'prefix':own,'resume_context':re.sub(r'STATUS:\s*BLOCKED\W*(?:\(\w+\))?\W*','',clean(tail),count=1)})
 if got['others'] or got['unclear']:return []
 return got['tasks']
def prose_gates(text):
 """Sentences that hold work on a condition. Used to catch a gate nobody registered."""
 return [x[:200] for x in sentences(clean(text)) if _PROSE.search(x) and not _ROUTINE.search(x)]
def load(path=None):
 """Refuses a file it cannot fully understand. The caller stops dispatch rather than running without gates."""
 p=pathlib.Path(path) if path else pathlib.Path(__file__).resolve().parent/'gates.json'
 gates=json.loads(p.read_text())
 if not isinstance(gates,list):raise ValueError('gates.json must be a list')
 seen=set()
 for g in gates:
  if not isinstance(g,dict) or not g.get('id') or g['id'] in seen:raise ValueError('gate without a unique id')
  seen.add(g['id']);c=g.get('condition')
  if not isinstance(c,dict) or c.get('type') not in ('task_closed','register_status'):raise ValueError(g['id']+': unknown condition')
  if not isinstance(g.get('holds'),dict):raise ValueError(g['id']+': holds missing')
 return gates
def evaluate(gate,lookup,register):
 """Return clear, waiting or unknown. Unknown never releases work.
 lookup(code) gives the task, or None. register maps ADR to status, and a status of None means the row is ambiguous."""
 c=gate.get('condition') or {}
 if c.get('type')=='task_closed':
  t=lookup(c.get('prefix'))
  if t is None:return {'state':'unknown','detail':'task '+str(c.get('prefix'))+' not found'}
  return {'state':'clear' if t.get('finished') else 'waiting','detail':str(c.get('prefix'))+(' closed and verified' if t.get('finished') else ' not finished')}
 if c.get('type')=='register_status':
  if register is None:return {'state':'unknown','detail':'register not read'}
  if c.get('adr') not in register or register[c.get('adr')] is None:return {'state':'unknown','detail':str(c.get('adr'))+' missing or duplicated in the register'}
  s=register[c.get('adr')];ok=s in (c.get('statuses') or [])
  return {'state':'clear' if ok else 'waiting','detail':str(c.get('adr'))+' is '+str(s)}
 return {'state':'unknown','detail':'condition type not recognised'}
def covers(gate,prefix=None,project=None):
 h=gate.get('holds') or {}
 return (prefix is not None and prefix in (h.get('tasks') or [])) or (project is not None and str(project) in (h.get('projects') or []))
