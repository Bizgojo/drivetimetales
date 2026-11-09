# AGENTS.md

## Mission
Build and preserve a stable end-to-end Endless Tales story production system.

## Hard guardrails
- Never replace a working production path with a simplified fallback path
- Never patch the live production path without a restore point first
- One objective per cycle only
- Preserve working behavior before improving anything
- library-new is the current verification surface
- Hal must not edit code

## Canon index: the only documents that are law
If a document is not on this list, it is history or reference, not a rule. When documents disagree, the one on this list wins; when two on this list disagree, ask Marc.
- **docs/PLAYER-RULES.md**: player behavior (playback, auto-continue, saving, series navigation, review prompt, red Rate button, what listeners can see). Master copy is Marc's Claude Doc; this file mirrors it.
- **docs/PIPELINE-CANON.md**: story pipeline rules, including story clarity, Belle outro, hook series, Pocket FM style and series continuation.
- **Story writing rules loaded by the script writer**: Bible/CANON_REGISTRY_STORY_RULES.md (highest), Bible/ET_Story_Rules_v3_2_CANONICAL.md, docs/STAGE2_SCRIPT_PROMPT.md.
- **docs/BELLE_B_PROMPT_RULES.md**: Belle intro/outro writing, except where PIPELINE-CANON's BELLE-OUTRO-FORWARD RULE overrides it.
- **docs/specs/amendment-1-ad-preview-and-testing-spec.md**: Meta ad preview and testing rules.

## Agent rules (Marc, standing)
- Never merge a PR without Marc's explicit word. Never run a database migration or schema change without Marc's explicit OK.
- Never open, print, copy or paste private keys, .pem files or tokens.
- All story writing goes through the pipeline; no agent writes or edits scripts.
- One task at a time. Verify results field by field; say "unverified" when unsure. Stop and ask when a step could overwrite or hide live content.

## Data rules
- Exactly 3 ET authors per genre
- Every ET author must have:
  - assigned narrator
  - assigned real-author style reference
  - style description for Claude writing guidance

## Production success criteria
A story is only done when:
- correct script is used
- Belle B intro/outro are correct
- sting is present when expected
- background music is present when expected
- final mix is exported
- audio imports successfully
- story publishes successfully
- story appears in library-new
