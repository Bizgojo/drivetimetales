// Real offline-player.html and IndexedDB; synthetic media events, not phone hardware.
const fs=require('fs'),assert=require('assert/strict'),{chromium,devices}=require('playwright')
async function main(){
 const raw=process.env.PLAYER_QA_SPARTICUZ?require(process.env.PLAYER_QA_SPARTICUZ):null,bin=raw?.default||raw
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYER_QA_CHROMIUM||chromium.executablePath(),args:bin?.args||['--no-sandbox']})
 try{
 const page=await browser.newPage({...devices[process.env.PLAYER_QA_PROFILE||'iPhone 13'],serviceWorkers:'block'})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>{
  const states=new WeakMap(),get=el=>{if(!states.has(el))states.set(el,{time:0,paused:true,src:''});return states.get(el)}
  Object.defineProperties(HTMLMediaElement.prototype,{
   currentTime:{configurable:true,get(){return get(this).time},set(t){get(this).time=t;setTimeout(()=>this.dispatchEvent(new Event('timeupdate')),0)}},
   src:{configurable:true,get(){return get(this).src},set(s){get(this).src=s;get(this).time=0;get(this).paused=true;setTimeout(()=>this.dispatchEvent(new Event('loadedmetadata')),0)}},
   currentSrc:{configurable:true,get(){return get(this).src}},duration:{configurable:true,get(){return 1200}},paused:{configurable:true,get(){return get(this).paused}},ended:{configurable:true,get(){return false}},readyState:{configurable:true,get(){return 4}},
  })
  HTMLMediaElement.prototype.load=function(){get(this).time=0;get(this).paused=true;setTimeout(()=>this.dispatchEvent(new Event('loadedmetadata')),0)}
  HTMLMediaElement.prototype.play=function(){get(this).paused=false;this.dispatchEvent(new Event('play'));return Promise.resolve()}
  HTMLMediaElement.prototype.pause=function(){get(this).paused=true;this.dispatchEvent(new Event('pause'))}
  const actions={};Object.defineProperty(navigator,'mediaSession',{configurable:true,value:{setActionHandler:(k,fn)=>actions[k]=fn,setPositionState:()=>{}}});window.qaMedia=actions
 })
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:r.request().url().endsWith('/offline-player.html')?fs.readFileSync('public/offline-player.html','utf8'):'<html></html>'}))
 await page.goto('https://offline-qa.invalid/seed')
 await page.evaluate(()=>new Promise((resolve,reject)=>{
  const req=indexedDB.open('et-offline',1)
  req.onupgradeneeded=()=>{const db=req.result;db.createObjectStore('episodes',{keyPath:'storyId'});db.createObjectStore('blobs');db.createObjectStore('meta')}
  req.onsuccess=()=>{const db=req.result,tx=db.transaction(['episodes','blobs'],'readwrite');
   tx.objectStore('episodes').put({storyId:'offline-ep',title:'Offline episode',userId:'listener',isFree:true,durationMins:60,segments:[{key:'intro'},{key:'body'},{key:'outro'}]})
   for(const k of ['intro','body','outro'])tx.objectStore('blobs').put(new Blob(['fixture'],{type:'audio/mpeg'}),k)
   tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)
  }
 }))
 await page.goto('https://offline-qa.invalid/offline-player.html');await page.locator('#list button').click();await page.waitForFunction(()=>window.qaMedia.seekto&&document.querySelector('#now').hidden===false)
 const cases=[]
 const position=()=>page.locator('audio').evaluate(a=>a.currentTime)
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('et_player_progress:listener'))['offline-ep'].progress)
 for(const[caseName,global,offset]of[['intro',305,305],['body',1547.625,347.625],['outro',2700,300]]){
  await page.evaluate(t=>window.qaMedia.seekto({seekTime:t}),global);await page.waitForFunction(t=>document.querySelector('audio').currentTime===t,offset)
  await page.evaluate(()=>document.querySelector('audio').play());await page.evaluate(()=>window.qaMedia.pause({}));assert.equal(await saved(),Math.floor(global))
  await page.evaluate(()=>{const a=document.querySelector('audio');a.currentTime=0;a.dispatchEvent(new Event('timeupdate'));window.qaMedia.play({})})
  assert.equal(await position(),offset);cases.push({scenario:caseName+' native pause/reset/OS Play',result:'PASS'})
 }
 await page.evaluate(()=>window.qaMedia.pause({}));await page.evaluate(()=>window.qaMedia.seekto({seekTime:200}));await page.waitForFunction(()=>document.querySelector('audio').currentTime===200);assert.equal(await saved(),200)
 cases.push({scenario:'paused rewind from outro into intro saves latest',result:'PASS'})
 await page.evaluate(()=>window.qaMedia.seekto({seekTime:0}));assert.equal(await saved(),0)
 await page.evaluate(()=>window.qaMedia.play({}));assert.equal(await position(),0);cases.push({scenario:'explicit zero is not restored to old checkpoint',result:'PASS'})
 await page.evaluate(()=>{window.qaMedia.seekto({seekTime:333.625});window.qaMedia.stop({});window.dispatchEvent(new Event('pagehide'))});assert.equal(await saved(),333)
 await page.reload();await page.locator('#list button').click();await page.waitForFunction(()=>document.querySelector('audio').currentTime===333);cases.push({scenario:'OS Stop/pagehide/reload keeps saved position',result:'PASS'})
 assert.deepEqual(errors,[])
 console.log('OFFLINE_MATRIX '+JSON.stringify({engine:'Chromium',profile:process.env.PLAYER_QA_PROFILE||'iPhone 13',cases}))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
