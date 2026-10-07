import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseHash,
  eventRoute,
  placeRoute,
  yearRoute,
  fallbackEventId,
  eventRouteLookupKeys,
} from './routeModel';

test('parseHash handles home and malformed routes', () => {
  assert.deepEqual(parseHash(''), { type: 'home' });
  assert.deepEqual(parseHash('#'), { type: 'home' });
  assert.deepEqual(parseHash('#/'), { type: 'home' });
  assert.deepEqual(parseHash('#/unknown/x'), { type: 'home' });
  assert.deepEqual(parseHash('#/event/only-period'), { type: 'home' });
});

test('event routes round-trip including unicode and legacy ids', () => {
  const route = eventRoute('US_PhD', '2024_first semester');
  assert.equal(route, '#/event/US_PhD/2024_first%20semester');
  assert.deepEqual(parseHash(route), {
    type: 'event',
    period: 'US_PhD',
    id: '2024_first semester',
  });

  const legacy = fallbackEventId('2024-09', '到达甘村');
  const legacyRoute = eventRoute('US_PhD', legacy);
  const parsed = parseHash(legacyRoute);
  assert.equal(parsed.type, 'event');
  if (parsed.type === 'event') {
    assert.deepEqual(eventRouteLookupKeys(parsed.period, parsed.id), [
      `US_PhD|${legacy}`,
      'US_PhD|2024-09|到达甘村',
    ]);
  }
});

test('place and year routes round-trip', () => {
  const place = placeRoute('橡树购物中心·停车场');
  assert.deepEqual(parseHash(place), { type: 'place', key: '橡树购物中心·停车场' });

  assert.deepEqual(parseHash(yearRoute('2024')), { type: 'year', year: '2024' });
});
