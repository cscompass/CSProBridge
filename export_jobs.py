#!/usr/bin/env python3
"""Export public job listings from Opportunity Compass for CSProBridge."""

import json
import os
import sqlite3
import tempfile
from datetime import date, datetime, time, timedelta
from pathlib import Path


DATABASE_PATH = Path(r"D:\Apps\opportunity-compass\data\opportunity_compass.db")
OUTPUT_PATH = Path(__file__).resolve().parent / "data" / "jobs.json"
JOB_FIELDS = (
    "title",
    "company",
    "source",
    "job_url",
    "posted_date",
    "location",
    "work_mode",
    "employment_type",
    "experience",
    "salary",
    "department",
    "industry",
)


def parse_posted_date(value):
    """Parse the ISO 8601 date/time strings used by the source database."""
    if value is None or not str(value).strip():
        return None

    text = str(value).strip()
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed_date = date.fromisoformat(text)
        except ValueError as error:
            raise ValueError(f"Unsupported posted_date value: {value!r}") from error
        parsed = datetime.combine(parsed_date, time.min)

    return parsed.astimezone()


def export_jobs():
    # as_uri() correctly escapes path characters while SQLite keeps the DB read-only.
    database_uri = DATABASE_PATH.as_uri() + "?mode=ro"
    with sqlite3.connect(database_uri, uri=True) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            "SELECT " + ", ".join(f'"{field}"' for field in JOB_FIELDS) + " FROM jobs"
        ).fetchall()

    now = datetime.now().astimezone()
    first_included_date = now.date() - timedelta(days=9)
    window_start = datetime.combine(first_included_date, time.min, tzinfo=now.tzinfo)

    dated_rows = []
    for row in rows:
        job = {field: row[field] for field in JOB_FIELDS}
        posted = parse_posted_date(job["posted_date"])
        dated_rows.append((posted, job))

    recent = [
        (posted, job)
        for posted, job in dated_rows
        if posted is not None and posted >= window_start
    ]

    if recent:
        selected = recent
        selection_mode = "last_10_days"
    elif dated_rows:
        selected = sorted(
            dated_rows,
            key=lambda item: item[0].timestamp() if item[0] is not None else float("-inf"),
            reverse=True,
        )[:300]
        selection_mode = "latest_300_fallback"
    else:
        selected = []
        selection_mode = "no_jobs"

    # Ensure stable, newest-first ordering, with undated rows at the end.
    selected.sort(
        key=lambda item: item[0].timestamp() if item[0] is not None else float("-inf"),
        reverse=True,
    )
    jobs = [job for _, job in selected]
    payload = {
        "generated_at": datetime.now().astimezone().isoformat(),
        "selection_mode": selection_mode,
        "job_count": len(jobs),
        "jobs": jobs,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=OUTPUT_PATH.parent,
            prefix="jobs.",
            suffix=".tmp",
            delete=False,
        ) as temporary_file:
            temp_path = Path(temporary_file.name)
            json.dump(payload, temporary_file, ensure_ascii=False, indent=2)
            temporary_file.write("\n")
            temporary_file.flush()
            os.fsync(temporary_file.fileno())

        with temp_path.open("r", encoding="utf-8") as temporary_file:
            validated = json.load(temporary_file)
        if (
            not isinstance(validated, dict)
            or set(("generated_at", "selection_mode", "job_count", "jobs"))
            - validated.keys()
            or validated["job_count"] != len(validated["jobs"])
            or validated["selection_mode"] not in {
                "last_10_days",
                "latest_300_fallback",
                "no_jobs",
            }
        ):
            raise ValueError("Generated jobs JSON failed validation")

        os.replace(temp_path, OUTPUT_PATH)
        temp_path = None
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)

    return selection_mode, len(jobs)


def main():
    mode, count = export_jobs()
    print(f"Source database: {DATABASE_PATH}")
    print(f"Selection mode: {mode}")
    print(f"Jobs exported: {count}")
    print(f"Output: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
