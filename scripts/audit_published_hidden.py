#!/usr/bin/env python3
"""Historical published-but-hidden audit. Strictly offline, never writes to a database.

Usage: python3 scripts/audit_published_hidden.py snapshot.json > audit.json
Snapshot: JSON array of full story rows (including series siblings) produced by an
authorized read-only export. Do NOT put production snapshots or secrets in git.
"""
import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict

FIELDS = ("id", "status", "workflow_state", "is_hidden", "review_status",
          "published_on", "series_id", "episode_number", "series_number",
          "audio_url", "story_audio_url", "cover_url", "description",
          "duration_mins", "author", "genre", "title", "updated_at", "version")

def digest(row):
    return hashlib.sha256(json.dumps(row, sort_keys=True, default=str,
                                    separators=(",", ":")).encode()).hexdigest()

def classify(rows):
    ids = [r.get("id") for r in rows]
    if any(not x for x in ids) or len(ids) != len(set(ids)):
        raise ValueError("Snapshot has missing or duplicate story IDs; refusing audit")
    by_series = defaultdict(list)
    for r in rows:
        if r.get("series_id"):
            by_series[str(r["series_id"])].append(r)
    affected = [r for r in rows if r.get("workflow_state") == "published"
                and r.get("is_hidden") is True]
    report = []
    for row in sorted(affected, key=lambda x: str(x["id"])):
        status = row.get("status")
        reasons = []
        if status == "pending" or not row.get("audio_url"):
            category = "unfinished_no_audio"
            reasons.append("missing final audio or pending status")
            action = "investigate production job and resume only after separate approval"
        elif status == "validator_passed":
            category = "audio_proof_unverified"
            reasons.append("validator_passed is not completed audio or release proof")
            action = "verify renders and job artifacts; do not regenerate good audio"
        elif status == "published":
            category = "published_hidden_inconsistent"
            action = "audit publication history, hold, Belle, freshness, series and listener visibility"
        elif status == "audio_ready":
            category = "audio_ready_gate_audit"
            action = "verify all current publish gates and series before considering publication"
        else:
            category = "unknown_state"
            action = "manual state investigation"
        if row.get("review_status") != "approved":
            reasons.append("approval unverified: review_status not approved")
        if row.get("series_id"):
            siblings = by_series[str(row["series_id"])]
            ranks = [s.get("episode_number") or s.get("series_number") for s in siblings]
            if not ranks or any(not isinstance(n, int) or n < 1 for n in ranks):
                reasons.append("series numbering incomplete or invalid in snapshot")
            elif sorted(ranks) != list(range(1, len(ranks)+1)):
                reasons.append("series episode gaps or duplicates")
            # A snapshot limited to affected rows cannot prove series completeness.
            reasons.append("series completeness and all sibling publish gates require independent verification")
        for field in ("title", "author", "genre", "cover_url", "description"):
            if not row.get(field):
                reasons.append("missing " + field)
        if not isinstance(row.get("duration_mins"), (int, float)) or row["duration_mins"] <= 0:
            reasons.append("missing valid duration_mins")
        if row.get("published_on") and status == "pending":
            reasons.append("historical published_on conflicts with pending status")
        reasons.append("publication hold, Belle, render freshness, job QC and full current gate proofs not supplied")
        before = {f: row.get(f) for f in FIELDS}
        report.append({
            "id": row["id"], "title": row.get("title"),
            "series_id": row.get("series_id"), "episode_number": row.get("episode_number"),
            "category": category, "proposed_action": action,
            "eligible_to_publish": False, "blockers": sorted(set(reasons)),
            "before": before, "before_sha256": digest(before),
            "after": before.copy(), "write_plan": [],
            "rollback": before.copy(), "approval_required": True
        })
    return {"mode": "OFFLINE_READ_ONLY_DRY_RUN", "writes_performed": 0,
            "records_scanned": len(rows), "affected_count": len(report),
            "counts": dict(sorted(Counter(r["category"] for r in report).items())),
            "records": report,
            "note": "No eligibility is certified. Current server publication gates must be evaluated separately. An approved future repair must re-read and compare before_sha256 and version before changing any row."}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", help="Local JSON array containing story rows")
    args = parser.parse_args()
    with open(args.snapshot, encoding="utf8") as source:
        rows = json.load(source)
    if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
        parser.error("Snapshot must be a JSON array of story objects")
    json.dump(classify(rows), sys.stdout, indent=2, default=str)
    print()

if __name__ == "__main__":
    main()
