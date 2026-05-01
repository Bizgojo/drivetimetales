#!/usr/bin/env python3
import json
import re
import sys
import time
import shutil
import subprocess
import urllib.request
import urllib.error
from pathlib import Path

HOME = Path.home()
JOB_DIR = HOME / ".drivetimetales_jobs"

STORIES_ROOT = HOME / "Projects" / "Audio Dramas" / "Stories"
BASE_URL = "http://localhost:3000"

def slugify(text: str) -> str:
    return re.sub(r'[^a-z0-9]+', '_', text.lower()).strip('_')

def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def write_status(job_id, payload):
    path = JOB_DIR / f"{job_id}.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

def resolve_job_path(arg: str) -> Path:
    candidate = Path(arg)
    if candidate.suffix == ".json" or candidate.parent != Path("."):
        return candidate.expanduser().resolve()
    return JOB_DIR / f"{arg}.json"

def write_pipeline_state(path: Path, payload: dict):
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

def post_json(url: str, payload: dict, timeout: int = 300):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

def download_file(url: str, dest: Path):
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=300) as r:
        dest.write_bytes(r.read())

def parse_header(script: str, key: str) -> str:
    m = re.search(rf"^{re.escape(key)}:[ \t]*([^\r\n]*)", script, re.MULTILINE)
    return m.group(1).strip() if m else ""

def duration_mins_for(path: Path) -> int:
    out = subprocess.check_output([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(path)
    ]).decode().strip()
    seconds = float(out)
    return max(1, round(seconds / 60))

def main():
    if len(sys.argv) < 2:
        print("job id required", file=sys.stderr)
        sys.exit(1)

    job_arg = sys.argv[1]
    job_path = resolve_job_path(job_arg)
    global JOB_DIR
    JOB_DIR = job_path.parent
    JOB_DIR.mkdir(parents=True, exist_ok=True)

    if not job_path.exists():
        print(f"job file not found: {job_path}", file=sys.stderr)
        sys.exit(1)

    job = json.loads(job_path.read_text(encoding="utf-8"))
    job_id = job.get("jobId") or job_path.stem
    title = job.get("title", "").strip()
    script = job.get("script", "")
    story_id = job.get("storyId", "").strip()
    queue_id = job.get("queueId", "").strip()

    if not title or not story_id or not script:
        write_status(job_id, {
            **job,
            "status": "failed",
            "phase": "validation",
            "error": "Missing title, storyId, or script in job payload",
            "updatedAt": now_iso(),
        })
        return

    author = parse_header(script, "AUTHOR")
    genre = parse_header(script, "GENRE")
    description = parse_header(script, "DESCRIPTION")
    series_name = parse_header(script, "SERIES")
    episode_number = parse_header(script, "EPISODE")
    episode_title = parse_header(script, "EPISODE_TITLE")
    series_total = parse_header(script, "SERIES_TOTAL_EPISODES")
    series_is_finale = parse_header(script, "SERIES_IS_FINALE")
    story_kind = "series_episode" if series_name else "standalone"

    slug = slugify(title)
    project_dir = STORIES_ROOT / f"[ASC] {slug}"
    script_dir = project_dir / "02_Script"
    meta_dir = project_dir / "00_Admin"
    out_dir = project_dir / "10_Final_Output"
    cover_dir = project_dir / "09_Covers"
    seg_dir = project_dir / "08_Headless_Segments"

    for d in [project_dir, script_dir, meta_dir, out_dir, cover_dir, seg_dir]:
        d.mkdir(parents=True, exist_ok=True)

    pipeline_state_path = HOME / ".dtt_headless_pipeline_state.json"

    write_status(job_id, {
        **job,
        "status": "running",
        "phase": "packaging",
        "message": "Creating headless production package",
        "projectDir": str(project_dir),
        "updatedAt": now_iso(),
    })

    (script_dir / "script_validated.txt").write_text(script, encoding="utf-8")
    (meta_dir / "job_meta.json").write_text(json.dumps({
        "jobId": job_id,
        "storyId": story_id,
        "queueId": queue_id,
        "title": title,
        "createdAt": job.get("createdAt"),
    }, indent=2), encoding="utf-8")

    write_pipeline_state(pipeline_state_path, {
        "jobId": job_id,
        "storyId": story_id,
        "queueId": queue_id,
        "story_title": title,
        "story_kind": story_kind,
        "series_name": series_name,
        "episode_number": episode_number,
        "episode_title": episode_title,
        "series_total_episodes": series_total,
        "series_is_finale": series_is_finale,
        "project_dir": str(project_dir),
        "script_path": str(script_dir / "script_validated.txt"),
        "final_mix": "",
        "cover_file": "",
        "status": "generating_voices",
        "updatedAt": now_iso(),
    })

    write_status(job_id, {
        **job,
        "status": "running",
        "phase": "voices",
        "message": f"Generating story audio segments ({story_kind})",
        "projectDir": str(project_dir),
        "storyKind": story_kind,
        "seriesName": series_name,
        "episodeNumber": episode_number,
        "updatedAt": now_iso(),
    })

    voices = post_json(f"{BASE_URL}/api/admin/generate-voices", {
        "storyId": story_id,
        "script": script,
    }, timeout=900)

    if not voices.get("success") and not voices.get("segments"):
        write_status(job_id, {
            **job,
            "status": "failed",
            "phase": "voices",
            "error": voices.get("error", "generate-voices failed"),
            "details": voices,
            "projectDir": str(project_dir),
            "updatedAt": now_iso(),
        })
        return

    final_mix = out_dir / f"{slug}_final.mp3"

    write_status(job_id, {
        **job,
        "status": "running",
        "phase": "mix",
        "message": f"Rendering ASC3 final mix ({story_kind})",
        "projectDir": str(project_dir),
        "storyKind": story_kind,
        "seriesName": series_name,
        "episodeNumber": episode_number,
        "updatedAt": now_iso(),
    })

    mix_result = post_json(f"{BASE_URL}/api/asc3/render-final-mix", {
        "storyId": story_id,
    }, timeout=900)

    if not mix_result.get("success") or not mix_result.get("finalAudioUrl"):
        write_status(job_id, {
            **job,
            "status": "failed",
            "phase": "mix",
            "error": mix_result.get("error", "render-final-mix failed"),
            "details": mix_result,
            "projectDir": str(project_dir),
            "updatedAt": now_iso(),
        })
        return

    download_file(mix_result["finalAudioUrl"], final_mix)

    write_pipeline_state(pipeline_state_path, {
        "jobId": job_id,
        "storyId": story_id,
        "queueId": queue_id,
        "story_title": title,
        "story_kind": story_kind,
        "series_name": series_name,
        "episode_number": episode_number,
        "episode_title": episode_title,
        "series_total_episodes": series_total,
        "series_is_finale": series_is_finale,
        "project_dir": str(project_dir),
        "script_path": str(script_dir / "script_validated.txt"),
        "final_mix": str(final_mix),
        "final_audio_url": mix_result["finalAudioUrl"],
        "story_body_url": mix_result.get("storyBodyUrl", ""),
        "cover_file": "",
        "status": "audio_ready_from_asc3_mix",
        "updatedAt": now_iso(),
    })

    write_status(job_id, {
        **job,
        "status": "running",
        "phase": "importing",
        "message": "Importing final audio into Supabase storage",
        "projectDir": str(project_dir),
        "finalMix": str(final_mix),
        "updatedAt": now_iso(),
    })

    imported = post_json(f"{BASE_URL}/api/admin/import-asc-output", {
        "title": title
    })

    audio_url = imported.get("audio_url", "")
    cover_url = imported.get("cover_url", "") or ""

    if not audio_url:
        write_status(job_id, {
            **job,
            "status": "failed",
            "phase": "importing",
            "error": "Import completed without audio_url",
            "details": imported,
            "projectDir": str(project_dir),
            "updatedAt": now_iso(),
        })
        return

    mins = duration_mins_for(final_mix)

    write_status(job_id, {
        **job,
        "status": "running",
        "phase": "publishing",
        "message": "Publishing story to live feed",
        "projectDir": str(project_dir),
        "audioUrl": audio_url,
        "updatedAt": now_iso(),
    })

    publish_payload = {
        "storyId": story_id,
        "title": title,
        "author": author,
        "genre": genre,
        "audio_url": audio_url,
        "cover_url": cover_url,
        "description": description,
        "duration_mins": mins,
        "is_free": True,
    }
    if queue_id:
        publish_payload["queueId"] = queue_id

    published = post_json(f"{BASE_URL}/api/admin/publish-story", publish_payload)

    write_pipeline_state(pipeline_state_path, {
        "jobId": job_id,
        "storyId": story_id,
        "queueId": queue_id,
        "story_title": title,
        "project_dir": str(project_dir),
        "script_path": str(script_dir / "script_validated.txt"),
        "final_mix": str(final_mix),
        "cover_file": "",
        "audio_url": audio_url,
        "cover_url": cover_url,
        "status": "published",
        "updatedAt": now_iso(),
    })

    write_status(job_id, {
        **job,
        "status": "complete",
        "phase": "published",
        "message": "Headless worker created final mix, imported audio, and published story",
        "projectDir": str(project_dir),
        "pipelineStatePath": str(pipeline_state_path),
        "finalMix": str(final_mix),
        "coverFile": "",
        "audioUrl": audio_url,
        "publishResult": published,
        "updatedAt": now_iso(),
    })

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        if len(sys.argv) >= 2:
            job_arg = sys.argv[1]
            job_path = resolve_job_path(job_arg)
            JOB_DIR = job_path.parent
            job = {}
            if job_path.exists():
                try:
                    job = json.loads(job_path.read_text(encoding="utf-8"))
                except Exception:
                    job = {}
            job_id = job.get("jobId") or job_path.stem
            write_status(job_id, {
                **job,
                "status": "failed",
                "phase": "exception",
                "error": str(e),
                "updatedAt": now_iso(),
            })
        raise
