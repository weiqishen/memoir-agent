"""
build_memoir_api.py — 数据编译器
"""

import os
import json
import re
import shutil
import sys
import yaml

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from entity_resolver import EntityResolver, normalize_alias
from time_spec import parse_time_spec

WORKSPACE_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "../../../../"))
MEMOIRS_DIR = os.path.join(WORKSPACE_DIR, "memoirs")
PERIODS_DIR = os.path.join(MEMOIRS_DIR, "periods")
WEBAPP_PUBLIC_DIR = os.path.join(MEMOIRS_DIR, "webapp", "public")
ALIAS_REGISTRY = os.path.join(MEMOIRS_DIR, "entities.yaml")
MANIFEST_FILENAME = "memoirs.manifest.json"
RESOLUTION_REPORT_FILENAME = ".entity_resolution_report.json"
TIME_RESOLUTION_REPORT_FILENAME = ".time_resolution_report.json"


def normalize_entity_key(value: str):
    """Normalize entity keys for case-insensitive and whitespace-tolerant matching."""
    return normalize_alias(value)


def load_entity_registry_document():
    """Load the registry file and normalize the top-level shape."""
    if not os.path.exists(ALIAS_REGISTRY):
        return {"people": {}, "places": {}}

    with open(ALIAS_REGISTRY, "r", encoding="utf-8") as f:
        reg = yaml.safe_load(f) or {}
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


def build_registry_maps(reg):
    """Build canonical maps for entities and normalized lookup maps for tolerant matching."""
    people_map: dict[str, str] = {}
    places_map: dict[str, str] = {}
    people_map_normalized: dict[str, str] = {}
    places_map_normalized: dict[str, str] = {}
    places_meta: dict[str, dict] = {}

    for canonical, meta in reg["people"].items():
        people_map[canonical] = canonical
        people_map_normalized[normalize_entity_key(canonical)] = canonical
        for alias in (meta or {}).get("aliases", []):
            alias_key = str(alias)
            people_map[alias_key] = canonical
            people_map_normalized[normalize_entity_key(alias_key)] = canonical

    for canonical, meta in reg["places"].items():
        places_map[canonical] = canonical
        places_map_normalized[normalize_entity_key(canonical)] = canonical
        parent_key = canonical.split("·", 1)[0] if "·" in canonical else ""
        for alias in (meta or {}).get("aliases", []):
            alias_key = str(alias)
            places_map[alias_key] = canonical
            places_map_normalized[normalize_entity_key(alias_key)] = canonical
            # Child-place aliases are often stored as local names like "commuter lot".
            # Also map "parent·alias" so extracted FQN-style aliases resolve correctly.
            if parent_key and "·" not in alias_key:
                fq_alias_key = f"{parent_key}·{alias_key}"
                places_map_normalized[normalize_entity_key(fq_alias_key)] = canonical
        m = meta or {}
        entry: dict = {}
        if "display" in m:
            entry["display"] = m["display"]
        if "parent" in m:
            entry["parent"] = m["parent"]
        if entry:
            places_meta[canonical] = entry
    return people_map, places_map, people_map_normalized, places_map_normalized, places_meta


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


def parse_timeline(content: str):
    try:
        data = yaml.safe_load(content)
        if not data:
            return {"period": "", "entries": []}
        return {"period": data.get("period", ""), "entries": data.get("entries", [])}
    except yaml.YAMLError as e:
        print(f"Warning: {e}")
        return {"period": "", "entries": []}


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


def graph_person_id(canonical: str) -> str:
    """Build a graph-only person node id that cannot collide with place ids."""
    return f"person:{canonical}"


def graph_place_id(canonical: str) -> str:
    """Build a graph-only place node id that cannot collide with person ids."""
    return f"place:{canonical}"


def export_chapter_assets(period: str, chapter_dir: str, chapter_content: str):
    """Rewrite chapter-local asset references to web paths and copy files into public/assets."""
    web_assets_dir = os.path.join(WEBAPP_PUBLIC_DIR, "assets", period)
    os.makedirs(web_assets_dir, exist_ok=True)

    def replace_asset(match):
        alt_text = match.group(1)
        asset_path = match.group(2).strip()

        if re.match(r"^(?:https?:)?//", asset_path) or asset_path.startswith("/assets/"):
            return match.group(0)

        source_path = os.path.normpath(os.path.join(chapter_dir, asset_path))
        if not os.path.exists(source_path) or not os.path.isfile(source_path):
            return match.group(0)

        filename = os.path.basename(source_path)
        target_path = os.path.join(web_assets_dir, filename)
        shutil.copy2(source_path, target_path)
        return f"![{alt_text}](/assets/{period}/{filename})"

    return re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', replace_asset, chapter_content)


def publish_chapter_markdown(period: str, filename: str, chapter_content: str):
    """Publish chapter markdown to webapp/public/chapters and return web path."""
    public_period_dir = os.path.join(WEBAPP_PUBLIC_DIR, "chapters", period)
    os.makedirs(public_period_dir, exist_ok=True)
    chapter_output_path = os.path.join(public_period_dir, filename)
    with open(chapter_output_path, "w", encoding="utf-8") as chapter_file:
        chapter_file.write(chapter_content)
    return f"/chapters/{period}/{filename}"


def build_api():
    if not os.path.exists(PERIODS_DIR):
        print(f"ERROR: periods dir not found: {PERIODS_DIR}")
        return

    # Rebuild published chapter markdown from scratch to avoid stale files.
    published_chapters_root = os.path.join(WEBAPP_PUBLIC_DIR, "chapters")
    if os.path.exists(published_chapters_root):
        shutil.rmtree(published_chapters_root)

    registry_doc = load_entity_registry_document()
    resolver = EntityResolver(registry_doc)
    places_meta = resolver.places_meta
    new_people_added = []
    new_places_added = []
    resolution_report = {
        "ambiguous_people": [],
        "ambiguous_places": [],
        "unknown_people_auto_added": [],
        "unknown_places_auto_added": [],
        "resolved_people_aliases": [],
        "resolved_places_aliases": [],
        "missing_raw_notes": [],
        "invalid_entity_fields": [],
    }
    time_resolution_report = {
        "unresolved_times": [],
    }

    # ── 读取 period 数据 ──────────────────────────────────────────────────────
    all_data: dict = {}
    for item in sorted(os.listdir(PERIODS_DIR)):
        period_dir = os.path.join(PERIODS_DIR, item)
        if not os.path.isdir(period_dir):
            continue
        pd: dict = {"timeline": {}, "chapters": [], "raw_notes": {}}

        tl = os.path.join(period_dir, "timeline.yaml")
        if os.path.exists(tl):
            with open(tl, "r", encoding="utf-8") as f:
                pd["timeline"] = parse_timeline(f.read())
            for entry in pd["timeline"].get("entries", []):
                if isinstance(entry, dict):
                    attach_time_metadata(item, entry, time_resolution_report)

        ch_dir = os.path.join(period_dir, "chapters")
        if os.path.exists(ch_dir):
            for ch in sorted(os.listdir(ch_dir)):
                if ch.endswith(".md"):
                    chapter_path = os.path.join(ch_dir, ch)
                    with open(chapter_path, "r", encoding="utf-8") as f:
                        chapter_content = export_chapter_assets(period=item, chapter_dir=ch_dir, chapter_content=f.read())
                        chapter_web_path = publish_chapter_markdown(period=item, filename=ch, chapter_content=chapter_content)
                        pd["chapters"].append(
                            {"filename": ch, "path": chapter_web_path})

        rn_dir = os.path.join(period_dir, "raw_notes")
        if os.path.exists(rn_dir):
            for rn in os.listdir(rn_dir):
                if rn.endswith(".md"):
                    with open(os.path.join(rn_dir, rn), "r", encoding="utf-8") as f:
                        pd["raw_notes"][rn] = f.read()

        all_data[item] = pd

    # ── 图谱 + 索引 ───────────────────────────────────────────────────────────
    graph: dict = {"nodes": [], "links": []}
    added_nodes: set = set()
    added_links: set = set()   # (source, target) dedup for graph edges
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
        if value in (None, ""):
            return []
        if isinstance(value, list):
            return value
        resolution_report["invalid_entity_fields"].append(
            {
                "field": field,
                "value_type": type(value).__name__,
                "raw_note": raw_note,
                "event_ref": event_ref,
            }
        )
        return []

    for period, data in all_data.items():
        if "entries" not in data.get("timeline", {}):
            continue

        for entry in data["timeline"]["entries"]:
            event_name = str(entry.get("event", "")).strip()
            if not event_name:
                continue
            event_ref = build_event_ref(period, entry)
            event_node_id = graph_event_id(event_ref)

            _ensure_node(event_node_id, group=2, name=event_name, extra={"event_ref": event_ref})

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

                # Places → graph + index
                for pl in _entity_values(meta, "places", event_ref, rn):
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
                            parts = canonical.split("·", 1)
                            parent_key, display_name = parts[0], parts[1]
                            places_meta[canonical] = {
                                "display": display_name, "parent": parent_key}
                            # Optional: also track the parent if completely new
                            if parent_key not in registry_doc["places"]:
                                new_places_added.append(parent_key)
                        new_places_added.append(canonical)
                        resolution_report["unknown_places_auto_added"].append(
                            {"value": str_pl, "canonical": canonical, "event_ref": event_ref}
                        )

                    pm = places_meta.get(canonical, {})
                    parent = pm.get("parent")
                    place_node_id = graph_place_id(canonical)
                    place_name = pm.get("display", canonical)

                    if parent:
                        parent_node_id = graph_place_id(parent)
                        _ensure_node(parent_node_id, group=3, name=parent)
                        _ensure_node(place_node_id, group=3, name=place_name, extra={"parent": parent})
                        _add_link(parent_node_id, place_node_id, "contains")
                        _add_link(place_node_id, event_node_id, "occurred_at")
                    else:
                        # Top-level place: graph node + link to event
                        _ensure_node(place_node_id, group=3, name=place_name)
                        _add_link(place_node_id, event_node_id, "occurred_at")

                    _dedup_append_event_ref(places_index, canonical, event_ref)

                    # Roll up sub-location entries to parent
                    if parent:
                        _dedup_append_event_ref(places_index, parent, event_ref)

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

    # ── 输出 ─────────────────────────────────────────────────────────────────
    # Strip raw_notes from output — body text is only needed at compile time;
    # the frontend only reads timeline + chapters.
    memoirs_out = {
        period: {"timeline": pd.get("timeline", {}),
                 "chapters": pd.get("chapters", [])}
        for period, pd in all_data.items()
    }

    final_payload = {
        "memoirs":      memoirs_out,
        "graph":        graph,
        "people_index": people_index,
        "places_index": places_index,
        "places_meta":  {k: v for k, v in places_meta.items() if v},
    }

    os.makedirs(WEBAPP_PUBLIC_DIR, exist_ok=True)
    out_path = os.path.join(WEBAPP_PUBLIC_DIR, MANIFEST_FILENAME)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(final_payload, f, ensure_ascii=False, indent=2)

    report_path = os.path.join(MEMOIRS_DIR, RESOLUTION_REPORT_FILENAME)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(resolution_report, f, ensure_ascii=False, indent=2)

    time_report_path = os.path.join(MEMOIRS_DIR, TIME_RESOLUTION_REPORT_FILENAME)
    with open(time_report_path, "w", encoding="utf-8") as f:
        json.dump(time_resolution_report, f, ensure_ascii=False, indent=2)

    # Clean up legacy output to enforce the new single-manifest contract.
    legacy_out_path = os.path.join(WEBAPP_PUBLIC_DIR, "memoirs.json")
    if os.path.exists(legacy_out_path):
        os.remove(legacy_out_path)

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
    if resolution_report["ambiguous_people"] or resolution_report["ambiguous_places"]:
        print(f"  Alias report  : {report_path}")


if __name__ == "__main__":
    build_api()
