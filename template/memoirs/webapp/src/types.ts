// ─── Domain Types ────────────────────────────────────────────────────────────

export interface Entry {
  date: string;
  event: string;
  summary: string;
  related_files?: string[];
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
  period?: string;
  entry?: Entry;
  parent?: string;
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
}

/** Hierarchy / display metadata for places */
export type PlacesMeta = Record<string, { display?: string; parent?: string }>;

export interface APIPayload {
  memoirs:      Record<string, MemoirData>;
  graph:        { nodes: GraphNode[]; links: GraphLink[] };
  people_index: PeopleIndex;
  places_index: PlacesIndex;
  places_meta:  PlacesMeta;
}

// ─── UI Types ─────────────────────────────────────────────────────────────────

export type Theme    = 'light' | 'dark';
export type Lang     = 'zh' | 'en';
export type ViewMode = 'chapters' | 'year' | 'people' | 'location' | 'graph';

export type SelectedItem =
  | { type: 'event'; period: string; entry: Entry }
  | { type: 'tag';   tagNode: GraphNode };

/** { personName: [{period, entry}, ...] } */
export type PeopleIndex = Record<string, { period: string; entry: Entry }[]>;
/** { placeName:  [{period, entry}, ...] } */
export type PlacesIndex = Record<string, { period: string; entry: Entry }[]>;
