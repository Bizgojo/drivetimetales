# Deployment Runbook — ATL-OPS-001

## Post-Deployment Verification for Pipeline Changes

After any code push that changes pipeline behavior (audio generation, validation, rendering, or packaging), verify the deployment before re-queuing dependent jobs.

### Sequence

#### 1. Verify GitHub Commit
```bash
git log origin/main --oneline -1
```
Confirm the commit that contains your pipeline change is at the top of the log.

**Example output:**
```
a1b2c3d fix(ops): ATL-OPS-001 — pipeline observability
```

#### 2. Wait for Vercel Build (3 minutes)
After pushing to GitHub, wait approximately **3 minutes** for Vercel to automatically build and deploy the new code to production.

Monitor the deployment:
- Check [Vercel Dashboard](https://vercel.com/endless-tales/drivetimetales) for build status
- Look for green checkmark next to the latest commit

#### 3. Confirm Build by Testing a Known Endpoint
Hit a stable endpoint to confirm the new build is live. Use one of:

**Option A: Production Console Health Check**
```bash
curl -H "Authorization: Bearer <YOUR_ADMIN_TOKEN>" \
  https://drivetimetales.com/api/admin/production-console
```
Expected: HTTP 200, valid JSON response with `success: true`

**Option B: Production Jobs Health Check**
```bash
curl -H "Authorization: Bearer <YOUR_ADMIN_TOKEN>" \
  https://drivetimetales.com/api/admin/production-jobs/run-next
```
Expected: HTTP 405 (POST method required for this endpoint) or valid production job response

#### 4. Re-Queue Waiting Jobs
Only after confirming the new build is live, re-queue any jobs that depend on this fix:

```bash
# Queue a specific job (if you have a known waiting job ID)
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_ADMIN_TOKEN>" \
  https://drivetimetales.com/api/admin/production-jobs/run-next \
  -d '{"jobId":"<JOB_ID>"}'

# Or pick the next queued job
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_ADMIN_TOKEN>" \
  https://drivetimetales.com/api/admin/production-jobs/run-next
```

---

## When to Use This Runbook

Use this sequence when:
- ✅ Pushing code that changes ElevenLabs voice generation logic
- ✅ Pushing code that affects silence buffer thresholds (audio validation)
- ✅ Pushing code that changes final mix rendering
- ✅ Pushing code that affects story package completion or validation
- ✅ Pushing code that changes narrator assignment validation
- ✅ Pushing code that affects any production pipeline step

Do **not** use this sequence for:
- ❌ Documentation-only changes
- ❌ UI changes that don't affect the backend pipeline
- ❌ Changes to non-production endpoints
- ❌ Changes to monitoring or logging

---

## Troubleshooting

### Build Takes Longer Than 3 Minutes
- Check the [Vercel Dashboard](https://vercel.com/endless-tales/drivetimetales) for build logs
- If the build is still running, wait an additional 2–3 minutes
- If the build failed, check the error log and re-push a fix

### Health Check Returns HTTP 401/403
- Verify your `<YOUR_ADMIN_TOKEN>` is valid (Supabase admin JWT)
- Check that your IP is not blocked

### Health Check Returns HTTP 500 or JSON Error
- The new build has deployed but encountered a runtime error
- Check CloudWatch or Vercel logs for details
- Do **not** re-queue jobs; the pipeline is not safe
- Rollback the commit or fix the error and re-deploy

### Job Re-Queue Fails
- Ensure the job exists and is in `status=queued` or `status=running`
- If the job is already `status=failed`, investigate the failure first
- Check production console for error details

---

## Rationale

The three-minute wait + verification step prevents silent failures:

1. **Code is committed** → GitHub
2. **Vercel auto-builds** → CloudFlare edge + Vercel serverless
3. **Verification confirms** → New code is live
4. **Re-queue only then** → Jobs run with the fixed code

Without verification, a job might re-queue and hit stale code, then fail silently without surfacing why.

---

## Reference

- **ATL-OPS-001:** Pipeline Observability & Failure Surface — https://github.com/endless-tales/drivetimetales/issues/XXX
- **Vercel Dashboard:** https://vercel.com/endless-tales/drivetimetales
- **Production Console:** https://drivetimetales.com/admin/production/console
