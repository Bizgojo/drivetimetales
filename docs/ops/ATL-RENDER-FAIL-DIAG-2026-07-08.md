# ATL Render Failure Diagnosis - 2026-07-08

## Scope

Read-only diagnosis requested for two failed `production_jobs` rows:

- Job prefix `263aa7c9`, failed at `series_render_final_mix`, reported `music_shaped.mp3` ffmpeg failure after 5 attempts.
- Job prefix `230d218e`, failed at `series_render_final_mix`, reported `No announcement audio found (expected announcement_*.mp3)`.

No production rows, storage objects, or code were modified.

## Data Access Status

I attempted the requested Supabase JS diagnostic pattern using `.env.local` and `require("@supabase/supabase-js")`.

Result: the local Node network path failed before returning data with:

```text
ERROR: SecItemCopyMatching failed -50
```

I then attempted read-only Supabase REST queries with `curl` using the same `.env.local` service-role key. Public internet access worked, and DNS-over-HTTPS resolved the Supabase host to Cloudflare A records, but direct Supabase REST/storage access from this sandbox then failed with local DNS/connectivity errors:

```text
curl: (6) Could not resolve host: vmyhlfeouzslixtkmddy.supabase.co
curl: (7) Failed to connect to vmyhlfeouzslixtkmddy.supabase.co port 443
```

Because of that environment blocker, I could not read:

- `production_jobs.error_json.lastError` for `263aa7c9*`
- exact job timestamps for comparison against commit `80621e31`
- `series_id` from `230d218e*`
- Supabase Storage contents for the affected series/episode folders

The classifications below are therefore not final production classifications; they are code-path findings plus the exact data required to finalize them.

## Relevant Code Findings

Series rendering calls `runRenderFinalMix(storyId)` directly from `runSeriesRenderFinalMix` in `app/api/admin/production-jobs/run-next/route.ts`.

`runRenderFinalMix` is implemented in `app/api/asc3/render-final-mix/core.ts` and:

- Creates `/tmp/et-mix-*`.
- Downloads `background_music.mp3` into `/tmp/et-mix-*/music.mp3`.
- Shapes it into `/tmp/et-mix-*/music_shaped.mp3` with ffmpeg.
- Discovers Belle intro audio using:
  - `announcement.mp3`
  - `announcement_*.mp3`
  - legacy `intro.mp3`
  - legacy `intro_*.mp3`
  - split `intro_before_*` plus `intro_after_*`

Commit `80621e31` changed startup cleanup in `core.ts` from deleting all `/tmp/et-mix-*` directories to deleting only stale directories older than 20 minutes. Its commit timestamp is `Wed Jul 8 16:28:55 2026 -0400`.

## Job 1 - `263aa7c9*`

Status: not definitively classifiable from this sandbox.

Reported failure: ffmpeg failed while writing `music_shaped.mp3`, retried 5 times.

Most likely decision rule:

- Classify as transient if the full `error_json.lastError` contains ffmpeg/file errors consistent with a missing temp input/output path, such as `No such file or directory`, and the failed attempts happened before the deploy containing `80621e31`.
- Classify as structural if the full stderr points to invalid/corrupt `background_music.mp3`, unsupported filter syntax, invalid stream metadata, or another deterministic ffmpeg filter/input failure that repeats independent of `/tmp` cleanup.

Current code evidence favors the known transient class only if the job ran pre-fix. The referenced cleanup bug specifically explains random mid-render disappearance of `/tmp/et-mix-*` contents during concurrent renders.

Recommended action:

- If job `updated_at`/failure time is before `2026-07-08 16:28:55 -0400` deploy and stderr mentions missing `/tmp/et-mix-*` files: requeue as-is.
- If stderr indicates corrupt/invalid `background_music.mp3`: regenerate music for the affected story, then requeue render.
- If stderr indicates ffmpeg filter syntax: propose branch `fix/render-music-shape-ffmpeg-compat`.

## Job 2 - `230d218e*`

Status: not definitively classifiable from this sandbox.

Reported failure: `No announcement audio found (expected announcement_*.mp3)`.

Render code no longer requires only `announcement_*.mp3`; it accepts `announcement.mp3`, `announcement_*.mp3`, `intro.mp3`, `intro_*.mp3`, or split `intro_before_*` plus `intro_after_*`.

Most likely decision rule:

- If the affected story folder contains no accepted intro/announcement files: classify as structural asset-generation failure; `series_generate_belle_assets` did not produce or persist the intro, or the file was deleted.
- If the folder contains an accepted intro file but render still failed: classify as structural code/storage-list consistency defect.
- If the folder contains Belle files under a different naming scheme not accepted by render: classify as structural naming-contract defect.

Recommended action:

- If no intro/announcement asset exists: regenerate Belle assets for the affected episode, then requeue render.
- If accepted intro assets exist in storage: propose branch `fix/render-belle-asset-discovery-diagnostics` to log the exact storage inventory and reconcile DB/storage discovery.
- If only non-matching Belle names exist: propose branch `fix/render-accept-series-belle-asset-names`.

## Proposed Fix Branch

No code defect is confirmed without the production row and storage inventory.

Conditional branches only:

- `fix/render-music-shape-ffmpeg-compat` if Job 1 stderr proves deterministic ffmpeg filter/input failure.
- `fix/render-belle-asset-discovery-diagnostics` if Job 2 storage contains accepted Belle files but render did not see them.
- `fix/render-accept-series-belle-asset-names` if Job 2 storage contains Belle files under a legitimate but currently unsupported naming contract.

## Exact Follow-up Query Needed

Run from an environment that can reach Supabase:

```js
const fs = require("fs")
const { createClient } = require("@supabase/supabase-js")

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) continue
  const i = trimmed.indexOf("=")
  if (i < 0) continue
  process.env[trimmed.slice(0, i)] ||= trimmed.slice(i + 1).replace(/^['"]|['"]$/g, "")
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

async function main() {
  for (const prefix of ["263aa7c9", "230d218e"]) {
    const { data, error } = await supabase
      .from("production_jobs")
      .select("*")
      .like("id", `${prefix}%`)
      .limit(5)
    if (error) throw error
    console.log(prefix, JSON.stringify(data, null, 2))
  }

  // After reading series_id/story_id for 230d218e*, list each affected story folder:
  // const { data, error } = await supabase.storage.from("audio").list(`asc3/${storyId}`, { limit: 500 })
  // console.log(data.map(f => ({ name: f.name, size: f.metadata?.size })))
}

main().catch(err => { console.error(err); process.exit(1) })
```
