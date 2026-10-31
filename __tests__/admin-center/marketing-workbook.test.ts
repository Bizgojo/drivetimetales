jest.mock('server-only',()=>({}),{virtual:true})
jest.mock('../../lib/admin-center/auth',()=>({adminAccess:jest.fn()}))
jest.mock('node:fs/promises',()=>({readFile:jest.fn()}))
import {NextResponse} from 'next/server'
import {readFile} from 'node:fs/promises'
import {adminAccess} from '../../lib/admin-center/auth'
import {GET} from '../../app/api/admin/center/marketing-workbook/route'
const access=adminAccess as jest.Mock,read=readFile as jest.Mock
beforeEach(()=>{access.mockReset();read.mockReset()})
test('Excel download denies non-admin access before reading the workbook',async()=>{
 access.mockResolvedValue(NextResponse.json({error:'Denied'},{status:403}))
 expect((await GET(new Request('https://app.invalid/api/admin/center/marketing-workbook'))).status).toBe(403)
 expect(read).not.toHaveBeenCalled()
})
test('authorized Excel download serves the fixed workbook as a private attachment',async()=>{
 access.mockResolvedValue(null)
 const bytes=await jest.requireActual('node:fs/promises').readFile('content/admin/Endless-Tales-6-plus-2-Marketing-Workbook.xlsx')
 read.mockResolvedValue(bytes)
 const r=await GET(new Request('https://app.invalid/api/admin/center/marketing-workbook?path=/etc/passwd'))
 expect(r.status).toBe(200)
 expect(r.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
 expect(r.headers.get('content-disposition')).toContain('attachment; filename="Endless-Tales-6-plus-2-Marketing-Workbook.xlsx"')
 expect(r.headers.get('cache-control')).toBe('private, no-store')
 expect(r.headers.get('x-content-type-options')).toBe('nosniff')
 expect(Buffer.from(await r.arrayBuffer())).toEqual(bytes)
 expect(read.mock.calls[0][0]).toMatch(/content\/admin\/Endless-Tales-6-plus-2-Marketing-Workbook\.xlsx$/)
})
test('a missing Excel asset returns unavailable rather than an empty workbook',async()=>{
 access.mockResolvedValue(null);read.mockRejectedValue(new Error('Missing asset'))
 expect((await GET(new Request('https://app.invalid/api/admin/center/marketing-workbook'))).status).toBe(503)
})
