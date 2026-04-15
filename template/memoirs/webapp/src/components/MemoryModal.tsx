import { useRef, useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText } from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';
import { ReactMarkdown, chapterMarkdownComponents } from './ChapterMarkdown';
import type { SelectedItem, GraphLink, GraphNode, IndexRecord } from '../types';
import type { Translations } from '../i18n';

interface Props {
  item: SelectedItem | null;
  onClose: () => void;
  onSelectEvent: (item: SelectedItem) => void;
  loadChapterContent: (period: string, date: string) => Promise<string | null>;
  graphLinks: GraphLink[];
  graphNodes: GraphNode[];
  eventLookup: Record<string, IndexRecord>;
  t: Translations;
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const cardVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: 20 },
};

/** Floating modal for reading a memoir chapter or exploring entity (person/place) connections. */
export function MemoryModal({ item, onClose, onSelectEvent, loadChapterContent, graphLinks, graphNodes, eventLookup, t }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [chapterContent, setChapterContent] = useState<string | null>(null);
  const [isChapterLoading, setIsChapterLoading] = useState(false);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    if (!item || item.type !== 'event') {
      setChapterContent(null);
      setIsChapterLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsChapterLoading(true);
    setChapterContent(null);

    loadChapterContent(item.period, item.entry.date)
      .then(content => {
        if (cancelled) return;
        setChapterContent(content);
      })
      .finally(() => {
        if (cancelled) return;
        setIsChapterLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [item, loadChapterContent]);

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          ref={overlayRef}
          className="modal-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.18 }}
          onClick={handleOverlayClick}
        >
          <motion.div
            className="modal-content"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <button className="close-button" onClick={onClose} aria-label="Close">
              <X size={28} />
            </button>

            {item.type === 'event' ? (
              <article className="chapter-body">
                {isChapterLoading ? (
                  <div className="empty-state">
                    <p>{t.loading}</p>
                  </div>
                ) : chapterContent ? (
                  <ErrorBoundary>
                    <div className="markdown-prose">
                      <ReactMarkdown components={chapterMarkdownComponents}>
                        {chapterContent}
                      </ReactMarkdown>
                    </div>
                  </ErrorBoundary>
                ) : (
                  <div className="empty-state">
                    <FileText size={48} strokeWidth={1} style={{ opacity: 0.2, margin: '0 auto 20px' }} />
                    <p>{t.noChapter}</p>
                  </div>
                )}
              </article>
            ) : (
              <div className="tag-hub">
                <div className="tag-hub-header">
                  <h2>{t.connectedTo(item.tagNode.name)}</h2>
                </div>
                <div className="tag-links-list">
                  {graphLinks
                    .filter((l: any) => {
                      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
                      return srcId === item.tagNode.id;
                    })
                    .map((l: any, i) => {
                      const targetId = typeof l.target === 'object' ? l.target.id : l.target;
                      const evtNode = graphNodes.find(n => n.id === targetId);
                      if (!evtNode) return null;
                      const eventRecord = eventLookup[targetId];
                      if (!eventRecord) return null;
                      return (
                        <motion.div
                          key={i}
                          className="timeline-item mini"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2, delay: i * 0.05 }}
                          onClick={() => onSelectEvent({ type: 'event', period: eventRecord.period, entry: eventRecord.entry })}
                        >
                          <div className="item-meta">
                            <span className="item-meta-text">{eventRecord.entry.date}</span>
                          </div>
                          <div className="item-content">
                            <h3 className="item-title mini">{eventRecord.entry.event}</h3>
                          </div>
                        </motion.div>
                      );
                    })}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
