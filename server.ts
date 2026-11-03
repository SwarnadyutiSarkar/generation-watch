import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { registerLiveRoutes } from './src/server/liveRoutes';
import {
  CountryIndicatorObservation,
  CountryRecord,
  DatasetMetadata,
  EventRecord,
  FieldMappingConfig,
  MovementProfile,
  NewsArticleLead,
} from './src/types/research';
import { INITIAL_DATASETS_REGISTRY } from './src/data/sourceRegistry';
import { WORLD_BANK_INDICATORS } from './src/data/worldBankCatalog';
import {
  buildImportPreview,
  normalizeRowsToEventRecords,
} from './src/utils/csvNormalizer';
import {
  normalizeAndClusterGdeltArticles,
  RawGdeltArticle,
} from './src/utils/gdeltNormalizer';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const GDELT_CACHE_TTL_MS = Number(process.env.GDELT_CACHE_TTL_MS) || 15 * 60 * 1000;
const WORLDBANK_CACHE_TTL_MS = Number(process.env.WORLDBANK_CACHE_TTL_MS) || 60 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  isoTimestamp: string;
}

// In-memory caches & runtime state
const gdeltCache = new Map<string, CacheEntry<NewsArticleLead[]>>();
const worldBankIndicatorCache = new Map<string, CacheEntry<CountryIndicatorObservation[]>>();
let worldBankCountriesCache: CacheEntry<CountryRecord[]> | null = null;

// Staged CSV uploads/fetches awaiting researcher confirmation
const stagedImports = new Map<
  string,
  {
    rawText: string;
    fileName: string;
    createdAt: number;
  }
>();

// Server-side mirrors of session datasets, events, and movements
const serverDatasets = new Map<string, DatasetMetadata>(
  INITIAL_DATASETS_REGISTRY.map((d) => [d.id, { ...d }])
);
let serverEvents: EventRecord[] = [];
const serverMovements = new Map<string, MovementProfile>();

// GDELT status & rate-limit mutex (1 req / 5.5s)
let lastGdeltRequestMs = 0;
let gdeltMutex: Promise<void> = Promise.resolve();
const newsServiceStatus = {
  connectionStatus: 'local_import_ready' as 'connected' | 'local_import_ready' | 'rate_limited' | 'error',
  lastSuccessfulRetrieval: null as string | null,
  lastAttemptTimestamp: null as string | null,
  lastError: null as string | null,
  lastSearchQuery: null as string | null,
};

const worldBankServiceStatus = {
  connectionStatus: 'local_import_ready' as 'connected' | 'local_import_ready' | 'error',
  lastSuccessfulRetrieval: null as string | null,
  lastError: null as string | null,
};

function cleanupStagedImports() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [key, val] of stagedImports.entries()) {
    if (val.createdAt < cutoff) stagedImports.delete(key);
  }
}

async function throttledGdeltFetch(url: string): Promise<{ status: number; bodyText: string }> {
  let release!: () => void;
  const prev = gdeltMutex;
  gdeltMutex = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;

  try {
    const elapsed = Date.now() - lastGdeltRequestMs;
    if (elapsed < 5500) {
      await new Promise((r) => setTimeout(r, 5500 - elapsed));
    }
    lastGdeltRequestMs = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const resp = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'GenerationWatchObservatory/1.0 (Academic Research Platform)',
        },
        signal: controller.signal,
      });
      const bodyText = await resp.text();
      return { status: resp.status, bodyText };
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    release();
  }
}

async function fetchWorldBankCountries(): Promise<CountryRecord[]> {
  if (
    worldBankCountriesCache &&
    Date.now() - worldBankCountriesCache.timestamp < WORLDBANK_CACHE_TTL_MS * 6
  ) {
    return worldBankCountriesCache.data;
  }

  const url = 'https://api.worldbank.org/v2/country?format=json&per_page=350';
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`World Bank countries endpoint returned HTTP ${resp.status}`);
  }
  const json = await resp.json();
  if (!Array.isArray(json) || !Array.isArray(json[1])) {
    throw new Error('Unexpected response format from World Bank countries API.');
  }

  const countries: CountryRecord[] = json[1]
    .filter((item: any) => item?.region?.id && item.region.id !== 'NA' && item.id)
    .map((item: any) => {
      const lat = item.latitude ? Number(item.latitude) : null;
      const lng = item.longitude ? Number(item.longitude) : null;
      return {
        id: String(item.id).trim().toUpperCase(),
        iso2Code: String(item.iso2Code || '').trim().toUpperCase(),
        countryName: String(item.name || '').trim(),
        region: String(item.region?.value || 'Unspecified').trim(),
        incomeLevel: String(item.incomeLevel?.value || 'Not classified').trim(),
        capitalCity: String(item.capitalCity || '').trim(),
        referenceLat: lat !== null && Number.isFinite(lat) ? lat : null,
        referenceLng: lng !== null && Number.isFinite(lng) ? lng : null,
      };
    })
    .sort((a: CountryRecord, b: CountryRecord) => a.countryName.localeCompare(b.countryName));

  const nowIso = new Date().toISOString();
  worldBankCountriesCache = {
    data: countries,
    timestamp: Date.now(),
    isoTimestamp: nowIso,
  };
  worldBankServiceStatus.connectionStatus = 'connected';
  worldBankServiceStatus.lastSuccessfulRetrieval = nowIso;
  worldBankServiceStatus.lastError = null;

  const wbMeta = serverDatasets.get('world_bank');
  if (wbMeta) {
    wbMeta.connectionStatus = 'connected';
    wbMeta.lastSuccessfulRetrieval = nowIso;
    wbMeta.lastError = null;
  }

  return countries;
}

async function fetchWorldBankIndicatorSeries(
  countryCodeOrAll: string,
  indicatorCode: string,
  dateRange: string = '1990:2025',
  perPage: number = 250
): Promise<CountryIndicatorObservation[]> {
  const cacheKey = `${countryCodeOrAll.toUpperCase()}::${indicatorCode}::${dateRange}::${perPage}`;
  const cached = worldBankIndicatorCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < WORLDBANK_CACHE_TTL_MS) {
    return cached.data;
  }

  const spec = WORLD_BANK_INDICATORS.find((i) => i.code === indicatorCode);
  const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(
    countryCodeOrAll
  )}/indicator/${encodeURIComponent(indicatorCode)}?format=json&date=${encodeURIComponent(
    dateRange
  )}&per_page=${perPage}`;

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`World Bank indicator ${indicatorCode} returned HTTP ${resp.status}`);
  }
  const json = await resp.json();
  if (!Array.isArray(json)) {
    throw new Error(`Unexpected response from World Bank for ${indicatorCode}`);
  }

  const headerMeta = json[0] || {};
  const rows = Array.isArray(json[1]) ? json[1] : [];
  const retrievalDate = new Date().toISOString();
  const lastUpdatedBySource = headerMeta.lastupdated ? String(headerMeta.lastupdated) : null;

  const observations: CountryIndicatorObservation[] = rows
    .filter((r: any) => r && r.date && (r.countryiso3code || countryCodeOrAll.length === 3))
    .map((r: any) => {
      const iso3 = String(r.countryiso3code || countryCodeOrAll).trim().toUpperCase();
      const year = Number(r.date);
      const rawValue = r.value;
      // CRITICAL: Never substitute missing World Bank observations with 0
      const value =
        rawValue === null || rawValue === undefined || Number.isNaN(Number(rawValue))
          ? null
          : Number(rawValue);

      const officialIndicatorName = String(
        r.indicator?.value || spec?.officialName || indicatorCode
      );
      const isModelled =
        spec?.dataLabel === 'Modelled indicator' ||
        /modeled|modelled/i.test(officialIndicatorName);

      return {
        id: `wb_${iso3}_${indicatorCode}_${year}`,
        countryId: iso3,
        countryName: String(r.country?.value || iso3),
        indicatorCode,
        indicatorName: officialIndicatorName,
        unit: (r.unit && String(r.unit).trim()) || spec?.unit || 'Index / %',
        year,
        value,
        sourceName: 'World Bank Open Data (World Development Indicators)',
        sourceUrl: `https://data.worldbank.org/indicator/${indicatorCode}?locations=${
          r.country?.id || iso3
        }`,
        retrievalDate,
        lastUpdatedBySource,
        dataLabel: isModelled ? 'Modelled indicator' : 'Reported statistic',
      };
    });

  worldBankIndicatorCache.set(cacheKey, {
    data: observations,
    timestamp: Date.now(),
    isoTimestamp: retrievalDate,
  });

  worldBankServiceStatus.connectionStatus = 'connected';
  worldBankServiceStatus.lastSuccessfulRetrieval = retrievalDate;
  worldBankServiceStatus.lastError = null;

  const wbMeta = serverDatasets.get('world_bank');
  if (wbMeta) {
    wbMeta.connectionStatus = 'connected';
    wbMeta.lastSuccessfulRetrieval = retrievalDate;
    wbMeta.loadedRecordCount = worldBankIndicatorCache.size;
  }

  return observations;
}

export async function buildApp() {
  const app = express();
  app.use(express.json({ limit: '60mb' }));

  // 1. Health Endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      platform: 'Generation Watch Research Server',
      timestamp: new Date().toISOString(),
      aiInferenceRequired: false,
      services: {
        gdelt: newsServiceStatus,
        worldBank: worldBankServiceStatus,
        loadedServerEventRecords: serverEvents.length,
        loadedMovementProfiles: serverMovements.size,
      },
    });
  });

  // 2. GDELT News Status
  app.get('/api/news/status', (_req: Request, res: Response) => {
    res.json({
      ...newsServiceStatus,
      cachedQueries: gdeltCache.size,
      documentedWindowLimit: 'Most recent 3 months (GDELT DOC 2.0 specification)',
      rateLimitPolicy: 'Minimum 5.5s spacing between uncached upstream queries + 15m TTL cache',
    });
  });

  // 3. GDELT DOC 2.0 News Discovery
  app.get('/api/news', async (req: Request, res: Response) => {
    const rawQuery = String(
      req.query.query || '(protest OR demonstration OR "student protest" OR "general strike")'
    ).trim();
    const countryFilter = String(req.query.country || '').trim();
    const requestedTimespan = String(req.query.timespan || '7d').trim();
    const maxRecords = Math.min(Math.max(Number(req.query.maxrecords) || 50, 10), 100);

    // Validate timespan strictly within GDELT DOC 2.0's documented 3-month limit
    const validTimespans = new Set(['24h', '3d', '7d', '14d', '1m', '2m', '3m']);
    const safeTimespan = validTimespans.has(requestedTimespan) ? requestedTimespan : '7d';

    let fullQuery = rawQuery.startsWith('(') || !rawQuery.includes(' OR ')
      ? rawQuery
      : `(${rawQuery})`;
    if (countryFilter) {
      const safeCountry = countryFilter.replace(/"/g, '').trim();
      if (safeCountry) {
        fullQuery = `${fullQuery} "${safeCountry}"`;
      }
    }

    const gdeltUrl = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(
      fullQuery
    )}&mode=artlist&maxrecords=${maxRecords}&timespan=${safeTimespan}&format=json`;

    const cacheKey = `${fullQuery}::${safeTimespan}::${maxRecords}`;
    const cached = gdeltCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < GDELT_CACHE_TTL_MS) {
      return res.json({
        label: 'News-derived event leads — independently verify before treating as confirmed events.',
        cached: true,
        searchQuery: fullQuery,
        timespan: safeTimespan,
        retrievalDate: cached.isoTimestamp,
        lastSuccessfulRetrieval: newsServiceStatus.lastSuccessfulRetrieval,
        connectionStatus: 'connected',
        gdeltQueryUrl: gdeltUrl,
        leads: cached.data,
      });
    }

    newsServiceStatus.lastAttemptTimestamp = new Date().toISOString();
    newsServiceStatus.lastSearchQuery = fullQuery;

    try {
      const { status, bodyText } = await throttledGdeltFetch(gdeltUrl);

      if (status === 429 || bodyText.trim().startsWith('Please limit requests')) {
        newsServiceStatus.connectionStatus = 'rate_limited';
        newsServiceStatus.lastError =
          'GDELT DOC 2.0 API rate limit reached on shared server network (limit: 1 request per 5 seconds).';
        const gdeltDs = serverDatasets.get('gdelt_doc_v2');
        if (gdeltDs) {
          gdeltDs.connectionStatus = 'rate_limited';
          gdeltDs.lastError = newsServiceStatus.lastError;
        }
        return res.status(200).json({
          label: 'News-derived event leads — independently verify before treating as confirmed events.',
          cached: false,
          searchQuery: fullQuery,
          timespan: safeTimespan,
          retrievalDate: null,
          lastSuccessfulRetrieval: newsServiceStatus.lastSuccessfulRetrieval,
          connectionStatus: 'rate_limited',
          error: newsServiceStatus.lastError,
          upstreamMessage: bodyText.slice(0, 280),
          gdeltQueryUrl: gdeltUrl,
          leads: [],
        });
      }

      if (status < 200 || status >= 300) {
        throw new Error(`GDELT API returned HTTP ${status}`);
      }

      let parsed: { articles?: RawGdeltArticle[] } = {};
      if (bodyText.trim()) {
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          throw new Error(`Non-JSON response from GDELT: ${bodyText.slice(0, 140)}`);
        }
      }

      const retrievalDate = new Date().toISOString();
      const leads = normalizeAndClusterGdeltArticles(
        parsed.articles || [],
        fullQuery,
        retrievalDate
      );

      gdeltCache.set(cacheKey, {
        data: leads,
        timestamp: Date.now(),
        isoTimestamp: retrievalDate,
      });

      newsServiceStatus.connectionStatus = 'connected';
      newsServiceStatus.lastSuccessfulRetrieval = retrievalDate;
      newsServiceStatus.lastError = null;

      const gdeltDs = serverDatasets.get('gdelt_doc_v2');
      if (gdeltDs) {
        gdeltDs.connectionStatus = 'connected';
        gdeltDs.lastSuccessfulRetrieval = retrievalDate;
        gdeltDs.lastError = null;
        gdeltDs.loadedRecordCount = leads.length;
      }

      return res.json({
        label: 'News-derived event leads — independently verify before treating as confirmed events.',
        cached: false,
        searchQuery: fullQuery,
        timespan: safeTimespan,
        retrievalDate,
        lastSuccessfulRetrieval: retrievalDate,
        connectionStatus: 'connected',
        gdeltQueryUrl: gdeltUrl,
        leads,
      });
    } catch (err: any) {
      const msg = err?.message || 'Unable to reach GDELT DOC 2.0 API.';
      newsServiceStatus.connectionStatus = 'error';
      newsServiceStatus.lastError = msg;
      return res.status(200).json({
        label: 'News-derived event leads — independently verify before treating as confirmed events.',
        cached: false,
        searchQuery: fullQuery,
        timespan: safeTimespan,
        retrievalDate: null,
        lastSuccessfulRetrieval: newsServiceStatus.lastSuccessfulRetrieval,
        connectionStatus: 'error',
        error: msg,
        gdeltQueryUrl: gdeltUrl,
        leads: [],
      });
    }
  });

  // 4. World Bank Countries
  app.get('/api/worldbank/countries', async (_req: Request, res: Response) => {
    try {
      const countries = await fetchWorldBankCountries();
      res.json({
        source: 'World Bank Open Data API v2',
        lastSuccessfulRetrieval: worldBankServiceStatus.lastSuccessfulRetrieval,
        count: countries.length,
        countries,
      });
    } catch (err: any) {
      const msg = err?.message || 'Failed to retrieve World Bank country directory.';
      worldBankServiceStatus.connectionStatus = 'error';
      worldBankServiceStatus.lastError = msg;
      res.status(502).json({
        error: msg,
        lastSuccessfulRetrieval: worldBankServiceStatus.lastSuccessfulRetrieval,
        countries: [],
      });
    }
  });

  // 5. World Bank Indicators (Country-specific or Multi-country Panel)
  app.get('/api/worldbank/indicators', async (req: Request, res: Response) => {
    const countryParam = String(req.query.country || '').trim().toUpperCase();
    const indicatorsParam = String(req.query.indicators || '').trim();
    const dateRange = String(req.query.date || '1990:2025').trim();
    const perPage = Math.min(Math.max(Number(req.query.per_page) || 250, 50), 6000);

    if (!countryParam) {
      return res.status(400).json({
        error: 'Query parameter "country" (ISO3 code such as IND, KEN, CHL, or "ALL" for panel query) is required.',
      });
    }

    const requestedCodes = indicatorsParam
      ? indicatorsParam
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
      : WORLD_BANK_INDICATORS.map((i) => i.code);

    // If querying ALL countries for panel comparison, restrict to at most 2 indicators per call to respect World Bank bandwidth
    const safeCodes = countryParam === 'ALL' ? requestedCodes.slice(0, 2) : requestedCodes.slice(0, 10);

    try {
      const results = await Promise.all(
        safeCodes.map((code) =>
          fetchWorldBankIndicatorSeries(
            countryParam === 'ALL' ? 'all' : countryParam,
            code,
            dateRange,
            countryParam === 'ALL' ? 6000 : perPage
          )
        )
      );

      const observations = results.flat();
      res.json({
        country: countryParam,
        indicatorsRequested: safeCodes,
        dateRange,
        source: 'World Bank Open Data (World Development Indicators)',
        sourceUrl: 'https://data.worldbank.org/',
        lastSuccessfulRetrieval: worldBankServiceStatus.lastSuccessfulRetrieval,
        observationCount: observations.length,
        nonNullCount: observations.filter((o) => o.value !== null).length,
        observations,
      });
    } catch (err: any) {
      const msg = err?.message || 'Failed to fetch World Bank indicators.';
      worldBankServiceStatus.connectionStatus = 'error';
      worldBankServiceStatus.lastError = msg;
      res.status(502).json({
        error: msg,
        lastSuccessfulRetrieval: worldBankServiceStatus.lastSuccessfulRetrieval,
        observations: [],
      });
    }
  });

  // 6. Countries Directory & Single Country Summary
  app.get('/api/countries', async (_req: Request, res: Response) => {
    try {
      const countries = await fetchWorldBankCountries();
      const eventCounts = new Map<string, number>();
      for (const ev of serverEvents) {
        if (!ev.isBaselineZeroProtestRow) {
          eventCounts.set(ev.countryId, (eventCounts.get(ev.countryId) || 0) + 1);
        }
      }
      res.json({
        count: countries.length,
        lastSuccessfulRetrieval: worldBankServiceStatus.lastSuccessfulRetrieval,
        countries: countries.map((c) => ({
          ...c,
          serverHistoricalEventCount: eventCounts.get(c.id) || 0,
        })),
      });
    } catch (err: any) {
      res.status(502).json({
        error: err?.message || 'Unable to load countries.',
        lastSuccessfulRetrieval: worldBankServiceStatus.lastSuccessfulRetrieval,
        countries: [],
      });
    }
  });

  app.get('/api/countries/:id', async (req: Request, res: Response) => {
    const iso3 = String(req.params.id || '').trim().toUpperCase();
    try {
      const countries = await fetchWorldBankCountries();
      const country = countries.find((c) => c.id === iso3 || c.iso2Code === iso3);
      if (!country) {
        return res.status(404).json({ error: `Country ${iso3} not found in World Bank directory.` });
      }
      const events = serverEvents.filter(
        (e) => e.countryId === country.id && !e.isBaselineZeroProtestRow
      );
      const movements = Array.from(serverMovements.values()).filter(
        (m) => m.countryId === country.id
      );
      res.json({
        country,
        eventsCount: events.length,
        events: events.slice(0, 200),
        movements,
      });
    } catch (err: any) {
      res.status(502).json({ error: err?.message || 'Country lookup failed.' });
    }
  });

  // 7. Events Endpoints
  app.get('/api/events', (req: Request, res: Response) => {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
    const country = String(req.query.country || '').trim().toUpperCase();
    const datasetId = String(req.query.datasetId || '').trim();
    const eventType = String(req.query.eventType || '').trim();
    const search = String(req.query.search || '').trim().toLowerCase();
    const includeZeroBaseline = req.query.includeZeroBaseline === 'true';

    let filtered = serverEvents.filter((ev) => {
      if (!includeZeroBaseline && ev.isBaselineZeroProtestRow) return false;
      if (country && ev.countryId !== country) return false;
      if (datasetId && ev.datasetId !== datasetId) return false;
      if (eventType && ev.eventType !== eventType) return false;
      if (
        search &&
        !ev.eventName.toLowerCase().includes(search) &&
        !ev.countryName.toLowerCase().includes(search) &&
        !(ev.sourceNotes || '').toLowerCase().includes(search)
      ) {
        return false;
      }
      return true;
    });

    const total = filtered.length;
    const offset = (page - 1) * limit;
    res.json({
      page,
      limit,
      total,
      events: filtered.slice(offset, offset + limit),
    });
  });

  app.get('/api/events/:id', (req: Request, res: Response) => {
    const found = serverEvents.find((e) => e.id === req.params.id);
    if (!found) {
      return res.status(404).json({ error: 'Event record not found on server.' });
    }
    res.json(found);
  });

  // 8. Researcher-Authored Movement Profiles Endpoints
  app.get('/api/movements', (_req: Request, res: Response) => {
    const list = Array.from(serverMovements.values()).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
    res.json({ count: list.length, movements: list });
  });

  app.get('/api/movements/:id', (req: Request, res: Response) => {
    const m = serverMovements.get(req.params.id);
    if (!m) return res.status(404).json({ error: 'Movement profile not found.' });
    res.json(m);
  });

  app.post('/api/movements', (req: Request, res: Response) => {
    const body = req.body as MovementProfile;
    if (!body || !body.name || !body.countryName) {
      return res.status(400).json({ error: 'Movement name and countryName are required.' });
    }
    const now = new Date().toISOString();
    const id = body.id || `mov_${Date.now()}`;
    const saved: MovementProfile = {
      ...body,
      id,
      createdAt: body.createdAt || now,
      updatedAt: now,
    };
    serverMovements.set(id, saved);
    res.status(201).json(saved);
  });

  app.delete('/api/movements/:id', (req: Request, res: Response) => {
    serverMovements.delete(req.params.id);
    res.json({ deleted: true, id: req.params.id });
  });

  // 9. Dataset Import Preview, Harvard Dataverse Direct Fetch, & Confirmation
  app.post('/api/import/preview', (req: Request, res: Response) => {
    cleanupStagedImports();
    const { rawText, fileName = 'uploaded_dataset.csv', preset, mapping } = req.body || {};
    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({ error: 'CSV or TSV text payload is required for preview.' });
    }

    const preview = buildImportPreview(rawText, fileName, preset, mapping);
    const stagingId = `stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    stagedImports.set(stagingId, {
      rawText,
      fileName,
      createdAt: Date.now(),
    });

    res.json({
      stagingId,
      preview,
    });
  });

  // Fetch authentic public dataset file from Harvard Dataverse into staged preview (still requires explicit researcher confirmation)
  app.post('/api/import/dataverse-preview', async (req: Request, res: Response) => {
    cleanupStagedImports();
    const { datasetId } = req.body || {};
    const target = INITIAL_DATASETS_REGISTRY.find((d) => d.id === datasetId);
    if (!target || !target.dataverseFileId) {
      return res.status(400).json({
        error: 'Unsupported Harvard Dataverse dataset identifier.',
      });
    }

    const dataverseUrl = `https://dataverse.harvard.edu/api/access/datafile/${target.dataverseFileId}`;
    try {
      const resp = await fetch(dataverseUrl, {
        headers: {
          'User-Agent': 'GenerationWatchObservatory/1.0 (Academic Research Platform)',
        },
      });
      if (!resp.ok) {
        throw new Error(`Harvard Dataverse returned HTTP ${resp.status}`);
      }
      const rawText = await resp.text();
      const fileName =
        datasetId === 'mass_mobilization' ? 'mmALL_073120_csv.tab' : 'NAVCO_1.3_List.tab';
      const preset = datasetId === 'mass_mobilization' ? 'mass_mobilization' : 'navco';

      const preview = buildImportPreview(rawText, fileName, preset);
      const stagingId = `stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      stagedImports.set(stagingId, {
        rawText,
        fileName,
        createdAt: Date.now(),
      });

      res.json({
        stagingId,
        sourceUrl: target.sourceUrl,
        downloadUrl: dataverseUrl,
        preview,
      });
    } catch (err: any) {
      const msg = err?.message || 'Unable to download file from Harvard Dataverse.';
      const ds = serverDatasets.get(datasetId);
      if (ds) {
        ds.connectionStatus = 'error';
        ds.lastError = msg;
      }
      res.status(502).json({
        error: msg,
        manualDownloadUrl: target.sourceUrl,
      });
    }
  });

  app.post('/api/import/confirm', (req: Request, res: Response) => {
    const {
      stagingId,
      rawText: directRawText,
      datasetId,
      datasetName,
      sourceName,
      sourceUrl,
      licence,
      preset,
      mapping,
      replaceExisting = true,
    } = req.body || {};

    const staged = stagingId ? stagedImports.get(stagingId) : undefined;
    const rawText: string | undefined = staged?.rawText || directRawText;

    if (!rawText) {
      return res.status(400).json({
        error: 'Import session expired or missing raw CSV/TSV payload. Please preview the file again.',
      });
    }
    if (!datasetId || !mapping) {
      return res.status(400).json({
        error: 'datasetId and column mapping are required to confirm import.',
      });
    }

    const retrievalTimestamp = new Date().toISOString();
    const records = normalizeRowsToEventRecords({
      rawText,
      datasetId,
      datasetName: datasetName || datasetId,
      sourceName: sourceName || 'Researcher Imported Dataset',
      sourceUrl: sourceUrl || '',
      licence: licence || 'See original dataset terms',
      preset: preset || 'custom',
      mapping: mapping as FieldMappingConfig,
      retrievalTimestamp,
    });

    if (replaceExisting) {
      serverEvents = serverEvents.filter((e) => e.datasetId !== datasetId);
    }
    serverEvents.push(...records);

    const existingDs = serverDatasets.get(datasetId);
    if (existingDs) {
      existingDs.connectionStatus = 'connected';
      existingDs.lastSuccessfulRetrieval = retrievalTimestamp;
      existingDs.lastError = null;
      existingDs.loadedRecordCount = records.filter((r) => !r.isBaselineZeroProtestRow).length;
    } else {
      serverDatasets.set(datasetId, {
        id: datasetId,
        datasetName: datasetName || datasetId,
        provider: sourceName || 'Custom Upload',
        sourceUrl: sourceUrl || '',
        downloadUrl: sourceUrl || '',
        citation: sourceName || datasetName || datasetId,
        licence: licence || 'Researcher-supplied',
        coverageStart: 'See records',
        coverageEnd: 'See records',
        dataType: 'Historical dataset record',
        unitOfObservation: 'Imported CSV/TSV row',
        retrievalMethod: 'Manual CSV/TSV upload',
        updateFrequency: 'Manual',
        knownLimitations: ['Custom imported dataset; verify original codebook definitions.'],
        connectionStatus: 'connected',
        lastSuccessfulRetrieval: retrievalTimestamp,
        lastError: null,
        loadedRecordCount: records.length,
      });
    }

    if (stagingId) {
      stagedImports.delete(stagingId);
    }

    res.json({
      confirmed: true,
      datasetId,
      fileName: staged?.fileName || 'uploaded_dataset.csv',
      retrievalTimestamp,
      totalRowsNormalized: records.length,
      activeEventRecordsCount: records.filter((r) => !r.isBaselineZeroProtestRow).length,
      zeroProtestBaselineCount: records.filter((r) => r.isBaselineZeroProtestRow).length,
      records,
    });
  });

  // 10. Datasets & Data Status Endpoints
  app.get('/api/datasets', (_req: Request, res: Response) => {
    res.json({
      datasets: Array.from(serverDatasets.values()),
    });
  });

  app.get('/api/data-status', (_req: Request, res: Response) => {
    res.json({
      timestamp: new Date().toISOString(),
      gdelt: newsServiceStatus,
      worldBank: worldBankServiceStatus,
      datasets: Array.from(serverDatasets.values()),
      serverEventCount: serverEvents.filter((e) => !e.isBaselineZeroProtestRow).length,
      serverBaselineRowCount: serverEvents.filter((e) => e.isBaselineZeroProtestRow).length,
      serverMovementProfileCount: serverMovements.size,
    });
  });

  registerLiveRoutes(app);

  return app;
}

async function startServer() {
  const app = await buildApp();

  // Vite dev middleware OR static production serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Generation Watch server listening on http://0.0.0.0:${PORT}`);
  });
}

// On Vercel the app is mounted as a serverless function (api/index.ts) instead of listening on a port.
if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start Generation Watch server:', err);
    process.exit(1);
  });
}
