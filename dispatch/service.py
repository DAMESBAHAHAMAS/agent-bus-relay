"""Install/stop the receipt and report refresh only; preserve existing scheduler state."""
import datetime,os,pathlib,plistlib,subprocess,sys
HOME=pathlib.Path.home();ROOT=pathlib.Path(__file__).resolve().parent
LABEL='com.damianknowles.project-dispatch';TARGET=HOME/'Library/LaunchAgents'/(LABEL+'.plist')
def main():
 mode=sys.argv[1];domain='gui/'+str(os.getuid())
 if mode=='install':
  expected={'Label':LABEL,'ProgramArguments':[sys.executable,str(ROOT/'control.py'),'tick'],'StartInterval':900,'RunAtLoad':True,'StandardOutPath':str(HOME/'Library/Logs/project-dispatch.log'),'StandardErrorPath':str(HOME/'Library/Logs/project-dispatch.log')}
  if TARGET.exists():
   old=plistlib.loads(TARGET.read_bytes())
   if old!=expected:raise SystemExit('Existing scheduler differs; preserved unchanged. Review before merging.')
  else:
   TARGET.write_bytes(plistlib.dumps(expected));TARGET.chmod(0o600)
  probe=subprocess.run(['launchctl','print',domain+'/'+LABEL],capture_output=True)
  if probe.returncode:subprocess.run(['launchctl','bootstrap',domain,str(TARGET)],check=True)
  print('Installed receipt/report refresh every 15 minutes. No backlog auto-dispatch or notifications.')
 elif mode=='stop':
  if TARGET.exists():
   existing=plistlib.loads(TARGET.read_bytes())
   if existing.get('Label')!=LABEL:raise SystemExit('Unexpected scheduler identity; preserved')
   subprocess.run(['launchctl','bootout',domain+'/'+LABEL],check=True)
   archived=TARGET.with_suffix('.plist.disabled-'+datetime.datetime.now().strftime('%Y%m%d%H%M%S'));TARGET.rename(archived)
   print('Stopped; scheduler archived at '+str(archived)+'. All execution evidence retained.')
 else:raise SystemExit('install | stop')
if __name__=='__main__':main()
