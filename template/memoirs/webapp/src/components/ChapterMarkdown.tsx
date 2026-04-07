import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

function ChapterImage({
  alt,
  node: _node,
  ...props
}: React.ComponentProps<'img'> & { node?: unknown }) {
  const caption = alt?.trim();

  return (
    <figure className="chapter-image">
      <img alt={alt} {...props} />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

export const chapterMarkdownComponents: Components = {
  img: ChapterImage,
};

export { ReactMarkdown };
