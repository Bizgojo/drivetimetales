#!/usr/bin/env python3
import argparse
import json
import sys
import time
import urllib.request
import urllib.error

BASE = "http://localhost:3000"

def jget(url: str):
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())

def jpost(url: str, payload: dict):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())

def status(story_id: str):
    try:
        data = jget(f"{BASE}/api/v2/load-story?storyId={story_id}")
        print(json.dumps(data, indent=2)[:12000])
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"HTTP {e.code}")
        print(body)
        sys.exit(1)

def run_production(story_id: str):
    try:
        data = jget(f"{BASE}/api/v2/load-story?storyId={story_id}")
    except urllib.error.HTTPError as e:
        print(f"Could not load story {story_id}: HTTP {e.code}")
        print(e.read().decode())
        sys.exit(1)

    story = data.get("story") or data
    title = story.get("title") or ""
    script = story.get("script") or ""
    if not title:
        print("Missing title on story")
        sys.exit(1)
    if not script:
        print("Missing script on story")
        sys.exit(1)

    try:
        out = jpost(f"{BASE}/api/admin/run-asc-production", {
            "storyId": story_id,
            "title": title,
            "queueId": "",
            "script": script,
        })
        print(json.dumps(out, indent=2))
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"HTTP {e.code}")
        print(body)
        sys.exit(1)

def job_status(job_id: str):
    try:
        data = jget(f"{BASE}/api/admin/asc-production-status?jobId={job_id}")
        print(json.dumps(data, indent=2))
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"HTTP {e.code}")
        print(body)
        sys.exit(1)

def poll(job_id: str, seconds: int):
    while True:
        try:
            data = jget(f"{BASE}/api/admin/asc-production-status?jobId={job_id}")
            job = data.get("job", {})
            print(json.dumps(job, indent=2))
            status = job.get("status")
            if status in ("failed", "ready_for_headless_port", "complete", "completed"):
                return
        except Exception as e:
            print(f"poll error: {e}")
        time.sleep(seconds)

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    p1 = sub.add_parser("status")
    p1.add_argument("--story-id", required=True)

    p2 = sub.add_parser("run")
    p2.add_argument("--story-id", required=True)

    p3 = sub.add_parser("job")
    p3.add_argument("--job-id", required=True)

    p4 = sub.add_parser("poll")
    p4.add_argument("--job-id", required=True)
    p4.add_argument("--seconds", type=int, default=3)

    args = ap.parse_args()

    if args.cmd == "status":
        status(args.story_id)
    elif args.cmd == "run":
        run_production(args.story_id)
    elif args.cmd == "job":
        job_status(args.job_id)
    elif args.cmd == "poll":
        poll(args.job_id, args.seconds)

if __name__ == "__main__":
    main()
