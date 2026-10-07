import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

/** Deterministic DOM id for a heading, shared by TOC and heading renderers. */
export function headingId(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'section';
}

export interface ChapterHeading {
  level: number;
  text: string;
  id: string;
}

/** Extract h1–h3 headings from chapter markdown for the table of contents. */
export function extractChapterHeadings(markdown: string): ChapterHeading[] {
  const headings: ChapterHeading[] = [];
  const matcher = /^(#{1,3})\s+(.+?)\s*#*\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(markdown)) !== null) {
    const text = match[2].trim();
    if (text) headings.push({ level: match[1].length, text, id: headingId(text) });
  }
  return headings;
}

function nodeText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (typeof node === 'object' && 'props' in (node as any)) {
    return nodeText((node as any).props?.children);
  }
  return '';
}

function makeHeading(Tag: 'h1' | 'h2' | 'h3') {
  const Heading = ({ children, node: _node, ...props }: any) => (
    <Tag id={headingId(nodeText(children))} {...props}>{children}</Tag>
  );
  Heading.displayName = `ChapterHeading${Tag.toUpperCase()}`;
  return Heading;
}

function ChapterImage({
  alt,
  node: _node,
  ...props
}: React.ComponentProps<'img'> & { node?: unknown }) {
  const caption = alt?.trim();
  const src = props.src;
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    if (!zoomOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setZoomOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [zoomOpen]);

  return (
    <>
      <figure className="chapter-image">
        <img
          alt={alt}
          loading="lazy"
          {...props}
          onClick={() => { if (src) setZoomOpen(true); }}
          style={{ cursor: src ? 'zoom-in' : undefined }}
        />
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
      {zoomOpen && src ? (
        <div
          className="lightbox-overlay"
          role="dialog"
          aria-label={alt || 'image'}
          onClick={() => setZoomOpen(false)}
        >
          <img src={src} alt={alt} />
        </div>
      ) : null}
    </>
  );
}

export const chapterMarkdownComponents: Components = {
  img: ChapterImage,
  h1: makeHeading('h1'),
  h2: makeHeading('h2'),
  h3: makeHeading('h3'),
};

export { ReactMarkdown };
