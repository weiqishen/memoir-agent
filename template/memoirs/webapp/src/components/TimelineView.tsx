import { motion } from 'framer-motion';
import type { APIPayload, Entry, SelectedItem } from '../types';
import type { Translations } from '../i18n';

interface Props {
  memoirs: APIPayload['memoirs'];
  searchQuery: string;
  searchResults: { periodKey: string; entry: Entry }[];
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

function EntryItem({ entry, periodKey, label, onSelect }: {
  entry: Entry;
  periodKey: string;
  label: string;
  onSelect: () => void;
}) {
  return (
    <motion.div
      className="timeline-item"
      variants={itemVariants}
      onClick={onSelect}
      whileHover={{ x: 3 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <div className="item-meta">
        <span className="item-meta-text">{entry.date}</span>
        <span className="item-dot">·</span>
        <span className="item-meta-text" style={periodKey ? { color: 'var(--accent)' } : {}}>
          {label}
        </span>
      </div>
      <div className="item-content">
        <h3 className="item-title">{entry.event}</h3>
        <p className="item-excerpt">{entry.summary}</p>
      </div>
    </motion.div>
  );
}

/** Renders either the full chronological timeline or filtered search results. */
export function TimelineView({ memoirs, searchQuery, searchResults, onSelectEntry, t }: Props) {

  // ── Search results mode ────────────────────────────────────────────────────
  if (searchQuery) {
    return (
      <main className="timeline-container">
        <p className="period-title">{t.searchResult(searchResults.length, searchQuery)}</p>
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
                onSelect={() => onSelectEntry({ type: 'event', period: periodKey, entry })}
              />
            ))}
          </motion.div>
        )}
      </main>
    );
  }

  // ── Full timeline mode ─────────────────────────────────────────────────────
  return (
    <main className="timeline-container">
      {Object.entries(memoirs).map(([periodKey, periodData]) => (
        <div key={periodKey} className="period-section">
          <h2 className="period-title">{periodData.timeline.period || periodKey}</h2>
          <motion.div
            className="timeline-entries"
            variants={listVariants}
            initial="hidden"
            animate="visible"
          >
            {periodData.timeline.entries?.map((entry, idx) => (
              <EntryItem
                key={idx}
                entry={entry}
                periodKey=""
                label={t.archive}
                onSelect={() => onSelectEntry({ type: 'event', period: periodKey, entry })}
              />
            ))}
          </motion.div>
        </div>
      ))}
    </main>
  );
}
