'use client'
import {useEffect,useState} from 'react'
export default function StoryContributorCredit({storyId,seriesId}:{storyId?:string;seriesId?:string}){
 const [names,setNames]=useState<string[]>([])
 useEffect(()=>{let cancelled=false;setNames([]);if(!storyId&&!seriesId)return;const query=storyId?`storyId=${encodeURIComponent(storyId)}`:`seriesId=${encodeURIComponent(seriesId!)}`;fetch(`/api/stories/contributors?${query}`).then(r=>r.ok?r.json():null).then(d=>{if(!cancelled)setNames(d?.contributors||[])}).catch(()=>{});return()=>{cancelled=true}},[storyId,seriesId])
 return names.length?<p style={{color:'inherit',fontSize:13,lineHeight:1.45,margin:'8px 0',textAlign:'center'}}>Story idea contributed by {names.join(', ')} · Contributing {names.length===1?'author':'authors'}</p>:null
}
