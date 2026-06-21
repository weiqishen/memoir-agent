import type { Entry } from './types';

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '');
}

function stripLeadingTimePrefix(filename: string): string {
  return filename.replace(/^\d{4}(?:[-_](?:\d{2}(?:[-_]\d{2})?|q[1-4]|sp|su|au|wi))?[-_]?/i, '');
}

export function getEntryTimeLabel(entry: Entry): string {
  return entry.time?.label || entry.date || '';
}

export function getEntryYear(entry: Entry): string {
  return entry.time?.start?.slice(0, 4) || entry.date?.slice(0, 4) || '未知';
}

export function getChapterSuffixKey(filename: string): string {
  return normalizeKey(stripLeadingTimePrefix(stripExtension(filename)));
}

export function buildChapterMatchKeys(entry: Entry): string[] {
  const keys: string[] = [];

  for (const relatedFile of entry.related_files || []) {
    const basename = relatedFile.split('/').pop() || '';
    const suffix = getChapterSuffixKey(basename);
    if (suffix) keys.push(suffix);
  }

  if (entry.id?.trim()) {
    keys.push(normalizeKey(entry.id));
  }

  if (entry.date?.trim()) {
    keys.push(normalizeKey(entry.time?.value || entry.date));
  }

  return keys.filter(Boolean);
}

export function chapterMatchesEntry(filename: string, entry: Entry): boolean {
  const suffix = getChapterSuffixKey(filename);
  const full = normalizeKey(stripExtension(filename));
  return buildChapterMatchKeys(entry).some(key => suffix === key || full === key);
}
