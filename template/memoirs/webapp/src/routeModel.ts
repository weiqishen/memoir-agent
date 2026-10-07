// ─── UI Route Model (hash deep links) ─────────────────────────────────────────
// Supported routes:
//   #/event/<period>/<id>   open an event chapter
//   #/place/<placeKey>      open a place's connected memories
//   #/year/<yyyy>           open the year index focused on a year

export type Route =
  | { type: 'event'; period: string; id: string }
  | { type: 'place'; key: string }
  | { type: 'year'; year: string }
  | { type: 'home' };

function decodePart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

export function parseHash(hash: string): Route {
  const clean = (hash || '').replace(/^#\/?/, '');
  if (!clean) return { type: 'home' };

  const parts = clean.split('/').map(decodePart);
  if (parts[0] === 'event' && parts.length >= 3 && parts[1] && parts[2]) {
    return { type: 'event', period: parts[1], id: parts.slice(2).join('/') };
  }
  if (parts[0] === 'place' && parts.length >= 2 && parts[1]) {
    return { type: 'place', key: parts.slice(1).join('/') };
  }
  if (parts[0] === 'year' && parts.length >= 2 && parts[1]) {
    return { type: 'year', year: parts[1] };
  }
  return { type: 'home' };
}

function encodePart(part: string): string {
  return encodeURIComponent(part);
}

export function eventRoute(period: string, eventId: string): string {
  return `#/event/${encodePart(period)}/${encodePart(eventId)}`;
}

export function placeRoute(placeKey: string): string {
  return `#/place/${encodePart(placeKey)}`;
}

export function yearRoute(year: string): string {
  return `#/year/${encodePart(year)}`;
}

/** Event route id for entries without a stable timeline id. */
export function fallbackEventId(date: string, event: string): string {
  return `${date}~${event}`;
}

/** Event lookup candidates for a parsed event route id. */
export function eventRouteLookupKeys(period: string, routeId: string): string[] {
  const keys = [`${period}|${routeId}`];
  const separator = routeId.indexOf('~');
  if (separator >= 0) {
    keys.push(`${period}|${routeId.slice(0, separator)}|${routeId.slice(separator + 1)}`);
  }
  return keys;
}
