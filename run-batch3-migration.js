// Run batch 3 voice card migrations: Sloane Prescott (Flynn) + Cord Dillard/Buck Callahan (McMurtry)
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('=== Batch 3 Voice Card Migrations ===\n');

  // ─── MIGRATION 1: Flynn / Domestic Noir ────────────────────────────────────

  console.log('1. Inserting voice profile: flynn-gillian-domestic-noir ...');
  const { data: vpFlynn, error: vpFlynnErr } = await supabase
    .from('voice_profiles')
    .upsert({
      id: '61cb65a2-0a3f-48c3-990e-a821c54ab9b6',
      style_slug: 'flynn-gillian-domestic-noir',
      display_name: 'Domestic Noir',
      version: 1,
      essence: "The protagonist is lying — to herself, to the reader, or to both — and the ordinary surfaces of domestic life contain the violence underneath; female rage is not the darkness but the engine, and the twist doesn't just surprise, it exposes something the reader was already complicit in.",
      diction_and_rhythm: "Sharp, acidic, often wryly funny — the darkness is never ponderous. Short punchy sentences punctuated by longer ones that build velocity. Wit that cuts: the humor arrives in the same sentence as the menace. First-person narration with the rhythm of a woman explaining herself to no one, which means she is explaining herself to everyone. The telling detail is never soft: a specific brand, a precise insult, a memory with sudden forensic clarity. Midwestern plainness spiked with venom. Adverbs die here; exact nouns and verbs carry the freight.",
      signature_techniques: [
        "The unreliable narrator reveal: build the narrator's account as internally coherent and oddly sympathetic before the seam opens. The reader should have genuinely chosen a side. The reframe doesn't just change facts — it retroactively exposes the reader's own assumptions, which is the real twist.",
        "The cool-girl monologue: give the protagonist a cultural critique that is both entirely correct and subtly self-implicating. The insight is real. The woman delivering it is dangerous. Both things coexist without the narrative resolving the tension. The reader applauds, then realizes what they just applauded.",
        "The dual diary / split-timeline structure: alternate between two time periods or two narrators, each account building its own coherence, so that when they collide the reader holds irreconcilable truths simultaneously. Neither version is entirely false. Neither is entirely honest. This structure is the moral argument.",
        "Domestic settings as crime scenes: catalog the ordinary details of suburban and small-town life — the brand-name products, the predictable social rituals, the carefully maintained surfaces — and let the violence live just underneath. The house is always also a crime scene. The neighborhood is already dangerous. The reader knew this before the story did.",
        "Female rage without apology: give the protagonist anger that is fully articulated and never softened into 'crazy' or 'hysterical.' The rage has a logic. The plot serves the logic. The reader is invited to follow the logic even when they shouldn't, and this invitation is the novel's provocation.",
        "The twist as moral argument: engineer the plot reversal not as a surprise for its own sake but as an exposure of something the reader was already believing — a gendered assumption, a class assumption, an assumption about who tells the truth in a marriage. The reader's betrayal is the point, not the mechanics of the reveal."
      ],
      tone_handling: "Menace beneath wit — the humor and the darkness coexist without one canceling the other; a line can be genuinely funny and genuinely threatening in the same breath. Female interiority is rendered precisely, without sentimentality, often with a cold accuracy that is itself a form of power. The unreliability is in the prose from the first page — not a trick applied at the end but a condition baked in, visible to anyone paying attention. Pacing alternates between controlled revelation and sudden acceleration; the suspense lives in the gap between what the narrator claims and what we begin to suspect. The ending does not heal and is not meant to: the reader is left holding something they cannot put down and cannot quite name.",
      banned_list: [
        'Resolution through confession or breakdown — the protagonist reveals herself fully only in the text the reader holds; in the story world, she does not break; breaking is the wrong genre',
        'Sympathetic victimhood — these protagonists are not suffering women to be pitied; their suffering has been converted into something else entirely and that conversion is the engine of the story',
        'Explained psychology — the wound is shown in its effects on behavior, not traced to a source; childhood trauma as explanatory flashback belongs to a gentler and less honest tradition',
        'Male savior figure — the answer comes from the protagonist; if a man arrives to solve things, the moral architecture of the story has failed',
        'Ponderous darkness — if the menace is portentous and the prose is heavy, the wit has been lost; the darkness is acid, not molasses; the humor is not relief from the threat, it is part of the threat',
        'The unreliability as late twist — unreliability is present from sentence one to anyone paying close attention; it is a condition of the narration, not a reversal applied at the end',
        "Sentimentality about marriage or family — institutions in this mode are always performances; the home is always also a crime scene; nostalgia for the domestic is the lie the protagonist was sold and spent the novel exposing",
        'Action-thriller pacing — the threat is interior and psychological; external chases and countdowns are the wrong genre; suspense lives in the accumulating gap between what the narrator says and what the reader suspects',
        "Female hysteria or breakdown as climax — the protagonist's anger and action should be controlled and purposeful; losing control is not the point; maintaining control while doing terrible things is",
        'Third-person omniscience that resolves ambiguity — the narrative voice must remain close to the unreliable consciousness; authorial distance that sorts truth from fiction cancels the whole enterprise'
      ],
      anchors: [
        "The morning of our anniversary I woke at 6 a.m. and started the coffee and thought about what I knew about Nick that he didn't know I knew. The list was not short. I kept it in my head, not written down, because written things can be found, and I am a careful woman. I have always been careful. I have a talent for seeming uncareful — the easy laugh, the slightly crooked smile, the way I pretend to forget things when forgetting is useful — and this talent has served me well, because people rarely watch the woman who seems not to be paying attention. I paid attention to everything. I made French toast. I set the table. I kissed my husband on his perfectly formed jaw and thought: I know something you don't know I know. The day was going to be interesting.",
        "I had not been back to Wind Gap in eight years and I had not been sober in Wind Gap in twelve, and the town had the particular smell of a place that knows exactly what you did there. I drove in on Route 9 past the Dairy Dream and the VFW and the single stoplight blinking yellow, which is how Wind Gap understood urgency. My mother's house was at the end of a long private road. It had fourteen rooms and my mother knew what had happened in most of them. I had fourteen scars on my left arm, each one its own small history, each one a thing I didn't want to say in words. In Wind Gap, everything that couldn't be spoken got written somewhere else. My mother chose wallpaper. I chose skin. We were not so different, really. I pulled into the driveway and sat there and thought about driving away. I thought about this for approximately four minutes and twenty seconds. Then I got my bag from the back seat and went inside."
      ]
    }, { onConflict: 'style_slug' });

  if (vpFlynnErr) {
    console.error('  ERROR inserting Flynn profile:', vpFlynnErr);
  } else {
    console.log('  ✓ Flynn profile inserted/confirmed');
  }

  console.log('  Updating Sloane Prescott stories...');
  const { data: upFlynn, error: upFlynnErr, count: flynnCount } = await supabase
    .from('stories')
    .update({ voice_profile_id: '61cb65a2-0a3f-48c3-990e-a821c54ab9b6' })
    .eq('author_id', 'cc373d09-6aba-422d-a3d1-540064e66d0e')
    .select('id', { count: 'exact' });
  if (upFlynnErr) console.error('  ERROR updating Sloane Prescott stories:', upFlynnErr);
  else console.log(`  ✓ Updated ${upFlynn?.length ?? '?'} Sloane Prescott stories\n`);

  // ─── MIGRATION 2: McMurtry / Melancholy Western ────────────────────────────

  console.log('2. Inserting voice profile: mcmurtry-melancholy-western ...');
  const { data: vpMc, error: vpMcErr } = await supabase
    .from('voice_profiles')
    .upsert({
      id: '79ac37e5-2c20-47c1-8096-186dcd76cd9a',
      style_slug: 'mcmurtry-melancholy-western',
      display_name: 'Melancholy Western',
      version: 1,
      essence: "The West is always already ending — the characters are the last of a type and they know it; the land is vast and absorbing and indifferent to human persistence; friendship between men is the one institution that doesn't lie, and it lasts until it doesn't, and that is the whole of the book.",
      diction_and_rhythm: "Plain, direct, deeply unhurried — the prose trusts the reader to find the emotion in the understatement. Long stretches of unadorned narration that move at the pace of a man on horseback through flat country. Short declaratives that drop with finality. The humor arrives from the gap between the myth's grandeur and the protagonist's immediate domestic reality: the cattle are thirsty, the cook is complaining, the great enterprise of the drive is this particular argument about beans. No elevated diction for the landscape, even when the landscape is extraordinary — the prose is too respectful of the real thing to pretty it up. Numbers and distances matter: miles ridden, days without water, the specific arithmetic of what it costs to do this.",
      signature_techniques: [
        "The elegy in motion: the journey or enterprise is already over while it happens; the characters are enacting a legend they know will be misremembered or forgotten; this awareness runs through even the funny scenes as a quiet, bone-dry sadness that never announces itself and never lifts.",
        "The incompatible friendship: place two men together whose fundamental values cannot be reconciled and have them ride a thousand miles anyway; the love is real and the disagreement is real and neither resolves; the reader holds both and this irresolution is the whole moral architecture of the novel.",
        "Violence as weather: death arrives without ceremony, without slowing the prose, without the elevation of a scene; the land absorbs the dead; the survivors note this and continue; the accumulation of matter-of-fact losses is more devastating than any single dramatized death could be.",
        "Women as moral center: give the women full interiority, practical wisdom, and a clearer read on the situation than the men performing their myths; they are not rewards or obstacles but the characters who most accurately see what is happening and what it will cost.",
        "The myth the protagonist knows is a lie: let the protagonist be fully aware that the West of legend doesn't exist and that they are nonetheless performing it; this double-consciousness is both funny (the gap between grandeur and reality) and sad (they are the last and they know it).",
        "The specific texture of landscape as philosophy: render the heat, the sky, the emptiness with plain precision rather than lyric inflation; the geography carries its philosophical weight about human smallness because the prose refuses to name it; the vastness argues without saying a word."
      ],
      tone_handling: "Bone-dry humor from the gap between the legend and the man: the hero of the West is arguing with his horse, or cannot find coffee, or has strong opinions about beans that are out of proportion to everything except the fact that beans are all there is. This humor does not undercut the elegy — it deepens it, because the man who can joke about dying is the man for whom dying is a real and ordinary possibility. Grief is handled in understatement: one sentence, then the prose moves on at the pace of a man who has seen a lot of country and knows the country doesn't grieve with him. The landscape does not mourn for the characters. This is the truest and most devastating thing the prose knows about it, and it does not say so.",
      banned_list: [
        "Triumphalism — the West in this mode does not triumph; it ends; the cattle arrive but the era is over; any ending that suggests the myth was vindicated has missed the point that the myth was always the lie the participants told themselves",
        "Sentimentality about the land — the landscape is not beautiful in a way that wants to be noticed; it simply is; lyric landscape description that draws attention to appreciation of the scenery is the wrong register and the wrong relationship to the real thing",
        "A theatrical villain whose evil drives the plot — trouble arrives from the land, from weather, from the gap between what men intend and what they are capable of; a melodramatic antagonist reduces the scale to the personal and loses the elegy",
        "Rapid resolution of the core friendship — the incompatibility between the two principals must not be resolved; it must survive until one of them doesn't; premature reconciliation cancels the novel's central tension",
        "Female characters as peripheral or decorative — the women must have interiority, history, and often a sharper read on the situation than the men performing their myths; they are not set dressing for the male enterprise",
        "Purple landscape writing — no sunsets that feel curated for the reader's pleasure, no lyric passages that stop the action to admire the scenery; the plain prose earns the landscape's weight precisely by not reaching for it",
        "Heroic death scenes — people die in a sentence or two; the ceremony happens in the reader's mind, not on the page; slowing the prose to honor the fallen moment is precisely what this mode refuses to do",
        "Explained mythology — the novel argues that the West is a performance through the texture of what happens, not through a character who delivers this observation; the character who explains the theme does not belong in this story",
        "Action-thriller pacing — the narrative moves at the pace of the country; urgency is domestic and operational, not cinematic; speed is a sign something has gone wrong, not that the story has found its register",
        "The return to civilization as redemption — the end of the drive is not a healing; it is simply the end of a thing; home, if it still exists, is another place where the myth has already run out of country to fill"
      ],
      anchors: [
        '"I expect you\'re wrong about that," Gus said, though he didn\'t immediately say what he was wrong about, since there was no need. Call was wrong about most things in the same particular way: he believed a man could stand a situation if he just refused to find it unreasonable. Gus had known Call for thirty-one years and had reached the opposite conclusion on most subjects, which had kept the conversation lively across a good deal of Texas. They were camped at the Nueces, which was low, and the horses were indifferent to the grass, and the beans had gone wrong again, and Call was looking at the Rio Grande like it owed him something. "We\'ll make it," Call said. "I don\'t doubt it," Gus said. "I just wonder what we\'ll have proved." Call didn\'t answer that. He rarely answered that kind of question, which was another thing they\'d been arguing about for thirty-one years.',
        'Dish was dead by the time they got the horses off him. It took most of the afternoon to dig the grave because the ground was hard and they only had two shovels. Bolivar said a few words, most of them in Spanish, which satisfied the ceremony as well as anything. Call marked the spot with a length of wood and they moved on before the light went. Nobody spoke much for the rest of the day. There was nothing much to say. They had all known Dish for long enough to know what kind of man he was, and the country out here didn\'t care one way or the other, which was one of the things about this country that you had to accept if you were going to travel it at all.'
      ]
    }, { onConflict: 'style_slug' });

  if (vpMcErr) {
    console.error('  ERROR inserting McMurtry profile:', vpMcErr);
  } else {
    console.log('  ✓ McMurtry profile inserted/confirmed');
  }

  console.log('  Updating Cord Dillard stories...');
  const { data: upCord, error: upCordErr } = await supabase
    .from('stories')
    .update({ voice_profile_id: '79ac37e5-2c20-47c1-8096-186dcd76cd9a' })
    .eq('author_id', '4c665ea7-e0f5-4656-9e7e-1a0dcd672ebd')
    .select('id');
  if (upCordErr) console.error('  ERROR updating Cord Dillard stories:', upCordErr);
  else console.log(`  ✓ Updated ${upCord?.length ?? '?'} Cord Dillard stories`);

  console.log('  Updating Buck Callahan stories...');
  const { data: upBuck, error: upBuckErr } = await supabase
    .from('stories')
    .update({ voice_profile_id: '79ac37e5-2c20-47c1-8096-186dcd76cd9a' })
    .eq('author_id', '4bbe211e-e51a-4cc3-995c-a28f4a85f2c4')
    .select('id');
  if (upBuckErr) console.error('  ERROR updating Buck Callahan stories:', upBuckErr);
  else console.log(`  ✓ Updated ${upBuck?.length ?? '?'} Buck Callahan stories\n`);

  // ─── Verify ────────────────────────────────────────────────────────────────
  console.log('=== Verification ===');
  const { data: profiles } = await supabase
    .from('voice_profiles')
    .select('id, style_slug, display_name')
    .in('style_slug', ['flynn-gillian-domestic-noir', 'mcmurtry-melancholy-western']);
  console.log('Profiles in DB:', JSON.stringify(profiles, null, 2));

  const { data: storyCheck } = await supabase
    .from('stories')
    .select('author, author_id, voice_profile_id')
    .in('author_id', [
      'cc373d09-6aba-422d-a3d1-540064e66d0e',
      '4c665ea7-e0f5-4656-9e7e-1a0dcd672ebd',
      '4bbe211e-e51a-4cc3-995c-a28f4a85f2c4'
    ])
    .limit(10);
  
  const counts = {};
  for (const row of storyCheck || []) {
    counts[row.author] = counts[row.author] || { total: 0, linked: 0 };
    counts[row.author].total++;
    if (row.voice_profile_id) counts[row.author].linked++;
  }
  console.log('Story link counts (sample):', counts);
}

main().catch(console.error);
