import test from 'node:test';
import assert from 'node:assert/strict';

import { getConnectedEventRefs, getEventRefFromGraphNode } from './graphModel';
import type { GraphLink, GraphNode } from './types';

test('getEventRefFromGraphNode resolves typed event node ids', () => {
  const node: GraphNode = {
    id: 'event:US_PhD|2024-09|Test Event',
    name: 'Test Event',
    group: 2,
  };

  assert.equal(getEventRefFromGraphNode(node), 'US_PhD|2024-09|Test Event');
});

test('getEventRefFromGraphNode prefers explicit event_ref metadata', () => {
  const node: GraphNode = {
    id: 'event:opaque-id',
    name: 'Test Event',
    group: 2,
    event_ref: 'US_PhD|stable-id',
  };

  assert.equal(getEventRefFromGraphNode(node), 'US_PhD|stable-id');
});

test('getConnectedEventRefs follows typed event relationship links only', () => {
  const links: GraphLink[] = [
    { source: 'place:佛罗里达大学', target: 'place:佛罗里达大学·通勤停车场', type: 'contains' },
    { source: 'place:佛罗里达大学·通勤停车场', target: 'event:US_PhD|2024-09|Parking', type: 'occurred_at' },
    { source: 'event:US_PhD|2024-10|Reverse', target: 'person:Alice', type: 'mentions_person' },
    { source: 'person:Alice', target: 'event:US_PhD|2024-11|Ignored', type: 'unrelated' },
  ];

  assert.deepEqual(
    getConnectedEventRefs('place:佛罗里达大学·通勤停车场', links),
    ['US_PhD|2024-09|Parking']
  );
  assert.deepEqual(
    getConnectedEventRefs('person:Alice', links),
    ['US_PhD|2024-10|Reverse']
  );
});
