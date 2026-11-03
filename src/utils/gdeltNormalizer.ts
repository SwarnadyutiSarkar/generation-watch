import { NewsArticleLead } from '../types/research';

export interface RawGdeltArticle {
  url?: string;
  url_mobile?: string;
  title?: string;
  seendate?: string;
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

export function parseGdeltSeenDate(seendate?: string): string {
  if (!seendate) return new Date().toISOString();
  // Format: YYYYMMDDTHHMMSSZ
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(seendate.trim());
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`;
  }
  const parsed = Date.parse(seendate);
  return Number.isNaN(parsed) ? seendate : new Date(parsed).toISOString();
}

function buildHeadlineFingerprint(title: string, country: string | null): string {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'over',
    'after',
    'amid',
    'from',
    'into',
    'against',
    'says',
    'report',
    'news',
    'live',
    'updates',
  ]);
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .slice(0, 6)
    .sort();

  if (tokens.length < 3) {
    return `${(country || 'global').toLowerCase()}::${title.toLowerCase().trim().slice(0, 48)}`;
  }
  return `${(country || 'global').toLowerCase()}::${tokens.join('_')}`;
}

/**
 * Deduplicates syndicated GDELT news coverage into distinct event-lead clusters
 * while preserving every individual publisher link for independent verification.
 */
export function normalizeAndClusterGdeltArticles(
  rawArticles: RawGdeltArticle[],
  searchQuery: string,
  retrievalDate: string = new Date().toISOString()
): NewsArticleLead[] {
  const clusters = new Map<string, NewsArticleLead>();
  const seenUrls = new Set<string>();

  for (const raw of rawArticles) {
    const url = (raw.url || '').trim();
    const title = (raw.title || '').trim();
    if (!url || !title || seenUrls.has(url)) continue;
    seenUrls.add(url);

    const publisher = (raw.domain || '').trim() || 'Unspecified Publisher';
    const publicationDate = parseGdeltSeenDate(raw.seendate);
    const country = raw.sourcecountry ? raw.sourcecountry.trim() : null;
    const language = raw.language ? raw.language.trim() : null;

    const fingerprint = buildHeadlineFingerprint(title, country);
    const existing = clusters.get(fingerprint);

    if (!existing) {
      const id = `gdelt_${BufferSafeHash(url)}`;
      clusters.set(fingerprint, {
        id,
        title,
        publisher,
        articleUrl: url,
        publicationDate,
        retrievalDate,
        searchQuery,
        country,
        language,
        associatedEventId: null,
        verificationStatus: 'unverified',
        reviewerNotes: null,
        recordType: 'News-derived event lead',
        clusterId: fingerprint,
        duplicateCount: 1,
        corroboratingArticles: [
          {
            title,
            publisher,
            articleUrl: url,
            publicationDate,
          },
        ],
      });
    } else {
      existing.duplicateCount += 1;
      existing.corroboratingArticles.push({
        title,
        publisher,
        articleUrl: url,
        publicationDate,
      });
    }
  }

  return Array.from(clusters.values()).sort((a, b) =>
    b.publicationDate.localeCompare(a.publicationDate)
  );
}

function BufferSafeHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
