/**
 * Sparkle appcast parsing, shared between the build-time fetch and the
 * client-side refresh script. Works without DOMParser or any Node-only API
 * so the same module runs in both environments.
 */

export interface AppcastInfo {
  version: string;
  length: number;
}

/**
 * Validates that every tag in the document is properly opened and closed,
 * in order, after processing instructions, comments, CDATA sections,
 * DOCTYPE declarations, and the contents of <description> elements are
 * stripped out, and that no '<' appears between recognized tags. Release
 * notes routinely carry raw, unescaped HTML inside <description>, which
 * this parser has no reason to validate; stripping it (while keeping the
 * opening and closing tags themselves, so the stack still balances) is
 * enough to reject the malformed and truncated inputs the appcast parser
 * must not trust, without pulling in a full XML parser.
 */
function isWellFormedXml(xml: string): boolean {
  if (xml.trim().length === 0) return false;

  const cleaned = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .replace(/<description\b[^>]*>[\s\S]*?<\/description>/gi, '<description></description>');

  const tagPattern = /<\/?[a-zA-Z_][\w:.-]*(?:\s[^<>]*)?\/?>/g;
  const stack: string[] = [];
  let match: RegExpExecArray | null;
  let consumedEnd = 0;

  while ((match = tagPattern.exec(cleaned)) !== null) {
    // Any '<' between the previous tag and this one means the markup is malformed.
    if (cleaned.slice(consumedEnd, match.index).includes('<')) return false;

    const tag = match[0];

    if (tag.startsWith('</')) {
      const nameMatch = tag.match(/^<\/([a-zA-Z_][\w:.-]*)/);
      if (!nameMatch) return false;
      if (stack.length === 0 || stack[stack.length - 1] !== nameMatch[1]) return false;
      stack.pop();
    } else if (tag.endsWith('/>')) {
      // Self-closing: no nesting to track.
    } else {
      const nameMatch = tag.match(/^<([a-zA-Z_][\w:.-]*)/);
      if (!nameMatch) return false;
      stack.push(nameMatch[1]);
    }

    consumedEnd = tagPattern.lastIndex;
  }

  // Any '<' left after the last recognized tag means the markup is malformed.
  if (cleaned.slice(consumedEnd).includes('<')) return false;

  return stack.length === 0;
}

function extractEnclosureLength(itemBlock: string): number | null {
  const enclosureMatch = itemBlock.match(/<enclosure\b[^>]*>/i);
  if (!enclosureMatch) return null;

  const lengthMatch = enclosureMatch[0].match(/\blength\s*=\s*"([^"]*)"|\blength\s*=\s*'([^']*)'/i);
  if (!lengthMatch) return null;

  const raw = lengthMatch[1] ?? lengthMatch[2];
  if (raw === undefined || raw === '' || !/^\d+$/.test(raw)) return null;

  return Number.parseInt(raw, 10);
}

/**
 * Parses a Sparkle appcast and returns the short version string and
 * enclosure length of the item with the highest sparkle:version. Returns
 * null if there is no item with a sparkle:version, if that item is missing
 * a required field, or if the XML is not well-formed. Items without a
 * sparkle:version are ignored: they cannot be the maximum.
 */
export function parseAppcast(xml: string): AppcastInfo | null {
  if (!isWellFormedXml(xml)) return null;

  const itemBlocks = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi);
  if (!itemBlocks || itemBlocks.length === 0) return null;

  let best: { version: number; block: string } | null = null;

  for (const block of itemBlocks) {
    const versionMatch = block.match(/<sparkle:version>\s*(\d+)\s*<\/sparkle:version>/i);
    if (!versionMatch) continue;

    const version = Number.parseInt(versionMatch[1], 10);
    if (!best || version > best.version) {
      best = { version, block };
    }
  }

  if (!best) return null;

  const shortVersionMatch = best.block.match(
    /<sparkle:shortVersionString>([^<]+)<\/sparkle:shortVersionString>/i
  );
  if (!shortVersionMatch) return null;

  const shortVersion = shortVersionMatch[1].trim();
  if (shortVersion.length === 0) return null;

  const length = extractEnclosureLength(best.block);
  if (length === null) return null;

  return { version: shortVersion, length };
}

/** Formats a byte count as a decimal-MB string, e.g. 17283096 -> "17.3 MB". */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
