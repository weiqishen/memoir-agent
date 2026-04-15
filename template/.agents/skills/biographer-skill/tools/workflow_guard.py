#!/usr/bin/env python3
"""Workflow guard that blocks skipped memoir steps unless --force is used."""

import argparse
import datetime
import json
import os
import sys
from typing import Any

import yaml

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "../../../../"))
MEMOIRS_DIR = os.path.join(WORKSPACE_DIR, "memoirs")
PERIODS_DIR = os.path.join(MEMOIRS_DIR, "periods")
DRAFT_BUFFER_PATH = os.path.join(MEMOIRS_DIR, ".draft_buffer.md")
AUDIT_LOG_PATH = os.path.join(MEMOIRS_DIR, ".workflow_guard.log")


def list_period_dirs() -> list[str]:
    if not os.path.isdir(PERIODS_DIR):
        return []
    return sorted(
        name
        for name in os.listdir(PERIODS_DIR)
        if os.path.isdir(os.path.join(PERIODS_DIR, name))
    )


def load_yaml(path: str) -> dict[str, Any]:
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as file:
        data = yaml.safe_load(file) or {}
    if isinstance(data, dict):
        return data
    return {}


def read_timeline_entries(period: str) -> list[dict[str, Any]]:
    timeline_path = os.path.join(PERIODS_DIR, period, "timeline.yaml")
    timeline = load_yaml(timeline_path)
    entries = timeline.get("entries", [])
    if isinstance(entries, list):
        return [entry for entry in entries if isinstance(entry, dict)]
    return []


def list_markdown_files(path: str) -> list[str]:
    if not os.path.isdir(path):
        return []
    return sorted(name for name in os.listdir(path) if name.endswith(".md"))


def is_draft_pending() -> bool:
    if not os.path.exists(DRAFT_BUFFER_PATH):
        return False
    with open(DRAFT_BUFFER_PATH, "r", encoding="utf-8") as file:
        return bool(file.read().strip())


def collect_unsynthesized_entries() -> list[dict[str, str]]:
    missing: list[dict[str, str]] = []

    for period in list_period_dirs():
        entries = read_timeline_entries(period)
        chapter_dir = os.path.join(PERIODS_DIR, period, "chapters")
        chapter_files = list_markdown_files(chapter_dir)

        for entry in entries:
            date_text = str(entry.get("date", "")).strip()
            event_text = str(entry.get("event", "")).strip()
            if not date_text:
                continue
            if any(filename.startswith(date_text) for filename in chapter_files):
                continue
            missing.append(
                {
                    "period": period,
                    "date": date_text,
                    "event": event_text or "(untitled event)",
                }
            )

    return missing


def validate_commit() -> list[str]:
    reasons: list[str] = []
    if not is_draft_pending():
        reasons.append(
            "No pending draft found at memoirs/.draft_buffer.md. "
            "Use /listen first or continue with /recall."
        )
    return reasons


def validate_memoir_build(period: str | None) -> list[str]:
    reasons: list[str] = []
    if is_draft_pending():
        reasons.append(
            "Draft buffer is not committed yet. Run /commit before /memoir-build."
        )

    target_periods: list[str]
    if period:
        period_dir = os.path.join(PERIODS_DIR, period)
        if not os.path.isdir(period_dir):
            reasons.append(f'Period "{period}" does not exist under memoirs/periods/.')
            return reasons
        target_periods = [period]
    else:
        target_periods = list_period_dirs()
        if not target_periods:
            reasons.append("No period folders found under memoirs/periods/.")
            return reasons

    has_synthesizable_data = False
    for target in target_periods:
        entries = read_timeline_entries(target)
        raw_notes_dir = os.path.join(PERIODS_DIR, target, "raw_notes")
        raw_notes = list_markdown_files(raw_notes_dir)
        if entries and raw_notes:
            has_synthesizable_data = True
            break

    if not has_synthesizable_data:
        reasons.append(
            "No synthesizable data found: timeline entries and raw_notes are both required."
        )

    return reasons


def validate_build() -> list[str]:
    reasons: list[str] = []
    if is_draft_pending():
        reasons.append("Draft buffer is not committed yet. Run /commit before /build.")

    missing_entries = collect_unsynthesized_entries()
    if missing_entries:
        preview = ", ".join(
            f'{item["period"]}:{item["date"]}:{item["event"]}'
            for item in missing_entries[:5]
        )
        suffix = " ..." if len(missing_entries) > 5 else ""
        reasons.append(
            "Build blocked: unsynthesized timeline entries detected. "
            f"Run /memoir-build first. Missing -> {preview}{suffix}"
        )

    return reasons


def write_audit_log(action: str, period: str | None, reasons: list[str]) -> None:
    os.makedirs(MEMOIRS_DIR, exist_ok=True)
    record = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "action": action,
        "period": period or "",
        "forced": True,
        "reasons": reasons,
    }
    with open(AUDIT_LOG_PATH, "a", encoding="utf-8") as file:
        file.write(json.dumps(record, ensure_ascii=False) + "\n")


def evaluate(action: str, period: str | None) -> list[str]:
    if action == "commit":
        return validate_commit()
    if action == "memoir-build":
        return validate_memoir_build(period)
    if action == "build":
        return validate_build()
    return [f'Unsupported action "{action}".']


def main() -> int:
    parser = argparse.ArgumentParser(description="Memoir workflow guard")
    parser.add_argument("--action", required=True, choices=["commit", "memoir-build", "build"])
    parser.add_argument("--period", default=None, help="Optional period for memoir-build checks")
    parser.add_argument("--force", action="store_true", help="Bypass guard checks and continue")
    args = parser.parse_args()

    reasons = evaluate(args.action, args.period)

    if reasons and args.force:
        write_audit_log(args.action, args.period, reasons)
        print(f"[workflow-guard] forced bypass for action={args.action}")
        for reason in reasons:
            print(f"  - {reason}")
        return 0

    if reasons:
        print(f"[workflow-guard] blocked action={args.action}")
        for reason in reasons:
            print(f"  - {reason}")
        return 2

    print(f"[workflow-guard] passed action={args.action}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
