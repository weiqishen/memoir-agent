import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Users, ChevronDown } from 'lucide-react';
import type { APIPayload, Entry, SelectedItem } from '../types';
import type { Translations } from '../i18n';
import { getEntryTimeLabel, getEntryYear } from '../timeModel';

export type SortMode = 'authored' | 'time';
export interface EntitySearchResult { kind: 'person' | 'place'; key: string }

interface Props {
  memoirs: APIPayload['memoirs'];
  searchQuery: string;
  searchResults: { periodKey: string; entry: Entry }[];
  entityResults?: EntitySearchResult[];
  onSelectEntity?: (kind: 'person' | 'place', key: string) => void;
  sortMode?: SortMode;
  highlightIndex?: number;
  onSelectEntry: (item: SelectedItem) => void;
  t: Translations;
}

// Stagger container: children animate in sequentially
const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0,  transition: { duration: 0.28, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] } },
};

/** Sort a period's entries by normalized time while keeping authored order as tie-break. */
export function sortEntriesByTime(entries: Entry[]): Entry[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const keyA = a.entry.time?.sort || a.entry.date || '';
      const keyB = b.entry.time?.sort || b.entry.date || '';
      if (keyA === keyB) return a.index - b.index;
      return keyA < keyB ? -1 : 1;
    })
    .map(({ entry }) => entry);
}

/** Highlight search query occurrences inside plain text. */
export function HighlightText({ text, query }: { text: string; query: string }): React.ReactElement {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let start = 0;
  let found = lower.indexOf(needle);
  while (found >= 0) {
    if (found > start) parts.push(text.slice(start, found));
    parts.push(<mark key={found}>{text.slice(found, found + needle.length)}</mark>);
    start = found + needle.length;
    found = lower.indexOf(needle, start);
  }
  if (start < text.length) parts.push(text.slice(start));
  return <>{parts}</>;
}

function EntryItem({ entry, periodKey, label, query = '', highlighted = false, searchIndex, anchorId, onSelect }: {
  entry: Entry;
  periodKey: string;
  label: string;
  query?: string;
  highlighted?: boolean;
  searchIndex?: number;
  anchorId?: string;
  onSelect: () => void;
}) {
  return (
    <motion.div
      id={anchorId}
      data-search-index={searchIndex}
      className={`timeline-item${highlighted ? ' highlighted' : ''}`}
      variants={itemVariants}
      onClick={onSelect}
      whileHover={{ x: 3 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <div className="item-meta">
        <span className="item-meta-text">{getEntryTimeLabel(entry)}</span>
        <span className="item-dot">·</span>
        <span className="item-meta-text" style={periodKey ? { color: 'var(--accent)' } : {}}>
          {label}
        </span>
      </div>
      <div className="item-content">
        <h3 className="item-title"><HighlightText text={entry.event} query={query} /></h3>
        <p className="item-excerpt"><HighlightText text={entry.summary ?? ''} query={query} /></p>
      </div>
    </motion.div>
  );
}

/** Renders either the full chronological timeline or filtered search results. */
export function TimelineView({
  memoirs,
  searchQuery,
  searchResults,
  entityResults = [],
  onSelectEntity,
  sortMode = 'authored',
  highlightIndex = -1,
  onSelectEntry,
  t,
}: Props) {
  const [collapsedPeriods, setCollapsedPeriods] = useState<Set<string>>(() => new Set());

  const togglePeriod = (periodKey: string) => {
    setCollapsedPeriods(prev => {
      const next = new Set(prev);
      if (next.has(periodKey)) next.delete(periodKey);
      else next.add(periodKey);
      return next;
    });
  };

  const years = useMemo(() => {
    const set = new Set<string>();
    Object.values(memoirs).forEach(periodData => {
      (periodData.timeline.entries || []).forEach(entry => {
        const year = getEntryYear(entry);
        if (year && year !== '未知') set.add(year);
      });
    });
    return Array.from(set).sort();
  }, [memoirs]);

  // ── Search results mode ────────────────────────────────────────────────────
  if (searchQuery) {
    return (
      <main className="timeline-container">
        <p className="period-title">{t.searchResult(searchResults.length, searchQuery)}</p>

        {entityResults.length > 0 && (
          <div className="search-entity-section">
            <p className="search-entity-label">{t.matchedEntities}</p>
            <div className="search-entity-chips">
              {entityResults.map(entity => (
                <button
                  key={`${entity.kind}:${entity.key}`}
                  className="search-entity-chip"
                  onClick={() => onSelectEntity?.(entity.kind, entity.key)}
                >
                  {entity.kind === 'person' ? <Users size={13} /> : <MapPin size={13} />}
                  {entity.key}
                </button>
              ))}
            </div>
          </div>
        )}

        {searchResults.length === 0 ? (
          <div className="empty-state"><p>{t.noResult}</p></div>
        ) : (
          <motion.div
            className="timeline-entries"
            variants={listVariants}
            initial="hidden"
            animate="visible"
          >
            {searchResults.map(({ periodKey, entry }, idx) => (
              <EntryItem
                key={idx}
                entry={entry}
                periodKey={periodKey}
                label={periodKey}
                query={searchQuery}
                highlighted={idx === highlightIndex}
                searchIndex={idx}
                onSelect={() => onSelectEntry({ type: 'event', period: periodKey, entry })}
              />
            ))}
          </motion.div>
        )}
      </main>
    );
  }

  // ── Full timeline mode ─────────────────────────────────────────────────────
  const yearAnchors = new Set<string>();

  return (
    <main className="timeline-container">
      {years.length > 1 && (
        <div className="timeline-year-nav">
          {years.map(year => (
            <button
              key={year}
              onClick={() => document
                .getElementById(`year-${year}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              {year}
            </button>
          ))}
        </div>
      )}

      {Object.entries(memoirs).map(([periodKey, periodData]) => {
        const entries = sortMode === 'time'
          ? sortEntriesByTime(periodData.timeline.entries || [])
          : (periodData.timeline.entries || []);
        const isCollapsed = collapsedPeriods.has(periodKey);

        return (
          <div key={periodKey} className="period-section" id={`period-${periodKey}`}>
            <button className="period-title period-toggle" onClick={() => togglePeriod(periodKey)}>
              <span>{periodData.timeline.period || periodKey}</span>
              <span className="period-count">{t.memoryCount(entries.length)}</span>
              <motion.span
                className="period-chevron"
                animate={{ rotate: isCollapsed ? -90 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown size={16} />
              </motion.span>
            </button>

            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.div
                  className="timeline-entries"
                  variants={listVariants}
                  initial="hidden"
                  animate="visible"
                  exit={{ opacity: 0, height: 0 }}
                >
                  {entries.map((entry, idx) => {
                    const year = getEntryYear(entry);
                    let anchorId: string | undefined;
                    if (year && year !== '未知' && !yearAnchors.has(year)) {
                      yearAnchors.add(year);
                      anchorId = `year-${year}`;
                    }
                    return (
                      <EntryItem
                        key={idx}
                        entry={entry}
                        periodKey=""
                        label={t.archive}
                        anchorId={anchorId}
                        onSelect={() => onSelectEntry({ type: 'event', period: periodKey, entry })}
                      />
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </main>
  );
}
