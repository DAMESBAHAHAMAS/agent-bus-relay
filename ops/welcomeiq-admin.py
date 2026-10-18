"""WelcomeIQ setup/admin; credentials stay in existing helpers/Keychain. No deletes."""
import sys
sys.dont_write_bytecode=True
import json, pathlib, urllib.request, urllib.error, subprocess, getpass, datetime, argparse
ROOT=pathlib.Path(__file__).resolve().parents[1]
STATE=ROOT/"ops"/"welcomeiq-state.json"
EVID=pathlib.Path.home()/".openclaw"/"state"/"welcomeiq"/"evidence"
sys.path.insert(0,str(pathlib.Path.home()/"Developer"/"local-credentials"))
import cliq_api as cliq
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def save(name,data):
 EVID.mkdir(parents=True,exist_ok=True,mode=0o700)
 p=EVID/(name+".json");p.write_text(json.dumps(data,indent=2));p.chmod(0o600)
def kc(name):
 r=subprocess.run(["security","find-generic-password","-a",getpass.getuser(),"-s",name,"-w"],capture_output=True,text=True)
 return r.stdout.strip() if r.returncode==0 else ""
def render(path):
 req=urllib.request.Request("https://api.render.com/v1"+path,headers={"Authorization":"Bearer "+kc("render-api-key")})
 return json.load(urllib.request.urlopen(req,timeout=30))
def projects():
 sys.path.insert(0,str(pathlib.Path.home()/".zoho"/"ops"))
 import zp
 return zp
def rows(d,k):return d if isinstance(d,list) else d.get(k,[])
def discover():
 result={"checked_at":now()}
 code,d=cliq.call("GET","users?limit=100")
 result["cliq_users"]=[{k:u.get(k) for k in ["id","name","email_id"]} for u in d.get("data",[])]
 code,d=cliq.call("GET","channels?limit=100")
 result["cliq_channels"]=[{k:u.get(k) for k in ["channel_id","chat_id","name","unique_name","level","invite_only"]} for u in d.get("channels",[])]
 z=projects(); ps=rows(z.call("GET","projects?per_page=100"),"projects")
 result["projects"]=[{k:p.get(k) for k in ["id","name","description"]} for p in ps]
 for pid in ["1156860000009450003","1156860000009404005"]:
  result[pid]={"project":z.call("GET","projects/"+pid),"tasks":[],"milestones":z.call("GET","projects/"+pid+"/milestones?per_page=100")}
  for page in range(1,10):
   ts=rows(z.call("GET",f"projects/{pid}/tasks?per_page=100&page={page}"),"tasks")
   result[pid]["tasks"] += [{k:t.get(k) for k in ["id","name","description","milestone"]} for t in ts]
   if len(ts)<100:break
 svcs=render("/services?name=agent-bus-relay&limit=20")
 svc=next(s["service"] for s in svcs if s.get("service",{}).get("name")=="agent-bus-relay")
 result["relay"]={k:svc.get(k) for k in ["id","name","repo","branch","autoDeploy"]}
 vs=render("/services/"+svc["id"]+"/env-vars?limit=100")
 public={"EXTERNAL_AGENTS","FRONT_DOOR","OUTSIDE_ROUTES","OC_CHANNELS","DAMIAN_CLIQ_IDS","CHANNEL_UNIQUE_NAME","CHANNEL_CHAT_ID"}
 result["relay"]["configuration"]={v["envVar"]["key"]:v["envVar"]["value"] for v in vs if v["envVar"]["key"] in public}
 result["relay"]["env_names"]=[v["envVar"]["key"] for v in vs]
 result["credential_presence"]={name:bool(kc(name)) for name in ["coval-api-key-welcomeiq","welcomeiq-coval-api-key","agent-bus-key-codex","agent-bus-key-ops"]}
 save("discovery",result)
 print(json.dumps(result,indent=2))
def channel():
 code,d=cliq.call("GET","channels?limit=100")
 assert code==200
 matches=[c for c in d.get("channels",[]) if c.get("unique_name")=="welcomeiqtesting" or c.get("name","").lstrip("#").lower()=="welcomeiq-testing"]
 if not matches:
  body={"name":"welcomeiq-testing","description":"WelcomeIQ Coval testing. Codex implementation; Arsalan scoped test requests. HumanIQ is outside this channel. No credentials or customer recordings in chat.","level":"organization","invite_only":True}
  code,d=cliq.call("POST","channels",body)
  save("channel-create-response",{"at":now(),"status":code,"response":d})
  if code not in (200,201,204):raise RuntimeError("Channel creation refused: "+str(code)+" "+json.dumps(d))
 code,d=cliq.call("GET","channels?limit=100")
 matches=[c for c in d.get("channels",[]) if c.get("unique_name")=="welcomeiqtesting" or c.get("name","").lstrip("#").lower()=="welcomeiq-testing"]
 assert len(matches)==1,"Channel identity not verified; do not retry creation"
 c=matches[0];assert c.get("invite_only") is True,"Channel must be invite-only"
 state=json.loads(STATE.read_text()) if STATE.exists() else {}
 state["channel"]={k:c.get(k) for k in ["channel_id","chat_id","name","unique_name","invite_only"]}
 STATE.write_text(json.dumps(state,indent=2)+"\n");STATE.chmod(0o600)
 save("channel-verified",{"at":now(),**state["channel"]})
 print(json.dumps(state["channel"],indent=2))
p=argparse.ArgumentParser();p.add_argument("action",choices=["discover","channel"]);args=p.parse_args()
{"discover":discover,"channel":channel}[args.action]()
