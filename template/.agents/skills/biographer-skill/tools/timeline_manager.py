#!/usr/bin/env python3
import os
import argparse
import datetime
import shutil
import re

# Base path derivation
CURRENT_DIR   = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "../../../../"))
MEMOIRS_DIR   = os.path.join(WORKSPACE_DIR, "memoirs")
PERIODS_DIR   = os.path.join(MEMOIRS_DIR, "periods")  # all period folders live here

def safe_append_to_timeline(period, date, event, summary, file_slug):
    period_dir = os.path.join(PERIODS_DIR, period)
    os.makedirs(period_dir, exist_ok=True)
    
    timeline_path = os.path.join(period_dir, "timeline.yaml")
    
    # Scaffold if it doesn't exist
    if not os.path.exists(timeline_path):
        with open(timeline_path, "w", encoding="utf-8") as f:
            f.write(f"period: {period}\nentries:\n")
    
    # We use basic string appending to protect yaml comments and structure
    # without needing external dependencies like ruamel.yaml or pyyaml.
    with open(timeline_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    entry = f"""  - date: "{date}"
    event: "{event}"
    summary: "{summary}"
    related_files: ["raw_notes/{file_slug}.md"]
"""
    
    # Append to the end of the entries list
    if "entries:" in content:
        with open(timeline_path, "a", encoding="utf-8") as f:
            f.write(entry)
        print(f"✅ Successfully appended to {period}/timeline.yaml")
        return True
    else:
        print(f"Error: Unrecognized timeline format in {timeline_path}")
        return False

def generate_raw_note(period, file_slug, date, people, places, context_text, conflict_text, reflection_text, raw_input):
    notes_dir  = os.path.join(PERIODS_DIR, period, "raw_notes")
    assets_dir = os.path.join(PERIODS_DIR, period, "assets")
    os.makedirs(notes_dir, exist_ok=True)
    os.makedirs(assets_dir, exist_ok=True)
    
    def replacer(match):
        alt_text = match.group(1)
        filepath = match.group(2)
        if os.path.isabs(filepath) and os.path.exists(filepath):
            filename = os.path.basename(filepath)
            new_filename = f"{date}_{filename}"
            dest_path = os.path.join(assets_dir, new_filename)
            try:
                shutil.copy2(filepath, dest_path)
                return f"![{alt_text}](../assets/{new_filename})"
            except Exception as e:
                print(f"Warning: Failed to copy {filepath}: {e}")
        return match.group(0)
        
    if raw_input:
        raw_input = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', replacer, raw_input)
        
    note_path = os.path.join(notes_dir, f"{file_slug}.md")
    
    people_str = ", ".join([f'"{p.strip()}"' for p in people.split(",")]) if people else ""
    places_str = ", ".join([f'"{p.strip()}"' for p in places.split(",")]) if places else ""
    
    content = f"""---
date: "{date}"
people: [{people_str}]
places: [{places_str}]
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
    with open(note_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Successfully created raw note: {note_path}")
    return True

def correct_timeline(period, date, new_notes):
    timeline_path = os.path.join(PERIODS_DIR, period, "timeline.yaml")
    if not os.path.exists(timeline_path):
        print(f"Error: Timeline file {timeline_path} not found.")
        return False
        
    with open(timeline_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Simple line-by-line parser to find the block
    lines = content.split('\n')
    output = []
    in_target_block = False
    
    for line in lines:
        if line.strip().startswith("- date:") and f'"{date}"' in line:
            in_target_block = True
            output.append(line)
            continue
        
        if in_target_block and line.strip().startswith("- date:"):
            in_target_block = False  # moved to next block
            
        if in_target_block and line.strip().startswith("summary:"):
            # Replace summary
            indent = len(line) - len(line.lstrip())
            output.append(" " * indent + f'summary: "{new_notes}"')
        else:
            output.append(line)
            
    with open(timeline_path, "w", encoding="utf-8") as f:
        f.write("\n".join(output))
        
    print(f"✅ Successfully corrected timeline entry for {date} in {period}.")
    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Auto-Biographer Timeline Manager (No Dependencies)")
    parser.add_argument("--action", required=True, choices=["append", "correct"])
    parser.add_argument("--period", required=True, help="Which period to target (e.g., US_PhD, Childhood)")
    parser.add_argument("--date", required=True, help="Event Date")
    
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
    parser.add_argument("--new-summary", help="Replacement summary text for the targeted timeline entry")
    
    args = parser.parse_args()
    
    if args.action == "append":
        if not args.event or not args.file_slug or not args.summary:
            print("Error: --event, --file-slug, and --summary are required for append.")
            exit(1)
        # 1. Create Raw Note
        generate_raw_note(args.period, args.file_slug, args.date, args.people, args.places, args.context, args.conflict, args.reflection, args.raw_input)
        # 2. Append to Timeline
        safe_append_to_timeline(args.period, args.date, args.event, args.summary, args.file_slug)
        
    elif args.action == "correct":
        if not args.new_summary:
            print("Error: --new-summary is required for correct action.")
            exit(1)
        correct_timeline(args.period, args.date, args.new_summary)
