/**
 * Verifies the built output of the landing pages against the landing spec.
 *
 * Coverage:
 * - Shared requirements present on both dist/index.html (en) and dist/ja/index.html (ja)
 * - Locale-specific requirements (headings, canonical, hreflang targets, help links)
 * - Sitemap index and the chunk it references
 *
 * These tests read files under dist/, which astro build produces.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const distDir = fileURLToPath(new URL('../dist', import.meta.url));

function readDist(relativePath: string): string {
  return readFileSync(path.join(distDir, relativePath), 'utf-8');
}

/** Returns every opening tag matching `name`, e.g. tags(html, 'img'). */
function tags(html: string, name: string): string[] {
  const re = new RegExp(`<${name}\\b[^>]*>`, 'gi');
  return html.match(re) ?? [];
}

/**
 * Reads an attribute value from a single tag string, double- or single-quoted.
 * Also recognizes a bare, valueless attribute (e.g. the `alt` in
 * `<img ... alt loading="lazy">`, which is how some renderers serialize
 * `alt=""`) as present with an empty string value, distinct from the
 * attribute being absent entirely (`null`).
 */
function attr(tag: string, name: string): string | null {
  const quoted = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const quotedMatch = tag.match(quoted);
  if (quotedMatch) return quotedMatch[2] !== undefined ? quotedMatch[2] : (quotedMatch[3] ?? '');

  const bare = new RegExp(`\\s${name}(?=[\\s>/]|$)`, 'i');
  if (bare.test(tag)) return '';

  return null;
}

/**
 * Extracts the text content of the first element matching `name` (e.g. 'h1'),
 * stripping any inner tags and collapsing surrounding whitespace. Used where
 * the heading's text may be split across child elements (e.g. phrase spans).
 */
function textContentOf(html: string, name: string): string | null {
  const match = html.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  if (!match) return null;
  return match[1].replace(/<[^>]*>/g, '').trim();
}

/** True if `label` appears as the sole text content of some element. */
function hasExactLabel(html: string, label: string): boolean {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`>\\s*${escaped}\\s*<`).test(html);
}

/** True if some tag matching `name` has an attribute equal (trailing slash tolerant) to `value`. */
function hasTagWithAttrEqualTo(html: string, name: string, attrName: string, value: string): boolean {
  return tags(html, name).some((tag) => {
    const actual = attr(tag, attrName);
    if (actual === null) return false;
    return actual === value || actual === `${value}/` || `${actual}/` === value;
  });
}

function stripTagsAndScripts(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ');
}

type PageCase = {
  label: string;
  file: string;
  canonical: string;
  helpBase: string;
};

const pages: PageCase[] = [
  { label: 'en', file: 'index.html', canonical: 'https://getcalyx.app/', helpBase: 'https://help.getcalyx.app/' },
  { label: 'ja', file: 'ja/index.html', canonical: 'https://getcalyx.app/ja/', helpBase: 'https://help.getcalyx.app/ja/' },
];

describe('build output: shared requirements', () => {
  for (const page of pages) {
    describe(`${page.label} page (${page.file})`, () => {
      let html: string;

      beforeAll(() => {
        html = readDist(page.file);
      });

      it('links the fixed .zip download URL', () => {
        expect(
          hasTagWithAttrEqualTo(
            html,
            'a',
            'href',
            'https://github.com/yuuichieguchi/Calyx/releases/latest/download/Calyx.zip'
          )
        ).toBe(true);
      });

      it('includes the brew install command', () => {
        expect(html.includes('brew install --cask calyx')).toBe(true);
      });

      it('states the supported OS and hardware', () => {
        expect(html.includes('macOS 26 Tahoe')).toBe(true);
        expect(html.includes('Apple Silicon')).toBe(true);
      });

      it('links to the GitHub repository', () => {
        expect(
          hasTagWithAttrEqualTo(html, 'a', 'href', 'https://github.com/yuuichieguchi/Calyx')
        ).toBe(true);
      });

      it('embeds the demo video with a poster', () => {
        const start = html.indexOf('<video');
        expect(start).toBeGreaterThanOrEqual(0);
        const end = html.indexOf('</video>', start);
        expect(end).toBeGreaterThan(start);
        const videoBlock = html.slice(start, end === -1 ? undefined : end + '</video>'.length);
        expect(videoBlock.includes('demo.mp4')).toBe(true);
        const videoTagEnd = html.indexOf('>', start);
        const videoTag = html.slice(start, videoTagEnd + 1);
        const poster = attr(videoTag, 'poster');
        expect(poster).toBeTruthy();
      });

      it('gives every image an alt attribute, decorative or not', () => {
        const imgTags = tags(html, 'img');
        expect(imgTags.length).toBeGreaterThanOrEqual(6);
        for (const tag of imgTags) {
          expect(attr(tag, 'alt')).not.toBeNull();
        }
      });

      it('has at least 6 images with non-empty, descriptive alt text', () => {
        const imgTags = tags(html, 'img');
        const withDescription = imgTags.filter((tag) => (attr(tag, 'alt') ?? '').trim().length > 0);
        expect(withDescription.length).toBeGreaterThanOrEqual(6);
      });

      it('declares hreflang alternates for both en and ja', () => {
        const linkTags = tags(html, 'link');
        const enAlt = linkTags.find(
          (tag) => attr(tag, 'rel') === 'alternate' && attr(tag, 'hreflang') === 'en'
        );
        const jaAlt = linkTags.find(
          (tag) => attr(tag, 'rel') === 'alternate' && attr(tag, 'hreflang') === 'ja'
        );
        expect(enAlt).toBeDefined();
        expect(jaAlt).toBeDefined();
        expect(attr(enAlt as string, 'href')).toBe('https://getcalyx.app/');
        expect(attr(jaAlt as string, 'href')).toBe('https://getcalyx.app/ja/');
      });

      it('declares the required Open Graph and Twitter meta tags', () => {
        const metaTags = tags(html, 'meta');
        const byKey = (key: 'property' | 'name', value: string) =>
          metaTags.find((tag) => attr(tag, key) === value);

        const ogTitle = byKey('property', 'og:title');
        const ogDescription = byKey('property', 'og:description');
        const ogUrl = byKey('property', 'og:url');
        const ogImage = byKey('property', 'og:image');
        const twitterCard = byKey('name', 'twitter:card') ?? byKey('property', 'twitter:card');

        expect(ogTitle).toBeDefined();
        expect((attr(ogTitle as string, 'content') ?? '').trim().length).toBeGreaterThan(0);

        expect(ogDescription).toBeDefined();
        expect((attr(ogDescription as string, 'content') ?? '').trim().length).toBeGreaterThan(0);

        expect(ogUrl).toBeDefined();
        expect(attr(ogUrl as string, 'content')).toBe(page.canonical);

        expect(ogImage).toBeDefined();
        expect((attr(ogImage as string, 'content') ?? '').trim().length).toBeGreaterThan(0);

        expect(twitterCard).toBeDefined();
        expect(attr(twitterCard as string, 'content')).toBe('summary_large_image');
      });

      it('contains no em dash in body text', () => {
        const text = stripTagsAndScripts(html);
        expect(text.includes('—')).toBe(false);
        expect(html.includes('&mdash;')).toBe(false);
        expect(html.includes('&#8212;')).toBe(false);
        expect(html.toLowerCase().includes('&#x2014;')).toBe(false);
      });
    });
  }
});

describe('build output: en page (dist/index.html)', () => {
  let html: string;

  beforeAll(() => {
    html = readDist('index.html');
  });

  it('declares html lang="en"', () => {
    const htmlTag = tags(html, 'html')[0];
    expect(htmlTag).toBeDefined();
    expect(attr(htmlTag, 'lang')).toBe('en');
  });

  it('has a canonical link to https://getcalyx.app/', () => {
    expect(
      hasTagWithAttrEqualTo(html, 'link', 'href', 'https://getcalyx.app/') &&
        tags(html, 'link').some(
          (tag) => attr(tag, 'rel') === 'canonical' && attr(tag, 'href') === 'https://getcalyx.app/'
        )
    ).toBe(true);
  });

  it('contains the H1 heading', () => {
    expect(html.includes('Run more coding agents without babysitting more terminals.')).toBe(true);
  });

  it('links to the docs site', () => {
    expect(hasTagWithAttrEqualTo(html, 'a', 'href', 'https://help.getcalyx.app/')).toBe(true);
  });

  it('shows every tab label as its own element text', () => {
    for (const label of ['agents', 'approvals', 'subagents', 'mission map', 'git', 'sessions', 'terminal', 'agent tools', 'mcp apps']) {
      expect(hasExactLabel(html, label)).toBe(true);
    }
  });
});

describe('build output: ja page (dist/ja/index.html)', () => {
  let html: string;

  beforeAll(() => {
    html = readDist('ja/index.html');
  });

  it('declares html lang="ja"', () => {
    const htmlTag = tags(html, 'html')[0];
    expect(htmlTag).toBeDefined();
    expect(attr(htmlTag, 'lang')).toBe('ja');
  });

  it('has a canonical link to https://getcalyx.app/ja/', () => {
    expect(
      tags(html, 'link').some(
        (tag) => attr(tag, 'rel') === 'canonical' && attr(tag, 'href') === 'https://getcalyx.app/ja/'
      )
    ).toBe(true);
  });

  it('contains the H1 heading', () => {
    expect(textContentOf(html, 'h1')).toBe('コーディングエージェントを並列実行し、監視する');
  });

  it('links to the Japanese docs site', () => {
    expect(hasTagWithAttrEqualTo(html, 'a', 'href', 'https://help.getcalyx.app/ja/')).toBe(true);
  });
});

describe('build output: OAuth client metadata document', () => {
  it('publishes dist/oauth/mcp-client.json with a matching client_id', () => {
    const filePath = path.join(distDir, 'oauth/mcp-client.json');
    expect(existsSync(filePath)).toBe(true);

    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.client_id).toBe('https://getcalyx.app/oauth/mcp-client.json');
  });
});

describe('build output: sitemap', () => {
  it('lists both locale root URLs across the sitemap index and its chunk', () => {
    const indexPath = path.join(distDir, 'sitemap-index.xml');
    expect(existsSync(indexPath)).toBe(true);
    const indexXml = readFileSync(indexPath, 'utf-8');

    const chunkUrls = Array.from(indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
    expect(chunkUrls.length).toBeGreaterThan(0);

    let combinedXml = indexXml;
    for (const chunkUrl of chunkUrls) {
      const chunkFileName = new URL(chunkUrl).pathname.split('/').pop() as string;
      const chunkPath = path.join(distDir, chunkFileName);
      combinedXml += readFileSync(chunkPath, 'utf-8');
    }

    expect(combinedXml.includes('<loc>https://getcalyx.app/</loc>')).toBe(true);
    expect(combinedXml.includes('<loc>https://getcalyx.app/ja/</loc>')).toBe(true);
  });
});
