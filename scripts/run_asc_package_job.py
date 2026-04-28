#!/usr/bin/env python3
import json
import subprocess
import sys
import time
from pathlib import Path

HOME = Path.home()
JOB_DIR = HOME / ".drivetimetales_jobs"
JOB_DIR.mkdir(parents=True, exist_ok=True)


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict):
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_package_state(package_path: Path, package: dict):
    package["updatedAt"] = now_iso()
    write_json(package_path, package)


def terminal_status(job: dict) -> bool:
    return job.get("status") in {"complete", "failed"}


def main():
    if len(sys.argv) < 2:
        print("package job id required", file=sys.stderr)
        sys.exit(1)

    package_job_id = sys.argv[1]
    package_path = JOB_DIR / f"{package_job_id}.json"
    if not package_path.exists():
        print(f"package job file not found: {package_path}", file=sys.stderr)
        sys.exit(1)

    package = read_json(package_path)
    episodes = package.get("episodes") or []
    jobs = package.get("jobs") or []

    package["status"] = "running"
    package["phase"] = "starting"
    package["message"] = "Starting sequential package ASC production"
    write_package_state(package_path, package)

    worker = Path.cwd() / "scripts" / "run_asc_job.py"

    for index, episode in enumerate(episodes):
        job_id = episode["jobId"]
        episode_number = episode.get("packageEpisodeNumber") or index + 1
        job_path = JOB_DIR / f"{job_id}.json"
        now = now_iso()

        episode_payload = {
            **episode,
            "jobId": job_id,
            "status": "queued",
            "phase": "queued",
            "createdAt": now,
            "updatedAt": now,
        }
        write_json(job_path, episode_payload)

        package["status"] = "running"
        package["phase"] = "episode_running"
        package["currentEpisode"] = episode_number
        package["currentJobId"] = job_id
        package["message"] = f"Running episode {episode_number} of {len(episodes)}"
        jobs[index] = {
            **jobs[index],
            "status": "running",
            "phase": "starting",
            "updatedAt": now_iso(),
        }
        package["jobs"] = jobs
        write_package_state(package_path, package)

        result = subprocess.run(["python3", str(worker), job_id])

        final_job = read_json(job_path) if job_path.exists() else {
            "jobId": job_id,
            "status": "failed",
            "phase": "missing_job_state",
            "error": "Episode job state file missing after worker exit",
            "updatedAt": now_iso(),
        }

        jobs[index] = {
            **jobs[index],
            **final_job,
            "episodeNumber": episode_number,
        }
        package["jobs"] = jobs

        if result.returncode != 0 and final_job.get("status") != "failed":
            final_job["status"] = "failed"
            final_job["phase"] = "worker_exit"
            final_job["error"] = f"run_asc_job.py exited with code {result.returncode}"
            final_job["updatedAt"] = now_iso()
            write_json(job_path, final_job)
            jobs[index] = {
                **jobs[index],
                **final_job,
                "episodeNumber": episode_number,
            }
            package["jobs"] = jobs

        if not terminal_status(final_job) or final_job.get("status") != "complete":
            package["status"] = "failed"
            package["phase"] = "episode_failed"
            package["failedEpisode"] = episode_number
            package["failedJobId"] = job_id
            package["error"] = final_job.get("error") or f"Episode {episode_number} did not complete"
            package["message"] = f"Stopped after episode {episode_number} failed"
            write_package_state(package_path, package)
            return

        package["phase"] = "episode_complete"
        package["message"] = f"Episode {episode_number} complete"
        write_package_state(package_path, package)

    package["status"] = "complete"
    package["phase"] = "complete"
    package["message"] = "Sequential package ASC production complete"
    package.pop("currentEpisode", None)
    package.pop("currentJobId", None)
    write_package_state(package_path, package)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        if len(sys.argv) >= 2:
            package_path = JOB_DIR / f"{sys.argv[1]}.json"
            package = read_json(package_path) if package_path.exists() else {"packageJobId": sys.argv[1]}
            package["status"] = "failed"
            package["phase"] = "exception"
            package["error"] = str(exc)
            write_package_state(package_path, package)
        raise
