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
