# Canonical Mode Rules for Project Work

Use these rules at the start of every coding session.

## Startup Command
Canonical mode. One live version only. Superseded code is archival only, never active. One file, one goal, one change, one test. If code is tangled, restore then proceed.

## Core Rules

### 1. Canonical Code Rule
There must be one canonical file for each feature.
When a better version replaces an older one:
- the old version is no longer a candidate
- do not patch it
- do not compare against it again
- do not leave it in the active path

### 2. No Zombie Versions Rule
Do not keep multiple live variants such as:
- page.tsx
- page.tsx.backup
- page-good.tsx
- alternate branch version
- copied temporary good file

Archival copies are allowed only if they are not active and not reachable by the running app.

### 3. One File, One Goal, One Change, One Test
For any repair session:
1. identify the one file to change
2. identify the one goal
3. make one change
4. test immediately
5. only then move to the next change

Do not bundle multiple unrelated fixes into one turn.

### 4. Replace, Don't Layer
If a file is tangled or uncertain:
- restore the last known good version
- then apply the next change cleanly

Do not keep stacking patches onto damaged code.

### 5. Active Path Cleanup Rule
When a new version is accepted as better:
- old routes should redirect away
- old layouts should stop being used
- stale alternates should not remain in the active app path

### 6. Environment Reset Rule
Before testing:
- kill old dev servers
- clear .next
- use one port only
- open only that port

### 7. Default Working Rule
In project code work, assume:
- old superseded code should be discarded from the active path
- one canonical version should be used
- if code is tangled, restore/reset is better than patch layering

## Daily Session Workflow
1. confirm the canonical file
2. confirm the single goal for the session
3. make one change
4. test
5. if broken, restore and retry cleanly
6. do not widen scope until the current goal passes

## What to Say at the Start of Each Day
Canonical mode. One live version only. Superseded code is archival only, never active. One file, one goal, one change, one test. If code is tangled, restore then proceed.

## Project Bible Note
Keep this file with the project Bible and paste the startup command at the beginning of each coding session.
