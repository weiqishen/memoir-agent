import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, Search, Calendar, Users, ArrowDownUp } from 'lucide-react';


import { SearchBar }         from './components/SearchBar';
import { TimelineView }      from './components/TimelineView';
import type { EntitySearchResult, SortMode } from './components/TimelineView';
import { GraphView }         from './components/GraphView';
import { MemoryModal }       from './components/MemoryModal';
import { WindowControls }    from './components/WindowControls';
import { IndexBrowserView }  from './components/IndexBrowserView';
import { PlacesView }        from './components/PlacesView';
import { TRANSLATIONS }      from './i18n';
import { chapterMatchesEntry, getEntryYear } from './timeModel';
import { sanitizeGraph } from './graphModel';
import {
  parseHash,
  eventRoute,
  placeRoute,
  fallbackEventId,
  eventRouteLookupKeys,
} from './routeModel';
import type { Route } from './routeModel';
import type {
  APIPayload,
  SelectedItem,
  Theme,
  Lang,
  ViewMode,
  Entry,
  EntityEventIndex,
  ResolvedEntityIndex,
  IndexRecord,
} from './types';
import './App.css';

// ── Year-grouped view helper ─────────────────────────────────────────────────
function groupByYear(memoirs: APIPayload['memoirs']) {
  const map: Record<string, { period: string; entry: Entry }[]> = {};
  Object.entries(memoirs).forEach(([period, pd]) => {
    (pd.timeline.entries || []).forEach(entry => {
      const year = getEntryYear(entry);
      map[year] = map[year] || [];
      map[year].push({ period, entry });
    });
  });
  return map;
}

function buildEventRef(period: string, entry: Entry): string {
  if (entry.id?.trim()) {
    return `${period}|${entry.id.trim()}`;
  }
  return `${period}|${entry.date ?? ''}|${entry.event ?? ''}`;
}

function buildEventLookup(memoirs: APIPayload['memoirs']): Record<string, IndexRecord> {
  const lookup: Record<string, IndexRecord> = {};
  Object.entries(memoirs).forEach(([period, periodData]) => {
    (periodData.timeline.entries || []).forEach(entry => {
      lookup[buildEventRef(period, entry)] = { period, entry };
    });
  });
  return lookup;
}

function resolveEntityIndex(rawIndex: EntityEventIndex, eventLookup: Record<string, IndexRecord>): ResolvedEntityIndex {
  const resolved: ResolvedEntityIndex = {};
  Object.entries(rawIndex).forEach(([key, eventRefs]) => {
    const records = (eventRefs || [])
      .map(eventRef => eventLookup[eventRef])
      .filter((record): record is IndexRecord => Boolean(record));
    resolved[key] = records;
  });
  return resolved;
}

export default function App() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [data,         setData]         = useState<APIPayload | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [viewMode,     setViewMode]     = useState<ViewMode>('chapters');
  const [theme,        setTheme]        = useState<Theme>('light');
  const [lang,         setLang]         = useState<Lang>('zh');
  const [searchOpen,   setSearchOpen]   = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [searchIndex,  setSearchIndex]  = useState(0);
  const [sortMode,     setSortMode]     = useState<SortMode>('authored');
  const [yearFocus,    setYearFocus]    = useState<string | null>(null);
  const [pendingRoute, setPendingRoute] = useState<Route | null>(null);
  const [isMaximized,  setIsMaximized]  = useState(false);
  const chapterCacheRef = useRef<Map<string, string>>(new Map());

  const isDesktop = typeof (window as any).pywebview !== 'undefined';
  const t = TRANSLATIONS[lang];

  const handleToggleMaximize = useCallback(() => {
    if (!isDesktop) return;
    (window as any).pywebview.api.toggle_maximize();
    setIsMaximized(v => !v);
  }, [isDesktop]);

  // ── Side-effects ───────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    fetch('/memoirs.manifest.json')
      .then(r => r.json())
      .then((res: any) => {
        setData({
          schema_version: res.schema_version,
          tool_version:   res.tool_version,
          memoirs:        res.memoirs      ?? res,
          graph:          sanitizeGraph(res.graph ?? { nodes: [], links: [] }),
          people_index:   res.people_index ?? {},
          places_index:   res.places_index ?? {},
          places_meta:    res.places_meta  ?? {},
          issues:         res.issues,
        });
      })
      .catch(e => console.error('Could not load memoirs data', e));
  }, []);

  // ── Derived data ───────────────────────────────────────────────────────────
  const loadChapterContent = useCallback(async (period: string, entry: Entry): Promise<string | null> => {
    if (!data) return null;
    const chapters = data.memoirs[period]?.chapters || [];
    const chapter = chapters.find(ch => chapterMatchesEntry(ch.filename, entry));
    if (!chapter) return null;

    // Schema v2 manifests embed the chapter markdown directly.
    if (typeof chapter.content === 'string') return chapter.content;

    // Legacy schema v1 fallback: fetch the published markdown on demand.
    if (!chapter.path) return null;
    const cached = chapterCacheRef.current.get(chapter.path);
    if (cached !== undefined) return cached;

    try {
      const response = await fetch(chapter.path);
      if (!response.ok) return null;
      const markdown = await response.text();
      chapterCacheRef.current.set(chapter.path, markdown);
      return markdown;
    } catch (error) {
      console.error('Could not load chapter markdown', error);
      return null;
    }
  }, [data]);

  const allEntries = useMemo(() => data
    ? Object.entries(data.memoirs).flatMap(([periodKey, pd]) =>
        (pd.timeline.entries || []).map(entry => {
          const chapter = (pd.chapters || []).find(ch => chapterMatchesEntry(ch.filename, entry));
          const searchText = [entry.event, entry.summary, chapter?.content]
            .filter(Boolean)
            .join('\n')
            .toLowerCase();
          return { periodKey, entry, searchText };
        })
      )
    : [], [data]);

  const yearIndex = useMemo(() => data ? groupByYear(data.memoirs) : {}, [data]);
  const eventLookup = useMemo(() => data ? buildEventLookup(data.memoirs) : {}, [data]);
  const resolvedPeopleIndex = useMemo(
    () => data ? resolveEntityIndex(data.people_index, eventLookup) : {},
    [data, eventLookup]
  );
  const resolvedPlacesIndex = useMemo(
    () => data ? resolveEntityIndex(data.places_index, eventLookup) : {},
    [data, eventLookup]
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allEntries
      .filter(({ searchText }) => searchText.includes(q))
      .map(({ periodKey, entry }) => ({ periodKey, entry }));
  }, [allEntries, searchQuery]);

  const entityResults = useMemo<EntitySearchResult[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !data) return [];
    const results: EntitySearchResult[] = [];
    Object.keys(data.people_index).forEach(key => {
      if (key.toLowerCase().includes(q)) results.push({ kind: 'person', key });
    });
    Object.keys(data.places_index).forEach(key => {
      if (key.toLowerCase().includes(q)) results.push({ kind: 'place', key });
    });
    return results.slice(0, 20);
  }, [data, searchQuery]);

  // ── Routing (hash deep links) ──────────────────────────────────────────────
  const clearRouteHash = useCallback(() => {
    if (/^#\/(event|place)\//.test(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const handleSelectedItem = useCallback((item: SelectedItem) => {
    setSelectedItem(item);
    if (item.type === 'event') {
      const eventId = item.entry.id?.trim()
        ? item.entry.id.trim()
        : fallbackEventId(item.entry.date ?? '', item.entry.event ?? '');
      window.location.hash = eventRoute(item.period, eventId);
    } else if (item.tagNode.id.startsWith('place:')) {
      window.location.hash = placeRoute(item.tagNode.id.slice('place:'.length));
    }
  }, []);

  const handleSelectEntry = useCallback((period: string, entry: Entry) => {
    handleSelectedItem({ type: 'event', period, entry });
  }, [handleSelectedItem]);

  const handleCloseModal = useCallback(() => {
    setSelectedItem(null);
    clearRouteHash();
  }, [clearRouteHash]);

  const handleEntitySelect = useCallback((kind: 'person' | 'place', key: string) => {
    const nodeId = `${kind}:${key}`;
    const node = data?.graph.nodes.find(candidate => candidate.id === nodeId)
      ?? { id: nodeId, name: key, group: kind === 'person' ? 4 : 3 };
    setSelectedItem({ type: 'tag', tagNode: node });
    if (kind === 'place') window.location.hash = placeRoute(key);
  }, [data]);

  const handleOpenPeriod = useCallback((period: string) => {
    setViewMode('chapters');
    setSearchOpen(false);
    setSearchQuery('');
    requestAnimationFrame(() => {
      document
        .getElementById(`period-${period}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  // Parse the hash once and on every history navigation.
  useEffect(() => {
    const applyHash = () => setPendingRoute(parseHash(window.location.hash));
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  // Resolve a pending route once data is available (also handles F5 restore).
  useEffect(() => {
    if (!data || !pendingRoute) return;
    if (pendingRoute.type === 'event') {
      const record = eventRouteLookupKeys(pendingRoute.period, pendingRoute.id)
        .map(key => eventLookup[key])
        .find(Boolean);
      if (record) setSelectedItem({ type: 'event', period: record.period, entry: record.entry });
    } else if (pendingRoute.type === 'place') {
      const node = data.graph.nodes.find(candidate => candidate.id === `place:${pendingRoute.key}`)
        ?? { id: `place:${pendingRoute.key}`, name: pendingRoute.key, group: 3 };
      setSelectedItem({ type: 'tag', tagNode: node });
    } else if (pendingRoute.type === 'year') {
      setViewMode('year');
      setYearFocus(pendingRoute.year);
    }
    setPendingRoute(null);
  }, [data, pendingRoute, eventLookup]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === 'f' || e.key === 'k')) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.key === 'Escape') {
        if (selectedItem) { handleCloseModal(); return; }
        setSearchOpen(false);
        setSearchQuery('');
        setSearchIndex(0);
        return;
      }
      if (searchOpen && searchResults.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSearchIndex(i => Math.min(i + 1, searchResults.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSearchIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const picked = searchResults[searchIndex] ?? searchResults[0];
          if (picked) handleSelectedItem({ type: 'event', period: picked.periodKey, entry: picked.entry });
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedItem, handleCloseModal, searchOpen, searchResults, searchIndex, handleSelectedItem]);

  useEffect(() => { setSearchIndex(0); }, [searchQuery]);

  useEffect(() => {
    if (!searchOpen || searchIndex < 0) return;
    document
      .querySelector(`[data-search-index="${searchIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [searchIndex, searchOpen]);

  // ── Loading guard ──────────────────────────────────────────────────────────
  if (!data) return <div className="loading-screen">{t.loading}</div>;

  // ── Tab config ─────────────────────────────────────────────────────────────
  const TABS: { id: ViewMode; label: string; disabled?: boolean }[] = [
    { id: 'chapters',  label: t.tabChapters },
    { id: 'year',      label: t.tabYear },
    { id: 'people',    label: t.tabPeople,   disabled: Object.keys(data.people_index).length === 0 },
    { id: 'location',  label: t.tabLocation, disabled: Object.keys(data.places_index).length === 0 },
    { id: 'graph',     label: t.tabGraph,    disabled: data.graph.nodes.length === 0 },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app-container">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="global-header drag-region"
        onDoubleClick={handleToggleMaximize}
      >
        <div className="header-left" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <h1>{t.title}</h1>
        </div>
        <div className="header-right">
          <button className="lang-btn" onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')}>
            {lang === 'zh' ? 'EN' : '中'}
          </button>
          <motion.button className="theme-btn" onClick={() => setSearchOpen(v => !v)}
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
            <Search size={18} />
          </motion.button>
          <motion.button className="theme-btn"
            onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            initial={false}
            animate={{ rotate: theme === 'light' ? 0 : 180 }}
            transition={{ duration: 0.5, type: 'spring', stiffness: 200 }}>
            {theme === 'light' ? <Sun size={20} /> : <Moon size={20} />}
          </motion.button>
          {isDesktop && (
            <WindowControls
              isMaximized={isMaximized}
              onToggleMaximize={handleToggleMaximize}
            />
          )}
        </div>
      </header>

      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <SearchBar
        open={searchOpen}
        query={searchQuery}
        placeholder={t.searchPlaceholder}
        onQueryChange={setSearchQuery}
        t={t}
      />

      {/* ── Tab bar (hidden while searching) ─────────────────────────────── */}
      {!searchQuery && (
        <div className="view-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={viewMode === tab.id ? 'active' : ''}
              onClick={() => setViewMode(tab.id)}
              disabled={tab.disabled}
            >
              {tab.label}
            </button>
          ))}
          {viewMode === 'chapters' && (
            <button
              className="sort-toggle"
              onClick={() => setSortMode(m => (m === 'authored' ? 'time' : 'authored'))}
              title={sortMode === 'authored' ? t.sortByTime : t.sortAuthored}
            >
              <ArrowDownUp size={14} />
              {sortMode === 'authored' ? t.sortByTime : t.sortAuthored}
            </button>
          )}
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="main-content">
        {searchQuery || viewMode === 'chapters' ? (
          <TimelineView
            memoirs={data.memoirs}
            searchQuery={searchQuery}
            searchResults={searchResults}
            entityResults={entityResults}
            onSelectEntity={handleEntitySelect}
            sortMode={sortMode}
            highlightIndex={searchIndex}
            onSelectEntry={handleSelectedItem}
            t={t}
          />
        ) : viewMode === 'year' ? (
          <IndexBrowserView
            index={yearIndex}
            icon={<Calendar size={15} />}
            emptyLabel={t.noData}
            expandKey={yearFocus}
            onSelectEntry={handleSelectEntry}
            t={t}
          />
        ) : viewMode === 'people' ? (
          <IndexBrowserView
            index={resolvedPeopleIndex}
            icon={<Users size={15} />}
            emptyLabel={t.noData}
            onSelectEntry={handleSelectEntry}
            t={t}
          />
        ) : viewMode === 'location' ? (
          <PlacesView
            placesIndex={resolvedPlacesIndex}
            placesMeta={data.places_meta}
            onSelectEntry={handleSelectEntry}
            t={t}
          />
        ) : (
          <GraphView
            graph={data.graph}
            eventLookup={eventLookup}
            theme={theme}
            onNodeClick={handleSelectedItem}
            onOpenPeriod={handleOpenPeriod}
            t={t}
          />
        )}
      </main>

      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      <MemoryModal
        item={selectedItem}
        onClose={handleCloseModal}
        onSelectEvent={handleSelectedItem}
        loadChapterContent={loadChapterContent}
        graphLinks={data.graph.links}
        eventLookup={eventLookup}
        t={t}
      />
    </div>
  );
}
