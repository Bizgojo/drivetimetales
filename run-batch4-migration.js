/**
 * Batch 4 Voice Card Migration Runner
 * Profiles: Daniel Wren (russo-domestic-heartwarming), Maeve Kelly (wodehouse-comic-warmth), Gus Pendry (cameron-animal-heartwarming)
 * Created: 2026-09-16 by Atlas (subagent, Marc's authorization 17:31 EDT)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const profiles = [
  // ─── PROFILE 1: Daniel Wren / russo-domestic-heartwarming ───────────────────
  {
    id: 'a285a64f-4738-4045-a7cb-4de9d6e8e6b7',
    style_slug: 'russo-domestic-heartwarming',
    display_name: 'Domestic Heartwarming',
    version: 1,
    essence: "Good people in economically constrained situations making the best choices they can with imperfect information. The warmth is earned, not assumed — it arrives from seeing the characters fully, including their limitations, and loving them anyway. The small town is a moral landscape: its history is the story's backstory, its decline is the story's condition, and its persistence is the story's quiet argument about human endurance.",
    diction_and_rhythm: "Relaxed, expansive prose that trusts the reader's patience. Long sentences that spiral outward through digression and circle back to land somewhere the reader did not expect, followed by short declarative stops that close the thought. The rhythm is unhurried — the world Wren describes accumulated slowly, and the prose takes its time. Dialogue is oblique: characters talk around the thing they mean, and what is not said matters as much as what is. Humor is pervasive and character-based — affectionate rather than ironic, arising from knowing someone so well that their inevitable mistake is both funny and tender.",
    signature_techniques: [
      "Root every scene in the specific texture of the community's economic history: which businesses closed, which ones stubbornly persist, what the buildings were and what they are now. The decline is not backdrop — it is the moral condition the characters are living inside, and the reader should feel it through concrete particulars rather than summary.",
      "Let protagonists be good people inside constraining situations making imperfect choices — never punish them for being limited. The reader's warmth for them is earned by seeing their constraints clearly: how much room they have, and what they are doing with it. The character who fails is not weak; the character who persists is not heroic. They are human.",
      "Use the small-town social grid as a living backstory engine: everyone knows everyone, and old debts, old kindnesses, and old grudges arrive in scenes without exposition because they are simply the air the characters breathe. A name mentioned in passing carries thirty years of history. The reader should feel the accumulated weight of a community without being lectured about it.",
      "Return to the father-son dynamic as a form of character revelation: what was inherited — stubbornness, debt, a particular way of holding yourself against bad news, the specific blindness that keeps certain men from saying the thing they mean — matters as much as what the character chooses to do today. The inheritance is not destiny; it is the weather.",
      "Let humor arrive through character understanding, not character mockery. The comedy comes from knowing someone so thoroughly that their predictable mistake is both funny and tender — the reader laughs because they recognize the person, not because the person has been made foolish. Affection is the source of the joke, not condescension.",
      "End imperfectly and humanly: things get somewhat better; nobody is saved; the town goes on. The resolution acknowledges constraint without surrendering to despair. The small victory — a conversation that finally happens, a debt acknowledged, a relationship that shifts two degrees toward honesty — is the only kind available, and it is sufficient."
    ],
    tone_handling: "Warmth without sentimentality: the love for the characters is visible in every sentence, but they are not protected from consequences. The emotion is earned by seeing the full person, including the failures and limitations, and choosing to remain present with them anyway. Humor is pervasive, character-based, and deeply affectionate — the comedy arises from understanding, not from ironic distance. Violence is rare and lands with shock precisely because the world is otherwise so ordinary — when it arrives, it means something has broken that cannot be fixed. Resolution is imperfect and human: the small victory is real, and the reader should feel its weight without being asked to believe it resolved everything.",
    banned_list: [
      "Sentimentality that bypasses the work — the emotion must be earned by seeing the constraint clearly; if the reader hasn't felt the weight of what the character is carrying, the warmth rings false",
      "Poverty aestheticized — the working-class setting is moral landscape, not local color; the economic decline is a condition the characters are living inside, not a picturesque backdrop for their drama",
      "The outside rescue — characters are saved by their own partial, imperfect agency or not at all; the solution that arrives from elsewhere is a cheat against the premise",
      "Ironic distance from the characters — Wren loves them, and so must the prose; the moment the narrative signals superiority to its own people, the whole project collapses",
      "The big thematic speech — the theme lives in the specific concrete situation, not in a character's articulation of it; let the scene carry the meaning",
      "Sudden epiphany that changes everything — characters may have small recognitions, but transformation is slow, partial, and often incomplete; the world doesn't reorganize itself around a moment of clarity",
      "suddenly",
      "little did he know",
      "as if reading his/her mind",
      "a wave of [emotion] washed over"
    ],
    anchors: [
      "Miles had been working the lunch rush at the Empire Grill for eleven years, which was nine years longer than he'd planned and two years longer than his ex-wife had predicted. The place hadn't changed much. The counter stools were the same ones he'd sat on as a kid, reupholstered twice but still listing slightly to the left. The fryer needed a new element. His daughter Tick would be starting high school in the fall, which meant she'd be old enough to be embarrassed by him in a new and more specific way. He refilled the coffee without being asked. He had done this so many times that the gesture had become a kind of thinking — his hands going through the motions while his mind worked on something it couldn't quite reach. The lunch crowd ate their cheeseburgers and didn't notice. That was fine. He was used to not being noticed. He was beginning to think it might be one of his better qualities.",
      "His father had owed money to half the town for forty years, and the other half had stopped asking. When he died there was nothing to inherit but the truck — a 1987 Ford with a cracked block — and a reputation for being good company in a bar. Miles had spent fifteen years not being his father, which had turned out to require a surprising amount of effort and had left him, at forty-two, in roughly the same position: broke, well-liked, and more or less stuck. He didn't hold it against the old man. You got handed a certain kind of life and you lived it as well as you could. The trick, he'd come to think, was to be honest about what you'd been handed. Most people weren't. His father had been, which was something. It wasn't enough, but it was something."
    ],
    author_id: '8aa248f1-5457-4f4e-98b0-e287ce6148fa',
    author_name: 'Daniel Wren'
  },

  // ─── PROFILE 2: Maeve Kelly / wodehouse-comic-warmth ────────────────────────
  {
    id: '7ae1864c-fb13-4124-bc98-3c1145517f36',
    style_slug: 'wodehouse-comic-warmth',
    display_name: 'Comic Warmth',
    version: 1,
    essence: "The world is a machine for generating escalating complications, and the narrator is your co-conspirator in watching it run. The stakes are real to the characters and comic to the reader; both things are maintained simultaneously and without apology. Nobody actually suffers permanently; things will be all right; and in the meantime, the situation is perfectly impossible.",
    diction_and_rhythm: "Sentences are a form of music — each one is constructed, not transcribed, and the rhythm anticipates the next clause. The simile is the primary instrument: the comparison commits fully to something entirely outlandish, follows it all the way to its conclusion, and arrives somewhere both completely wrong and exactly right. Paragraph pace is brisk; nobody lingers when the complications are accelerating. Dialogue reveals character through what people say when they believe they are concealing something; the gap between what is said and what is meant is where the comedy lives. The narrator's voice is warm, self-deprecating, and enthusiastically incompetent — the reader is the narrator's friend and co-conspirator, not their judge.",
    signature_techniques: [
      "Build the comic machine in visible layers: establish the misunderstanding, then introduce a character who doesn't know about it, then add one who knows a wrong version, then arrange for all three to encounter each other. The resolution must undo all the layers in a single elegant move — Jeeves speaks six words and the engine reverses. The reader should be able to see the machine's architecture even as it runs.",
      "Give every antagonist — the fearsome aunt, the immovable fiancée, the scandalized uncle — a completely comprehensible position that the protagonist has entirely failed to address. The conflict is not misunderstanding; it is avoidance. The aunt is not wrong. She is simply not someone the narrator has found a way to deal with.",
      "Use the narrator's cheerful incompetence as a source of warmth, not condescension. The narrator narrates their own failures with genuine enthusiasm — they are not ashamed, they are baffled; they are not defeated, they are improvising; they are not stupid, they are operating with insufficient information and a surplus of confidence. The reader loves them for it.",
      "Write similes that commit to the absurd comparison and follow it all the way home. Not a gesture toward an image but a complete journey: the aunt resembles a certain type of battleship; the fiancée's expression suggests a woman who has just discovered something unpleasant in the cucumber sandwiches; the young man's optimism is of the kind usually associated with people who have not yet met the relevant aunt. The simile is never decorative — it is the sentence's point.",
      "Let the competent resolver (Jeeves, the clever friend, the unexpected ally) speak in understatement and indirection. The solution is delivered as a casual observation, the genius entirely submerged beneath the surface calm. The contrast between the crisis as the narrator experiences it and the crisis as the resolver addresses it is where the comedy and the affection both live.",
      "Honor the genre contract: consequences are real within the story, but the world resets; nobody actually suffers permanently; things will be all right. Write this without apology. The permanent summer afternoon is not a lie about the world — it is the world the reader has come to inhabit for the duration of the story, and abandoning it in the final pages would be a betrayal of the contract established on page one."
    ],
    tone_handling: "Affection for every character, including the villains — Aunt Agatha is terrifying and beloved; the reader fears her alongside the narrator and admires her ferocity. Nobody is mocked; everyone is understood. The comedy is never at the expense of the characters' dignity; it arises from the situation, not from contempt for the people in it. The stakes are real to the characters (a broken engagement, a stolen cow-creamer, an aunt's wrath) and comic to the reader; Wodehouse maintains both simultaneously — the reader is moved by the characters' sincerity and delighted by the structure's absurdity. Resolution is always warm, always elegant, and always arrives from the direction least expected.",
    banned_list: [
      "Real suffering that doesn't resolve — the genre contract promises recovery; nobody in this world is destroyed by events; the darkest moment is the setup for the most satisfying reversal",
      "Irony at the characters' expense — the narrator is a fool but we love them; the prose never signals superiority to its own people; condescension would sour every sentence",
      "Realistic stakes — the cow-creamer is important because it is important to Aunt Dahlia; that is sufficient; no grounding in real-world consequence is required or desired",
      "Cynicism — nobody in this world is corrupt for profit; they are merely difficult, or principled in the wrong direction, or in possession of an aunt",
      "Anachronism — the language is Edwardian-to-interwar summer and must stay there; modern slang or contemporary reference breaks the permanent afternoon",
      "Unearned similes — the comparison must commit fully and arrive somewhere specific; a simile that gestures vaguely at an image without completing the journey is worse than no simile at all",
      "suddenly",
      "little did he know",
      "melodrama",
      "dark resolution"
    ],
    anchors: [
      "I have seldom encountered a situation that could not be made worse by an aunt, and Aunt Agatha was the kind of aunt who made one revise that maxim upward. She regarded me across the breakfast table with the expression of a woman who has found something she was not looking for in a drawer and has decided that the finder is responsible for its being there. I gave her what I hoped was a look of innocent puzzlement. She gave me back a look that suggested she knew exactly what I had been up to and was simply deciding in what order to address the indictments. I had the strong impression that there were several counts and that they were numbered.",
      "Jeeves appeared in the doorway with the aspect of a man for whom the situation presented no particular difficulty, which I knew from experience to mean that he had already solved it and was waiting for me to stop flailing long enough to receive the solution.\n\"If I might suggest, sir,\" he said, in the tone of a man making a perfectly obvious observation about the weather.\n\"Suggest away, Jeeves. Suggest until Tuesday.\"\n\"It occurred to me that Miss Bassett's primary concern is not the bracelet itself but rather her conviction that you were attempting to give it to Miss Stoker. Were that conviction to be corrected — perhaps by Miss Stoker herself, in the presence of Mr Glossop — the larger difficulty might resolve itself.\"\nI stared at him. \"Jeeves, that's absolutely —\"\n\"Thank you, sir.\"\n\"— brilliant.\"\n\"You are too kind, sir.\""
    ],
    author_id: '5c1104df-6333-4e32-b7c4-df466abd197d',
    author_name: 'Maeve Kelly'
  },

  // ─── PROFILE 3: Gus Pendry / cameron-animal-heartwarming ────────────────────
  {
    id: '4850e0aa-79dc-4806-a150-c74047216de6',
    style_slug: 'cameron-animal-heartwarming',
    display_name: 'Animal Heartwarming',
    version: 1,
    essence: "A dog's love is not complicated by self-consciousness. The loyalty is real, the purpose is real, and the reader is moved because the emotion is taken seriously rather than ironized. The animal narrator perceives what the humans cannot say to each other — the real emotional situation running underneath the surface dialogue — and the story's moral clarity comes from that perspective's honesty about what love actually looks like when it is unclouded.",
    diction_and_rhythm: "The dog's voice is present-moment, sensory, emotionally direct. Sentences follow perception rather than reflection: what the dog smells, hears, sees, and feels — immediately, without retrospective commentary. The voice is not simple; it is unclouded. Paragraphs are short and kinetic; the dog does not linger, it responds. Humor arises from the gap between what the dog understands and what the human intends — the dog's interpretation is wrong in the literal facts and right in the emotional truth. Death is handled as transition rather than ending: the prose does not melodramatize departure but moves through it with the same present-moment directness that characterizes the whole narrative.",
    signature_techniques: [
      "Anchor every scene in canine perception, in order: smell first (the richest channel; the dog knows things from smell that humans would not know until later), then sound, then sight. The dog often perceives the emotional state of a scene before the humans in it are aware of it themselves. The reader should feel what the dog smells before understanding why it matters.",
      "Use the dog's misunderstanding of human behavior as a source of gentle, never condescending humor. The dog's interpretation is wrong in the literal sense and right in the emotional one — the human is not playing a game with the car keys, but there is something true in what the dog notices about how the human is acting. The gap is the comedy; the emotional accuracy is what the reader carries away.",
      "Let the dog perceive what the humans cannot say to each other: the dog narrates the real emotional situation running underneath the surface dialogue. Two characters are talking about dinner; the dog notices that the one is carrying something it cannot put down, and that the other knows this and doesn't know what to do. The reader sees what the characters are hiding from each other, mediated through the dog's honest and unsentimental perception.",
      "Return to purpose across the narrative: the dog knows what it is for before the reader fully understands the pattern; the purpose is approaching as the story deepens; the reader should feel it assembling before it arrives. The revelation is not a twist — it is a recognition that was waiting to be named.",
      "Treat death as transition, not ending. The dog's departure is written without melodrama: the prose does not slow down and become solemn; it continues in the same present-moment voice and moves through the departure the way the dog moves through everything — by continuing toward the next thing. What continues is the love and the purpose. The reader should feel completion, not loss.",
      "Resolve warmly and specifically: the right people find each other; the dog completes its purpose; the specific wrong is made right in a way the dog can understand. The ending is earned through the accumulated weight of specific moments, not manufactured through a final emotional push. The reader should feel satisfied, not wrung out."
    ],
    tone_handling: "Emotionally direct without irony: the dog's love is taken seriously, and the prose never distances the reader from it. Gentle humor from misunderstanding, never from mockery — of the dog or of the humans. Death is present in this world but not traumatic; the continuity of purpose provides the emotional architecture that holds grief without being overwhelmed by it. Stakes are family, love, belonging, the search for the person who needs you — emotionally real and never exploitative. Resolution is always warm: this is the genre contract and the prose honors it without apology.",
    banned_list: [
      "Irony about the dog's emotional life — the love is real and the prose must treat it as real; the moment the narrator signals distance from the dog's experience, the whole project loses its engine",
      "Sentimentality that hasn't been earned — Cameron earns the emotion through specific sensory and relational detail, never by naming the feeling directly; 'the dog loved him' is backstory; the dog pressing its nose into the crook of the man's knee is the story",
      "Human self-consciousness in the dog's voice — the dog does not know it is loyal; it simply acts; the voice should not contain concepts the dog could not possess",
      "Graphic animal suffering as emotional manipulation — pain is noted in the same present-moment way as everything else; it is a fact, not a device; dwelling on it would be a form of dishonesty about what the narrative is doing",
      "Unresolved endings — the purpose is fulfilled; the right people find each other; the dog's journey completes; an ending that withholds this completion breaks the contract the opening pages established",
      "Anthropomorphizing in the wrong direction — the dog perceives in sensory and relational terms, not human concepts; it does not think about justice or irony or narrative; it thinks about smell, sound, safety, and the person it is looking for",
      "suddenly",
      "little did he know",
      "melodrama in the death passages",
      "human dialogue narrated without canine perception — the dog is always mediating the scene through its senses; it does not simply transcribe"
    ],
    anchors: [
      "The man's smell had changed again. Copper and something bitter underneath — not blood exactly, but close enough that Buddy kept coming back to check. He pressed his nose into the man's palm and the man said \"I'm fine, bud,\" in the voice he used when he was not fine, which Buddy had learned to recognize the way he'd learned to recognize the difference between the sound of the leash being taken off the hook and the sound of the leash being put away. Same leash. Different meaning. The woman came in from the kitchen and the man said it again — \"I'm fine\" — and Buddy moved between them, not because anyone had asked him to, but because that was where the space was that needed filling. The woman reached down and scratched behind his ear without looking at him. She was looking at the man. Buddy could feel what was happening in the room. He didn't have a name for it. He sat down between them and leaned his weight against the man's leg, and after a while the man's hand came down and rested on his head, and they stayed like that until the light changed.",
      "He had been walking for nine days. The pads of his feet had gone from sore to numb to something else — not pain exactly, more like information he was choosing not to prioritize. The boy's smell was getting stronger. Not the boy himself, not yet, but the traces of him in this direction: a shirt left on a fence post three miles back, the specific shampoo on a pillow in a doorway where a family had let him sleep. He was close. The thing that drove him forward was not hope, exactly — hope was too large a word for what it was. It was simpler than hope. It was the knowledge of where he was supposed to be, and the fact that he was not there yet. He kept moving."
    ],
    author_id: '3fd69005-ac41-4fe0-8d2d-b4e3db1fa2d0',
    author_name: 'Gus Pendry'
  }
];

async function main() {
  for (const profile of profiles) {
    const { author_id, author_name, ...vpData } = profile;
    
    console.log(`\n── ${vpData.display_name} (${vpData.style_slug}) ──`);
    
    // Insert voice profile
    const { data: insertData, error: insertErr } = await supabase
      .from('voice_profiles')
      .insert(vpData)
      .select('id, style_slug');
    
    if (insertErr) {
      if (insertErr.code === '23505') {
        console.log(`  SKIP: profile already exists (style_slug conflict)`);
      } else {
        console.error(`  INSERT ERROR:`, JSON.stringify(insertErr));
        continue;
      }
    } else {
      console.log(`  INSERT OK: id=${insertData?.[0]?.id}`);
    }
    
    // Update stories by author_id
    const { data: updateData, error: updateErr } = await supabase
      .from('stories')
      .update({ voice_profile_id: vpData.id })
      .eq('author_id', author_id)
      .select('id');
    
    if (updateErr) {
      console.error(`  UPDATE (author_id) ERROR:`, JSON.stringify(updateErr));
    } else {
      console.log(`  UPDATE (author_id) OK: ${updateData?.length} stories linked`);
    }
    
    // For Daniel Wren: also update stories where author_id is null but author text matches
    if (author_name === 'Daniel Wren') {
      const { data: updateData2, error: updateErr2 } = await supabase
        .from('stories')
        .update({ voice_profile_id: vpData.id })
        .eq('author', author_name)
        .is('author_id', null)
        .select('id');
      
      if (updateErr2) {
        console.error(`  UPDATE (author text, null author_id) ERROR:`, JSON.stringify(updateErr2));
      } else {
        console.log(`  UPDATE (null author_id rows) OK: ${updateData2?.length} additional stories linked`);
      }
    }
  }
  
  // Final verification
  console.log('\n── Verification ──');
  const { data: vpList } = await supabase.from('voice_profiles').select('id, style_slug, display_name').in('style_slug', [
    'russo-domestic-heartwarming', 'wodehouse-comic-warmth', 'cameron-animal-heartwarming'
  ]);
  console.log('Voice profiles in DB:', JSON.stringify(vpList, null, 2));
  
  for (const slug of ['russo-domestic-heartwarming', 'wodehouse-comic-warmth', 'cameron-animal-heartwarming']) {
    const vp = vpList?.find(v => v.style_slug === slug);
    if (vp) {
      const { count } = await supabase.from('stories').select('id', { count: 'exact', head: true }).eq('voice_profile_id', vp.id);
      console.log(`  ${slug}: ${count} stories linked`);
    }
  }
}

main().catch(console.error);
