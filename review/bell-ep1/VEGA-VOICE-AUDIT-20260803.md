# VEGA Voice Consistency Audit — 2026-08-03
Read-only. No re-renders performed. Marc rules on repair vs cold-storage.

## Scope
16 multi-episode series currently in ready_for_review or repair_queue.
Source: character_voice_assignments (329 rows) + series_character_roster (163 rows).

---

## SIGNAL DECAY (400db5ac) — 5 eps, ready_for_review

Narrator: Priya Lunden (fZAt42eVuCC3sGVb7L7E) — CONSISTENT all 5 eps ✓

| Character | EP1 | EP2 | EP3 | EP4 | EP5 | Drift |
|---|---|---|---|---|---|---|
| Amara Slade / Amara Glass | esy0r39Y (Brittney) | esy0r39Y ✓ | BlgEcC0T (Fena) ⚠️ | esy0r39Y ✓ | esy0r39Y ✓ | YES — EP3 |
| Cedric Grafton | kmSVBPu7 (Archie) | — | — | — | — | N/A (EP1 only) |
| Director Cullen / Cullen | — | B52raBK4 (Matthew Schmitz Old Storyteller) | VsQmyFH (Eddie Stirling) ⚠️ | — | — | YES — EP3 |
| Jonah Whitlock / Jonah | — | Q4oILuo4 (Matthew Schmitz Old Timer) | Q4oILuo4 ✓ | Q4oILuo4 ✓ | Q4oILuo4 ✓ | CLEAN |
| ASH / Ash | — | — | — | BXeZVLBk (Sara) | BXeZVLBk ✓ | CLEAN |
| Glass | — | — | aIu5oHgl (Jane Hackett) | aIu5oHgl ✓ | — | CLEAN |
| Harding | — | — | Av4Fi2id (Russel Old Man) | — | Av4Fi2id ✓ | CLEAN |

DRIFT DETAILS:
- EP3 renders "Amara Glass" — pipeline created a new roster entry (first name "AMARA" + last name "GLASS" ≠ "SLADE") → fresh voice assigned. Audio: EP3 Amara sounds like a different person than EP1/2/4/5.
- EP3 renders "Cullen" without "Director" prefix — pipeline created new entry. EP2 Director Cullen ≠ EP3 Cullen (Matthew Schmitz Old Storyteller vs Eddie Stirling British Corporate).
- Also: Director Cullen (B52raBK4, old storyteller) and Jonah Whitlock (Q4oILuo4, old timer mountain man) are both Matthew Schmitz variants — near-register collision in EP2.

DRIFT COUNT: 2 characters across 1 episode (EP3).

---

## THE 911 DISPATCHER (8fb02edf) — 7 eps, ready_for_review ← CRITICAL

Narrator: Finn Calloway (SOYHLrjzK2X1ezoPC6cr) — CONSISTENT all 7 eps ✓

| Character | EP1 | EP2 | EP3 | EP4 | EP5 | EP6 | EP7 | Drift |
|---|---|---|---|---|---|---|---|---|
| Keisha (Brannigan/Lane/Lawson) | aNgyJM3H (Khánh Tư) | onwK4e9Z (Daniel ⚠️) | 4wSdtVjoBK (Tisha) ⚠️ | — | JzB4cRKw (Thorn) ⚠️ | — | JzB4cRKw ✓ | 4 VOICE IDS |
| NOLAN Radcliffe | fnX380kt (John) | fnX380kt ✓ | fnX380kt ✓ | fnX380kt ✓ | fnX380kt ✓ | fnX380kt ✓ | fnX380kt ✓ | CLEAN |
| Travis Fletcher / TRAVIS | — | — | kXsOSDWo (Riley) | kXsOSDWo ✓ | kXsOSDWo ✓ | — | kXsOSDWo ✓ | CLEAN |
| Esther (Brannigan/Brock/Lane) | AIFDUhRn (Kiara) | — | AIFDUhRn ✓ | AIFDUhRn ✓ | AIFDUhRn ✓ | — | AIFDUhRn ✓ | CLEAN |

KEISHA DRIFT DETAIL (4 distinct voice IDs for 1 character across 7 episodes):
- EP1 "Keisha Brannigan": aNgyJM3HqLEAaxmXxG1V (Khánh Tư - Vietnamese/female)
- EP2,3,5 "KEISHA": onwK4e9ZLuTAKqWW03F9 (Daniel - Steady Broadcaster — likely male)
- EP3 "Keisha Lane": 4wSdtVjoBKPAQAXgUGZE (Tisha)
- EP5,7 "Keisha Lawson": JzB4cRKwI655namyRezF (Thorn)

The main character's surname changes every 2-3 episodes. The pipeline never linked the new surname to the existing roster entry. Each new surname = fresh voice pick. Roster entry is "Keisha Lane" → Tisha, which matches only EP3.

This is the worst drift in the catalog. The protagonist sounds like a different person in 5 of 7 episodes.

DRIFT COUNT: 1 character, 4 voice IDs, 7 episodes. Critical.

---

## THE DEEP ARCHAEOLOGY (4120c04a) — 10 eps in RfR + earlier rendered eps

Narrator: Clara Westing (k64C4NILG34yJeeFwKgK) — CONSISTENT all 10 eps ✓

| Character | Rendered voice (assignments) | Roster lock | Mismatch |
|---|---|---|---|
| GRAY | Uk47Sms9vmqAyKXUC67S (Gray voice) | wplbCYzd35t6D6y00c9j (Griffith Mace) | YES ⚠️ |
| Tobias Kendrick / Kendrick | dNH3PGQenpJn3UgJkJS8 (James) | yI0BY0SdffEkqmjTOUFc (Charles Moore) | YES ⚠️ |
| Sarah / Sarah Vale | hR5kzrJa1QHVlH7iCPMg (Ayanna) | hR5kzrJa1QHVlH7iCPMg (Ayanna) | CLEAN ✓ |
| Sarah Glass (EP13/finale) | ZRzU2rGoAqRXcVtORyih (Laura Polen) | ZRzU2rGoAqRXcVtORyih ✓ | CLEAN ✓ |
| Rose | AAcsG2GKDfpmaiNOamMe (Francesca) | AAcsG2GKDfpmaiNOamMe ✓ | CLEAN ✓ |
| Drew | Badmqxcjd1MK1KzUUUWN (Christian Alexander) | Badmqxcjd1MK1KzUUUWN ✓ | CLEAN ✓ |

ROSTER MISMATCH DETAIL:
- GRAY: All rendered episodes used Uk47Sms9 ("Gray voice"). Roster lock says Griffith Mace (wplbCYzd). Roster was updated AFTER rendering — the rendered audio uses the original voice, but any future re-render or new episode will get Griffith Mace.
- Tobias Kendrick: All rendered eps used James (dNH3PGQe). Roster lock says Charles Moore (yI0BY0Sd). Same issue — future renders would drift.

These are not drift-in-the-can, but they are a latent trap: if any of these episodes gets a re-render triggered, the voice will change.

DRIFT COUNT: 2 roster mismatches (latent). No in-can drift on these series characters.

---

## THE HANGED MAN'S GRAVE (1bd35f9a) — 13 eps, repair_queue

Narrator: Gordon Paley (fXyxAavMrsCdaI4F1nfo) — CONSISTENT all 13 eps ✓

| Character | Consistency | Notes |
|---|---|---|
| Colin Devereaux | ktHrlQPfUoEUQDP8xbm1 (Axel) — all 11+ eps | CLEAN ✓ |
| Eleanor Vaughn / Eleanor Devereaux Vaughn | qqKpdUwkD3h8VyDLKQyz (Cassie) — all eps | CLEAN ✓ |
| Thomas Vaughn | mAjhLFPpPxY2b9Ibi7fD (Jazzo) — all eps | CLEAN ✓ |
| Jacob Wren / Deputy Jacob Wren | RckSZHfvva0yOVRPzRfv (Arlo) | CLEAN ✓ |
| Judge Carter North vs Judge North | kpftzLQxRv90Nn6qoJRf (Stephen) vs NV3wiCgBGInRZfu9g4Zk (Everett) | DRIFT ⚠️ |
| PETER / Peter Donnelly | tIb1FHpzlwSiTGg6JxF0 (Belle B Chatbot) | WRONG VOICE ⚠️ |
| BELLE B | Ci4qAH84tbKipJpEqtQ6 (Cheyenna) | WRONG VOICE ⚠️ |

ISSUES:
1. JUDGE NORTH DRIFT: "Judge Carter North" (EP13) = Stephen Courson. "Judge North" (EPs 5,8,9,10,11) = Everett. Same character, same judge, two different voices. In-can drift across 6 episodes.

2. PETER DONNELLY / PETER uses voice tIb1FHpzlwSiTGg6JxF0 — this is "Belle B - Conversational Chatbot Voice," NOT the canonical Belle B (GMhgX8fCR9GUtd3kmlKC). The character named "Peter" was accidentally assigned a Belle B ElevenLabs voice. This is not Belle B the announcer, but it's an alias for that voice object. Appears in EPs 1, 3, 5.

3. BELLE B ANNOUNCER in EP13 uses Ci4qAH84tbKipJpEqtQ6 (Cheyenna - Business professional), NOT the canonical Belle B ID (GMhgX8fCR9GUtd3kmlKC). EP13 announcer is a different voice than EPs 1-12. 

NOTE: HMG is in repair_queue anyway, but the Judge North drift and Belle B EP13 issue are additional reasons it needs attention before RfR.

---

## WEARING MY FACE (d5d1b5a3) — 4 eps, ready_for_review

Narrator/protagonist: Cass Boone (Sage Wilder, cgSgspJ2msm6clMCkdW9) — CONSISTENT all 4 eps ✓
DETECTIVE WARD: nPczCjzI2devNBz1zQrb — CONSISTENT EPs 2-4 ✓ (EP1 not a speaking character)
DOPPELGANGER: cgSgspJ2msm6clMCkdW9 — same as Cass Boone (intentional) ✓

CLEAN. No drift.

---

## THE DISCHARGE PAPERS (eec0b152) — 2 eps, ready_for_review — NO AUDIO RENDERED YET

Roster locked, not yet dispatched.
- Narrator: Iris Calloway (hpp4J3VqNfWAUOO0d1Us) — both eps ✓
- CLARA VOSS: GUtvmpvjSsoZlvjTKGXi (Carmen Doyle) ✓
- ELI BRENNAN: N2lVS1w4EtoT3dr4eOWO (James Alcott) ✓
- CLERK: 1nFfPv6rPB37Tt2950M0 (Lena Cho) ✓

Roster is clean and matches HEARTBEAT cast lock. Consistent before render.

---

## THE BORDER SICKNESS (7fc3f4fe) — 7 eps, ready_for_review

Narrator: Rex Drummond (DgL4aqeif7j5vXmFZCtm) — CONSISTENT all 7 eps ✓

| Character | Consistency | Notes |
|---|---|---|
| Felix Larkin / Felix | bKrvJaCHEqucAEpSzACi (Brian) all 7 eps | CLEAN ✓ |
| Sarah Quincy | 5u41aNhyCU6hXOcjPPv0 (Carol) all 7 eps | CLEAN ✓ |
| Jasper Maddox (EPs 2-4,6,7) | lRQx6aR2Y1O88hpwSWro (Kelly) | CLEAN ✓ |
| Maddox (Jasper Maddox) — EP5 | VOJyehUzZPmLbl8DHdih (Phil - Radio Announcer) | DRIFT ⚠️ |
| Jasper Dyer — EP1 | FMlfDDNdx1zsjNPNbnas (Reuven) | Different from Jasper Maddox — likely different character in EP1 |
| Dr. Amos Hargrove — EP4 | pQh9V7vKVWKF3pBFDSc5 (Miles) | vs |
| Dr. Hargrove — EPs 6,7 | b6Q4e5E5onTR1TYEJh9z (Daniel - Commercial Salesman) | DRIFT ⚠️ |
| North (EPs 5,7) | Pb8RZcHs3ga4StE7wiPM (Ethan) vs |
| Chase North (EP6) | vMMCJEO2douO5xisIZi3 (Yahya) | DRIFT ⚠️ |

DRIFT DETAILS:
- "Maddox (Jasper Maddox)" in EP5: the parenthetical alias form triggered a new assignment instead of matching existing "Jasper Maddox" roster entry. Listener hears a different voice for the same character in EP5 only.
- "Dr. Amos Hargrove" (EP4) vs "Dr. Hargrove" (EPs 6,7): full name vs shortened form fell through to different assignment. Roster has both as separate locked entries with different voices.
- "Chase North" vs "North": EP6 used "Chase North" as full name; EPs 5,7 used "North" alone. Different voices.

DRIFT COUNT: 3 characters, localized to specific episodes.

---

## THE COURTHOUSE SILENCE (7cffc169) — 5 eps, ready_for_review

Narrator: Cole Hargrove (IRHApOXLvnW57QJPQH2P) — CONSISTENT all 5 eps ✓

| Character | Consistency | Notes |
|---|---|---|
| Eva Chen | 2tM0Teq5Piex0mNtlZnm (Veronica) all 5 eps | CLEAN ✓ |
| Russell Morrow | sHcGDc2FmL9xtRukNTuL (Bryant) EPs 1,2,5 | CLEAN ✓ |
| Warren Leland | 0a3rU6OS52qFMvnAmGct (Cory) EPs 1,2 | CLEAN ✓ |
| Aaron Braddock (EP2) vs Aaron Burke (EPs 4,5) | hT1MsRBLaHSXGeWzW6xF vs Badmqxcjd1MK1KzUUUWN | Likely different characters; different surnames ✓ |

CLEAN. No confirmed drift. Aaron Braddock/Aaron Burke surname difference indicates different characters (intentional).

---

## THE TUNNEL AT MILE SIX (d60e2648) — 3 eps, repair_queue

Narrator: Ray Dolan (CwhRBWXzGAHq8TQ4Fs17) — CONSISTENT all 3 eps ✓

All 4 recurring characters consistent across all 3 episodes:
- GRADY POLK: 64ZIZpnfEIjUuIyw3uKc — CLEAN ✓
- IVY SHAW: 47ztMLq1EmhhslNSINCu — CLEAN ✓
- NATE OKAFOR: TABZn6CDfjMNGrsnGzzD — CLEAN ✓
- CORINNE SHAW: RXtWW6etvimS8QJ5nhVk — EPs 1,3 only (absent from EP2 assignments, likely not in EP2 script)

CLEAN.

---

## THE CATTLE AND THE LAW (efc1e31b) — 5 eps, ready_for_review

Narrator: Beau Slade (9hGxRHDrJPVBk2ipyuuk) — CONSISTENT all 5 eps ✓

| Character | Consistency | Notes |
|---|---|---|
| Everett Dunham | xsiB5fGhEtknnqzudCO6 (Smoke) all 5 eps | CLEAN ✓ |
| Tom Garrett | AaOhDHYJ1XLZk74lXhdE (Caleb) all 5 eps | CLEAN ✓ |
| Abigail Cadwell | 5u41aNhyCU6hXOcjPPv0 (Carol) EPs 2-5 | CLEAN ✓ |
| GRANT PIERCE | 4zVVKJJRwoOAAeUwtCQ1 (Aiden) EPs 3-5 | CLEAN ✓ |
| HOLLOWAY EPs 3,4,5 | 8yh4Wuya1OlwcUp0epGF (Wade) | vs |
| Vincent Holloway EP2 | rksOYA2l7BHrbkd2qu1a (Noah) | DRIFT ⚠️ |
| Charles Farr, ASA FARR, FARR, LOUIS FARR | 4 different voices | Likely different Farr family members per ep — probably intentional |

DRIFT: Vincent Holloway (EP2) vs HOLLOWAY (EPs 3-5) = different voice. Likely same character, last name dropped in EPs 3+.

---

## THE CONSCIOUSNESS PROTOCOL (bc89490a) — 7 eps, ready_for_review

Narrator: Iris Calloway (hpp4J3VqNfWAUOO0d1Us) — CONSISTENT all 7 eps ✓

| Character | Consistency | Notes |
|---|---|---|
| Artemis | qhJBF445N8YMaTNrlvGE (Zach) EPs 1-4 | CLEAN ✓ |
| Celia Sinclair (EPs 1,2) | Xb7hH8MSUJpSbSDYk0k2 (Alice) | vs |
| Celia (EPs 3,4) | zWoalRDt5TZrmW4ROIA7 (Brooklyn) | DRIFT ⚠️ |
| Celia Rourke (EP1 only) | DXX4Q5Bh1vqK8CciYVPf (Misha) | Third Celia voice in EP1 |
| James Ashby (EPs 1,2) | WyscUDDs9ZWbMjTYd7By (mike) vs |
| James Bradford (EP3) | l7kNoIfnJKPg7779LI2t (Eddie) | Different surname = different character (likely) |
| James Latham (EP2) | IYqf1iezN35eNyBtnZQS (AC) | Third James, EP2 — different character |

CELIA DRIFT: Three separate Celia entries, three different voices. "Celia Rourke" and "Celia Sinclair" both appear in EP1 — either they're the same person at different points (name confusion) or genuinely different characters. "Celia" in EPs 3-4 is the roster canonical; EPs 1-2 rendered with other voices. Listener hears a different Celia in EPs 1-2 vs 3-4.

---

## THE ACCIDENTAL SAVIORS (b684a5de) — 5 eps, ready_for_review

Narrator: Cray Tollins (OM9xwkU4ZM8dlvWOev3J) — CONSISTENT all 5 eps ✓

| Character | EP1 | EP2 | EP3 | EP4 | EP5 | Pattern |
|---|---|---|---|---|---|---|
| "Pete" (varies: Hobbs/Keller/Tolliver) | Connery | Dustin | Craig | Craig | Craig | 2 voices; EPs 3-5 consistent |
| "Ray" (varies: Tolliver/Page/Harlow/Keller) | Stephen Courson | Cory | Marcos | Thomas | Thomas | 3 voices |
| "Lucy" (varies: Harlow/Flint/Page/Lucy) | — | Abby | Natalee | Maureen | Katherine | 4 voices |
| Aldric Rhodes | — | Mike | Mike ✓ | Mike ✓ | Mike ✓ | CLEAN (EPs 2-5) |

STRUCTURAL NOTE: Each episode introduces a new "Pete," "Ray," and "Lucy" with a different surname. This appears to be an anthology structure — each episode features a different accidental savior who happens to share a first name. If this is intentional, the different voices are correct. If these are meant to be recurring characters, this is catastrophic drift.

The series bible should specify the intent. If these are different people each episode, voice diversity is correct. If they're the same recurring characters, Pete/Ray/Lucy each need a single locked voice.

Aldric Rhodes is consistently cast (EPs 2-5) — confirms the pipeline lock works when surnames are stable.

---

## THE AUCTION HOUSE (9eba3574) — 13 eps, repair_queue — NO VOICE DATA

All 18 series_character_roster entries have voice_id = null.
Zero character_voice_assignments recorded.

This means: Auction House has never successfully completed voice generation. On next dispatch, every character will get a fresh voice pick. No prior voices to be consistent with.

If Marc authorizes dispatch for Auction House, the first episode's assignments will become the lock for all subsequent episodes — series roster needs to be bootstrapped from EP1's render.

---

## A WOMAN I DON'T KNOW (5e786e00) — 3 eps, repair_queue

Narrator: Lena Pruett (7vcAfiAL1LP6cgdQF51s) — CONSISTENT all 3 eps ✓

Core cast consistent:
- Frank Cable: pqHfZKP75CvOlQylNhV4 — EPs 1,2,3 ✓
- HELEN GOSS: XrExE9yKIg1WjnnlVkGX — EPs 1,2,3 ✓
- Margot Cable: 1nFfPv6rPB37Tt2950M0 — EPs 1,2,3 ✓

EP3 introduces "Helen Lawson" (GnC1wACsy8I4R1W01aIQ) and "Margot Lawson" (QLAlOeRuLwKX0skeTR7R) alongside HELEN GOSS and Margot Cable. If Helen Lawson IS Helen Goss (name change), that's a drift. If she's a new character, it's correct. Flagged for Marc to determine intent.

---

## THE SWAMP RABBIT CIPHER (36bc7c4d) — EP2 only in scope

Only EP2 "Everything Below" (in repair_queue). EP1 is not in RfR/repair. Cannot compare across episodes.

## ROOM THREE TWELVE (0f030ca2) — EP1 only in scope

Only EP1 in ready_for_review. Single episode, no inter-episode comparison possible.

---

## ROOT CAUSE: WHERE THE RE-RESOLUTION HAPPENS

File: `app/api/admin/generate-voices/route.ts`

Function chain for the failure:
1. `selectCharacterVoice()` [~line 1197] calls `findSeriesCharacterAssignment(context.seriesId, characterName)` 
2. `findSeriesCharacterAssignment()` [line 1151] calls `findSeriesRosterCharacter()` to match the character name
3. `findSeriesRosterCharacter()` [line 1081] calls `findRosterCharacterNameMatch()` which does:
   a. Exact match on canonical_name_normalized or aliases
   b. Fuzzy subset match: first token must match AND all shorter-form tokens must exist in longer form

FAILURE MODE — surname change: 
- "Amara Slade" (EP1) gets canonical_name_normalized = "AMARA SLADE"
- "Amara Glass" (EP3) normalizes to "AMARA GLASS"
- Subset check: first token "AMARA" matches ✓ but "GLASS" ∉ ["AMARA", "SLADE"] → no match
- Roster lookup fails → `findSeriesCharacterAssignment` returns null → fresh pick from character_voices pool

FAILURE MODE — title prefix + suffix change:
- "Director Cullen" → strips no prefix (not in TITLE_PREFIXES) → "DIRECTOR CULLEN"
- "Cullen" → "CULLEN"  
- Subset: first token "DIRECTOR" ≠ "CULLEN" → no match (they are different first tokens!)
- This is actually a case where subset matching should catch it but doesn't because the title isn't treated as a prefix to strip

PREVENTION: 
The system has an alias auto-append mechanism (`appendSeriesCharacterAlias`) that adds new name variants to the roster entry's aliases array. This runs on successful match — but it only helps FUTURE episodes, and only if the first encounter produced a match. When the first encounter with a new name form MISSES, the alias is never added and each subsequent episode with that new name form also misses.

Fix would be: alias propagation at miss time, not only at match time. Or: first-name-only fallback when first token matches and no exact match is found. Marc to rule on approach; Atlas can implement in a feature branch.

---

## SUMMARY TABLE

| Series | Status | Narrator Drift | Character Drift | Severity |
|---|---|---|---|---|
| The 911 Dispatcher | RfR | None | KEISHA: 4 voice IDs, 7 eps | 🔴 CRITICAL |
| The Hanged Man's Grave | Repair | None | Judge North: 2 voices, 6 eps; Belle B EP13 wrong; Peter Donnelly = Belle B voice | 🔴 CRITICAL |
| Signal Decay | RfR | None | Amara EP3 wrong; Cullen EP3 wrong | 🟡 MODERATE |
| The Consciousness Protocol | RfR | None | Celia: 3 voices EPs 1-4 | 🟡 MODERATE |
| The Border Sickness | RfR | None | Maddox EP5 wrong; Dr. Hargrove EPs 4 vs 6-7; Chase North vs North | 🟡 MODERATE |
| The Accidental Saviors | RfR | None | Pete/Ray/Lucy different per ep — INTENT UNCLEAR | 🟡 INTENT QUESTION |
| Cattle and the Law | RfR | None | Vincent Holloway vs HOLLOWAY EP2 | 🟢 MINOR |
| A Woman I Don't Know | Repair | None | Helen Lawson vs Helen Goss EP3 — INTENT UNCLEAR | 🟢 INTENT QUESTION |
| The Deep Archaeology | RfR | None | GRAY + Tobias Kendrick roster ≠ rendered (latent re-render trap) | 🟡 LATENT |
| Wearing My Face | RfR | None | None | ✅ CLEAN |
| The Discharge Papers | RfR | None | None (not rendered) | ✅ CLEAN |
| The Courthouse Silence | RfR | None | None confirmed | ✅ CLEAN |
| The Tunnel at Mile Six | Repair | None | None | ✅ CLEAN |
| The Auction House | Repair | n/a | All null — will re-resolve on first dispatch | ⚪ NO DATA |
| Swamp Rabbit Cipher EP2 | Repair | n/a | Single ep in scope | ⚪ N/A |
| Room Three Twelve EP1 | RfR | n/a | Single ep in scope | ⚪ N/A |
