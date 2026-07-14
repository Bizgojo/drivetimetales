Added a /tmp free-space guard before final-mix rendering starts.
Kept the existing 20-minute age-based et-mix-* cleanup to avoid concurrent-render races.
When /tmp has under 150 MB free, the renderer now removes only et-mix-* dirs older than 5 minutes.
If /tmp is still under 150 MB, rendering defers with TMP_SPACE_LOW instead of failing mid-ffmpeg.
Confirmed the renderer still removes its own et-mix-* directory in finally on success or failure.
