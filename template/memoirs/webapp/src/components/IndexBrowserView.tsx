/**
 * IndexBrowserView — generic "browse by index" component.
 * Used for People view and Location view.
 * Groups entries under named keys (person name or place name).
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ResolvedEntityIndex, Entry } from '../types';
import type { Translations } from '../i18n';

type IndexData = ResolvedEntityIndex;

interface Props {
  index:      IndexData;
  icon:       React.ReactNode;  // Lucide icon component
  emptyLabel: string;
  onSelectEntry: (period: string, entry: Entry) => void;
  t: Translations;
}

export function IndexBrowserView({ index, icon, emptyLabel, onSelectEntry, t }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const keys = Object.keys(index).sort((a, b) => a.localeCompare(b, 'zh'));

  if (keys.length === 0) {
    return (
      <div className="index-empty">
        <p>{emptyLabel}</p>
        <small>{t.noData}</small>
      </div>
    );
  }

  return (
    <div className="index-browser">
      {keys.map(key => {
        const entries = index[key];
        const isOpen  = expanded === key;

        return (
          <div key={key} className="index-card">
            {/* Header row — click to expand */}
            <button
              className={`index-card-header ${isOpen ? 'open' : ''}`}
              onClick={() => setExpanded(isOpen ? null : key)}
            >
              <span className="index-card-icon">{icon}</span>
              <span className="index-card-name">{key}</span>
              <span className="index-card-count">{t.memoryCount(entries.length)}</span>
              <motion.span
                className="index-card-chevron"
                animate={{ rotate: isOpen ? 90 : 0 }}
                transition={{ duration: 0.2 }}
              >›</motion.span>
            </button>

            {/* Expandable entry list */}
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.ul
                  className="index-entry-list"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                >
                  {entries.map(({ period, entry }, i) => (
                    <motion.li
                      key={`${period}-${entry.date}-${i}`}
                      className="index-entry-item"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => onSelectEntry(period, entry)}
                    >
                      <span className="entry-date">{entry.date}</span>
                      <span className="entry-title">{entry.event}</span>
                      <span className="entry-summary">{entry.summary}</span>
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
