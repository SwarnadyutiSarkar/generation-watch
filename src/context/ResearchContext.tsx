import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  CountryIndicatorObservation,
  CountryRecord,
  DatasetMetadata,
  EventRecord,
  MovementProfile,
  NewsArticleLead,
  PageRoute,
  VerificationStatus,
} from '../types/research';
import { ResearchRepository, RawDatasetArchiveMeta } from '../services/researchStorage';
import { normalizeAndClusterGdeltArticles } from '../utils/gdeltNormalizer';

export interface NewsStatusState {
  loading: boolean;
  connectionStatus: 'connected' | 'local_import_ready' | 'rate_limited' | 'error';
  lastSuccessfulRetrieval: string | null;
  lastSearchQuery: string;
  timespan: string;
  error: string | null;
}

export type LiveSourceId = 'acled' | 'ucdp_ged';
export interface LiveStatus {
  acled: { configured: boolean };
  ucdp: { configured: boolean; version?: string };
}
export interface LiveSyncState {
  loading: boolean;
  message: string | null;
  error: string | null;
}

interface ResearchContextValue {
  liveStatus: LiveStatus | null;
  liveSync: Record<LiveSourceId, LiveSyncState>;
  syncLiveSource: (id: LiveSourceId) => Promise<void>;
  activePage: PageRoute;
  setActivePage: (page: PageRoute) => void;
  selectedCountryId: string;
  setSelectedCountryId: (iso3: string) => void;
  selectedMovementId: string | null;
  setSelectedMovementId: (id: string | null) => void;
  inspectedEvent: EventRecord | null;
  setInspectedEvent: (ev: EventRecord | null) => void;
  inspectedNewsLead: NewsArticleLead | null;
  setInspectedNewsLead: (lead: NewsArticleLead | null) => void;
  draftMovementSeed: Partial<MovementProfile> | null;
  setDraftMovementSeed: (seed: Partial<MovementProfile> | null) => void;

  // Core data
  countries: CountryRecord[];
  countriesLoading: boolean;
  countriesError: string | null;
  worldBankLastRetrieval: string | null;

  datasets: DatasetMetadata[];
  rawArchives: RawDatasetArchiveMeta[];
  events: EventRecord[];
  activeEvents: EventRecord[];
  eventsLoading: boolean;

  movements: MovementProfile[];
  newsLeads: NewsArticleLead[];
  newsStatus: NewsStatusState;

  // Actions
  refreshAllLocalData: () => Promise<void>;
  fetchNewsLeads: (params?: {
    query?: string;
    country?: string;
    timespan?: string;
    maxrecords?: number;
  }) => Promise<void>;
  fetchCountryIndicators: (countryIso3: string) => Promise<CountryIndicatorObservation[]>;
  fetchPanelIndicators: (
    indicatorCode: string,
    dateRange?: string
  ) => Promise<CountryIndicatorObservation[]>;
  saveMovementProfile: (profile: MovementProfile) => Promise<void>;
  deleteMovementProfile: (id: string) => Promise<void>;
  updateRecordVerification: (
    targetId: string,
    targetType: 'event' | 'news' | 'movement',
    status: VerificationStatus,
    notes: string | null
  ) => Promise<void>;
  removeImportedDataset: (datasetId: string) => Promise<void>;
  navigateToCountryProfile: (iso3: string) => void;
  startMovementFromEvent: (ev: EventRecord) => void;
}

const ResearchContext = createContext<ResearchContextValue | null>(null);

export function ResearchProvider({ children }: { children: React.ReactNode }) {
  const [activePage, setActivePage] = useState<PageRoute>('overview');
  const [selectedCountryId, setSelectedCountryId] = useState<string>('KEN');
  const [selectedMovementId, setSelectedMovementId] = useState<string | null>(null);
  const [inspectedEvent, setInspectedEvent] = useState<EventRecord | null>(null);
  const [inspectedNewsLead, setInspectedNewsLead] = useState<NewsArticleLead | null>(null);
  const [draftMovementSeed, setDraftMovementSeed] = useState<Partial<MovementProfile> | null>(null);

  const [countries, setCountries] = useState<CountryRecord[]>([]);
  const [countriesLoading, setCountriesLoading] = useState<boolean>(true);
  const [countriesError, setCountriesError] = useState<string | null>(null);
  const [worldBankLastRetrieval, setWorldBankLastRetrieval] = useState<string | null>(null);

  const [datasets, setDatasets] = useState<DatasetMetadata[]>([]);
  const [rawArchives, setRawArchives] = useState<RawDatasetArchiveMeta[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [eventsLoading, setEventsLoading] = useState<boolean>(true);
  const [movements, setMovements] = useState<MovementProfile[]>([]);
  const [newsLeads, setNewsLeads] = useState<NewsArticleLead[]>([]);

  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [liveSync, setLiveSync] = useState<Record<LiveSourceId, LiveSyncState>>({
    acled: { loading: false, message: null, error: null },
    ucdp_ged: { loading: false, message: null, error: null },
  });

  const [newsStatus, setNewsStatus] = useState<NewsStatusState>({
    loading: false,
    connectionStatus: 'local_import_ready',
    lastSuccessfulRetrieval: null,
    lastSearchQuery: '(protest OR demonstration OR "student protest" OR "general strike")',
    timespan: '7d',
    error: null,
  });

  // UCDP armed-conflict records are context, not protests, so they are kept out of protest counts.
  const activeEvents = useMemo(
    () => events.filter((e) => !e.isBaselineZeroProtestRow && e.eventType !== 'Armed conflict event'),
    [events]
  );

  const refreshAllLocalData = useCallback(async () => {
    setEventsLoading(true);
    try {
      try {
        await ResearchRepository.ensureSeedData();
      } catch (e) {
        console.error('Seed data load failed', e);
      }
      const [loadedDatasets, loadedArchives, loadedEvents, loadedMovements, cachedNews] =
        await Promise.all([
          ResearchRepository.getDatasets(),
          ResearchRepository.getAllRawArchiveMetas(),
          ResearchRepository.getAllEvents(),
          ResearchRepository.getMovementProfiles(),
          ResearchRepository.getCachedNewsLeads(),
        ]);

      setDatasets(loadedDatasets);
      setRawArchives(loadedArchives);
      setEvents(loadedEvents);
      setMovements(loadedMovements);
      if (cachedNews.length > 0) {
        setNewsLeads(cachedNews);
      }
    } finally {
      setEventsLoading(false);
    }
  }, []);

  // Load World Bank Country Directory
  const loadWorldBankCountries = useCallback(async () => {
    setCountriesLoading(true);
    setCountriesError(null);
    try {
      const resp = await fetch('/api/worldbank/countries');
      const data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      setCountries(data.countries || []);
      setWorldBankLastRetrieval(data.lastSuccessfulRetrieval || new Date().toISOString());

      // Persist World Bank registry status
      const allDs = await ResearchRepository.getDatasets();
      const wb = allDs.find((d) => d.id === 'world_bank');
      if (wb) {
        const updatedWb: DatasetMetadata = {
          ...wb,
          connectionStatus: 'connected',
          lastSuccessfulRetrieval: data.lastSuccessfulRetrieval || new Date().toISOString(),
          lastError: null,
          loadedRecordCount: (data.countries || []).length,
        };
        await ResearchRepository.saveDatasetMetadata(updatedWb);
        setDatasets((prev) => prev.map((d) => (d.id === 'world_bank' ? updatedWb : d)));
      }
    } catch (err: any) {
      setCountriesError(err?.message || 'Unable to connect to World Bank Open Data API.');
    } finally {
      setCountriesLoading(false);
    }
  }, []);

  // Fetch GDELT DOC 2.0 News Leads
  const fetchNewsLeads = useCallback(
    async (params?: {
      query?: string;
      country?: string;
      timespan?: string;
      maxrecords?: number;
    }) => {
      const q =
        params?.query ??
        newsStatus.lastSearchQuery ??
        '(protest OR demonstration OR "student protest" OR "general strike")';
      const ts = params?.timespan ?? newsStatus.timespan ?? '7d';
      const country = params?.country ?? '';
      const maxrecords = params?.maxrecords ?? 50;

      setNewsStatus((prev) => ({
        ...prev,
        loading: true,
        error: null,
        lastSearchQuery: q,
        timespan: ts,
      }));

      try {
        const qs = new URLSearchParams({
          query: q,
          timespan: ts,
          maxrecords: String(maxrecords),
        });
        if (country) qs.set('country', country);

        const resp = await fetch(`/api/news?${qs.toString()}`);
        const data = await resp.json();

        if (data.connectionStatus === 'connected' && Array.isArray(data.leads)) {
          await ResearchRepository.saveNewsLeads(data.leads);
          const refreshedLeads = await ResearchRepository.getCachedNewsLeads();
          // Filter to current query leads if freshly retrieved, or show current leads
          const currentIds = new Set(data.leads.map((l: NewsArticleLead) => l.id));
          const mergedCurrent = refreshedLeads.filter((l) => currentIds.has(l.id));

          setNewsLeads(mergedCurrent);
          setNewsStatus({
            loading: false,
            connectionStatus: 'connected',
            lastSuccessfulRetrieval: data.retrievalDate || new Date().toISOString(),
            lastSearchQuery: data.searchQuery || q,
            timespan: ts,
            error: null,
          });

          const allDs = await ResearchRepository.getDatasets();
          const gd = allDs.find((d) => d.id === 'gdelt_doc_v2');
          if (gd) {
            const updated: DatasetMetadata = {
              ...gd,
              connectionStatus: 'connected',
              lastSuccessfulRetrieval: data.retrievalDate || new Date().toISOString(),
              lastError: null,
              loadedRecordCount: mergedCurrent.length,
            };
            await ResearchRepository.saveDatasetMetadata(updated);
            setDatasets((prev) => prev.map((d) => (d.id === 'gdelt_doc_v2' ? updated : d)));
          }
          return;
        }

        // If shared Cloud Run NAT egress IP hit GDELT's 5s rate limit or timeout, attempt polite single browser fetch (public CORS endpoint, zero secrets)
        if ((data.connectionStatus === 'rate_limited' || data.connectionStatus === 'error') && data.gdeltQueryUrl) {
          try {
            const directResp = await fetch(data.gdeltQueryUrl, {
              headers: { Accept: 'application/json' },
            });
            const bodyText = await directResp.text();
            if (directResp.ok && !bodyText.trim().startsWith('Please limit requests')) {
              const parsed = bodyText.trim() ? JSON.parse(bodyText) : {};
              const nowIso = new Date().toISOString();
              const normalized = normalizeAndClusterGdeltArticles(
                parsed.articles || [],
                data.searchQuery || q,
                nowIso
              );
              await ResearchRepository.saveNewsLeads(normalized);
              const refreshed = await ResearchRepository.getCachedNewsLeads();
              const ids = new Set(normalized.map((n) => n.id));
              const active = refreshed.filter((l) => ids.has(l.id));

              setNewsLeads(active);
              setNewsStatus({
                loading: false,
                connectionStatus: 'connected',
                lastSuccessfulRetrieval: nowIso,
                lastSearchQuery: data.searchQuery || q,
                timespan: ts,
                error: null,
              });

              const allDs = await ResearchRepository.getDatasets();
              const gd = allDs.find((d) => d.id === 'gdelt_doc_v2');
              if (gd) {
                const updated: DatasetMetadata = {
                  ...gd,
                  connectionStatus: 'connected',
                  lastSuccessfulRetrieval: nowIso,
                  lastError: null,
                  loadedRecordCount: active.length,
                };
                await ResearchRepository.saveDatasetMetadata(updated);
                setDatasets((prev) => prev.map((d) => (d.id === 'gdelt_doc_v2' ? updated : d)));
              }
              return;
            }
          } catch {
            // Fall through to transparent rate-limit status reporting
          }
        }

        // Transparently report rate limit or upstream error without fabricating articles
        const statusType = data.connectionStatus === 'rate_limited' ? 'rate_limited' : 'error';
        const errMessage =
          data.error ||
          'GDELT DOC 2.0 API rate limit active (maximum 1 request per 5 seconds). Please wait a few seconds before querying again.';

        setNewsStatus((prev) => ({
          ...prev,
          loading: false,
          connectionStatus: statusType,
          lastSuccessfulRetrieval: data.lastSuccessfulRetrieval || prev.lastSuccessfulRetrieval,
          error: errMessage,
        }));

        const allDs = await ResearchRepository.getDatasets();
        const gd = allDs.find((d) => d.id === 'gdelt_doc_v2');
        if (gd) {
          const updated: DatasetMetadata = {
            ...gd,
            connectionStatus: statusType,
            lastError: errMessage,
          };
          await ResearchRepository.saveDatasetMetadata(updated);
          setDatasets((prev) => prev.map((d) => (d.id === 'gdelt_doc_v2' ? updated : d)));
        }
      } catch (err: any) {
        setNewsStatus((prev) => ({
          ...prev,
          loading: false,
          connectionStatus: 'error',
          error: err?.message || 'Network error while querying GDELT DOC 2.0 API.',
        }));
      }
    },
    [newsStatus.lastSearchQuery, newsStatus.timespan]
  );

  const syncLiveSource = useCallback(
    async (id: LiveSourceId) => {
      const setState = (patch: Partial<LiveSyncState>) =>
        setLiveSync((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
      setState({ loading: true, error: null, message: null });
      try {
        const url = id === 'acled' ? '/api/acled/events?days=90' : '/api/ucdp/events?days=180';
        const resp = await fetch(url);
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.error) {
          throw new Error(data.error || `HTTP ${resp.status}`);
        }
        const records: EventRecord[] = data.records || [];
        const allDs = await ResearchRepository.getDatasets();
        const base = allDs.find((d) => d.id === id);
        if (!base) throw new Error('Dataset registry entry not found.');
        const stamp: string = data.retrievalTimestamp || new Date().toISOString();
        await ResearchRepository.saveImportedDatasetRecords({
          datasetMeta: {
            ...base,
            connectionStatus: 'connected',
            lastSuccessfulRetrieval: stamp,
            lastError: null,
            loadedRecordCount: records.length,
          },
          rawArchive: {
            datasetId: id,
            fileName: `${id} API sync ${stamp.slice(0, 10)}`,
            delimiter: 'json',
            headers: [],
            rawRowCount: data.rawCount ?? records.length,
            importedAt: stamp,
            sampleRawRows: records.slice(0, 5).map((r) => r.rawFields),
          },
          records,
          replaceExisting: true,
        });
        await refreshAllLocalData();
        setState({ loading: false, message: `Loaded ${records.length.toLocaleString()} ${records.length === 1 ? "record" : "records"}.`, error: null });
      } catch (err: any) {
        setState({ loading: false, error: err?.message || 'Sync failed.' });
      }
    },
    [refreshAllLocalData]
  );

  const fetchCountryIndicators = useCallback(
    async (countryIso3: string): Promise<CountryIndicatorObservation[]> => {
      const resp = await fetch(
        `/api/worldbank/indicators?country=${encodeURIComponent(countryIso3)}&date=1990:2025`
      );
      const data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      const obs: CountryIndicatorObservation[] = data.observations || [];
      await ResearchRepository.saveCountryIndicators(obs);
      if (data.lastSuccessfulRetrieval) {
        setWorldBankLastRetrieval(data.lastSuccessfulRetrieval);
      }
      return obs;
    },
    []
  );

  const fetchPanelIndicators = useCallback(
    async (
      indicatorCode: string,
      dateRange: string = '2000:2020'
    ): Promise<CountryIndicatorObservation[]> => {
      const resp = await fetch(
        `/api/worldbank/indicators?country=ALL&indicators=${encodeURIComponent(
          indicatorCode
        )}&date=${encodeURIComponent(dateRange)}`
      );
      const data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      return data.observations || [];
    },
    []
  );

  const saveMovementProfile = useCallback(async (profile: MovementProfile) => {
    await ResearchRepository.saveMovementProfile(profile);
    try {
      await fetch('/api/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
    } catch {
      // IndexedDB remains authoritative if offline
    }
    const updated = await ResearchRepository.getMovementProfiles();
    setMovements(updated);
    setSelectedMovementId(profile.id);
  }, []);

  const deleteMovementProfile = useCallback(async (id: string) => {
    await ResearchRepository.deleteMovementProfile(id);
    try {
      await fetch(`/api/movements/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      // Ignore
    }
    const updated = await ResearchRepository.getMovementProfiles();
    setMovements(updated);
    setSelectedMovementId((prev) => (prev === id ? updated[0]?.id || null : prev));
  }, []);

  const updateRecordVerification = useCallback(
    async (
      targetId: string,
      targetType: 'event' | 'news' | 'movement',
      status: VerificationStatus,
      notes: string | null
    ) => {
      await ResearchRepository.updateVerificationStatus(targetId, targetType, status, notes);
      if (targetType === 'event') {
        const refreshed = await ResearchRepository.getAllEvents();
        setEvents(refreshed);
        setInspectedEvent((prev) =>
          prev && prev.id === targetId
            ? refreshed.find((r) => r.id === targetId) || prev
            : prev
        );
      } else if (targetType === 'news') {
        setNewsLeads((prev) =>
          prev.map((l) =>
            l.id === targetId ? { ...l, verificationStatus: status, reviewerNotes: notes } : l
          )
        );
        setInspectedNewsLead((prev) =>
          prev && prev.id === targetId
            ? { ...prev, verificationStatus: status, reviewerNotes: notes }
            : prev
        );
      } else {
        const updatedMovs = await ResearchRepository.getMovementProfiles();
        setMovements(updatedMovs);
      }
    },
    []
  );

  const removeImportedDataset = useCallback(
    async (datasetId: string) => {
      await ResearchRepository.deleteDatasetRecords(datasetId);
      await refreshAllLocalData();
    },
    [refreshAllLocalData]
  );

  const navigateToCountryProfile = useCallback((iso3: string) => {
    setSelectedCountryId(iso3);
    setActivePage('countries');
  }, []);

  const startMovementFromEvent = useCallback((ev: EventRecord) => {
    //Strictly transfers ONLY documented metadata from the event record; leaves interpretive sections blank for researcher authoring
    setDraftMovementSeed({
      name: ev.eventName,
      countryId: ev.countryId,
      countryName: ev.countryName,
      region: ev.region,
      startDate: ev.eventDate || (ev.startYear ? String(ev.startYear) : ''),
      endDate: ev.endYear ? String(ev.endYear) : '',
      classification: ev.eventType,
      demands: ev.demands.length > 0 ? [...ev.demands] : [],
      participantsAndLeadership: [ev.protesterIdentity, ev.participants]
        .filter(Boolean)
        .join(' — '),
      governmentResponse: ev.stateResponses.join(', '),
      outcomes: ev.campaignOutcome || '',
      sources: ev.sourceUrl
        ? [
            {
              title: `${ev.datasetName} (Record ID: ${ev.sourceRecordId})`,
              url: ev.sourceUrl,
              publisher: ev.sourceName,
              accessDate: ev.retrievalTimestamp.slice(0, 10),
            },
          ]
        : [],
    });
    setInspectedEvent(null);
    setActivePage('movements');
  }, []);

  useEffect(() => {
    refreshAllLocalData();
    loadWorldBankCountries();
    fetchNewsLeads();

    // If ACLED / UCDP credentials are configured on the server, keep the local copy fresh (every 6 hours).
    (async () => {
      try {
        const resp = await fetch('/api/live/status');
        if (!resp.ok) return;
        const status: LiveStatus = await resp.json();
        setLiveStatus(status);
        const ds = await ResearchRepository.getDatasets();
        const stale = (id: string) => {
          const last = ds.find((d) => d.id === id)?.lastSuccessfulRetrieval;
          return !last || Date.now() - new Date(last).getTime() > 6 * 3600 * 1000;
        };
        if (status.acled.configured && stale('acled')) await syncLiveSource('acled');
        if (status.ucdp.configured && stale('ucdp_ged')) await syncLiveSource('ucdp_ged');
      } catch {
        // Live sources are optional; the app works without them.
      }
    })();
  }, []);

  return (
    <ResearchContext.Provider
      value={{
        liveStatus,
        liveSync,
        syncLiveSource,
        activePage,
        setActivePage,
        selectedCountryId,
        setSelectedCountryId,
        selectedMovementId,
        setSelectedMovementId,
        inspectedEvent,
        setInspectedEvent,
        inspectedNewsLead,
        setInspectedNewsLead,
        draftMovementSeed,
        setDraftMovementSeed,
        countries,
        countriesLoading,
        countriesError,
        worldBankLastRetrieval,
        datasets,
        rawArchives,
        events,
        activeEvents,
        eventsLoading,
        movements,
        newsLeads,
        newsStatus,
        refreshAllLocalData,
        fetchNewsLeads,
        fetchCountryIndicators,
        fetchPanelIndicators,
        saveMovementProfile,
        deleteMovementProfile,
        updateRecordVerification,
        removeImportedDataset,
        navigateToCountryProfile,
        startMovementFromEvent,
      }}
    >
      {children}
    </ResearchContext.Provider>
  );
}

export function useResearch(): ResearchContextValue {
  const ctx = useContext(ResearchContext);
  if (!ctx) {
    throw new Error('useResearch must be used within a ResearchProvider');
  }
  return ctx;
}
