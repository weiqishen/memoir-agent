#!/usr/bin/env python3
"""Deterministic parser for exact and fuzzy memoir event dates."""

from __future__ import annotations

import calendar
import re
import unicodedata


APPROXIMATE_PREFIXES = (
    "大约",
    "大概",
    "大致",
    "约",
    "around",
    "about",
    "circa",
    "ca.",
    "ca",
    "c.",
    "c",
)

CHINESE_QUARTERS = {
    "一": 1,
    "1": 1,
    "二": 2,
    "两": 2,
    "2": 2,
    "三": 3,
    "3": 3,
    "四": 4,
    "4": 4,
}

SEASONS = {
    "春": ("SP", "spring", "03-01", "05-31"),
    "春天": ("SP", "spring", "03-01", "05-31"),
    "春季": ("SP", "spring", "03-01", "05-31"),
    "夏": ("SU", "summer", "06-01", "08-31"),
    "夏天": ("SU", "summer", "06-01", "08-31"),
    "夏季": ("SU", "summer", "06-01", "08-31"),
    "秋": ("AU", "autumn", "09-01", "11-30"),
    "秋天": ("AU", "autumn", "09-01", "11-30"),
    "秋季": ("AU", "autumn", "09-01", "11-30"),
    "冬": ("WI", "winter", "12-01", "12-31"),
    "冬天": ("WI", "winter", "12-01", "12-31"),
    "冬季": ("WI", "winter", "12-01", "12-31"),
}


class TimeSpec:
    def __init__(
        self,
        status: str,
        value: str = "",
        label: str = "",
        precision: str = "unknown",
        start: str = "",
        end: str = "",
        sort: str = "",
        approximate: bool = False,
        reason: str = "",
    ):
        self.status = status
        self.value = value
        self.label = label
        self.precision = precision
        self.start = start
        self.end = end
        self.sort = sort
        self.approximate = approximate
        self.reason = reason

    def to_manifest(self) -> dict:
        if self.status != "resolved":
            return {}
        return {
            "value": self.value,
            "label": self.label,
            "precision": self.precision,
            "start": self.start,
            "end": self.end,
            "sort": self.sort,
            "approximate": self.approximate,
        }


def normalize_time_text(raw: str) -> str:
    """Normalize full-width characters and surrounding whitespace."""
    text = unicodedata.normalize("NFKC", str(raw or "")).strip()
    return re.sub(r"\s+", " ", text)


def strip_approximate_prefix(text: str) -> tuple[str, bool]:
    lower = text.lower()
    for prefix in sorted(APPROXIMATE_PREFIXES, key=len, reverse=True):
        if lower.startswith(prefix):
            return text[len(prefix):].strip(" ：:-"), True
    return text, False


def _resolved(value: str, label: str, precision: str, start: str, end: str, approximate: bool) -> TimeSpec:
    if approximate:
        label = f"约{label}"
    return TimeSpec(
        status="resolved",
        value=value,
        label=label,
        precision=precision,
        start=start,
        end=end,
        sort=start,
        approximate=approximate,
    )


def _month_end(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}"


def _valid_year(year: int) -> bool:
    return 1 <= year <= 9999


def parse_time_spec(raw: str) -> TimeSpec:
    """Parse a memoir date string into a sortable range without inventing precision."""
    original = normalize_time_text(raw)
    if not original:
        return TimeSpec(status="invalid", reason="empty")

    text, approximate = strip_approximate_prefix(original)
    compact = text.replace(" ", "")

    day_match = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", compact)
    if day_match:
        year, month, day = (int(part) for part in day_match.groups())
        if not _valid_year(year) or not 1 <= month <= 12:
            return TimeSpec(status="invalid", reason="date out of range")
        if not 1 <= day <= calendar.monthrange(year, month)[1]:
            return TimeSpec(status="invalid", reason="date out of range")
        value = f"{year:04d}-{month:02d}-{day:02d}"
        return _resolved(value, value, "day", value, value, approximate)

    month_match = re.fullmatch(r"(\d{4})-(\d{1,2})", compact)
    if month_match:
        year, month = (int(part) for part in month_match.groups())
        if not _valid_year(year) or not 1 <= month <= 12:
            return TimeSpec(status="invalid", reason="month out of range")
        value = f"{year:04d}-{month:02d}"
        return _resolved(value, value, "month", f"{value}-01", _month_end(year, month), approximate)

    chinese_month_match = re.fullmatch(r"(\d{4})年(\d{1,2})月", compact)
    if chinese_month_match:
        year, month = (int(part) for part in chinese_month_match.groups())
        if not _valid_year(year) or not 1 <= month <= 12:
            return TimeSpec(status="invalid", reason="month out of range")
        value = f"{year:04d}-{month:02d}"
        return _resolved(value, value, "month", f"{value}-01", _month_end(year, month), approximate)

    quarter_match = re.fullmatch(r"(\d{4})[-_]?Q([1-4])", compact, flags=re.IGNORECASE)
    if quarter_match:
        year = int(quarter_match.group(1))
        quarter = int(quarter_match.group(2))
        if not _valid_year(year):
            return TimeSpec(status="invalid", reason="year out of range")
        start_month = (quarter - 1) * 3 + 1
        end_month = start_month + 2
        value = f"{year:04d}-Q{quarter}"
        return _resolved(
            value,
            f"{year:04d} Q{quarter}",
            "quarter",
            f"{year:04d}-{start_month:02d}-01",
            _month_end(year, end_month),
            approximate,
        )

    invalid_quarter_match = re.fullmatch(r"(\d{4})[-_]?Q(\d+)", compact, flags=re.IGNORECASE)
    if invalid_quarter_match:
        return TimeSpec(status="invalid", reason="quarter out of range")

    chinese_quarter_match = re.fullmatch(r"(\d{4})年第?([一二两三四1-4])季度", compact)
    if chinese_quarter_match:
        year = int(chinese_quarter_match.group(1))
        quarter = CHINESE_QUARTERS[chinese_quarter_match.group(2)]
        start_month = (quarter - 1) * 3 + 1
        end_month = start_month + 2
        value = f"{year:04d}-Q{quarter}"
        return _resolved(
            value,
            f"{year:04d} Q{quarter}",
            "quarter",
            f"{year:04d}-{start_month:02d}-01",
            _month_end(year, end_month),
            approximate,
        )

    season_match = re.fullmatch(r"(\d{4})年?(.+)", compact)
    if season_match and season_match.group(2) in SEASONS:
        year = int(season_match.group(1))
        code, label, start_suffix, end_suffix = SEASONS[season_match.group(2)]
        if not _valid_year(year):
            return TimeSpec(status="invalid", reason="year out of range")
        value = f"{year:04d}-{code}"
        return _resolved(
            value,
            f"{year:04d} {label}",
            "season",
            f"{year:04d}-{start_suffix}",
            f"{year:04d}-{end_suffix}",
            approximate,
        )

    year_match = re.fullmatch(r"(\d{4})年?", compact)
    if year_match:
        year = int(year_match.group(1))
        if not _valid_year(year):
            return TimeSpec(status="invalid", reason="year out of range")
        value = f"{year:04d}"
        return _resolved(value, value, "year", f"{value}-01-01", f"{value}-12-31", approximate)

    bare_month_match = re.fullmatch(r"\d{1,2}月", compact)
    if bare_month_match:
        return TimeSpec(status="ambiguous", reason="month lacks year")

    return TimeSpec(status="invalid", reason="unsupported format")
