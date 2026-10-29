// Type-check new Admin surfaces without importing the historical pipeline graph.
// Full-repository tsc remains a separate, explicitly reported check.
const ts=require('typescript'),fs=require('fs'),path=require('path')
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):/\.tsx?$/.test(e.name)?[path.join(dir,e.name)]:[])}
const roots=[...walk('lib/admin-center'),...walk('app/api/admin/center'),...walk('__tests__/admin-center'),'app/api/cron/admin-center-alerts/route.ts','middleware.ts','app/admin/AdminShell.tsx','app/admin/CommandCenter.tsx','app/admin/InformationFlow.tsx','app/admin/information-flow/page.tsx','app/admin/layout.tsx','app/admin/page.tsx','app/admin/finance/page.tsx','app/admin/finance/budget/page.tsx','app/admin/finance/budget/BudgetPlaceholder.tsx','app/admin/support/page.tsx','app/admin/action-center/page.tsx','app/admin/documentation/page.tsx',...['mercury','payments','refund','post-to-x','social-draft','send-to-orion','support/ai-suggest','support/knowledge','support/reply','support/update'].map(p=>`app/api/admin/${p}/route.ts`)]
const config=ts.readConfigFile('tsconfig.json',ts.sys.readFile),parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,process.cwd())
const program=ts.createProgram(roots,{...parsed.options,noEmit:true,incremental:false,strictNullChecks:true})
const diagnostics=ts.getPreEmitDiagnostics(program)
for(const d of diagnostics)console.error((d.file?.fileName||'')+':'+(d.file?d.file.getLineAndCharacterOfPosition(d.start).line+1:'')+' '+ts.flattenDiagnosticMessageText(d.messageText,' '))
console.log(`Admin type check: ${diagnostics.length} diagnostics in ${roots.length} entry files`)
process.exitCode=diagnostics.length?1:0
