"""Install only WelcomeIQ-owned configuration; preserve existing agents and services."""
import sys
sys.dont_write_bytecode=True
import pathlib,json,shutil,datetime,subprocess,getpass,secrets,urllib.request,argparse,os
ROOT=pathlib.Path(__file__).resolve().parent
HOME=pathlib.Path.home()
STATE=HOME/".openclaw/state/welcomeiq"
def write(p,data):
 p.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 p.write_text(data);p.chmod(0o600)
def kc(name):
 r=subprocess.run(["security","find-generic-password","-a",getpass.getuser(),"-s",name,"-w"],capture_output=True,text=True)
 return r.stdout.strip() if r.returncode==0 else ""
def putkey(name,value):
 r=subprocess.run(["security","add-generic-password","-U","-a",getpass.getuser(),"-s",name,"-w",value],capture_output=True)
 if r.returncode:raise RuntimeError("Keychain write failed: "+name)
def configure():
 STATE.mkdir(parents=True,exist_ok=True,mode=0o700);STATE.chmod(0o700)
 policy=STATE/"policy.json"
 if not policy.exists():write(policy,(ROOT/"policy.example.json").read_text())
 # Existing operator policy is never replaced by the example.
 p=json.loads(policy.read_text());assert p["project"]=="welcomeiq" and p["enabled"] is False
 for role in ["worker","codex","coval","chatgpt"]:
  item="welcomeiq-bus-key-"+role
  if not kc(item):putkey(item,secrets.token_urlsafe(32))
 ext=HOME/".openclaw/extensions/welcomeiq-coval";ext.mkdir(parents=True,exist_ok=True)
 for name in ["index.js","openclaw.plugin.json"]:write(ext/name,(ROOT/"openclaw"/name).read_text())
 write(ext/"package.json",json.dumps({"name":"welcomeiq-coval","version":"0.1.0","type":"module"})+"\n")
 workspace=HOME/".openclaw/workspace-coval-welcomeiq"
 instructions="""# WelcomeIQ Coval testing agent
This workspace belongs only to WelcomeIQ, developed by Arsalan.
HumanIQ / Voice Intake / Muse is a separate project and is inaccessible here.
Process only a verified request ID already persisted by the authenticated bridge.
Use coval_execute_request; never construct arbitrary Coval operations, approve suites,
expand authority, change production, create schedules, expose credentials, or spend.
Report the tool's actual state and evidence. A blocked or uncertain request is not success.
Natural language requests are clarification data until converted to an approved operation.
Cliq is the communication interface. Zoho Projects is authoritative for execution.
Execution uses the OpenClaw tool gateway without a billable model turn.
"""
 if not (workspace/"AGENTS.md").exists():write(workspace/"AGENTS.md",instructions)
 if not (workspace/"SOUL.md").exists():write(workspace/"SOUL.md","Be concise, precise, and evidence-driven. Never conflate WelcomeIQ with HumanIQ.\n")
 config=HOME/".openclaw/openclaw.json";d=json.loads(config.read_text())
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
 write(STATE/("openclaw-before-"+stamp+".json"),config.read_text())
 entries=d.setdefault("agents",{}).setdefault("entries",{})
 agent={"name":"WelcomeIQ Coval testing","workspace":str(workspace),"agentDir":str(HOME/".openclaw/agents/coval-welcomeiq/agent"),"model":{"primary":"openai/gpt-6-sol","fallbacks":[]},"tools":{"profile":"minimal","deny":["group:runtime","group:fs","group:web","group:ui","group:nodes","group:automation","group:messaging","group:sessions","group:media","group:agents","gateway"],"alsoAllow":["coval_execute_request"]}}
 if "coval-welcomeiq" in entries:assert entries["coval-welcomeiq"]==agent,"Existing WelcomeIQ agent differs; reconcile before update"
 else:entries["coval-welcomeiq"]=agent
 d.setdefault("plugins",{}).setdefault("entries",{})["welcomeiq-coval"]={"enabled":True}
 temp=config.with_suffix(".welcomeiq.tmp");write(temp,json.dumps(d,indent=2)+"\n");os.replace(temp,config)
 print(json.dumps({"configured":True,"agent":"coval-welcomeiq","policy_enabled":p["enabled"],"backup":str(STATE/("openclaw-before-"+stamp+".json"))}))
def relay():
 cfg=json.loads((STATE/"policy.json").read_text())
 sid="srv-db72dfs9v7es73a8gh5g"
 key=kc("render-api-key")
 def call(method,path,body=None):
  r=urllib.request.Request("https://api.render.com/v1"+path,method=method,headers={"Authorization":"Bearer "+key,"Content-Type":"application/json"},data=json.dumps(body).encode() if body else None)
  with urllib.request.urlopen(r,timeout=35) as x:return json.load(x)
 updates={"WELCOMEIQ_CHAT_ID":cfg["channelId"],"WELCOMEIQ_TESTER_IDS":",".join(cfg["testerCliqIds"]),"WELCOMEIQ_SERVICE_KEYS":",".join(role+":"+kc("welcomeiq-bus-key-"+role) for role in ["worker","codex","coval","chatgpt"])}
 current=call("GET","/services/"+sid+"/env-vars?limit=100")
 before={x["envVar"]["key"]:x["envVar"]["value"] for x in current}
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
 write(STATE/("relay-env-before-"+stamp+".json"),json.dumps(before))
 for name,value in updates.items():
  call("PUT","/services/"+sid+"/env-vars/"+name,{"value":value})
 back=call("GET","/services/"+sid+"/env-vars?limit=100");after={x["envVar"]["key"]:x["envVar"]["value"] for x in back}
 assert all(after.get(k)==v for k,v in updates.items()),"Relay environment readback failed"
 assert all(after.get(k)==v for k,v in before.items() if k not in updates),"Existing environment changed"
 print(json.dumps({"verified":True,"updated_names":list(updates),"existing_variables_preserved":True}))
def bridge():
 import plistlib
 file=HOME/"Library/LaunchAgents/com.damianknowles.agent-bus-bridge.plist"
 d=plistlib.loads(file.read_bytes())
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
 write(STATE/("bridge-plist-before-"+stamp+".xml"),file.read_text())
 d.setdefault("EnvironmentVariables",{})["WELCOMEIQ_ENABLED"]="1"
 file.write_bytes(plistlib.dumps(d));file.chmod(0o600)
 print("Existing bridge LaunchAgent configured for WelcomeIQ; reload required")
p=argparse.ArgumentParser();p.add_argument("action",choices=["configure","relay","bridge"]);args=p.parse_args()
{"configure":configure,"relay":relay,"bridge":bridge}[args.action]()
