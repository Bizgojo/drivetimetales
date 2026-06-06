#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
# monitor-fresh-gardenias.sh
# Hourly progress monitor for Fresh Gardenias production job
# Job ID: e072a908-ff11-41b5-aa7c-18779d17c8d1
# Series: Fresh Gardenias (Untitled Series Package)
# ─────────────────────────────────────────────────────────

set -euo pipefail

JOB_ID="e072a908-ff11-41b5-aa7c-18779d17c8d1"
EP1_ID="38bf113b-bbb8-4199-9d8e-de35024af10e"
EP2_ID="cf22c5fb-4642-4032-afbb-0230c274d8dd"
EP3_ID="aa4e15f5-2412-47bc-b92c-43834aea3928"
PROJECT_DIR="$HOME/Projects/drivetimetales"
BOT_TOKEN="8362260344:AAEJhMC8yuGXUfAggTUqWbs8VpRkw2mfKFw"
CHAT_ID="8737860822"
STATE_FILE="/tmp/fg_monitor_state.json"
LOG_FILE="/tmp/fg_monitor.log"
REPORT_NUM=0

# ── Init state ──────────────────────────────────────────
if [ ! -f "$STATE_FILE" ]; then
  echo '{"reportNum":0,"lastSegs":0,"lastStatus":"","lastStep":"","lastFailSeg":"","lastEp1Mix":false,"lastEp2Segs":0,"lastEp3Segs":0,"lastUpdateTime":"","stagnantSince":""}' > "$STATE_FILE"
fi

send_telegram() {
  local msg="$1"
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"${CHAT_ID}\",\"text\":$(echo "$msg" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'),\"parse_mode\":\"HTML\"}" \
    >> "$LOG_FILE" 2>&1
}

check_and_report() {
  local REASON="$1"   # "hourly" or "alert: <reason>"
  local NOW
  NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  # Read previous state
  local PREV_SEGS PREV_STATUS PREV_STEP PREV_FAIL_SEG PREV_EP1_MIX PREV_EP2_SEGS PREV_EP3_SEGS PREV_UPDATE STAGNANT_SINCE
  PREV_SEGS=$(cat "$STATE_FILE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('lastSegs',0))")
  PREV_STATUS=$(cat "$STATE_FILE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('lastStatus',''))")
  PREV_STEP=$(cat "$STATE_FILE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('lastStep',''))")
  PREV_FAIL_SEG=$(cat "$STATE_FILE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('lastFailSeg',''))")
  PREV_EP1_MIX=$(cat "$STATE_FILE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('lastEp1Mix',False))")
  PREV_EP2_SEGS=$(cat "$STATE_FILE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('lastEp2Segs',0))")
  PREV_EP3_SEGS=$(cat "$STATE_FILE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('lastEp3Segs',0))")
  PREV_UPDATE=$(cat "$STATE_FILE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('lastUpdateTime',''))")
  STAGNANT_SINCE=$(cat "$STATE_FILE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('stagnantSince',''))")
  REPORT_NUM=$(cat "$STATE_FILE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('reportNum',0)+1)")

  # Query DB
  RESULT=$(cd "$PROJECT_DIR" && node << 'NODEEOF'
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local', quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const JOB_ID = process.env.JOB_ID;
const EP1 = process.env.EP1_ID;
const EP2 = process.env.EP2_ID;
const EP3 = process.env.EP3_ID;
(async () => {
  const { data: job } = await sb.from('production_jobs').select('*').eq('id',JOB_ID).single();
  if (!job) { console.log('ERROR:job_not_found'); process.exit(1); }

  const checkAudio = async (storyId) => {
    const { data: files } = await sb.storage.from('audio').list('asc3/'+storyId, {limit:500});
    const finalMix = files?.find(f => f.name === 'final_mix.mp3');
    const segs = files?.filter(f => f.name.match(/^segment_\d+\.mp3$/)) || [];
    return { segs: segs.length, finalMix: !!finalMix };
  };
  const [ep1a, ep2a, ep3a] = await Promise.all([checkAudio(EP1), checkAudio(EP2), checkAudio(EP3)]);

  const lockedAt = job.locked_at ? new Date(job.locked_at) : null;
  const lockedAgo = lockedAt ? Math.round((Date.now() - lockedAt)/1000) : null;
  const runnerActive = lockedAt && lockedAgo < 120;
  const seriesTitle = job.state_json?.seriesValidation?.seriesTitle || 'Untitled Series Package';
  const vg = job.state_json?.seriesVoiceGeneration || {};
  const segsPresent = vg.segmentsPresent || 0;
  const segsMissing = vg.missingCount || 0;
  const segsTotal = segsPresent + segsMissing;
  const currentEp = vg.currentEpisodeNumber || 1;
  const logs = job.logs || [];
  const lastLog = logs[logs.length-1] || {};
  const fail = (job.error_json?.voiceGenerationReport?.failures||[])[0];
  const updatedAt = new Date(job.updated_at);
  const ageMin = Math.round((Date.now() - updatedAt)/1000/60);

  const out = {
    status: job.status,
    step: job.current_step,
    seriesTitle,
    titleResolved: seriesTitle !== 'Untitled Series Package',
    currentEp,
    segsPresent,
    segsTotal,
    runnerActive,
    lockedBy: job.locked_by || 'none',
    lockedAgo,
    updatedAt: job.updated_at,
    ageMin,
    lastLogStep: lastLog.step || '',
    lastLogSeg: lastLog.segmentNumber,
    lastLogEp: lastLog.episodeNumber,
    lastLogMsg: lastLog.message || '',
    failSeg: fail?.segment || '',
    failErr: fail?.error?.substring(0,200) || '',
    ep1Segs: ep1a.segs,
    ep1Mix: ep1a.finalMix,
    ep2Segs: ep2a.segs,
    ep2Mix: ep2a.finalMix,
    ep3Segs: ep3a.segs,
    ep3Mix: ep3a.finalMix,
  };
  console.log(JSON.stringify(out));
})();
NODEEOF
  )

  if [[ "$RESULT" == ERROR:* ]]; then
    send_telegram "⚠️ FG MONITOR ERROR: $RESULT"
    return
  fi

  # Parse result
  local STATUS STEP SERIES_TITLE TITLE_RESOLVED CURRENT_EP SEGS_PRESENT SEGS_TOTAL
  local RUNNER_ACTIVE LOCKED_BY LOCKED_AGO UPDATED_AT AGE_MIN
  local LAST_LOG_STEP LAST_LOG_SEG LAST_LOG_EP LAST_LOG_MSG
  local FAIL_SEG FAIL_ERR EP1_SEGS EP1_MIX EP2_SEGS EP2_MIX EP3_SEGS EP3_MIX

  STATUS=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['status'])")
  STEP=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['step'])")
  SERIES_TITLE=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['seriesTitle'])")
  TITLE_RESOLVED=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['titleResolved'])")
  CURRENT_EP=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['currentEp'])")
  SEGS_PRESENT=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['segsPresent'])")
  SEGS_TOTAL=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['segsTotal'])")
  RUNNER_ACTIVE=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['runnerActive'])")
  LOCKED_BY=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['lockedBy'])")
  LOCKED_AGO=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('lockedAgo') or 'N/A')")
  UPDATED_AT=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['updatedAt'])")
  AGE_MIN=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['ageMin'])")
  LAST_LOG_STEP=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['lastLogStep'])")
  LAST_LOG_SEG=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('lastLogSeg') or 'N/A')")
  LAST_LOG_EP=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d.get('lastLogEp') or 'N/A')")
  LAST_LOG_MSG=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['lastLogMsg'][:80])")
  FAIL_SEG=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['failSeg'])")
  FAIL_ERR=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['failErr'][:120])")
  EP1_SEGS=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['ep1Segs'])")
  EP1_MIX=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['ep1Mix'])")
  EP2_SEGS=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['ep2Segs'])")
  EP2_MIX=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['ep2Mix'])")
  EP3_SEGS=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['ep3Segs'])")
  EP3_MIX=$(echo "$RESULT" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); print(d['ep3Mix'])")

  local SEG_DELTA=$((SEGS_PRESENT - PREV_SEGS))
  local STATUS_ICON
  case "$STATUS" in
    queued)   STATUS_ICON="🟡" ;;
    running)  STATUS_ICON="🟢" ;;
    complete) STATUS_ICON="✅" ;;
    failed)   STATUS_ICON="🔴" ;;
    *)        STATUS_ICON="⚪" ;;
  esac

  local RUNNER_ICON
  [ "$RUNNER_ACTIVE" = "True" ] && RUNNER_ICON="🟢 ACTIVE" || RUNNER_ICON="🔴 NOT DETECTED"

  local TITLE_NOTE
  [ "$TITLE_RESOLVED" = "True" ] && TITLE_NOTE="✅ $SERIES_TITLE" || TITLE_NOTE="⚠️ Still Untitled Series Package"

  local EP1_MIX_NOTE
  [ "$EP1_MIX" = "True" ] && EP1_MIX_NOTE="✅ final_mix.mp3 exists" || EP1_MIX_NOTE="❌ Not created"
  local EP2_NOTE
  [ "$EP2_SEGS" -gt 0 ] && EP2_NOTE="✅ Started ($EP2_SEGS segs)" || EP2_NOTE="❌ Not started"
  local EP3_NOTE
  [ "$EP3_SEGS" -gt 0 ] && EP3_NOTE="✅ Started ($EP3_SEGS segs)" || EP3_NOTE="❌ Not started"

  local BLOCKER="None"
  if [ "$STATUS" = "failed" ]; then
    BLOCKER="❌ FAILED at $FAIL_SEG — $FAIL_ERR"
  elif [ "$RUNNER_ACTIVE" != "True" ] && [ "$STATUS" = "queued" ]; then
    BLOCKER="⚠️ Queued but runner not detected"
  fi

  local QC_NOTE
  if [ -n "$FAIL_SEG" ]; then
    QC_NOTE="$FAIL_ERR"
  else
    QC_NOTE="None"
  fi

  MSG="📊 <b>FRESH GARDENIAS — Report #${REPORT_NUM}</b>
<i>Trigger: ${REASON} | ${NOW}</i>
━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Series: ${SERIES_TITLE}
2. Status: ${STATUS_ICON} ${STATUS}
3. Step: ${STEP}
4. Episode: Ep${CURRENT_EP}
5. Segments: ${SEGS_PRESENT}/${SEGS_TOTAL}
6. Delta since last: +${SEG_DELTA}
7. Failed seg: ${FAIL_SEG:-none}
8. Runner: ${RUNNER_ICON}
9. Locked: ${LOCKED_BY} (${LOCKED_AGO}s ago)
10. DB updated: ${AGE_MIN}m ago (${UPDATED_AT})
11. Last log: step=${LAST_LOG_STEP} ep=${LAST_LOG_EP} seg=${LAST_LOG_SEG}
12. Blocker: ${BLOCKER}
13. Title sync: ${TITLE_NOTE}
14. Ep1 final mix: ${EP1_MIX_NOTE}
15. Ep2: ${EP2_NOTE} | Ep3: ${EP3_NOTE}
16. QC failure: ${QC_NOTE}
17. Audio issues: none yet"

  send_telegram "$MSG"

  # Update state file
  python3 - << PYEOF
import json
state = {
  "reportNum": ${REPORT_NUM},
  "lastSegs": ${SEGS_PRESENT},
  "lastStatus": "${STATUS}",
  "lastStep": "${STEP}",
  "lastFailSeg": "${FAIL_SEG}",
  "lastEp1Mix": ${EP1_MIX},
  "lastEp2Segs": ${EP2_SEGS},
  "lastEp3Segs": ${EP3_SEGS},
  "lastUpdateTime": "${UPDATED_AT}",
  "stagnantSince": "${STAGNANT_SINCE}"
}
with open("${STATE_FILE}", "w") as f:
    json.dump(state, f)
PYEOF

  echo "[$(date)] Report #${REPORT_NUM} sent — Status: ${STATUS}, Segs: ${SEGS_PRESENT}/${SEGS_TOTAL}, Delta: +${SEG_DELTA}" >> "$LOG_FILE"
}

# ── Alert loop ───────────────────────────────────────────
alert_loop() {
  local PREV_STATUS=""
  local PREV_FAIL_SEG=""
  local PREV_SEGS=0
  local PREV_EP2_SEGS=0
  local PREV_EP3_SEGS=0
  local PREV_EP1_MIX="False"
  local STAGNANT_SINCE=""

  while true; do
    sleep 60  # check every 60 seconds for alert conditions

    RESULT=$(cd "$PROJECT_DIR" && node << 'NODEEOF'
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local', quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const JOB_ID = process.env.JOB_ID;
  const EP1 = process.env.EP1_ID;
  const EP2 = process.env.EP2_ID;
  const EP3 = process.env.EP3_ID;
  const { data: job } = await sb.from('production_jobs').select('*').eq('id',JOB_ID).single();
  if (!job) { console.log('{}'); return; }
  const checkAudio = async (id) => {
    const { data: files } = await sb.storage.from('audio').list('asc3/'+id, {limit:500});
    return {
      segs: files?.filter(f => f.name.match(/^segment_\d+\.mp3$/)).length || 0,
      mix: !!(files?.find(f => f.name === 'final_mix.mp3'))
    };
  };
  const [ep1a, ep2a, ep3a] = await Promise.all([checkAudio(EP1), checkAudio(EP2), checkAudio(EP3)]);
  const vg = job.state_json?.seriesVoiceGeneration || {};
  const fail = (job.error_json?.voiceGenerationReport?.failures||[])[0];
  console.log(JSON.stringify({
    status: job.status,
    step: job.current_step,
    segsPresent: vg.segmentsPresent || 0,
    failSeg: fail?.segment || '',
    ep1Mix: ep1a.mix,
    ep2Segs: ep2a.segs,
    ep3Segs: ep3a.segs,
    updatedAt: job.updated_at,
  }));
})();
NODEEOF
    ) 2>/dev/null

    [ -z "$RESULT" ] || [ "$RESULT" = "{}" ] && continue

    local STATUS FAIL_SEG SEGS EP1_MIX EP2_SEGS EP3_SEGS UPDATED_AT
    STATUS=$(echo "$RESULT" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['status'])" 2>/dev/null)
    FAIL_SEG=$(echo "$RESULT" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['failSeg'])" 2>/dev/null)
    SEGS=$(echo "$RESULT" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['segsPresent'])" 2>/dev/null)
    EP1_MIX=$(echo "$RESULT" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['ep1Mix'])" 2>/dev/null)
    EP2_SEGS=$(echo "$RESULT" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['ep2Segs'])" 2>/dev/null)
    EP3_SEGS=$(echo "$RESULT" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['ep3Segs'])" 2>/dev/null)
    UPDATED_AT=$(echo "$RESULT" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['updatedAt'])" 2>/dev/null)

    # Alert: segment 1 failed again
    if [ "$FAIL_SEG" = "segment_0001.mp3" ] && [ "$PREV_FAIL_SEG" != "segment_0001.mp3" ]; then
      check_and_report "🚨 ALERT: Segment 1 failed again"
      PREV_FAIL_SEG="$FAIL_SEG"
      continue
    fi

    # Alert: status changed to failed
    if [ "$STATUS" = "failed" ] && [ "$PREV_STATUS" != "failed" ]; then
      check_and_report "🚨 ALERT: Job status changed to FAILED"
      PREV_STATUS="$STATUS"
      continue
    fi

    # Alert: job completed
    if [ "$STATUS" = "complete" ] && [ "$PREV_STATUS" != "complete" ]; then
      check_and_report "🎉 ALERT: Series reached COMPLETE"
      break
    fi

    # Alert: stagnant for 20 minutes
    if [ "$SEGS" = "$PREV_SEGS" ] && [ "$STATUS" = "running" ]; then
      if [ -z "$STAGNANT_SINCE" ]; then
        STAGNANT_SINCE=$(date +%s)
      else
        local STAGNANT_AGO=$(( $(date +%s) - STAGNANT_SINCE ))
        if [ "$STAGNANT_AGO" -gt 1200 ]; then
          check_and_report "🚨 ALERT: No segment progress for 20+ minutes"
          STAGNANT_SINCE=""
        fi
      fi
    else
      STAGNANT_SINCE=""
    fi

    # Alert: Ep1 voice gen complete (ep2 started)
    if [ "$EP2_SEGS" -gt 0 ] && [ "$PREV_EP2_SEGS" = "0" ]; then
      check_and_report "✅ ALERT: Ep2 voice gen started (Ep1 complete)"
    fi

    # Alert: Ep2 complete (ep3 started)
    if [ "$EP3_SEGS" -gt 0 ] && [ "$PREV_EP3_SEGS" = "0" ]; then
      check_and_report "✅ ALERT: Ep3 voice gen started (Ep2 complete)"
    fi

    # Alert: Ep1 final mix created
    if [ "$EP1_MIX" = "True" ] && [ "$PREV_EP1_MIX" != "True" ]; then
      check_and_report "✅ ALERT: Ep1 final_mix.mp3 created"
    fi

    PREV_STATUS="$STATUS"
    PREV_SEGS="$SEGS"
    PREV_EP2_SEGS="$EP2_SEGS"
    PREV_EP3_SEGS="$EP3_SEGS"
    PREV_EP1_MIX="$EP1_MIX"
  done
}

# ── Main ─────────────────────────────────────────────────
export JOB_ID EP1_ID EP2_ID EP3_ID PROJECT_DIR

# Send immediate report
check_and_report "immediate — monitor started"

# Start alert loop in background
alert_loop &
ALERT_PID=$!

# Hourly loop
INTERVAL=3600
while true; do
  sleep $INTERVAL
  check_and_report "hourly"
  
  # Check if series is done — stop monitoring
  STATUS=$(cat "$STATE_FILE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('lastStatus',''))")
  if [ "$STATUS" = "complete" ]; then
    echo "Series complete. Monitor stopping." >> "$LOG_FILE"
    kill $ALERT_PID 2>/dev/null || true
    break
  fi
done
