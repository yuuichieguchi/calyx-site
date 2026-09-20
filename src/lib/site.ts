/**
 * Shared build-time data for the landing pages: the appcast-derived version
 * chip, the Open Graph image, and the feature image imports. Fetched and
 * computed once per build and cached so every locale shows the same values
 * even if a release lands mid-build.
 */

import { getImage } from 'astro:assets';
import agentSidebar from '../assets/agent-sidebar.png';
import approvalInbox from '../assets/approval-inbox.png';
import subagentRows from '../assets/subagent-rows.png';
import diffReview from '../assets/diff-review.png';
import sessionBrowser from '../assets/session-browser.png';
import planeView from '../assets/plane-view.png';
import { parseAppcast, formatMegabytes } from './appcast';

export const APPCAST_URL = 'https://yuuichieguchi.github.io/Calyx/appcast.xml';
export const ZIP_URL = 'https://github.com/yuuichieguchi/Calyx/releases/latest/download/Calyx.zip';

export const featureImages = {
  agentSidebar,
  approvalInbox,
  subagentRows,
  diffReview,
  sessionBrowser,
  planeView,
};

export type FeatureSpan = 'full' | 'half';
export type FeatureLayout = 'text-image' | 'image-text' | 'stacked' | 'text-only';

export interface FeatureLayoutEntry {
  tab: string;
  image?: (typeof featureImages)[keyof typeof featureImages];
  span: FeatureSpan;
  layout: FeatureLayout;
}

/**
 * The tab id, image, grid span, and internal layout for each feature, in
 * display order. Locale-specific heading and body text stay in each page
 * and are zipped against this array by index. `full` panes occupy the
 * whole 12-column row; two consecutive `half` panes share a row.
 */
export const featureLayout: FeatureLayoutEntry[] = [
  { tab: 'agents', image: featureImages.agentSidebar, span: 'full', layout: 'text-image' },
  { tab: 'approvals', image: featureImages.approvalInbox, span: 'half', layout: 'stacked' },
  { tab: 'subagents', image: featureImages.subagentRows, span: 'half', layout: 'stacked' },
  { tab: 'git', image: featureImages.diffReview, span: 'full', layout: 'image-text' },
  { tab: 'sessions', image: featureImages.sessionBrowser, span: 'half', layout: 'stacked' },
  { tab: 'terminal', image: featureImages.planeView, span: 'half', layout: 'stacked' },
  { tab: 'mcp', span: 'full', layout: 'text-only' },
];

async function fetchReleaseChipText(): Promise<string | null> {
  try {
    const response = await fetch(APPCAST_URL);
    if (response.ok) {
      const xml = await response.text();
      const info = parseAppcast(xml);
      if (info !== null) {
        return `v${info.version} · ${formatMegabytes(info.length)}`;
      }
    } else {
      console.warn(`appcast fetch failed at build time: HTTP ${response.status}`);
    }
  } catch (error) {
    console.warn('appcast fetch failed at build time:', error);
  }
  return null;
}

let releaseChipPromise: Promise<string | null> | null = null;

/** Returns the version chip text, fetching the appcast at most once per build. */
export function getReleaseChipText(): Promise<string | null> {
  if (releaseChipPromise === null) {
    releaseChipPromise = fetchReleaseChipText();
  }
  return releaseChipPromise;
}

export interface OgImage {
  url: string;
  /** Omitted (rather than a fabricated value) when Astro's optimizer does not report numeric dimensions. */
  width?: number;
  height?: number;
}

let ogImagePromise: Promise<OgImage> | null = null;

/** Returns the shared PNG Open Graph image, optimizing it at most once per build. */
export function getOgImage(site: URL | undefined): Promise<OgImage> {
  if (ogImagePromise === null) {
    ogImagePromise = (async () => {
      // Crop from the top so the sidebar content near the top of the
      // screenshot survives instead of the mostly-empty terminal pane below
      // it. No width is requested: Astro's sharp service silently refuses to
      // enlarge past the source's native width, so requesting a fixed width
      // wider than the source would make og:image:width lie about the file
      // it actually emits. `optimized.attributes` reflects the request, not
      // necessarily the emitted file, so its numeric-ness is checked rather
      // than assumed; if it is not numeric, the dimension meta tags are
      // omitted rather than publishing a guess.
      const optimized = await getImage({
        src: agentSidebar,
        format: 'png',
        height: 630,
        fit: 'cover',
        position: 'top',
      });
      const url = new URL(optimized.src, site).href;
      const width = optimized.attributes.width;
      const height = optimized.attributes.height;
      if (typeof width !== 'number' || typeof height !== 'number') {
        return { url };
      }
      return { url, width, height };
    })();
  }
  return ogImagePromise;
}
