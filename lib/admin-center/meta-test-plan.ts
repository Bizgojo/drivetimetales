// Owner-supplied transcription of the final October 29 workbook, not imported file bytes.
export const META_TEST_PLAN = {
 source:'Endless-Tales-Meta-Test-Plan(2).xlsx',
 saved:'2026-10-29 12:24 PM',
 provenance:'Owner-provided final-workbook transcription; workbook and Decision Rules not yet imported',
 weeks:[
  {week:1,start:'2026-11-06',phase:'Test 4 hooks',spend:500},
  {week:2,start:'2026-11-13',phase:'Test 4 hooks',spend:500},
  {week:3,start:'2026-11-20',phase:'Top 2 ads',spend:700},
  {week:4,start:'2026-11-27',phase:'Top 2 ads',spend:700},
  {week:5,start:'2026-12-04',phase:'Winner + reserve',spend:800},
  {week:6,start:'2026-12-11',phase:'Winner + reserve',spend:800},
  {week:7,start:'2026-12-18',phase:'Trials convert',spend:0},
  {week:8,start:'2026-12-25',phase:'Trials convert',spend:0},
 ],
 forecast:{trials:270,paid:135,cac:29.63},
} as const

export function metaTestBudget(label:string,column:number):number|null {
 if(label==='Meta advertising')return column<8?META_TEST_PLAN.weeks[column].spend:META_TEST_PLAN.weeks.slice(0,column===8?6:8).reduce((s,w)=>s+w.spend,0)
 // No weekly conversion timing was supplied. Only the week-eight period forecast is known.
 if(column===9){if(label==='Cost per trial')return Number((4000/META_TEST_PLAN.forecast.trials).toFixed(2));if(label==='Trial-to-paid conversion')return 100*META_TEST_PLAN.forecast.paid/META_TEST_PLAN.forecast.trials;if(label==='Trial starts')return META_TEST_PLAN.forecast.trials;if(label==='New paid subscribers')return META_TEST_PLAN.forecast.paid;if(label==='Paid subscriber CAC')return META_TEST_PLAN.forecast.cac}
 return null
}
