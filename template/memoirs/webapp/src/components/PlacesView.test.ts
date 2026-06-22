import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPlaceTree } from './PlacesView';
import type { PlacesMeta, ResolvedEntityIndex } from '../types';

const entry = {
  period: 'US_PhD',
  entry: {
    date: '2024-08-15',
    event: 'Parking',
    summary: 'summary',
  },
};

test('buildPlaceTree keeps grandchildren visible under their parent place', () => {
  const placesIndex: ResolvedEntityIndex = {
    '甘村': [entry],
    '橡树购物中心': [entry],
    '橡树购物中心·停车场': [entry],
  };
  const placesMeta: PlacesMeta = {
    '橡树购物中心': { parent: '甘村' },
    '橡树购物中心·停车场': { display: '停车场', parent: '橡树购物中心' },
  };

  const tree = buildPlaceTree(placesIndex, placesMeta);

  assert.equal(tree.length, 1);
  assert.equal(tree[0].key, '甘村');
  assert.equal(tree[0].children[0].key, '橡树购物中心');
  assert.equal(tree[0].children[0].children[0].key, '橡树购物中心·停车场');
});
