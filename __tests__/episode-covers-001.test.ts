import {readFileSync} from 'fs'
import {join} from 'path'
const nav=readFileSync(join(__dirname,'../components/player/EpisodeNavigation.tsx'),'utf8')
const player=readFileSync(join(__dirname,'../components/player/CanonicalPlayer.tsx'),'utf8')
describe('EPISODE-COVERS-001 series episodes dialog shows covers',()=>{
 it('loads cover_url for series episodes',()=>{expect(player).toContain("duration_mins, cover_url')")})
 it('maps cover into the episode list',()=>{expect(player).toContain('coverUrl:(ep as any).cover_url || null')})
 it('renders a cover image per episode',()=>{expect(nav).toContain('coverUrl?:string|null');expect(nav).toMatch(/<img className="et-episode-cover" src=\{ep\.coverUrl\}/)})
})
