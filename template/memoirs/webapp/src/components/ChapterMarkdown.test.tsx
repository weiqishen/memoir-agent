import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';

import { chapterMarkdownComponents } from './ChapterMarkdown';

test('renders figcaption from non-empty image alt text', () => {
  const html = renderToStaticMarkup(
    <ReactMarkdown components={chapterMarkdownComponents}>
      {'![Lexington crossing apartments鸟瞰图](/assets/US_PhD/banner.jpg)'}
    </ReactMarkdown>
  );

  assert.match(html, /<figure[^>]*>/);
  assert.match(html, /<figcaption[^>]*>Lexington crossing apartments鸟瞰图<\/figcaption>/);
});

test('does not render figcaption for empty image alt text', () => {
  const html = renderToStaticMarkup(
    <ReactMarkdown components={chapterMarkdownComponents}>
      {'![](/assets/US_PhD/banner.jpg)'}
    </ReactMarkdown>
  );

  assert.doesNotMatch(html, /<figcaption/);
});
