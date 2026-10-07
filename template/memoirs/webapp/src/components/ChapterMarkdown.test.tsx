import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';

import { chapterMarkdownComponents, extractChapterHeadings, headingId } from './ChapterMarkdown';

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

test('images are lazy-loaded', () => {
  const html = renderToStaticMarkup(
    <ReactMarkdown components={chapterMarkdownComponents}>
      {'![x](/media/US_PhD/a.jpg)'}
    </ReactMarkdown>
  );

  assert.match(html, /loading="lazy"/);
});

test('extractChapterHeadings and heading renderers share the same anchor ids', () => {
  const markdown = '# 大雪、离心机报错\n\n## First semester\n\n### Sub point\n';
  const headings = extractChapterHeadings(markdown);

  assert.deepEqual(headings.map(h => h.level), [1, 2, 3]);
  assert.equal(headings[0].id, headingId('大雪、离心机报错'));
  assert.equal(headings[1].id, 'first-semester');

  const html = renderToStaticMarkup(
    <ReactMarkdown components={chapterMarkdownComponents}>{markdown}</ReactMarkdown>
  );
  assert.match(html, new RegExp(`<h1 id="${headings[0].id}"`));
  assert.match(html, /<h2 id="first-semester"/);
});
