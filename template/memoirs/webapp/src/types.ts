// ─── Domain Types ────────────────────────────────────────────────────────────

export interface Entry {
  id?: string;
  date: string;
  time?: TimeSpec;
  event: string;
  summary: string;
  related_files?: string[];
}

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

export interface Timeline {
  period: string;
  entries: Entry[];
}

export interface Chapter {
  filename: string;
  /** Embedded chapter markdown (schema v2 manifests). */
  content?: string;
  /** Legacy schema v1 fetch path; ignored when content is present. */
  path?: string;
}

export interface MemoirData {
  timeline: Timeline;
  chapters: Chapter[];
}

export interface GraphNode {
  id: string;
  name: string;
  group: number;   // 2=event  3=place  4=person
  event_ref?: string;
  parent?: string;
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type?: 'mentions_person' | 'occurred_at' | 'contains' | string;
}

/** Hierarchy / display metadata for places */
export type PlacesMeta = Record<string, { display?: string; parent?: string }>;
export type EventRef = string;
export type EntityEventIndex = Record<string, EventRef[]>;
export type IndexRecord = { period: string; entry: Entry };
export type ResolvedEntityIndex = Record<string, IndexRecord[]>;

export interface GraphIssues {
  graph?: {
    duplicate_event_refs?: string[];
    place_cycles?: string[][];
    missing_parents?: { place: string; inferred_parent: string; source?: string }[];
    unknown_entities?: unknown[];
    ambiguous_entities?: unknown[];
    missing_raw_notes?: unknown[];
  };
  time?: { unresolved?: unknown[] };
  entities?: { invalid_fields?: unknown[]; coerced_fields?: unknown[] };
  chapter_assets?: { missing?: unknown[] };
}

export interface APIPayload {
  schema_version?: number;
  tool_version?: string;
  memoirs:      Record<string, MemoirData>;
  graph:        { nodes: GraphNode[]; links: GraphLink[] };
  people_index: EntityEventIndex;
  places_index: EntityEventIndex;
  places_meta:  PlacesMeta;
  issues?:      GraphIssues;
}

// ─── UI Types ─────────────────────────────────────────────────────────────────

export type Theme    = 'light' | 'dark';
export type Lang     = 'zh' | 'en';
export type ViewMode = 'chapters' | 'year' | 'people' | 'location' | 'graph';

export type SelectedItem =
  | { type: 'event'; period: string; entry: Entry }
  | { type: 'tag';   tagNode: GraphNode };
