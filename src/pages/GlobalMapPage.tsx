import React, { useMemo, useState } from 'react';
import {
  Search,
  Layers,
  ExternalLink,
  ArrowRight,
  AlertCircle,
  Database,
} from 'lucide-react';
import { useResearch } from '../context/ResearchContext';
import { InteractiveWorldMap, CountryMapAggregate } from '../components/InteractiveWorldMap';
import { EventClassification } from '../types/research';
import { resolveCountryIso3 } from '../data/worldBankCatalog';

const EVENT_CLASSIFICATIONS: EventClassification[] = [
  'Individual protest event',
  'Organised protest campaign',
  'Youth-led movement',
  'Student movement',
  'Labour movement',
  'General public demonstration',
  'Violent demonstration',
  'Civil resistance campaign',
  'Armed conflict event',
];

export const GlobalMapPage: React.FC = () => {
  const {
    countries,
    activeEvents,
    eventsLoading,
    datasets,
    movements,
    newsLeads,
    newsStatus,
    selectedCountryId,
    setSelectedCountryId,
    setInspectedEvent,
    setInspectedNewsLead,
    navigateToCountryProfile,
    setActivePage,
  } = useResearch();

  const [countrySearch, setCountrySearch] = useState<string>('');
  const [selectedDataset, setSelectedDataset] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [verificationFilter, setVerificationFilter] = useState<string>('all');
  const [yearFrom, setYearFrom] = useState<string>('');
  const [yearTo, setYearTo] = useState<string>('');

  const [showHistoricalPoints, setShowHistoricalPoints] = useState<boolean>(true);
  const [showCountrySummary, setShowCountrySummary] = useState<boolean>(true);
  const [showNewsLayer, setShowNewsLayer] = useState<boolean>(true);

  const importedHistoricalDatasets = useMemo(
    () =>
      datasets.filter(
        (d) =>
          !d.isFutureRegistryOnly &&
          d.loadedRecordCount > 0 &&
          (d.id === 'mass_mobilization' || d.id === 'navco' || d.id.startsWith('custom_'))
      ),
    [datasets]
  );

  const filteredEvents = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    const minY = yearFrom ? Number(yearFrom) : null;
    const maxY = yearTo ? Number(yearTo) : null;

    return activeEvents.filter((ev) => {
      if (selectedDataset !== 'all' && ev.datasetId !== selectedDataset) return false;
      if (selectedCategory !== 'all' && ev.eventType !== selectedCategory) return false;
      if (verificationFilter !== 'all' && ev.verificationStatus !== verificationFilter) return false;
      if (minY !== null && (ev.startYear === null || ev.startYear < minY)) return false;
      if (maxY !== null && (ev.startYear === null || ev.startYear > maxY)) return false;
      if (
        q &&
        !ev.countryName.toLowerCase().includes(q) &&
        !ev.countryId.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [
    activeEvents,
    countrySearch,
    selectedDataset,
    selectedCategory,
    verificationFilter,
    yearFrom,
    yearTo,
  ]);

  const coordinateEvents = useMemo(
    () =>
      filteredEvents.filter(
        (e) =>
          e.locationPrecision === 'coordinates' && e.latitude !== null && e.longitude !== null
      ),
    [filteredEvents]
  );

  const countryAggregates = useMemo<CountryMapAggregate[]>(() => {
    const map = new Map<string, CountryMapAggregate>();
    for (const ev of filteredEvents) {
      if (!ev.countryId || ev.countryId === 'UNK') continue;
      const entry = map.get(ev.countryId) || {
        countryId: ev.countryId,
        countryName: ev.countryName,
        historicalCount: 0,
        corroboratedCount: 0,
        newsLeadCount: 0,
      };
      entry.historicalCount += 1;
      if (ev.verificationStatus === 'corroborated') entry.corroboratedCount += 1;
      map.set(ev.countryId, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.historicalCount - a.historicalCount);
  }, [filteredEvents]);

  // Country Side-Panel Data
  const selectedCountryMeta = useMemo(
    () => countries.find((c) => c.id === selectedCountryId),
    [countries, selectedCountryId]
  );

  const selectedCountryEvents = useMemo(
    () =>
      filteredEvents
        .filter((e) => e.countryId === selectedCountryId)
        .sort((a, b) => (b.startYear || 0) - (a.startYear || 0)),
    [filteredEvents, selectedCountryId]
  );

  const selectedCountryMovements = useMemo(
    () => movements.filter((m) => m.countryId === selectedCountryId),
    [movements, selectedCountryId]
  );

  const selectedCountryNews = useMemo(
    () =>
      newsLeads.filter((n) => {
        if (!n.country) return false;
        return resolveCountryIso3(n.country) === selectedCountryId;
      }),
    [newsLeads, selectedCountryId]
  );

  const matchingCountryDirectory = useMemo(() => {
    if (!countrySearch.trim()) return [];
    const q = countrySearch.trim().toLowerCase();
    return countries
      .filter(
        (c) =>
          c.countryName.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [countries, countrySearch]);

  return (
    <div className="space-y-6">
      <header className="border-b border-[#E4E2DC] pb-5 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="text-xs text-[#525866] mb-1">
            Cartographic Research Observatory · Non-Fabricated Coordinate Policy
          </div>
          <h1 className="text-3xl font-semibold text-[#0F1E36]">
            Global Protest &amp; Campaign Cartography
          </h1>
        </div>

        <div className="text-xs text-[#525866] font-mono tabular-nums">
          Filtered observations: <strong className="text-[#0F1E36]">{filteredEvents.length.toLocaleString()}</strong>{' '}
          ({coordinateEvents.length.toLocaleString()} exact coordinates ·{' '}
          {(filteredEvents.length - coordinateEvents.length).toLocaleString()} country/locality attribution)
        </div>
      </header>

      {/* Filter & Layer Control Bar */}
      <div className="bg-white border border-[#E4E2DC] p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="relative">
            <label className="block text-[11px] font-medium text-[#525866] mb-1">
              Search Country
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#767D8C] absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                placeholder="Country name or ISO3..."
                className="w-full border border-[#CFCBC2] bg-white pl-8 pr-2.5 py-1.5 text-xs text-[#1C1F26]"
              />
            </div>
            {matchingCountryDirectory.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {matchingCountryDirectory.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCountryId(c.id);
                      setCountrySearch('');
                    }}
                    className="px-2 py-0.5 text-[11px] bg-[#F1EFEA] hover:bg-[#E4E2DC] text-[#0F1E36] rounded cursor-pointer"
                  >
                    {c.countryName} ({c.id})
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#525866] mb-1">Data Source</label>
            <select
              value={selectedDataset}
              onChange={(e) => setSelectedDataset(e.target.value)}
              className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs text-[#1C1F26]"
            >
              <option value="all">All Imported Sources</option>
              {importedHistoricalDatasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.datasetName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#525866] mb-1">
              Mobilisation Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs text-[#1C1F26]"
            >
              <option value="all">All Categories</option>
              {EVENT_CLASSIFICATIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#525866] mb-1">
              Verification Status
            </label>
            <select
              value={verificationFilter}
              onChange={(e) => setVerificationFilter(e.target.value)}
              className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs text-[#1C1F26]"
            >
              <option value="all">All Statuses</option>
              <option value="corroborated">Corroborated</option>
              <option value="reviewed">Reviewed</option>
              <option value="conflicting">Conflicting</option>
              <option value="unverified">Unverified</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#525866] mb-1">Start Year</label>
            <input
              type="number"
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
              placeholder="1900"
              className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#525866] mb-1">End Year</label>
            <input
              type="number"
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
              placeholder="2025"
              className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums"
            />
          </div>
        </div>

        {/* Layer Toggles */}
        <div className="pt-3 border-t border-[#E4E2DC] flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-[#0F1E36]">
              <Layers className="w-3.5 h-3.5" />
              <span>Map Layers:</span>
            </span>

            <label className="inline-flex items-center gap-2 cursor-pointer text-[#1C1F26]">
              <input
                type="checkbox"
                checked={showHistoricalPoints}
                onChange={(e) => setShowHistoricalPoints(e.target.checked)}
                className="accent-[#0F1E36]"
              />
              <span>Exact Coordinate Pins ({coordinateEvents.length.toLocaleString()})</span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer text-[#1C1F26]">
              <input
                type="checkbox"
                checked={showCountrySummary}
                onChange={(e) => setShowCountrySummary(e.target.checked)}
                className="accent-[#0F1E36]"
              />
              <span>Country-Level Summaries ({countryAggregates.length.toLocaleString()} countries)</span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer text-[#1C1F26]">
              <input
                type="checkbox"
                checked={showNewsLayer}
                onChange={(e) => setShowNewsLayer(e.target.checked)}
                className="accent-[#9E2A2B]"
              />
              <span>News-Derived Leads Layer ({newsLeads.length.toLocaleString()} clusters)</span>
            </label>
          </div>

          {(yearFrom || yearTo || selectedCategory !== 'all' || selectedDataset !== 'all' || verificationFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setYearFrom('');
                setYearTo('');
                setSelectedCategory('all');
                setSelectedDataset('all');
                setVerificationFilter('all');
                setCountrySearch('');
              }}
              className="text-xs text-[#9E2A2B] hover:underline cursor-pointer"
            >
              Reset All Map Filters
            </button>
          )}
        </div>
      </div>

      {newsStatus.error && showNewsLayer && (
        <div className="bg-[#FDF2F2] border border-[#9E2A2B]/40 p-3.5 flex items-center gap-2.5 text-xs text-[#7D2021]">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            GDELT News Layer Notice: {newsStatus.error} (Last retrieval:{' '}
            {newsStatus.lastSuccessfulRetrieval
              ? newsStatus.lastSuccessfulRetrieval.slice(0, 16).replace('T', ' ')
              : 'None'}
            )
          </span>
        </div>
      )}

      {/* Split Full-Width Map + Country Side Research Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-3">
          {eventsLoading ? (
            <div className="h-[600px] bg-white border border-[#E4E2DC] flex items-center justify-center text-sm text-[#525866]">
              Loading local research storage...
            </div>
          ) : (
            <InteractiveWorldMap
              coordinateEvents={coordinateEvents}
              countryAggregates={countryAggregates}
              newsLeads={newsLeads}
              showHistoricalLayer={showHistoricalPoints}
              showCountrySummaryLayer={showCountrySummary}
              showNewsLeadLayer={showNewsLayer}
              selectedCountryId={selectedCountryId}
              heightClass="h-[600px]"
              onSelectEvent={(ev) => setInspectedEvent(ev)}
              onSelectCountry={(iso3) => setSelectedCountryId(iso3)}
            />
          )}

          {activeEvents.length === 0 && (
            <div className="bg-white border border-[#E4E2DC] p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs text-[#525866]">
                <strong className="text-[#0F1E36]">No historical datasets loaded yet:</strong>{' '}
                Import Harvard Mass Mobilization or NAVCO in Data Sources to populate historical
                country and event layers.
              </div>
              <button
                type="button"
                onClick={() => setActivePage('sources')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0F1E36] rounded cursor-pointer whitespace-nowrap"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Import Datasets</span>
              </button>
            </div>
          )}
        </div>

        {/* Map-Side Country Research Panel */}
        <aside className="lg:col-span-4 bg-white border border-[#E4E2DC] p-5 space-y-5 max-h-[680px] overflow-y-auto">
          <div className="border-b border-[#E4E2DC] pb-4">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs text-[#525866]">Selected Country Dossier</span>
              <select
                value={selectedCountryId}
                onChange={(e) => setSelectedCountryId(e.target.value)}
                className="border border-[#CFCBC2] bg-[#F8F7F4] px-2 py-1 text-xs text-[#0F1E36] max-w-[180px]"
              >
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.countryName} ({c.id})
                  </option>
                ))}
              </select>
            </div>

            <h2 className="text-xl font-semibold text-[#0F1E36]">
              {selectedCountryMeta?.countryName || selectedCountryId}
            </h2>
            <div className="text-xs text-[#525866] mt-0.5">
              {selectedCountryMeta?.region || 'Global Directory'} ·{' '}
              <button
                type="button"
                onClick={() => navigateToCountryProfile(selectedCountryId)}
                className="inline-flex items-center gap-1 text-[#9E2A2B] hover:underline font-medium cursor-pointer"
              >
                <span>Open Full Country Profile</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Country Summary Counts */}
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="bg-[#F8F7F4] border border-[#E4E2DC] p-2.5">
              <div className="text-[11px] text-[#525866]">Historical</div>
              <div className="text-base font-mono font-semibold text-[#0F1E36] tabular-nums mt-0.5">
                {selectedCountryEvents.length.toLocaleString()}
              </div>
            </div>
            <div className="bg-[#F8F7F4] border border-[#E4E2DC] p-2.5">
              <div className="text-[11px] text-[#525866]">Movements</div>
              <div className="text-base font-mono font-semibold text-[#0F1E36] tabular-nums mt-0.5">
                {selectedCountryMovements.length.toLocaleString()}
              </div>
            </div>
            <div className="bg-[#F8F7F4] border border-[#E4E2DC] p-2.5">
              <div className="text-[11px] text-[#525866]">News Leads</div>
              <div className="text-base font-mono font-semibold text-[#9E2A2B] tabular-nums mt-0.5">
                {selectedCountryNews.length.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Historical Records List for Selected Country */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-[#0F1E36]">
              Historical Dataset Records ({selectedCountryEvents.length.toLocaleString()})
            </h3>
            {selectedCountryEvents.length > 0 ? (
              <div className="divide-y divide-[#E4E2DC] border border-[#E4E2DC]">
                {selectedCountryEvents.slice(0, 18).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setInspectedEvent(ev)}
                    className="w-full text-left p-3 hover:bg-[#F8F7F4] transition-colors cursor-pointer"
                  >
                    <div className="text-[11px] text-[#525866] flex flex-wrap items-center gap-x-1.5">
                      <span className="font-mono tabular-nums">
                        {ev.eventDate || ev.startYear || 'Undated'}
                      </span>
                      <span>·</span>
                      <span>{ev.eventType}</span>
                    </div>
                    <div className="text-xs font-semibold text-[#0F1E36] mt-0.5 line-clamp-2">
                      {ev.eventName}
                    </div>
                    <div className="text-[11px] text-[#767D8C] mt-0.5">
                      {ev.datasetName} ·{' '}
                      {ev.locationPrecision === 'coordinates'
                        ? 'Exact coordinates'
                        : ev.locationName
                          ? `Locality text: ${ev.locationName}`
                          : 'Country-level attribution'}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#525866] bg-[#F8F7F4] border border-[#E4E2DC] p-3">
                No historical dataset observations match the current filters for this country.
              </p>
            )}
          </div>

          {/* News Leads for Selected Country */}
          <div className="space-y-2.5 pt-2 border-t border-[#E4E2DC]">
            <h3 className="text-xs font-semibold text-[#9E2A2B]">
              News-Derived Leads ({selectedCountryNews.length})
            </h3>
            {selectedCountryNews.length > 0 ? (
              <div className="divide-y divide-[#E4E2DC] border border-[#E4E2DC]">
                {selectedCountryNews.slice(0, 8).map((lead) => (
                  <div key={lead.id} className="p-3 space-y-1">
                    <div className="text-[11px] text-[#525866]">
                      {lead.publisher} ·{' '}
                      <span className="font-mono tabular-nums">
                        {lead.publicationDate.slice(0, 10)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInspectedNewsLead(lead)}
                      className="text-left text-xs font-medium text-[#1C1F26] hover:text-[#9E2A2B] cursor-pointer"
                    >
                      {lead.title}
                    </button>
                    <div>
                      <a
                        href={lead.articleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-[#0F1E36] underline"
                      >
                        <span>Original article</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[#525866]">
                No retrieved GDELT news leads currently indexed to this country.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
