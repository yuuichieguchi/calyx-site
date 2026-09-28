/**
 * Verifies the mobile hamburger menu in the site header (en + ja built pages).
 * Reads files under dist/, produced by astro build.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const distDir = fileURLToPath(new URL('../dist', import.meta.url));
const readDist = (p: string) => readFileSync(path.join(distDir, p), 'utf-8');

function tags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) ?? [];
}
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  if (m) return m[2] !== undefined ? m[2] : (m[3] ?? '');
  return new RegExp(`\\s${name}(?=[\\s>/]|$)`, 'i').test(tag) ? '' : null;
}
function headerOf(html: string): string {
  const m = html.match(/<header\b[^>]*class="[^"]*\bsite-header\b[^"]*"[^>]*>([\s\S]*?)<\/header>/i);
  expect(m, 'site-header present').not.toBeNull();
  return m![0];
}
function localAsset(href: string | null): string | null {
  if (!href || !href.startsWith('/') || href.startsWith('//')) return null;
  const rel = href.split(/[?#]/)[0].slice(1);
  return existsSync(path.join(distDir, rel)) ? readDist(rel) : null;
}
/** Inline <style> bodies plus linked local stylesheets. */
function pageCss(html: string): string {
  const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const linked = tags(html, 'link')
    .filter((t) => /stylesheet/i.test(attr(t, 'rel') ?? ''))
    .map((t) => localAsset(attr(t, 'href')) ?? '');
  return [...inline, ...linked].join('\n');
}
/** Inline <script> bodies plus referenced local script files (one level of imports). */
function pageJs(html: string): string {
  const inline = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const ext = tags(html, 'script').map((t) => localAsset(attr(t, 'src')) ?? '');
  const all = [...inline, ...ext];
  const imported = all.flatMap((js) =>
    [...js.matchAll(/["'](\/_astro\/[^"']+\.js)["']/g)].map((m) => localAsset(m[1]) ?? ''),
  );
  return [...all, ...imported].join('\n');
}
/** Bodies of every @media block whose query is max-width:559px or its range form width<=559px (brace-balanced). */
function mediaBlocks559(css: string): string[] {
  const out: string[] = [];
  const re = /@media\s*(?:screen\s*and\s*)?\(\s*(?:max-width\s*:\s*559px|width\s*<=\s*559px)\s*\)\s*\{/gi;
  while (re.exec(css) !== null) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
    }
    out.push(css.slice(re.lastIndex, i - 1));
  }
  return out;
}

const pages = [
  { name: 'en', file: 'index.html', menuLabel: 'Menu' },
  { name: 'ja', file: 'ja/index.html', menuLabel: 'メニュー' },
  { name: '404', file: '404.html', menuLabel: 'Menu' },
];

describe.each(pages)('header hamburger menu ($name)', ({ file, menuLabel }) => {
  const html = () => readDist(file);
  const menuButton = () =>
    tags(headerOf(html()), 'button').find((t) => /\bsite-header__menu\b/.test(attr(t, 'class') ?? ''));

  it('renders a site-header__menu button with type=button and aria-expanded=false', () => {
    const btn = menuButton();
    expect(btn).toBeDefined();
    expect(attr(btn!, 'type')).toBe('button');
    expect(attr(btn!, 'aria-expanded')).toBe('false');
  });

  it(`labels the menu button "${menuLabel}"`, () => {
    expect(attr(menuButton() ?? '', 'aria-label')).toBe(menuLabel);
  });

  it('includes an inline SVG icon inside the menu button', () => {
    const m = headerOf(html()).match(/<button\b[^>]*site-header__menu[^>]*>([\s\S]*?)<\/button>/i);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/<svg\b/i);
  });

  it('has exactly one site-header__links nav with id=site-nav matching aria-controls', () => {
    const navs = tags(headerOf(html()), 'nav').filter((t) => /\bsite-header__links\b/.test(attr(t, 'class') ?? ''));
    expect(navs).toHaveLength(1);
    expect(attr(navs[0], 'id')).toBe('site-nav');
    expect(attr(menuButton() ?? '', 'aria-controls')).toBe('site-nav');
  });

  it('keeps the three nav links inside the nav', () => {
    const m = headerOf(html()).match(/<nav\b[^>]*site-header__links[^>]*>([\s\S]*?)<\/nav>/i);
    expect(m).not.toBeNull();
    expect(tags(m![1], 'a')).toHaveLength(3);
  });

  it('ships a client script that manipulates aria-expanded', () => {
    const js = pageJs(html());
    expect(js).toMatch(/setAttribute\(["'`]aria-expanded["'`]/);
    expect(js).toMatch(/max-width:\s*559px/);
  });

  it('has a max-width:559px (or width<=559px) media block referencing .site-header__menu', () => {
    const blocks = mediaBlocks559(pageCss(html()));
    expect(blocks.some((b) => b.includes('.site-header__menu'))).toBe(true);
  });

  it('hides .site-header__menu by default (display:none outside the media block)', () => {
    let css = pageCss(html());
    for (const b of mediaBlocks559(css)) css = css.replace(b, '');
    expect(css).toMatch(/\.site-header__menu\s*\{[^}]*display\s*:\s*none/);
  });

  it('has a rule combining .site-header__menu[aria-expanded=true] with .site-header__links', () => {
    const css = pageCss(html());
    expect(css).toMatch(
      /\.site-header__menu\[aria-expanded=["']?true["']?\][^{}]*\.site-header__links/,
    );
  });
});
