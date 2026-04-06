'use client'

import { useState } from 'react'

const GENRES = [
  'Any','Thriller','Horror','Mystery','Adventure','Drama',
  'Sci-Fi','Western','Historical Drama','Supernatural','Family','Crime','Dark Mystery'
]

const AUTHORS = [
  'Any','Sara Keene','Elias Thorn','Dale Harmon','Julian Mercer',
  'Daniel Wren','Mark Holbrook','Silas Graves','Nina Vasquez',
  'Caroline Drake','Marc Hobelman',
]

// Best authors per genre (primary, secondary)
const GENRE_AUTHORS: Record<string, string[]> = {
  'Thriller':         ['Sara Keene','Mark Holbrook'],
  'Horror':           ['Silas Graves','Elias Thorn'],
  'Mystery':          ['Julian Mercer','Caroline Drake'],
  'Adventure':        ['Dale Harmon','Mark Holbrook'],
  'Drama':            ['Daniel Wren','Mark Holbrook'],
  'Sci-Fi':           ['Nina Vasquez'],
  'Western':          ['Marc Hobelman'],
  'Historical Drama': ['Caroline Drake','Daniel Wren'],
  'Supernatural':     ['Silas Graves','Sara Keene'],
  'Family':           ['Daniel Wren'],
  'Crime':            ['Julian Mercer','Mark Holbrook'],
  'Dark Mystery':     ['Elias Thorn','Julian Mercer'],
}

const SYSTEM_PROMPT = `You are a senior audio drama writer for Endless Tales, an audio storytelling platform for commuters, truckers, and road trippers. Your job is to write story outlines that will be handed to a production AI (Hal) to develop into full scripts.

PLATFORM RULES:
- Stories play while people drive — listeners may be slightly distracted
- Content must work without visuals — setting, action, and emotion through dialogue, narration, and sound
- No graphic violence, explicit content, or highly distressing material
- Target durations: 15 min (~2,000 words), 30 min (~4,000 words), 45 min (~6,000 words)

AUTHOR ROSTER:
- Sara Keene — First person, thriller/horror, tense/intimate/fast, female protagonists
- Elias Thorn — First person, horror/dark mystery, dark/lyrical/slow-burn, rural settings
- Dale Harmon — Third limited, adventure/action, warm/cinematic/steady, blue-collar heroes
- Julian Mercer — Third limited, mystery/crime, precise/cool/methodical, detective POV
- Daniel Wren — Third omniscient, drama/family, warm/compassionate/slow, ensemble casts
- Mark Holbrook — Third limited, drama/thriller, cinematic/restrained, male protagonists under pressure
- Silas Graves — First person, horror/supernatural, raw/visceral/punchy, working-class protagonists
- Nina Vasquez — Third omniscient, sci-fi/speculative, clinical/curious, female scientists
- Caroline Drake — Third limited, mystery/historical drama, elegant/menacing, 1920s-1960s settings
- Marc Hobelman — Third limited, western/frontier, spare/laconic, lone protagonists

ENDING RULES (CRITICAL):
- STANDALONE stories MUST have a complete, satisfying, clearly-signaled ending. No ambiguity. The listener must know the story is finished.
- SERIES episodes (except the finale) MUST end on a hard cliffhanger — a shocking revelation, mortal danger, or betrayal.
- SERIES FINALE must resolve ALL major threads completely. No cliffhangers. Signal clearly the series is over.

OUTPUT FORMAT — Return a valid JSON array. Each element is one outline:
{
  "title": string,
  "author": string,
  "genre": string,
  "narrative_voice": string,
  "duration_target": string,
  "logline": string (24 words max),
  "setting": string,
  "protagonist": string,
  "antagonist_conflict": string,
  "act1": string,
  "act2": string,
  "act3": string,
  "key_scenes": string[],
  "ending_note": string (for standalone: describe the satisfying ending; for series ep: describe the cliffhanger; for finale: describe the resolution),
  "suno_prompt": string,
  "series_potential": boolean,
  "series_pitch": string,
  "episode_number": number or null,
  "total_episodes": number or null,
  "is_finale": boolean
}
Return ONLY the JSON array, no markdown, no preamble.`

const voiceColor: Record<string,string> = {
  first_person:'#dc2626', third_limited:'#2563eb',
  third_omniscient:'#16a34a', second_person:'#9333ea'
}
const genreColor: Record<string,string> = {
  Thriller:'#dc2626', Horror:'#7c3aed', Mystery:'#2563eb',
  Adventure:'#f97316', Drama:'#16a34a', 'Sci-Fi':'#0891b2',
  Western:'#92400e', 'Historical Drama':'#78716c',
  Supernatural:'#9333ea', Family:'#16a34a', Crime:'#dc2626',
  'Dark Mystery':'#7c3aed'
}

interface Outline {
  title:string; author:string; genre:string; narrative_voice:string
  duration_target:string; logline:string; setting:string
  protagonist:string; antagonist_conflict:string
  act1:string; act2:string; act3:string
  key_scenes:string[]; ending_note:string; suno_prompt:string
  series_potential:boolean; series_pitch:string
  episode_number:number|null; total_episodes:number|null; is_finale:boolean
}

export default function StoryGeneratorPage() {
  const [count,setCount] = useState('5')
  const [genre,setGenre] = useState('Any')
  const [author,setAuthor] = useState('Any')
  const [seedIdea,setSeedIdea] = useState('')
  const [isSeries,setIsSeries] = useState(false)
  const [episodeCount,setEpisodeCount] = useState('4')
  const [seriesTitle,setSeriesTitle] = useState('')
  const [loading,setLoading] = useState(false)
  const [outlines,setOutlines] = useState<Outline[]>([])
  const [error,setError] = useState('')
  const [expandedIdx,setExpandedIdx] = useState<number|null>(null)

  const bg='#FAF9F6',card='#fff',border='#e5e7eb',text='#111',muted='#6b7280',orange='#f97316'
  const inp = {padding:'10px 14px',border:`1.5px solid ${border}`,borderRadius:10,fontSize:14,color:text,background:'#fff',outline:'none',boxSizing:'border-box' as const}

  // Get suggested authors for selected genre
  const suggestedAuthors = genre !== 'Any' ? (GENRE_AUTHORS[genre] || []) : []

  async function generate() {
    setLoading(true); setError(''); setOutlines([]); setExpandedIdx(null)

    let prompt = ''

    if (isSeries) {
      const epCount = parseInt(episodeCount)
      const titleHint = seriesTitle.trim() ? `Series working title: "${seriesTitle.trim()}". ` : ''
      const genreInstr = genre !== 'Any' ? `Genre: ${genre}. ` : ''
      const authorInstr = author !== 'Any' ? `Author: ${author}. ` : suggestedAuthors.length > 0 ? `Suggested authors for this genre: ${suggestedAuthors.join(' or ')}. Pick one. ` : ''
      const seedInstr = seedIdea.trim() ? `Series concept: "${seedIdea.trim()}". ` : ''

      prompt = `${titleHint}${genreInstr}${authorInstr}${seedInstr}
Generate a complete series of ${epCount} episode outlines. 
Episodes 1 through ${epCount-1} must each end on a HARD CLIFFHANGER.
Episode ${epCount} is the SERIES FINALE — it must resolve ALL threads completely with a satisfying ending. No cliffhanger on the finale.
Set episode_number (1 through ${epCount}), total_episodes (${epCount}), and is_finale (true only for episode ${epCount}).
The ending_note field must describe: the cliffhanger for eps 1-${epCount-1}, and the resolution for ep ${epCount}.
Return all ${epCount} episode outlines as a single JSON array.`
    } else {
      const genreInstr = genre !== 'Any' ? `Genre: ${genre}. ` : ''
      const authorInstr = author !== 'Any' ? `Author: ${author}. ` : suggestedAuthors.length > 0 ? `Suggested authors for this genre: ${suggestedAuthors.join(' or ')}. ` : ''
      const seedInstr = seedIdea.trim() ? `Seed idea: "${seedIdea.trim()}". ` : ''
      prompt = `${genreInstr}${authorInstr}${seedInstr}Generate ${count} standalone story outlines. Each must have a complete, satisfying, clearly-signaled ending — the listener must know the story is finished. Describe the ending in the ending_note field. Set episode_number and total_episodes to null, is_finale to false.`
    }

    try {
      const res = await fetch('/api/admin/story-generator',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          model:'claude-opus-4-6', max_tokens:isSeries?16000:8000,
          system:SYSTEM_PROMPT,
          messages:[{role:'user',content:prompt}]
        })
      })
      const data = await res.json()
      if(!res.ok) throw new Error(data.error?.message||'API error')
      const raw = data.content?.[0]?.text||''
      const parsed:Outline[] = JSON.parse(raw.replace(/```json|```/g,'').trim())
      setOutlines(parsed); setExpandedIdx(0)
    } catch(e:any) { setError(e.message||'Failed. Check API key and try again.') }
    setLoading(false)
  }

  return (
    <div style={{minHeight:'100vh',background:bg,padding:28,fontFamily:'-apple-system,sans-serif'}}>
      <div style={{marginBottom:24}}>
        <h1 style={{margin:0,fontSize:26,fontWeight:900,color:text}}>✍️ Story Outline Generator</h1>
        <p style={{margin:'4px 0 0',color:muted,fontSize:14}}>Generate production-ready story outlines for Hal using Claude Opus.</p>
      </div>

      {/* Controls */}
      <div style={{background:card,border:`1px solid ${border}`,borderRadius:16,padding:'20px 24px',marginBottom:24}}>

        {/* Mode toggle */}
        <div style={{display:'flex',gap:10,marginBottom:20}}>
          <button onClick={()=>setIsSeries(false)} style={{padding:'8px 20px',borderRadius:8,border:`2px solid ${!isSeries?orange:border}`,background:!isSeries?'#fff8f3':'#fff',color:!isSeries?orange:muted,fontWeight:700,cursor:'pointer',fontSize:14}}>
            📖 Standalone Stories
          </button>
          <button onClick={()=>setIsSeries(true)} style={{padding:'8px 20px',borderRadius:8,border:`2px solid ${isSeries?orange:border}`,background:isSeries?'#fff8f3':'#fff',color:isSeries?orange:muted,fontWeight:700,cursor:'pointer',fontSize:14}}>
            📺 Series
          </button>
        </div>

        <div style={{display:'grid',gridTemplateColumns:isSeries?'1fr 1fr 1fr 1fr':'140px 1fr 1fr 1fr',gap:16,marginBottom:16}}>

          {/* Count — standalone only */}
          {!isSeries&&(
            <div>
              <label style={{display:'block',color:muted,fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>Outlines</label>
              <select value={count} onChange={e=>setCount(e.target.value)} style={{...inp,width:'100%'}}>
                <option value="3">3 outlines</option>
                <option value="5">5 outlines</option>
                <option value="7">7 outlines</option>
              </select>
            </div>
          )}

          {/* Series options */}
          {isSeries&&(
            <>
              <div>
                <label style={{display:'block',color:muted,fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>Episodes</label>
                <select value={episodeCount} onChange={e=>setEpisodeCount(e.target.value)} style={{...inp,width:'100%'}}>
                  {['3','4','5','6','8','10'].map(n=><option key={n} value={n}>{n} episodes</option>)}
                </select>
              </div>
              <div>
                <label style={{display:'block',color:muted,fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>Series Title (optional)</label>
                <input value={seriesTitle} onChange={e=>setSeriesTitle(e.target.value)} placeholder="Working title..." style={{...inp,width:'100%'}} />
              </div>
            </>
          )}

          {/* Genre */}
          <div>
            <label style={{display:'block',color:muted,fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>Genre</label>
            <select value={genre} onChange={e=>{setGenre(e.target.value);setAuthor('Any')}} style={{...inp,width:'100%'}}>
              {GENRES.map(g=><option key={g}>{g}</option>)}
            </select>
            {suggestedAuthors.length>0&&(
              <div style={{color:orange,fontSize:11,fontWeight:600,marginTop:4}}>
                Best fit: {suggestedAuthors.join(', ')}
              </div>
            )}
          </div>

          {/* Author */}
          <div>
            <label style={{display:'block',color:muted,fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>Author</label>
            <select value={author} onChange={e=>setAuthor(e.target.value)} style={{...inp,width:'100%'}}>
              <option value="Any">AI picks best fit</option>
              {AUTHORS.slice(1).map(a=>(
                <option key={a} value={a} style={{fontWeight:suggestedAuthors.includes(a)?700:400}}>
                  {suggestedAuthors.includes(a)?'★ ':''}{a}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Seed idea + Generate */}
        <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:16,alignItems:'end'}}>
          <div>
            <label style={{display:'block',color:muted,fontSize:12,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>
              {isSeries?'Series Concept (optional)':'Seed Idea (optional)'}
            </label>
            <input value={seedIdea} onChange={e=>setSeedIdea(e.target.value)} placeholder={isSeries?"e.g. A small town where people start losing their memories one by one...":"e.g. A truck driver finds a stowaway, a 1940s detective noir..."} style={{...inp,width:'100%'}} onKeyDown={e=>e.key==='Enter'&&!loading&&generate()} />
          </div>
          <button onClick={generate} disabled={loading} style={{background:loading?'#9ca3af':orange,color:'white',border:'none',borderRadius:10,padding:'11px 28px',cursor:loading?'not-allowed':'pointer',fontWeight:800,fontSize:15,whiteSpace:'nowrap'}}>
            {loading?'⏳ Generating...':'✨ Generate'}
          </button>
        </div>
      </div>

      {error&&<div style={{background:'#fee2e2',border:'1px solid #fca5a5',borderRadius:10,padding:'12px 16px',marginBottom:20,color:'#dc2626',fontSize:14}}>{error}</div>}

      {loading&&(
        <div style={{textAlign:'center',padding:'60px 0'}}>
          <div style={{width:48,height:48,border:`4px solid ${orange}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 1s linear infinite',margin:'0 auto 16px'}}/>
          <div style={{color:muted,fontSize:15}}>Claude Opus is crafting your {isSeries?'series episodes':'outlines'}...</div>
          <div style={{color:muted,fontSize:13,marginTop:4}}>{isSeries?'Series generation takes 40–60 seconds':'This takes 20–40 seconds for quality work'}</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {outlines.length>0&&(
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <div style={{fontWeight:800,color:text,fontSize:16}}>
              {isSeries
                ? `${outlines.length}-Episode Series: "${outlines[0]?.title?.split(':')[0] || seriesTitle || 'Untitled Series'}" by ${outlines[0]?.author}`
                : `${outlines.length} Outlines Generated`}
            </div>
            <button onClick={generate} style={{background:'none',border:`1px solid ${border}`,borderRadius:8,padding:'6px 16px',cursor:'pointer',color:muted,fontSize:13,fontWeight:600}}>↺ Regenerate</button>
          </div>

          {/* Series episode nav */}
          {isSeries&&(
            <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
              {outlines.map((o,i)=>(
                <button key={i} onClick={()=>setExpandedIdx(expandedIdx===i?null:i)} style={{padding:'6px 16px',borderRadius:8,border:`2px solid ${expandedIdx===i?orange:border}`,background:expandedIdx===i?'#fff8f3':'#fff',color:expandedIdx===i?orange:text,fontWeight:700,cursor:'pointer',fontSize:13}}>
                  {o.is_finale?'🏁 Finale':`Ep ${o.episode_number||i+1}`}
                </button>
              ))}
            </div>
          )}

          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {outlines.map((o,i)=>{
              const isOpen = isSeries ? expandedIdx===i : expandedIdx===i
              const gc=genreColor[o.genre]||'#6b7280'
              const vc=voiceColor[o.narrative_voice]||'#6b7280'
              const isFinale = o.is_finale
              const epNum = o.episode_number

              return (
                <div key={i} style={{background:card,border:`2px solid ${isFinale?'#16a34a':isOpen?orange:border}`,borderRadius:16,overflow:'hidden'}}>
                  <div onClick={()=>setExpandedIdx(isOpen?null:i)} style={{padding:'20px 24px',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
                        {epNum&&<span style={{background:'#1e293b',color:'white',borderRadius:6,padding:'2px 10px',fontSize:12,fontWeight:700}}>{isFinale?'🏁 FINALE':`Episode ${epNum}`}</span>}
                        <span style={{background:gc+'18',color:gc,border:`1px solid ${gc}40`,borderRadius:6,padding:'2px 10px',fontSize:12,fontWeight:700}}>{o.genre}</span>
                        <span style={{background:vc+'18',color:vc,border:`1px solid ${vc}40`,borderRadius:6,padding:'2px 10px',fontSize:12,fontWeight:700}}>{o.narrative_voice?.replace(/_/g,' ')}</span>
                        <span style={{background:'#f3f4f6',color:muted,borderRadius:6,padding:'2px 10px',fontSize:12,fontWeight:600}}>{o.duration_target}</span>
                        {!isSeries&&o.series_potential&&<span style={{background:'#fef3c7',color:'#92400e',border:'1px solid #fcd34d',borderRadius:6,padding:'2px 10px',fontSize:12,fontWeight:700}}>📺 Series Potential</span>}
                      </div>
                      <h2 style={{margin:'0 0 4px',fontSize:20,fontWeight:900,color:text}}>{o.title}</h2>
                      <div style={{color:orange,fontSize:13,fontWeight:700,marginBottom:10}}>by {o.author}</div>
                      <div style={{color:'#374151',fontSize:15,fontStyle:'italic',lineHeight:1.5,borderLeft:`3px solid ${orange}`,paddingLeft:12}}>"{o.logline}"</div>
                    </div>
                    <div style={{marginLeft:16,fontSize:20,color:muted,flexShrink:0}}>{isOpen?'▲':'▼'}</div>
                  </div>

                  {isOpen&&(
                    <div style={{borderTop:`1px solid ${border}`,padding:'24px'}}>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:24}}>
                        {[{label:'📍 Setting',value:o.setting},{label:'👤 Protagonist',value:o.protagonist},{label:'⚡ Conflict',value:o.antagonist_conflict}].map(f=>(
                          <div key={f.label} style={{background:'#f9fafb',borderRadius:10,padding:'14px 16px'}}>
                            <div style={{color:muted,fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>{f.label}</div>
                            <div style={{color:text,fontSize:14,lineHeight:1.6}}>{f.value}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{marginBottom:24}}>
                        <div style={{fontWeight:800,color:text,fontSize:15,marginBottom:12}}>Three-Act Structure</div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
                          {[{label:'Act I — Setup',value:o.act1,color:'#2563eb'},{label:'Act II — Confrontation',value:o.act2,color:'#f97316'},{label:'Act III — Resolution',value:o.act3,color:'#16a34a'}].map(a=>(
                            <div key={a.label} style={{borderTop:`3px solid ${a.color}`,background:'#f9fafb',borderRadius:'0 0 10px 10px',padding:'14px 16px'}}>
                              <div style={{color:a.color,fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:8}}>{a.label}</div>
                              <div style={{color:text,fontSize:14,lineHeight:1.7}}>{a.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{marginBottom:24}}>
                        <div style={{fontWeight:800,color:text,fontSize:15,marginBottom:12}}>Key Scenes</div>
                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                          {(o.key_scenes||[]).map((scene,si)=>(
                            <div key={si} style={{display:'flex',gap:12,alignItems:'flex-start'}}>
                              <div style={{width:24,height:24,background:orange,color:'white',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:800,flexShrink:0,marginTop:1}}>{si+1}</div>
                              <div style={{color:text,fontSize:14,lineHeight:1.6,paddingTop:2}}>{scene}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Ending note */}
                      {o.ending_note&&(
                        <div style={{background:isFinale?'#f0fdf4':isSeries?'#fef2f2':'#f0fdf4',border:`1px solid ${isFinale?'#86efac':isSeries?'#fca5a5':'#86efac'}`,borderRadius:10,padding:'14px 18px',marginBottom:20}}>
                          <div style={{color:isFinale?'#16a34a':isSeries?'#dc2626':'#16a34a',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>
                            {isFinale?'🏁 Series Finale Resolution':isSeries?'⚡ Episode Cliffhanger':'✅ Satisfying Ending'}
                          </div>
                          <div style={{color:text,fontSize:14,lineHeight:1.6}}>{o.ending_note}</div>
                        </div>
                      )}

                      <div style={{background:'#1e1b4b',borderRadius:10,padding:'14px 18px',marginBottom:(!isSeries&&o.series_potential)?20:0}}>
                        <div style={{color:'#a5b4fc',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>🎵 Suno Music Prompt</div>
                        <div style={{color:'#e0e7ff',fontSize:14,lineHeight:1.6,fontStyle:'italic'}}>{o.suno_prompt}</div>
                      </div>

                      {!isSeries&&o.series_potential&&o.series_pitch&&(
                        <div style={{background:'#fef3c7',border:'1px solid #fcd34d',borderRadius:10,padding:'14px 18px'}}>
                          <div style={{color:'#92400e',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>📺 Series Potential</div>
                          <div style={{color:'#78350f',fontSize:14,lineHeight:1.6}}>{o.series_pitch}</div>
                        </div>
                      )}

                      <div style={{marginTop:20,display:'flex',gap:10}}>
                        <button onClick={()=>{navigator.clipboard.writeText(JSON.stringify(o,null,2));alert('Copied as JSON for Hal')}} style={{background:'#1e293b',color:'white',border:'none',borderRadius:8,padding:'10px 20px',cursor:'pointer',fontWeight:700,fontSize:13}}>📋 Copy for Hal (JSON)</button>
                        <button onClick={()=>{
                          const t=`${isSeries?`SERIES: ${seriesTitle||o.title}\nEPISODE ${o.episode_number} OF ${o.total_episodes}${o.is_finale?' (FINALE)':''}\n`:''}STORY OUTLINE: ${o.title}\nAuthor: ${o.author}\nGenre: ${o.genre}\nVoice: ${o.narrative_voice}\nDuration: ${o.duration_target}\n\nLOGLINE: ${o.logline}\n\nSETTING: ${o.setting}\nPROTAGONIST: ${o.protagonist}\nCONFLICT: ${o.antagonist_conflict}\n\nACT I: ${o.act1}\nACT II: ${o.act2}\nACT III: ${o.act3}\n\nKEY SCENES:\n${o.key_scenes.map((s,i)=>`${i+1}. ${s}`).join('\n')}\n\n${o.is_finale?'FINALE RESOLUTION':'EPISODE ENDING'}: ${o.ending_note}\n\nSUNO PROMPT: ${o.suno_prompt}`
                          navigator.clipboard.writeText(t);alert('Copied as text')
                        }} style={{background:'#e5e7eb',color:text,border:'none',borderRadius:8,padding:'10px 20px',cursor:'pointer',fontWeight:700,fontSize:13}}>📄 Copy as Text</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Copy all for Hal */}
          {isSeries&&(
            <div style={{marginTop:16,textAlign:'center'}}>
              <button onClick={()=>{navigator.clipboard.writeText(JSON.stringify(outlines,null,2));alert(`All ${outlines.length} episode outlines copied as JSON for Hal`)}} style={{background:'#1e293b',color:'white',border:'none',borderRadius:10,padding:'12px 32px',cursor:'pointer',fontWeight:800,fontSize:15}}>
                📋 Copy Full Series for Hal (JSON)
              </button>
            </div>
          )}
        </div>
      )}

      {!loading&&outlines.length===0&&!error&&(
        <div style={{textAlign:'center',padding:'80px 0',color:muted}}>
          <div style={{fontSize:56,marginBottom:16}}>✍️</div>
          <div style={{fontWeight:700,color:text,fontSize:18,marginBottom:8}}>Ready to generate</div>
          <div style={{fontSize:14}}>Choose standalone stories or a full series, pick your genre, and hit Generate</div>
        </div>
      )}
    </div>
  )
}
