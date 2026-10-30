'use client'
import {useRef, useState} from 'react'
import {formatPlaybackTime} from '@/lib/playerControls'

export type NavigableEpisode = {id:string;title:string;number:number;progress:number;progressKnown?:boolean;completed:boolean;duration:number}
export default function EpisodeNavigation({episodes,currentId,currentProgress,error,onSelect}:{episodes:NavigableEpisode[];currentId:string;currentProgress:number;error?:string;onSelect:(id:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null)
 const [open,setOpen]=useState(false)
 const index=episodes.findIndex(ep=>ep.id===currentId)
 const previous=index>0?episodes[index-1]:null
 const next=index>=0?episodes[index+1]:null
 function close(){dialog.current?.close();setOpen(false)}
 function select(id:string){close();if(id!==currentId)onSelect(id)}
 return <div className="et-episode-navigation">
  <div className="et-episode-buttons">
   <button type="button" disabled={!previous} onClick={()=>previous&&select(previous.id)} aria-label="Previous episode">← Previous</button>
   <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{dialog.current?.showModal();setOpen(true)}}>Episodes</button>
   <button type="button" disabled={!next} onClick={()=>next&&select(next.id)} aria-label="Next episode">Next →</button>
  </div>
  <dialog ref={dialog} aria-labelledby="series-episodes-heading" onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)} onClick={e=>{if(e.target===e.currentTarget)close()}}>
   <header><h2 id="series-episodes-heading">Series episodes</h2><button type="button" onClick={close} aria-label="Close episodes">✕</button></header>
   <p>Choose an episode to resume. Use Start Over on the player to restart it.</p>
   {error&&<p role="alert">{error}</p>}
   {!error&&!episodes.length&&<p>Loading available episodes…</p>}
   <ol>{episodes.map(ep=>{
    const current=ep.id===currentId
    const progress=current?currentProgress:ep.progress
    return <li key={ep.id}><button type="button" aria-current={current?'true':undefined} onClick={()=>select(ep.id)}>
     <strong>Episode {ep.number} · {ep.title}</strong>
     <span>{current?'Now selected · ':''}{!current&&ep.progressKnown===false?'Saved progress unavailable':ep.completed?'Completed':progress>0?`Resume at ${formatPlaybackTime(progress)}`:'Not started'}{ep.duration>0?` · ${formatPlaybackTime(ep.duration)} total`:''}</span>
    </button></li>
   })}</ol>
  </dialog>
  <style>{`
   .et-episode-navigation{width:100%}.et-episode-buttons{display:flex;gap:8px;margin-bottom:8px}
   .et-episode-buttons button{flex:1;min-width:0;min-height:44px;background:#ffffff12;color:white;border:1px solid #ffffff30;border-radius:10px;font:inherit;font-size:12px;cursor:pointer}
   .et-episode-buttons button:disabled{opacity:.4;cursor:default}
   .et-episode-navigation dialog{box-sizing:border-box;width:calc(100% - 24px);max-width:540px;max-height:80dvh;border:1px solid #475569;border-radius:16px;background:#0f172a;color:white;padding:18px;overflow:auto}
   .et-episode-navigation dialog::backdrop{background:#000b}.et-episode-navigation header{display:flex;align-items:center;justify-content:space-between;gap:8px}
   .et-episode-navigation h2{font-size:20px;margin:0}.et-episode-navigation header button{min-width:44px;min-height:44px;background:transparent;border:1px solid #64748b;border-radius:10px;color:white}
   .et-episode-navigation p{font-size:13px;color:#cbd5e1;line-height:1.5}.et-episode-navigation ol{list-style:none;padding:0;margin:12px 0 0}
   .et-episode-navigation li button{display:flex;flex-direction:column;gap:7px;text-align:left;width:100%;min-height:64px;padding:14px;margin-top:8px;background:#ffffff08;border:1px solid #ffffff25;border-radius:10px;color:white;cursor:pointer;font:inherit}
   .et-episode-navigation li button[aria-current]{border-color:#f97316;background:#f9731618}.et-episode-navigation li span{font-size:12px;color:#cbd5e1}.et-episode-navigation strong{font-size:14px;line-height:1.4}
   .et-episode-navigation button:focus-visible{outline:3px solid #fdba74;outline-offset:2px}
  `}</style>
 </div>
}
