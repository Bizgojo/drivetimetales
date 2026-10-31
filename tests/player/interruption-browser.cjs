// Fixture-only integration test: real CanonicalPlayer + MediaSession handlers,
// synthetic media events. Does not place a phone call or contact providers.
const fs=require('fs'),path=require('path'),esbuild=require('esbuild'),{chromium,devices}=require('playwright')
const segmented=process.env.PLAYER_QA_SEGMENTED==='1';const root=process.cwd(),out='/tmp/player-call-browser.js'
const fixtures=`
import React,{useState,useEffect}from'react';
export const user={id:'listener',email:'listener@example.test',first_name:'Test',subscription_type:'active'};
export const stories=[1,2,3].map(n=>({id:'ep'+n,title:'Test episode '+n,episode_number:n,series_id:'series',series_name:'Test series',status:'published',is_hidden:false,is_free:true,audio_url:'https://player-qa.invalid/ep'+n+'.mp3',duration_mins:20,prose_text:'Test prose',genre:'Mystery'}));
window.qa={writes:[],routes:[],authLoading:false,loads:0,queries:0};
function query(table){let filters=[],single=false,write=null,sort=null,limit=999;const q={};
for(const method of ['select','eq','in','gt','lt','not','order','limit','maybeSingle','single','upsert','insert','update','delete'])q[method]=(...args)=>{if(['eq','in','gt','lt','not'].includes(method))filters.push([method,...args]);if(method==='single'||method==='maybeSingle')single=true;if(['upsert','insert','update'].includes(method)){write=args[0];window.qa.writes.push({table,...write})}if(method==='order')sort=args;if(method==='limit')limit=args[0];return q};
q.then=(resolve,reject)=>{window.qa.queries++;let data=table==='stories'?stories:table==='users'?[{...user,welcome_played:true,plan:'paid'}]:table==='user_library'?[{user_id:'listener',story_id:'ep2',progress:210,completed:false,last_played:'2026-10-30T10:00:00Z'},{user_id:'listener',story_id:'ep1',progress:1200,completed:true,last_played:'2026-10-30T09:00:00Z'}]:[];
for(const[m,k,v]of filters)data=data.filter(r=>m==='eq'?r[k]===v:m==='in'?v.includes(r[k]):m==='gt'?r[k]>v:m==='lt'?r[k]<v:true);if(sort)data=[...data].sort((a,b)=>(a[sort[0]]-b[sort[0]])*(sort[1]?.ascending===false?-1:1));data=data.slice(0,limit);return Promise.resolve({data:write?null:single?data[0]||null:data,error:null}).then(resolve,reject)};return q}
export const supabase={from:query,auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:{user}}})}};export const supabaseBrowser=supabase;
export function useAuth(){const[loading,set]=useState(window.qa.authLoading);useEffect(()=>{const f=()=>set(window.qa.authLoading);window.addEventListener('qa-auth',f);return()=>window.removeEventListener('qa-auth',f)},[]);return{user,loading}}
export function useRouter(){return{push:url=>window.qa.routes.push(url),replace:url=>window.qa.routes.push(url),back:()=>{},refresh:()=>{}}}
export function usePathname(){return location.pathname}export function useSearchParams(){return new URLSearchParams(location.search)};
`
async function main(){
 await esbuild.build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import CanonicalPlayer from'./components/player/CanonicalPlayer';createRoot(document.getElementById('root')).render(<CanonicalPlayer storyId="ep2" onPlaybackSnapshot={snapshot=>window.qa.snapshot=snapshot}/>);`,resolveDir:root,loader:'tsx'},bundle:true,jsx:'automatic',outfile:out,define:{'process.env.NODE_ENV':'"test"','process.env':'{}'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^(next\/navigation|@\/lib\/supabase|@\/lib\/supabase-browser|@\/contexts\/AuthContext)$/},()=>({path:'fixtures',namespace:'qa'}));b.onResolve({filter:/(?:^|\/)(supabase|supabase-browser)$/},()=>({path:'fixtures',namespace:'qa'}));b.onResolve({filter:/^@sentry\/nextjs$/},()=>({path:'sentry',namespace:'qa'}));b.onLoad({filter:/.*/,namespace:'qa'},a=>({contents:a.path==='fixtures'?fixtures:'export const captureException=()=>{};export const captureMessage=()=>{};export const addBreadcrumb=()=>{};export const captureEvent=()=>{};',loader:'tsx',resolveDir:root}))}}]})
 const args=process.env.PLAYER_QA_SPARTICUZ?(require(process.env.PLAYER_QA_SPARTICUZ).default || require(process.env.PLAYER_QA_SPARTICUZ)).args:['--no-sandbox'];const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYER_QA_CHROMIUM||chromium.executablePath(),args});
 try{const mobileProfile=process.env.PLAYER_QA_PROFILE;const page=await browser.newPage(mobileProfile?devices[mobileProfile]:{});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR:',e.message)});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE ERROR:',m.text())});
 await page.addInitScript(()=>{
  const states=new WeakMap();const get=el=>{if(!states.has(el))states.set(el,{time:0,paused:true});return states.get(el)};
  Object.defineProperties(HTMLMediaElement.prototype,{currentTime:{configurable:true,get(){return get(this).time},set(t){get(this).time=t;setTimeout(()=>this.dispatchEvent(new Event('timeupdate')),0)}},duration:{configurable:true,get(){return 1200}},paused:{configurable:true,get(){return get(this).paused}},ended:{configurable:true,get(){return false}},readyState:{configurable:true,get(){return 4}},currentSrc:{configurable:true,get(){return this.src}}});
  HTMLMediaElement.prototype.load=function(){get(this).time=0;get(this).paused=true;if(window.qa)window.qa.loads++;setTimeout(()=>{this.dispatchEvent(new Event('loadedmetadata'));this.dispatchEvent(new Event('canplay'))},0)};
  HTMLMediaElement.prototype.play=function(){get(this).paused=false;this.dispatchEvent(new Event('play'));this.dispatchEvent(new Event('playing'));return Promise.resolve()};
  HTMLMediaElement.prototype.pause=function(){get(this).paused=true;this.dispatchEvent(new Event('pause'))};
  const handlers={};Object.defineProperty(navigator,'mediaSession',{configurable:true,value:{setActionHandler:(name,fn)=>handlers[name]=fn,setPositionState:()=>{},playbackState:'none'}});window.qaMedia=handlers;
 });
 await page.route('**/*',async r=>{const u=new URL(r.request().url());if(u.pathname==='/player/ep2')return r.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div></body></html>'});if(u.pathname.endsWith('.mp3')){const audio=Buffer.alloc(44+16000);audio.write('RIFF',0);audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);audio.writeUInt32LE(16,16);audio.writeUInt16LE(1,20);audio.writeUInt16LE(1,22);audio.writeUInt32LE(8000,24);audio.writeUInt32LE(16000,28);audio.writeUInt16LE(2,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(16000,40);return r.fulfill({contentType:'audio/wav',body:audio})}if(u.pathname==='/api/user/save-progress'){const b=r.request().postDataJSON();await page.evaluate(b=>window.qa.writes.push({table:'user_library',...b}),b).catch(()=>{});return r.fulfill({json:{success:true}})}if(u.pathname==='/api/asc3/story-playlist')return r.fulfill({json:segmented?{queue:[{url:'https://player-qa.invalid/intro.mp3',type:'intro',label:'Intro'},{url:'https://player-qa.invalid/body.mp3',type:'story',label:'Story'},{url:'https://player-qa.invalid/outro.mp3',type:'outro',label:'Outro'}]}:{useFinalMix:true,finalMixUrl:'https://player-qa.invalid/ep2.mp3'}});return r.fulfill({json:{success:true,data:[]}})});
 await page.goto('https://player-qa.invalid/player/ep2?autoplay=0');await page.addScriptTag({content:fs.readFileSync(out,'utf8')});await page.getByRole('button',{name:'Episodes',exact:true}).waitFor({timeout:10000}).catch(async e=>{console.log((await page.locator('body').innerText()).slice(0,1600));throw e});
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 if(segmented){await page.evaluate(()=>window.qaMedia.seekto({seekTime:1500}));await page.waitForFunction(()=>document.querySelector('audio').currentTime===300)}
 await page.evaluate(()=>{const a=document.querySelector('audio');a.currentTime=347.625;a.dispatchEvent(new Event('timeupdate'));a.pause()});
 await page.waitForFunction(expected=>window.qa.writes.some(w=>w.table==='user_library'&&w.progress===expected),segmented?1547:347);
 await page.evaluate(()=>{document.querySelector('audio').currentTime=0;document.querySelector('audio').dispatchEvent(new Event('timeupdate'));window.qaMedia.play({})});
 if(await page.locator('audio').first().evaluate(a=>a.currentTime)!==347.625)throw Error('Lock-screen play lost interruption position');
 const loads=await page.evaluate(()=>window.qa.loads);await page.evaluate(()=>{window.qa.authLoading=true;window.dispatchEvent(new Event('qa-auth'))});await page.waitForTimeout(30);await page.evaluate(()=>{window.qa.authLoading=false;window.dispatchEvent(new Event('qa-auth'))});await page.waitForTimeout(50);
 if(await page.evaluate(()=>window.qa.loads)!==loads)throw Error('Auth refresh reloaded audio');

 if(!segmented && process.env.PLAYER_QA_MATRIX==='1'){
  await page.evaluate(()=>{const a=document.querySelector('audio');a.pause();a.currentTime=0;a.dispatchEvent(new Event('timeupdate'));a.dispatchEvent(new Event('error'))});
  await page.waitForFunction(()=>document.querySelector('audio').currentTime===347.625);
 }
 const matrix=[];
 if(process.env.PLAYER_QA_MATRIX==='1'){
  const base=segmented?1200:0;
  const cases=[
   ['full player pause','ui','ui',false],
   ['in-app mini-player callback','mini','mini',false],
   ['OS mini-player pause','media','media',false],
   ['OS stop','stop','media',false],
   ['native interruption, OS Play','native','media',true],
   ['native interruption, full player Play','native','ui',true],
   ['native interruption, in-app mini-player','native','mini',true],
   ['native interruption, native Play','native','native',true],
   ['background/lock event then OS pause','hidden','media',true],
   ['pagehide then return','pagehide','media',true],
   ['duplicate OS pause','double','media',true],
   ['paused seek backward','rewind','media',false],
   ['seek exactly zero','zero','media',false],
  ];
  for(let i=0;i<cases.length;i++){
   const[name,pause,resume,reset]=cases[i];const target=pause==='zero'?0:305+i*7;
   await page.evaluate(({base,target})=>window.qaMedia.seekto({seekTime:base+target}),{base:pause==='zero'?0:base,target:target+(pause==='rewind'?15:pause==='zero'?45:0)});
   await page.evaluate(()=>document.querySelector('audio').play());
   await page.waitForFunction(()=>!document.querySelector('audio').paused);
   if(pause==='ui')await page.getByRole('button',{name:'Pause',exact:true}).click();
   else await page.evaluate(kind=>{const a=document.querySelector('audio');if(kind==='mini')window.qa.snapshot.toggle();else if(kind==='media')window.qaMedia.pause({});else if(kind==='stop'){if(!window.qaMedia.stop)throw Error('OS stop handler absent');window.qaMedia.stop({})}else if(kind==='hidden'){Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));a.pause()}else if(kind==='pagehide'){window.dispatchEvent(new Event('pagehide'));a.pause()}else if(kind==='double'){window.qaMedia.pause({});window.qaMedia.pause({})}else a.pause()},pause);
   await page.waitForFunction(()=>document.querySelector('audio').paused);
   if(pause==='rewind'||pause==='zero'){await page.evaluate(({base,target})=>window.qaMedia.seekto({seekTime:base+target}),{base:pause==='zero'?0:base,target});await page.waitForFunction(t=>document.querySelector('audio').currentTime===t,target)}
   const pausedAt=await page.locator('audio').first().evaluate(a=>a.currentTime);
   if(Math.abs(pausedAt-target)>0.01)throw Error(name+' pause moved position');
   if(reset)await page.evaluate(()=>{const a=document.querySelector('audio');a.currentTime=0;a.dispatchEvent(new Event('timeupdate'));a.dispatchEvent(new Event('emptied'))});
   // Foregrounding by itself must never restart paused audio.
   await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'))});
   if(!await page.locator('audio').first().evaluate(a=>a.paused))throw Error(name+' resumed without a Play action');
   if(resume==='ui')await page.getByRole('button',{name:'Continue',exact:true}).click();
   else await page.evaluate(kind=>{if(kind==='media')window.qaMedia.play({});else if(kind==='mini')window.qa.snapshot.toggle();else document.querySelector('audio').play()},resume);
   await page.waitForFunction(()=>!document.querySelector('audio').paused);
   const recovered=await page.locator('audio').first().evaluate(a=>a.currentTime);
   if(Math.abs(recovered-target)>0.01)throw Error(name+': expected '+target+', got '+recovered);
   matrix.push({scenario:name,result:'PASS',offset:recovered});
  }
  // Ongoing timeupdates must not starve periodic server saves.
  await page.evaluate(()=>{window.qa.writes=[];return new Promise(resolve=>{let n=0;const id=setInterval(()=>{document.querySelector('audio').currentTime=500+(n++/4);if(n===25){clearInterval(id);resolve()}},250)})});
  if(!await page.evaluate(()=>window.qa.writes.some(w=>w.table==='user_library'&&w.progress>=500)))throw Error('Continuous playback starved periodic server saves');
  matrix.push({scenario:'continuous-play periodic save',result:'PASS'});
  // Restore the original checkpoint so the existing reload assertion remains exact.
  await page.evaluate(({base})=>{window.qaMedia.seekto({seekTime:base+347.625});document.querySelector('audio').pause()},{base});
 }
 await page.getByRole('button',{name:'Episodes',exact:true}).click();await page.getByRole('dialog').waitFor();if(await page.getByRole('dialog').getByRole('listitem').count()!==3)throw Error('Series list incomplete');await page.getByRole('button',{name:'Close episodes'}).click();
 for(const[name,width,height]of[['iPhone',390,844],['iPad',820,1180],['Mac',1440,1000]]){await page.setViewportSize({width,height});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error(name+' horizontal overflow');const box=await page.getByRole('button',{name:'Episodes',exact:true}).boundingBox();if(box.height<44||box.y+box.height>height)throw Error(name+' episode controls unreachable');await page.getByRole('button',{name:'Episodes',exact:true}).click();await page.screenshot({path:'/tmp/player-episodes-'+name+'.png'});await page.getByRole('button',{name:'Close episodes'}).click()}
 await page.getByRole('button',{name:'Previous episode',exact:true}).click();if(!await page.evaluate(()=>window.qa.routes.some(r=>r.includes('/player/ep1'))))throw Error('Previous route missing');
 await page.getByRole('button',{name:'Next episode',exact:true}).click();if(!await page.evaluate(()=>window.qa.routes.some(r=>r.includes('/player/ep3'))))throw Error('Next route missing');
 await page.reload();await page.addScriptTag({content:fs.readFileSync(out,'utf8')});await page.waitForFunction(()=>document.querySelector('audio')?.currentTime===347);
 await page.getByRole('button',{name:'Start Over',exact:true}).click();if(await page.locator('audio').first().evaluate(a=>a.currentTime)!==0)throw Error('Explicit Start Over resurrected position');
 if(errors.length)throw Error(errors.join('\n'));if(process.env.PLAYER_QA_MATRIX==='1')console.log('MOBILE_MATRIX '+JSON.stringify({engine:'Chromium',profile:process.env.PLAYER_QA_PROFILE||'desktop',format:segmented?'segmented':'final mix',cases:matrix}));console.log((segmented?'SEGMENTED ':'FINAL MIX ')+'PASS: native pause checkpoint; zero-reset lock-screen resume; same-user auth refresh; episode list; previous/next routes; persisted reload resume; explicit restart; iPhone/iPad/Mac layout. Fixture audio, not real-device call acceptance.');
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
