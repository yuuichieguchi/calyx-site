/**
 * Test suite for parseAppcast.
 *
 * Coverage:
 * - Happy path: realistic Sparkle appcast XML
 * - Selecting the item with the highest sparkle:version, not the first item
 * - Minimal payload with only the required fields
 * - Missing/malformed input returns null
 */

import { describe, it, expect } from 'vitest';
import { parseAppcast } from './appcast';

describe('parseAppcast', () => {
  it('should return version and length when given a realistic appcast', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Calyx Changelog</title>
    <item>
      <title>Version 0.41.0</title>
      <pubDate>Fri, 19 Sep 2026 10:00:00 +0000</pubDate>
      <sparkle:version>74</sparkle:version>
      <sparkle:shortVersionString>0.41.0</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>15.0</sparkle:minimumSystemVersion>
      <enclosure
        url="https://github.com/yuuichieguchi/Calyx/releases/download/v0.41.0/Calyx.zip"
        length="17283096"
        type="application/octet-stream"
        sparkle:edSignature="abc123=="
      />
    </item>
  </channel>
</rss>`;

    expect(parseAppcast(xml)).toEqual({ version: '0.41.0', length: 17283096 });
  });

  it('should return the item whose sparkle:version is highest, regardless of item order', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <item>
      <sparkle:version>70</sparkle:version>
      <sparkle:shortVersionString>0.39.0</sparkle:shortVersionString>
      <enclosure url="https://example.com/a.zip" length="1000000" />
    </item>
    <item>
      <sparkle:version>74</sparkle:version>
      <sparkle:shortVersionString>0.41.0</sparkle:shortVersionString>
      <enclosure url="https://example.com/b.zip" length="17283096" />
    </item>
    <item>
      <sparkle:version>72</sparkle:version>
      <sparkle:shortVersionString>0.40.0</sparkle:shortVersionString>
      <enclosure url="https://example.com/c.zip" length="2000000" />
    </item>
  </channel>
</rss>`;

    expect(parseAppcast(xml)).toEqual({ version: '0.41.0', length: 17283096 });
  });

  it('should parse a minimal payload with only the required fields', () => {
    const xml = `<rss><channel><item><sparkle:version>1</sparkle:version><sparkle:shortVersionString>1.0.0</sparkle:shortVersionString><enclosure length="42" /></item></channel></rss>`;

    expect(parseAppcast(xml)).toEqual({ version: '1.0.0', length: 42 });
  });

  it('should return null when there is no item', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>Calyx Changelog</title></channel></rss>`;

    expect(parseAppcast(xml)).toBeNull();
  });

  it('should return null when sparkle:shortVersionString is missing', () => {
    const xml = `<rss><channel><item><sparkle:version>74</sparkle:version><enclosure length="17283096" /></item></channel></rss>`;

    expect(parseAppcast(xml)).toBeNull();
  });

  it('should return null when the enclosure has no length attribute', () => {
    const xml = `<rss><channel><item><sparkle:version>74</sparkle:version><sparkle:shortVersionString>0.41.0</sparkle:shortVersionString><enclosure url="https://example.com/a.zip" /></item></channel></rss>`;

    expect(parseAppcast(xml)).toBeNull();
  });

  it('should return null for malformed XML', () => {
    const xml = `<rss><channel><item><sparkle:version>74<sparkle:shortVersionString>0.41.0</item></channel>`;

    expect(parseAppcast(xml)).toBeNull();
  });

  it('should return null when a complete item is followed by unclosed outer tags', () => {
    const xml = `<rss><channel><item><sparkle:version>74</sparkle:version><sparkle:shortVersionString>0.41.0</sparkle:shortVersionString><enclosure length="17283096" /></item>`;

    expect(parseAppcast(xml)).toBeNull();
  });

  it('should return null for an empty string', () => {
    expect(parseAppcast('')).toBeNull();
  });

  it('should return null for an unclosed tag', () => {
    const xml = `<rss><channel><item><sparkle:version>74</sparkle:version>`;

    expect(parseAppcast(xml)).toBeNull();
  });

  it('should parse an item whose description contains raw, unescaped HTML', () => {
    const xml = `<rss><channel><item><description><br><p>Fixed a bug</description><sparkle:version>74</sparkle:version><sparkle:shortVersionString>0.41.0</sparkle:shortVersionString><enclosure length="17283096" /></item></channel></rss>`;

    expect(parseAppcast(xml)).toEqual({ version: '0.41.0', length: 17283096 });
  });

  it('should parse an item whose description is a CDATA section containing raw HTML', () => {
    const xml = `<rss><channel><item><description><![CDATA[<ul><li>Fixed a bug<br></li></ul>]]></description><sparkle:version>74</sparkle:version><sparkle:shortVersionString>0.41.0</sparkle:shortVersionString><enclosure length="17283096" /></item></channel></rss>`;

    expect(parseAppcast(xml)).toEqual({ version: '0.41.0', length: 17283096 });
  });

  it('should tolerate surrounding whitespace in sparkle:version and sparkle:shortVersionString', () => {
    const xml = `<rss><channel><item><sparkle:version> 74 </sparkle:version><sparkle:shortVersionString> 0.41.0 </sparkle:shortVersionString><enclosure length="17283096" /></item></channel></rss>`;

    expect(parseAppcast(xml)).toEqual({ version: '0.41.0', length: 17283096 });
  });

  it('should still reject a description left unclosed by truncation', () => {
    const xml = `<rss><channel><item><description><br><sparkle:version>74</sparkle:version><sparkle:shortVersionString>0.41.0</sparkle:shortVersionString><enclosure length="17283096" /></item></channel></rss>`;

    expect(parseAppcast(xml)).toBeNull();
  });
});
