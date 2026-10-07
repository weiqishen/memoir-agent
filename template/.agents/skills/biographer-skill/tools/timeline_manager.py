#!/usr/bin/env python3
import os
import argparse
import datetime
import hashlib
import json
import shutil
import re
import mimetypes
import sys
import tempfile
import yaml
from urllib.parse import urlparse
from urllib.request import urlopen

# Base path derivation
CURRENT_DIR   = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from time_spec import parse_time_spec

WORKSPACE_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "../../../../"))
MEMOIRS_DIR   = os.path.join(WORKSPACE_DIR, "memoirs")
PERIODS_DIR   = os.path.join(MEMOIRS_DIR, "periods")  # all period folders live here


def sanitize_date_for_filename(date):
    """Convert fuzzy date text into a stable filesystem-safe prefix."""
    parsed = parse_time_spec(date)
    date_text = parsed.value if parsed.status == "resolved" else str(date or "")
    if "-Q" in date_text:
        date_text = date_text.replace("-Q", "_Q")
    return re.sub(r"[^A-Za-z0-9._-]+", "_", date_text).strip("_") or "undated"


def build_asset_filename(date, source, headers=None, content_hash="", hash_length=8):
    """Build a stable asset filename from a local path or remote URL."""
    parsed = urlparse(source)
    source_name = os.path.basename(parsed.path if parsed.scheme else source)
    if not source_name:
        source_name = "asset"

    stem, ext = os.path.splitext(source_name)
    if not ext and headers is not None:
        content_type = headers.get_content_type()
        guessed_ext = mimetypes.guess_extension(content_type)
        if guessed_ext:
            ext = guessed_ext

    if not ext:
        ext = ".bin"

    suffix = f"_{content_hash[:hash_length]}" if content_hash else ""
    return f"{sanitize_date_for_filename(date)}_{stem or 'asset'}{suffix}{ext}"


def yaml_quote(value):
    """Quote a scalar as a single-line, always-valid YAML double-quoted string."""
    return json.dumps(str(value), ensure_ascii=False)


def atomic_write_text(path, content):
    """Write text via a temp file + replace so a crash cannot leave a half-written file."""
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=".tmp-", suffix=".yaml", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as file:
            file.write(content)
            file.flush()
            os.fsync(file.fileno())
        os.replace(tmp_path, path)
    except BaseException:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


def parse_timeline_text(content):
    """Parse timeline YAML, raising ValueError with a clear message when malformed."""
    if not content.strip():
        return {"entries": []}
    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError as error:
        raise ValueError(f"invalid YAML ({error})") from error
    if data is None:
        return {"entries": []}
    if not isinstance(data, dict):
        raise ValueError("expected a YAML mapping at the top level")
    return data


def file_sha1(path):
    digest = hashlib.sha1()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_event_id(file_slug):
    """Use the raw-note slug as the stable event id for new timeline entries."""
    return str(file_slug or "").strip()


def copy_markdown_asset(filepath, date, assets_dir):
    """Copy or download a Markdown asset with content-hash dedup; return the relative path."""
    parsed = urlparse(filepath)
    is_remote = parsed.scheme in {"http", "https"}
    if not is_remote and not (os.path.isabs(filepath) and os.path.exists(filepath)):
        return None

    fd, tmp_path = tempfile.mkstemp(prefix=".asset-", suffix=".tmp", dir=assets_dir)
    os.close(fd)
    try:
        headers = None
        if is_remote:
            with urlopen(filepath, timeout=15) as response:
                headers = response.headers
                with open(tmp_path, "wb") as asset_file:
                    shutil.copyfileobj(response, asset_file)
        else:
            shutil.copy2(filepath, tmp_path)

        content_hash = file_sha1(tmp_path)

        filename = build_asset_filename(date, filepath, headers)
        dest_path = os.path.join(assets_dir, filename)
        if os.path.exists(dest_path):
            if file_sha1(dest_path) == content_hash:
                # Identical content is already archived under the plain name.
                return f"../assets/{filename}"
            filename = build_asset_filename(date, filepath, headers, content_hash=content_hash)
            dest_path = os.path.join(assets_dir, filename)
            if os.path.exists(dest_path):
                if file_sha1(dest_path) == content_hash:
                    return f"../assets/{filename}"
                # Extremely unlikely short-hash collision: fall back to the full digest.
                filename = build_asset_filename(
                    date, filepath, headers, content_hash=content_hash, hash_length=len(content_hash)
                )
                dest_path = os.path.join(assets_dir, filename)

        os.replace(tmp_path, dest_path)
        tmp_path = None
        return f"../assets/{filename}"
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

def safe_append_to_timeline(period, date, event, summary, file_slug):
    period_dir = os.path.join(PERIODS_DIR, period)
    os.makedirs(period_dir, exist_ok=True)

    timeline_path = os.path.join(period_dir, "timeline.yaml")

    # Scaffold if it doesn't exist
    if not os.path.exists(timeline_path):
        atomic_write_text(timeline_path, f"period: {yaml_quote(period)}\nentries:\n")

    event_id = build_event_id(file_slug)
    if not event_id:
        print("Error: file_slug is required to build a stable event id.")
        return False

    with open(timeline_path, "r", encoding="utf-8") as f:
        content = f.read()

    try:
        document = parse_timeline_text(content)
    except ValueError as error:
        print(f"Error: refusing to modify {timeline_path}: {error}")
        return False

    if "entries" not in document:
        print(f"Error: Unrecognized timeline format in {timeline_path}")
        return False

    entries = document.get("entries") or []
    if not isinstance(entries, list):
        print(f"Error: 'entries' in {timeline_path} must be a list.")
        return False
    if any(str(entry.get("id", "")).strip() == event_id for entry in entries if isinstance(entry, dict)):
        print(f'Error: Duplicate timeline id "{event_id}" in {period}/timeline.yaml')
        return False

    entry_block = "\n".join(
        [
            f"  - id: {yaml_quote(event_id)}",
            f"    date: {yaml_quote(date)}",
            f"    event: {yaml_quote(event)}",
            f"    summary: {yaml_quote(summary)}",
            f"    related_files: [{yaml_quote(f'raw_notes/{file_slug}.md')}]",
        ]
    ) + "\n"

    new_content = content if (not content or content.endswith("\n")) else content + "\n"
    new_content += entry_block

    # Validate the exact bytes we are about to write; never leave a broken timeline behind.
    try:
        validated = parse_timeline_text(new_content)
    except ValueError as error:
        print(f"Error: refusing to write malformed timeline: {error}")
        return False

    validated_entries = validated.get("entries") or []
    if not isinstance(validated_entries, list) or not any(
        isinstance(entry, dict)
        and str(entry.get("id", "")).strip() == event_id
        and str(entry.get("date", "")) == str(date)
        for entry in validated_entries
    ):
        print("Error: timeline validation failed after append; nothing written.")
        return False

    atomic_write_text(timeline_path, new_content)
    print(f"Successfully appended to {period}/timeline.yaml")
    return True

def generate_raw_note(period, file_slug, date, people, places, context_text, conflict_text, reflection_text, raw_input):
    notes_dir  = os.path.join(PERIODS_DIR, period, "raw_notes")
    assets_dir = os.path.join(PERIODS_DIR, period, "assets")
    os.makedirs(notes_dir, exist_ok=True)
    os.makedirs(assets_dir, exist_ok=True)
    
    def replacer(match):
        alt_text = match.group(1)
        filepath = match.group(2).strip()
        try:
            rewritten_path = copy_markdown_asset(filepath, date, assets_dir)
            if rewritten_path:
                return f"![{alt_text}]({rewritten_path})"
        except Exception as e:
            # Keep the original Markdown reference when archival fails.
            print(f"Warning: Failed to archive asset {filepath}: {e}")
        return match.group(0)
        
    if raw_input:
        raw_input = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', replacer, raw_input)
        
    note_path = os.path.join(notes_dir, f"{file_slug}.md")

    def inline_list(value):
        parts = [part.strip() for part in str(value or "").split(",") if part.strip()]
        return "[" + ", ".join(yaml_quote(part) for part in parts) + "]"

    content = f"""---
date: {yaml_quote(date)}
people: {inline_list(people)}
places: {inline_list(places)}
---

**原始入库资料**：
> {raw_input}

## 一、背景与纪实 (Context and Reality)
{context_text}

## 二、情绪与冲突 (Emotion and Conflict)
{conflict_text}

## 三、复盘与感悟 (Retrospective and Reflection)
{reflection_text}
"""
    atomic_write_text(note_path, content)
    print(f"Successfully created raw note: {note_path}")
    return True

def entry_line_starts(lines):
    """Locate the start line of each top-level timeline entry under `entries:`."""
    in_entries = False
    entry_indent = None
    starts = []
    for index, line in enumerate(lines):
        if not in_entries:
            if re.match(r"^\s*entries\s*:", line):
                in_entries = True
            continue

        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        match = re.match(r"^(\s*)-\s", line)
        if match:
            indent = len(match.group(1))
            if entry_indent is None:
                entry_indent = indent
            if indent == entry_indent:
                starts.append(index)
            elif indent < entry_indent:
                break
        elif entry_indent is not None and not line.startswith(" " * entry_indent):
            break

    return starts, entry_indent or 0


def correct_timeline(period, date=None, entry_id=None, new_event=None, new_summary=None, new_date=None):
    """Correct one timeline entry, selected by stable id (preferred) or unique date."""
    timeline_path = os.path.join(PERIODS_DIR, period, "timeline.yaml")
    if not os.path.exists(timeline_path):
        print(f"Error: Timeline file {timeline_path} not found.")
        return False

    with open(timeline_path, "r", encoding="utf-8") as f:
        content = f.read()

    try:
        document = parse_timeline_text(content)
    except ValueError as error:
        print(f"Error: {error}")
        return False

    entries = document.get("entries")
    if not isinstance(entries, list):
        print(f"Error: 'entries' in {timeline_path} must be a list.")
        return False

    target_id = str(entry_id).strip() if entry_id else ""
    target_date = str(date).strip() if date else ""
    if target_id:
        matches = [
            index
            for index, entry in enumerate(entries)
            if isinstance(entry, dict) and str(entry.get("id", "")).strip() == target_id
        ]
    elif target_date:
        matches = [
            index
            for index, entry in enumerate(entries)
            if isinstance(entry, dict) and str(entry.get("date", "")).strip() == target_date
        ]
    else:
        print("Error: provide --id or --date to select the entry to correct.")
        return False

    if not matches:
        selector = f'id "{target_id}"' if target_id else f'date "{target_date}"'
        print(f"Error: no timeline entry with {selector} in {period}.")
        return False
    if len(matches) > 1:
        print(
            f"Error: {len(matches)} entries in {period} match that selector; "
            "correct by --id to disambiguate."
        )
        return False

    replacements = {}
    if new_event is not None:
        replacements["event"] = str(new_event)
    if new_summary is not None:
        replacements["summary"] = str(new_summary)
    if new_date is not None:
        replacements["date"] = str(new_date)
    if not replacements:
        print("Error: nothing to change; pass --new-event, --new-summary or --new-date.")
        return False

    lines = content.split("\n")
    starts, entry_indent = entry_line_starts(lines)
    target_index = matches[0]
    if len(starts) != len(entries) or target_index >= len(starts):
        print(
            "Error: timeline.yaml layout does not match the generated format; "
            "refusing automatic correction. Edit the file manually."
        )
        return False

    block_start = starts[target_index]
    block_end = starts[target_index + 1] if target_index + 1 < len(starts) else len(lines)
    block = lines[block_start:block_end]
    field_indent = " " * (entry_indent + 2)

    for field, value in replacements.items():
        replaced = False
        for offset, line in enumerate(block):
            match = re.match(rf"^(\s*){re.escape(field)}\s*:(.*)$", line)
            if not match:
                continue
            remainder = match.group(2).strip()
            if remainder in {"|", ">", "|-", ">-", "|+", ">+"} or remainder == "":
                print(
                    f"Error: field '{field}' uses a multi-line YAML style; "
                    "refusing automatic correction. Edit the file manually."
                )
                return False
            block[offset] = f"{match.group(1)}{field}: {yaml_quote(value)}"
            replaced = True
            break
        if not replaced:
            block.append(f"{field_indent}{field}: {yaml_quote(value)}")

    lines[block_start:block_end] = block
    new_content = "\n".join(lines)

    try:
        validated = parse_timeline_text(new_content)
    except ValueError as error:
        print(f"Error: correction would produce invalid YAML; nothing written ({error}).")
        return False

    validated_entries = validated.get("entries")
    if not isinstance(validated_entries, list) or len(validated_entries) != len(entries):
        print("Error: correction validation changed the entry list; nothing written.")
        return False

    validated_target = validated_entries[target_index]
    if not isinstance(validated_target, dict) or any(
        str(validated_target.get(field, "")) != value for field, value in replacements.items()
    ):
        print("Error: correction validation failed; nothing written.")
        return False

    atomic_write_text(timeline_path, new_content)
    selector = f'id "{target_id}"' if target_id else f'date "{target_date}"'
    print(f"Successfully corrected timeline entry ({selector}) in {period}.")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Auto-Biographer Timeline Manager (No Dependencies)")
    parser.add_argument("--action", required=True, choices=["append", "correct"])
    parser.add_argument("--period", required=True, help="Which period to target (e.g., US_PhD, Childhood)")
    parser.add_argument("--date", help="Event date (required for append)")
    
    # Append args
    parser.add_argument("--event", help="Event title")
    parser.add_argument("--summary", help="Short summary for timeline.yaml")
    parser.add_argument("--context", help="Context and Reality block for raw note")
    parser.add_argument("--conflict", help="Emotion and Conflict block for raw note")
    parser.add_argument("--reflection", help="Retrospective and Reflection block for raw note")
    
    parser.add_argument("--file-slug", help="Filename for the raw_note (e.g. 2019_05_crisis)")
    parser.add_argument("--people", default="", help="Comma separated list of people in this memory")
    parser.add_argument("--places", default="", help="Comma separated list of places in this memory")
    parser.add_argument("--raw-input", default="", help="The original text/image description")
    
    # Correct args
    parser.add_argument("--id", dest="entry_id", help="Stable timeline entry id to correct (preferred selector)")
    parser.add_argument("--new-event", help="Replacement event title for the targeted timeline entry")
    parser.add_argument("--new-summary", help="Replacement summary text for the targeted timeline entry")
    parser.add_argument("--new-date", help="Replacement date for the targeted timeline entry")
    
    args = parser.parse_args()
    
    if args.action == "append":
        if not args.date or not args.event or not args.file_slug or not args.summary:
            print("Error: --date, --event, --file-slug, and --summary are required for append.")
            sys.exit(1)
        # 1. Create Raw Note
        generate_raw_note(args.period, args.file_slug, args.date, args.people, args.places, args.context, args.conflict, args.reflection, args.raw_input)
        # 2. Append to Timeline
        if not safe_append_to_timeline(args.period, args.date, args.event, args.summary, args.file_slug):
            sys.exit(1)
        
    elif args.action == "correct":
        if not (args.new_event or args.new_summary or args.new_date):
            print("Error: pass at least one of --new-event, --new-summary or --new-date.")
            sys.exit(1)
        if not correct_timeline(
            period=args.period,
            date=args.date,
            entry_id=args.entry_id,
            new_event=args.new_event,
            new_summary=args.new_summary,
            new_date=args.new_date,
        ):
            sys.exit(1)
