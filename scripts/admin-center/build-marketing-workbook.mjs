import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';

const sourceFile=process.env.META_WORKBOOK_SOURCE_JSON||'/tmp/et-excel-build/source.json';
const {META_TEST_PLAN:plan,META_WEEKLY_FORECAST:weekly,META_DECISION_RULES:rules,META_STANDING_RULES:standing}=JSON.parse(await fs.readFile(sourceFile,'utf8'));
const outputDir=process.env.META_WORKBOOK_OUTPUT_DIR||'/tmp/et-excel-build/output';
const qaDir=process.env.META_WORKBOOK_QA_DIR||'/tmp/et-excel-build';
await fs.mkdir(qaDir,{recursive:true});
await fs.mkdir(outputDir,{recursive:true});
const workbook=Workbook.create();
const names=['Budget','Actual Results','Actual vs Budget','Variance Analysis','Decision Rules','Cash'];
const sheets=Object.fromEntries(names.map(n=>[n,workbook.worksheets.add(n)]));
const green='#173E3D',ink='#243534',muted='#63736C',blue='#185ABD',linked='#217346',amber='#FFF2CC';
const usd='$#,##0;($#,##0);$0', cents='$#,##0.00;($#,##0.00);$0.00', counts='#,##0;(#,##0);0';
const cols='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const cell=(s,a,v)=>s.getRange(a).values=[[v]];
const formula=(s,a,f)=>{s.getRange(a).formulas=[[f]];s.getRange(a).format.font.color=f.includes("'!")?linked:ink;};
const date=d=>new Date(d+'T12:00:00Z');
function base(s,last='L70'){
 s.showGridLines=false;s.getRange('A1:'+last).format.font={name:'Arial',size:10,color:ink};
 s.getRange('A1:'+last).format.rowHeight=24;s.getRange('A1:'+last).format.verticalAlignment='center';
 s.getRange('A1:A70').format.columnWidth=11;s.getRange('B1:B70').format.columnWidth=13;
 s.getRange('C1:C70').format.columnWidth=24;s.getRange('D1:L70').format.columnWidth=14;
 s.getRange('A2').format.font={size:16,bold:true,color:ink};
 s.freezePanes.freezeRows(9);s.freezePanes.freezeColumns(2);
}
function header(s,address,values){s.getRange(address).values=[values];s.getRange(address).format={fill:green,font:{name:'Arial',size:10,bold:true,color:'#FFFFFF'},rowHeight:38,wrapText:true,horizontalAlignment:'center',verticalAlignment:'center'};}
function note(s,row,text){cell(s,'A'+row,text);s.getRange('A'+row).format.font={color:muted,italic:true,size:10};}
for(const s of Object.values(sheets))base(s);
const budget=sheets.Budget,actual=sheets['Actual Results'],compare=sheets['Actual vs Budget'],variance=sheets['Variance Analysis'],decision=sheets['Decision Rules'],cash=sheets.Cash;
budget.tabColor=green;actual.tabColor='#E5D5B4';compare.tabColor=green;variance.tabColor=green;cash.tabColor='#91A99D';

// Budget preserves the published rounded cells and independent headline forecasts.
cell(budget,'A2','Endless Tales 6+2-week marketing budget');
cell(budget,'A3','November 6–December 31, 2026. Final CAC review January 1, 2027. Forecasts, not actuals.');
for(const [a,v]of Object.entries({A4:'Ad budget',C4:'Trial target',D4:270,E4:'Paid target',F4:135,G4:'CAC target',A5:'Ad views ~',B5:286000,C5:'Cost / trial',E5:'Trial-to-paid',G5:'Final review',H5:date(plan.finalReview)}))cell(budget,a,v);
formula(budget,'B4','=SUM(D10:D17)');formula(budget,'H4','=B4/F4');formula(budget,'D5','=B4/D4');formula(budget,'F5','=F4/D4');
budget.getRange('B4').setNumberFormat(usd);budget.getRange('H4').setNumberFormat(cents);budget.getRange('D5').setNumberFormat(cents);budget.getRange('B5').setNumberFormat(counts);budget.getRange('F5').setNumberFormat('0.0%');budget.getRange('H5').setNumberFormat('mm/dd/yy');
for(const a of ['C4','E4','G4','C5','E5','G5'])budget.getRange(a).format.horizontalAlignment='center';for(const a of ['D4','F4','B5'])budget.getRange(a).format.font.color=blue;
budget.getRange('A4:H5').format.rowHeight=30;budget.getRange('B4:H5').format.font.bold=true;
note(budget,7,'Blue numbers are plan inputs. Green numbers link to another tab. Black numbers are calculations.');
const weeklyHeader=['Week','Starts','Phase','Ad spend','Ad views','Signups','Trials','New paid subs','Cost / trial','CAC to date'];
header(budget,'A9:J9',weeklyHeader);
budget.getRange('A10:J17').values=plan.weeks.map((w,i)=>[w.week,date(w.start),w.phase,w.spend,weekly['Ad views'][i],weekly.Signups[i],weekly['Trial starts'][i],weekly['New paid subscribers'][i],weekly['Cost per trial'][i],weekly['Paid subscriber CAC'][i]]);
budget.getRange('B10:B17').setNumberFormat('mm/dd/yy');budget.getRange('D10:D17').setNumberFormat(usd);budget.getRange('E10:H17').setNumberFormat(counts);budget.getRange('I10:J17').setNumberFormat(cents);budget.getRange('D10:J17').format.font.color=blue;
cell(budget,'A19','6-week ad budget');formula(budget,'D19','=SUM(D10:D15)');cell(budget,'G19','8-week budget');formula(budget,'J19','=SUM(D10:D17)');budget.getRange('D19').setNumberFormat(usd);budget.getRange('J19').setNumberFormat(usd);budget.getRange('A19:J19').format.font.bold=true;
note(budget,21,'Source rounding: weekly paid cells add to 136; the source headline is 135. Both are preserved.');
note(budget,22,'Weekly views add to 285,714; the headline is approximately 286,000. Blank source cells are em dashes.');
note(budget,23,'Do not sum weekly CAC. Native unrounded workbook cells, monthly/annual mix and revenue were not supplied.');
note(budget,25,'Source: Published Meta Test Plan, final October 29 version identified by the owner.');
note(budget,26,plan.artifactUrl);
note(budget,27,'This grouped Admin workbook was built from the published artifact; it is not the original downloadable XLSX.');
note(budget,28,'The $400 conditional reserve is within the $4,000 plan, not extra spending. See Decision Rules.');

cell(actual,'A2','Actual results');cell(actual,'A3','Enter numbers in amber cells, add a source reference, then select Verified = Yes.');
note(actual,5,'Blank means unknown. Enter a numeric 0 for a verified zero. No live services or Admin records are updated.');
note(actual,6,'CAC to date requires every preceding week of spend and paid counts, source references and verification.');
header(actual,'A9:L9',[...weeklyHeader,'Source / receipt','Verified']);
actual.getRange('K1:K70').format.columnWidth=32;actual.getRange('L1:L70').format.columnWidth=13;
for(let i=0;i<8;i++){
 const r=i+10;for(const c of ['A','B','C'])formula(actual,c+r,`='Budget'!${c}${r}`);
 formula(actual,'I'+r,`=IF(AND(L${r}="Yes",K${r}<>"",ISNUMBER(D${r}),ISNUMBER(G${r}),G${r}>0),D${r}/G${r},"")`);
 formula(actual,'J'+r,`=IF(AND(COUNT($D$10:D${r})=${i+1},COUNT($H$10:H${r})=${i+1},COUNTIFS($L$10:L${r},"Yes")=${i+1},COUNTBLANK($K$10:K${r})=0,SUM($H$10:H${r})>0),SUM($D$10:D${r})/SUM($H$10:H${r}),"")`);
}
actual.getRange('D10:H17').format.fill=amber;actual.getRange('D10:H17').format.font.color=blue;actual.getRange('K10:L17').format.fill=amber;actual.getRange('K10:L17').format.font.color=blue;
actual.getRange('E10:H17').dataValidation={rule:{type:'whole',operator:'between',formula1:0,formula2:1000000000}};
actual.getRange('L10:L17').dataValidation={rule:{type:'list',values:['No','Yes']}};
actual.getRange('B10:B17').setNumberFormat('mm/dd/yy');actual.getRange('D10:D17').setNumberFormat(usd);actual.getRange('E10:H17').setNumberFormat(counts);actual.getRange('I10:J17').setNumberFormat(cents);
note(actual,20,'Downloads start with blank actuals. Save your edited copy in Excel; it does not synchronize back to Admin.');

cell(compare,'A2','Actual vs. budget');cell(compare,'A3','Matching weekly periods. Difference = Actual − Budget. Verified actuals are required.');
note(compare,5,'Published rounded budget cells are preserved. A missing target is not treated as zero.');
header(compare,'A9:I9',['Week','Starts','Metric','Unit','Budget','Actual','Difference','Variance %','Comparison status']);
compare.getRange('C1:C70').format.columnWidth=26;compare.getRange('I1:I70').format.columnWidth=27;
const metrics=[['Ad spend','USD','D'],['Ad views','Count','E'],['Signups','Count','F'],['Trials','Count','G'],['New paid subs','Count','H'],['Cost / trial','USD / trial','I'],['CAC to date','USD / paid','J']];
for(let i=0;i<8;i++)for(let k=0;k<metrics.length;k++){
 const r=10+i*metrics.length+k,ar=10+i,[label,unit,c]=metrics[k];
 formula(compare,'A'+r,`='Budget'!A${ar}`);formula(compare,'B'+r,`='Budget'!B${ar}`);cell(compare,'C'+r,label);cell(compare,'D'+r,unit);
 formula(compare,'E'+r,`=IF(ISNUMBER('Budget'!${c}${ar}),'Budget'!${c}${ar},"")`);
 formula(compare,'F'+r,`=IF(AND('Actual Results'!$L${ar}="Yes",'Actual Results'!$K${ar}<>"",ISNUMBER('Actual Results'!${c}${ar})),'Actual Results'!${c}${ar},"")`);
 formula(compare,'G'+r,`=IF(AND(ISNUMBER(E${r}),ISNUMBER(F${r})),F${r}-E${r},"")`);
 formula(compare,'H'+r,`=IF(AND(ISNUMBER(G${r}),ISNUMBER(E${r}),E${r}<>0),G${r}/ABS(E${r}),"")`);
 formula(compare,'I'+r,`=IF(NOT(ISNUMBER(F${r})),"Awaiting verified actuals",IF(NOT(ISNUMBER(E${r})),"No source budget target","Matched"))`);
 compare.getRange(`E${r}:G${r}`).setNumberFormat(unit==='Count'?counts:(c==='I'||c==='J'?cents:usd));
}
compare.getRange('A10:I65').format.font.color=ink;compare.getRange('B10:B65').setNumberFormat('mm/dd/yy');compare.getRange('H10:H65').setNumberFormat('0.0%;(0.0%);0.0%');
note(compare,68,'Percent variance is unavailable when the budget is zero. Comparisons do not authorize spend or decide ad actions.');

cell(variance,'A2','Variance analysis');cell(variance,'A3','Explain the matched differences and record the corrective action, owner and next review.');
note(variance,5,'Positive expense or cost variance is over budget. Positive result variance is above target.');
header(variance,'A9:L9',['Week','Starts','Metric','Difference','Variance %','Budget','Actual','Status','Cause / explanation','Corrective action','Owner','Next review']);
variance.getRange('C1:C70').format.columnWidth=25;variance.getRange('H1:H70').format.columnWidth=26;variance.getRange('I1:J70').format.columnWidth=35;variance.getRange('K1:K70').format.columnWidth=17;
for(let r=10;r<=65;r++){
 for(const [to,from]of Object.entries({A:'A',B:'B',C:'C',D:'G',E:'H',F:'E',G:'F',H:'I'}))formula(variance,to+r,`=IF('Actual vs Budget'!${from}${r}="","",'Actual vs Budget'!${from}${r})`);
 const unit=metrics[(r-10)%7][1];variance.getRange(`D${r}`).setNumberFormat(unit==='Count'?counts:cents);variance.getRange(`F${r}:G${r}`).setNumberFormat(unit==='Count'?counts:cents);
}
variance.getRange('A10:H65').format.font.color=ink;variance.getRange('B10:B65').setNumberFormat('mm/dd/yy');variance.getRange('E10:E65').setNumberFormat('0.0%;(0.0%);0.0%');variance.getRange('L10:L65').setNumberFormat('mm/dd/yy');
variance.getRange('I10:L65').format.fill=amber;variance.getRange('I10:L65').format.font.color=blue;
variance.getRange('I10:J65').format.wrapText=true;variance.getRange('A10:L65').format.rowHeight=34;

cell(decision,'A2','Strategos decision rules');cell(decision,'A3','Set October 29. Source status: awaiting owner approval. Reference rules only.');
decision.getRange('A1:A45').format.columnWidth=37;decision.getRange('B1:C45').format.columnWidth=22;decision.getRange('D1:D45').format.columnWidth=39;
header(decision,'A9:D9',['Measure','Scale','Stop / revise','Judged after']);decision.getRange('A10:D15').values=rules;
decision.getRange('A10:D15').format.wrapText=true;decision.getRange('A10:D15').format.rowHeight=44;
cell(decision,'A18','Standing rules');decision.getRange('A18').format.font.bold=true;
let nr=20;for(const text of standing){const words=text.split(' ');let line='';for(const word of words){if((line+' '+word).length>125){note(decision,nr++,line);line=word;}else line=line?line+' '+word:word;}if(line)note(decision,nr++,line);nr++;}
note(decision,nr+1,'Final CAC review: January 1, 2027. January spend stays $0 until the review.');
note(decision,nr+2,'The reserve is not an additional $400. These rules and trial emails are not activated by this workbook.');

cell(cash,'A2','Campaign cash tracking');cell(cash,'A3','Plan funding is separate from verified deposits and actual Meta card charges. USD.');
cell(cash,'A4','Planned funding');formula(cash,'B4',"='Budget'!B4");cash.getRange('B4').setNumberFormat(usd);
cell(cash,'A5','Opening cash');cash.getRange('B5').format.fill=amber;cash.getRange('B5').format.font.color=blue;cash.getRange('B5').setNumberFormat(usd);
note(cash,7,'Enter verified opening cash, deposits, card charges, other cash outflows and source references.');
header(cash,'A9:K9',['Week','Starts','Ad budget','Opening cash','Deposits','Meta charges','Other cash out','Closing cash','Ad budget left','Source / receipt','Verified']);
cash.getRange('J1:J70').format.columnWidth=30;
for(let i=0;i<8;i++){
 const r=i+10;formula(cash,'A'+r,`='Budget'!A${r}`);formula(cash,'B'+r,`='Budget'!B${r}`);formula(cash,'C'+r,`='Budget'!D${r}`);
 formula(cash,'D'+r,i===0?'=IF(ISNUMBER($B$5),$B$5,"")':`=IF(ISNUMBER(H${r-1}),H${r-1},"")`);
 formula(cash,'H'+r,`=IF(AND(K${r}="Yes",J${r}<>"",COUNT(D${r}:G${r})=4),D${r}+E${r}-F${r}-G${r},"")`);
 formula(cash,'I'+r,`=IF(AND(COUNT($F$10:F${r})=${i+1},COUNTIFS($K$10:K${r},"Yes")=${i+1},COUNTBLANK($J$10:J${r})=0),'Budget'!$B$4-SUM($F$10:F${r}),"")`);
}
cash.getRange('B10:B17').setNumberFormat('mm/dd/yy');cash.getRange('C10:I17').setNumberFormat(usd);cash.getRange('E10:G17').format.fill=amber;cash.getRange('E10:G17').format.font.color=blue;cash.getRange('J10:K17').format.fill=amber;cash.getRange('J10:K17').format.font.color=blue;cash.getRange('K10:K17').dataValidation={rule:{type:'list',values:['No','Yes']}};
cash.getRange('I10:I17').conditionalFormats.add('cellIs',{operator:'lessThan',formula:0,format:{fill:'#FDE8E7',font:{color:'#A12622',bold:true}}});
note(cash,20,'Planned funding is not a verified Mercury deposit. No banking transaction or ad action is executed.');
note(cash,21,'Ad budget left deducts only verified Meta card charges; closing cash also includes other cash outflows.');

// Test useful recalculation, then remove all temporary actuals before export.
workbook.recalculate();
const val=(s,a)=>s.getRange(a).values[0][0];
assert.equal(val(budget,'B4'),4000);assert.equal(val(budget,'F4'),135);assert.ok(Math.abs(val(budget,'H4')-4000/135)<1e-8);
assert.equal(val(compare,'G10'),'');assert.equal(val(actual,'J10'),'');
actual.getRange('D10:H10').values=[[500,35714,54,20,0]];cell(actual,'K10','QA fixture, not sent');cell(actual,'L10','Yes');
workbook.recalculate();assert.equal(val(actual,'I10'),25);assert.equal(val(actual,'J10'),'');assert.equal(val(compare,'G10'),0);assert.ok(Math.abs(val(compare,'G15')-10.19)<1e-8);assert.ok(Math.abs(val(variance,'D15')-10.19)<1e-8);
cell(actual,'L10','No');workbook.recalculate();assert.equal(val(compare,'G10'),'');
cell(actual,'L10','Yes');cell(actual,'D10',0);cell(actual,'G10',0);workbook.recalculate();assert.equal(val(actual,'I10'),'');assert.equal(val(compare,'G10'),-500);
cell(cash,'B5',0);cash.getRange('E10:G10').values=[[4000,500,0]];cell(cash,'J10','QA fixture');cell(cash,'K10','Yes');
cash.getRange('E11:G11').values=[[0,500,0]];cell(cash,'J11','QA fixture');cell(cash,'K11','Yes');
workbook.recalculate();assert.equal(val(cash,'H10'),3500);assert.equal(val(cash,'H11'),3000);assert.equal(val(cash,'I11'),3000);
actual.getRange('D10:H17').clear({applyTo:'contents'});actual.getRange('K10:L17').clear({applyTo:'contents'});cash.getRange('B5').clear({applyTo:'contents'});cash.getRange('E10:G17').clear({applyTo:'contents'});cash.getRange('J10:K17').clear({applyTo:'contents'});
workbook.recalculate();assert.equal(val(compare,'G10'),'');assert.equal(val(cash,'H10'),'');
const errors=await workbook.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!',options:{useRegex:true,maxResults:30},maxChars:3000});
await fs.writeFile(qaDir+'/formula-errors.json',errors.ndjson);
console.log('Formula scan:',errors.ndjson);
for(const name of (process.env.QA_RENDER?process.env.QA_RENDER.split(','):names)){const end=name==='Actual Results'?'L20':name==='Cash'?'K20':name==='Variance Analysis'?'L18':name==='Decision Rules'?'D16':name==='Actual vs Budget'?'I18':'J20';const image=await workbook.render({sheetName:name,range:'A1:'+end,scale:1.5,format:'png'});await fs.writeFile(qaDir+'/'+name.replaceAll(' ','-')+'.png',new Uint8Array(await image.arrayBuffer()));}
if(!process.env.QA_RENDER){const image=await workbook.render({sheetName:'Decision Rules',range:'A18:D41',scale:1.5,format:'png'});await fs.writeFile(qaDir+'/Standing-rules.png',new Uint8Array(await image.arrayBuffer()));}
const xlsx=await SpreadsheetFile.exportXlsx(workbook);const file=outputDir+'/Endless-Tales-6-plus-2-Marketing-Workbook.xlsx';await xlsx.save(file);
await fs.writeFile(qaDir+'/verification.json',JSON.stringify({sheets:names,budget:val(budget,'B4'),trials:270,paid:135,cac:val(budget,'H4'),actualsBlank:true,recalculationTests:'passed',file},null,2));
console.log('Saved',file);
