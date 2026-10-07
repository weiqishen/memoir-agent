// ─── Graph Color Palette ──────────────────────────────────────────────────────
// Colors used by react-force-graph-2d for node/link rendering.
// Must be plain color values (not CSS variables) since the canvas API can't read them.
// Groups: 1=period  2=event  3=place  4=person

export const GRAPH_COLORS = {
  light: {
    bg:     'rgba(219, 205, 186, 0.1)',
    period: '#9a8fb5',   // muted violet — period hubs
    event:  '#4A6C6F',   // teal — memoir events
    place:  '#8b7355',   // warm brown — locations
    person: '#5a7a6e',   // sage green — people
    link:   'rgba(42, 39, 35, 0.15)',
  },
  dark: {
    bg:     '#21252b',
    period: '#c678dd',   // violet — period hubs
    event:  '#61afef',
    place:  '#d19a66',
    person: '#56b6c2',
    link:   'rgba(171, 178, 191, 0.1)',
  },
} as const;
