-- Voice Card: Melancholy Western
-- style_slug: mcmurtry-melancholy-western
-- Created: 2026-09-16 by Atlas (subagent, Marc's authorization 17:31 EDT)
-- Linked to: author_id 4c665ea7-e0f5-4656-9e7e-1a0dcd672ebd (Cord Dillard), 26 stories
--            author_id 4bbe211e-e51a-4cc3-995c-a28f4a85f2c4 (Buck Callahan), 5+ stories
-- voice_profile_id: 79ac37e5-2c20-47c1-8096-186dcd76cd9a
--
-- NOTE: McMurtry died March 2021; 'mcmurtry-melancholy-western' is a style tradition reference.
-- display_name 'Melancholy Western' is craft-based; no author name surfaces to users.
-- SPECIAL: ONE profile INSERT, TWO UPDATE statements — Cord Dillard AND Buck Callahan share this profile.

INSERT INTO voice_profiles (
  id,
  style_slug,
  display_name,
  version,
  essence,
  diction_and_rhythm,
  signature_techniques,
  tone_handling,
  banned_list,
  anchors
) VALUES (
  '79ac37e5-2c20-47c1-8096-186dcd76cd9a',
  'mcmurtry-melancholy-western',
  'Melancholy Western',
  1,
  'The West is always already ending — the characters are the last of a type and they know it; the land is vast and absorbing and indifferent to human persistence; friendship between men is the one institution that doesn''t lie, and it lasts until it doesn''t, and that is the whole of the book.',
  'Plain, direct, deeply unhurried — the prose trusts the reader to find the emotion in the understatement. Long stretches of unadorned narration that move at the pace of a man on horseback through flat country. Short declaratives that drop with finality. The humor arrives from the gap between the myth''s grandeur and the protagonist''s immediate domestic reality: the cattle are thirsty, the cook is complaining, the great enterprise of the drive is this particular argument about beans. No elevated diction for the landscape, even when the landscape is extraordinary — the prose is too respectful of the real thing to pretty it up. Numbers and distances matter: miles ridden, days without water, the specific arithmetic of what it costs to do this.',
  ARRAY[
    'The elegy in motion: the journey or enterprise is already over while it happens; the characters are enacting a legend they know will be misremembered or forgotten; this awareness runs through even the funny scenes as a quiet, bone-dry sadness that never announces itself and never lifts.',
    'The incompatible friendship: place two men together whose fundamental values cannot be reconciled and have them ride a thousand miles anyway; the love is real and the disagreement is real and neither resolves; the reader holds both and this irresolution is the whole moral architecture of the novel.',
    'Violence as weather: death arrives without ceremony, without slowing the prose, without the elevation of a scene; the land absorbs the dead; the survivors note this and continue; the accumulation of matter-of-fact losses is more devastating than any single dramatized death could be.',
    'Women as moral center: give the women full interiority, practical wisdom, and a clearer read on the situation than the men performing their myths; they are not rewards or obstacles but the characters who most accurately see what is happening and what it will cost.',
    'The myth the protagonist knows is a lie: let the protagonist be fully aware that the West of legend doesn''t exist and that they are nonetheless performing it; this double-consciousness is both funny (the gap between grandeur and reality) and sad (they are the last and they know it).',
    'The specific texture of landscape as philosophy: render the heat, the sky, the emptiness with plain precision rather than lyric inflation; the geography carries its philosophical weight about human smallness because the prose refuses to name it; the vastness argues without saying a word.'
  ],
  'Bone-dry humor from the gap between the legend and the man: the hero of the West is arguing with his horse, or cannot find coffee, or has strong opinions about beans that are out of proportion to everything except the fact that beans are all there is. This humor does not undercut the elegy — it deepens it, because the man who can joke about dying is the man for whom dying is a real and ordinary possibility. Grief is handled in understatement: one sentence, then the prose moves on at the pace of a man who has seen a lot of country and knows the country doesn''t grieve with him. The landscape does not mourn for the characters. This is the truest and most devastating thing the prose knows about it, and it does not say so.',
  ARRAY[
    'Triumphalism — the West in this mode does not triumph; it ends; the cattle arrive but the era is over; any ending that suggests the myth was vindicated has missed the point that the myth was always the lie the participants told themselves',
    'Sentimentality about the land — the landscape is not beautiful in a way that wants to be noticed; it simply is; lyric landscape description that draws attention to appreciation of the scenery is the wrong register and the wrong relationship to the real thing',
    'A theatrical villain whose evil drives the plot — trouble arrives from the land, from weather, from the gap between what men intend and what they are capable of; a melodramatic antagonist reduces the scale to the personal and loses the elegy',
    'Rapid resolution of the core friendship — the incompatibility between the two principals must not be resolved; it must survive until one of them doesn''t; premature reconciliation cancels the novel''s central tension',
    'Female characters as peripheral or decorative — the women must have interiority, history, and often a sharper read on the situation than the men performing their myths; they are not set dressing for the male enterprise',
    'Purple landscape writing — no sunsets that feel curated for the reader''s pleasure, no lyric passages that stop the action to admire the scenery; the plain prose earns the landscape''s weight precisely by not reaching for it',
    'Heroic death scenes — people die in a sentence or two; the ceremony happens in the reader''s mind, not on the page; slowing the prose to honor the fallen moment is precisely what this mode refuses to do',
    'Explained mythology — the novel argues that the West is a performance through the texture of what happens, not through a character who delivers this observation; the character who explains the theme does not belong in this story',
    'Action-thriller pacing — the narrative moves at the pace of the country; urgency is domestic and operational, not cinematic; speed is a sign something has gone wrong, not that the story has found its register',
    'The return to civilization as redemption — the end of the drive is not a healing; it is simply the end of a thing; home, if it still exists, is another place where the myth has already run out of country to fill'
  ],
  ARRAY[
    '"I expect you''re wrong about that," Gus said, though he didn''t immediately say what he was wrong about, since there was no need. Call was wrong about most things in the same particular way: he believed a man could stand a situation if he just refused to find it unreasonable. Gus had known Call for thirty-one years and had reached the opposite conclusion on most subjects, which had kept the conversation lively across a good deal of Texas. They were camped at the Nueces, which was low, and the horses were indifferent to the grass, and the beans had gone wrong again, and Call was looking at the Rio Grande like it owed him something. "We''ll make it," Call said. "I don''t doubt it," Gus said. "I just wonder what we''ll have proved." Call didn''t answer that. He rarely answered that kind of question, which was another thing they''d been arguing about for thirty-one years.',
    'Dish was dead by the time they got the horses off him. It took most of the afternoon to dig the grave because the ground was hard and they only had two shovels. Bolivar said a few words, most of them in Spanish, which satisfied the ceremony as well as anything. Call marked the spot with a length of wood and they moved on before the light went. Nobody spoke much for the rest of the day. There was nothing much to say. They had all known Dish for long enough to know what kind of man he was, and the country out here didn''t care one way or the other, which was one of the things about this country that you had to accept if you were going to travel it at all.'
  ]
) ON CONFLICT (style_slug) DO NOTHING;

-- Link all Cord Dillard stories (author_id: 4c665ea7-e0f5-4656-9e7e-1a0dcd672ebd)
UPDATE stories
SET voice_profile_id = '79ac37e5-2c20-47c1-8096-186dcd76cd9a'
WHERE author_id = '4c665ea7-e0f5-4656-9e7e-1a0dcd672ebd';

-- Link all Buck Callahan stories (author_id: 4bbe211e-e51a-4cc3-995c-a28f4a85f2c4)
-- Also covers Buck Callahan rows where author_id is set
UPDATE stories
SET voice_profile_id = '79ac37e5-2c20-47c1-8096-186dcd76cd9a'
WHERE author_id = '4bbe211e-e51a-4cc3-995c-a28f4a85f2c4';
