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
  path: string;
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

export interface APIPayload {
  memoirs:      Record<string, MemoirData>;
  graph:        { nodes: GraphNode[]; links: GraphLink[] };
  people_index: EntityEventIndex;
  places_index: EntityEventIndex;
  places_meta:  PlacesMeta;
}

// ─── UI Types ─────────────────────────────────────────────────────────────────

export type Theme    = 'light' | 'dark';
export type Lang     = 'zh' | 'en';
export type ViewMode = 'chapters' | 'year' | 'people' | 'location' | 'graph';

export type SelectedItem =
  | { type: 'event'; period: string; entry: Entry }
  | { type: 'tag';   tagNode: GraphNode };
