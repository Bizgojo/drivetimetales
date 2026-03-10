#!/bin/bash
# Autonomous story pipeline — generates and publishes both stories
BASE="http://localhost:3000"
LOG="/tmp/stories-pipeline.log"

echo "🎙️ Endless Tales — Autonomous Story Pipeline" | tee $LOG
echo "Started: $(date)" | tee -a $LOG

# ─── Story 1: Horror/Mystery ──────────────────────────────────────────────────
echo "" | tee -a $LOG
echo "============================================================" | tee -a $LOG
echo "🎬 Story 1: Horror/Mystery (20 min, H.P. Lovecraft)" | tee -a $LOG
echo "============================================================" | tee -a $LOG
echo "📝 Generating script + audio + cover..." | tee -a $LOG

STORY1=$(curl -s -m 900 -X POST "$BASE/api/asc3/generate-story-complete" \
  -H "Content-Type: application/json" \
  -d '{
    "primaryGenre": "Horror",
    "secondaryGenre1": "Mystery",
    "secondaryGenre2": "Supernatural",
    "duration": "20",
    "wordCount": 3000,
    "concept": "A documentary crew travels to a forgotten mining town in West Virginia where an entire population vanished overnight in 1931. While filming underground tunnels, they begin hearing voices calling their names from deep inside the abandoned mine.",
    "tone": "Dark",
    "authorName": "Elias Thorn",
    "authorStyle": "H.P. Lovecraft",
    "authorTechniques": "Cosmic dread and atmospheric horror; slow revelation of unknowable evil; unreliable narrators whose sanity erodes; archaic dense prose that builds mounting unease; horror implied through suggestion not description; the insignificance of humanity against vast ancient forces; found footage and documents as narrative devices",
    "audioAdaptation": "Long pauses for dread; hushed terrified tones; ambient underground sound descriptions; voices from the mine described with eerie calm; narration should feel like a man documenting his own unraveling",
    "model": "claude-sonnet-4-6"
  }')

STORY1_ID=$(echo $STORY1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('storyId',''))" 2>/dev/null)
STORY1_TITLE=$(echo $STORY1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('title',''))" 2>/dev/null)
STORY1_SUCCESS=$(echo $STORY1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',False))" 2>/dev/null)

if [ "$STORY1_SUCCESS" = "True" ] && [ -n "$STORY1_ID" ]; then
  echo "✅ Generated: \"$STORY1_TITLE\" (ID: $STORY1_ID)" | tee -a $LOG
  
  echo "🎵 Generating Suno music..." | tee -a $LOG
  SUNO1=$(curl -s -m 300 -X POST "$BASE/api/asc3/generate-music" \
    -H "Content-Type: application/json" \
    -d "{\"storyId\":\"$STORY1_ID\",\"title\":\"$STORY1_TITLE\"}" 2>/dev/null)
  SUNO1_OK=$(echo $SUNO1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',False))" 2>/dev/null)
  if [ "$SUNO1_OK" = "True" ]; then echo "✅ Music generated" | tee -a $LOG
  else echo "⚠️ Music failed — using library track" | tee -a $LOG; fi

  echo "📤 Publishing..." | tee -a $LOG
  PUB1=$(curl -s -m 30 -X POST "$BASE/api/asc3/publish-story" \
    -H "Content-Type: application/json" \
    -d "{\"storyId\":\"$STORY1_ID\",\"destinations\":[\"app\"]}")
  PUB1_OK=$(echo $PUB1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',False))" 2>/dev/null)
  if [ "$PUB1_OK" = "True" ]; then echo "🚀 PUBLISHED: \"$STORY1_TITLE\"" | tee -a $LOG
  else echo "❌ Publish failed: $PUB1" | tee -a $LOG; fi
else
  STORY1_ERR=$(echo $STORY1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','unknown'))" 2>/dev/null)
  echo "❌ Generation failed: $STORY1_ERR" | tee -a $LOG
fi

echo "" | tee -a $LOG
echo "⏳ Waiting 30s before Story 2..." | tee -a $LOG
sleep 30

# ─── Story 2: Uplifting/Drama ─────────────────────────────────────────────────
echo "" | tee -a $LOG
echo "============================================================" | tee -a $LOG
echo "🎬 Story 2: Uplifting/Drama (15 min, Mitch Albom)" | tee -a $LOG
echo "============================================================" | tee -a $LOG
echo "📝 Generating script + audio + cover..." | tee -a $LOG

STORY2=$(curl -s -m 900 -X POST "$BASE/api/asc3/generate-story-complete" \
  -H "Content-Type: application/json" \
  -d '{
    "primaryGenre": "Uplifting",
    "secondaryGenre1": "Drama",
    "secondaryGenre2": "Mystery",
    "duration": "15",
    "wordCount": 2250,
    "concept": "After a widowed bus driver finds a lost backpack filled with handwritten letters addressed to strangers, he begins delivering them one by one. Each letter changes a life, but the final message reveals the identity of the person who needed saving the most.",
    "tone": "Warm",
    "authorName": "Clara Bennett",
    "authorStyle": "Mitch Albom",
    "authorTechniques": "Emotional resonance through small meaningful moments; simple accessible language with profound weight; multiple perspectives revealing interconnected lives; themes of love loss and redemption; sentimentality balanced with honest human truth; lessons revealed through story not lecture; the extraordinary hidden in the ordinary",
    "audioAdaptation": "Warm conversational narration; characters should feel like real everyday people; emotional moments given space to breathe; gentle pacing allowing listeners to feel each revelation; bus driver internal monologue should be quietly philosophical",
    "model": "claude-sonnet-4-6"
  }')

STORY2_ID=$(echo $STORY2 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('storyId',''))" 2>/dev/null)
STORY2_TITLE=$(echo $STORY2 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('title',''))" 2>/dev/null)
STORY2_SUCCESS=$(echo $STORY2 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',False))" 2>/dev/null)

if [ "$STORY2_SUCCESS" = "True" ] && [ -n "$STORY2_ID" ]; then
  echo "✅ Generated: \"$STORY2_TITLE\" (ID: $STORY2_ID)" | tee -a $LOG

  echo "🎵 Generating Suno music..." | tee -a $LOG
  SUNO2=$(curl -s -m 300 -X POST "$BASE/api/asc3/generate-music" \
    -H "Content-Type: application/json" \
    -d "{\"storyId\":\"$STORY2_ID\",\"title\":\"$STORY2_TITLE\"}" 2>/dev/null)
  SUNO2_OK=$(echo $SUNO2 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',False))" 2>/dev/null)
  if [ "$SUNO2_OK" = "True" ]; then echo "✅ Music generated" | tee -a $LOG
  else echo "⚠️ Music failed — using library track" | tee -a $LOG; fi

  echo "📤 Publishing..." | tee -a $LOG
  PUB2=$(curl -s -m 30 -X POST "$BASE/api/asc3/publish-story" \
    -H "Content-Type: application/json" \
    -d "{\"storyId\":\"$STORY2_ID\",\"destinations\":[\"app\"]}")
  PUB2_OK=$(echo $PUB2 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',False))" 2>/dev/null)
  if [ "$PUB2_OK" = "True" ]; then echo "🚀 PUBLISHED: \"$STORY2_TITLE\"" | tee -a $LOG
  else echo "❌ Publish failed: $PUB2" | tee -a $LOG; fi
else
  STORY2_ERR=$(echo $STORY2 | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','unknown'))" 2>/dev/null)
  echo "❌ Generation failed: $STORY2_ERR" | tee -a $LOG
fi

echo "" | tee -a $LOG
echo "✅ Pipeline complete: $(date)" | tee -a $LOG
