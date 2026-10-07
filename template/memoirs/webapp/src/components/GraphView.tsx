import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { APIPayload, GraphNode, SelectedItem, Theme, IndexRecord } from '../types';
import { GRAPH_COLORS } from '../constants/theme';
import type { Translations } from '../i18n';
import { getEventRefFromGraphNode } from '../graphModel';

interface Props {
  graph: APIPayload['graph'];
  eventLookup: Record<string, IndexRecord>;
  theme: Theme;
  onNodeClick: (item: SelectedItem) => void;
  onOpenPeriod?: (period: string) => void;
  t: Translations;
}

const PERIOD_PREFIX = 'period:';

function graphNodeId(value: string | GraphNode): string {
  return typeof value === 'object' ? value.id : value;
}

function withAlpha(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/** Knowledge graph — events connected to people, places and period hubs. */
export function GraphView({ graph, eventLookup, theme, onNodeClick, onOpenPeriod, t }: Props) {
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fittedRef = useRef(false);
  const colors = GRAPH_COLORS[theme];

  const [size, setSize] = useState({ width: 640, height: 560 });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hiddenGroups, setHiddenGroups] = useState<Set<number>>(() => new Set());

  // Responsive canvas: observe the container instead of hardcoding a size.
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const visibleGraph = useMemo(() => {
    if (hiddenGroups.size === 0) return graph;
    const nodes = graph.nodes.filter(node => !hiddenGroups.has(node.group));
    const ids = new Set(nodes.map(node => node.id));
    const links = graph.links.filter(link =>
      ids.has(graphNodeId(link.source)) && ids.has(graphNodeId(link.target))
    );
    return { nodes, links };
  }, [graph, hiddenGroups]);

  useEffect(() => {
    fittedRef.current = false;
  }, [visibleGraph]);

  const degrees = useMemo(() => {
    const map = new Map<string, number>();
    graph.links.forEach(link => {
      const source = graphNodeId(link.source);
      const target = graphNodeId(link.target);
      map.set(source, (map.get(source) ?? 0) + 1);
      map.set(target, (map.get(target) ?? 0) + 1);
    });
    return map;
  }, [graph.links]);

  const neighbors = useMemo(() => {
    if (!hoverId) return null;
    const set = new Set<string>([hoverId]);
    graph.links.forEach(link => {
      const source = graphNodeId(link.source);
      const target = graphNodeId(link.target);
      if (source === hoverId) set.add(target);
      if (target === hoverId) set.add(source);
    });
    return set;
  }, [hoverId, graph.links]);

  const groupColor = useCallback((group: number) => {
    switch (group) {
      case 1: return colors.period;
      case 2: return colors.event;
      case 3: return colors.place;
      case 4: return colors.person;
      default: return colors.event;
    }
  }, [colors]);

  const nodeColor = useCallback((node: any) => {
    const full = groupColor(node.group);
    if (neighbors && node.id !== hoverId && !neighbors.has(node.id)) {
      return withAlpha(full, 0.15);
    }
    return full;
  }, [groupColor, neighbors, hoverId]);

  const linkColor = useCallback((link: any) => {
    if (!neighbors) return colors.link;
    const source = graphNodeId(link.source);
    const target = graphNodeId(link.target);
    return neighbors.has(source) && neighbors.has(target)
      ? withAlpha(colors.event, 0.55)
      : withAlpha(colors.event, 0.08);
  }, [neighbors, colors]);

  const handleNodeClick = useCallback((node: any) => {
    if (node.group === 1) {
      const period = typeof node.id === 'string' && node.id.startsWith(PERIOD_PREFIX)
        ? node.id.slice(PERIOD_PREFIX.length)
        : node.name;
      if (period) onOpenPeriod?.(period);
      return;
    }
    if (node.group === 2) {
      const eventRef = getEventRefFromGraphNode(node as GraphNode);
      const eventRecord = eventRef ? eventLookup[eventRef] : null;
      if (eventRecord) {
        onNodeClick({ type: 'event', period: eventRecord.period, entry: eventRecord.entry });
        return;
      }
    }
    // Group 3/4 (and dangling events) open the connected-memories hub.
    onNodeClick({ type: 'tag', tagNode: node as GraphNode });
  }, [eventLookup, onNodeClick, onOpenPeriod]);

  const zoomToFit = useCallback(() => {
    graphRef.current?.zoomToFit?.(400, 60);
  }, []);

  const toggleGroup = (group: number) => {
    setHiddenGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const legendItems = [
    { group: 1, label: t.periods,     color: colors.period },
    { group: 2, label: t.memories,    color: colors.event },
    { group: 3, label: t.tabLocation, color: colors.place },
    { group: 4, label: t.tabPeople,   color: colors.person },
  ];

  return (
    <div className="graph-container" ref={containerRef}>
      <ForceGraph2D
        ref={graphRef}
        width={size.width}
        height={size.height}
        graphData={visibleGraph}
        nodeLabel="name"
        nodeColor={nodeColor}
        nodeRelSize={6}
        nodeVal={(node: any) => 1 + Math.sqrt(degrees.get(node.id) ?? 0)}
        linkColor={linkColor}
        backgroundColor={colors.bg}
        onNodeClick={handleNodeClick}
        onNodeHover={(node: any) => setHoverId(node?.id ?? null)}
        onEngineStop={() => {
          if (!fittedRef.current) {
            fittedRef.current = true;
            zoomToFit();
          }
        }}
      />
      <div className="graph-legend">
        {legendItems.map(item => (
          <button
            key={item.group}
            type="button"
            className={`legend-item${hiddenGroups.has(item.group) ? ' inactive' : ''}`}
            onClick={() => toggleGroup(item.group)}
          >
            <span className="legend-dot" style={{ backgroundColor: item.color }} />
            {item.label}
          </button>
        ))}
      </div>
      <button type="button" className="graph-reset" onClick={zoomToFit}>
        {t.resetView}
      </button>
    </div>
  );
}
