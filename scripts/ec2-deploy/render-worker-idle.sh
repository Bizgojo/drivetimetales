#!/usr/bin/env bash
# RENDER-BUSY-CHECK-001 (Marc, Nov 13, 2026): is the render worker idle, so it can be restarted?
# The old check read journalctl, but the unit writes its output to a file
# (StandardOutput=append:...), so the journal was empty and the worker always looked "busy"
# — deploys never restarted it and it kept running old code. Now the check reads the worker's
# own log file, named in its unit. Busy = its last line says it picked up a job or is calling
# the render API (no finish line yet). Exit 0 = idle, 1 = busy, 2 = cannot tell (treated as busy).
UNIT="${1:-endlesstales-renderworker.service}"
LOGFILE="$(systemctl cat "$UNIT" 2>/dev/null | sed -n -E 's#^StandardOutput=(append|file):##p' | tail -1)"
if [ -z "$LOGFILE" ] || ! LAST="$(sudo tail -n 20 "$LOGFILE" 2>/dev/null | grep -v '^[[:space:]]*$' | tail -1)" || [ -z "$LAST" ]; then
  echo "cannot read the render worker log (${LOGFILE:-no StandardOutput file in $UNIT})"
  exit 2
fi
if printf '%s' "$LAST" | grep -qE 'Picked up job|Calling render API'; then
  echo "busy: $LAST"
  exit 1
fi
echo "idle: $LAST"
exit 0
