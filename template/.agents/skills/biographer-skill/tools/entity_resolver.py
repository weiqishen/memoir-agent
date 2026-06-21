#!/usr/bin/env python3
"""Entity alias resolver for people and hierarchical places."""

from __future__ import annotations

import re
import unicodedata
from typing import Any


SEPARATOR_RE = re.compile(r"[\s\-_./\\|:：,，;；、·・•]+")


def normalize_alias(value: Any) -> str:
    """Normalize an alias for case-insensitive, width-insensitive matching."""
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = "".join(ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch))
    text = SEPARATOR_RE.sub(" ", text.casefold()).strip()
    return re.sub(r"\s+", " ", text)


class ResolutionResult:
    """Result object returned by entity resolution."""

    def __init__(self, status: str, canonical: str | None = None, candidates: list[str] | None = None):
        self.status = status
        self.canonical = canonical
        self.candidates = candidates or []


class AliasIndex:
    """Many-to-one alias index that preserves ambiguity instead of overwriting it."""

    def __init__(self):
        self._items: dict[str, list[str]] = {}

    def add(self, alias: Any, canonical: str) -> None:
        key = normalize_alias(alias)
        if not key:
            return
        candidates = self._items.setdefault(key, [])
        if canonical not in candidates:
            candidates.append(canonical)

    def resolve(self, alias: Any) -> ResolutionResult:
        candidates = self._items.get(normalize_alias(alias), [])
        if len(candidates) == 1:
            return ResolutionResult("resolved", candidates[0], candidates)
        if len(candidates) > 1:
            return ResolutionResult("ambiguous", None, candidates)
        return ResolutionResult("unknown")


def _as_meta(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _string_values(*values: Any) -> list[str]:
    result: list[str] = []
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text and text not in result:
            result.append(text)
    return result


def _entity_aliases(canonical: str, meta: dict[str, Any]) -> list[str]:
    aliases = _string_values(canonical, meta.get("display"))
    for alias in meta.get("aliases") or []:
        aliases.extend(_string_values(alias))
    return aliases


class EntityResolver:
    """Resolve people and places against the entities.yaml registry."""

    def __init__(self, registry: dict[str, Any]):
        self.registry = registry
        self.people_index = AliasIndex()
        self.place_index = AliasIndex()
        self.places_meta: dict[str, dict[str, Any]] = {}
        self._build_people_index()
        self._build_place_index()

    def _build_people_index(self) -> None:
        for canonical, raw_meta in (self.registry.get("people") or {}).items():
            meta = _as_meta(raw_meta)
            for alias in _entity_aliases(str(canonical), meta):
                self.people_index.add(alias, str(canonical))

    def _build_place_index(self) -> None:
        places = self.registry.get("places") or {}
        place_aliases: dict[str, list[str]] = {}

        for canonical, raw_meta in places.items():
            canonical_text = str(canonical)
            meta = _as_meta(raw_meta)
            place_aliases[canonical_text] = _entity_aliases(canonical_text, meta)

            entry: dict[str, Any] = {}
            if "display" in meta:
                entry["display"] = meta["display"]
            if "parent" in meta:
                entry["parent"] = meta["parent"]
            if entry:
                self.places_meta[canonical_text] = entry

        for canonical, raw_meta in places.items():
            canonical_text = str(canonical)
            meta = _as_meta(raw_meta)
            parent = str(meta.get("parent") or "")

            for alias in place_aliases.get(canonical_text, []):
                self.place_index.add(alias, canonical_text)

            if not parent:
                continue

            local_name = canonical_text.split("·", 1)[1] if "·" in canonical_text else canonical_text
            child_aliases = _string_values(local_name, meta.get("display"))
            for alias in meta.get("aliases") or []:
                child_aliases.extend(_string_values(alias))

            for parent_alias in place_aliases.get(parent, [parent]):
                for child_alias in child_aliases:
                    self.place_index.add(f"{parent_alias} {child_alias}", canonical_text)

    def resolve_person(self, value: Any) -> ResolutionResult:
        return self.people_index.resolve(value)

    def resolve_place(self, value: Any) -> ResolutionResult:
        return self.place_index.resolve(value)

