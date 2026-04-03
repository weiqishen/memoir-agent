import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';
import type { Translations } from '../i18n';

interface Props {
  open: boolean;
  query: string;
  placeholder: string;
  onQueryChange: (q: string) => void;
  t: Translations;
}

/**
 * Animated search bar that slides down from the header.
 * Auto-focuses on open; cleared and closed on Escape (handled by parent).
 */
export function SearchBar({ open, query, placeholder, onQueryChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="search-bar-wrapper"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          style={{ overflow: 'hidden' }}
        >
          <div className="search-bar-inner">
            <Search size={16} style={{ opacity: 0.4, flexShrink: 0 }} />
            <input
              ref={inputRef}
              className="search-input"
              type="text"
              placeholder={placeholder}
              value={query}
              onChange={e => onQueryChange(e.target.value)}
            />
            {query && (
              <button className="search-clear" onClick={() => onQueryChange('')} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
