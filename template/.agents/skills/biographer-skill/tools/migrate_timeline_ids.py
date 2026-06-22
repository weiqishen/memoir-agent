#!/usr/bin/env python3
"""Backfill stable timeline entry ids from related raw-note filenames."""

from __future__ import annotations

import argparse
import json
import os
from typing import Any

import yaml


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "../../../../"))
MEMOIRS_DIR = os.path.join(WORKSPACE_DIR, "memoirs")
PERIODS_DIR = os.path.join(MEMOIRS_DIR, "periods")
REPORT_FILENAME = ".timeline_id_migration_report.json"


def list_period_dirs() -> list[str]:
    if not os.path.isdir(PERIODS_DIR):
        return []
    return sorted(
        name
        for name in os.listdir(PERIODS_DIR)
        if os.path.isdir(os.path.join(PERIODS_DIR, name))
    )


def load_timeline(path: str) -> dict[str, Any]:
    if not os.path.exists(path):
        return {"period": "", "entries": []}
    with open(path, "r", encoding="utf-8") as file:
        data = yaml.safe_load(file) or {}
    if not isinstance(data, dict):
        return {"period": "", "entries": []}
    entries = data.get("entries", [])
    if not isinstance(entries, list):
        data["entries"] = []
    return data


def raw_note_id(entry: dict[str, Any]) -> str:
    related_files = entry.get("related_files", [])
    if not isinstance(related_files, list) or not related_files:
        return ""
    first_file = str(related_files[0]).replace("\\", "/")
    basename = first_file.rsplit("/", 1)[-1]
    if not basename.endswith(".md"):
        return ""
    return basename[:-3].strip()


def event_ref(period: str, entry: dict[str, Any]) -> str:
    entry_id = str(entry.get("id", "")).strip()
    if entry_id:
        return f"{period}|{entry_id}"
    date_text = str(entry.get("date", "")).strip()
    event_text = str(entry.get("event", "")).strip()
    return f"{period}|{date_text}|{event_text}"


def make_report() -> dict[str, list[dict[str, str]]]:
    return {
        "migrated": [],
        "already_has_id": [],
        "duplicates": [],
        "manual_review": [],
    }


def migrate_timeline_ids(write: bool = False) -> dict[str, list[dict[str, str]]]:
    """Backfill missing timeline ids and optionally write changed timelines."""
    report = make_report()

    for period_dir_name in list_period_dirs():
        period_dir = os.path.join(PERIODS_DIR, period_dir_name)
        timeline_path = os.path.join(period_dir, "timeline.yaml")
        timeline = load_timeline(timeline_path)
        period = str(timeline.get("period") or period_dir_name)
        entries = [entry for entry in timeline.get("entries", []) if isinstance(entry, dict)]

        used_ids = {
            str(entry.get("id", "")).strip()
            for entry in entries
            if str(entry.get("id", "")).strip()
        }
        changed = False

        for entry in entries:
            existing_id = str(entry.get("id", "")).strip()
            if existing_id:
                report["already_has_id"].append(
                    {
                        "period": period,
                        "id": existing_id,
                        "event": str(entry.get("event", "")),
                        "ref": event_ref(period, entry),
                    }
                )
                continue

            candidate_id = raw_note_id(entry)
            old_ref = event_ref(period, entry)
            if not candidate_id:
                report["manual_review"].append(
                    {
                        "period": period,
                        "event": str(entry.get("event", "")),
                        "old_ref": old_ref,
                        "reason": "missing related_files raw note",
                    }
                )
                continue

            if candidate_id in used_ids:
                report["duplicates"].append(
                    {
                        "period": period,
                        "event": str(entry.get("event", "")),
                        "old_ref": old_ref,
                        "candidate_id": candidate_id,
                    }
                )
                continue

            report["migrated"].append(
                {
                    "period": period,
                    "id": candidate_id,
                    "event": str(entry.get("event", "")),
                    "old_ref": old_ref,
                    "new_ref": f"{period}|{candidate_id}",
                }
            )
            used_ids.add(candidate_id)
            if write:
                entry["id"] = candidate_id
                changed = True

        if write and changed:
            with open(timeline_path, "w", encoding="utf-8") as file:
                yaml.safe_dump(timeline, file, allow_unicode=True, sort_keys=False)

    if write:
        os.makedirs(MEMOIRS_DIR, exist_ok=True)
        report_path = os.path.join(MEMOIRS_DIR, REPORT_FILENAME)
        with open(report_path, "w", encoding="utf-8") as file:
            json.dump(report, file, ensure_ascii=False, indent=2)

    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill stable timeline ids from raw-note filenames.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="Print the migration report without writing timelines")
    mode.add_argument("--write", action="store_true", help="Write ids into timeline.yaml and save the report")
    args = parser.parse_args()

    report = migrate_timeline_ids(write=args.write)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
