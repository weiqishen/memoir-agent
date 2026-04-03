import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, Search, Calendar, Users } from 'lucide-react';


import { SearchBar }         from './components/SearchBar';
import { TimelineView }      from './components/TimelineView';
import { GraphView }         from './components/GraphView';
import { MemoryModal }       from './components/MemoryModal';
import { WindowControls }    from './components/WindowControls';
import { IndexBrowserView }  from './components/IndexBrowserView';
import { PlacesView }        from './components/PlacesView';
import { TRANSLATIONS }      from './i18n';
import type { APIPayload, SelectedItem, Theme, Lang, ViewMode, Entry } from './types';
import './App.css';

// ── Year-grouped view helper ─────────────────────────────────────────────────
function groupByYear(memoirs: APIPayload['memoirs']) {
  const map: Record<string, { period: string; entry: Entry }[]> = {};
  Object.entries(memoirs).forEach(([period, pd]) => {
    (pd.timeline.entries || []).forEach(entry => {
      const year = (entry.date ?? '').slice(0, 4) || '未知';
      map[year] = map[year] || [];
      map[year].push({ period, entry });
    });
  });
  return map;
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
  const [isMaximized,  setIsMaximized]  = useState(false);

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
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')                         { setSearchOpen(false); setSearchQuery(''); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') { e.preventDefault(); setSearchOpen(true); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    fetch('/memoirs.json')
      .then(r => r.json())
      .then((res: any) => {
        setData({
          memoirs:      res.memoirs ?? res,
          graph:        res.graph        ?? { nodes: [], links: [] },
          people_index: res.people_index ?? {},
          places_index: res.places_index ?? {},
          places_meta:  res.places_meta  ?? {},
        });
      })
      .catch(e => console.error('Could not load memoirs data', e));
  }, []);

  // ── Derived data ───────────────────────────────────────────────────────────
  const getChapterContent = useCallback((period: string, date: string): string | null => {
    if (!data) return null;
    const chapter = data.memoirs[period]?.chapters?.find(ch => ch.filename.startsWith(date));
    return chapter?.content ?? null;
  }, [data]);

  const allEntries = useMemo(() => data
    ? Object.entries(data.memoirs).flatMap(([periodKey, pd]) =>
        (pd.timeline.entries || []).map(entry => ({ periodKey, entry }))
      )
    : [], [data]);

  const yearIndex = useMemo(() => data ? groupByYear(data.memoirs) : {}, [data]);

  const searchResults = searchQuery.trim()
    ? allEntries.filter(({ periodKey, entry }) => {
        const q = searchQuery.toLowerCase();
        return (
          entry.event?.toLowerCase().includes(q)   ||
          entry.summary?.toLowerCase().includes(q) ||
          getChapterContent(periodKey, entry.date)?.toLowerCase().includes(q)
        );
      })
    : [];

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleNodeClick    = useCallback((item: SelectedItem) => setSelectedItem(item), []);
  const handleSelectEntry  = useCallback((period: string, entry: Entry) =>
    setSelectedItem({ type: 'event', period, entry }), []);

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
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="main-content">
        {searchQuery ? (
          <TimelineView
            memoirs={data.memoirs}
            searchQuery={searchQuery}
            searchResults={searchResults}
            onSelectEntry={setSelectedItem}
            t={t}
          />
        ) : viewMode === 'chapters' ? (
          <TimelineView
            memoirs={data.memoirs}
            searchQuery=""
            searchResults={[]}
            onSelectEntry={setSelectedItem}
            t={t}
          />
        ) : viewMode === 'year' ? (
          <IndexBrowserView
            index={yearIndex}
            icon={<Calendar size={15} />}
            emptyLabel={t.noData}
            onSelectEntry={handleSelectEntry}
            t={t}
          />
        ) : viewMode === 'people' ? (
          <IndexBrowserView
            index={data.people_index}
            icon={<Users size={15} />}
            emptyLabel={t.noData}
            onSelectEntry={handleSelectEntry}
            t={t}
          />
        ) : viewMode === 'location' ? (
          <PlacesView
            placesIndex={data.places_index}
            placesMeta={data.places_meta}
            onSelectEntry={handleSelectEntry}
            t={t}
          />
        ) : (
          <GraphView
            graph={data.graph}
            theme={theme}
            onNodeClick={handleNodeClick}
            t={t}
          />
        )}
      </main>

      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      <MemoryModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onSelectEvent={setSelectedItem}
        getChapterContent={getChapterContent}
        graphLinks={data.graph.links}
        graphNodes={data.graph.nodes}
        t={t}
      />
    </div>
  );
}
