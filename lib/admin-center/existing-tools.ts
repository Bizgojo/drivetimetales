// Preserve existing tools inside the eight-section Admin, without another primary navigation.
export const EXISTING_TOOLS: Record<string,[string,string][]> = {
 overview:[['Analytics overview','/admin/analytics']],
 agents:[['Agent workspace','/admin/workspace'],['Agent operations','/admin/command-center'],['ElevenLabs usage','/admin/el-usage']],
 production:[['Authors & narrators','/admin/authors-narrators-v2'],['Genres','/admin/genres'],['Content Review & Approval','/admin/production/approval'],['Sound Effects Library','/admin/sfx-library'],['Story Ideas','/admin/story-ideas'],['ElevenLabs Usage','/admin/el-usage'],['ASC controls','/admin/asc']],
 stories:[['Published Stories · original page','/admin/stories'],['Landing page stories','/admin/landing-stories']],
 customers:[['Subscriptions','/admin/subscriptions']],
 marketing:[['Campaign Plan spreadsheet & timeline','/admin/marketing/campaign-plan'],['Marketing dashboards','/admin/marketing/dashboard'],['Growth tools','/admin/growth'],['Waitlist','/admin/waitlist'],['Funnel analytics','/admin/analytics/funnel'],['Signup analytics','/admin/analytics/signups'],['Trial-to-paid analytics','/admin/analytics/trial-paid'],['Existing social analytics','/admin/social-analytics']],
 finance:[['Budget placeholder','/admin/finance/budget'],['Finance overview','/admin/finance']],
 documentation:[['Existing workspace','/admin/workspace'],['System settings','/admin/settings']],
}
