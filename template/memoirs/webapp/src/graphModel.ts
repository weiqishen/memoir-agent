import type { GraphLink, GraphNode } from './types';

const EVENT_PREFIX = 'event:';
const EVENT_LINK_TYPES = new Set(['occurred_at', 'mentions_person']);

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

  links.forEach(link => {
    if (!link.type || !EVENT_LINK_TYPES.has(link.type)) return;

    const sourceId = graphNodeId(link.source);
    const targetId = graphNodeId(link.target);
    const eventRef =
      sourceId === tagNodeId ? toEventRef(targetId) :
      targetId === tagNodeId ? toEventRef(sourceId) :
      null;

    if (eventRef && !eventRefs.includes(eventRef)) {
      eventRefs.push(eventRef);
    }
  });

  return eventRefs;
}
