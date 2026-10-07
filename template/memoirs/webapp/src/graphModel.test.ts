import test from 'node:test';
import assert from 'node:assert/strict';

import { getConnectedEventRefs, getEventRefFromGraphNode, sanitizeGraph } from './graphModel';
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

test('getConnectedEventRefs rolls place clicks down through contained subplaces', () => {
  const links: GraphLink[] = [
    { source: 'place:甘村', target: 'place:橡树购物中心', type: 'contains' },
    { source: 'place:橡树购物中心', target: 'place:橡树购物中心·停车场', type: 'contains' },
    { source: 'place:橡树购物中心·停车场', target: 'event:US_PhD|2024-08|Parking', type: 'occurred_at' },
  ];

  assert.deepEqual(
    getConnectedEventRefs('place:甘村', links),
    ['US_PhD|2024-08|Parking']
  );
});

test('getConnectedEventRefs resolves period hub clicks through belongs_to links', () => {
  const links: GraphLink[] = [
    { source: 'event:US_PhD|a', target: 'period:US_PhD', type: 'belongs_to' },
    { source: 'event:US_PhD|b', target: 'period:US_PhD', type: 'belongs_to' },
    { source: 'event:Other|1', target: 'period:Other', type: 'belongs_to' },
  ];

  assert.deepEqual(
    getConnectedEventRefs('period:US_PhD', links),
    ['US_PhD|a', 'US_PhD|b']
  );
});

test('getConnectedEventRefs terminates on circular contains links', () => {
  const links: GraphLink[] = [
    { source: 'place:甲', target: 'place:乙', type: 'contains' },
    { source: 'place:乙', target: 'place:甲', type: 'contains' },
    { source: 'place:乙', target: 'event:US_PhD|1', type: 'occurred_at' },
  ];

  assert.deepEqual(getConnectedEventRefs('place:甲', links), ['US_PhD|1']);
});

test('sanitizeGraph drops dangling links, dedupes and normalizes endpoints', () => {
  const nodePlace: GraphNode = { id: 'place:A', name: 'A', group: 3 };
  const nodeEvent: GraphNode = { id: 'event:X', name: 'X', group: 2 };

  const clean = sanitizeGraph({
    nodes: [nodePlace, nodeEvent, { ...nodePlace }],
    links: [
      { source: 'place:A', target: 'event:X', type: 'occurred_at' },
      { source: 'place:A', target: 'event:X', type: 'occurred_at' },
      { source: 'place:A', target: 'event:MISSING', type: 'occurred_at' },
      { source: nodeEvent, target: nodePlace, type: 'belongs_to' },
    ],
  });

  assert.equal(clean.nodes.length, 2);
  assert.equal(clean.links.length, 2);
  assert.equal(clean.links[1].source, 'event:X');
  assert.equal(clean.links[1].target, 'place:A');
});
