"""Install/stop the 15-minute dispatch cycle; preserve existing scheduler state unless told to replace it."""
import datetime,os,pathlib,plistlib,subprocess,sys
HOME=pathlib.Path.home();ROOT=pathlib.Path(__file__).resolve().parent
LABEL='com.damianknowles.project-dispatch';TARGET=HOME/'Library/LaunchAgents'/(LABEL+'.plist')
def main():
 mode=sys.argv[1];domain='gui/'+str(os.getuid())
 if mode=='install':
  expected={'Label':LABEL,'ProgramArguments':[sys.executable,str(ROOT/'control.py'),'run'],'StartInterval':900,'RunAtLoad':True,'StandardOutPath':str(HOME/'Library/Logs/project-dispatch.log'),'StandardErrorPath':str(HOME/'Library/Logs/project-dispatch.log')}
  if TARGET.exists():
   old=plistlib.loads(TARGET.read_bytes())
   if old!=expected and '--replace' not in sys.argv:raise SystemExit('Existing scheduler differs; preserved unchanged. Review, then pass --replace.')
   if old!=expected:
    subprocess.run(['launchctl','bootout',domain+'/'+LABEL],check=False);TARGET.write_bytes(plistlib.dumps(expected));TARGET.chmod(0o600)
    print('scheduled command: run')
  else:
   TARGET.write_bytes(plistlib.dumps(expected));TARGET.chmod(0o600)
  probe=subprocess.run(['launchctl','print',domain+'/'+LABEL],capture_output=True)
  if probe.returncode:subprocess.run(['launchctl','bootstrap',domain,str(TARGET)],check=True)
  print('Installed: run sends baseline work every 15 minutes.')
 elif mode=='stop':
  if TARGET.exists():
   existing=plistlib.loads(TARGET.read_bytes())
   if existing.get('Label')!=LABEL:raise SystemExit('Unexpected scheduler identity; preserved')
   subprocess.run(['launchctl','bootout',domain+'/'+LABEL],check=True)
   archived=TARGET.with_suffix('.plist.disabled-'+datetime.datetime.now().strftime('%Y%m%d%H%M%S'));TARGET.rename(archived)
   print('Stopped; scheduler archived at '+str(archived)+'. All execution evidence retained.')
 else:raise SystemExit('install | stop')
if __name__=='__main__':main()
