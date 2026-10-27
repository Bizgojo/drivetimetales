'use client'
import {useEffect,useState} from 'react'
export default function SubscriberUpdates(){const [items,setItems]=useState<any[]>([]);useEffect(()=>{let cancelled=false;fetch('/api/user/notifications',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(!cancelled)setItems(d?.notifications||[])}).catch(()=>{});return()=>{cancelled=true}},[])
 async function markRead(id:string){const r=await fetch('/api/user/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});if(r.ok)setItems(prev=>prev.map(n=>n.id===id?{...n,read_at:new Date().toISOString()}:n))}
 if(!items.length)return null
 return <section className="mb-6 space-y-3"><h2 className="text-lg font-bold text-white">Updates for You</h2>{items.slice(0,10).map(item=><article key={item.id} className="p-4 rounded-xl border border-slate-600 bg-slate-900 text-white"><h3 className="font-bold">{!item.read_at?'● ':''}{item.subject}</h3><p className="mt-2">{item.message}</p>{item.story_id&&<a href={`/player/${item.story_id}?autoplay=1&playNow=1`} className="inline-block mt-3 px-4 py-2 bg-orange-500 rounded-lg text-black font-bold">Listen</a>}{!item.read_at&&<button onClick={()=>markRead(item.id)} className="block mt-3 underline text-sm">Mark as read</button>}</article>)}</section>
}
