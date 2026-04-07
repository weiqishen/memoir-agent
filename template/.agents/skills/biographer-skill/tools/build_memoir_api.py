"""
build_memoir_api.py — 数据编译器
"""

import os
import json
import re
import shutil
import yaml

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "../../../../"))
MEMOIRS_DIR = os.path.join(WORKSPACE_DIR, "memoirs")
PERIODS_DIR = os.path.join(MEMOIRS_DIR, "periods")
WEBAPP_PUBLIC_DIR = os.path.join(MEMOIRS_DIR, "webapp", "public")
ALIAS_REGISTRY = os.path.join(MEMOIRS_DIR, "entities.yaml")


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
    """返回 (people_map, places_map, places_meta)
    people_map / places_map : {alias -> canonical}
    places_meta : {canonical -> {display?, parent?}}
    """
    people_map: dict[str, str] = {}
    places_map: dict[str, str] = {}
    places_meta: dict[str, dict] = {}
    for canonical, meta in reg["people"].items():
        people_map[canonical] = canonical
        for alias in (meta or {}).get("aliases", []):
            people_map[str(alias)] = canonical
    for canonical, meta in reg["places"].items():
        places_map[canonical] = canonical
        for alias in (meta or {}).get("aliases", []):
            places_map[str(alias)] = canonical
        m = meta or {}
        entry: dict = {}
        if "display" in m:
            entry["display"] = m["display"]
        if "parent" in m:
            entry["parent"] = m["parent"]
        if entry:
            places_meta[canonical] = entry
    return people_map, places_map, places_meta


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


def build_api():
    if not os.path.exists(PERIODS_DIR):
        print(f"ERROR: periods dir not found: {PERIODS_DIR}")
        return

    registry_doc = load_entity_registry_document()
    people_map, places_map, places_meta = build_registry_maps(registry_doc)
    new_people_added = []
    new_places_added = []

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

        ch_dir = os.path.join(period_dir, "chapters")
        if os.path.exists(ch_dir):
            for ch in sorted(os.listdir(ch_dir)):
                if ch.endswith(".md"):
                    chapter_path = os.path.join(ch_dir, ch)
                    with open(chapter_path, "r", encoding="utf-8") as f:
                        chapter_content = export_chapter_assets(period=item, chapter_dir=ch_dir, chapter_content=f.read())
                        pd["chapters"].append(
                            {"filename": ch, "content": chapter_content})

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

    def _add_link(src: str, tgt: str, **kw):
        key = (src, tgt)
        if key not in added_links:
            link = {"source": src, "target": tgt}
            link.update(kw)
            graph["links"].append(link)
            added_links.add(key)

    def _dedup_append(index: dict, key: str, record: dict):
        dedup = (record["entry"].get("date", ""),
                 record["entry"].get("event", ""))
        existing = {(r["entry"].get("date", ""), r["entry"].get("event", ""))
                    for r in index.get(key, [])}
        if dedup not in existing:
            index.setdefault(key, []).append(record)

    for period, data in all_data.items():
        if "entries" not in data.get("timeline", {}):
            continue

        for entry in data["timeline"]["entries"]:
            event_id = entry.get("event")
            if not event_id:
                continue

            _ensure_node(event_id, group=2, extra={
                         "period": period, "entry": entry})

            for file_path in entry.get("related_files", []):
                rn = os.path.basename(file_path)
                raw = data["raw_notes"].get(rn, "")
                meta, _ = parse_frontmatter(raw)
                record = {"period": period, "entry": entry}

                # People → graph nodes (group 4) + links to event + index
                for p in meta.get("people", []):
                    str_p = str(p).strip()
                    if not str_p:
                        continue
                    canonical = people_map.get(str_p, str_p)

                    if canonical not in people_map:
                        people_map[canonical] = canonical
                        people_map[str_p] = canonical
                        new_people_added.append(canonical)

                    _ensure_node(canonical, group=4)
                    # ← connects to event
                    _add_link(canonical, event_id)
                    _dedup_append(people_index, canonical, record)

                # Places → graph + index
                for pl in meta.get("places", []):
                    str_pl = str(pl).strip()
                    if not str_pl:
                        continue
                    canonical = places_map.get(str_pl, str_pl)

                    if canonical not in places_map:
                        places_map[canonical] = canonical
                        places_map[str_pl] = canonical
                        if "·" in canonical:
                            # split by first dot only just in case
                            parts = canonical.split("·", 1)
                            parent_key, display_name = parts[0], parts[1]
                            places_meta[canonical] = {
                                "display": display_name, "parent": parent_key}
                            # Optional: also track the parent if completely new
                            if parent_key not in places_map:
                                places_map[parent_key] = parent_key
                                new_places_added.append(parent_key)
                        new_places_added.append(canonical)

                    pm = places_meta.get(canonical, {})
                    parent = pm.get("parent")

                    if parent:
                        # Sub-location: NOT a separate graph node.
                        # Edge from parent place → event instead.
                        _ensure_node(parent, group=3)
                        # ← parent connected
                        _add_link(parent, event_id)
                    else:
                        # Top-level place: graph node + link to event
                        _ensure_node(canonical, group=3)
                        _add_link(canonical, event_id)      # ← place connected

                    _dedup_append(places_index, canonical, record)

                    # Roll up sub-location entries to parent
                    if parent:
                        _dedup_append(places_index, parent, record)

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
    out_path = os.path.join(WEBAPP_PUBLIC_DIR, "memoirs.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(final_payload, f, ensure_ascii=False, indent=2)

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


if __name__ == "__main__":
    build_api()
