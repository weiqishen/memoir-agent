import type { GraphLink, GraphNode } from './types';

const EVENT_PREFIX = 'event:';
const EVENT_LINK_TYPES = new Set(['occurred_at', 'mentions_person', 'belongs_to']);
const CONTAINS_LINK_TYPE = 'contains';

function graphNodeId(value: string | GraphNode): string {
  return typeof value === 'object' ? value.id : value;
}

function toEventRef(nodeId: string): string | null {
  return nodeId.startsWith(EVENT_PREFIX) ? nodeId.slice(EVENT_PREFIX.length) : null;
}

/** Resolve the stable event ref represented by an event graph node. */
export function getEventRefFromGraphNode(node: GraphNode): string | null {
  if (node.group !== 2) return null;
  return node.event_ref ?? toEventRef(node.id);
}

/** Return event refs connected to an entity node through typed event links. */
export function getConnectedEventRefs(tagNodeId: string, links: GraphLink[]): string[] {
  const eventRefs: string[] = [];
  const connectedEntityIds = new Set([tagNodeId]);
  let changed = true;
  let guard = 0;
  const maxIterations = links.length + 1;

  // Place nodes use directed contains links, so parent place clicks should
  // include events attached to any descendant place.
  while (changed && guard < maxIterations) {
    changed = false;
    guard += 1;
    links.forEach(link => {
      if (link.type !== CONTAINS_LINK_TYPE) return;
      const sourceId = graphNodeId(link.source);
      const targetId = graphNodeId(link.target);
      if (connectedEntityIds.has(sourceId) && !connectedEntityIds.has(targetId)) {
        connectedEntityIds.add(targetId);
        changed = true;
      }
    });
  }

  links.forEach(link => {
    if (!link.type || !EVENT_LINK_TYPES.has(link.type)) return;

    const sourceId = graphNodeId(link.source);
    const targetId = graphNodeId(link.target);
    const eventRef =
      connectedEntityIds.has(sourceId) ? toEventRef(targetId) :
      connectedEntityIds.has(targetId) ? toEventRef(sourceId) :
      null;

    if (eventRef && !eventRefs.includes(eventRef)) {
      eventRefs.push(eventRef);
    }
  });

  return eventRefs;
}

/**
 * Defensive cleanup for graph payloads: drop dangling links, dedupe nodes and
 * links, and normalize object endpoints back to ids before rendering.
 */
export function sanitizeGraph(graph: { nodes: GraphNode[]; links: GraphLink[] }) {
  const nodes: GraphNode[] = [];
  const nodeIds = new Set<string>();
  for (const node of graph.nodes || []) {
    if (!node || typeof node.id !== 'string' || !node.id || nodeIds.has(node.id)) continue;
    nodeIds.add(node.id);
    nodes.push(node);
  }

  const links: GraphLink[] = [];
  const seenLinks = new Set<string>();
  for (const link of graph.links || []) {
    if (!link) continue;
    const source = graphNodeId(link.source);
    const target = graphNodeId(link.target);
    if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) continue;
    const key = `${source}\u0000${target}\u0000${link.type ?? ''}`;
    if (seenLinks.has(key)) continue;
    seenLinks.add(key);
    links.push({ ...link, source, target });
  }

  return { nodes, links };
}
