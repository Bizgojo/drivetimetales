/**
 * HARBORLIGHT-REFLECTION-FIX-001 regression test.
 *
 * The series non-finale outro validator (hasEmotionalResidueOrReflection)
 * falsely rejected a clearly reflective Harbor Light Ep1 outro candidate —
 * a reflective invitation ("That's a lot to carry ... Sit with that for a
 * second") with no explicit question/truth/choice keyword. Demonstrated
 * validator false negative: reflective invitation, not plot recap.
 *
 * Exercises the REAL lib helper wired into the run-next package validator
 * with production-shaped fixtures: the quoted candidate passes, equivalent
 * paraphrases pass, pre-existing marker copy still passes, and plain
 * plot-only recaps still fail.
 */
import { hasEmotionalResidueOrReflection } from '@/lib/belleValidation'

// Exact quoted Harbor Light Ep1 outro candidate (must PASS: reflective
// invitation, not a plot recap).
const HARBOR_EP1_CANDIDATE =
  "That's a lot to carry — a failing joint, a demolition order, and now him. " +
  'Sit with that for a second...'

// Currently-saved Harbor Light Ep1 outro (must KEEP passing: "wondering").
const HARBOR_EP1_SAVED =
  '[LISTENER_NAME], the joint is fixed, but the light is marked for demolition — ' +
  'and you are left wondering what Lucy will sacrifice for her father light. ' +
  'She takes the fight to the council in Episode Two, and I will be right here ' +
  'with you when Jonah opens the logbook. You will not want to miss what he shows her.'

// Currently-saved Harbor Light Ep2 outro (must KEEP passing: cost/choice/truth).
const HARBOR_EP2_SAVED =
  '[LISTENER_NAME], her own survey condemns the light, and the trucks are already ' +
  'rolling — the cost of her dream job has never been clearer. She makes her choice ' +
  'in the Series Finale, and you will be standing beside her in the storm when Jonah ' +
  'decides what the truth is worth. Keep listening — dawn is coming.'

describe('hasEmotionalResidueOrReflection (lib/belleValidation)', () => {
  test('Harbor Light Ep1 quoted candidate passes (demonstrated false negative)', () => {
    expect(hasEmotionalResidueOrReflection(HARBOR_EP1_CANDIDATE)).toBe(true)
  })

  test('saved Harbor Light Ep1 outro still passes', () => {
    expect(hasEmotionalResidueOrReflection(HARBOR_EP1_SAVED)).toBe(true)
  })

  test('saved Harbor Light Ep2 outro still passes', () => {
    expect(hasEmotionalResidueOrReflection(HARBOR_EP2_SAVED)).toBe(true)
  })

  test('paraphrase "hold onto that" passes', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'Hold onto that feeling — dawn is coming, and everything changes.'
      )
    ).toBe(true)
  })

  test('paraphrase "let it sink in" passes', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'Let it sink in: everything she knew just changed.'
      )
    ).toBe(true)
  })

  test('paraphrase "take a moment" passes', () => {
    expect(
      hasEmotionalResidueOrReflection('Take a moment before the storm hits.')
    ).toBe(true)
  })

  test('paraphrase "the weight of" passes', () => {
    expect(
      hasEmotionalResidueOrReflection(
        "The weight of what she's losing finally lands."
      )
    ).toBe(true)
  })

  test('paraphrase "ask yourself" passes', () => {
    expect(
      hasEmotionalResidueOrReflection(
        "Ask yourself what you'd sacrifice for home."
      )
    ).toBe(true)
  })

  test('paraphrase "what would you" passes', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'What would you give up to keep the light burning?'
      )
    ).toBe(true)
  })

  test('paraphrase "carries" passes', () => {
    expect(
      hasEmotionalResidueOrReflection('She carries that fear into the finale.')
    ).toBe(true)
  })

  test('classic reflection keyword still passes', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'What will her choice cost when the truth comes out?'
      )
    ).toBe(true)
  })

  test('plain plot recap still fails', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'Lucy fixed the joint and found the demolition order. Jonah stamped the form and left.'
      )
    ).toBe(false)
  })

  test('flat episode-ending summary still fails', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'The episode ends with Lucy discovering a survey stake at the foundation line.'
      )
    ).toBe(false)
  })

  test('third-person multi-event recap still fails', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'Blythe has the photographs, Earl has the notebook, and someone has ' +
          'left a warning on her windshield.'
      )
    ).toBe(false)
  })

  // Codex-review literal-action negatives: bare action verbs with concrete
  // objects are plot language, not reflective invitations.
  test('literal "carries the toolbox" still fails', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'Lucy carries the toolbox upstairs. Jonah signs the form.'
      )
    ).toBe(false)
  })

  test('literal "weight of the truck" still fails', () => {
    expect(
      hasEmotionalResidueOrReflection('The weight of the truck breaks the bridge.')
    ).toBe(false)
  })

  test('literal "lingers at the gate" still fails', () => {
    expect(
      hasEmotionalResidueOrReflection('Jonah lingers at the gate, then walks home.')
    ).toBe(false)
  })

  test('literal "hold that ladder" still fails', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'Lucy tells Jonah to hold that ladder while she climbs.'
      )
    ).toBe(false)
  })

  // Codex-review round-2 negatives: pronouns/possessives/prepositions
  // carrying literal objects are still plot language.
  test('literal "carries that toolbox" still fails', () => {
    expect(
      hasEmotionalResidueOrReflection('Lucy carries that toolbox upstairs.')
    ).toBe(false)
  })

  test('literal "weight of her truck" still fails', () => {
    expect(
      hasEmotionalResidueOrReflection('The weight of her truck breaks the bridge.')
    ).toBe(false)
  })

  test('literal "lingers in the doorway" still fails', () => {
    expect(
      hasEmotionalResidueOrReflection('Jonah lingers in the doorway, then walks home.')
    ).toBe(false)
  })

  test('literal "hold onto that ladder" still fails', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'Lucy tells Jonah to hold onto that ladder while she climbs.'
      )
    ).toBe(false)
  })

  test('literal "echo of boots" still fails', () => {
    expect(
      hasEmotionalResidueOrReflection('The echo of boots fills the hall.')
    ).toBe(false)
  })

  // Constrained senses still pass: abstract/emotional complements.
  test('"weight of her grief" passes (possessed abstract)', () => {
    expect(
      hasEmotionalResidueOrReflection('The weight of her grief fills the tower.')
    ).toBe(true)
  })

  test('"echoes of what she gave up" passes', () => {
    expect(
      hasEmotionalResidueOrReflection('Echoes of what she gave up follow her home.')
    ).toBe(true)
  })

  // Codex-review round-3 negatives: plausible outros where a plot recap
  // carries a tease — literal objects/locations must not satisfy the
  // abstract-complement grammar.
  test('plausible outro "weight of that truck" still fails', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'The weight of that truck has buckled the bridge, and Lucy is stranded ' +
          'on the far bank. Join me for Episode Two.'
      )
    ).toBe(false)
  })

  test('plausible outro "lingers on the tower steps" still fails', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'Jonah lingers on the tower steps while Lucy heads for the council office. ' +
          "I'll meet you there in Episode Two."
      )
    ).toBe(false)
  })

  test('plausible outro "heavy with rain" still fails', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'Her coat is heavy with rain as she reaches the locked gate. ' +
          "We'll pick up there next time."
      )
    ).toBe(false)
  })

  test('plausible outro "echo of that bell" still fails', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'The echo of that bell sends Lucy running back to the tower. ' +
          'Keep listening for Episode Two.'
      )
    ).toBe(false)
  })

  test('plausible outro "remember how Lucy slipped" still fails', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'Remember how Lucy slipped the logbook into her bag? Next time, she takes ' +
          'it to the council.'
      )
    ).toBe(false)
  })

  test('plausible outro "carries that light upstairs" still fails', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'Lucy carries that light upstairs so Jonah can read the faded logbook. ' +
          'Join me for Episode Two.'
      )
    ).toBe(false)
  })

  test('plausible outro "hold onto it" (toolbox) still fails', () => {
    expect(
      hasEmotionalResidueOrReflection(
        'The toolbox is all Jonah has left, and Lucy tells him to hold onto it ' +
          "until she returns. We'll see her again in Episode Two."
      )
    ).toBe(false)
  })
})
