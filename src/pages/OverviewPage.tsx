import React, { useMemo, useState } from 'react';
import {
  ExternalLink,
  RefreshCw,
  ArrowRight,
  Database,
  AlertCircle,
  Search,
} from 'lucide-react';
import { useResearch } from '../context/ResearchContext';
import { InteractiveWorldMap, CountryMapAggregate } from '../components/InteractiveWorldMap';
import { ResearchChart } from '../components/ResearchChart';
import { EventClassification } from '../types/research';
import { GDELT_TOPIC_PRESETS } from '../data/worldBankCatalog';

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

export const OverviewPage: React.FC = () => {
  const {
    activeEvents,
    datasets,
    movements,
    newsLeads,
    newsStatus,
    worldBankLastRetrieval,
    fetchNewsLeads,
    setActivePage,
    setInspectedEvent,
    setInspectedNewsLead,
    navigateToCountryProfile,
  } = useResearch();

  // Map & Overview filters
  const [filterDataset, setFilterDataset] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterCountry, setFilterCountry] = useState<string>('all');
  const [yearFrom, setYearFrom] = useState<string>('');
  const [yearTo, setYearTo] = useState<string>('');

  // Chart dataset scope (never mix Mass Mobilization event rows with NAVCO campaign counts without explicit label)
  const [chartDatasetScope, setChartDatasetScope] = useState<string>('auto');

  // News discovery controls
  const [selectedTopicId, setSelectedTopicId] = useState<string>('general_protest');
  const [newsCountryKeyword, setNewsCountryKeyword] = useState<string>('');
  const [newsTimespan, setNewsTimespan] = useState<string>('7d');

  // Filtered historical events
  const filteredEvents = useMemo(() => {
    const minY = yearFrom ? Number(yearFrom) : null;
    const maxY = yearTo ? Number(yearTo) : null;

    return activeEvents.filter((ev) => {
      if (filterDataset !== 'all' && ev.datasetId !== filterDataset) return false;
      if (filterCategory !== 'all' && ev.eventType !== filterCategory) return false;
      if (filterCountry !== 'all' && ev.countryId !== filterCountry) return false;
      if (minY !== null && (ev.startYear === null || ev.startYear < minY)) return false;
      if (maxY !== null && (ev.startYear === null || ev.startYear > maxY)) return false;
      return true;
    });
  }, [activeEvents, filterDataset, filterCategory, filterCountry, yearFrom, yearTo]);

  // Coordinate vs Country-Level Map data
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
    return Array.from(map.values());
  }, [filteredEvents]);

  // Distinct countries in loaded historical datasets
  const representedCountries = useMemo(() => {
    const map = new Map<string, string>();
    for (const ev of activeEvents) {
      if (ev.countryId && ev.countryId !== 'UNK') {
        map.set(ev.countryId, ev.countryName);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeEvents]);

  // Research Indicators (Section 6.B — strictly computed from actual loaded data)
  const indicators = useMemo(() => {
    let minYear: number | null = null;
    let maxYear: number | null = null;
    for (const ev of activeEvents) {
      if (ev.startYear !== null) {
        if (minYear === null || ev.startYear < minYear) minYear = ev.startYear;
      }
      const endY = ev.endYear ?? ev.startYear;
      if (endY !== null) {
        if (maxYear === null || endY > maxYear) maxYear = endY;
      }
    }

    const timestamps = [
      newsStatus.lastSuccessfulRetrieval,
      worldBankLastRetrieval,
      ...datasets.map((d) => d.lastSuccessfulRetrieval),
    ].filter(Boolean) as string[];
    timestamps.sort((a, b) => b.localeCompare(a));

    const awaitingVerificationCount =
      activeEvents.filter((e) => e.verificationStatus === 'unverified').length +
      newsLeads.filter((n) => n.verificationStatus === 'unverified').length +
      movements.filter((m) => m.verificationStatus === 'unverified').length;

    return {
      historicalCount: activeEvents.length,
      newsLeadCount: newsLeads.length,
      countriesRepresentedCount: representedCountries.length,
      historicalPeriod:
        minYear !== null && maxYear !== null ? `${minYear}–${maxYear}` : 'No dataset imported',
      mostRecentRetrieval: timestamps[0]
        ? `${timestamps[0].slice(0, 16).replace('T', ' ')} UTC`
        : 'Pending',
      awaitingVerificationCount,
    };
  }, [
    activeEvents,
    newsLeads,
    movements,
    representedCountries.length,
    newsStatus.lastSuccessfulRetrieval,
    worldBankLastRetrieval,
    datasets,
  ]);

  // Select single coherent dataset for trend charts so different units of observation aren't conflated
  const importedHistoricalDatasets = useMemo(
    () => datasets.filter((d) => !d.isFutureRegistryOnly && d.loadedRecordCount > 0 && (d.id === 'mass_mobilization' || d.id === 'navco' || d.id.startsWith('custom_'))),
    [datasets]
  );

  const effectiveChartDatasetId = useMemo(() => {
    if (chartDatasetScope !== 'auto') return chartDatasetScope;
    if (importedHistoricalDatasets.some((d) => d.id === 'mass_mobilization'))
      return 'mass_mobilization';
    if (importedHistoricalDatasets.some((d) => d.id === 'navco')) return 'navco';
    return importedHistoricalDatasets[0]?.id || 'none';
  }, [chartDatasetScope, importedHistoricalDatasets]);

  const chartEvents = useMemo(
    () => activeEvents.filter((e) => e.datasetId === effectiveChartDatasetId),
    [activeEvents, effectiveChartDatasetId]
  );

  const activeChartDatasetMeta = datasets.find((d) => d.id === effectiveChartDatasetId);

  // Chart 1: Annual records
  const annualTrendOption = useMemo(() => {
    if (chartEvents.length === 0) return null;
    const counts = new Map<number, number>();
    for (const ev of chartEvents) {
      if (ev.startYear !== null) {
        counts.set(ev.startYear, (counts.get(ev.startYear) || 0) + 1);
      }
    }
    const years = Array.from(counts.keys()).sort((a, b) => a - b);
    if (years.length === 0) return null;

    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 48, right: 20, top: 20, bottom: 36 },
      xAxis: {
        type: 'category',
        data: years.map(String),
        axisLine: { lineStyle: { color: '#CFCBC2' } },
        axisLabel: { color: '#525866', fontSize: 11, fontFamily: 'IBM Plex Mono' },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#E4E2DC' } },
        axisLabel: { color: '#525866', fontSize: 11, fontFamily: 'IBM Plex Mono' },
      },
      series: [
        {
          name:
            effectiveChartDatasetId === 'navco' ? 'Initiated Campaigns' : 'Recorded Protest Events',
          type: 'bar',
          data: years.map((y) => counts.get(y) || 0),
          itemStyle: { color: '#0F1E36' },
          barMaxWidth: 22,
        },
      ],
    };
  }, [chartEvents, effectiveChartDatasetId]);

  // Chart 2: Mobilisation Category Distribution
  const categoryChartOption = useMemo(() => {
    if (chartEvents.length === 0) return null;
    const counts = new Map<string, number>();
    for (const ev of chartEvents) {
      counts.set(ev.eventType, (counts.get(ev.eventType) || 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => a[1] - b[1]);

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 190, right: 28, top: 12, bottom: 28 },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#E4E2DC' } },
        axisLabel: { color: '#525866', fontSize: 11, fontFamily: 'IBM Plex Mono' },
      },
      yAxis: {
        type: 'category',
        data: sorted.map(([k]) => k),
        axisLine: { lineStyle: { color: '#CFCBC2' } },
        axisLabel: { color: '#1C1F26', fontSize: 11 },
      },
      series: [
        {
          type: 'bar',
          data: sorted.map(([, v]) => v),
          itemStyle: { color: '#2B5B6C' },
          barMaxWidth: 18,
        },
      ],
    };
  }, [chartEvents]);

  // Chart 3: Top Countries Comparison
  const topCountriesOption = useMemo(() => {
    if (chartEvents.length === 0) return null;
    const counts = new Map<string, number>();
    for (const ev of chartEvents) {
      counts.set(ev.countryName, (counts.get(ev.countryName) || 0) + 1);
    }
    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .reverse();

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 145, right: 24, top: 12, bottom: 28 },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#E4E2DC' } },
        axisLabel: { color: '#525866', fontSize: 11, fontFamily: 'IBM Plex Mono' },
      },
      yAxis: {
        type: 'category',
        data: top.map(([k]) => k),
        axisLine: { lineStyle: { color: '#CFCBC2' } },
        axisLabel: { color: '#1C1F26', fontSize: 11 },
      },
      series: [
        {
          type: 'bar',
          data: top.map(([, v]) => v),
          itemStyle: { color: '#0F1E36' },
          barMaxWidth: 16,
        },
      ],
    };
  }, [chartEvents]);

  // Chart 4: Documented Issue / Demand Categories or Regional Distribution
  const demandOrRegionOption = useMemo(() => {
    if (chartEvents.length === 0) return null;
    const counts = new Map<string, number>();
    for (const ev of chartEvents) {
      for (const d of ev.demands) {
        const label = d.trim();
        if (label) counts.set(label, (counts.get(label) || 0) + 1);
      }
    }
    if (counts.size === 0) {
      for (const ev of chartEvents) {
        if (ev.region && ev.region !== 'Unspecified Region') {
          counts.set(ev.region, (counts.get(ev.region) || 0) + 1);
        }
      }
    }
    if (counts.size === 0) return null;

    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .reverse();

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 185, right: 24, top: 12, bottom: 28 },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#E4E2DC' } },
        axisLabel: { color: '#525866', fontSize: 11, fontFamily: 'IBM Plex Mono' },
      },
      yAxis: {
        type: 'category',
        data: top.map(([k]) => (k.length > 28 ? `${k.slice(0, 26)}…` : k)),
        axisLine: { lineStyle: { color: '#CFCBC2' } },
        axisLabel: { color: '#1C1F26', fontSize: 11 },
      },
      series: [
        {
          type: 'bar',
          data: top.map(([, v]) => v),
          itemStyle: { color: '#9E2A2B' },
          barMaxWidth: 16,
        },
      ],
    };
  }, [chartEvents]);

  const handleRunNewsSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const preset = GDELT_TOPIC_PRESETS.find((p) => p.id === selectedTopicId);
    fetchNewsLeads({
      query: preset?.query || GDELT_TOPIC_PRESETS[0].query,
      country: newsCountryKeyword.trim(),
      timespan: newsTimespan,
      maxrecords: 50,
    });
  };

  return (
    <div className="space-y-12">
      {/* Observatory Editorial Header */}
      <section className="border-b border-[#E4E2DC] pb-8">
        <div className="text-xs font-medium text-[#9E2A2B] tracking-wide mb-2">
          Global Protest &amp; Youth Movement Observatory
        </div>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-3xl">
            <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold text-[#0F1E36] leading-[1.15]">
              Understand the movements shaping our world.
            </h1>
            <p className="mt-4 text-base text-[#525866] leading-relaxed">
              An independent, source-transparent research observatory examining protest events,
              civil resistance campaigns, student and labour mobilisation, human consequences, and
              national macroeconomic context across every world region.
            </p>
          </div>

          {activeEvents.length === 0 && (
            <div className="bg-white border border-[#CFCBC2] p-4 max-w-sm shrink-0">
              <div className="text-xs font-semibold text-[#0F1E36]">
                Load Historical Research Datasets
              </div>
              <p className="text-xs text-[#525866] mt-1 leading-relaxed">
                No historical CSV datasets are loaded in IndexedDB yet. Upload or inspect Harvard
                Mass Mobilization (1990–2020) and NAVCO (1900–2021) in Data Sources.
              </p>
              <button
                type="button"
                onClick={() => setActivePage('sources')}
                className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#0F1E36] hover:bg-[#1E3252] rounded transition-colors cursor-pointer whitespace-nowrap"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Open Dataset Import Studio</span>
              </button>
            </div>
          )}
        </div>

        {/* B. Research Indicators Strip (Computed Strictly from Loaded Data) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mt-8 pt-6 border-t border-[#E4E2DC]">
          <div>
            <div className="text-xs text-[#525866]">Historical Records Loaded</div>
            <div className="mt-1 text-2xl font-mono font-semibold text-[#0F1E36] tabular-nums">
              {indicators.historicalCount.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#767D8C] mt-0.5">Active dataset observations</div>
          </div>

          <div>
            <div className="text-xs text-[#525866]">News Leads Retrieved</div>
            <div className="mt-1 text-2xl font-mono font-semibold text-[#0F1E36] tabular-nums">
              {indicators.newsLeadCount.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#767D8C] mt-0.5">Deduplicated GDELT clusters</div>
          </div>

          <div>
            <div className="text-xs text-[#525866]">Countries Represented</div>
            <div className="mt-1 text-2xl font-mono font-semibold text-[#0F1E36] tabular-nums">
              {indicators.countriesRepresentedCount.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#767D8C] mt-0.5">In loaded historical records</div>
          </div>

          <div>
            <div className="text-xs text-[#525866]">Historical Period Covered</div>
            <div className="mt-1 text-xl font-mono font-semibold text-[#0F1E36] tabular-nums">
              {indicators.historicalPeriod}
            </div>
            <div className="text-[11px] text-[#767D8C] mt-0.5">Observed dataset range</div>
          </div>

          <div>
            <div className="text-xs text-[#525866]">Awaiting Verification</div>
            <div className="mt-1 text-2xl font-mono font-semibold text-[#9E2A2B] tabular-nums">
              {indicators.awaitingVerificationCount.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#767D8C] mt-0.5">Unreviewed records &amp; leads</div>
          </div>

          <div>
            <div className="text-xs text-[#525866]">Latest Data Retrieval</div>
            <div className="mt-1 text-sm font-mono font-semibold text-[#0F1E36] tabular-nums leading-snug">
              {indicators.mostRecentRetrieval}
            </div>
            <div className="text-[11px] text-[#767D8C] mt-0.5">Verified API / import timestamp</div>
          </div>
        </div>
      </section>

      {/* A. Global Map Section */}
      <section className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="text-xs text-[#525866]">01 · Geographic Intelligence Overview</div>
            <h2 className="text-2xl font-semibold text-[#0F1E36] mt-0.5">
              Global Mobilisation &amp; Media Lead Geography
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setActivePage('map')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F1E36] hover:text-[#9E2A2B] underline cursor-pointer self-start lg:self-auto whitespace-nowrap"
          >
            <span>Open Full-Screen Interactive Map &amp; Country Side-Panel</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Map Filter Bar */}
        <div className="bg-white border border-[#E4E2DC] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-[#525866] mb-1">Data Source</label>
            <select
              value={filterDataset}
              onChange={(e) => setFilterDataset(e.target.value)}
              className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs text-[#1C1F26]"
            >
              <option value="all">All Imported Historical Datasets</option>
              {importedHistoricalDatasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.datasetName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#525866] mb-1">Country</label>
            <select
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs text-[#1C1F26]"
            >
              <option value="all">All Countries ({representedCountries.length})</option>
              {representedCountries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#525866] mb-1">
              Mobilisation Category
            </label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs text-[#1C1F26]"
            >
              <option value="all">All Categories</option>
              {EVENT_CLASSIFICATIONS.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#525866] mb-1">From Year</label>
            <input
              type="number"
              placeholder="e.g. 1990"
              value={yearFrom}
              onChange={(e) => setYearFrom(e.target.value)}
              className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#525866] mb-1">To Year</label>
            <input
              type="number"
              placeholder="e.g. 2020"
              value={yearTo}
              onChange={(e) => setYearTo(e.target.value)}
              className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums"
            />
          </div>
        </div>

        <InteractiveWorldMap
          coordinateEvents={coordinateEvents}
          countryAggregates={countryAggregates}
          newsLeads={newsLeads}
          showHistoricalLayer={true}
          showCountrySummaryLayer={true}
          showNewsLeadLayer={true}
          heightClass="h-[440px]"
          onSelectEvent={(ev) => setInspectedEvent(ev)}
          onSelectCountry={(iso3) => navigateToCountryProfile(iso3)}
        />
      </section>

      {/* C. Global Trends (Strictly Separated by Dataset) */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-[#E4E2DC] pb-4">
          <div>
            <div className="text-xs text-[#525866]">
              02 · Empirical Historical Distributions (News Article Counts Never Mixed)
            </div>
            <h2 className="text-2xl font-semibold text-[#0F1E36] mt-0.5">
              Global Historical Mobilisation Trends
            </h2>
          </div>

          {importedHistoricalDatasets.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#525866]">Active Dataset Series:</span>
              <div className="flex items-center gap-1 p-1 bg-[#F1EFEA] rounded">
                {importedHistoricalDatasets.map((d) => {
                  const active = effectiveChartDatasetId === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setChartDatasetScope(d.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-white text-[#0F1E36] shadow-xs'
                          : 'text-[#525866] hover:text-[#0F1E36]'
                      }`}
                    >
                      {d.id === 'mass_mobilization'
                        ? 'Mass Mobilization (1990–2020)'
                        : d.id === 'navco'
                          ? 'NAVCO Campaigns (1900–2021)'
                          : d.datasetName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ResearchChart
            title="Annual Recorded Historical Observations"
            datasetAttribution={
              activeChartDatasetMeta?.datasetName || 'No Historical Dataset Loaded'
            }
            unitExplanation={
              effectiveChartDatasetId === 'navco'
                ? 'Count of resistance campaigns by start year (BYEAR)'
                : 'Count of active anti-government protest events (protest = 1) per year'
            }
            option={annualTrendOption}
            onEmptyAction={() => setActivePage('sources')}
            emptyActionLabel="Import Dataset in Data Sources"
            footnote={
              effectiveChartDatasetId === 'mass_mobilization'
                ? 'Source: Clark & Regan, Harvard Dataverse (doi:10.7910/DVN/HTTWYL). Coverage terminates in March 2020; zero-protest baseline rows (protest = 0) are excluded.'
                : effectiveChartDatasetId === 'navco'
                  ? 'Source: NAVCO Data Project, Harvard Ash Center. Counts campaign initiations, not daily street demonstrations.'
                  : undefined
            }
          />

          <ResearchChart
            title="Distribution by Mobilisation &amp; Participant Category"
            datasetAttribution={
              activeChartDatasetMeta?.datasetName || 'No Historical Dataset Loaded'
            }
            unitExplanation="Count of observations classified strictly from source identity/method fields"
            option={categoryChartOption}
            onEmptyAction={() => setActivePage('sources')}
            emptyActionLabel="Import Dataset in Data Sources"
            footnote="Protests are classified as student-led or youth-led only when source participant-identity fields explicitly document student or youth participation."
          />

          <ResearchChart
            title="Most Frequently Represented Countries in Selected Dataset"
            datasetAttribution={
              activeChartDatasetMeta?.datasetName || 'No Historical Dataset Loaded'
            }
            unitExplanation="Top 12 countries by recorded historical observation count"
            option={topCountriesOption}
            onEmptyAction={() => setActivePage('sources')}
            emptyActionLabel="Import Dataset in Data Sources"
            footnote="Cross-national counts reflect reporting visibility and dataset coding thresholds as well as underlying mobilisation frequency."
          />

          <ResearchChart
            title="Documented Demands, Grievances &amp; Campaign Objectives"
            datasetAttribution={
              activeChartDatasetMeta?.datasetName || 'No Historical Dataset Loaded'
            }
            unitExplanation="Frequency of source-coded demands (a single event may state multiple demands)"
            option={demandOrRegionOption}
            onEmptyAction={() => setActivePage('sources')}
            emptyActionLabel="Import Dataset in Data Sources"
            footnote="Derived directly from source demand/goal columns without algorithmic inference."
          />
        </div>
      </section>

      {/* D. Latest News-Derived Leads (GDELT DOC 2.0) */}
      <section className="space-y-5">
        <div className="border-b border-[#E4E2DC] pb-4 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-[#9E2A2B]">
              News-derived event leads — independently verify before treating as confirmed events.
            </div>
            <h2 className="text-2xl font-semibold text-[#0F1E36] mt-1">
              Recent Global Media Discovery Feed (GDELT DOC 2.0)
            </h2>
          </div>

          <div className="text-xs text-[#525866] font-mono tabular-nums">
            {newsStatus.lastSuccessfulRetrieval
              ? `Last retrieved: ${newsStatus.lastSuccessfulRetrieval.slice(0, 19).replace('T', ' ')} UTC`
              : 'No completed GDELT query in current session'}
          </div>
        </div>

        {/* GDELT Search Bar */}
        <form
          onSubmit={handleRunNewsSearch}
          className="bg-white border border-[#E4E2DC] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end"
        >
          <div className="lg:col-span-5">
            <label className="block text-[11px] font-medium text-[#525866] mb-1">
              Mobilisation Search Topic
            </label>
            <select
              value={selectedTopicId}
              onChange={(e) => setSelectedTopicId(e.target.value)}
              className="w-full border border-[#CFCBC2] bg-white px-3 py-2 text-xs text-[#1C1F26]"
            >
              {GDELT_TOPIC_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label} — {preset.query}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-3">
            <label className="block text-[11px] font-medium text-[#525866] mb-1">
              Country Keyword Filter (Optional)
            </label>
            <input
              type="text"
              value={newsCountryKeyword}
              onChange={(e) => setNewsCountryKeyword(e.target.value)}
              placeholder="e.g. Kenya, Chile, France, Bangladesh"
              className="w-full border border-[#CFCBC2] bg-white px-3 py-2 text-xs text-[#1C1F26]"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[11px] font-medium text-[#525866] mb-1">
              Timespan (Max 3 Months)
            </label>
            <select
              value={newsTimespan}
              onChange={(e) => setNewsTimespan(e.target.value)}
              className="w-full border border-[#CFCBC2] bg-white px-3 py-2 text-xs text-[#1C1F26]"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="3d">Last 3 Days</option>
              <option value="7d">Last 7 Days</option>
              <option value="1m">Last 1 Month</option>
              <option value="3m">Last 3 Months (GDELT Max)</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={newsStatus.loading}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#0F1E36] hover:bg-[#1E3252] rounded transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {newsStatus.loading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              <span>{newsStatus.loading ? 'Querying...' : 'Search GDELT'}</span>
            </button>
          </div>
        </form>

        {/* Upstream Error / Rate Limit Notice */}
        {newsStatus.error && (
          <div className="bg-[#FDF2F2] border border-[#9E2A2B]/40 p-4 flex items-start gap-3 text-xs text-[#7D2021]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div>
                <strong>GDELT DOC 2.0 API Notice:</strong> {newsStatus.error}
              </div>
              <div className="text-[#525866]">
                Last successful retrieval:{' '}
                {newsStatus.lastSuccessfulRetrieval
                  ? `${newsStatus.lastSuccessfulRetrieval.slice(0, 19).replace('T', ' ')} UTC`
                  : 'None recorded yet'}
                . Showing {newsLeads.length > 0 ? 'cached session leads below' : '"Data unavailable"'}.
              </div>
            </div>
          </div>
        )}

        {/* News Leads Table / List */}
        {newsLeads.length > 0 ? (
          <div className="bg-white border border-[#E4E2DC] divide-y divide-[#E4E2DC]">
            {newsLeads.slice(0, 15).map((lead) => (
              <article
                key={lead.id}
                className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:bg-[#F8F7F4] transition-colors"
              >
                <div className="space-y-1.5 max-w-3xl">
                  <div className="text-xs text-[#525866] flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-[#9E2A2B]">{lead.recordType}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-medium text-[#0F1E36]">
                      {lead.country || 'Location unspecified'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{lead.publisher}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {lead.publicationDate.slice(0, 16).replace('T', ' ')} UTC
                    </span>
                    {lead.duplicateCount > 1 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{lead.duplicateCount} grouped articles</span>
                      </>
                    )}
                  </div>

                  <h3 className="text-base font-semibold text-[#1C1F26] leading-snug">
                    {lead.title}
                  </h3>

                  <div className="text-xs text-[#525866]">
                    Verification status:{' '}
                    <strong className="capitalize text-[#0F1E36]">{lead.verificationStatus}</strong>
                    {lead.reviewerNotes && <span> — {lead.reviewerNotes}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setInspectedNewsLead(lead)}
                    className="px-3 py-1.5 text-xs font-medium text-[#0F1E36] bg-[#F1EFEA] hover:bg-[#E4E2DC] rounded transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Verify / Inspect ({lead.corroboratingArticles.length})
                  </button>
                  <a
                    href={lead.articleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#0F1E36] hover:text-[#9E2A2B] underline whitespace-nowrap"
                  >
                    <span>Source</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-[#E4E2DC] p-8 text-center">
            <p className="text-sm font-medium text-[#0F1E36]">Data unavailable</p>
            <p className="text-xs text-[#525866] mt-1 max-w-lg mx-auto leading-relaxed">
              {newsStatus.loading
                ? 'Retrieving recent news-derived leads from GDELT DOC 2.0 API...'
                : 'No GDELT news-derived leads are currently loaded for this query, or GDELT rate limiting (1 request per 5 seconds) delayed upstream retrieval. Use "Search GDELT" above after 5 seconds to retry.'}
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
