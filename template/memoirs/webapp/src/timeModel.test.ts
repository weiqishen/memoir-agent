import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChapterMatchKeys,
  getEntryTimeLabel,
  getEntryYear,
} from './timeModel';
import type { Entry } from './types';

test('getEntryTimeLabel prefers normalized fuzzy-time label', () => {
  const entry: Entry = {
    date: '2024-Q3',
    time: {
      value: '2024-Q3',
      label: '2024 Q3',
      precision: 'quarter',
      start: '2024-07-01',
      end: '2024-09-30',
      sort: '2024-07-01',
      approximate: false,
    },
    event: 'First Semester',
    summary: 'summary',
  };

  assert.equal(getEntryTimeLabel(entry), '2024 Q3');
  assert.equal(getEntryYear(entry), '2024');
});

test('getEntryYear falls back to legacy date prefix', () => {
  const entry: Entry = {
    date: '2023-12',
    event: 'Legacy',
    summary: 'summary',
  };

  assert.equal(getEntryTimeLabel(entry), '2023-12');
  assert.equal(getEntryYear(entry), '2023');
});

test('buildChapterMatchKeys prefers raw-note suffix and stable id before date', () => {
  const entry: Entry = {
    id: 'first_semester',
    date: '2024-Q3',
    event: 'First Semester',
    summary: 'summary',
    related_files: ['raw_notes/first_semester.md'],
  };

  assert.deepEqual(
    buildChapterMatchKeys(entry),
    ['firstsemester', 'firstsemester', '2024q3']
  );
});
