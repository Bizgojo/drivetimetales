// Visible published source supplied by the owner; native XLSX bytes were not available.
export const META_TEST_PLAN = {
 source:'Endless-Tales-Meta-Test-Plan(2).xlsx',
 artifactUrl:'https://claude.ai/artifact/GgPuEUCcaDWSeun2uivPeJ',
 finalReview:'2027-01-01',
 saved:'2026-10-29 12:24 PM',
 provenance:'Published Meta Test Plan artifact read directly; workbook download disabled in shared view',
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
 forecast:{trials:270,paid:135,cac:29.63,costPerTrial:14.81,adViews:286000},
} as const

// These are the DISPLAYED source cells, including rounding and em dashes.
export const META_WEEKLY_FORECAST:Record<string,readonly (number|null)[]>={
 'Ad views':[35714,35714,50000,50000,57143,57143,null,null],
 'Signups':[54,54,75,75,86,86,null,null],
 'Trial starts':[34,34,47,47,54,54,null,null],
 'New paid subscribers':[null,null,17,17,24,24,27,27],
 'Cost per trial':[14.81,14.81,14.81,14.81,14.81,14.81,null,null],
 'Paid subscriber CAC':[null,null,100.74,71.11,55.77,49.38,37.04,29.63],
}
export const META_DECISION_RULES=[
 ['Cost per page load · per ad','$1.17 or better','Worse than $1.75','$75 spent on that ad'],
 ['Cost per signup · per ad','$9.33 or better','Worse than $15.00','$75–150 spent on that ad'],
 ['Cost per trial · pause for revision','$15.00 or better','Worse than $22.50','$600 total spend'],
 ['Cost per trial · hard kill','$15.00 or better','Worse than $25.00','$600 total spend'],
 ['Trial-to-paid rate','50% or better','Worse than 35%','30 trials aged 14 days'],
 ['Blended CAC · hard kill','$30.00 or better','Worse than $45.00','Any time it is measurable'],
] as const
export const META_STANDING_RULES=[
 'No ad changes in its first 3 days unless it breaks a stop rule — Meta needs time to learn.',
 'Pause is always allowed without approval. Resuming or launching needs an approved, unchanged version.',
 "Weekly spend never goes over the Weekly Plan amount without Marc's approval.",
 'Trial-to-paid under 35% means fix onboarding, not ads — even a $15 trial then costs about $43 per subscriber.',
 '$400 reserve moves to the winner only after $600 spent, 10+ trials per ad set aged 14 days, cost per trial $15 or less AND early paid rate 40% or more. Otherwise hold it.',
 "During the trial send: hour 1 ‘next episode ready’ link; day 1 next episode + short framing; day 10 ‘episode 3 unlocked’ + billing reminder 4 days before the charge.",
] as const

export function metaTestBudget(label:string,column:number):number|null {
 if(label==='Meta advertising')return column<8?META_TEST_PLAN.weeks[column].spend:META_TEST_PLAN.weeks.slice(0,column===8?6:8).reduce((s,w)=>s+w.spend,0)
 if(column<8&&META_WEEKLY_FORECAST[label])return META_WEEKLY_FORECAST[label][column]
 if(column===8&&label==='Paid subscriber CAC')return META_WEEKLY_FORECAST[label][5]
 if(column===8&&label==='Cost per trial')return META_TEST_PLAN.forecast.costPerTrial
 if(label==='Trial starts'&&column===8)return META_WEEKLY_FORECAST[label].slice(0,6).reduce<number>((n,v)=>n+(v??0),0)
 // Preserve the source headline totals rather than summing independently rounded weekly cells.
 if(column===9){if(label==='Ad views')return META_TEST_PLAN.forecast.adViews;if(label==='Cost per trial')return Number((4000/META_TEST_PLAN.forecast.trials).toFixed(2));if(label==='Trial-to-paid conversion')return 100*META_TEST_PLAN.forecast.paid/META_TEST_PLAN.forecast.trials;if(label==='Trial starts')return META_TEST_PLAN.forecast.trials;if(label==='New paid subscribers')return META_TEST_PLAN.forecast.paid;if(label==='Paid subscriber CAC')return META_TEST_PLAN.forecast.cac}
 return null
}
