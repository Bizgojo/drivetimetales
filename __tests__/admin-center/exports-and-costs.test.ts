import {csvText,csvCell} from '../../lib/admin-center/csv'
import {costBucket,finishCost,combineCosts,classifyCost} from '../../lib/admin-center/story-costs'
describe('Independent spreadsheet exports',()=>{
 test('unknown is blank, verified zero numeric, formula-like text inert',()=>{expect(csvCell(null)).toBe('');expect(csvCell(0)).toBe('0');expect(csvCell(-3)).toBe('-3');for(const v of ['=HYPERLINK("bad")','+SUM(A1)','-malicious',' @formula','\tformula'])expect(csvCell(v)).toMatch(/^"'/);expect(csvText([['A,B','a"b',null,0]])).toBe('\uFEFF"A,B","a""b",,0\r\n')})
})
describe('Attributed story usage, not invented full costs',()=>{
 test('unpriced ElevenLabs keeps total unknown and records a subtotal',()=>{expect(finishCost({...costBucket(),writing:2,production:3})).toEqual({writing:2,production:3,elevenlabs:null,total:null,recorded:5})})
 test('zero is evidence; full category coverage is required across episodes',()=>{const a=finishCost({...costBucket(),writing:2,production:3,elevenlabs:0}),b=finishCost({...costBucket(),writing:1});expect(a.total).toBe(5);expect(combineCosts([a,b])).toMatchObject({writing:3,production:null,elevenlabs:null,total:null});expect(combineCosts([]).total).toBeNull()})
 test('voice never double-counted; runtime personalization is excluded',()=>{expect(classifyCost('elevenlabs','script')).toBe('elevenlabs');expect(classifyCost('anthropic','story-script')).toBe('writing');expect(classifyCost('openai','cover-art')).toBe('production');expect(classifyCost('anthropic','belle_intro_personalization')).toBeNull();expect(classifyCost('anthropic','marketing-variance-commentary')).toBeNull()})
})
import {periodMetrics} from '../../lib/admin-center/story-performance'
test('period rankings deduplicate sessions and separate old starts from current finishes',()=>{
 const since='2026-10-01T00:00:00Z',base={story_id:'story',session_id:'session',started_at:'2026-10-02T12:00:00Z',ended_at:'2026-10-02T12:10:00Z',progress_pct:98,stop_reason:'manual_pause'}
 const result=periodMetrics([base,base,{...base,session_id:'older',started_at:'2026-09-20T12:00:00Z',stop_reason:'completed'},{...base,session_id:null}], [{story_id:'story',rating:5,created_at:'2026-10-02T00:00:00Z'},{story_id:'story',rating:null,created_at:'2026-10-02T00:00:00Z'},{story_id:'story',rating:1,created_at:'2026-09-02T00:00:00Z'}],since)
 expect(result.story).toMatchObject({starts:1,finishes:2,reviews:1,rating:5})
})
