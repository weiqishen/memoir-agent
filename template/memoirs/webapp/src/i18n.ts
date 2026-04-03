// ─── i18n Translation Strings ────────────────────────────────────────────────
// Extend this file to add more languages or UI strings.
// Keep content (memoir chapters, entry text) in its original language.

export const TRANSLATIONS = {
  zh: {
    title:             '我的回忆录',
    tabChapters:       '章节',
    tabYear:           '年份',
    tabPeople:         '人物',
    tabLocation:       '地点',
    tabGraph:          '图谱',
    graph:             '知识图谱',
    searchPlaceholder: '搜索记忆...',
    searchResult:      (n: number, q: string) => `「${q}」— 共 ${n} 条结果`,
    noResult:          '未找到相关记忆。',
    archive:           '回忆录',
    noChapter:         '此章节尚未合成。',
    connectedTo:       (name: string) => `与「${name}」相关的记忆`,
    memories:          '记忆',
    loading:           '正在加载记忆...',
    noData:            '暂无数据。',
    memoryCount:       (n: number) => `${n} 条记忆`,
  },
  en: {
    title:             'My Memoirs',
    tabChapters:       'Chapters',
    tabYear:           'By Year',
    tabPeople:         'People',
    tabLocation:       'Places',
    tabGraph:          'Graph',
    graph:             'Knowledge Graph',
    searchPlaceholder: 'Search memories...',
    searchResult:      (n: number, q: string) => `${n} result${n !== 1 ? 's' : ''} for "${q}"`,
    noResult:          'No memories found.',
    archive:           'Memoir Archive',
    noChapter:         "This chapter hasn't been synthesized yet.",
    connectedTo:       (name: string) => `Entries connected to "${name}"`,
    memories:          'Memories',
    loading:           'Loading Life Memories...',
    noData:            'No data yet.',
    memoryCount:       (n: number) => `${n} ${n === 1 ? 'memory' : 'memories'}`,
  },
} as const;

export type Translations = {
  title: string;
  tabChapters: string;
  tabYear: string;
  tabPeople: string;
  tabLocation: string;
  tabGraph: string;
  graph: string;
  searchPlaceholder: string;
  searchResult: (n: number, q: string) => string;
  noResult: string;
  archive: string;
  noChapter: string;
  connectedTo: (name: string) => string;
  memories: string;
  loading: string;
  noData: string;
  memoryCount: (n: number) => string;
};
