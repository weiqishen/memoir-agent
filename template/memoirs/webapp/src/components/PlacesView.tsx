/**
 * PlacesView — Hierarchical location browser.
 *
 * Reads places_meta to determine display names and recursive parent-child
 * structure, for example area -> venue -> subplace.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ChevronRight } from 'lucide-react';
import type { ResolvedEntityIndex, PlacesMeta, Entry, IndexRecord } from '../types';
import type { Translations } from '../i18n';
import { getEntryTimeLabel } from '../timeModel';

interface Props {
  placesIndex: ResolvedEntityIndex;
  placesMeta: PlacesMeta;
  onSelectEntry: (period: string, entry: Entry) => void;
  t: Translations;
}

export interface PlaceTreeNode {
  key: string;
  display: string;
  entries: IndexRecord[];
  children: PlaceTreeNode[];
}

function wouldCreateCycle(key: string, parent: string, placesMeta: PlacesMeta) {
  let current: string | undefined = parent;
  const seen = new Set<string>();
  while (current) {
    if (current === key || seen.has(current)) return true;
    seen.add(current);
    current = placesMeta[current]?.parent;
  }
  return false;
}

export function buildPlaceTree(placesIndex: ResolvedEntityIndex, placesMeta: PlacesMeta) {
  const nodes = new Map<string, PlaceTreeNode>();

  const ensureNode = (key: string): PlaceTreeNode => {
    const existing = nodes.get(key);
    if (existing) return existing;

    const node: PlaceTreeNode = {
      key,
      display: placesMeta[key]?.display ?? key,
      entries: placesIndex[key] ?? [],
      children: [],
    };
    nodes.set(key, node);

    const parent = placesMeta[key]?.parent;
    if (parent && parent !== key) {
      ensureNode(parent);
    }
    return node;
  };

  Object.keys(placesIndex).forEach(ensureNode);

  const roots: PlaceTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = placesMeta[node.key]?.parent;
    if (parent && nodes.has(parent) && parent !== node.key && !wouldCreateCycle(node.key, parent, placesMeta)) {
      nodes.get(parent)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortTree = (items: PlaceTreeNode[]) => {
    items.sort((a, b) => a.display.localeCompare(b.display, 'zh'));
    items.forEach(item => sortTree(item.children));
  };
  sortTree(roots);
  return roots;
}

export function PlacesView({ placesIndex, placesMeta, onSelectEntry, t }: Props) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const placeTree = buildPlaceTree(placesIndex, placesMeta);

  const toggleExpanded = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const renderEntries = (entries: IndexRecord[], depth: number) => (
    <ul className={`index-entry-list ${depth > 0 ? 'child-entry-list' : ''}`}>
      {entries.map(({ period, entry }, i) => (
        <motion.li key={`${period}-${entry.id ?? entry.date}-${entry.event}-${i}`}
          className="index-entry-item"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04 }}
          onClick={() => onSelectEntry(period, entry)}>
          <span className="entry-date">{getEntryTimeLabel(entry)}</span>
          <span className="entry-title">{entry.event}</span>
          <span className="entry-summary">{entry.summary}</span>
        </motion.li>
      ))}
    </ul>
  );

  const renderNode = (node: PlaceTreeNode, depth = 0) => {
    const isOpen = expandedKeys.has(node.key);
    const hasChildren = node.children.length > 0;
    const isRoot = depth === 0;

    return (
      <div
        key={node.key}
        className={isRoot ? 'index-card' : 'child-place-card'}
        style={depth > 1 ? { marginLeft: 12 } : undefined}
      >
        <button
          className={`${isRoot ? 'index-card-header' : 'child-place-header'} ${isOpen ? 'open' : ''}`}
          onClick={() => toggleExpanded(node.key)}
        >
          {isRoot ? (
            <span className="index-card-icon"><MapPin size={15} /></span>
          ) : (
            <ChevronRight size={12} className="child-indent-icon" />
          )}
          <span className={isRoot ? 'index-card-name' : 'child-place-name'}>{node.display}</span>
          {hasChildren && (
            <span className="index-card-badge">{node.children.length} 子地点</span>
          )}
          <span className="index-card-count">{t.memoryCount(node.entries.length)}</span>
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
              {hasChildren && (
                <div className="places-children">
                  {node.children.map(child => renderNode(child, depth + 1))}
                </div>
              )}
              {renderEntries(node.entries, depth)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  if (placeTree.length === 0) {
    return (
      <div className="index-empty">
        <p>{t.noData}</p>
        <small>{t.tabLocation}</small>
      </div>
    );
  }

  return (
    <div className="index-browser">
      {placeTree.map(node => renderNode(node))}
    </div>
  );
}
