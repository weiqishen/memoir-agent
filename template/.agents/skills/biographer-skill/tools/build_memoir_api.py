"""
build_memoir_api.py — 数据编译器 (schema v2)

Reads memoirs/periods/ and writes a single derived file:
    memoirs/.cache/memoirs.manifest.json

Chapter markdown is embedded into the manifest, and images are referenced
through /media/<period>/<file>, which the local viewer serves directly from
periods/<period>/assets — nothing is copied into webapp/public or dist.
"""

import datetime
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
from urllib.parse import quote

import yaml

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from entity_resolver import EntityResolver
from time_spec import parse_time_spec

SCHEMA_VERSION = 2
TOOL_VERSION = "0.2.0"

WORKSPACE_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "../../../../"))
MEMOIRS_DIR = os.path.join(WORKSPACE_DIR, "memoirs")
PERIODS_DIR = os.path.join(MEMOIRS_DIR, "periods")
# Legacy build output location; kept only so migrations and doctor can find it.
WEBAPP_PUBLIC_DIR = os.path.join(MEMOIRS_DIR, "webapp", "public")
ALIAS_REGISTRY = os.path.join(MEMOIRS_DIR, "entities.yaml")
MANIFEST_FILENAME = "memoirs.manifest.json"
CACHE_DIRNAME = ".cache"
RESOLUTION_REPORT_FILENAME = ".entity_resolution_report.json"
TIME_RESOLUTION_REPORT_FILENAME = ".time_resolution_report.json"


class TimelineParseError(Exception):
    """Raised when a timeline.yaml file cannot be parsed safely."""


class EntityRegistryError(Exception):
    """Raised when memoirs/entities.yaml cannot be parsed safely."""


def load_entity_registry_document():
    """Load the registry file and normalize the top-level shape."""
    if not os.path.exists(ALIAS_REGISTRY):
        return {"people": {}, "places": {}}

    try:
        with open(ALIAS_REGISTRY, "r", encoding="utf-8") as f:
            reg = yaml.safe_load(f) or {}
    except yaml.YAMLError as e:
        raise EntityRegistryError(f"Malformed YAML in {ALIAS_REGISTRY}: {e}") from e
    if not isinstance(reg, dict):
        reg = {}

    people = reg.get("people") or {}
    places = reg.get("places") or {}
    if not isinstance(people, dict):
        people = {}
    if not isinstance(places, dict):
        places = {}

    reg["people"] = people
    reg["places"] = places
    return reg


def parse_frontmatter(content: str):
    if not content.startswith("---"):
        return {}, content
    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content
    try:
        meta = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        meta = {}
    return meta, parts[2]


def parse_timeline(content: str, source_path: str | None = None):
    """Parse a timeline document, raising TimelineParseError instead of silently dropping entries."""
    location = source_path or "timeline.yaml"
    if not str(content or "").strip():
        return {"period": "", "entries": []}
    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError as e:
        raise TimelineParseError(f"Malformed YAML in {location}: {e}") from e
    if data is None:
        return {"period": "", "entries": []}
    if not isinstance(data, dict):
        raise TimelineParseError(
            f"Malformed timeline in {location}: expected a YAML mapping, got {type(data).__name__}"
        )
    entries = data.get("entries")
    if entries is None:
        entries = []
    if not isinstance(entries, list):
        raise TimelineParseError(
            f"Malformed timeline in {location}: 'entries' must be a list, got {type(entries).__name__}"
        )
    period = data.get("period") or ""
    return {"period": period, "entries": entries}


def build_event_ref(period: str, entry: dict):
    """Build a stable event reference used by graph and entity indexes."""
    entry_id = str(entry.get("id", "")).strip()
    if entry_id:
        return f"{period}|{entry_id}"
    date_text = str(entry.get("date", "")).strip()
    event_text = str(entry.get("event", "")).strip()
    return f"{period}|{date_text}|{event_text}"


def attach_time_metadata(period: str, entry: dict, report: dict):
    """Attach normalized fuzzy-time metadata while preserving the authored date."""
    date_text = str(entry.get("date", "")).strip()
    if not date_text:
        return

    parsed = parse_time_spec(date_text)
    if parsed.status == "resolved":
        entry["time"] = parsed.to_manifest()
        return

    report["unresolved_times"].append(
        {
            "period": period,
            "value": date_text,
            "status": parsed.status,
            "reason": parsed.reason,
            "event_ref": build_event_ref(period, entry),
        }
    )


def graph_event_id(event_ref: str) -> str:
    """Build a graph-only event node id that cannot collide with entity ids."""
    return f"event:{event_ref}"


def graph_period_id(period: str) -> str:
    """Build a graph-only period hub node id."""
    return f"period:{period}"


def graph_person_id(canonical: str) -> str:
    """Build a graph-only person node id that cannot collide with place ids."""
    return f"person:{canonical}"


def graph_place_id(canonical: str) -> str:
    """Build a graph-only place node id that cannot collide with person ids."""
    return f"place:{canonical}"


def file_sha1(path: str) -> str:
    digest = hashlib.sha1()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_write_text(path: str, content: str):
    """Write text via a temp file + replace so a crash cannot leave a half-written file."""
    directory = os.path.dirname(path) or "."
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix=".tmp-", suffix=".json", dir=directory)
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


def store_chapter_asset(source_path: str, assets_dir: str) -> str:
    """Copy a chapter-referenced asset into the period asset store; return its filename."""
    filename = os.path.basename(source_path)
    os.makedirs(assets_dir, exist_ok=True)
    dest_path = os.path.join(assets_dir, filename)
    source_hash = file_sha1(source_path)
    if os.path.exists(dest_path) and file_sha1(dest_path) != source_hash:
        stem, ext = os.path.splitext(filename)
        filename = f"{stem}_{source_hash[:8]}{ext}"
        dest_path = os.path.join(assets_dir, filename)
    shutil.copy2(source_path, dest_path)
    return filename


def rewrite_chapter_content(period: str, chapter_dir: str, chapter_content: str, missing_assets: list):
    """Point chapter images at /media/<period>/<file> without copying anything.

    Assets already living in periods/<period>/assets are referenced in place;
    absolute paths from outside the period are archived into that folder first.
    """
    assets_dir = os.path.normpath(os.path.join(os.path.dirname(chapter_dir), "assets"))

    def replace_asset(match):
        alt_text = match.group(1)
        asset_path = match.group(2).strip()

        if re.match(r"^(?:https?:)?//", asset_path) or asset_path.startswith("/media/"):
            return match.group(0)

        if asset_path.startswith(("/assets/", "/chapters/")):
            # Legacy web path from an older build; fall back to its basename.
            basename = os.path.basename(asset_path)
            source_path = os.path.join(assets_dir, basename)
        else:
            source_path = os.path.normpath(os.path.join(chapter_dir, asset_path))
            basename = os.path.basename(source_path)

        if not os.path.isfile(source_path):
            missing_assets.append({"period": period, "reference": asset_path})
            return match.group(0)

        if os.path.normpath(os.path.dirname(source_path)) != assets_dir:
            stored = store_chapter_asset(source_path, assets_dir)
            if not stored:
                missing_assets.append({"period": period, "reference": asset_path})
                return match.group(0)
            basename = stored

        return f"![{alt_text}](/media/{period}/{quote(basename)})"

    return re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', replace_asset, chapter_content)


def build_api(force: bool = False):
    if not os.path.exists(PERIODS_DIR):
        print(f"ERROR: periods dir not found: {PERIODS_DIR}")
        raise SystemExit(1)

    # Validate every timeline and the entity registry before touching any output,
    # so a malformed input can never produce a silent or partial build.
    validated_timelines: dict[str, dict] = {}
    timeline_errors: list[str] = []
    for item in sorted(os.listdir(PERIODS_DIR)):
        period_dir = os.path.join(PERIODS_DIR, item)
        if not os.path.isdir(period_dir):
            continue
        tl = os.path.join(period_dir, "timeline.yaml")
        if os.path.exists(tl):
            with open(tl, "r", encoding="utf-8") as f:
                try:
                    validated_timelines[item] = parse_timeline(f.read(), tl)
                except TimelineParseError as e:
                    timeline_errors.append(str(e))
    if timeline_errors:
        print("ERROR: refusing to build; fix the following timeline files:")
        for error in timeline_errors:
            print(f"  - {error}")
        raise SystemExit(1)

    try:
        registry_doc = load_entity_registry_document()
    except EntityRegistryError as error:
        print(f"ERROR: {error}")
        raise SystemExit(1)
    resolver = EntityResolver(registry_doc)
    places_meta = resolver.places_meta

    new_people_added = []
    new_places_added = []
    missing_chapter_assets: list[dict] = []
    inferred_parents: list[dict] = []
    place_cycles: list[list[str]] = []
    resolution_report = {
        "ambiguous_people": [],
        "ambiguous_places": [],
        "unknown_people_auto_added": [],
        "unknown_places_auto_added": [],
        "resolved_people_aliases": [],
        "resolved_places_aliases": [],
        "missing_raw_notes": [],
        "coerced_entity_fields": [],
        "invalid_entity_fields": [],
    }
    time_resolution_report = {
        "unresolved_times": [],
    }

    # FQN child places registered without an explicit parent keep their hierarchy.
    for canonical in (registry_doc.get("places") or {}):
        canonical_text = str(canonical)
        if "·" not in canonical_text:
            continue
        if str((places_meta.get(canonical_text) or {}).get("parent") or "").strip():
            continue
        inferred_parent = canonical_text.split("·", 1)[0]
        places_meta.setdefault(canonical_text, {})["parent"] = inferred_parent
        inferred_parents.append(
            {"place": canonical_text, "inferred_parent": inferred_parent, "source": "fqn"}
        )

    # ── 读取 period 数据 ──────────────────────────────────────────────────────
    all_data: dict = {}
    for item in sorted(os.listdir(PERIODS_DIR)):
        period_dir = os.path.join(PERIODS_DIR, item)
        if not os.path.isdir(period_dir):
            continue
        pd: dict = {"timeline": {}, "chapters": [], "raw_notes": {}}

        tl = os.path.join(period_dir, "timeline.yaml")
        if os.path.exists(tl):
            pd["timeline"] = validated_timelines.get(item, {"period": "", "entries": []})
            for entry in pd["timeline"].get("entries", []):
                if isinstance(entry, dict):
                    attach_time_metadata(item, entry, time_resolution_report)

        ch_dir = os.path.join(period_dir, "chapters")
        if os.path.exists(ch_dir):
            for ch in sorted(os.listdir(ch_dir)):
                if ch.endswith(".md"):
                    with open(os.path.join(ch_dir, ch), "r", encoding="utf-8") as f:
                        chapter_content = rewrite_chapter_content(
                            item, ch_dir, f.read(), missing_chapter_assets
                        )
                    pd["chapters"].append({"filename": ch, "content": chapter_content})

        rn_dir = os.path.join(period_dir, "raw_notes")
        if os.path.exists(rn_dir):
            for rn in os.listdir(rn_dir):
                if rn.endswith(".md"):
                    with open(os.path.join(rn_dir, rn), "r", encoding="utf-8") as f:
                        pd["raw_notes"][rn] = f.read()

        all_data[item] = pd

    # ── 重复 event ref 检测（同 period 内 id/date+event 必须唯一）────────────
    ref_counts: dict[str, int] = {}
    for period, data in all_data.items():
        for entry in data["timeline"].get("entries", []):
            if not isinstance(entry, dict) or not str(entry.get("event", "")).strip():
                continue
            ref = build_event_ref(period, entry)
            ref_counts[ref] = ref_counts.get(ref, 0) + 1
    duplicate_refs = sorted(ref for ref, count in ref_counts.items() if count > 1)
    if duplicate_refs and not force:
        print("ERROR: duplicate event references detected; give each entry a unique id:")
        for ref in duplicate_refs:
            print(f"  - {ref}")
        print("Rerun with --force to keep the first entry and report the rest.")
        raise SystemExit(1)

    # ── 图谱 + 索引 ───────────────────────────────────────────────────────────
    graph: dict = {"nodes": [], "links": []}
    added_nodes: set = set()
    added_links: set = set()   # (source, target) dedup for graph edges
    contains_edges: set = set()  # (parent, child) dedup for cycle detection
    people_index: dict = {}
    places_index: dict = {}

    def _ensure_node(nid: str, group: int, name: str | None = None, extra: dict | None = None):
        if nid not in added_nodes:
            node = {"id": nid, "name": name or nid, "group": group}
            if extra:
                node.update(extra)
            graph["nodes"].append(node)
            added_nodes.add(nid)

    def _add_link(src: str, tgt: str, link_type: str, **kw):
        key = (src, tgt, link_type)
        if key not in added_links:
            link = {"source": src, "target": tgt, "type": link_type}
            link.update(kw)
            graph["links"].append(link)
            added_links.add(key)

    def _dedup_append_event_ref(index: dict, key: str, event_ref: str):
        existing = set(index.get(key, []))
        if event_ref not in existing:
            index.setdefault(key, []).append(event_ref)

    def _entity_values(meta: dict, field: str, event_ref: str, raw_note: str):
        value = meta.get(field, [])
        if value is None or value == "":
            return []
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            # Hand-written raw notes sometimes use `people: 老王` or a comma
            # separated string instead of a list; coerce instead of dropping.
            coerced = [part.strip() for part in re.split(r"[,，]", value) if part.strip()]
            resolution_report["coerced_entity_fields"].append(
                {
                    "field": field,
                    "value": value,
                    "coerced": coerced,
                    "raw_note": raw_note,
                    "event_ref": event_ref,
                }
            )
            return coerced
        resolution_report["invalid_entity_fields"].append(
            {
                "field": field,
                "value_type": type(value).__name__,
                "raw_note": raw_note,
                "event_ref": event_ref,
            }
        )
        return []

    def _resolve_place_values(place_values: list, event_ref: str):
        resolved_places: list[dict] = []
        for pl in place_values:
            str_pl = str(pl).strip()
            if not str_pl:
                continue
            resolved = resolver.resolve_place(str_pl)
            if resolved.status == "ambiguous":
                resolution_report["ambiguous_places"].append(
                    {"value": str_pl, "candidates": resolved.candidates, "event_ref": event_ref}
                )
                continue

            canonical = resolved.canonical or str_pl
            if resolved.canonical and canonical != str_pl:
                resolution_report["resolved_places_aliases"].append(
                    {"value": str_pl, "canonical": canonical, "event_ref": event_ref}
                )

            if resolved.status == "unknown":
                if "·" in canonical:
                    # split by first dot only just in case
                    parent_key, display_name = canonical.split("·", 1)
                    places_meta[canonical] = {
                        "display": display_name, "parent": parent_key}
                    # Optional: also track the parent if completely new
                    if parent_key not in registry_doc["places"]:
                        new_places_added.append(parent_key)
                new_places_added.append(canonical)
                resolution_report["unknown_places_auto_added"].append(
                    {"value": str_pl, "canonical": canonical, "event_ref": event_ref}
                )

            resolved_places.append({"value": str_pl, "canonical": canonical})
        return resolved_places

    def _dedupe_resolved_places(resolved_places: list[dict]):
        """Keep distinct place tags in the order extracted from the note."""
        final_places: list[str] = []
        for item in resolved_places:
            canonical = item["canonical"]
            if canonical not in final_places:
                final_places.append(canonical)
        return final_places

    def _place_parent(canonical: str):
        parent = str(places_meta.get(canonical, {}).get("parent") or "").strip()
        return parent if parent and parent != canonical else ""

    def _place_display(canonical: str):
        return places_meta.get(canonical, {}).get("display", canonical)

    def _place_lineage(canonical: str):
        """Return place plus ancestors, stopping before cycles repeat."""
        lineage: list[str] = []
        seen: set[str] = set()
        current = canonical
        while current and current not in seen:
            lineage.append(current)
            seen.add(current)
            current = _place_parent(current)
        return lineage

    def _ensure_place_node(canonical: str):
        parent = _place_parent(canonical)
        extra = {"parent": parent} if parent else None
        _ensure_node(graph_place_id(canonical), group=3, name=_place_display(canonical), extra=extra)

    def _add_contains(parent: str, child: str):
        """Add a contains edge, refusing edges that would close a cycle."""
        if (child, parent) in contains_edges:
            if [parent, child] not in place_cycles:
                place_cycles.append([parent, child])
            return
        _add_link(graph_place_id(parent), graph_place_id(child), "contains")
        contains_edges.add((parent, child))

    def _ensure_place_hierarchy(canonical: str):
        lineage = _place_lineage(canonical)
        for place in reversed(lineage):
            _ensure_place_node(place)
        for child, parent in zip(lineage, lineage[1:]):
            _add_contains(parent, child)
        return lineage

    def _index_place(canonical: str, event_node_id: str, event_ref: str):
        lineage = _ensure_place_hierarchy(canonical)
        _add_link(graph_place_id(canonical), event_node_id, "occurred_at")
        for place in lineage:
            _dedup_append_event_ref(places_index, place, event_ref)

    seen_event_refs: set = set()
    for period, data in all_data.items():
        entries = data.get("timeline", {}).get("entries")
        if not isinstance(entries, list):
            continue

        _ensure_node(graph_period_id(period), group=1, name=period)

        for entry in entries:
            if not isinstance(entry, dict):
                continue
            event_name = str(entry.get("event", "")).strip()
            if not event_name:
                continue
            event_ref = build_event_ref(period, entry)
            if event_ref in seen_event_refs:
                # Duplicate kept out by --force; already reported.
                continue
            seen_event_refs.add(event_ref)
            event_node_id = graph_event_id(event_ref)

            _ensure_node(event_node_id, group=2, name=event_name, extra={"event_ref": event_ref})
            _add_link(event_node_id, graph_period_id(period), "belongs_to")

            for file_path in entry.get("related_files", []):
                rn = os.path.basename(file_path)
                if rn not in data["raw_notes"]:
                    resolution_report["missing_raw_notes"].append(
                        {"file": str(file_path), "period": period, "event_ref": event_ref}
                    )
                    continue
                raw = data["raw_notes"].get(rn, "")
                meta, _ = parse_frontmatter(raw)

                # People → graph nodes (group 4) + links to event + index
                for p in _entity_values(meta, "people", event_ref, rn):
                    str_p = str(p).strip()
                    if not str_p:
                        continue
                    resolved = resolver.resolve_person(str_p)
                    if resolved.status == "ambiguous":
                        resolution_report["ambiguous_people"].append(
                            {"value": str_p, "candidates": resolved.candidates, "event_ref": event_ref}
                        )
                        continue

                    canonical = resolved.canonical or str_p
                    if resolved.canonical and canonical != str_p:
                        resolution_report["resolved_people_aliases"].append(
                            {"value": str_p, "canonical": canonical, "event_ref": event_ref}
                        )

                    if resolved.status == "unknown":
                        new_people_added.append(canonical)
                        resolution_report["unknown_people_auto_added"].append(
                            {"value": str_p, "canonical": canonical, "event_ref": event_ref}
                        )

                    person_node_id = graph_person_id(canonical)
                    _ensure_node(person_node_id, group=4, name=canonical)
                    # ← connects to event
                    _add_link(person_node_id, event_node_id, "mentions_person")
                    _dedup_append_event_ref(people_index, canonical, event_ref)

                # Places → graph + index. Keep explicit subplaces while the
                # index also rolls them up to their parent venue.
                place_values = _entity_values(meta, "places", event_ref, rn)
                resolved_places = _resolve_place_values(place_values, event_ref)
                for canonical in _dedupe_resolved_places(resolved_places):
                    _index_place(canonical, event_node_id, event_ref)

    # ── 自动补全 entities.yaml ───────────────────────────────────────────────
    if new_people_added or new_places_added:
        # dedup keeping order
        new_people_added = list(dict.fromkeys(new_people_added))
        new_places_added = list(dict.fromkeys(new_places_added))
        print(
            f"Auto-updating entities.yaml with {len(new_people_added)} people and {len(new_places_added)} places...")
        for person in new_people_added:
            registry_doc["people"].setdefault(person, {"aliases": []})

        for place in new_places_added:
            if "·" in place:
                parent_key, display_name = place.split("·", 1)
                registry_doc["places"].setdefault(parent_key, {"aliases": []})
                registry_doc["places"].setdefault(place, {
                    "display": display_name,
                    "parent": parent_key,
                    "aliases": [],
                })
            else:
                registry_doc["places"].setdefault(place, {"aliases": []})

        os.makedirs(os.path.dirname(ALIAS_REGISTRY), exist_ok=True)
        with open(ALIAS_REGISTRY, "w", encoding="utf-8") as f:
            yaml.safe_dump(registry_doc, f, allow_unicode=True,
                           sort_keys=False, default_flow_style=False)

    # ── 输出（唯一派生文件：memoirs/.cache/memoirs.manifest.json）────────────
    # Strip raw_notes from output — body text is only needed at compile time;
    # the frontend only reads timeline + chapters.
    memoirs_out = {
        period: {"timeline": pd.get("timeline", {}),
                 "chapters": pd.get("chapters", [])}
        for period, pd in all_data.items()
    }

    issues = {
        "graph": {
            "duplicate_event_refs": duplicate_refs,
            "place_cycles": place_cycles,
            "missing_parents": inferred_parents,
            "unknown_entities": [
                {"kind": "person", **item}
                for item in resolution_report["unknown_people_auto_added"]
            ] + [
                {"kind": "place", **item}
                for item in resolution_report["unknown_places_auto_added"]
            ],
            "ambiguous_entities": [
                {"kind": "person", **item}
                for item in resolution_report["ambiguous_people"]
            ] + [
                {"kind": "place", **item}
                for item in resolution_report["ambiguous_places"]
            ],
            "missing_raw_notes": resolution_report["missing_raw_notes"],
        },
        "time": {"unresolved": time_resolution_report["unresolved_times"]},
        "entities": {
            "invalid_fields": resolution_report["invalid_entity_fields"],
            "coerced_fields": resolution_report["coerced_entity_fields"],
        },
        "chapter_assets": {"missing": missing_chapter_assets},
    }

    final_payload = {
        "schema_version": SCHEMA_VERSION,
        "tool_version": TOOL_VERSION,
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "memoirs": memoirs_out,
        "graph": graph,
        "people_index": people_index,
        "places_index": places_index,
        "places_meta": {k: v for k, v in places_meta.items() if v},
        "issues": issues,
    }

    cache_dir = os.path.join(MEMOIRS_DIR, CACHE_DIRNAME)
    out_path = os.path.join(cache_dir, MANIFEST_FILENAME)
    atomic_write_text(out_path, json.dumps(final_payload, ensure_ascii=False, indent=2))

    report_path = os.path.join(MEMOIRS_DIR, RESOLUTION_REPORT_FILENAME)
    atomic_write_text(report_path, json.dumps(resolution_report, ensure_ascii=False, indent=2))

    time_report_path = os.path.join(MEMOIRS_DIR, TIME_RESOLUTION_REPORT_FILENAME)
    atomic_write_text(time_report_path, json.dumps(time_resolution_report, ensure_ascii=False, indent=2))

    top_places = [k for k in places_index if not places_meta.get(
        k, {}).get("parent")]
    sub_places = [k for k in places_index if places_meta.get(
        k, {}).get("parent")]
    print(f"Compiled -> {out_path}")
    print(f"  Periods       : {list(all_data.keys())}")
    print(f"  People        : {list(people_index.keys())}")
    print(f"  Places (top)  : {top_places}")
    print(f"  Places (child): {sub_places}")
    print(
        f"  Graph         : {len(graph['nodes'])} nodes, {len(graph['links'])} links")
    issue_count = sum(
        len(value) if isinstance(value, list) else 0
        for group in issues.values()
        for value in group.values()
    )
    print(f"  Issues        : {issue_count}")
    if resolution_report["ambiguous_people"] or resolution_report["ambiguous_places"]:
        print(f"  Alias report  : {report_path}")
    if time_resolution_report["unresolved_times"]:
        print(f"  Time report   : {time_report_path}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Compile memoirs/periods into memoirs/.cache/memoirs.manifest.json (schema v2)."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Keep the first entry when duplicate event refs are found and report the rest.",
    )
    args = parser.parse_args()
    build_api(force=args.force)
