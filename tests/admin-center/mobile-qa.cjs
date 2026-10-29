// Layout/interaction tests use explicit fixtures. They do not verify live integrations.
const fs=require('fs'),path=require('path'),esbuild=require('esbuild'),{chromium}=require('playwright')
async function main(){
 const output=path.resolve('tmp/admin-center-ui.js')
 const stubs={
  'next/link':`import React from 'react'; export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`,
  'next/navigation':`export function useSearchParams(){return new URLSearchParams(location.search)}`,
 }
 await esbuild.build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import CommandCenter from './app/admin/CommandCenter';createRoot(document.getElementById('root')).render(<CommandCenter/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,jsx:'automatic',outfile:output,loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'next-stubs',setup(b){b.onResolve({filter:/^next\/(link|navigation)$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'jsx',resolveDir:process.cwd()}))}}]})
 const browser=await chromium.launch({executablePath:process.env.ADMIN_QA_CHROMIUM||chromium.executablePath(),headless:true,args:process.env.ADMIN_QA_SPARTICUZ?require(process.env.ADMIN_QA_SPARTICUZ).args:['--no-sandbox','--disable-dev-shm-usage']})
 const results=[]
 try{const page=await browser.newPage();for(const [name,width,height] of [['iPhone',390,844],['iPad',820,1180],['Mac',1440,1000]]){
  await page.setViewportSize({width,height});const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('https://admin-qa.invalid/**',async route=>{
   const u=new URL(route.request().url())
   if(u.pathname==='/'){return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>'})}
   const connected={status:'connected',data:[],source:'TEST FIXTURE'}
   let p={}
   if(u.pathname.endsWith('notifications'))p={events:[],readIds:[],settings:null}
   else if(u.pathname.endsWith('campaigns'))p=connected
   else if(u.pathname==='/api/admin/center')p={fetchedAt:new Date().toISOString(),stripe:{status:'unavailable',reason:'TEST FIXTURE: disconnected'},mercury:{status:'unavailable',reason:'TEST FIXTURE: disconnected'},published:connected,jobs:connected,inbox:connected,campaigns:connected,activity:connected,workers:connected,queue:connected,stories:{...connected,data:[{id:'fixture-story',title:'TEST FIXTURE Story',author:'Fixture author',genre:'Mystery',duration_mins:18,pct_finished:75}]},messages:{...connected,data:[{id:'fixture-message',subject:'TEST FIXTURE support',name:'Fixture customer',message:'Testing mobile reply form',status:'new',created_at:new Date().toISOString()}]},users:connected,referrals:connected,preferences:connected,travel:connected,listening:connected,meta:connected,metrics:connected,spend:connected,expenses:{status:'unavailable',data:null},policy:connected,reports:connected}
   else return route.abort()
   return route.fulfill({contentType:'application/json',body:JSON.stringify(p)})
  })
  await page.goto('https://admin-qa.invalid/')
  await page.addStyleTag({content:fs.readFileSync('app/admin/command-center.css','utf8')})
  await page.addScriptTag({content:fs.readFileSync(output,'utf8')})
  await page.getByRole('heading',{name:'Overview',exact:true}).waitFor().catch(e=>{console.log(errors);throw e})
  for(const section of ['Overview','Agents','Production','Stories','Customers','Marketing','Finance','Documentation']){
   await page.getByRole('navigation').getByRole('button',{name:section,exact:true}).click()
   await page.getByRole('heading',{name:section,exact:true}).waitFor()
   await page.getByText('Loading verified sources…').waitFor({state:'hidden'})
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)
   if(overflow)throw new Error(`${name} ${section} has horizontal page overflow`)
   if(section==='Customers'){await page.getByRole('button',{name:'Read / reply'}).click();await page.getByRole('button',{name:'Approve & send email'}).waitFor();if(await page.getByRole('button',{name:'Approve & send email'}).isEnabled())throw new Error('Empty reply is sendable')}
  }
  if(errors.length)throw new Error(errors.join('\n'))
  await page.screenshot({path:`tmp/admin-center-${name.toLowerCase()}.png`,fullPage:true})
  results.push({device:name,viewport:`${width}x${height}`,sections:8,overflow:false,errors:0,mode:'fixtures'})
  // Reuse a single context for constrained single-process Chromium environments.
 }
 console.log(JSON.stringify(results,null,2))
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1})
