# Fuzzy Time Support Design

## Goal

Support memoir events whose time is known only at coarse precision, such as a year, month, quarter, season, or approximate period, without breaking existing exact-date timelines, entity indexes, graph event references, chapter lookup, or workflow guards.

## Current Constraints

- `timeline.yaml` entries currently use `date` as a plain string.
- `raw_notes/*.md` frontmatter also records `date` as a plain string.
- `build_memoir_api.py` passes timeline entries through to `memoirs.manifest.json` and uses `build_event_ref(period, entry)` for indexes and graph links.
- Event references already prefer `entry.id`, which is important because fuzzy dates make `period|date|event` less stable.
- `App.tsx` currently groups years with `(entry.date ?? '').slice(0, 4)`.
- `App.tsx` finds chapters through `related_files` suffix first, then falls back to `chapter.filename.startsWith(entry.date)`.
- `workflow_guard.py` blocks `/build` when no chapter filename starts with `entry.date`.
- `timeline_manager.py` uses `date` in timeline entries, raw-note frontmatter, and asset filenames.

## Options

### Option A: Additive Normalized Time Metadata

Keep `date` as the human-authored legacy field, then normalize it during build into a structured `time` object on each manifest entry.

This is the recommended option. It is backwards-compatible, does not force users or existing raw notes to migrate immediately, and gives the frontend/workflow code stable sort and display data.

### Option B: Replace `date` With a Structured Object

Change timeline entries from `date: "2024-09"` to `time: { value, precision }`.

This is cleaner long-term but too disruptive now. It touches every prompt, script, workflow guard, and existing timeline. It also makes manual YAML entry less convenient.

### Option C: Fake Missing Precision With Default Exact Dates

Convert `2024` to `2024-01-01` and `2024-Q3` to `2024-07-01`.

This is simple but loses meaning. Users would see exact-looking dates that were never known, and future sorting/search bugs would be hard to diagnose.

## Recommended Data Contract

Timeline authors continue writing:

```yaml
period: US_PhD
entries:
  - id: uf_first_semester
    date: "2024-Q3"
    event: "刚到佛罗里达的第一个学期"
    summary: "只记得大概发生在第三季度。"
    related_files: ["raw_notes/uf_first_semester.md"]
```

The build step emits:

```json
{
  "id": "uf_first_semester",
  "date": "2024-Q3",
  "time": {
    "value": "2024-Q3",
    "label": "2024 Q3",
    "precision": "quarter",
    "start": "2024-07-01",
    "end": "2024-09-30",
    "sort": "2024-07-01",
    "approximate": false
  },
  "event": "刚到佛罗里达的第一个学期",
  "summary": "只记得大概发生在第三季度。"
}
```

`date` remains the display fallback and compatibility field. New code should use `entry.time` when present.

## Accepted Time Syntax

Phase 1 should support deterministic forms only:

| User input | Precision | Canonical value | Range |
| --- | --- | --- | --- |
| `2024-09-18` | `day` | `2024-09-18` | `2024-09-18` to `2024-09-18` |
| `2024-09` / `2024年9月` | `month` | `2024-09` | month start to month end |
| `2024` / `2024年` | `year` | `2024` | `2024-01-01` to `2024-12-31` |
| `2024-Q3` / `2024年第三季度` / `2024年三季度` | `quarter` | `2024-Q3` | quarter start to quarter end |
| `2024春` / `2024年春天` | `season` | `2024-SP` | configurable season range |

Bare month values such as `9月` should not be accepted initially because the current period schema has no authoritative year range. The parsing prompt should ask for at least a year, or use the surrounding timeline to infer a year and write the inferred value explicitly.

Approximate forms can be accepted with a marker:

| User input | Canonical value | approximate |
| --- | --- | --- |
| `约2024年` | `2024` | `true` |
| `大约2024-Q3` | `2024-Q3` | `true` |
| `circa 2024` | `2024` | `true` |

Invalid or ambiguous values should not silently downgrade to strings. The build report should record them in `memoirs/.time_resolution_report.json`.

## Backend Changes

Create `template/.agents/skills/biographer-skill/tools/time_spec.py`.

Responsibilities:

- `parse_time_spec(raw: str) -> TimeSpec`
- Normalize English and Chinese forms.
- Strip common approximate prefixes.
- Validate ranges and leap years.
- Return `status` values: `resolved`, `ambiguous`, `invalid`.
- Keep parsing deterministic; do not use locale-dependent `datetime.strptime` for partial dates.

Update `build_memoir_api.py`:

- For each timeline entry, parse `entry["date"]`.
- Attach `entry["time"]` to the manifest copy.
- Preserve original `entry["date"]`.
- Emit `memoirs/.time_resolution_report.json` with invalid or ambiguous date values.
- Keep `build_event_ref()` unchanged except documentation should recommend `id` for fuzzy-time entries.
- Sort entries only if the project opts into sorting; otherwise keep YAML order and use `time.sort` for derived indexes.

Update `timeline_manager.py`:

- Accept fuzzy `--date` values.
- Sanitize `date` before using it in asset filenames.
- Prefer `--id` or stable `--file-slug` as the durable event identity.
- Write the original date string into frontmatter and timeline.

Update `workflow_guard.py`:

- Replace `filename.startswith(date_text)` with a chapter-matching helper:
  1. Prefer matching by `related_files` suffix, mirroring `App.tsx`.
  2. Then match by `entry.id`.
  3. Then match by sanitized `date`.
- This prevents coarse dates like `2024` from incorrectly matching every `2024-*` chapter.

## Frontend Changes

Update `types.ts`:

```ts
export type TimePrecision = 'day' | 'month' | 'quarter' | 'season' | 'year' | 'unknown';

export interface TimeSpec {
  value: string;
  label: string;
  precision: TimePrecision;
  start?: string;
  end?: string;
  sort?: string;
  approximate?: boolean;
}

export interface Entry {
  id?: string;
  date: string;
  time?: TimeSpec;
  event: string;
  summary: string;
  related_files?: string[];
}
```

Add a frontend helper such as `timeModel.ts`:

- `getEntryTimeLabel(entry)` returns `entry.time?.label ?? entry.date`.
- `getEntryYear(entry)` returns `entry.time?.start?.slice(0, 4) ?? entry.date.slice(0, 4) ?? '未知'`.
- `compareEntriesByTime(a, b)` sorts by `time.sort`, then precision, then original order.
- `buildChapterMatchKeys(entry)` returns `related_files` suffix, `id`, sanitized date, and legacy exact date prefixes.

Update views:

- Timeline, people index, places index, and modal should display `getEntryTimeLabel(entry)`.
- Year grouping should use `getEntryYear(entry)`.
- Chapter lookup should use `buildChapterMatchKeys(entry)` instead of `filename.startsWith(entry.date)`.

## Prompt and Skill Changes

Update `prompts/parsing.md`:

- Allow coarse dates when the source only supports coarse time.
- Require explicit year for month/quarter/season values.
- Do not invent a day just to satisfy an exact-date format.
- If only a bare month or vague season is known, inspect nearby timeline context; if still unresolved, ask the user.
- Prefer adding `id` for entries whose date is not exact.

Update `prompts/synthesis.md`:

- Chapter filename should no longer require `YYYY-MM-DD-*`.
- Use a stable slug pattern:
  - Exact day: `2024-09-18-event_slug.md`
  - Month: `2024-09-event_slug.md`
  - Quarter: `2024-Q3-event_slug.md`
  - Year: `2024-event_slug.md`
- If `id` exists, filename may be `<time-value>-<id>.md`.

## Testing Plan

Python unit tests:

- `parse_time_spec("2024-09-18")`
- `parse_time_spec("2024-09")`
- `parse_time_spec("2024")`
- `parse_time_spec("2024-Q3")`
- `parse_time_spec("2024年第三季度")`
- `parse_time_spec("约2024年")`
- invalid dates: `2024-13`, `2024-Q5`, `9月`

Build integration tests:

- Manifest entries include normalized `time`.
- Existing exact-date fixtures remain unchanged except for added `time`.
- Entity and graph indexes still resolve fuzzy-time entries via `id`.
- Invalid dates appear in `.time_resolution_report.json`.
- Child place and alias behavior continues to work with fuzzy dates.

Workflow regression tests:

- A `2024` entry does not pass merely because `2024-09-other.md` exists.
- A `2024-Q3` entry passes when chapter filename contains the matching `id` or related-file suffix.

Frontend tests:

- Year index groups `2024-Q3`, `2024-09`, and `2024` under `2024`.
- Display uses `time.label`.
- Chapter lookup resolves fuzzy-time entries by `related_files` or `id`.

Packaging tests:

- `time_spec.py` is included in `npm pack --dry-run`.
- Empty template manifest remains valid with or without `time`.

## Migration Strategy

No immediate migration is required.

Existing timelines keep working because `date` remains supported. On the next build, exact dates will gain a `time` object in the generated manifest. Users can gradually add `id` to older entries, especially those whose dates are coarse or likely to be edited.

## Open Decision

The main product decision is season semantics. For a Chinese memoir, `春/夏/秋/冬` can be mapped by meteorological quarters or by colloquial ranges. The implementation should start with quarters and year/month/day first, then add seasons only after choosing a clear mapping.
