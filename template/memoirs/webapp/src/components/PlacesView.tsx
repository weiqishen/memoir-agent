/**
 * PlacesView — Hierarchical location browser.
 *
 * Reads places_meta to determine display names and parent-child structure.
 * Top-level places show as primary accordion items.
 * Child places (those with `parent` in places_meta) render as indented sub-items
 * within their parent's expanded section.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ChevronRight } from 'lucide-react';
import type { ResolvedEntityIndex, PlacesMeta, Entry } from '../types';
import type { Translations } from '../i18n';

interface Props {
  placesIndex: ResolvedEntityIndex;
  placesMeta:  PlacesMeta;
  onSelectEntry: (period: string, entry: Entry) => void;
  t: Translations;
}

export function PlacesView({ placesIndex, placesMeta, onSelectEntry, t }: Props) {
  const [expanded,      setExpanded]      = useState<string | null>(null);
  const [expandedChild, setExpandedChild] = useState<string | null>(null);

  // Top-level places: no parent field in meta
  const topKeys = Object.keys(placesIndex)
    .filter(k => !placesMeta[k]?.parent)
    .sort((a, b) => a.localeCompare(b, 'zh'));

  // Get child places of a given parent
  const getChildren = (parentKey: string) =>
    Object.keys(placesIndex)
      .filter(k => placesMeta[k]?.parent === parentKey)
      .map(k => ({ key: k, display: placesMeta[k]?.display ?? k, entries: placesIndex[k] }));

  if (topKeys.length === 0) {
    return (
      <div className="index-empty">
        <p>{t.noData}</p>
        <small>{t.tabLocation}</small>
      </div>
    );
  }

  return (
    <div className="index-browser">
      {topKeys.map(key => {
        const entries  = placesIndex[key] ?? [];
        const children = getChildren(key);
        const isOpen   = expanded === key;

        return (
          <div key={key} className="index-card">
            {/* Parent header */}
            <button
              className={`index-card-header ${isOpen ? 'open' : ''}`}
              onClick={() => { setExpanded(isOpen ? null : key); setExpandedChild(null); }}
            >
              <span className="index-card-icon"><MapPin size={15} /></span>
              <span className="index-card-name">{key}</span>
              {children.length > 0 && (
                <span className="index-card-badge">{children.length} 子地点</span>
              )}
              <span className="index-card-count">{t.memoryCount(entries.length)}</span>
              <motion.span className="index-card-chevron"
                animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>›</motion.span>
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  style={{ overflow: 'hidden' }}
                >
                  {/* Child sub-places */}
                  {children.length > 0 && (
                    <div className="places-children">
                      {children.map(ch => {
                        const childOpen = expandedChild === ch.key;
                        return (
                          <div key={ch.key} className="child-place-card">
                            <button
                              className={`child-place-header ${childOpen ? 'open' : ''}`}
                              onClick={() => setExpandedChild(childOpen ? null : ch.key)}
                            >
                              <ChevronRight size={12} className="child-indent-icon" />
                              <span className="child-place-name">{ch.display}</span>
                              <span className="index-card-count">{t.memoryCount(ch.entries.length)}</span>
                              <motion.span className="index-card-chevron"
                                animate={{ rotate: childOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>›</motion.span>
                            </button>
                            <AnimatePresence initial={false}>
                              {childOpen && (
                                <motion.ul className="index-entry-list child-entry-list"
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                >
                                  {ch.entries.map(({ period, entry }, i) => (
                                    <motion.li key={`${period}-${entry.date}-${i}`}
                                      className="index-entry-item"
                                      initial={{ opacity: 0, x: -8 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: i * 0.04 }}
                                      onClick={() => onSelectEntry(period, entry)}>
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
                  )}

                  {/* Direct entries of this parent place */}
                  <ul className="index-entry-list">
                    {entries.map(({ period, entry }, i) => (
                      <motion.li key={`${period}-${entry.date}-${i}`}
                        className="index-entry-item"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => onSelectEntry(period, entry)}>
                        <span className="entry-date">{entry.date}</span>
                        <span className="entry-title">{entry.event}</span>
                        <span className="entry-summary">{entry.summary}</span>
                      </motion.li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
