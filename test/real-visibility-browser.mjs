import fs from 'node:fs';
import path from 'node:path';
// Create a NEW owned browser with its own ephemeral profile. Use the documented
// default-context noDefaults option so Playwright never installs forced focus.
// Never attach to a pre-existing browser/address or inspect an existing profile.
export async function launchVisibilityBrowser(chromium,executablePath) {
  let owner,browser;
  try {
    owner=await chromium.launch({executablePath,headless:false,args:['--enable-automation','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1']});
    const session=await owner.newBrowserCDPSession();
    const {arguments:args}=await session.send('Browser.getBrowserCommandLine');
    const profileArg=args.find(arg=>arg.startsWith('--user-data-dir='));
    if(!profileArg)throw new Error('Owned browser did not expose its generated profile');
    const profile=profileArg.slice('--user-data-dir='.length);
    if(!path.basename(profile).startsWith('playwright_chromiumdev_profile-'))throw new Error('Unexpected owned browser profile');
    const file=path.join(profile,'DevToolsActivePort');let lines;
    for(let i=0;i<100;i++){try{lines=fs.readFileSync(file,'utf8').trim().split(/\r?\n/);if(lines.length>=2)break;}catch{}await new Promise(r=>setTimeout(r,50));}
    if(!lines||!/^\d+$/.test(lines[0])||!/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(lines[1]))throw new Error('Owned browser endpoint unavailable');
    // UUID comes from this newly launched browser's own profile, not a port
    // scan or a guessed endpoint. A reused port cannot select another browser.
    browser=await chromium.connectOverCDP(`ws://127.0.0.1:${lines[0]}${lines[1]}`,{noDefaults:true,isLocal:true});
    const context=browser.contexts()[0];if(!context)throw new Error('Owned default context missing');
    return {owner,browser,context};
  }catch(error){await browser?.close();await owner?.close();throw error;}
}
